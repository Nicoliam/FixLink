/**
 * Provider service-offering contracts.
 *
 * Mirrors /api/v1/provider/offerings. An offering is a service a
 * provider (professional profile or business) advertises, grouped
 * under a platform service category with an INDICATIVE starting price.
 *
 * The MVP does not process payments: `priceAmount` is a "from R850"
 * guide only and the customer still arranges and pays the provider
 * directly. Ownership (`providerType` / `providerId`), category
 * denormalisation (`categoryName` / `categorySlug`), `currency` and
 * `isActive` are server-owned — the client never sends them, and
 * `providerType` is rejected on update.
 */

/** Which provider a listing belongs to (professional profile vs business). */
export type OfferingProviderType = 'PROFESSIONAL' | 'BUSINESS';

/** Provider service offering returned by the /provider/offerings endpoints. */
export interface Offering {
  id: string;
  providerType: OfferingProviderType;
  providerId: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  name: string;
  description: string | null;
  /** Indicative starting price in rand (e.g. 850 → "R850"). */
  priceAmount: number;
  /** Always 'ZAR' for the MVP. */
  currency: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A provider identity the signed-in user may create offerings under. */
export interface OfferingOwnerRef {
  providerType: OfferingProviderType;
  providerId: string;
}

export interface OfferingList {
  items: Offering[];
  total: number;
  /**
   * Every provider identity the user may act for, including ones with no
   * offerings yet. The server sends this because the "which provider?" case
   * arises precisely when an identity is empty, so it cannot be inferred
   * from `items`.
   */
  providers: OfferingOwnerRef[];
}

export interface CreateOfferingRequest {
  categoryId: string;
  name: string;
  description?: string;
  /**
   * Indicative starting price in rand. OPTIONAL: a provider choosing services
   * during registration has not decided what to charge yet, and the backend
   * stores an absent price as null rather than inventing a figure. Prices are
   * set afterwards on My Services.
   */
  priceAmount?: number;
  /**
   * Only sent when the signed-in user manages more than one provider;
   * the backend otherwise derives the owner from the session.
   */
  providerType?: OfferingProviderType;
}

export interface UpdateOfferingRequest {
  categoryId?: string;
  name?: string;
  description?: string | null;
  priceAmount?: number;
}

/** Human-readable label for the owning provider of a listing. */
export function offeringProviderTypeLabel(providerType: OfferingProviderType): string {
  return providerType === 'BUSINESS' ? 'Business' : 'Professional profile';
}