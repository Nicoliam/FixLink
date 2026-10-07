/**
 * Fixlynk — provider service offering service.
 *
 * Lets a provider describe their own services with an indicative price,
 * without administrator approval.
 *
 * Two rules drive everything here:
 *
 * 1. Ownership is derived from the session, never from the request. The
 *    caller's professional profile (`professional_profiles.user_id`) and the
 *    businesses they own or manage (`business_profiles.owner_user_id`,
 *    `business_members`) are resolved server-side, so a client cannot name a
 *    provider it does not own. Technicians are never marketplace providers.
 *
 * 2. Existence is authorization. An offering that belongs to someone else
 *    reads as 404, exactly like an absent one, so offering ids cannot be
 *    probed across providers.
 *
 * price_amount is an INDICATIVE starting price. The MVP does not process
 * payments (AGENTS.md section 12): payment is arranged directly between the
 * customer and the provider, and the platform records the agreed quote.
 */
import type { UserRepository } from '../users/user.repository';
import { OfferingsStoreError, type ServiceOfferingsStore } from './offerings.store';
import type {
  BusinessIdentity,
  OfferingOwner,
  OfferingProviderType,
  ServiceOfferingDto,
} from './offerings.types';
import { validateOffering, validateOfferingId } from './offerings.validation';

export interface OfferingServiceResult<T> {
  status: number;
  code?: string;
  message?: string;
  data?: T;
}

/** Matches the { items, total } list envelope used by the other list endpoints. */
export interface OfferingListDto {
  items: ServiceOfferingDto[];
  total: number;
  /**
   * Every provider identity the caller may act for, including ones that
   * currently have no offerings. The client needs this to know when a new
   * offering must name its owning provider: the ambiguity is exactly the case
   * where one identity has nothing listed yet, so deriving it from `items`
   * would hide it.
   */
  providers: OfferingOwner[];
}

function fail<T>(status: number, code: string, message: string): OfferingServiceResult<T> {
  return { status, code, message };
}

const PROVIDER_ROLES = ['PROFESSIONAL', 'BUSINESS_OWNER', 'BUSINESS_MANAGER'];

interface CallerIdentity {
  professionalId: string | null;
  businesses: BusinessIdentity[];
  /** Every owner the caller may act for; the authorization set. */
  owners: OfferingOwner[];
}

export class OfferingsService {
  constructor(
    private readonly store: ServiceOfferingsStore,
    private readonly users: UserRepository,
  ) {}

  async listOfferings(
    authUserId: string,
  ): Promise<OfferingServiceResult<OfferingListDto>> {
    const resolved = await this.resolveCaller(authUserId);
    if ('forbidden' in resolved) return fail(403, 'FORBIDDEN_ROLE', resolved.forbidden);
    if (resolved.identity.owners.length === 0) {
      return fail(404, 'NOT_FOUND', 'No provider profile found for your account.');
    }
    const items = await this.store.listOfferings(resolved.identity.owners);
    return { status: 200, data: { items, total: items.length, providers: resolved.identity.owners } };
  }

  async getOffering(
    authUserId: string,
    rawId: string,
  ): Promise<OfferingServiceResult<ServiceOfferingDto>> {
    const resolved = await this.resolveCaller(authUserId);
    if ('forbidden' in resolved) return fail(403, 'FORBIDDEN_ROLE', resolved.forbidden);
    const id = validateOfferingId(rawId);
    if (id.error) return fail(422, 'VALIDATION_ERROR', id.error ?? 'Invalid offering id.');
    const offering = await this.store.getOfferingById(id.value as string);
    if (!offering || !this.owns(resolved.identity.owners, offering)) {
      return fail(404, 'NOT_FOUND', 'Offering not found.');
    }
    return { status: 200, data: offering };
  }

