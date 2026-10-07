/**
 * Fixlynk — customer saved professional service.
 *
 * Lets a customer bookmark a professional so they can request a job later
 * without searching again.
 *
 * Three rules drive everything here:
 *
 * 1. Ownership is derived from the session. The caller's `customer_profiles`
 *    id is resolved server-side and is the only owner value that reaches the
 *    store, so a client cannot save a provider "for" somebody else, and one
 *    customer can never read or remove another customer's bookmarks.
 *
 * 2. A bookmark is not a capability. It grants no access to a provider's
 *    data: the saved list is hydrated through the same public marketplace
 *    projection the profile page uses, so verification badges and private
 *    verification documents follow exactly the same rules everywhere.
 *
 * 3. Only CUSTOMER accounts may bookmark. A provider has no customer journey
 *    here, and an administrator manages the platform rather than acting as a
 *    customer, so both are refused with a 403 that names the reason.
 */
import type { UserRepository } from '../users/user.repository';
import type { MarketplaceStore } from '../marketplace/marketplace.store';
import { parseProviderId } from '../marketplace/marketplace.store';
import type { ProviderCardDto, ProviderProfileDto } from '../marketplace/marketplace.types';
import { SavedProvidersStoreError, type SavedProvidersStore } from './saved-providers.store';
import type { SavedProviderRow, SavedProviderType } from './saved-providers.types';
import { validateProviderPathId, validateSaveProvider } from './saved-providers.validation';

export interface SavedProvidersResult<T> {
  status: number;
  code?: string;
  message?: string;
  data?: T;
}

/**
 * A saved provider, shaped exactly like a marketplace card so the same
 * card component renders both, plus the moment it was bookmarked.
 */
export interface SavedProviderDto extends ProviderCardDto {
  savedAt: string;
}

/** Matches the { items, total } list envelope used by the other list endpoints. */
export interface SavedProviderListDto {
  items: SavedProviderDto[];
  total: number;
}

/** Whether one specific provider is bookmarked, for the profile page toggle. */
export interface SavedProviderStateDto {
  providerId: string;
  saved: boolean;
}

/** Rebuild the public marketplace id (`professional-7`) from a stored row. */
function marketplaceId(row: SavedProviderRow): string | null {
  if (row.savedProfessionalId) return `professional-${row.savedProfessionalId}`;
  if (row.savedBusinessId) return `business-${row.savedBusinessId}`;
  return null;
}

export class SavedProvidersService {
  constructor(
    private readonly store: SavedProvidersStore,
    private readonly marketplace: MarketplaceStore,
    private readonly users: UserRepository,
  ) {}

  /** The customer's bookmarks, newest first, as marketplace cards. */
  async listSavedProviders(authUserId: string): Promise<SavedProvidersResult<SavedProviderListDto>> {
    const guard = await this.requireCustomer(authUserId);
    if ('forbidden' in guard) return guard.forbidden;

    const rows = await this.store.listSavedProviders(guard.customerId);
    const items: SavedProviderDto[] = [];
    for (const row of rows) {
      const providerId = marketplaceId(row);
      if (!providerId) continue;
      const profile = await this.marketplace.getProviderById(providerId);
      // A provider deactivated or deleted after being saved is omitted rather
      // than surfaced: it is no longer requestable, so offering it would
      // dead-end the customer at the request form.
      if (!profile) continue;
      items.push({ ...toCard(profile), savedAt: row.createdAt });
    }
    return { status: 200, data: { items, total: items.length } };
  }

  /** Whether one provider is bookmarked, so the profile can render its toggle. */
  async getSavedState(
    authUserId: string,
    rawProviderId: string,
  ): Promise<SavedProvidersResult<SavedProviderStateDto>> {
    const guard = await this.requireCustomer(authUserId);
    if ('forbidden' in guard) return guard.forbidden;

    const parsed = parseProviderId(rawProviderId);
    if (!parsed) return fail(400, 'VALIDATION_ERROR', 'Invalid provider id.');
    const saved = await this.store.isSaved(
      guard.customerId,
      parsed.providerType === 'business' ? 'BUSINESS' : 'PROFESSIONAL',
      parsed.numericId,
    );
    return { status: 200, data: { providerId: rawProviderId.trim(), saved } };
  }

