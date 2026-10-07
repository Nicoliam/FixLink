/**
 * Fixlynk — provider-authored service offerings.
 *
 * A `service_offerings` row (migration 015) is the thing a provider lists
 * when they describe their own service, instead of selecting a platform
 * catalogue entry from `services`.
 *
 * `services` stays ADMIN-owned and is deliberately not extended: it enforces
 * UNIQUE(slug) and UNIQUE(category_id, name) globally, so two providers
 * cannot both author "Leak Repair" as catalogue rows. Categories remain
 * platform-owned because marketplace browsing joins through them; only the
 * leaf service is provider-authored.
 *
 * Ownership uses nullable professional_id / business_id with the
 * exactly-one-owner rule enforced server-side, matching customer_profiles
 * and service_areas.
 */

/** Which kind of provider owns the offering. Technicians are never providers. */
export type OfferingProviderType = 'PROFESSIONAL' | 'BUSINESS';

/** The single owning profile an offering belongs to. */
export interface OfferingOwner {
  providerType: OfferingProviderType;
  /** Numeric id of the owning professional_profiles / business_profiles row. */
  providerId: string;
}

/** Professional profile owned by the authenticated user, if any. */
export interface ProfessionalIdentity {
  id: string;
}

/** Business the authenticated user may act for (owner or manager member). */
export interface BusinessIdentity {
  businessId: string;
  role: 'OWNER' | 'MANAGER';
}

/** Platform-owned taxonomy bucket an offering is filed under. */
export interface ServiceCategoryRef {
  id: string;
  name: string;
  slug: string;
}

export interface ServiceOfferingDto {
  id: string;
  providerType: OfferingProviderType;
  providerId: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  name: string;
  description: string | null;
  /**
   * Indicative starting price in ZAR. Informational only — the MVP does not
   * process payments, so this is never charged and never enforced against a
   * submitted quote.
   */
  /**
   * NULL means the provider offers this service but has not stated a starting
   * price yet — chosen during registration, before login. Surfaces must render
   * that as "not set" and must never substitute a figure: the price is
   * informational only (AGENTS.md section 12) and Fixlynk does not invent one.
   */
  priceAmount: number | null;
  currency: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Fields a provider supplies when creating or editing an offering. */
export interface OfferingMutationInput {
  categoryId: string;
  name: string;
  description: string | null;
  /** null = not stated yet (see `OfferingDto.priceAmount`). */
  priceAmount: number | null;
}

/**
 * Statuses that still count as live work. An offering cannot be removed
 * while a job in one of these states references it, otherwise the job would
 * point at a service its provider no longer offers.
 */
export const OPEN_JOB_STATUSES = [
  'REQUESTED',
  'QUOTED',
  'ACCEPTED',
  'SCHEDULED',
  'IN_PROGRESS',
  'AWAITING_PARTS',
  'DISPUTED',
] as const;