  async createOffering(
    authUserId: string,
    body: unknown,
  ): Promise<OfferingServiceResult<ServiceOfferingDto>> {
    const resolved = await this.resolveCaller(authUserId);
    if ('forbidden' in resolved) return fail(403, 'FORBIDDEN_ROLE', resolved.forbidden);

    const parsed = validateOffering(body);
    if (parsed.error || !parsed.value) {
      return fail(422, 'VALIDATION_ERROR', parsed.error ?? 'Invalid offering.');
    }
    const input = parsed.value;

    const owner = this.resolveTargetOwner(resolved.identity, input.providerType);
    if ('error' in owner) {
      return fail(owner.error.status, owner.error.code ?? 'VALIDATION_ERROR', owner.error.message ?? 'Invalid provider.');
    }

    const category = await this.store.getActiveCategory(input.categoryId as string);
    if (!category) return fail(422, 'VALIDATION_ERROR', 'Choose an active service category.');

    try {
      const created = await this.store.createOffering(owner.owner, {
        categoryId: input.categoryId as string,
        name: input.name as string,
        description: input.description ?? null,
        // Undefined means "no price stated" — chosen during registration,
        // before login. Stored as NULL, never coerced to 0.
        priceAmount: (input.priceAmount as number | null | undefined) ?? null,
      });
      return { status: 201, data: created };
    } catch (error) {
      return this.storeError(error);
    }
  }

