/**
 * FixLink Stage 6B — customer job request (job creation) types.
 *
 * Marketplace jobs and internal business jobs share the ONE `jobs` table
 * (see database/migrations/004_jobs_core.sql). Stage 6B only creates
 * `source = MARKETPLACE` jobs in `status = REQUESTED`. Quotes, assignment,
 * execution and payment belong to later stages.
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
}

/** Public customer-facing projection of a marketplace job request. */
export interface JobDto {
  id: string;
  reference: string;
  source: JobSource;
  status: JobStatus;
  customerId: string;
  provider: JobProviderSummary;
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
  createdAt: string;
  updatedAt: string;
}

/** Validated input for creating a marketplace job request. */
export interface CreateJobInput {
  providerType: 'professional' | 'business';
  providerNumericId: string;
  serviceId: string;
  description: string;
  location: string;
  /** `YYYY-MM-DD` or null. */
  preferredDate: string | null;
  /** `HH:MM` 24h or null. */
  preferredTime: string | null;
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
}

export interface PersistJobInput {
  reference: string;
  customerId: string;
  providerType: 'professional' | 'business';
  providerNumericId: string;
  providerName: string;
  serviceId: string;
  description: string;
  location: string;
  /** `YYYY-MM-DD HH:MM:SS` for `scheduled_at`, or null. */
  scheduledAt: string | null;
  createdBy: string;
}
