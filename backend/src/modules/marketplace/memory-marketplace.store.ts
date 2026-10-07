/**
 * Fixlynk Stage 6A — in-memory marketplace store for automated tests.
 *
 * Mirrors the development seeders (fictional data) so the search, profile,
 * portfolio, certificate and review logic is verified without MySQL.
 * The MySQL implementation enforces the same visibility rules; the database
 * schema itself is covered by database/tests/schema.test.js.
 */
import { MAX_OPEN_REQUEST_MATCHES, type MarketplaceStore } from './marketplace.store';
import type {
  CertificateDto,
  OpenRequestMatch,
  Paginated,
  PortfolioProjectDto,
  ProviderAreaTag,
  ProviderCardDto,
  ProviderMatchProfile,
  ProviderOfferingTag,
  ProviderProfileDto,
  ProviderRef,
  ProviderSearchFilters,
  ReviewDto,
  ServiceCategoryDto,
  ServiceDto,
} from './marketplace.types';
import { anyAreaMatchesLocation } from '../../utils/service-area-match';

interface OfferingFixture {
  id: string;
  name: string;
  description: string | null;
  categoryName: string;
  categorySlug: string;
  /** null = provider has not stated a price yet (see migration 019). */
  priceAmount: number | null;
  currency: string;
  isActive: boolean;
}

interface ProfessionalRow {
  id: string;
  displayName: string;
  bio: string | null;
  experienceYears: number | null;
  photo: string | null;
  verificationStatus: ProviderCardDto['verificationStatus'];
  ratingAvg: number;
  ratingCount: number;
  serviceIds: string[];
  offerings: OfferingFixture[];
  areas: { areaName: string; city: string | null; province: string | null }[];
  portfolio: PortfolioProjectDto[];
  certificates: CertificateDto[];
  reviews: ReviewDto[];
}

interface BusinessRow {
  id: string;
  businessName: string;
  description: string | null;
  logo: string | null;
  city: string | null;
  province: string | null;
  verificationStatus: ProviderCardDto['verificationStatus'];
  ratingAvg: number;
  ratingCount: number;
  serviceIds: string[];
  offerings: OfferingFixture[];
  areas: { areaName: string; city: string | null; province: string | null }[];
  portfolio: PortfolioProjectDto[];
  certificates: CertificateDto[];
  reviews: ReviewDto[];
}

const CATEGORIES: ServiceCategoryDto[] = [
  { id: '1', name: 'Plumbing', slug: 'plumbing', description: 'Water, leaks, geysers and drainage work' },
  { id: '2', name: 'Electrical', slug: 'electrical', description: 'Wiring, boards, lighting and fault finding' },
  { id: '3', name: 'Painting', slug: 'painting', description: 'Interior and exterior painting' },
  { id: '4', name: 'Building & Renovation', slug: 'building-renovation', description: 'Plastering, cracks, small building work' },
  { id: '5', name: 'Handyman', slug: 'handyman', description: 'General home repairs and odd jobs' },
  { id: '6', name: 'Appliances', slug: 'appliances', description: 'Home appliance repairs' },
  { id: '7', name: 'Air Conditioning', slug: 'air-conditioning', description: 'Aircon service and installation' },
  { id: '8', name: 'Gardening', slug: 'gardening', description: 'Garden cleanup and maintenance' },
  { id: '9', name: 'Cleaning', slug: 'cleaning', description: 'Home and deep cleaning' },
];

