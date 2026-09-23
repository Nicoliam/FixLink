/**
 * FixLink Stage 6C — in-memory quotes store for automated tests.
 *
 * Mirrors the MySQL implementation's rules (provider-scoped inbox,
 * MARKETPLACE + REQUESTED gating, SUBMITTED quotes, REQUESTED → QUOTED
 * transition with history, no silent overwrites) without requiring a
 * database. Reads job rows from the shared MemoryJobsStore so customer
 * creation and provider quoting stay consistent in tests.
 *
 * Provider identity has no fixture: tests link users explicitly via
 * `linkProfessionalProfile` / `addBusinessMembership`, mirroring the
 * production `professional_profiles` / `business_members` rows that the
 * MySQL store reads.
 */
import type { JobDto } from '../jobs/jobs.types';
import type { MemoryJobsStore } from '../jobs/memory-jobs.store';
import {
  JobNotQuoteableError,
  QuoteConflictError,
  type CreateQuotePersistInput,
  type ProviderRequestFilter,
  type QuotesStore,
} from './quotes.store';
import type {
  BusinessIdentity,
  ProfessionalIdentity,
  ProviderRequestDto,
  QuoteDto,
  QuoteItemDto,
} from './quotes.types';

function nowIso(): string {
  return new Date().toISOString();
}

function displayNameOf(firstName: string, lastName: string): string {
  const first = firstName.trim() || 'Customer';
  const initial = lastName.trim().charAt(0);
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
}

export class MemoryQuotesStore implements QuotesStore {
  private quoteSeq = 0;
  private itemSeq = 0;
  private readonly quotes = new Map<string, QuoteDto>();
  private readonly professionalByUserId = new Map<string, string>();
  private readonly businessesByUserId = new Map<string, BusinessIdentity[]>();
  /** jobId -> history entries (mirrors job_status_history for assertions). */
  private readonly history: Array<{ jobId: string; previous: string | null; next: string }> = [];

  constructor(private readonly jobs: MemoryJobsStore) {}

  /** Test setup: link a user to a professional fixture (e.g. '1'). */
  linkProfessionalProfile(userId: string, professionalNumericId: string): void {
    this.professionalByUserId.set(userId, professionalNumericId);
  }

  /** Test setup: grant a user OWNER/MANAGER access to a business fixture. */
  addBusinessMembership(userId: string, businessId: string, role: 'OWNER' | 'MANAGER'): void {
    const current = this.businessesByUserId.get(userId) ?? [];
    if (!current.some((entry) => entry.businessId === businessId)) {
      current.push({ businessId, role });
    }
    this.businessesByUserId.set(userId, current);
  }

  async findProfessionalProfileByUserId(userId: string): Promise<ProfessionalIdentity | null> {
    const id = this.professionalByUserId.get(userId);
    return id === undefined ? null : { id };
  }

  async findBusinessIdsForUser(userId: string): Promise<BusinessIdentity[]> {
    return [...(this.businessesByUserId.get(userId) ?? [])];
  }

  async listProviderRequests(filter: ProviderRequestFilter): Promise<{ items: ProviderRequestDto[]; total: number }> {
    const statuses = filter.statuses.length > 0 ? filter.statuses : ['REQUESTED', 'QUOTED'];
    const owned = (await this.jobs.debugAllJobs()).filter(
      (job) =>
        job.source === 'MARKETPLACE' &&
        (statuses as string[]).includes(job.status) &&
        ((job.provider.providerType === 'professional' &&
          filter.professionalIds.includes(job.provider.id.replace('professional-', ''))) ||
          (job.provider.providerType === 'business' &&
            filter.businessIds.includes(job.provider.id.replace('business-', '')))),
    );
    owned.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const start = (filter.page - 1) * filter.pageSize;
    const items: ProviderRequestDto[] = [];
    for (const job of owned.slice(start, start + filter.pageSize)) {
      items.push(await this.toProviderRequest(job));
    }
    return { items, total: owned.length };
  }

  async findCustomerDisplayName(customerId: string): Promise<string> {
    const names = this.jobs.debugCustomerNames(customerId);
    if (!names) return 'Customer';
    return displayNameOf(names.firstName, names.lastName);
  }

  async createQuote(input: CreateQuotePersistInput): Promise<QuoteDto> {
    const live = await this.jobs.getJobById(input.job.id);
    if (!live || live.source !== 'MARKETPLACE') {
      throw new JobNotQuoteableError();
    }
    const expectedProviderId = `${input.providerType}-${input.providerNumericId}`;
    if (live.provider.id !== expectedProviderId) {
      throw new JobNotQuoteableError('This job is not addressed to your provider profile.');
    }
    // Duplicate check before the status check: a second submission from the
    // same provider is always a conflict, even though the job is QUOTED.
    const duplicate = [...this.quotes.values()].some(
      (quote) =>
        quote.jobId === live.id &&
        quote.provider.id === expectedProviderId &&
        (quote.status === 'DRAFT' || quote.status === 'SUBMITTED'),
    );
    if (duplicate) throw new QuoteConflictError();
    if (live.status !== 'REQUESTED') {
      throw new JobNotQuoteableError();
    }
    // All checks passed before any mutation: a failed creation cannot
    // leave the job in an incorrect QUOTED status.
    this.quoteSeq += 1;
    const now = nowIso();
    const items: QuoteItemDto[] = input.input.items.map((item, index) => {
      this.itemSeq += 1;
      return {
        id: String(this.itemSeq),
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: Math.round(item.quantity * item.unitPrice * 100) / 100,
        sortOrder: index,
      };
    });
    const quote: QuoteDto = {
      id: String(this.quoteSeq),
      jobId: live.id,
      provider: { id: expectedProviderId, providerType: input.providerType, name: input.providerName },
      total: input.input.total,
      currency: input.input.currency,
      message: input.input.message,
      status: 'SUBMITTED',
      items,
      submittedAt: now,
      createdAt: now,
    };
    this.quotes.set(quote.id, quote);
    this.jobs.debugSetJobStatus(live.id, 'QUOTED');
    this.history.push({ jobId: live.id, previous: 'REQUESTED', next: 'QUOTED' });
    return quote;
  }

  async listQuotesByJobId(jobId: string): Promise<QuoteDto[]> {
    return [...this.quotes.values()]
      .filter((quote) => quote.jobId === jobId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async getQuoteById(quoteId: string): Promise<QuoteDto | null> {
    return this.quotes.get(quoteId) ?? null;
  }

  /** Test helper: status-history entries written by createQuote. */
  debugHistory(): Array<{ jobId: string; previous: string | null; next: string }> {
    return [...this.history];
  }

  private async toProviderRequest(job: JobDto): Promise<ProviderRequestDto> {
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
      customer: { displayName: await this.findCustomerDisplayName(job.customerId) },
      quotes: await this.listQuotesByJobId(job.id),
    };
  }
}
