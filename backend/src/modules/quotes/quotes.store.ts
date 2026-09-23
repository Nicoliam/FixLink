/**
 * FixLink Stage 6C — quotes data-access contract.
 *
 * The MySQL implementation serves production (transactional quote creation
 * + REQUESTED → QUOTED transition); the memory implementation serves
 * automated tests with the same rules. Provider identity resolution lives
 * here because it is persistence-specific: production reads
 * `professional_profiles` / `business_members`, tests use explicit links.
 *
 * Stage 6D adds `acceptQuote`: the transactional customer acceptance
 * (SUBMITTED → ACCEPTED, QUOTED → ACCEPTED with agreed amount, competing
 * quotes declined, history entry). No schema change was required — the
 * existing `quotes.status` ENUM, `jobs.agreed_amount`/`currency` and
 * `job_status_history` columns already support it.
 *
 * Stage 6E adds `scheduleJob` (ACCEPTED → SCHEDULED with `scheduled_at`)
 * and `startJob` (SCHEDULED → IN_PROGRESS). Again no schema change: the
 * existing `jobs.status` ENUM, `jobs.scheduled_at` and
 * `job_status_history` columns already support both transitions.
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

/** The job is not in a state that allows acceptance (must be QUOTED). */
export class JobNotAcceptableError extends Error {
  constructor(message = 'This job cannot accept a quote in its current state.') {
    super(message);
    this.name = 'JobNotAcceptableError';
  }
}

/** The quote is not eligible (withdrawn, declined, expired or draft). */
export class QuoteNotEligibleError extends Error {
  constructor(message = 'This quote can no longer be accepted.') {
    super(message);
    this.name = 'QuoteNotEligibleError';
  }
}

/** The quote was already accepted — acceptance is idempotent-safe via 409. */
export class QuoteAlreadyAcceptedError extends QuoteConflictError {
  constructor(message = 'This quote has already been accepted.') {
    super(message);
    this.name = 'QuoteAlreadyAcceptedError';
  }
}

/** The job is not in a state that allows scheduling (must be ACCEPTED with an accepted quote). */
export class JobNotSchedulableError extends Error {
  constructor(message = 'This job cannot be scheduled in its current state.') {
    super(message);
    this.name = 'JobNotSchedulableError';
  }
}

/** The job is not in a state that allows starting (must be SCHEDULED). */
export class JobNotStartableError extends Error {
  constructor(message = 'This job cannot be started in its current state.') {
    super(message);
    this.name = 'JobNotStartableError';
  }
}

export type ProviderInboxStatus = 'REQUESTED' | 'QUOTED' | 'ACCEPTED' | 'SCHEDULED' | 'IN_PROGRESS';

export interface ProviderRequestFilter {
  professionalIds: string[];
  businessIds: string[];
  /** Defaults to the actionable inbox set when empty (see INBOX_STATUSES in the service). */
  statuses: ProviderInboxStatus[];
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

export interface AcceptQuotePersistInput {
  /** Live job row (re-read under lock by the store); ownership checked by the service. */
  jobId: string;
  quoteId: string;
  /** Authenticated customer user id — recorded in `job_status_history.changed_by`. */
  acceptedBy: string;
}

export interface AcceptQuoteResult {
  quote: QuoteDto;
  /** Competing quotes on the job that were retired (now DECLINED). */
  retiredQuoteIds: string[];
}

export interface ScheduleJobPersistInput {
  /** Live job row (re-read under lock by the store); ownership checked by the service. */
  jobId: string;
  /** Normalized future instant (UTC ISO) for `jobs.scheduled_at`. */
  scheduledAtIso: string;
  /** Authenticated provider user id — recorded in `job_status_history.changed_by`. */
  scheduledBy: string;
}

export interface StartJobPersistInput {
  /** Live job row (re-read under lock by the store); ownership checked by the service. */
  jobId: string;
  /** Authenticated provider user id — recorded in `job_status_history.changed_by`. */
  startedBy: string;
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
  /**
   * Accept a SUBMITTED quote on a QUOTED job, atomically: the quote
   * becomes ACCEPTED, competing active quotes become DECLINED, the job
   * becomes ACCEPTED with the agreed amount recorded, and a
   * `job_status_history` entry is written. Throws
   * JobNotAcceptableError / QuoteNotEligibleError /
   * QuoteAlreadyAcceptedError on rule violations; a failed acceptance
   * leaves every row untouched. The accepted provider needs no extra
   * row: the job's `professional_id`/`business_id` and the creation-time
   * `job_assignments` entry already identify it, and technician
   * assignment belongs to the later business workflow.
   */
  acceptQuote(input: AcceptQuotePersistInput): Promise<AcceptQuoteResult>;
  /**
   * Schedule an ACCEPTED job that has an accepted quote, atomically: the
   * job becomes SCHEDULED with `scheduled_at` recorded and a
   * `job_status_history` entry (`ACCEPTED → SCHEDULED`, reason
   * `Provider scheduled job`) is written. Throws JobNotSchedulableError
   * on rule violations (wrong state, no accepted quote); a failed
   * scheduling leaves the job ACCEPTED with no history entry.
   */
  scheduleJob(input: ScheduleJobPersistInput): Promise<void>;
  /**
   * Start a SCHEDULED job, atomically: the job becomes IN_PROGRESS with a
   * `job_status_history` entry (`SCHEDULED → IN_PROGRESS`, reason
   * `Provider started job`). Throws JobNotStartableError on rule
   * violations; a failed start leaves the job SCHEDULED.
   */
  startJob(input: StartJobPersistInput): Promise<void>;
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
