/**
 * FixLink Stage 6A — in-memory marketplace store for automated tests.
 *
 * Mirrors the development seeders (fictional data) so the search, profile,
 * portfolio, certificate and review logic is verified without MySQL.
 * The MySQL implementation enforces the same visibility rules; the database
 * schema itself is covered by database/tests/schema.test.js.
 */
import type { MarketplaceStore } from './marketplace.store';
import type {
  CertificateDto,
  Paginated,
  PortfolioProjectDto,
  ProviderCardDto,
  ProviderProfileDto,
  ProviderSearchFilters,
  ReviewDto,
  ServiceCategoryDto,
  ServiceDto,
} from './marketplace.types';

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
    displayName: 'Sipho Ndlovu — ProPlumb',
    bio: 'PIRB-registered plumber doing leaks, geysers and drains across Joburg North.',
    experienceYears: 9,
    photo: 'profiles/professional-1.jpg',
    verificationStatus: 'VERIFIED',
    ratingAvg: 4.8,
    ratingCount: 64,
    serviceIds: ['1', '2', '3'],
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
    areas: [{ areaName: 'Southern Suburbs', city: 'Cape Town', province: 'Western Cape' }],
    portfolio: [],
    certificates: [],
    reviews: [],
  },
];

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
  };
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

export class MemoryMarketplaceStore implements MarketplaceStore {
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
      ...PROFESSIONALS.map(professionalCard),
      ...BUSINESSES.map(businessCard),
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
          ? PROFESSIONALS.find((p) => `professional-${p.id}` === card.id)
          : BUSINESSES.find((b) => `business-${b.id}` === card.id);
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
    const professional = PROFESSIONALS.find((p) => `professional-${p.id}` === providerId);
    if (professional) {
      return { ...professionalCard(professional), bio: professional.bio };
    }
    const business = BUSINESSES.find((b) => `business-${b.id}` === providerId);
    if (business) {
      return { ...businessCard(business), bio: business.description };
    }
    return null;
  }

  async getProviderPortfolio(providerId: string): Promise<PortfolioProjectDto[]> {
    const professional = PROFESSIONALS.find((p) => `professional-${p.id}` === providerId);
    if (professional) return professional.portfolio;
    const business = BUSINESSES.find((b) => `business-${b.id}` === providerId);
    return business?.portfolio ?? [];
  }

  async getProviderCertificates(providerId: string): Promise<CertificateDto[]> {
    const professional = PROFESSIONALS.find((p) => `professional-${p.id}` === providerId);
    if (professional) return professional.certificates;
    const business = BUSINESSES.find((b) => `business-${b.id}` === providerId);
    return business?.certificates ?? [];
  }

  async getProviderReviews(providerId: string, page: number, pageSize: number): Promise<Paginated<ReviewDto>> {
    const professional = PROFESSIONALS.find((p) => `professional-${p.id}` === providerId);
    const business = professional ? null : BUSINESSES.find((b) => `business-${b.id}` === providerId);
    const all = professional?.reviews ?? business?.reviews ?? [];
    const start = (page - 1) * pageSize;
    return { items: all.slice(start, start + pageSize), total: all.length, page, pageSize };
  }
}
