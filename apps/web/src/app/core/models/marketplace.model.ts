/**
 * FixLink marketplace models — Stage 6A.
 *
 * Client-side projections of the public marketplace API
 * (GET /api/v1/services, /categories, /providers …).
 * These contain public data only; private verification documents,
 * customer contact details and internal notes are never exposed here.
 */

export type ProviderType = 'professional' | 'business';

export interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface ServiceListing {
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

export interface ProviderCard {
  id: string;
  providerType: ProviderType;
  name: string;
  description: string | null;
  city: string | null;
  province: string | null;
  verificationStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  isVerified: boolean;
  ratingAvg: number;
  ratingCount: number;
  experienceYears: number | null;
  services: ProviderServiceTag[];
  serviceAreas: ProviderAreaTag[];
  portfolioCount: number;
  approvedCertificateCount: number;
}

export interface ProviderProfile extends ProviderCard {
  bio: string | null;
}

export interface PortfolioImage {
  id: string;
  mimeType: string | null;
  kind: 'BEFORE' | 'AFTER' | 'GENERAL';
  sortOrder: number;
}

export interface PortfolioProject {
  id: string;
  title: string;
  description: string | null;
  service: ProviderServiceTag | null;
  images: PortfolioImage[];
  createdAt: string;
}

export interface ProviderCertificate {
  id: string;
  title: string;
  issuingOrganisation: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  verificationStatus: 'APPROVED';
}

export interface ProviderReview {
  id: string;
  rating: number;
  comment: string | null;
  reviewerName: string;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProviderSearchParams {
  service?: string;
  category?: string;
  location?: string;
  providerType?: ProviderType | '';
  verified?: boolean;
  q?: string;
  page?: number;
  pageSize?: number;
}
