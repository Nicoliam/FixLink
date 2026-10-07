/**
 * Fixlynk Stage 6C — provider request + quote service.
 * Stage 6D adds customer quote acceptance.
 *
 * Owns the provider side of the marketplace flow: inbox, request detail
 * and quote submission — plus the customer side of acceptance (the
 * owning CUSTOMER accepting a SUBMITTED quote on a QUOTED job).
 * Provider identity is always derived server-side —
 * the professional profile (`professional_profiles.user_id`) or the
 * businesses the user owns / manages (`business_profiles.owner_user_id`,
 * `business_members`) — never from request parameters. TECHNICIANS are
 * never marketplace providers; CUSTOMERs and ADMINs have no quoting
 * identity in this stage.
 */
import type { UserRepository } from '../users/user.repository';
import type { JobsStore } from '../jobs/jobs.store';
import type { JobDto } from '../jobs/jobs.types';
import type { MarketplaceStore } from '../marketplace/marketplace.store';
import type { ProviderRef } from '../marketplace/marketplace.types';
import type { NotificationService } from '../notifications/notifications.service';
import { anyAreaMatchesLocation } from '../../utils/service-area-match';
import type { QuotesStore } from './quotes.store';
import {
  JobNotAcceptableError,
  JobNotQuoteableError,
  JobNotSchedulableError,
  JobNotStartableError,
  MAX_QUOTES_PER_OPEN_JOB,
  QuoteAlreadyAcceptedError,
  QuoteConflictError,
  QuoteLimitReachedError,
  QuoteNotEligibleError,
} from './quotes.store';
import type { JobWithQuotes, ProviderRequestDto, QuoteDto } from './quotes.types';
import { validateCreateQuote } from './quotes.validation';
import { validateSchedule } from './schedule.validation';

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
/**
 * Stage 6E — the inbox covers every status a provider can act on or
 * monitor: quoting (REQUESTED/QUOTED), scheduling (ACCEPTED), starting
 * (SCHEDULED) and active work (IN_PROGRESS). Terminal states (COMPLETED,
 * CONFIRMED, CLOSED, CANCELLED, DISPUTED) are never inbox states.
 */
