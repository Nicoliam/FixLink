/**
 * Fixlynk saved-professional models.
 *
 * A saved provider is customer-owned reference data: a bookmark that lets a
 * customer request a job later without searching again. It is not a
 * capability and grants no access to anything.
 */
import type { ProviderCard } from './marketplace.model';

/**
 * A bookmarked provider. Shaped exactly like a marketplace card so the same
 * card component renders both, plus the moment it was saved.
 */
export interface SavedProvider extends ProviderCard {
  savedAt: string;
}

/** Whether one specific provider is bookmarked, for the profile toggle. */
export interface SavedProviderState {
  providerId: string;
  saved: boolean;
}