const SERVICES: ServiceDto[] = [
  { id: '1', categoryId: '1', categoryName: 'Plumbing', categorySlug: 'plumbing', name: 'Leak Repair & Pipe Fixes', slug: 'leak-repair', description: 'Fix leaking taps, pipes and fittings' },
  { id: '2', categoryId: '1', categoryName: 'Plumbing', categorySlug: 'plumbing', name: 'Geyser Installation & Repair', slug: 'geyser-install-repair', description: 'Geyser installs, replacements and repairs' },
  { id: '3', categoryId: '1', categoryName: 'Plumbing', categorySlug: 'plumbing', name: 'Drain Unblocking', slug: 'drain-unblocking', description: 'Blocked drains, basins and sewer lines' },
  { id: '4', categoryId: '2', categoryName: 'Electrical', categorySlug: 'electrical', name: 'DB Board & Wiring Repairs', slug: 'db-board-wiring', description: 'Distribution boards, wiring faults and CoC-related fixes' },
  { id: '5', categoryId: '2', categoryName: 'Electrical', categorySlug: 'electrical', name: 'Lighting Installation', slug: 'lighting-installation', description: 'Downlights, security lights and fittings' },
  { id: '6', categoryId: '3', categoryName: 'Painting', categorySlug: 'painting', name: 'Interior Painting', slug: 'interior-painting', description: 'Walls, ceilings and trims inside the home' },
  { id: '7', categoryId: '3', categoryName: 'Painting', categorySlug: 'painting', name: 'Exterior Painting', slug: 'exterior-painting', description: 'Outside walls, roofs and boundary walls' },
  { id: '8', categoryId: '4', categoryName: 'Building & Renovation', categorySlug: 'building-renovation', name: 'Wall Crack & Plaster Repair', slug: 'wall-crack-plaster-repair', description: 'Crack stitching, plastering and skimming' },
  { id: '9', categoryId: '5', categoryName: 'Handyman', categorySlug: 'handyman', name: 'General Handyman', slug: 'general-handyman', description: 'Small mixed repairs around the home' },
  { id: '10', categoryId: '6', categoryName: 'Appliances', categorySlug: 'appliances', name: 'Appliance Repair', slug: 'appliance-repair', description: 'Washing machines, fridges, stoves and ovens' },
  { id: '11', categoryId: '7', categoryName: 'Air Conditioning', categorySlug: 'air-conditioning', name: 'Aircon Service & Install', slug: 'aircon-service-install', description: 'Split-unit service, regas and installs' },
  { id: '12', categoryId: '8', categoryName: 'Gardening', categorySlug: 'gardening', name: 'Garden Cleanup & Maintenance', slug: 'garden-cleanup-maintenance', description: 'Once-off cleanups and ongoing upkeep' },
  { id: '13', categoryId: '9', categoryName: 'Cleaning', categorySlug: 'cleaning', name: 'Home Deep Cleaning', slug: 'home-deep-cleaning', description: 'Full home deep cleans and move cleans' },
];

function serviceTag(id: string): { id: string; name: string; slug: string } {
  const service = SERVICES.find((s) => s.id === id);
  if (!service) throw new Error(`Unknown fixture service id: ${id}`);
  return { id: service.id, name: service.name, slug: service.slug };
}

const PROFESSIONALS: ProfessionalRow[] = [
  {
    id: '1',
    displayName: 'Sipho Ndlovu - ProPlumb',
    bio: 'PIRB-registered plumber doing leaks, geysers and drains across Joburg North.',
    experienceYears: 9,
    photo: 'profiles/professional-1.jpg',
    verificationStatus: 'VERIFIED',
    ratingAvg: 4.8,
    ratingCount: 64,
    serviceIds: ['1', '2', '3'],
    offerings: [
      { id: '101', name: 'Emergency Burst Pipe Repair', description: 'Same-day call-out for burst pipes.', categoryName: 'Plumbing', categorySlug: 'plumbing', priceAmount: 850, currency: 'ZAR', isActive: true },
      // Higher than the first, so "from" must be 850 and not this.
      { id: '102', name: 'Geyser Installation', description: null, categoryName: 'Plumbing', categorySlug: 'plumbing', priceAmount: 2400, currency: 'ZAR', isActive: true },
      // No price stated yet (migration 019): must be ignored, never read as R0.
      { id: '103', name: 'Drain Blockage Clearance', description: null, categoryName: 'Plumbing', categorySlug: 'plumbing', priceAmount: null, currency: 'ZAR', isActive: true },
      // Retired offering: must never surface as a price.
      { id: '104', name: 'Retired Service', description: null, categoryName: 'Plumbing', categorySlug: 'plumbing', priceAmount: 150, currency: 'ZAR', isActive: false },
    ],
    areas: [
      { areaName: 'Randburg & surrounds', city: 'Johannesburg', province: 'Gauteng' },
      { areaName: 'Sandton', city: 'Johannesburg', province: 'Gauteng' },
    ],
    portfolio: [
      {
        id: '1',
        title: 'Northcliff kitchen leak repair',
        description: 'Leaking mixer replaced, cupboard dried and resealed. Same-day fix.',
        service: serviceTag('1'),
        images: [
          { id: '1', mimeType: 'image/jpeg', kind: 'BEFORE', sortOrder: 1 },
          { id: '2', mimeType: 'image/jpeg', kind: 'AFTER', sortOrder: 2 },
        ],
        createdAt: '2026-09-20T10:00:00.000Z',
      },
    ],
    certificates: [
      {
        id: '1',
        title: 'PIRB Registered Plumber',
        issuingOrganisation: 'Plumbing Industry Registration Board',
        issueDate: '2023-03-14',
        expiryDate: '2027-03-13',
        verificationStatus: 'APPROVED',
      },
    ],
    reviews: [],
  },
  {
    id: '2',
    displayName: 'Johan Botha Electrical',
    bio: 'Residential electrician: fault finding, DB boards and lighting in Centurion.',
    experienceYears: 12,
    photo: 'profiles/professional-2.jpg',
    verificationStatus: 'VERIFIED',
    ratingAvg: 4.7,
    ratingCount: 41,
    serviceIds: ['4', '5'],
    offerings: [{ id: '102', name: 'DB Board Upgrades', description: null, categoryName: 'Electrical', categorySlug: 'electrical', priceAmount: 1200, currency: 'ZAR', isActive: true }],
    areas: [{ areaName: 'Centurion', city: 'Centurion', province: 'Gauteng' }],
    portfolio: [],
    certificates: [],
    reviews: [
      {
        id: '1',
        rating: 5,
        comment: 'Johan arrived on time, found the fault fast and explained everything. DB is neat and labelled now.',
        reviewerName: 'Aisha P.',
        createdAt: '2026-09-19T10:00:00.000Z',
      },
    ],
  },
  {
    id: '3',
    displayName: 'Maria Santos Painting',
    bio: 'Neat, reliable painter for interiors and exteriors in Durban North.',
    experienceYears: 6,
    photo: null,
    verificationStatus: 'PENDING',
    ratingAvg: 0,
    ratingCount: 0,
    serviceIds: ['6', '7'],
    offerings: [{ id: '103', name: 'Interior Repainting', description: 'Two coats, premium paint supplied.', categoryName: 'Painting', categorySlug: 'painting', priceAmount: 2400, currency: 'ZAR', isActive: true }],
    areas: [{ areaName: 'Durban North', city: 'Durban', province: 'KwaZulu-Natal' }],
    portfolio: [],
    certificates: [],
    reviews: [],
  },
];

