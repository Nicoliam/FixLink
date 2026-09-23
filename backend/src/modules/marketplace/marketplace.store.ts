/**
 * FixLink Stage 6A — marketplace data-access contract.
 *
 * The MySQL implementation serves production; the memory implementation
 * serves automated tests (no database required) and mirrors the seeder
 * fixtures. Controllers depend only on this interface.
 */
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

export interface MarketplaceStore {
  listCategories(activeOnly: boolean): Promise<ServiceCategoryDto[]>;
  getCategoryById(id: string): Promise<ServiceCategoryDto | null>;
  listServices(activeOnly: boolean): Promise<ServiceDto[]>;
  getServiceById(id: string): Promise<ServiceDto | null>;
  searchProviders(filters: ProviderSearchFilters): Promise<Paginated<ProviderCardDto>>;
  getProviderById(providerId: string): Promise<ProviderProfileDto | null>;
  getProviderPortfolio(providerId: string): Promise<PortfolioProjectDto[]>;
  getProviderCertificates(providerId: string): Promise<CertificateDto[]>;
  getProviderReviews(providerId: string, page: number, pageSize: number): Promise<Paginated<ReviewDto>>;
}

const PROVIDER_ID_PATTERN = /^(professional|business)-([1-9][0-9]*)$/;

export interface ParsedProviderId {
  providerType: 'professional' | 'business';
  numericId: string;
}

/** Parse an opaque marketplace provider id; null when malformed. */
export function parseProviderId(raw: unknown): ParsedProviderId | null {
  if (typeof raw !== 'string') return null;
  const match = PROVIDER_ID_PATTERN.exec(raw.trim());
  if (!match) return null;
  return { providerType: match[1] as 'professional' | 'business', numericId: match[2] as string };
}

/** Numeric catalogue id path param (`/services/:id`, `/categories/:id`). */
export function parseCatalogueId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return /^[1-9][0-9]*$/.test(trimmed) ? trimmed : null;
}

const MAX_TEXT_PARAM = 128;

type TextParam = { ok: true; value: string | null } | { ok: false };

function cleanTextParam(value: unknown): TextParam {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  const trimmed = value.trim();
  if (trimmed === '') return { ok: true, value: null };
  if (trimmed.length > MAX_TEXT_PARAM) return { ok: false };
  return { ok: true, value: trimmed };
}

export interface ParsedSearchQuery {
  filters: ProviderSearchFilters | null;
  error: string | null;
}

/**
 * Validate and normalise provider search query parameters.
 * Unknown parameters are rejected so typos fail loudly instead of being
 * silently ignored (e.g. `?verfied=true` must not pretend to filter).
 */
export function parseSearchQuery(query: Record<string, unknown>): ParsedSearchQuery {
  const allowed = new Set([
    'service',
    'category',
    'location',
    'providerType',
    'provider_type',
    'verified',
    'verifiedOnly',
    'verified_only',
    'q',
    'query',
    'page',
    'pageSize',
    'page_size',
  ]);
  for (const key of Object.keys(query)) {
    if (!allowed.has(key)) {
      return { filters: null, error: `Unsupported search parameter: "${key}".` };
    }
  }

  const get = (names: string[]): unknown => {
    for (const name of names) {
      if (query[name] !== undefined) return query[name];
    }
    return undefined;
  };

  const service = cleanTextParam(get(['service']));
  const category = cleanTextParam(get(['category']));
  const location = cleanTextParam(get(['location']));
  const textQuery = cleanTextParam(get(['q', 'query']));
  if (!service.ok) return { filters: null, error: 'Invalid "service" parameter.' };
  if (!category.ok) return { filters: null, error: 'Invalid "category" parameter.' };
  if (!location.ok) return { filters: null, error: 'Invalid "location" parameter.' };
  if (!textQuery.ok) return { filters: null, error: 'Invalid "q" parameter.' };

  const rawType = get(['providerType', 'provider_type']);
  let providerType: ProviderSearchFilters['providerType'] = null;
  if (rawType !== undefined && rawType !== null && String(rawType).trim() !== '') {
    const normalised = String(rawType).trim().toLowerCase();
    if (normalised === 'professional' || normalised === 'individual') providerType = 'professional';
    else if (normalised === 'business') providerType = 'business';
    else return { filters: null, error: 'Invalid "providerType" parameter. Use "professional" or "business".' };
  }

  const rawVerified = get(['verified', 'verifiedOnly', 'verified_only']);
  let verifiedOnly = false;
  if (rawVerified !== undefined && rawVerified !== null && String(rawVerified).trim() !== '') {
    const normalised = String(rawVerified).trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalised)) verifiedOnly = true;
    else if (['false', '0', 'no'].includes(normalised)) verifiedOnly = false;
    else return { filters: null, error: 'Invalid "verified" parameter. Use "true" or "false".' };
  }

  const parsePage = (raw: unknown, fallback: number, max: number, label: string): { value: number } | { error: string } => {
    if (raw === undefined || raw === null || String(raw).trim() === '') return { value: fallback };
    const num = Number(String(raw).trim());
    if (!Number.isInteger(num) || num < 1 || num > max) {
      return { error: `Invalid "${label}" parameter. Use an integer between 1 and ${max}.` };
    }
    return { value: num };
  };

  const page = parsePage(get(['page']), 1, 1000, 'page');
  if ('error' in page) return { filters: null, error: page.error };
  const pageSize = parsePage(get(['pageSize', 'page_size']), 20, 50, 'pageSize');
  if ('error' in pageSize) return { filters: null, error: pageSize.error };

  return {
    filters: {
      service: service.value,
      category: category.value,
      location: location.value,
      providerType,
      verifiedOnly,
      query: textQuery.value,
      page: page.value,
      pageSize: pageSize.value,
    },
    error: null,
  };
}
