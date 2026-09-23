/**
 * FixLink job models — Stage 6B + 6C + 6D.
 *
 * Client-side projections of the customer job-request API
 * (POST /api/v1/jobs, GET /api/v1/jobs, GET /api/v1/jobs/:id), the
 * Stage 6C provider request + quote API (GET /api/v1/provider/requests,
 * POST /api/v1/jobs/:id/quotes) and the Stage 6D customer acceptance
 * API (POST /api/v1/jobs/:id/quotes/:quoteId/accept). Execution and
 * payment arrive in later stages.
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
  /** Agreed quote amount recorded at acceptance; null until ACCEPTED. */
  agreedAmount?: number | null;
  /** Recorded currency (MVP: ZAR, arranged directly — never charged). */
  currency?: string;
  /** Quotes submitted on this job (embedded in detail responses). */
  quotes?: Quote[];
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

/** A line item on a submitted quote. Totals are derived server-side. */
export interface QuoteItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  sortOrder: number;
}

export type QuoteStatus = 'DRAFT' | 'SUBMITTED' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN' | 'EXPIRED';

/** A provider-submitted marketplace quote (Stage 6C: SUBMITTED only). */
export interface Quote {
  id: string;
  jobId: string;
  provider: JobProviderSummary;
  total: number;
  currency: string;
  message: string | null;
  status: QuoteStatus;
  items: QuoteItem[];
  submittedAt: string | null;
  createdAt: string;
}

/** Body sent to POST /api/v1/jobs/:id/quotes. Ownership is server-side. */
export interface CreateQuoteRequest {
  total: number;
  currency?: string;
  message?: string;
  items?: Array<{ description: string; quantity: number; unitPrice: number }>;
}

/**
 * Result of POST /api/v1/jobs/:id/quotes/:quoteId/accept — the accepted
 * quote plus the updated job (status ACCEPTED, agreed amount recorded).
 * No payment is processed: the total is the agreed price the customer
 * pays the professional directly.
 */
export interface AcceptQuoteResult {
  job: Job;
  quote: Quote;
}

/** Provider-facing projection of a marketplace request. */
export interface ProviderRequest {
  id: string;
  reference: string;
  source: JobSource;
  status: JobStatus;
  provider: JobProviderSummary;
  service: JobServiceSummary;
  description: string;
  location: string;
  city: string | null;
  province: string | null;
  preferredDate: string | null;
  scheduledAt: string | null;
  createdAt: string;
  customer: { displayName: string };
  quotes: Quote[];
}

export interface ProviderRequestList {
  items: ProviderRequest[];
  total: number;
  page: number;
  pageSize: number;
}

/** Format a quote amount in rand, e.g. 1250 → "R1,250". */
export function formatZar(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const [whole, fraction] = rounded.toFixed(2).split('.') as [string, string];
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === '00' ? `R${grouped}` : `R${grouped}.${fraction}`;
}

/** Human-friendly label for quote statuses shown to customers/providers. */
export function quoteStatusLabel(status: QuoteStatus): string {
  switch (status) {
    case 'DRAFT':
      return 'Draft';
    case 'SUBMITTED':
      return 'Submitted';
    case 'ACCEPTED':
      return 'Accepted';
    case 'DECLINED':
      return 'No longer available';
    case 'WITHDRAWN':
      return 'Withdrawn';
    case 'EXPIRED':
      return 'Expired';
  }
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
