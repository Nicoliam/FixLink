/**
 * FixLink Stage 6F — job execution & work-documentation types.
 *
 * Covers the IN_PROGRESS → COMPLETED → CONFIRMED → CLOSED segment of the
 * marketplace lifecycle plus the BEFORE → DURING → AFTER work record.
 * Reuses the existing `job_images`, `job_updates` and `job_status_history`
 * tables — no duplicate tables. Binary bytes are never stored in MySQL;
 * `JobImageDto` carries file metadata only (see `services/file-storage`).
 */
import type { JobDto } from '../jobs/jobs.types';
import type { JobWithQuotes } from '../quotes/quotes.types';

export type WorkPhase = 'BEFORE' | 'DURING' | 'AFTER';

export const WORK_PHASES: readonly WorkPhase[] = ['BEFORE', 'DURING', 'AFTER'];

/** File metadata for a job photo (no binary content, no raw paths). */
export interface JobImageDto {
  id: string;
  jobId: string;
  uploadedBy: string;
  phase: WorkPhase;
  originalFilename: string | null;
  mimeType: string;
  size: number;
  createdAt: string;
}

/** A written progress update / completion note on a job. */
export interface JobUpdateDto {
  id: string;
  jobId: string;
  authorId: string;
  phase: WorkPhase;
  note: string;
  createdAt: string;
}

export type TimelineEventKind = 'status' | 'update' | 'image';

/**
 * One entry of the job timeline (status transitions, progress updates,
 * photos). `actor` is a role label only — never contact details — and is
 * inferred from the event type so no PII lookup is required.
 */
export interface TimelineEventDto {
  kind: TimelineEventKind;
  createdAt: string;
  /** 'customer' | 'provider' inferred from the event type. */
  actor: 'customer' | 'provider';
  status?: JobDto['status'];
  previousStatus?: JobDto['status'] | null;
  reason?: string | null;
  phase?: WorkPhase;
  note?: string;
  imageId?: string;
  mimeType?: string;
}

export interface JobTimelineDto {
  job: JobWithQuotes;
  events: TimelineEventDto[];
}

/** Completion response: the COMPLETED job plus its completion record. */
export interface CompleteJobResult {
  job: JobWithQuotes;
  update: JobUpdateDto;
}