const BUSINESSES: BusinessRow[] = [
  {
    id: '1',
    businessName: 'Ubuntu Plumbing Co.',
    description: 'Family-run plumbing team serving Joburg North since 2012.',
    logo: 'profiles/business-1.jpg',
    city: 'Johannesburg',
    province: 'Gauteng',
    verificationStatus: 'VERIFIED',
    ratingAvg: 4.6,
    ratingCount: 48,
    serviceIds: ['1', '2', '3'],
    offerings: [{ id: '201', name: 'Commercial Drainage', description: 'Blocked drains cleared on site.', categoryName: 'Plumbing', categorySlug: 'plumbing', priceAmount: 1500, currency: 'ZAR', isActive: true }],
    areas: [
      { areaName: 'Johannesburg North', city: 'Johannesburg', province: 'Gauteng' },
      { areaName: 'Fourways', city: 'Johannesburg', province: 'Gauteng' },
    ],
    portfolio: [
      {
        id: '2',
        title: 'Blairgowrie drain rehabilitation',
        description: 'Ongoing: boundary trap replacement and full line jetting.',
        service: serviceTag('3'),
        images: [
          { id: '3', mimeType: 'image/jpeg', kind: 'GENERAL', sortOrder: 1 },
        ],
        createdAt: '2026-09-19T12:00:00.000Z',
      },
    ],
    certificates: [],
    reviews: [],
  },
  {
    id: '2',
    businessName: 'Cape Spark Electrical',
    description: 'Residential electricians across the Cape Peninsula.',
    logo: null,
    city: 'Cape Town',
    province: 'Western Cape',
    verificationStatus: 'PENDING',
    ratingAvg: 0,
    ratingCount: 0,
    serviceIds: ['4', '5'],
    offerings: [],
    areas: [{ areaName: 'Southern Suburbs', city: 'Cape Town', province: 'Western Cape' }],
    portfolio: [],
    certificates: [],
    reviews: [],
  },
];

/**
 * The "call out from R…" figure: the lowest price the provider has actually
 * stated on a live offering. Mirrors lowestStatedPrice in the MySQL store so
 * the two backends behave identically. Nulls when nothing is stated — never 0.
 */
function lowestStatedPrice(offerings: ProviderOfferingTag[]): {
  fromPrice: number | null;
  fromPriceCurrency: string | null;
} {
  const priced = offerings.filter((o) => o.priceAmount !== null);
  if (priced.length === 0) return { fromPrice: null, fromPriceCurrency: null };
  const lowest = priced.reduce((min, o) => (o.priceAmount! < min.priceAmount! ? o : min));
  return { fromPrice: lowest.priceAmount, fromPriceCurrency: lowest.currency };
}

