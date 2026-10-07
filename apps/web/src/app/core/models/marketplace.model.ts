/**
 * Fixlynk marketplace models — Stage 6A.
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
  /**
   * Lowest starting price the provider has actually stated, for a
   * "call out from R…" label. `null` means the provider has not stated a
   * price, in which case the UI omits the figure — it never falls back to 0,
   * which would advertise a call-out nobody agreed to.
   */
  fromPrice: number | null;
  /** Currency of `fromPrice`; null when there is no price. 'ZAR' for the MVP. */
  fromPriceCurrency: string | null;
}

/** A provider-authored service, as shown on the public profile. */
export interface ProviderOfferingTag {
  id: string;
  name: string;
  description: string | null;
  categoryName: string;
  categorySlug: string;
  /** Indicative "from" price. null = not stated yet; never charged. */
  priceAmount: number | null;
  currency: string;
}

export interface ProviderProfile extends ProviderCard {
  bio: string | null;
  offerings: ProviderOfferingTag[];
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

/**
 * The "call out from R…" line for a provider card, or null when the provider
 * has not stated a starting price.
 *
 * Returns null rather than a placeholder figure. A card with no stated price
 * shows nothing, because rendering R0 (or a guess) would advertise a call-out
 * the provider never agreed to — see database/migrations/019.
 */
export function fromPriceLabel(provider: {
  fromPrice: number | null;
  fromPriceCurrency: string | null;
}): string | null {
  if (provider.fromPrice === null) return null;
  const rounded = Math.round(provider.fromPrice * 100) / 100;
  const [whole, fraction] = rounded.toFixed(2).split('.') as [string, string];
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const amount = fraction === '00' ? `R${grouped}` : `R${grouped}.${fraction}`;
  // ZAR is the only MVP currency, so it needs no prefix.
  return provider.fromPriceCurrency === 'ZAR' || provider.fromPriceCurrency === null
    ? amount
    : `${provider.fromPriceCurrency} ${amount}`;
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
