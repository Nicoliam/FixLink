/**
 * Fixlynk — customer saved professional types.
 *
 * A saved professional is a customer-owned bookmark. It carries no
 * permissions and grants no access to anything: it only lets the customer
 * find a provider again quickly.
 */

/** Which kind of provider a bookmark points at, derived from the stored row. */
export type SavedProviderType = 'PROFESSIONAL' | 'BUSINESS';

/**
 * One bookmark row, shaped to match the `saved_professionals` table created in
 * migration 008 and hardened in migration 016.
 *
 * The owner is `customer_id` — a `customer_profiles` row, not a `users` row.
 * A bookmark belongs to the customer's profile, and the backend resolves that
 * profile from the session so the client never supplies it.
 *
 * Exactly one of `savedProfessionalId` / `savedBusinessId` is set. Migration
 * 016 enforces that with a check constraint as well.
 */
export interface SavedProviderRow {
  id: string;
  /** The owning customer profile. */
  customerId: string;
  /** Profile id of the saved professional, or null when a business was saved. */
  savedProfessionalId: string | null;
  /** Profile id of the saved business, or null when a professional was saved. */
  savedBusinessId: string | null;
  createdAt: string;
}
