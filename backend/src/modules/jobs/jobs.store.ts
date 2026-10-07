/**
 * Fixlynk Stage 6B — jobs data-access contract.
 *
 * The MySQL implementation serves production; the memory implementation
 * serves automated tests (no database required). Provider catalogue reads
 * (existence, active status, offered services) come from the existing
 * `MarketplaceStore` — this store owns only job persistence plus the
 * minimal customer-profile lookup/provisioning needed to establish
 * server-side customer ownership.
 */
import type {
  ActiveServiceRef,
  CustomerProfileRef,
  JobDto,
  PersistJobInput,
  PersistJobUpdateInput,
  RequestImagePersistInput,
} from './jobs.types';
import type { JobImageDto } from '../execution/execution.types';

/**
 * Step 15 - why a customer mutation on a job was refused.
 *
 * `NOT_MUTABLE` is the gate, not "not found": the job exists and the caller
 * owns it, but it has been accepted and is therefore a record. The service maps
 * it to 409 CONFLICT so the client can explain the difference, rather than
 * pretending the job vanished. `NOT_FOUND` is only for a row that is absent or
 * already soft-deleted, which the service maps to 404.
 */
export class JobNotMutableError extends Error {
  constructor(
    public readonly reason: 'NOT_MUTABLE' | 'NOT_FOUND' = 'NOT_MUTABLE',
    message = 'This request can no longer be changed because a quote has been accepted.',
  ) {
    super(message);
    this.name = 'JobNotMutableError';
  }
}

/** Why a request photo was refused; the service maps this to a status code. */
export class JobRequestImageRejected extends Error {
  constructor(
    public readonly reason: 'NOT_FOUND' | 'INVALID_STATE' | 'TOO_MANY',
    message: string,
  ) {
    super(message);
    this.name = 'JobRequestImageRejected';
  }
}

export interface CustomerProvision {
  firstName: string;
  lastName: string;
  email: string | null;
}

/**
 * Step 14 — how many category-matching open requests are loaded before the
 * area test runs in the service. Bounds the work one board page load can do;
 * a provider scrolling very far back past this window gets a shorter list
 * rather than a slow response.
 */
export const OPEN_REQUEST_SCAN_LIMIT = 200;

/**
 * Step 14 — which marketplace jobs may still be quoted by a matching provider.
 *
 * An OPEN REQUEST is a `MARKETPLACE` job with `professional_id` AND
 * `business_id` both NULL. It is created when the customer posts without
 * choosing a professional, and it belongs to no provider until somebody
 * quotes it.
 *
 * `categoryIds` is the caller's own set of category buckets, resolved
 * server-side from their offerings and catalogue links. An empty set matches
 * nothing: a provider who offers nothing cannot be shown work they cannot do,
 * and returning the whole board would be the worst possible answer to "why am
 * I seeing nothing".
 *
 * `quotedJobIds` excludes jobs the caller has already quoted — those live in
 * the inbox instead, so the board never shows a request the provider has
 * already answered.
 *
 * `maxQuotes` drops jobs that already hold this many active quotes: the third
 * quote closes the request to further providers, and keeping full ones on the
 * board would only produce a guaranteed `409` on submit.
 */
export interface OpenJobQuery {
  categoryIds: string[];
  quotedJobIds: string[];
  maxQuotes: number;
  statuses: readonly string[];
}

export interface JobsStore {
  findCustomerProfileByUserId(userId: string): Promise<CustomerProfileRef | null>;
  /**
   * Stage 8 — reverse lookup for notification recipients: the login
   * user id that owns a marketplace customer profile, or null for
   * business-managed (`user_id = NULL`) profiles. Server-side only.
   */
  findUserIdByCustomerId(customerId: string): Promise<string | null>;
  createCustomerProfile(userId: string, provision: CustomerProvision): Promise<CustomerProfileRef>;
  findActiveService(serviceId: string): Promise<ActiveServiceRef | null>;
  createJob(input: PersistJobInput): Promise<JobDto>;
  getJobById(jobId: string): Promise<JobDto | null>;
  listJobsByCustomerId(
    customerId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: JobDto[]; total: number }>;
  /**
   * Step 14 — open requests whose service category is in `categoryIds`, newest
   * first, bounded by `OPEN_REQUEST_SCAN_LIMIT`.
   *
   * The AREA test is NOT applied here: `service_areas` holds free text and no
   * SQL expression can tokenise "Fourways & surrounds" correctly, so the
   * caller applies the shared matcher and does its own pagination over the
   * returned window. The window is therefore a deliberate trade — a provider
   * looking at a very old open request may not find it, which is preferable to
   * an unbounded scan of every marketplace job on a page load.
   */
  listOpenJobs(query: OpenJobQuery): Promise<JobDto[]>;
  /**
   * Step 15 - apply a customer edit to an owned job.
   *
   * The status gate is enforced HERE, under `FOR UPDATE`, not only in the
   * service: a check-then-write in the service would let a customer's edit
   * land in the same window an acceptance uses, editing a job that is already
   * ACCEPTED. Only the keys present in `patch` are written.
   *
   * Throws JobNotMutableError when the job is past the gate.
   */
  updateJob(input: PersistJobUpdateInput): Promise<JobDto>;
  /**
   * Step 15 - move a job to CANCELLED, writing the `job_status_history` entry
   * atomically with the status change. The job row is locked first so the
   * gate cannot be lost to a concurrent acceptance.
   */
  cancelJob(jobId: string, cancelledBy: string): Promise<JobDto>;
  /**
   * Step 15 - soft delete: set `deleted_at` and change nothing else.
   *
   * Quotes, history, assignments and images survive on purpose (see
   * docs/DATABASE.md). Idempotent in effect - a second delete of an
   * already-deleted job simply reports the same state - but the caller has
   * already resolved ownership, so the row is still required to exist.
   */
  deleteJob(jobId: string): Promise<void>;
  /**
   * Attach a customer request photo to a job.
   *
   * The state gate and the per-job photo cap are enforced HERE, inside the
   * transaction, not only in the service: a check-then-insert in the service
   * would let two concurrent uploads both pass and both insert.
   *
   * Throws JobRequestImageRejected when the job is no longer accepting photos
   * or the cap is reached; the caller rolls back the stored file.
   */
  createRequestImage(input: RequestImagePersistInput): Promise<JobImageDto>;
}
