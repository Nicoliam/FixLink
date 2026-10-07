/**
 * Fixlynk Stage 6A — marketplace public DTOs.
 *
 * These are the ONLY shapes the marketplace API returns. They deliberately
 * exclude private data: no passwords/hashes, no tokens, no ID documents,
 * no identity-verification files, no certificate document references, no
 * customer emails/phones, no internal notes, no audit data.
 * (See docs/PERMISSIONS.md §13–14, docs/PRODUCT.md §25.)
 */

export type ProviderType = 'professional' | 'business';

export interface ServiceCategoryDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface ServiceDto {
  id: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface ProviderServiceTag {
  id: string;
  name: string;
  slug: string;
}

/**
 * A provider-authored service, as shown publicly. `priceAmount` is an
 * indicative starting price in ZAR — the MVP does not process payments, so
 * it is never charged and never an agreed amount.
 *
 * `priceAmount` is NULL when the provider has not stated a price yet (they
 * pick their services at registration, before login, and set the figure
 * later). NULL means "not set": a surface must omit the price rather than
 * substitute 0, which would advertise a "from R0" call-out nobody agreed to.
 * See database/migrations/019_offering_price_optional.sql.
 */
export interface ProviderOfferingTag {
  id: string;
  name: string;
  description: string | null;
  categoryName: string;
  categorySlug: string;
  priceAmount: number | null;
  currency: string;
}

export interface ProviderAreaTag {
  areaName: string;
  city: string | null;
  province: string | null;
}

/** Card-level provider projection used by search results and homepage. */
export interface ProviderCardDto {
  /** Opaque public id: `professional-<id>` or `business-<id>`. */
  id: string;
  providerType: ProviderType;
  name: string;
  description: string | null;
  city: string | null;
  province: string | null;
  verificationStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  /** True only when the backend confirms VERIFIED status. */
  isVerified: boolean;
  ratingAvg: number;
  ratingCount: number;
  experienceYears: number | null;
  services: ProviderServiceTag[];
  serviceAreas: ProviderAreaTag[];
  portfolioCount: number;
  approvedCertificateCount: number;
  /**
   * Lowest stated starting price across the provider's live offerings, for a
   * "call out from R…" label. NULL when the provider has stated no price on
   * any live offering — never 0, and never derived from anything but the
   * provider's own figures. Informational only; the MVP does not charge it.
   */
  fromPrice: number | null;
  /** Currency of `fromPrice`. 'ZAR' for the MVP. Null when there is no price. */
  fromPriceCurrency: string | null;
}

/** Full public profile — card fields plus trust/portfolio/review details. */
export interface ProviderProfileDto extends ProviderCardDto {
  bio: string | null;
  /** The provider's own services, alongside the platform catalogue links. */
  offerings: ProviderOfferingTag[];
}

export interface PortfolioImageDto {
  id: string;
  mimeType: string | null;
  kind: 'BEFORE' | 'AFTER' | 'GENERAL';
  sortOrder: number;
}

export interface PortfolioProjectDto {
  id: string;
  title: string;
  description: string | null;
  service: ProviderServiceTag | null;
  images: PortfolioImageDto[];
  createdAt: string;
}

export interface CertificateDto {
  id: string;
  title: string;
  issuingOrganisation: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  verificationStatus: 'APPROVED';
}

export interface ReviewDto {
  id: string;
  rating: number;
  comment: string | null;
  /** Reviewer display name only (first name + last initial) — never contact info. */
  reviewerName: string;
  createdAt: string;
}

export interface ProviderSearchFilters {
  service: string | null;
  category: string | null;
  location: string | null;
  providerType: ProviderType | null;
  verifiedOnly: boolean;
  query: string | null;
  page: number;
  pageSize: number;
}

/**
 * Step 14 — the reference a matcher needs to act on a provider. The opaque
 * public id (`professional-7`) is kept as one field so a caller cannot mix a
 * type with an id from the other type.
 */
export interface ProviderRef {
  providerType: ProviderType;
  numericId: string;
}

/**
 * Step 14 — a provider that matches an open request on category and area,
 * with the areas that made it match. Carries only public profile data; the
 * recipient user ids are resolved separately by the provider directory.
 */
export interface OpenRequestMatch {
  providerType: ProviderType;
  numericId: string;
  /** Public display name, used only for notification copy. */
  name: string;
  serviceAreas: ProviderAreaTag[];
}

/**
 * Step 14 — what the caller's own provider profile looks like for matching
 * purposes: the platform category buckets it offers in, and where it works.
 *
 * Both are empty for a profile that has published neither, and an empty
 * result is a legitimate answer rather than an error: no categories means no
 * open requests can match it.
 */
export interface ProviderMatchProfile {
  /** Platform `service_categories` ids, from offerings and catalogue links. */
  categoryIds: string[];
  serviceAreas: ProviderAreaTag[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
