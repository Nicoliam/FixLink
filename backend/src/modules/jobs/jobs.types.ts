/**
 * Fixlynk Stage 6B — customer job request (job creation) types.
 *
 * Marketplace jobs and internal business jobs share the ONE `jobs` table
 * (see database/migrations/004_jobs_core.sql). Stage 6B only creates
 * `source = MARKETPLACE` jobs in `status = REQUESTED`. Quotes, assignment,
 * execution and payment belong to later stages.
 *
 * Stage 6D: `agreedAmount`/`currency` surface the recorded agreed quote
 * amount (`jobs.agreed_amount`, recorded only — no payment processing in
 * the MVP). They are NULL/`ZAR` until the owning customer accepts a
 * quote (QUOTED → ACCEPTED).
 */

export type JobSource = 'MARKETPLACE' | 'INTERNAL';

export type JobStatus =
  | 'REQUESTED'
  | 'QUOTED'
  | 'ACCEPTED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'AWAITING_PARTS'
  | 'COMPLETED'
  | 'CONFIRMED'
  | 'CLOSED'
  | 'CANCELLED'
  | 'DISPUTED';

export interface JobProviderSummary {
  id: string;
  providerType: 'professional' | 'business';
  name: string;
}

export interface JobServiceSummary {
  id: string;
  name: string;
  slug: string;
  /**
   * Step 14 — the platform `service_categories` bucket this service sits in.
   *
   * Surfaced on the job so open-request matching can be re-checked when a
   * provider opens a request, without a second lookup. It is the category id
   * itself, never a client-supplied value: the customer picks a leaf service
   * and the bucket follows from it.
   */
  categoryId: string;
  categoryName: string;
}

/** Public customer-facing projection of a marketplace job request. */
export interface JobDto {
  id: string;
  reference: string;
  source: JobSource;
  status: JobStatus;
  customerId: string;
  /**
   * Step 14 — NULL on an OPEN REQUEST.
   *
   * A job with no provider was posted without the customer choosing one
   * (`POST /api/v1/jobs` was called without `providerId`). It is offered to
   * every provider matching it on category and service area, and up to 3 of
   * them may quote. Consumers must handle null: render "Matching
   * professionals" rather than a name.
   */
  provider: JobProviderSummary | null;
  service: JobServiceSummary;
  description: string;
  /** Free-text location as submitted; stored in `jobs.address_line1`. */
  location: string;
  city: string | null;
  province: string | null;
  /** Preferred date as submitted (`YYYY-MM-DD`), or null when omitted. */
  preferredDate: string | null;
  /** `jobs.scheduled_at` derived from the preferred date/time. */
  scheduledAt: string | null;
  /** Agreed quote amount recorded at acceptance; null until ACCEPTED. */
  agreedAmount: number | null;
  /** `jobs.currency` (MVP: ZAR only, recorded — never charged). */
  currency: string;
  /** Stage 6F: `jobs.completed_at` (COMPLETED), null until completed. */
  completedAt: string | null;
  /** Stage 6F: `jobs.confirmed_at` (CONFIRMED), null until confirmed. */
  confirmedAt: string | null;
  /** Stage 6F: `jobs.closed_at` (CLOSED), null until closed. */
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Validated input for creating a marketplace job request.
 *
 * Step 14: `providerType`/`providerNumericId` are null together, and only
 * when the customer chose no professional. Both being null is what makes the
 * job an open request; exactly one being set is rejected by the validator.
 */
export interface CreateJobInput {
  providerType: 'professional' | 'business' | null;
  providerNumericId: string | null;
  serviceId: string;
  description: string;
  location: string;
  /** `YYYY-MM-DD` or null. */
  preferredDate: string | null;
  /** `HH:MM` 24h or null. */
  preferredTime: string | null;
}

/**
 * Step 15 - states in which the customer may still edit, cancel or delete
 * their own marketplace request.
 *
 * The cut-off is acceptance, not quoting. A request may hold up to three
 * quotes (or one, when it is addressed) and the customer is free to correct a
 * description or address while they compare prices - they just have to be
 * told that the quotes they already have were priced on the earlier text.
 * `ACCEPTED` is different in kind: `jobs.agreed_amount` is recorded, a
 * `job_assignments` row exists, and the record is a job rather than a draft.
 *
 * The business internal-job equivalent is gated on `REQUESTED` only, because
 * a business assigns its own technicians with no quote round-trip in between.
 */
export const CUSTOMER_MUTABLE_STATUSES: readonly JobStatus[] = ['REQUESTED', 'QUOTED'];

/** Validated customer edit. Every field is optional; omitted keys are untouched. */
export interface UpdateJobInput {
  /** `undefined` = leave alone, `null` = clear. Never changes the service. */
  description?: string;
  location?: string;
  /** `YYYY-MM-DD`, or null to clear the preferred date. */
  preferredDate?: string | null;
  /** `HH:MM` 24-hour, or null to clear the preferred time. */
  preferredTime?: string | null;
}

/** Values handed to the store. `scheduledAt` combines date + time as on create. */
export interface PersistJobUpdateInput {
  jobId: string;
  /** Only the keys the customer actually supplied. */
  patch: {
    description?: string;
    location?: string;
    scheduledAt?: string | null;
  };
}

/**
 * Step 15 - what the customer is told about the quotes on a request they just
 * edited. Returned alongside the job rather than only in the UI, so the same
 * warning is available to any client and cannot be silently dropped.
 */
export interface UpdatedJobDto {
  job: JobDto;
  /**
   * True when the request already held active quotes, so the customer should
   * be warned those quotes were priced on the previous description.
   */
  quotedRequestsChanged: boolean;
}

/** Minimal customer profile needed to own jobs. */
export interface CustomerProfileRef {
  id: string;
}

/** Active service reference used for provider-eligibility checks. */
export interface ActiveServiceRef {
  id: string;
  name: string;
  slug: string;
  /** Step 14 — the category bucket, for open-request matching. */
  categoryId: string;
  categoryName: string;
}

export interface PersistJobInput {
  reference: string;
  customerId: string;
  /** Both null for an open request (Step 14) — then no assignment row. */
  providerType: 'professional' | 'business' | null;
  providerNumericId: string | null;
  /** Public display name; null on an open request, which has no provider yet. */
  providerName: string | null;
  serviceId: string;
  description: string;
  location: string;
  /** `YYYY-MM-DD HH:MM:SS` for `scheduled_at`, or null. */
  scheduledAt: string | null;
  createdBy: string;
}

/** Row to insert for a customer request photo (migration 017 `context`). */
export interface RequestImagePersistInput {
  jobId: string;
  /** The owning customer, resolved from the session — never from the request. */
  uploadedBy: string;
  /** Opaque storage key. Bytes never reach MySQL. */
  storageKey: string;
  originalFilename: string | null;
  mimeType: string;
  size: number;
}

/**
 * Job states in which a customer may still attach photos of the problem.
 *
 * QUOTED is included so the customer can add a missing photo before deciding on
 * the quote. ACCEPTED is the cut-off: once work is agreed the professional owns
 * the Before/During/After record and adding to it would corrupt that history.
 */
export const REQUEST_IMAGE_STATUSES: readonly JobStatus[] = ['REQUESTED', 'QUOTED'];

/** Per-job cap on customer request photos, to bound storage and abuse. */
export const MAX_REQUEST_IMAGES_PER_JOB = 6;
