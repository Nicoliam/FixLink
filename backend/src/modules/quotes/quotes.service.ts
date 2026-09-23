/**
 * FixLink Stage 6C — provider request + quote service.
 *
 * Owns the provider side of the marketplace flow: inbox, request detail
 * and quote submission. Provider identity is always derived server-side —
 * the professional profile (`professional_profiles.user_id`) or the
 * businesses the user owns / manages (`business_profiles.owner_user_id`,
 * `business_members`) — never from request parameters. TECHNICIANS are
 * never marketplace providers; CUSTOMERs and ADMINs have no quoting
 * identity in this stage.
 */
import type { UserRepository } from '../users/user.repository';
import type { JobsStore } from '../jobs/jobs.store';
import type { JobDto } from '../jobs/jobs.types';
import type { QuotesStore } from './quotes.store';
import { JobNotQuoteableError, QuoteConflictError } from './quotes.store';
import type { JobWithQuotes, ProviderRequestDto, QuoteDto } from './quotes.types';
import { validateCreateQuote } from './quotes.validation';

export interface ServiceResult<T> {
  status: number;
  code?: string;
  message?: string;
  data?: T;
}

function fail<T>(status: number, code: string, message: string): ServiceResult<T> {
  return { status, code, message };
}

const PROVIDER_ROLES = ['PROFESSIONAL', 'BUSINESS_OWNER', 'BUSINESS_MANAGER'];
const INBOX_STATUSES = ['REQUESTED', 'QUOTED'] as const;
type InboxStatus = (typeof INBOX_STATUSES)[number];

interface ProviderIdentity {
  professionalIds: string[];
  businessIds: string[];
}

function readPage(value: unknown, fallback: number, max: number): number | null {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const num = Number(String(value).trim());
  if (!Number.isInteger(num) || num < 1 || num > max) return null;
  return num;
}

function parseStatusFilter(value: unknown): { statuses: InboxStatus[] } | null {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { statuses: [...INBOX_STATUSES] };
  }
  const parts = String(value)
    .split(',')
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
  if (parts.length === 0 || !parts.every((part) => (INBOX_STATUSES as readonly string[]).includes(part))) {
    return null;
  }
  return { statuses: [...new Set(parts)] as InboxStatus[] };
}

export class QuotesService {
  constructor(
    private readonly jobs: JobsStore,
    private readonly quotes: QuotesStore,
    private readonly users: UserRepository,
  ) {}

  /** Resolve the marketplace identities a user may act for, or null when the role has none. */
  private async resolveIdentity(authUserId: string): Promise<{ identity: ProviderIdentity } | { forbidden: string }> {
    const roles = await this.users.getRoles(authUserId);
    if (!roles.some((role) => PROVIDER_ROLES.includes(role))) {
      if (roles.includes('CUSTOMER')) return { forbidden: 'Only service providers can view marketplace requests.' };
      if (roles.includes('TECHNICIAN')) return { forbidden: 'Technicians cannot access marketplace requests.' };
      return { forbidden: 'Your account cannot access marketplace requests.' };
    }
    const identity: ProviderIdentity = { professionalIds: [], businessIds: [] };
    if (roles.includes('PROFESSIONAL')) {
      const professional = await this.quotes.findProfessionalProfileByUserId(authUserId);
      if (professional) identity.professionalIds.push(professional.id);
    }
    if (roles.includes('BUSINESS_OWNER') || roles.includes('BUSINESS_MANAGER')) {
      const businesses = await this.quotes.findBusinessIdsForUser(authUserId);
      identity.businessIds.push(...businesses.map((entry) => entry.businessId));
    }
    return { identity };
  }

  private isAddressedTo(job: JobDto, identity: ProviderIdentity): boolean {
    const numeric = job.provider.id.split('-')[1] ?? '';
    return job.provider.providerType === 'professional'
      ? identity.professionalIds.includes(numeric)
      : identity.businessIds.includes(numeric);
  }

  async listProviderRequests(
    authUserId: string,
    query: Record<string, unknown>,
  ): Promise<ServiceResult<{ items: ProviderRequestDto[]; total: number; page: number; pageSize: number }>> {
    const resolved = await this.resolveIdentity(authUserId);
    if ('forbidden' in resolved) return fail(403, 'FORBIDDEN_ROLE', resolved.forbidden);
    const page = readPage(query['page'], 1, 1000);
    const pageSize = readPage(query['pageSize'] ?? query['page_size'], 20, 50);
    const statuses = parseStatusFilter(query['status']);
    if (page === null || pageSize === null || statuses === null) {
      return fail(422, 'VALIDATION_ERROR', 'Invalid pagination or status. Use page 1–1000, pageSize 1–50, status REQUESTED or QUOTED.');
    }
    const result = await this.quotes.listProviderRequests({
      professionalIds: resolved.identity.professionalIds,
      businessIds: resolved.identity.businessIds,
      statuses: statuses.statuses,
      page,
      pageSize,
    });
    return { status: 200, data: { ...result, page, pageSize } };
  }

