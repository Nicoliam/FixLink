/**
 * Fixlynk Step 14 — provider service-area service.
 *
 * Two responsibilities and nothing else: resolve which provider profiles the
 * caller may act for, and read or replace their areas.
 *
 * Every authorization decision is made from the session user id. There is no
 * provider id in the path or the body for this endpoint, which is the whole
 * reason it cannot be used to edit somebody else's coverage.
 */
import type { MarketplaceStore } from '../marketplace/marketplace.store';
import type { ProviderAreaTag } from '../marketplace/marketplace.types';
import type { UserRepository } from '../users/user.repository';
import type {
  AreaOwnerResolver,
  ProviderAreaDto,
  ProviderAreaOwner,
} from './provider-areas.types';
import { validateProviderAreas } from './provider-areas.validation';

export interface ServiceResult<T> {
  status: number;
  code?: string;
  message?: string;
  data?: T;
}

function fail<T>(status: number, code: string, message: string): ServiceResult<T> {
  return { status, code, message };
}

const PROVIDER_ROLES = ['PROFESSIONAL', 'BUSINESS_OWNER', 'BUSINESS_MANAGER'];

export class ProviderAreasService {
  constructor(
    private readonly marketplace: MarketplaceStore,
    private readonly owners: AreaOwnerResolver,
    private readonly users: UserRepository,
  ) {}

  /**
   * The provider profiles this user may publish areas for, professional first.
   *
   * A role check comes first so a customer or technician gets `403` regardless
   * of whether they happen to have a dangling profile row — and, more
   * importantly, so the answer does not depend on that.
   *
   * An empty list is a legitimate result for a provider-role user who has never
   * been onboarded: they have no profile to write areas against. Reads answer
   * `200 { items: [] }`; writes answer `404`, because there is nothing to
   * write to and inventing one here would bypass the onboarding path.
   */
  private async resolveOwners(authUserId: string): Promise<{ owners: ProviderAreaOwner[] } | { forbidden: string } | { none: true }> {
    const roles = await this.users.getRoles(authUserId);
    if (!roles.some((role) => PROVIDER_ROLES.includes(role))) {
      if (roles.includes('CUSTOMER')) return { forbidden: 'Only service providers can manage service areas.' };
      if (roles.includes('TECHNICIAN')) return { forbidden: 'Technicians cannot manage service areas.' };
      return { forbidden: 'Your account cannot manage service areas.' };
    }
    const owners: ProviderAreaOwner[] = [];
    if (roles.includes('PROFESSIONAL')) {
      const professional = await this.owners.findProfessionalProfileByUserId(authUserId);
      if (professional) owners.push({ ownerType: 'professional', ownerId: professional.id });
    }
    if (roles.includes('BUSINESS_OWNER') || roles.includes('BUSINESS_MANAGER')) {
      const businesses = await this.owners.findBusinessIdsForUser(authUserId);
      for (const entry of businesses) owners.push({ ownerType: 'business', ownerId: entry.businessId });
    }
    if (owners.length === 0) return { none: true };
    return { owners };
  }

  async list(authUserId: string): Promise<ServiceResult<{ items: ProviderAreaDto[] }>> {
    const resolved = await this.resolveOwners(authUserId);
    if ('forbidden' in resolved) return fail(403, 'FORBIDDEN_ROLE', resolved.forbidden);
    if ('none' in resolved) return { status: 200, data: { items: [] } };
    const items: ProviderAreaDto[] = [];
    for (const owner of resolved.owners) {
      const profile = await this.marketplace.getProviderMatchProfile(this.toRef(owner));
      items.push(...profile.serviceAreas);
    }
    return { status: 200, data: { items } };
  }

  /**
   * Replace the caller's whole area list.
   *
   * When the user acts for several profiles (a professional who also owns a
   * business) the SAME validated list is written to every one of them, because
   * the request carries no per-owner grouping and inventing one would let a
   * client set a different coverage per profile. In practice this is a single
   * profile, and the rule is stated here so it is not a surprise later.
   */
  async replace(authUserId: string, body: unknown): Promise<ServiceResult<{ items: ProviderAreaDto[] }>> {
    const resolved = await this.resolveOwners(authUserId);
    if ('forbidden' in resolved) return fail(403, 'FORBIDDEN_ROLE', resolved.forbidden);
    if ('none' in resolved) return fail(404, 'NOT_FOUND', 'No provider profile found for your account.');
    const { areas, error } = validateProviderAreas(body);
    if (!areas || error) {
      const failure = error ?? { status: 422, code: 'VALIDATION_ERROR', message: 'Invalid service areas.' };
      return fail(failure.status, failure.code, failure.message);
    }
    for (const owner of resolved.owners) {
      await this.marketplace.replaceServiceAreas(this.toRef(owner), areas);
    }
    return { status: 200, data: { items: this.project(resolved.owners, areas) } };
  }

  private toRef(owner: ProviderAreaOwner): { providerType: 'professional' | 'business'; numericId: string } {
    return { providerType: owner.ownerType, numericId: owner.ownerId };
  }

  /** The rows a replace just wrote, in the order the caller will read them back. */
  private project(owners: ProviderAreaOwner[], areas: ProviderAreaTag[]): ProviderAreaDto[] {
    const out: ProviderAreaDto[] = [];
    for (const owner of owners) {
      for (const area of areas) out.push({ ...area });
    }
    return out;
  }
}