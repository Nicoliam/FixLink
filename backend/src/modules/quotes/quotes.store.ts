/**
 * FixLink Stage 6C — quotes data-access contract.
 *
 * The MySQL implementation serves production (transactional quote creation
 * + REQUESTED → QUOTED transition); the memory implementation serves
 * automated tests with the same rules. Provider identity resolution lives
 * here because it is persistence-specific: production reads
 * `professional_profiles` / `business_members`, tests use explicit links.
 */
import type { JobDto } from '../jobs/jobs.types';
import type {
  BusinessIdentity,
  CreateQuoteInput,
  ProfessionalIdentity,
  ProviderRequestDto,
  QuoteDto,
} from './quotes.types';

/** Job exists but is not in a quoteable state (wrong source or status). */
export class JobNotQuoteableError extends Error {
  constructor(message = 'This job can no longer be quoted.') {
    super(message);
    this.name = 'JobNotQuoteableError';
  }
}

/** An active quote from this provider already exists — never overwrite. */
export class QuoteConflictError extends Error {
  constructor(message = 'A quote has already been submitted for this job.') {
    super(message);
    this.name = 'QuoteConflictError';
  }
}

export interface ProviderRequestFilter {
  professionalIds: string[];
  businessIds: string[];
  /** Defaults to REQUESTED + QUOTED when empty. */
  statuses: Array<'REQUESTED' | 'QUOTED'>;
  page: number;
  pageSize: number;
}

export interface CreateQuotePersistInput {
  job: JobDto;
  /** Resolved owner of the quote — must match the job's addressed provider. */
  providerType: 'professional' | 'business';
  providerNumericId: string;
  providerName: string;
  input: CreateQuoteInput;
  createdBy: string;
}

export interface QuotesStore {
  /** Professional profile owned by the user, or null (e.g. never onboarded). */
  findProfessionalProfileByUserId(userId: string): Promise<ProfessionalIdentity | null>;
  /** Businesses the user may act for (owner or manager member). */
  findBusinessIdsForUser(userId: string): Promise<BusinessIdentity[]>;
  /** Marketplace requests addressed to the provider, newest first. */
  listProviderRequests(filter: ProviderRequestFilter): Promise<{ items: ProviderRequestDto[]; total: number }>;
  /** Privacy-limited customer display name (first name + last initial). */
  findCustomerDisplayName(customerId: string): Promise<string>;
  /**
   * Insert the SUBMITTED quote + items and transition the job
   * REQUESTED → QUOTED with a history entry, atomically. Throws
   * JobNotQuoteableError / QuoteConflictError on rule violations; the
   * job stays REQUESTED when creation fails.
   */
  createQuote(input: CreateQuotePersistInput): Promise<QuoteDto>;
  listQuotesByJobId(jobId: string): Promise<QuoteDto[]>;
  getQuoteById(quoteId: string): Promise<QuoteDto | null>;
}

/**
 * Structural subset used by JobsService to embed quotes in the owning
 * customer's job detail without depending on the full QuotesStore.
 */
export interface JobQuotesReader {
  listQuotesByJobId(jobId: string): Promise<QuoteDto[]>;
}
