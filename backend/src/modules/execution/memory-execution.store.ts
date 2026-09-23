/**
 * FixLink Stage 6F — in-memory execution store for automated tests.
 *
 * Mirrors the MySQL implementation's rules (IN_PROGRESS gating for work
 * documentation, uploader-only deletion, completion-note requirement,
 * COMPLETED → CONFIRMED → CLOSED confirmation) without requiring a
 * database. Job rows are shared with MemoryJobsStore; status history from
 * earlier stages is read from the shared MemoryQuotesStore so the
 * timeline stays consistent in tests.
 */
import type { MemoryJobsStore } from '../jobs/memory-jobs.store';
import type { JobDto } from '../jobs/jobs.types';
import {
  JobImageNotDeletableError,
  JobNotCompletableError,
  JobNotConfirmableError,
  JobNotExecutableError,
  type CompleteJobPersistInput,
  type ConfirmJobPersistInput,
  type CreateImagePersistInput,
  type CreateUpdatePersistInput,
  type DeleteImagePersistInput,
  type ExecutionStore,
  type StatusHistoryEntry,
} from './execution.store';
import type { JobImageDto, JobUpdateDto, TimelineEventDto, TimelineEventKind, WorkPhase } from './execution.types';

function nowIso(): string {
  return new Date().toISOString();
}

interface QuotesHistoryReader {
  debugHistory(): Array<{ jobId: string; previous: string | null; next: string }>;
}

function isStatus(value: string): value is JobDto['status'] {
  return (
    value === 'REQUESTED' ||
    value === 'QUOTED' ||
    value === 'ACCEPTED' ||
    value === 'SCHEDULED' ||
    value === 'IN_PROGRESS' ||
    value === 'AWAITING_PARTS' ||
    value === 'COMPLETED' ||
    value === 'CONFIRMED' ||
    value === 'CLOSED' ||
    value === 'CANCELLED' ||
    value === 'DISPUTED'
  );
}

export class MemoryExecutionStore implements ExecutionStore {
  private imageSeq = 0;
  private updateSeq = 0;
  private readonly images = new Map<string, JobImageDto & { storageKey: string; jobStatusAtUpload: string }>();
  private readonly updates: JobUpdateDto[] = [];
  private readonly history: StatusHistoryEntry[] = [];

  constructor(
    private readonly jobs: MemoryJobsStore,
    private readonly quotesHistory?: QuotesHistoryReader,
  ) {}

  private async requireInProgressMarketplaceJob(jobId: string): Promise<JobDto> {
    const live = await this.jobs.getJobById(jobId);
    if (!live || live.source !== 'MARKETPLACE') {
      throw new JobNotExecutableError('Job not found.');
    }
    if (live.status !== 'IN_PROGRESS') {
      throw new JobNotExecutableError();
    }
    return live;
  }

  async createImage(input: CreateImagePersistInput): Promise<JobImageDto> {
    await this.requireInProgressMarketplaceJob(input.jobId);
    this.imageSeq += 1;
    const record: JobImageDto & { storageKey: string; jobStatusAtUpload: string } = {
      id: String(this.imageSeq),
      jobId: input.jobId,
      uploadedBy: input.uploadedBy,
      phase: input.phase,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      size: input.size,
      createdAt: nowIso(),
      storageKey: input.storageKey,
      jobStatusAtUpload: 'IN_PROGRESS',
    };
    this.images.set(record.id, record);
    const { storageKey: _storageKey, jobStatusAtUpload: _atUpload, ...dto } = record;
    return dto;
  }

