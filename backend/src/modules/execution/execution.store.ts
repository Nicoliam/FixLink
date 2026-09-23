/**
 * FixLink Stage 6F — execution data-access contract.
 *
 * The MySQL implementation serves production (transactional complete /
 * confirm with guarded status updates); the memory implementation serves
 * automated tests with the same rules. Both reuse the existing
 * `job_images`, `job_updates` and `job_status_history` tables — the only
 * schema addition is `job_updates.phase` + `job_images.original_filename`
 * (migration 009), both nullable and backward compatible.
 */
import type { JobDto } from '../jobs/jobs.types';
import type { JobImageDto, JobUpdateDto, TimelineEventDto, WorkPhase } from './execution.types';

/** The job is not in a state that accepts work documentation (must be IN_PROGRESS). */
export class JobNotExecutableError extends Error {
  constructor(message = 'This job is not accepting work documentation in its current state.') {
    super(message);
    this.name = 'JobNotExecutableError';
  }
}

/** The uploaded image failed validation (type, size or content). */
export class JobImageValidationError extends Error {
  constructor(message = 'Invalid image upload.') {
    super(message);
    this.name = 'JobImageValidationError';
  }
}

/** The image cannot be deleted (wrong state or not the uploader). */
export class JobImageNotDeletableError extends Error {
  constructor(message = 'This image cannot be deleted.') {
    super(message);
    this.name = 'JobImageNotDeletableError';
  }
}

/** The job is not in a state that allows completion (must be IN_PROGRESS). */
export class JobNotCompletableError extends Error {
  constructor(message = 'This job cannot be completed in its current state.') {
    super(message);
    this.name = 'JobNotCompletableError';
  }
}

/** The job is not in a state that allows confirmation (must be COMPLETED). */
export class JobNotConfirmableError extends Error {
  constructor(message = 'This job cannot be confirmed in its current state.') {
    super(message);
    this.name = 'JobNotConfirmableError';
  }
}

export interface CreateImagePersistInput {
  jobId: string;
  uploadedBy: string;
  phase: WorkPhase;
  /** Opaque key from FileStorage (stored in `job_images.file_reference`). */
  storageKey: string;
  originalFilename: string | null;
  mimeType: string;
  size: number;
}

export interface DeleteImagePersistInput {
  jobId: string;
  imageId: string;
  deleterId: string;
}

export interface CreateUpdatePersistInput {
  jobId: string;
  authorId: string;
  phase: WorkPhase;
  note: string;
}

export interface CompleteJobPersistInput {
  jobId: string;
  providerUserId: string;
  /** Required completion note (stored as an AFTER update). */
  note: string;
}

export interface ConfirmJobPersistInput {
  jobId: string;
  customerUserId: string;
}

export interface StatusHistoryEntry {
  jobId: string;
  previousStatus: JobDto['status'] | null;
  status: JobDto['status'];
  reason: string | null;
  createdAt: string;
}

export interface ExecutionStore {
  createImage(input: CreateImagePersistInput): Promise<JobImageDto>;
  listImagesByJobId(jobId: string): Promise<JobImageDto[]>;
  getImageById(imageId: string): Promise<JobImageDto | null>;
  /**
   * Delete an image while the job is IN_PROGRESS. Only the uploader may
   * delete. Returns the storage key so the service can remove the file
   * bytes; timeline history rows are never rewritten.
   */
  deleteImage(input: DeleteImagePersistInput): Promise<{ storageKey: string }>;
  createUpdate(input: CreateUpdatePersistInput): Promise<JobUpdateDto>;
  listUpdatesByJobId(jobId: string): Promise<JobUpdateDto[]>;
  /**
   * IN_PROGRESS → COMPLETED with the completion note stored as an AFTER
   * update, atomically. Throws JobNotCompletableError otherwise; a failed
   * completion leaves the job IN_PROGRESS.
   */
  completeJob(input: CompleteJobPersistInput): Promise<JobUpdateDto>;
  /**
   * COMPLETED → CONFIRMED → CLOSED atomically (customer confirms once;
   * the backend records both history events and returns the CLOSED job).
   * Throws JobNotConfirmableError otherwise; a failed confirmation leaves
   * the job COMPLETED.
   */
  confirmJob(input: ConfirmJobPersistInput): Promise<void>;
  listStatusHistory(jobId: string): Promise<StatusHistoryEntry[]>;
  /** Timeline aggregation helper (status + updates + images, oldest first). */
  buildTimelineEvents(
    history: StatusHistoryEntry[],
    updates: JobUpdateDto[],
    images: JobImageDto[],
  ): TimelineEventDto[];
}
