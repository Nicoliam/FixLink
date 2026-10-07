/**
 * Fixlynk — customer saved professional store contract.
 *
 * Persists to the existing `saved_professionals` table (migration 008,
 * hardened by migration 016). No second table is created for the same concept
 * (AGENTS.md section 16).
 *
 * This store owns bookmarks ONLY. It deliberately does not read provider
 * profiles: the saved list is hydrated through the public marketplace
 * projection (`MarketplaceStore.getProviderById`) so a bookmarked provider
 * renders exactly what the marketplace renders, with the same verification
 * rules and the same private-data exclusions.
 *
 * Ownership is never accepted from a request. The service resolves the
 * caller's `customer_profiles` id from the session and the store scopes every
 * query to it.
 */
import type { SavedProviderRow, SavedProviderType } from './saved-providers.types';

/**
 * Store-level failure. `NOT_FOUND` means the customer has no profile yet or
 * the provider is not saveable; `CONFLICT` means the customer already saved it
 * (uq_saved_professionals_unique).
 */
export class SavedProvidersStoreError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL',
    message: string,
  ) {
    super(message);
    this.name = 'SavedProvidersStoreError';
  }
}

export interface SavedProvidersStore {
  /** The caller's customer profile id, or null when they have never onboarded. */
  findCustomerProfileByUserId(userId: string): Promise<string | null>;
  /**
   * True when the provider profile exists and is active, i.e. when it is
   * publicly listable and therefore saveable. Returns false for unknown,
   * deactivated or soft-deleted profiles.
   */
  isSaveableProvider(providerType: SavedProviderType, providerId: string): Promise<boolean>;
  /** The customer's bookmarks, newest first. Always scoped to `customerId`. */
  listSavedProviders(customerId: string): Promise<SavedProviderRow[]>;
  /** True when the customer has already bookmarked this provider. */
  isSaved(customerId: string, providerType: SavedProviderType, providerId: string): Promise<boolean>;
  /**
   * Bookmark a provider for a customer. Throws SavedProvidersStoreError
   * ('CONFLICT') on a duplicate so the caller can answer 409.
   */
  addSavedProvider(
    customerId: string,
    providerType: SavedProviderType,
    providerId: string,
  ): Promise<SavedProviderRow>;
  /**
   * Remove one of the customer's own bookmarks.
   * Returns false when they had not saved that provider.
   */
  removeSavedProvider(
    customerId: string,
    providerType: SavedProviderType,
    providerId: string,
  ): Promise<boolean>;
}
