/**
 * FixLink Stage 6C — provider quote types.
 *
 * Marketplace jobs and internal business jobs share the ONE `jobs` table;
 * quotes live in the existing `quotes` / `quote_items` tables (see
 * database/migrations/006_quotes_parts_approvals.sql). Stage 6C only
 * submits quotes (`status = SUBMITTED`) and transitions the job
 * REQUESTED → QUOTED. Stage 6D adds customer acceptance
 * (`status = ACCEPTED`, job QUOTED → ACCEPTED). Decline and
 * withdrawal belong to a later stage.
 */
import type { JobDto } from '../jobs/jobs.types';

export type QuoteStatus = 'DRAFT' | 'SUBMITTED' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN' | 'EXPIRED';

export interface QuoteItemDto {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  /** `quantity * unit_price` — derived by the database, never from input. */
  total: number;
  sortOrder: number;
}

/** Public projection of a submitted marketplace quote. */
export interface QuoteDto {
  id: string;
  jobId: string;
  provider: {
    id: string;
    providerType: 'professional' | 'business';
    name: string;
  };
  total: number;
  currency: string;
  /** Provider's note; stored in `quotes.description`. */
  message: string | null;
  status: QuoteStatus;
  items: QuoteItemDto[];
  submittedAt: string | null;
  createdAt: string;
}

/** Job detail as seen by the owning customer, with its quotes embedded. */
export type JobWithQuotes = JobDto & {
  quotes: QuoteDto[];
};

/** Provider-facing projection of a marketplace request. */
export interface ProviderRequestDto {
  id: string;
  reference: string;
  source: JobDto['source'];
  status: JobDto['status'];
  provider: JobDto['provider'];
  service: JobDto['service'];
  description: string;
  location: string;
  city: string | null;
  province: string | null;
  preferredDate: string | null;
  scheduledAt: string | null;
  /** Stage 6F terminal timestamps (null until each transition runs). */
  completedAt: string | null;
  confirmedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  /** Privacy-limited customer display info (first name + last initial). */
  customer: {
    displayName: string;
  };
  quotes: QuoteDto[];
}

/** Validated input for POST /api/v1/jobs/:jobId/quotes. */
export interface CreateQuoteInput {
  total: number;
  currency: string;
  message: string | null;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
  }>;
}

/** Professional profile owned by the authenticated user, if any. */
export interface ProfessionalIdentity {
  id: string;
}

/** Business the authenticated user may act for (owner or member). */
export interface BusinessIdentity {
  businessId: string;
  role: 'OWNER' | 'MANAGER';
}