  async updateOffering(
    authUserId: string,
    rawId: string,
    body: unknown,
  ): Promise<OfferingServiceResult<ServiceOfferingDto>> {
    const resolved = await this.resolveCaller(authUserId);
    if ('forbidden' in resolved) return fail(403, 'FORBIDDEN_ROLE', resolved.forbidden);

    const id = validateOfferingId(rawId);
    if (id.error) return fail(422, 'VALIDATION_ERROR', id.error ?? 'Invalid offering id.');
    const parsed = validateOffering(body, true);
    if (parsed.error || !parsed.value) {
      return fail(422, 'VALIDATION_ERROR', parsed.error ?? 'Invalid offering.');
    }
    const input = parsed.value;

    const owned = await this.requireOwned(resolved.identity.owners, id.value as string);
    if ('error' in owned) {
      return fail(owned.error.status, owned.error.code ?? 'NOT_FOUND', owned.error.message ?? 'Offering not found.');
    }

    if (input.categoryId !== undefined) {
      const category = await this.store.getActiveCategory(input.categoryId);
      if (!category) return fail(422, 'VALIDATION_ERROR', 'Choose an active service category.');
    }

    try {
      // providerType selects the owner on create; an offering is never moved
      // between providers on update.
      const row = await this.store.updateOffering(owned.offering.id, {
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.priceAmount !== undefined ? { priceAmount: input.priceAmount } : {}),
      });
      if (!row) return fail(404, 'NOT_FOUND', 'Offering not found.');
      return { status: 200, data: row };
    } catch (error) {
      return this.storeError(error);
    }
  }

  /**
   * Remove an offering. Refused with 409 while a non-terminal job still
   * references it; otherwise a soft delete, never a hard delete, so closed
   * job history keeps resolving the service it was booked against.
   */
  async removeOffering(
    authUserId: string,
    rawId: string,
  ): Promise<OfferingServiceResult<ServiceOfferingDto>> {
    const resolved = await this.resolveCaller(authUserId);
    if ('forbidden' in resolved) return fail(403, 'FORBIDDEN_ROLE', resolved.forbidden);

    const id = validateOfferingId(rawId);
    if (id.error) return fail(422, 'VALIDATION_ERROR', id.error ?? 'Invalid offering id.');
    const owned = await this.requireOwned(resolved.identity.owners, id.value as string);
    if ('error' in owned) {
      return fail(owned.error.status, owned.error.code ?? 'NOT_FOUND', owned.error.message ?? 'Offering not found.');
    }

    if (owned.offering.isActive) {
      const openJobs = await this.store.countOpenJobsForOffering(owned.offering.id);
      if (openJobs > 0) {
        return fail(
          409,
          'CONFLICT',
          'This service is still attached to open work. Finish or cancel those jobs first.',
        );
      }
    }

    try {
      const row = await this.store.removeOffering(owned.offering.id);
      if (!row) return fail(404, 'NOT_FOUND', 'Offering not found.');
      return { status: 200, data: row };
    } catch (error) {
      return this.storeError(error);
    }
  }

  /** Load an offering the caller owns, or the 404 that hides a foreign one. */
  private async requireOwned(
    owners: OfferingOwner[],
    id: string,
  ): Promise<{ offering: ServiceOfferingDto } | { error: OfferingServiceResult<never> }> {
    const offering = await this.store.getOfferingById(id);
    if (!offering || !this.owns(owners, offering)) {
      return { error: fail(404, 'NOT_FOUND', 'Offering not found.') };
    }
    return { offering };
  }

  private owns(owners: OfferingOwner[], offering: ServiceOfferingDto): boolean {
    return owners.some(
      (owner) => owner.providerType === offering.providerType && owner.providerId === offering.providerId,
    );
  }

  /**
   * Pick the identity a new offering is created under. When the caller owns
   * exactly one identity it is chosen for them; when they own several they
   * must say which, rather than the backend silently guessing.
   */
  private resolveTargetOwner(
    identity: CallerIdentity,
    requested: OfferingProviderType | undefined,
  ): { owner: OfferingOwner } | { error: OfferingServiceResult<never> } {
    const owners: OfferingOwner[] = [];
    if (identity.professionalId) owners.push({ providerType: 'PROFESSIONAL', providerId: identity.professionalId });
    for (const business of identity.businesses) owners.push({ providerType: 'BUSINESS', providerId: business.businessId });

    if (owners.length === 0) {
      return { error: fail(404, 'NOT_FOUND', 'No provider profile found for your account.') };
    }
    if (requested === undefined) {
      if (owners.length === 1) return { owner: owners[0] };
      return {
        error: fail(
          422,
          'VALIDATION_ERROR',
          'Your account manages more than one provider. Say which one with providerType.',
        ),
      };
    }
    const match = owners.find((owner) => owner.providerType === requested);
    if (!match) {
      return { error: fail(403, 'FORBIDDEN_ROLE', 'You cannot manage services for that provider.') };
    }
    return { owner: match };
  }

  /**
   * Derive the caller's provider identities from the session, rejecting
   * roles that are never marketplace providers.
   */
  private async resolveCaller(
    authUserId: string,
  ): Promise<{ identity: CallerIdentity } | { forbidden: string }> {
    const roles = await this.users.getRoles(authUserId);
    if (!roles.some((role) => PROVIDER_ROLES.includes(role))) {
      if (roles.includes('TECHNICIAN')) {
        return { forbidden: 'Technicians cannot manage provider services.' };
      }
      if (roles.includes('CUSTOMER')) {
        return { forbidden: 'Only service providers can manage services.' };
      }
      if (roles.includes('ADMIN')) {
        return { forbidden: 'Administrator accounts cannot manage provider services.' };
      }
      return { forbidden: 'Your account cannot manage services.' };
    }
    const professional = await this.store.findProfessionalProfileByUserId(authUserId);
    const businesses = await this.store.findBusinessesForUser(authUserId);
    const owners: OfferingOwner[] = [];
    if (professional) owners.push({ providerType: 'PROFESSIONAL', providerId: professional.id });
    for (const business of businesses) {
      owners.push({ providerType: 'BUSINESS', providerId: business.businessId });
    }
    return { identity: { professionalId: professional?.id ?? null, businesses, owners } };
  }

  private storeError<T>(error: unknown): OfferingServiceResult<T> {
    if (!(error instanceof OfferingsStoreError)) throw error;
    if (error.code === 'NOT_FOUND') return fail(404, 'NOT_FOUND', error.message);
    if (error.code === 'CONFLICT') return fail(409, 'CONFLICT', error.message);
    return fail(500, 'INTERNAL_ERROR', 'Request failed. Please try again.');
  }
}