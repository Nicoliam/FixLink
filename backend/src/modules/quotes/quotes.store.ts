/**
 * Fixlynk Stage 6C — quotes data-access contract.
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
 *
 * Step 14 adds open requests. A MARKETPLACE job may be created with NO
 * provider (see the jobs module); such a job is offerable to every provider
 * matching it on category and service area, and up to
 * MAX_QUOTES_PER_OPEN_JOB of them may quote. Three rules follow, and they are
 * the whole of this change:
 *
 *   1. `createQuote` accepts an unaddressed job from any matching provider,
 *      not just the one it is addressed to. The first quote performs the
 *      existing REQUESTED → QUOTED transition; later ones leave the already
 *      QUOTED status alone.
 *   2. The quote count is checked inside the same locked transaction that
 *      writes the quote, so two simultaneous submissions cannot both pass.
 *   3. Accepting a quote on an unaddressed job WRITES the winner onto the
 *      job. Acceptance is the moment the customer picks a professional, and
 *      it is what turns an open request back into an addressed one — so
 *      schedule, start and execution need no open-request special case.
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

/**
 * Step 14 — the job already holds MAX_QUOTES_PER_OPEN_JOB active quotes.
 *
 * Distinct from QuoteConflictError on purpose: a conflict means *you* already
 * quoted and your earlier quote is being protected, while this means the
 * customer has three offers and is no longer accepting more. Both are 409,
 * but only this one should tell the professional the request is closed to
 * them, and neither should ever mention another provider's identity.
 */
export class QuoteLimitReachedError extends Error {
  constructor(message = 'This request already has the maximum number of quotes.') {
    super(message);
    this.name = 'QuoteLimitReachedError';
  }
}

/**
 * Step 14 — how many professionals may quote one open request.
 *
 * Three is a product decision, not a technical one: enough for the customer
 * to compare real options, few enough that the board stays competitive and
 * nobody's quote is wasted. Once the third lands, the request is closed to
 * further providers and the fourth submitter is told so.
 */
export const MAX_QUOTES_PER_OPEN_JOB = 3;

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
  /**
   * Resolved owner of the quote.
   *
   * Step 14: for an ADDRESSED job this must be the job's own provider. For an
   * OPEN job (`job.provider === null`) it is the quoting provider themselves,
   * and the store checks the open-request rules instead.
   */
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
  /**
   * Stage 8 — reverse lookup for notification recipients: login user
   * ids that may act for a marketplace provider (the professional
   * owner, or the business owner + active owner/manager members).
   * Server-side only — never derived from request parameters.
   */
  findUserIdsForProvider(
    providerType: 'professional' | 'business',
    providerNumericId: string,
  ): Promise<string[]>;
  /**
   * Marketplace requests this provider can act on, newest first.
   *
   * Step 14: two populations. Requests ADDRESSED to the provider, plus OPEN
   * requests they have already quoted — quoting is the access grant, so a
   * provider keeps seeing a request after quoting it even though it was never
   * theirs.
   */
  listProviderRequests(filter: ProviderRequestFilter): Promise<{ items: ProviderRequestDto[]; total: number }>;
  /** Privacy-limited customer display name (first name + last initial). */
  findCustomerDisplayName(customerId: string): Promise<string>;
  /**
   * Step 14 — does this provider hold a quote on this job?
   *
   * The access grant for open requests: matching gets you the board entry,
   * quoting gets you the ongoing inbox entry and the request detail. Used
   * instead of "is it addressed to me", which is meaningless while
   * `professional_id` and `business_id` are both NULL.
   */
  hasQuoteFromProvider(
    jobId: string,
    providerType: 'professional' | 'business',
    providerNumericId: string,
  ): Promise<boolean>;
  /**
   * Step 14 — every job this provider has an active quote on.
   *
   * Used to keep already-quoted requests OFF the open-request board: once a
   * professional has quoted, the request belongs in their inbox where they
   * can track the outcome, not on a board that invites a second submission
   * which would only be refused as a conflict.
   */
  listJobIdsQuotedBy(
    providerType: 'professional' | 'business',
    providerNumericId: string,
  ): Promise<string[]>;
  /**
   * Insert the SUBMITTED quote + items and transition the job
   * REQUESTED → QUOTED with a history entry, atomically. Throws
   * JobNotQuoteableError / QuoteConflictError / QuoteLimitReachedError on rule
   * violations; the job stays REQUESTED when creation fails.
   *
   * Step 14: on an OPEN job the first quote performs the transition and later
   * quotes leave the already-QUOTED status alone (no further history entry),
   * and the 3-quote cap is enforced here under the job lock.
   */
  createQuote(input: CreateQuotePersistInput): Promise<QuoteDto>;
  /**
   * Accept a SUBMITTED quote on a QUOTED job, atomically: the quote
   * becomes ACCEPTED, competing active quotes become DECLINED, the job
   * becomes ACCEPTED with the agreed amount recorded, and a
   * `job_status_history` entry is written. Throws
   * JobNotAcceptableError / QuoteNotEligibleError /
   * QuoteAlreadyAcceptedError on rule violations; a failed acceptance
   * leaves every row untouched. For an ADDRESSED job the accepted provider
   * needs no extra row: the job's `professional_id`/`business_id` and the
   * creation-time `job_assignments` entry already identify it, and
   * technician assignment belongs to the later business workflow.
   *
   * Step 14: for an OPEN job the winner IS written onto the job —
   * `professional_id`/`business_id` from the accepted quote, plus the
   * `job_assignments` row that an open request has no row for. Acceptance is
   * the customer choosing a professional, so from that moment the job is
   * addressed like any other and every downstream module keeps working
   * unchanged.
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