  /** Bookmark a provider for the caller. */
  async saveProvider(authUserId: string, body: unknown): Promise<SavedProvidersResult<SavedProviderDto>> {
    const guard = await this.requireCustomer(authUserId);
    if ('forbidden' in guard) return guard.forbidden;

    const validated = validateSaveProvider(body);
    if (validated.error || validated.value === null) {
      return fail(422, 'VALIDATION_ERROR', validated.error ?? 'Invalid request.');
    }
    const providerType = validated.value;
    const parsed = parseProviderId(readProviderId(body));
    if (!parsed) return fail(422, 'VALIDATION_ERROR', 'providerId is invalid.');

    if (!(await this.store.isSaveableProvider(providerType, parsed.numericId))) {
      return fail(404, 'NOT_FOUND', 'That professional is not available.');
    }
    try {
      const row = await this.store.addSavedProvider(guard.customerId, providerType, parsed.numericId);
      const profile = await this.marketplace.getProviderById(marketplaceId(row) ?? '');
      if (!profile) return fail(404, 'NOT_FOUND', 'That professional is not available.');
      return { status: 201, data: { ...toCard(profile), savedAt: row.createdAt } };
    } catch (error) {
      return this.storeError(error);
    }
  }

  /** Remove one of the customer's own bookmarks. */
  async removeProvider(authUserId: string, rawProviderId: string): Promise<SavedProvidersResult<null>> {
    const guard = await this.requireCustomer(authUserId);
    if ('forbidden' in guard) return guard.forbidden;

    const validated = validateProviderPathId(rawProviderId);
    if (validated.error || validated.value === null) {
      return fail(400, 'VALIDATION_ERROR', validated.error ?? 'Invalid provider id.');
    }
    const parsed = parseProviderId(rawProviderId);
    if (!parsed) return fail(400, 'VALIDATION_ERROR', 'Invalid provider id.');

    const removed = await this.store.removeSavedProvider(
      guard.customerId,
      validated.value,
      parsed.numericId,
    );
    if (!removed) return fail(404, 'NOT_FOUND', 'That professional is not in your saved list.');
    return { status: 200, data: null };
  }

  /**
   * Confirm the caller is a customer and resolve their customer profile id.
   * A customer role without a profile cannot own bookmarks, so that reads as
   * 404 rather than an empty list.
   */
  private async requireCustomer(
    authUserId: string,
  ): Promise<{ customerId: string } | { forbidden: SavedProvidersResult<never> }> {
    const roles = await this.users.getRoles(authUserId);
    if (roles.includes('CUSTOMER')) {
      const customerId = await this.store.findCustomerProfileByUserId(authUserId);
      if (!customerId) {
        return {
          forbidden: fail(404, 'NOT_FOUND', 'No customer profile found for your account.'),
        };
      }
      return { customerId };
    }
    if (roles.includes('PROFESSIONAL') || roles.includes('BUSINESS_OWNER') || roles.includes('BUSINESS_MANAGER')) {
      return { forbidden: fail(403, 'FORBIDDEN_ROLE', 'Only customer accounts can save professionals.') };
    }
    if (roles.includes('TECHNICIAN')) {
      return { forbidden: fail(403, 'FORBIDDEN_ROLE', 'Technicians cannot save professionals.') };
    }
    if (roles.includes('ADMIN')) {
      return { forbidden: fail(403, 'FORBIDDEN_ROLE', 'Administrator accounts cannot save professionals.') };
    }
    return { forbidden: fail(403, 'FORBIDDEN_ROLE', 'Your account cannot save professionals.') };
  }

  private storeError(error: unknown): SavedProvidersResult<never> {
    if (!(error instanceof SavedProvidersStoreError)) throw error;
    if (error.code === 'NOT_FOUND') return fail(404, 'NOT_FOUND', error.message);
    if (error.code === 'CONFLICT') return fail(409, 'CONFLICT', error.message);
    return fail(500, 'INTERNAL_ERROR', 'Request failed. Please try again.');
  }
}

function fail<T>(status: number, code: string, message: string): SavedProvidersResult<T> {
  return { status, code, message };
}

/** Read back the raw provider id from an already-validated body. */
function readProviderId(body: unknown): string {
  if (typeof body !== 'object' || body === null) return '';
  const value = (body as Record<string, unknown>)['providerId'];
  return typeof value === 'string' ? value : '';
}

/**
 * Project a profile down to a card. The saved list and the marketplace search
 * must not drift apart, so both render the same public projection.
 */
function toCard(profile: ProviderProfileDto): ProviderCardDto {
  // `bio` and `offerings` are profile-only detail; the saved list renders a
  // card, and the profile page remains the place to read them.
  const { bio: _bio, offerings: _offerings, ...card } = profile;
  return card;
}
