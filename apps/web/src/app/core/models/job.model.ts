/**
 * FixLink job models — Stage 6B.
 *
 * Client-side projections of the customer job-request API
 * (POST /api/v1/jobs, GET /api/v1/jobs, GET /api/v1/jobs/:id).
 * Stage 6B covers creation only; quotes, execution and payment
 * arrive in later stages.
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

export interface Job {
  id: string;
  reference: string;
  source: JobSource;
  status: JobStatus;
  customerId: string;
  provider: JobProviderSummary;
  service: JobServiceSummary;
  description: string;
  location: string;
  city: string | null;
  province: string | null;
  preferredDate: string | null;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Body sent to POST /api/v1/jobs. Ownership is established server-side. */
export interface CreateJobRequest {
  providerId: string;
  serviceId: string;
  description: string;
  location: string;
  preferredDate?: string;
  preferredTime?: string;
  notes?: string;
}

export interface JobList {
  items: Job[];
  total: number;
  page: number;
  pageSize: number;
}

/** Human-friendly label for the REQUESTED-family statuses shown to customers. */
export function jobStatusLabel(status: JobStatus): string {
  switch (status) {
    case 'REQUESTED':
      return 'Requested';
    case 'QUOTED':
      return 'Quoted';
    case 'ACCEPTED':
      return 'Accepted';
    case 'SCHEDULED':
      return 'Scheduled';
    case 'IN_PROGRESS':
      return 'In progress';
    case 'AWAITING_PARTS':
      return 'Awaiting parts';
    case 'COMPLETED':
      return 'Completed';
    case 'CONFIRMED':
      return 'Confirmed';
    case 'CLOSED':
      return 'Closed';
    case 'CANCELLED':
      return 'Cancelled';
    case 'DISPUTED':
      return 'Disputed';
  }
}