  async getProviderRequest(authUserId: string, requestId: string): Promise<ServiceResult<ProviderRequestDto>> {
    const resolved = await this.resolveIdentity(authUserId);
    if ('forbidden' in resolved) return fail(403, 'FORBIDDEN_ROLE', resolved.forbidden);
    if (!/^[1-9][0-9]*$/.test(requestId.trim())) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid request id.');
    }
    const job = await this.jobs.getJobById(requestId.trim());
    // Addressed-to is part of existence: another provider's request reads
    // as 404 so request ids cannot be probed across providers.
    if (!job || job.source !== 'MARKETPLACE' || !this.isAddressedTo(job, resolved.identity)) {
      return fail(404, 'NOT_FOUND', 'Request not found.');
    }
    return { status: 200, data: await this.toProviderRequest(job) };
  }

  async createQuote(authUserId: string, jobId: string, body: unknown): Promise<ServiceResult<QuoteDto>> {
    const resolved = await this.resolveIdentity(authUserId);
    if ('forbidden' in resolved) return fail(403, 'FORBIDDEN_ROLE', resolved.forbidden);
    if (!/^[1-9][0-9]*$/.test(jobId.trim())) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    }
    const { input, error } = validateCreateQuote(body);
    if (!input || error) {
      const failure = error ?? { status: 422, code: 'VALIDATION_ERROR', message: 'Invalid quote.' };
      return fail(failure.status, failure.code, failure.message);
    }
    const job = await this.jobs.getJobById(jobId.trim());
    if (!job || job.source !== 'MARKETPLACE' || !this.isAddressedTo(job, resolved.identity)) {
      return fail(404, 'NOT_FOUND', 'Job not found.');
    }
    const numeric = job.provider.id.split('-')[1] as string;
    try {
      const quote = await this.quotes.createQuote({
        job,
        providerType: job.provider.providerType,
        providerNumericId: numeric,
        providerName: job.provider.name,
        input,
        createdBy: authUserId,
      });
      return { status: 201, data: quote };
    } catch (err) {
      if (err instanceof QuoteConflictError) {
        return fail(409, 'CONFLICT', err.message);
      }
      if (err instanceof JobNotQuoteableError) {
        return fail(422, 'VALIDATION_ERROR', err.message);
      }
      throw err;
    }
  }

  async listJobQuotes(authUserId: string, jobId: string): Promise<ServiceResult<{ items: QuoteDto[]; total: number }>> {
    if (!/^[1-9][0-9]*$/.test(jobId.trim())) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    }
    const authz = await this.authorizeJobQuotes(authUserId, jobId.trim());
    if (!authz.job) return fail(authz.status, authz.code, authz.message);
    const items = await this.quotes.listQuotesByJobId(jobId.trim());
    return { status: 200, data: { items, total: items.length } };
  }

  async getQuote(authUserId: string, quoteId: string): Promise<ServiceResult<QuoteDto>> {
    if (!/^[1-9][0-9]*$/.test(quoteId.trim())) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid quote id.');
    }
    const quote = await this.quotes.getQuoteById(quoteId.trim());
    if (!quote) return fail(404, 'NOT_FOUND', 'Quote not found.');
    const authz = await this.authorizeJobQuotes(authUserId, quote.jobId);
    if (!authz.job) return fail(authz.status, authz.code, authz.message);
    return { status: 200, data: quote };
  }

  /** Quotes embedded in the owning customer's job detail. */
  async getCustomerJobWithQuotes(authUserId: string, job: JobDto): Promise<JobWithQuotes> {
    void authUserId;
    const quotes = await this.quotes.listQuotesByJobId(job.id);
    return { ...job, quotes };
  }

  private async authorizeJobQuotes(
    authUserId: string,
    jobId: string,
  ): Promise<{ job: JobDto } | { job: null; status: number; code: string; message: string }> {
    const roles = await this.users.getRoles(authUserId);
    const job = await this.jobs.getJobById(jobId);
    if (!job || job.source !== 'MARKETPLACE') {
      return { job: null, status: 404, code: 'NOT_FOUND', message: 'Job not found.' };
    }
    if (roles.includes('CUSTOMER')) {
      const customer = await this.jobs.findCustomerProfileByUserId(authUserId);
      if (customer && job.customerId === customer.id) return { job };
      return { job: null, status: 404, code: 'NOT_FOUND', message: 'Job not found.' };
    }
    if (roles.some((role) => PROVIDER_ROLES.includes(role))) {
      const resolved = await this.resolveIdentity(authUserId);
      if (!('forbidden' in resolved) && this.isAddressedTo(job, resolved.identity)) return { job };
      return { job: null, status: 404, code: 'NOT_FOUND', message: 'Job not found.' };
    }
    return { job: null, status: 403, code: 'FORBIDDEN_ROLE', message: 'Your account cannot view quotes.' };
  }

  private async toProviderRequest(job: JobDto): Promise<ProviderRequestDto> {
    const [displayName, quotes] = await Promise.all([
      this.quotes.findCustomerDisplayName(job.customerId),
      this.quotes.listQuotesByJobId(job.id),
    ]);
    return {
      id: job.id,
      reference: job.reference,
      source: job.source,
      status: job.status,
      provider: job.provider,
      service: job.service,
      description: job.description,
      location: job.location,
      city: job.city,
      province: job.province,
      preferredDate: job.preferredDate,
      scheduledAt: job.scheduledAt,
      createdAt: job.createdAt,
      customer: { displayName },
      quotes,
    };
  }
}