function professionalCard(row: ProfessionalRow): ProviderCardDto {
  return {
    id: `professional-${row.id}`,
    providerType: 'professional',
    name: row.displayName,
    description: row.bio,
    city: row.areas[0]?.city ?? null,
    province: row.areas[0]?.province ?? null,
    verificationStatus: row.verificationStatus,
    isVerified: row.verificationStatus === 'VERIFIED',
    ratingAvg: row.ratingAvg,
    ratingCount: row.ratingCount,
    experienceYears: row.experienceYears,
    services: row.serviceIds.map(serviceTag),
    serviceAreas: row.areas,
    portfolioCount: row.portfolio.length,
    approvedCertificateCount: row.certificates.length,
    ...lowestStatedPrice(liveOfferings(row)),
  };
}

function liveOfferings(row: { offerings: OfferingFixture[] }): ProviderOfferingTag[] {
  return row.offerings.filter((offering) => offering.isActive);
}

function businessCard(row: BusinessRow): ProviderCardDto {
  return {
    id: `business-${row.id}`,
    providerType: 'business',
    name: row.businessName,
    description: row.description,
    city: row.city,
    province: row.province,
    verificationStatus: row.verificationStatus,
    isVerified: row.verificationStatus === 'VERIFIED',
    ratingAvg: row.ratingAvg,
    ratingCount: row.ratingCount,
    experienceYears: null,
    services: row.serviceIds.map(serviceTag),
    serviceAreas: row.areas,
    portfolioCount: row.portfolio.length,
    approvedCertificateCount: row.certificates.length,
    ...lowestStatedPrice(liveOfferings(row)),
  };
}

function matchesServiceOrCategory(
  serviceIds: string[],
  serviceFilter: string | null,
  categoryFilter: string | null,
): boolean {
  if (serviceFilter) {
    const needle = serviceFilter.toLowerCase();
    const hit = serviceIds.some((id) => {
      const service = SERVICES.find((s) => s.id === id);
      if (!service) return false;
      return (
        service.id === serviceFilter ||
        service.slug.toLowerCase() === needle ||
        service.name.toLowerCase().includes(needle)
      );
    });
    if (!hit) return false;
  }
  if (categoryFilter) {
    const needle = categoryFilter.toLowerCase();
    const hit = serviceIds.some((id) => {
      const service = SERVICES.find((s) => s.id === id);
      if (!service) return false;
      return (
        service.categoryId === categoryFilter ||
        service.categorySlug.toLowerCase() === needle ||
        service.categoryName.toLowerCase().includes(needle)
      );
    });
    if (!hit) return false;
  }
  return true;
}

function matchesLocation(
  areas: { areaName: string; city: string | null; province: string | null }[],
  businessCity: string | null,
  location: string | null,
): boolean {
  if (!location) return true;
  const needle = location.toLowerCase();
  if (businessCity && businessCity.toLowerCase().includes(needle)) return true;
  return areas.some(
    (area) =>
      area.areaName.toLowerCase().includes(needle) ||
      (area.city && area.city.toLowerCase().includes(needle)) ||
      (area.province && area.province.toLowerCase().includes(needle)),
  );
}

