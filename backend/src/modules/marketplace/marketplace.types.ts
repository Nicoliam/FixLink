/**
 * FixLink Stage 6A — marketplace public DTOs.
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
}

/** Full public profile — card fields plus trust/portfolio/review details. */
export interface ProviderProfileDto extends ProviderCardDto {
  bio: string | null;
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

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