  async listImagesByJobId(jobId: string): Promise<JobImageDto[]> {
    return [...this.images.values()]
      .filter((image) => image.jobId === jobId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map(({ storageKey: _storageKey, jobStatusAtUpload: _atUpload, ...dto }) => dto);
  }

  async getImageById(imageId: string): Promise<JobImageDto | null> {
    const record = this.images.get(imageId);
    if (!record) return null;
    const { storageKey: _storageKey, jobStatusAtUpload: _atUpload, ...dto } = record;
    return dto;
  }

  /** Test helper: resolve the stored file key for download assertions. */
  debugStorageKey(imageId: string): string | null {
    return this.images.get(imageId)?.storageKey ?? null;
  }

  async deleteImage(input: DeleteImagePersistInput): Promise<{ storageKey: string }> {
    const record = this.images.get(input.imageId);
    const live = await this.jobs.getJobById(input.jobId);
    if (!record || !live || record.jobId !== live.id || live.source !== 'MARKETPLACE') {
      throw new JobImageNotDeletableError('Image not found.');
    }
    if (live.status !== 'IN_PROGRESS') {
      throw new JobImageNotDeletableError('Images can only be deleted while the job is in progress.');
    }
    if (record.uploadedBy !== input.deleterId) {
      throw new JobImageNotDeletableError('You can only delete images you uploaded.');
    }
    this.images.delete(input.imageId);
    return { storageKey: record.storageKey };
  }

  async createUpdate(input: CreateUpdatePersistInput): Promise<JobUpdateDto> {
    await this.requireInProgressMarketplaceJob(input.jobId);
    this.updateSeq += 1;
    const update: JobUpdateDto = {
      id: String(this.updateSeq),
      jobId: input.jobId,
      authorId: input.authorId,
      phase: input.phase,
      note: input.note,
      createdAt: nowIso(),
    };
    this.updates.push(update);
    return update;
  }

  async listUpdatesByJobId(jobId: string): Promise<JobUpdateDto[]> {
    return this.updates
      .filter((update) => update.jobId === jobId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async completeJob(input: CompleteJobPersistInput): Promise<JobUpdateDto> {
    const live = await this.jobs.getJobById(input.jobId);
    if (!live || live.source !== 'MARKETPLACE') {
      throw new JobNotCompletableError('Job not found.');
    }
    if (live.status !== 'IN_PROGRESS') {
      throw new JobNotCompletableError();
    }
    if (input.note.trim() === '') {
      throw new JobNotCompletableError('A completion note is required to complete the job.');
    }
    // All checks passed before any mutation: a failed completion cannot
    // leave the job COMPLETED without its completion record (or vice versa).
    this.updateSeq += 1;
    const update: JobUpdateDto = {
      id: String(this.updateSeq),
      jobId: live.id,
      authorId: input.providerUserId,
      phase: 'AFTER',
      note: input.note,
      createdAt: nowIso(),
    };
    this.updates.push(update);
    this.jobs.debugSetJobCompleted(live.id);
    this.history.push({
      jobId: live.id,
      previousStatus: 'IN_PROGRESS',
      status: 'COMPLETED',
      reason: 'Provider completed job',
      createdAt: nowIso(),
    });
    return update;
  }

  async confirmJob(input: ConfirmJobPersistInput): Promise<void> {
    const live = await this.jobs.getJobById(input.jobId);
    if (!live || live.source !== 'MARKETPLACE') {
      throw new JobNotConfirmableError('Job not found.');
    }
    if (live.status !== 'COMPLETED') {
      throw new JobNotConfirmableError();
    }
    // Atomic double transition: CONFIRMED is recorded, then the job is
    // closed — a failed confirmation leaves the job COMPLETED.
    this.jobs.debugSetJobConfirmed(live.id);
    this.history.push({
      jobId: live.id,
      previousStatus: 'COMPLETED',
      status: 'CONFIRMED',
      reason: 'Customer confirmed job',
      createdAt: nowIso(),
    });
    this.jobs.debugSetJobClosed(live.id);
    this.history.push({
      jobId: live.id,
      previousStatus: 'CONFIRMED',
      status: 'CLOSED',
      reason: 'Job closed after customer confirmation',
      createdAt: nowIso(),
    });
  }

  async listStatusHistory(jobId: string): Promise<StatusHistoryEntry[]> {
    const entries: StatusHistoryEntry[] = [];
    const live = await this.jobs.getJobById(jobId);
    if (live) {
      // Synthetic creation event (the memory jobs store keeps no history
      // table; production reads the real REQUESTED row from MySQL).
      entries.push({
        jobId: live.id,
        previousStatus: null,
        status: 'REQUESTED',
        reason: 'Customer submitted request',
        createdAt: live.createdAt,
      });
    }
    for (const entry of this.quotesHistory?.debugHistory() ?? []) {
      if (entry.jobId !== jobId) continue;
      if (entry.previous !== null && !isStatus(entry.previous)) continue;
      if (!isStatus(entry.next)) continue;
      entries.push({
        jobId: entry.jobId,
        previousStatus: entry.previous,
        status: entry.next,
        reason: null,
        createdAt: live?.createdAt ?? nowIso(),
      });
    }
    for (const entry of this.history) {
      if (entry.jobId === jobId) entries.push(entry);
    }
    return entries;
  }

  buildTimelineEvents(
    history: StatusHistoryEntry[],
    updates: JobUpdateDto[],
    images: JobImageDto[],
  ): TimelineEventDto[] {
    return buildTimelineEvents(history, updates, images);
  }

  /** Test helper: completion/update records written by completeJob. */
  debugUpdates(): JobUpdateDto[] {
    return [...this.updates];
  }

  /** Test helper: status-history entries written by complete/confirm. */
  debugHistory(): StatusHistoryEntry[] {
    return [...this.history];
  }
}

const STATUS_ACTOR: Record<JobDto['status'], 'customer' | 'provider'> = {
  REQUESTED: 'customer',
  QUOTED: 'provider',
  ACCEPTED: 'customer',
  SCHEDULED: 'provider',
  IN_PROGRESS: 'provider',
  AWAITING_PARTS: 'provider',
  COMPLETED: 'provider',
  CONFIRMED: 'customer',
  CLOSED: 'customer',
  CANCELLED: 'customer',
  DISPUTED: 'customer',
};

export function buildTimelineEvents(
  history: StatusHistoryEntry[],
  updates: JobUpdateDto[],
  images: JobImageDto[],
): TimelineEventDto[] {
  const events: TimelineEventDto[] = [];
  for (const entry of history) {
    events.push({
      kind: 'status',
      createdAt: entry.createdAt,
      actor: STATUS_ACTOR[entry.status],
      status: entry.status,
      previousStatus: entry.previousStatus,
      reason: entry.reason,
    });
  }
  for (const update of updates) {
    events.push({
      kind: 'update',
      createdAt: update.createdAt,
      actor: 'provider',
      phase: update.phase as WorkPhase,
      note: update.note,
    });
  }
  for (const image of images) {
    events.push({
      kind: 'image',
      createdAt: image.createdAt,
      actor: 'provider',
      phase: image.phase as WorkPhase,
      imageId: image.id,
      mimeType: image.mimeType,
    });
  }
  const kindOrder: Record<TimelineEventKind, number> = { status: 0, update: 1, image: 2 };
  events.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : kindOrder[a.kind] - kindOrder[b.kind]));
  return events;
}