const INBOX_STATUSES = ['REQUESTED', 'QUOTED', 'ACCEPTED', 'SCHEDULED', 'IN_PROGRESS'] as const;
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
    /**
     * Stage 8 — central notification delivery (in-app only). Optional
     * so pre-8 constructions keep compiling. Every emission runs
     * AFTER the state transition commits and is best-effort: delivery
     * failures never roll back the quote/schedule/start outcome.
     */
    private readonly notify?: NotificationService,
    /**
     * Step 14 — the caller's own category buckets and service areas, for
     * open-request matching. Optional so pre-14 constructions keep compiling;
     * without it the board is simply empty, which is the honest answer for a
     * provider whose matching profile cannot be read.
     */
    private readonly marketplace?: MarketplaceStore,
  ) {}

  /**
   * Stage 8 helpers — all recipients resolve server-side (provider
   * directory, customer profile owner); the actor is excluded where
   * the actor already knows the outcome. Messages carry only service,
   * reference, amount and schedule facts already visible to each
   * party on the job — never private contact or verification data.
   */
  private async customerUserId(job: JobDto): Promise<string | null> {
    try {
      return await this.jobs.findUserIdByCustomerId(job.customerId);
    } catch {
      return null;
    }
  }

  /**
   * Provider recipients for a job event.
   *
   * Step 14: an OPEN job has no provider, and the store writes the winner
   * onto the job at acceptance — so every call site here runs on a refreshed
   * job whose `provider` is already set. The null branch is a guard for a
   * caller that forgot to refresh: an open request has nobody to notify.
   */
  private async providerUserIds(job: JobDto, excludeUserId?: string): Promise<string[]> {
    const addressee = job.provider;
    if (!addressee) return [];
    try {
      const numeric = addressee.id.split('-')[1] ?? '';
      const userIds = await this.quotes.findUserIdsForProvider(addressee.providerType, numeric);
      return excludeUserId ? userIds.filter((id) => id !== excludeUserId) : userIds;
    } catch {
      return [];
    }
  }

  private async emit(
    userIds: string[],
    event: { type: 'QUOTE_RECEIVED' | 'QUOTE_ACCEPTED' | 'JOB_SCHEDULED' | 'JOB_STARTED'; title: string; message: string; jobId: string },
  ): Promise<void> {
    if (!this.notify || userIds.length === 0) return;
    try {
      await this.notify.createForUsers(userIds, {
        type: event.type,
        title: event.title,
        message: event.message,
        referenceType: 'JOB',
        referenceId: event.jobId,
      });
    } catch {
      // Best-effort — the committed transition stands.
    }
  }

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
    const addressee = job.provider;
    if (!addressee) return false;
    const numeric = addressee.id.split('-')[1] ?? '';
    return addressee.providerType === 'professional'
      ? identity.professionalIds.includes(numeric)
      : identity.businessIds.includes(numeric);
  }

  /** Every provider reference this identity may act as. */
  private providerRefs(identity: ProviderIdentity): ProviderRef[] {
    return [
      ...identity.professionalIds.map((numericId) => ({ providerType: 'professional' as const, numericId })),
      ...identity.businessIds.map((numericId) => ({ providerType: 'business' as const, numericId })),
    ];
  }

  /** Has this identity got a live quote on this job? Quoting is the access grant. */
  private async hasQuote(jobId: string, identity: ProviderIdentity): Promise<boolean> {
    const refs = this.providerRefs(identity);
    if (refs.length === 0) return false;
    try {
      const results = await Promise.all(
        refs.map((ref) => this.quotes.hasQuoteFromProvider(jobId, ref.providerType, ref.numericId)),
      );
      return results.some(Boolean);
    } catch {
      return false;
    }
  }

  /**
   * Step 14 — the open-request rule.
   *
   * A provider may see and quote an open request only when they match it on
   * BOTH conditions:
   *
   *   category — one of their offerings or catalogue links sits in the job's
   *              platform category bucket, and
   *   area     — one of their service areas matches the request location.
   *
   * Both are read from the provider's own stored profile. Nothing in this
   * decision comes from the request, so a client cannot widen its own match
   * set: there is no accepted `category`, `area` or `radius` parameter
   * anywhere on these endpoints.
   *
   * An identity with several provider profiles (a professional who also owns
   * a business) matches if ANY of them matches. Refusing because one
   * profile fails would make the rule depend on which profile happened to be
   * checked first.
   */
  private async canQuoteOpenRequest(job: JobDto, identity: ProviderIdentity): Promise<boolean> {
    if (!this.marketplace) return false;
    const refs = this.providerRefs(identity);
    if (refs.length === 0) return false;
    try {
      const profiles = await Promise.all(refs.map((ref) => this.marketplace?.getProviderMatchProfile(ref)));
      return profiles.some(
        (profile) =>
          profile !== undefined &&
          job.service.categoryId !== '' &&
          profile.categoryIds.includes(job.service.categoryId) &&
          anyAreaMatchesLocation(profile.serviceAreas, job.location),
      );
    } catch {
      // A matcher that cannot be read must fail closed. Showing a request to
      // everyone is the one outcome that cannot be undone.
      return false;
    }
  }

  /** Addressed to this identity, or an open request they may see. */
  private async canViewRequest(job: JobDto, identity: ProviderIdentity): Promise<boolean> {
    if (this.isAddressedTo(job, identity)) return true;
    if (job.provider !== null) return false;
    if (await this.hasQuote(job.id, identity)) return true;
    return this.canQuoteOpenRequest(job, identity);
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
      return fail(
        422,
        'VALIDATION_ERROR',
        'Invalid pagination or status. Use page 1-1000, pageSize 1-50, status REQUESTED, QUOTED, ACCEPTED, SCHEDULED or IN_PROGRESS.',
      );
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
    // Addressed-to (or an open request they may see / have quoted) is part of
    // existence: another provider's request reads as 404 so request ids cannot
    // be probed across providers.
    if (!job || job.source !== 'MARKETPLACE' || !(await this.canViewRequest(job, resolved.identity))) {
      return fail(404, 'NOT_FOUND', 'Request not found.');
    }
    return { status: 200, data: await this.toProviderRequest(job, resolved.identity) };
  }

  /**
   * Step 14 — open requests this provider may quote, newest first.
   *
   * Three filters are applied before a job is shown:
   *
   *   1. category AND area, from the provider's own profile (fail-closed)
   *   2. not already quoted by this provider — those are in the inbox
   *   3. fewer than MAX_QUOTES_PER_OPEN_JOB active quotes, because a full
   *      request can only answer with a 409
   *
   * A provider with no published service areas, or no offerings in any
   * category, gets `200` with an empty list. That is an answer, not an error:
   * the frontend turns it into "publish your areas to see matching work".
   */
  async listOpenRequests(
    authUserId: string,
    query: Record<string, unknown>,
  ): Promise<ServiceResult<{ items: ProviderRequestDto[]; total: number; page: number; pageSize: number }>> {
    const resolved = await this.resolveIdentity(authUserId);
    if ('forbidden' in resolved) return fail(403, 'FORBIDDEN_ROLE', resolved.forbidden);
    const page = readPage(query['page'], 1, 1000);
    const pageSize = readPage(query['pageSize'] ?? query['page_size'], 20, 50);
    if (page === null || pageSize === null) {
      return fail(422, 'VALIDATION_ERROR', 'Invalid pagination. Use page 1-1000 and pageSize 1-50.');
    }
    if (!this.marketplace) {
      return { status: 200, data: { items: [], total: 0, page, pageSize } };
    }
    const refs = this.providerRefs(resolved.identity);
    if (refs.length === 0) {
      return { status: 200, data: { items: [], total: 0, page, pageSize } };
    }

    // Category ids first: an empty set matches nothing, and that short-circuit
    // avoids the job scan entirely for a provider who offers nothing.
    const profiles = await Promise.all(refs.map((ref) => this.marketplace?.getProviderMatchProfile(ref) ?? null));
    const categoryIds = [...new Set(profiles.flatMap((profile) => profile?.categoryIds ?? []))];
    const areas = profiles.flatMap((profile) => profile?.serviceAreas ?? []);
    if (categoryIds.length === 0 || areas.length === 0) {
      return { status: 200, data: { items: [], total: 0, page, pageSize } };
    }

    // Jobs this provider already quoted go to the inbox, not the board.
    const quoted = new Set<string>();
    for (const ref of refs) {
      const owned = await this.quotes.listJobIdsQuotedBy(ref.providerType, ref.numericId);
      for (const jobId of owned) quoted.add(jobId);
    }

    const candidates = await this.jobs.listOpenJobs({
      categoryIds,
      quotedJobIds: [...quoted],
      maxQuotes: MAX_QUOTES_PER_OPEN_JOB,
      statuses: ['REQUESTED', 'QUOTED'],
    });
    const matching = candidates.filter((job) => anyAreaMatchesLocation(areas, job.location));
    const start = (page - 1) * pageSize;
    const window = matching.slice(start, start + pageSize);
    const items: ProviderRequestDto[] = [];
    for (const job of window) {
      items.push(await this.toProviderRequest(job, resolved.identity));
    }
    return { status: 200, data: { items, total: matching.length, page, pageSize } };
  }

  /**
   * Step 14 — one open request this provider may quote.
   *
   * Matching IS the access grant, so a non-matching open request reads as 404
   * rather than 403: otherwise a professional could walk the id space and
   * learn which requests exist in their trade and where.
   */
  async getOpenRequest(authUserId: string, requestId: string): Promise<ServiceResult<ProviderRequestDto>> {
    const resolved = await this.resolveIdentity(authUserId);
    if ('forbidden' in resolved) return fail(403, 'FORBIDDEN_ROLE', resolved.forbidden);
    if (!/^[1-9][0-9]*$/.test(requestId.trim())) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid request id.');
    }
    const job = await this.jobs.getJobById(requestId.trim());
    if (!job || job.source !== 'MARKETPLACE' || job.provider !== null) {
      return fail(404, 'NOT_FOUND', 'Request not found.');
    }
    if (!(await this.canViewRequest(job, resolved.identity))) {
      return fail(404, 'NOT_FOUND', 'Request not found.');
    }
    return { status: 200, data: await this.toProviderRequest(job, resolved.identity) };
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
    if (!job || job.source !== 'MARKETPLACE' || !(await this.canViewRequest(job, resolved.identity))) {
      return fail(404, 'NOT_FOUND', 'Job not found.');
    }

    // Step 14: an OPEN request is quoted by the provider themselves; an
    // ADDRESSED one only by the provider it names. Getting this wrong would
    // either let anyone claim a named provider's job, or make an open request
    // impossible to quote at all.
    const author =
      job.provider !== null
        ? { providerType: job.provider.providerType, numericId: job.provider.id.split('-')[1] ?? '', name: job.provider.name }
        : await this.authorOf(resolved.identity);
    if (!author || !/^[1-9][0-9]*$/.test(author.numericId)) {
      return fail(404, 'NOT_FOUND', 'Job not found.');
    }
    try {
      const quote = await this.quotes.createQuote({
        job,
        providerType: author.providerType,
        providerNumericId: author.numericId,
        providerName: author.name,
        input,
        createdBy: authUserId,
      });
      const customer = await this.customerUserId(job);
      await this.emit(customer ? [customer] : [], {
        type: 'QUOTE_RECEIVED',
        title: 'New quote received',
        message: `${author.name} quoted ${quote.currency} ${quote.total} for ${job.service.name} (${job.reference}).`,
        jobId: job.id,
      });
      return { status: 201, data: quote };
    } catch (err) {
      if (err instanceof QuoteConflictError) {
        return fail(409, 'CONFLICT', err.message);
      }
      if (err instanceof QuoteLimitReachedError) {
        // 409: the request is open, but the customer's three quotes are in.
        return fail(409, 'CONFLICT', err.message);
      }
      if (err instanceof JobNotQuoteableError) {
        return fail(422, 'VALIDATION_ERROR', err.message);
      }
      throw err;
    }
  }

  /**
   * Which of this identity's profiles is quoting an open request.
   *
   * `canViewRequest` already proved they match on category and area, so this
   * only has to pick which profile to attribute the quote to and supply its
   * public display name (the customer's notification names the professional).
   * A single-profile identity is the common case; with several, the
   * professional profile wins, matching the precedence `resolveIdentity` uses.
   */
  private async authorOf(
    identity: ProviderIdentity,
  ): Promise<{ providerType: ProviderRef['providerType']; numericId: string; name: string } | null> {
    const ref: ProviderRef | null = identity.professionalIds.length > 0
      ? { providerType: 'professional', numericId: identity.professionalIds[0] as string }
      : identity.businessIds.length > 0
        ? { providerType: 'business', numericId: identity.businessIds[0] as string }
        : null;
    if (!ref || !this.marketplace) return null;
    const profile = await this.marketplace.getProviderById(`${ref.providerType}-${ref.numericId}`);
    // An inactive or deleted profile cannot be quoted for. Falling back to the
    // ref would put a name on the quote that the customer could never verify.
    if (!profile) return null;
    return { providerType: ref.providerType, numericId: ref.numericId, name: profile.name };
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

  /**
   * Stage 6D — customer quote acceptance (QUOTED → ACCEPTED).
   *
   * Ownership is derived server-side from the session user id — a
   * `customer_id` in the body would be ignored (no such field is read).
   * Only the CUSTOMER who owns the MARKETPLACE job may accept, and only
   * a SUBMITTED quote on a QUOTED job. Providers, technicians, managers
   * and admins acting outside customer ownership receive 403; other
   * customers' jobs/quotes read as 404 so ids cannot be probed.
   */
  async acceptQuote(
    authUserId: string,
    jobId: string,
    quoteId: string,
  ): Promise<ServiceResult<{ job: JobWithQuotes; quote: QuoteDto }>> {
    if (!/^[1-9][0-9]*$/.test(jobId.trim())) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    }
    if (!/^[1-9][0-9]*$/.test(quoteId.trim())) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid quote id.');
    }
    const roles = await this.users.getRoles(authUserId);
    if (!roles.includes('CUSTOMER')) {
      if (roles.some((role) => PROVIDER_ROLES.includes(role))) {
        return fail(403, 'FORBIDDEN_ROLE', 'Only the customer who owns the job can accept a quote.');
      }
      if (roles.includes('TECHNICIAN')) {
        return fail(403, 'FORBIDDEN_ROLE', 'Technicians cannot accept quotes.');
      }
      return fail(403, 'FORBIDDEN_ROLE', 'Your account cannot accept quotes.');
    }
    const customer = await this.jobs.findCustomerProfileByUserId(authUserId);
    const job = customer ? await this.jobs.getJobById(jobId.trim()) : null;
    // Ownership and MARKETPLACE source are part of existence: another
    // customer's job — or an internal business job — reads as 404.
    if (!job || job.source !== 'MARKETPLACE' || job.customerId !== customer?.id) {
      return fail(404, 'NOT_FOUND', 'Job not found.');
    }
    const quote = await this.quotes.getQuoteById(quoteId.trim());
    // Quote↔job mismatch is part of existence as well: a quote from
    // another job (or another customer) reads as 404, never 403, so
    // quote ids cannot be probed across accounts.
    if (!quote || quote.jobId !== job.id) {
      return fail(404, 'NOT_FOUND', 'Quote not found.');
    }
    try {
      const accepted = await this.quotes.acceptQuote({
        jobId: job.id,
        quoteId: quote.id,
        acceptedBy: authUserId,
      });
      const refreshed = await this.jobs.getJobById(job.id);
      if (!refreshed) return fail(404, 'NOT_FOUND', 'Job not found.');
      await this.emit(await this.providerUserIds(refreshed, authUserId), {
        type: 'QUOTE_ACCEPTED',
        title: 'Quote accepted',
        message: `Your quote for ${refreshed.service.name} (${refreshed.reference}) was accepted.`,
        jobId: refreshed.id,
      });
      return {
        status: 200,
        data: { job: await this.getCustomerJobWithQuotes(authUserId, refreshed), quote: accepted.quote },
      };
    } catch (err) {
      if (err instanceof QuoteAlreadyAcceptedError) {
        return fail(409, 'CONFLICT', err.message);
      }
      if (err instanceof QuoteNotEligibleError) {
        return fail(422, 'VALIDATION_ERROR', err.message);
      }
      if (err instanceof JobNotAcceptableError) {
        // Defensive store-level existence re-check (a lost race after
        // the service checks above); everything else is a state error.
        if (err.message === 'Quote not found.') return fail(404, 'NOT_FOUND', err.message);
        return fail(422, 'VALIDATION_ERROR', err.message);
      }
      throw err;
    }
  }

  /** Quotes embedded in the owning customer's job detail. */
  async getCustomerJobWithQuotes(authUserId: string, job: JobDto): Promise<JobWithQuotes> {
    void authUserId;
    const quotes = await this.quotes.listQuotesByJobId(job.id);
    return { ...job, quotes };
  }

  /**
   * Stage 6E — provider scheduling (ACCEPTED → SCHEDULED).
   *
   * Only the addressed provider (PROFESSIONAL owner, BUSINESS_OWNER or
   * BUSINESS_MANAGER of the job's business) may schedule, and only an
   * ACCEPTED MARKETPLACE job with an accepted quote. The frontend never
   * sends a status — the backend performs the transition. TECHNICIANS and
   * CUSTOMERs have no scheduling identity; another provider's job reads
   * as 404 so ids cannot be probed across providers.
   */
  async scheduleJob(
    authUserId: string,
    jobId: string,
    body: unknown,
  ): Promise<ServiceResult<{ job: JobWithQuotes }>> {
    if (!/^[1-9][0-9]*$/.test(jobId.trim())) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    }
    const resolved = await this.resolveIdentity(authUserId);
    if ('forbidden' in resolved) {
      const roles = await this.users.getRoles(authUserId);
      if (roles.includes('CUSTOMER')) {
        return fail(403, 'FORBIDDEN_ROLE', 'Only service providers can schedule jobs.');
      }
      if (roles.includes('TECHNICIAN')) {
        return fail(403, 'FORBIDDEN_ROLE', 'Technicians cannot schedule marketplace jobs.');
      }
      return fail(403, 'FORBIDDEN_ROLE', resolved.forbidden);
    }
    const job = await this.jobs.getJobById(jobId.trim());
    // Addressed-to is part of existence: another provider's job reads as
    // 404 so job ids cannot be probed across providers.
    if (!job || job.source !== 'MARKETPLACE' || !this.isAddressedTo(job, resolved.identity)) {
      return fail(404, 'NOT_FOUND', 'Job not found.');
    }
    const { scheduledAtIso, error } = validateSchedule(body);
    if (!scheduledAtIso || error) {
      const failure = error ?? { status: 422, code: 'VALIDATION_ERROR', message: 'Invalid schedule.' };
      return fail(failure.status, failure.code, failure.message);
    }
    try {
      await this.quotes.scheduleJob({ jobId: job.id, scheduledAtIso, scheduledBy: authUserId });
      const refreshed = await this.jobs.getJobById(job.id);
      if (!refreshed) return fail(404, 'NOT_FOUND', 'Job not found.');
      const recipients = await this.providerUserIds(refreshed, authUserId);
      const customer = await this.customerUserId(refreshed);
      if (customer) recipients.push(customer);
      await this.emit(recipients, {
        type: 'JOB_SCHEDULED',
        title: 'Job scheduled',
        message: `Job ${refreshed.reference} is scheduled.`,
        jobId: refreshed.id,
      });
      return { status: 200, data: { job: await this.getCustomerJobWithQuotes(authUserId, refreshed) } };
    } catch (err) {
      if (err instanceof JobNotSchedulableError) {
        // Defensive store-level existence re-check (a lost race after
        // the service checks above); everything else is a state error.
        if (err.message === 'Job not found.') return fail(404, 'NOT_FOUND', err.message);
        return fail(422, 'VALIDATION_ERROR', err.message);
      }
      throw err;
    }
  }

  /**
   * Stage 6E — provider start (SCHEDULED → IN_PROGRESS). Same provider
   * authorization as scheduling; TECHNICIANS are excluded in this stage.
   */
  async startJob(authUserId: string, jobId: string): Promise<ServiceResult<{ job: JobWithQuotes }>> {
    if (!/^[1-9][0-9]*$/.test(jobId.trim())) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    }
    const resolved = await this.resolveIdentity(authUserId);
    if ('forbidden' in resolved) {
      const roles = await this.users.getRoles(authUserId);
      if (roles.includes('CUSTOMER')) {
        return fail(403, 'FORBIDDEN_ROLE', 'Only service providers can start jobs.');
      }
      if (roles.includes('TECHNICIAN')) {
        return fail(403, 'FORBIDDEN_ROLE', 'Technicians cannot start marketplace jobs.');
      }
      return fail(403, 'FORBIDDEN_ROLE', resolved.forbidden);
    }
    const job = await this.jobs.getJobById(jobId.trim());
    if (!job || job.source !== 'MARKETPLACE' || !this.isAddressedTo(job, resolved.identity)) {
      return fail(404, 'NOT_FOUND', 'Job not found.');
    }
    try {
      await this.quotes.startJob({ jobId: job.id, startedBy: authUserId });
      const refreshed = await this.jobs.getJobById(job.id);
      if (!refreshed) return fail(404, 'NOT_FOUND', 'Job not found.');
      const recipients = await this.providerUserIds(refreshed, authUserId);
      const customer = await this.customerUserId(refreshed);
      if (customer) recipients.push(customer);
      await this.emit(recipients, {
        type: 'JOB_STARTED',
        title: 'Job started',
        message: `Work started on job ${refreshed.reference}.`,
        jobId: refreshed.id,
      });
      return { status: 200, data: { job: await this.getCustomerJobWithQuotes(authUserId, refreshed) } };
    } catch (err) {
      if (err instanceof JobNotStartableError) {
        if (err.message === 'Job not found.') return fail(404, 'NOT_FOUND', err.message);
        return fail(422, 'VALIDATION_ERROR', err.message);
      }
      throw err;
    }
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

  /**
   * The provider-facing projection of a request.
   *
   * Step 14: `quotes` holds ONLY the viewing provider's own quote. On an
   * addressed request that is the whole set anyway (only the addressed
   * provider may quote), so nothing changes; on an open request it is the
   * difference between "you and two competitors are all quoting R1 200" and
   * "here is your quote". Competing quotes stay invisible to each other and
   * only the customer compares them. The customer-facing projection
   * (`getCustomerJobWithQuotes`) is deliberately unfiltered.
   */
  private async toProviderRequest(job: JobDto, identity: ProviderIdentity): Promise<ProviderRequestDto> {
    const [displayName, allQuotes] = await Promise.all([
      this.quotes.findCustomerDisplayName(job.customerId),
      this.quotes.listQuotesByJobId(job.id),
    ]);
    const refs = this.providerRefs(identity).map((ref) => `${ref.providerType}-${ref.numericId}`);
    const mine = new Set(refs);
    const quotes = allQuotes.filter((quote) => mine.has(quote.provider.id));
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
      completedAt: job.completedAt,
      confirmedAt: job.confirmedAt,
      closedAt: job.closedAt,
      createdAt: job.createdAt,
      customer: { displayName },
      quotes,
    };
  }
}