function matchesQuery(card: ProviderCardDto, query: string | null): boolean {
  if (!query) return true;
  const haystack = [card.name, card.description ?? '', ...card.services.map((s) => s.name)].join(' ').toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

function mergeById<T extends { id: string }>(fixtures: T[], overrides: T[]): T[] {
  const byId = new Map<string, T>(fixtures.map((row) => [row.id, row]));
  for (const row of overrides) byId.set(row.id, row);
  return [...byId.values()];
}

export class MemoryMarketplaceStore implements MarketplaceStore {
  /**
   * Step 14 — extra providers created by tests, appended after the static
   * fixtures. Real registration creates a `professional_profiles` row but no
   * services or areas, so a registered professional matches nothing until a
   * test says what they offer and where. That is exactly the production
   * behaviour and the thing the matching tests need to set up.
   */
  private readonly extraProfessionals: ProfessionalRow[] = [];
  private readonly extraBusinesses: BusinessRow[] = [];

  /** Test setup: give a provider published coverage (Step 14). */
  seedServiceAreas(provider: ProviderRef, areas: ProviderAreaTag[]): void {
    const rows = provider.providerType === 'professional' ? this.allProfessionals() : this.allBusinesses();
    const row = rows.find((entry) => entry.id === provider.numericId.trim());
    if (!row) return;
    // Assign a fresh array: never mutate an object a static fixture still owns.
    row.areas = areas.map((area) => ({ ...area }));
  }

  /** Test setup: register a professional's matching profile (Step 14). */
  addTestProfessional(profile: {
    id: string;
    displayName: string;
    serviceIds?: string[];
    offeringCategoryIds?: string[];
    areas?: { areaName: string; city?: string | null; province?: string | null }[];
  }): void {
    this.extraProfessionals.push({
      id: profile.id,
      displayName: profile.displayName,
      bio: null,
      experienceYears: null,
      photo: null,
      verificationStatus: 'UNVERIFIED',
      ratingAvg: 0,
      ratingCount: 0,
      serviceIds: profile.serviceIds ?? [],
      offerings: (profile.offeringCategoryIds ?? []).map((categoryId, index) => ({
        id: `test-${profile.id}-${index + 1}`,
        name: `Test offering ${index + 1}`,
        description: null,
        categoryName: CATEGORIES.find((c) => c.id === categoryId)?.name ?? 'Test',
        categorySlug: CATEGORIES.find((c) => c.id === categoryId)?.slug ?? 'test',
        priceAmount: null,
        currency: 'ZAR',
        isActive: true,
      })),
      areas: (profile.areas ?? []).map((area) => ({
        areaName: area.areaName,
        city: area.city ?? null,
        province: area.province ?? null,
      })),
      portfolio: [],
      certificates: [],
      reviews: [],
    });
  }

  /** Test setup: register a business's matching profile (Step 14). */
  addTestBusiness(business: {
    id: string;
    businessName: string;
    serviceIds?: string[];
    areas?: { areaName: string; city?: string | null; province?: string | null }[];
  }): void {
    this.extraBusinesses.push({
      id: business.id,
      businessName: business.businessName,
      description: null,
      logo: null,
      city: business.areas?.[0]?.city ?? null,
      province: business.areas?.[0]?.province ?? null,
      verificationStatus: 'UNVERIFIED',
      ratingAvg: 0,
      ratingCount: 0,
      serviceIds: business.serviceIds ?? [],
      offerings: [],
      areas: (business.areas ?? []).map((area) => ({
        areaName: area.areaName,
        city: area.city ?? null,
        province: area.province ?? null,
      })),
      portfolio: [],
      certificates: [],
      reviews: [],
    });
  }

  /**
   * Static fixtures plus anything a test registered, with test rows WINNING on
   * a colliding id.
   *
   * The collision is real: business '1' is a fixture, and a test that wants to
   * set business 1's service areas would otherwise mutate (or be shadowed by)
   * the fixture depending on which list a lookup searched. Merging here means
   * every `find` in this class sees exactly one row per id.
   */
  private allProfessionals(): ProfessionalRow[] {
    return mergeById(PROFESSIONALS, this.extraProfessionals);
  }

  private allBusinesses(): BusinessRow[] {
    return mergeById(BUSINESSES, this.extraBusinesses);
  }

  /** The platform category buckets a fixture offers in, catalogue + offerings. */
  private categoriesFor(row: ProfessionalRow | BusinessRow): string[] {
    const ids = new Set<string>();
    for (const serviceId of row.serviceIds) {
      const service = SERVICES.find((s) => s.id === serviceId);
      if (service) ids.add(service.categoryId);
    }
    for (const offering of row.offerings) {
      const category = CATEGORIES.find((c) => c.slug === offering.categorySlug);
      if (category) ids.add(category.id);
    }
    return [...ids];
  }

  async findOpenRequestMatches(
    categoryId: string,
    location: string,
    limit: number,
  ): Promise<OpenRequestMatch[]> {
    const cap = Math.max(0, Math.min(limit, MAX_OPEN_REQUEST_MATCHES));
    const collect = (rows: (ProfessionalRow | BusinessRow)[], providerType: 'professional' | 'business') =>
      rows
        .filter((row) => this.categoriesFor(row).includes(categoryId))
        .filter((row) => anyAreaMatchesLocation(row.areas, location))
        .map((row) => ({
          providerType,
          numericId: row.id,
          name: 'displayName' in row ? row.displayName : row.businessName,
          serviceAreas: row.areas,
        }));
    const matches = [
      ...collect(this.allProfessionals(), 'professional'),
      ...collect(this.allBusinesses(), 'business'),
    ];
    // Mirrors the MySQL ordering: newest profile first, then the fan-out cap.
    matches.sort((a, b) => Number(b.numericId) - Number(a.numericId));
    return matches.slice(0, cap);
  }

  async getProviderMatchProfile(provider: ProviderRef): Promise<ProviderMatchProfile> {
    const rows = provider.providerType === 'professional' ? this.allProfessionals() : this.allBusinesses();
    const row = rows.find((entry) => entry.id === provider.numericId.trim());
    if (!row) return { categoryIds: [], serviceAreas: [] };
    return { categoryIds: this.categoriesFor(row), serviceAreas: row.areas };
  }

  async replaceServiceAreas(provider: ProviderRef, areas: ProviderAreaTag[]): Promise<void> {
    this.seedServiceAreas(provider, areas);
  }

  async listCategories(activeOnly: boolean): Promise<ServiceCategoryDto[]> {
    void activeOnly;
    return CATEGORIES;
  }

  async getCategoryById(id: string): Promise<ServiceCategoryDto | null> {
    return CATEGORIES.find((c) => c.id === id) ?? null;
  }

  async listServices(activeOnly: boolean): Promise<ServiceDto[]> {
    void activeOnly;
    return SERVICES;
  }

  async getServiceById(id: string): Promise<ServiceDto | null> {
    return SERVICES.find((s) => s.id === id) ?? null;
  }

  async searchProviders(filters: ProviderSearchFilters): Promise<Paginated<ProviderCardDto>> {
    let cards: ProviderCardDto[] = [
      ...this.allProfessionals().map(professionalCard),
      ...this.allBusinesses().map(businessCard),
    ];

    if (filters.providerType) {
      cards = cards.filter((c) => c.providerType === filters.providerType);
    }
    if (filters.verifiedOnly) {
      cards = cards.filter((c) => c.isVerified);
    }
    cards = cards.filter((card) => {
      const row =
        card.providerType === 'professional'
          ? this.allProfessionals().find((p) => `professional-${p.id}` === card.id)
          : this.allBusinesses().find((b) => `business-${b.id}` === card.id);
      const serviceIds = row?.serviceIds ?? [];
      const areas = row?.areas ?? [];
      const businessCity = card.providerType === 'business' ? card.city : null;
      return (
        matchesServiceOrCategory(serviceIds, filters.service, filters.category) &&
        matchesLocation(areas, businessCity, filters.location) &&
        matchesQuery(card, filters.query)
      );
    });

    cards.sort((a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount);
    const total = cards.length;
    const start = (filters.page - 1) * filters.pageSize;
    return { items: cards.slice(start, start + filters.pageSize), total, page: filters.page, pageSize: filters.pageSize };
  }

  async getProviderById(providerId: string): Promise<ProviderProfileDto | null> {
    const professional = this.allProfessionals().find((p) => `professional-${p.id}` === providerId);
    if (professional) {
      return {
        ...professionalCard(professional),
        bio: professional.bio,
        offerings: liveOfferings(professional),
      };
    }
    const business = this.allBusinesses().find((b) => `business-${b.id}` === providerId);
    if (business) {
      return {
        ...businessCard(business),
        bio: business.description,
        offerings: liveOfferings(business),
      };
    }
    return null;
  }

  async getProviderPortfolio(providerId: string): Promise<PortfolioProjectDto[]> {
    const professional = this.allProfessionals().find((p) => `professional-${p.id}` === providerId);
    if (professional) return professional.portfolio;
    const business = this.allBusinesses().find((b) => `business-${b.id}` === providerId);
    return business?.portfolio ?? [];
  }

  async getProviderCertificates(providerId: string): Promise<CertificateDto[]> {
    const professional = this.allProfessionals().find((p) => `professional-${p.id}` === providerId);
    if (professional) return professional.certificates;
    const business = this.allBusinesses().find((b) => `business-${b.id}` === providerId);
    return business?.certificates ?? [];
  }

  async getProviderReviews(providerId: string, page: number, pageSize: number): Promise<Paginated<ReviewDto>> {
    const professional = this.allProfessionals().find((p) => `professional-${p.id}` === providerId);
    const business = professional ? null : this.allBusinesses().find((b) => `business-${b.id}` === providerId);
    const all = professional?.reviews ?? business?.reviews ?? [];
    const start = (page - 1) * pageSize;
    return { items: all.slice(start, start + pageSize), total: all.length, page, pageSize };
  }
}
