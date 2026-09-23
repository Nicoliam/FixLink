/**
 * FixLink Stage 6F — MySQL execution store (production implementation).
 *
 * Reuses the existing `job_images`, `job_updates` and `job_status_history`
 * tables plus migration 009's nullable `job_updates.phase` /
 * `job_images.original_filename` columns. Every value is a bound
 * parameter. Completion (IN_PROGRESS → COMPLETED with an AFTER update)
 * and confirmation (COMPLETED → CONFIRMED → CLOSED) each run in one
 * transaction with guarded status updates so concurrent calls cannot
 * double-transition the job.
 */
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { JobDto } from '../jobs/jobs.types';
import { buildTimelineEvents } from './memory-execution.store';
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
import type { JobImageDto, JobUpdateDto, TimelineEventDto, WorkPhase } from './execution.types';

function toIso(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toStringId(value: number | string): string {
  return String(value);
}

function toNumber(value: number | string): number {
  return typeof value === 'number' ? value : Number(value);
}

function toPhase(value: string): WorkPhase {
  if (value === 'BEFORE' || value === 'DURING' || value === 'AFTER') return value;
  throw new Error(`Unknown work phase: ${value}`);
}

interface JobStateRow extends RowDataPacket {
  id: number;
  source: 'MARKETPLACE' | 'INTERNAL';
  status: JobDto['status'];
}

interface ImageRow extends RowDataPacket {
  id: number;
  job_id: number;
  uploader_id: number | null;
  phase: string;
  file_reference: string;
  original_filename: string | null;
  mime_type: string | null;
  file_size: number | string | null;
  created_at: Date | string;
}

interface UpdateRow extends RowDataPacket {
  id: number;
  job_id: number;
  author_id: number | null;
  phase: string | null;
  message: string;
  created_at: Date | string;
}

interface HistoryRow extends RowDataPacket {
  job_id: number;
  previous_status: JobDto['status'] | null;
  new_status: JobDto['status'];
  reason: string | null;
  created_at: Date | string;
}

function mapImageRow(row: ImageRow): JobImageDto & { storageKey: string } {
  return {
    id: toStringId(row.id),
    jobId: toStringId(row.job_id),
    uploadedBy: row.uploader_id === null ? '' : toStringId(row.uploader_id),
    phase: toPhase(row.phase),
    originalFilename: row.original_filename,
    mimeType: row.mime_type ?? 'application/octet-stream',
    size: row.file_size === null ? 0 : toNumber(row.file_size),
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    storageKey: row.file_reference,
  };
}

function stripStorageKey(record: JobImageDto & { storageKey: string }): JobImageDto {
  const { storageKey: _storageKey, ...dto } = record;
  return dto;
}

function mapUpdateRow(row: UpdateRow): JobUpdateDto {
  return {
    id: toStringId(row.id),
    jobId: toStringId(row.job_id),
    authorId: row.author_id === null ? '' : toStringId(row.author_id),
    // Phase defaults to DURING for rows written before migration 009.
    phase: row.phase === null ? 'DURING' : toPhase(row.phase),
    note: row.message,
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
  };
}

const IMAGE_SELECT = `
  SELECT \`id\`, \`job_id\`, \`uploader_id\`, \`phase\`, \`file_reference\`,
         \`original_filename\`, \`mime_type\`, \`file_size\`, \`created_at\`
    FROM \`job_images\``;

export class MysqlExecutionStore implements ExecutionStore {
  constructor(private readonly pool: Pool) {}

  async createImage(input: CreateImagePersistInput): Promise<JobImageDto> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [jobRows] = await conn.query<JobStateRow[]>(
        'SELECT `id`, `source`, `status` FROM `jobs` WHERE `id` = ? FOR UPDATE',
        [input.jobId],
      );
      const job = (jobRows as JobStateRow[])[0] as JobStateRow | undefined;
      if (!job || job.source !== 'MARKETPLACE') {
        throw new JobNotExecutableError('Job not found.');
      }
      if (job.status !== 'IN_PROGRESS') {
        throw new JobNotExecutableError();
      }
      const [result] = await conn.query<ResultSetHeader>(
        'INSERT INTO `job_images` (`job_id`, `uploader_id`, `phase`, `file_reference`, `original_filename`, `mime_type`, `file_size`) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          input.jobId,
          input.uploadedBy,
          input.phase,
          input.storageKey,
          input.originalFilename,
          input.mimeType,
          input.size,
        ],
      );
      const imageId = Number(result.insertId);
      await conn.commit();
      const created = await this.getImageById(String(imageId));
      if (!created) throw new Error('Image upload failed: row not found after insert.');
      return created;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async listImagesByJobId(jobId: string): Promise<JobImageDto[]> {
    if (!/^[1-9][0-9]*$/.test(jobId)) return [];
    const [rows] = await this.pool.query<ImageRow[]>(
      `${IMAGE_SELECT} WHERE \`job_id\` = ? ORDER BY \`created_at\` ASC, \`id\` ASC`,
      [jobId],
    );
    return (rows as ImageRow[]).map((row) => stripStorageKey(mapImageRow(row)));
  }

  async getImageById(imageId: string): Promise<JobImageDto | null> {
    if (!/^[1-9][0-9]*$/.test(imageId)) return null;
    const [rows] = await this.pool.query<ImageRow[]>(`${IMAGE_SELECT} WHERE \`id\` = ? LIMIT 1`, [imageId]);
    if ((rows as ImageRow[]).length === 0) return null;
    return stripStorageKey(mapImageRow((rows as ImageRow[])[0] as ImageRow));
  }

  /** Production helper: resolve the protected storage key for downloads. */
  async getImageStorageKey(imageId: string): Promise<string | null> {
    if (!/^[1-9][0-9]*$/.test(imageId)) return null;
    const [rows] = await this.pool.query<ImageRow[]>('SELECT `file_reference` FROM `job_images` WHERE `id` = ? LIMIT 1', [
      imageId,
    ]);
    if ((rows as ImageRow[]).length === 0) return null;
    return ((rows as ImageRow[])[0] as ImageRow).file_reference;
  }

  async deleteImage(input: DeleteImagePersistInput): Promise<{ storageKey: string }> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [imageRows] = await conn.query<ImageRow[]>(
        'SELECT `id`, `job_id`, `uploader_id`, `file_reference` FROM `job_images` WHERE `id` = ? FOR UPDATE',
        [input.imageId],
      );
      const image = (imageRows as ImageRow[])[0] as ImageRow | undefined;
      if (!image || String(image.job_id) !== String(input.jobId)) {
        throw new JobImageNotDeletableError('Image not found.');
      }
      const [jobRows] = await conn.query<JobStateRow[]>(
        'SELECT `id`, `source`, `status` FROM `jobs` WHERE `id` = ? FOR UPDATE',
        [input.jobId],
      );
      const job = (jobRows as JobStateRow[])[0] as JobStateRow | undefined;
      if (!job || job.source !== 'MARKETPLACE') {
        throw new JobImageNotDeletableError('Image not found.');
      }
      if (job.status !== 'IN_PROGRESS') {
        throw new JobImageNotDeletableError('Images can only be deleted while the job is in progress.');
      }
      if (String(image.uploader_id ?? '') !== String(input.deleterId)) {
        throw new JobImageNotDeletableError('You can only delete images you uploaded.');
      }
      await conn.query('DELETE FROM `job_images` WHERE `id` = ?', [input.imageId]);
      await conn.commit();
      return { storageKey: image.file_reference };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async createUpdate(input: CreateUpdatePersistInput): Promise<JobUpdateDto> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [jobRows] = await conn.query<JobStateRow[]>(
        'SELECT `id`, `source`, `status` FROM `jobs` WHERE `id` = ? FOR UPDATE',
        [input.jobId],
      );
      const job = (jobRows as JobStateRow[])[0] as JobStateRow | undefined;
      if (!job || job.source !== 'MARKETPLACE') {
        throw new JobNotExecutableError('Job not found.');
      }
      if (job.status !== 'IN_PROGRESS') {
        throw new JobNotExecutableError();
      }
      const [result] = await conn.query<ResultSetHeader>(
        'INSERT INTO `job_updates` (`job_id`, `author_id`, `phase`, `message`) VALUES (?, ?, ?, ?)',
        [input.jobId, input.authorId, input.phase, input.note],
      );
      const updateId = Number(result.insertId);
      await conn.commit();
      const [rows] = await this.pool.query<UpdateRow[]>(
        'SELECT `id`, `job_id`, `author_id`, `phase`, `message`, `created_at` FROM `job_updates` WHERE `id` = ? LIMIT 1',
        [updateId],
      );
      const created = (rows as UpdateRow[])[0] as UpdateRow | undefined;
      if (!created) throw new Error('Update creation failed: row not found after insert.');
      return mapUpdateRow(created);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async listUpdatesByJobId(jobId: string): Promise<JobUpdateDto[]> {
    if (!/^[1-9][0-9]*$/.test(jobId)) return [];
    const [rows] = await this.pool.query<UpdateRow[]>(
      'SELECT `id`, `job_id`, `author_id`, `phase`, `message`, `created_at` FROM `job_updates` WHERE `job_id` = ? ORDER BY `created_at` ASC, `id` ASC',
      [jobId],
    );
    return (rows as UpdateRow[]).map(mapUpdateRow);
  }

  async completeJob(input: CompleteJobPersistInput): Promise<JobUpdateDto> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [jobRows] = await conn.query<JobStateRow[]>(
        'SELECT `id`, `source`, `status` FROM `jobs` WHERE `id` = ? FOR UPDATE',
        [input.jobId],
      );
      const job = (jobRows as JobStateRow[])[0] as JobStateRow | undefined;
      if (!job || job.source !== 'MARKETPLACE') {
        throw new JobNotCompletableError('Job not found.');
      }
      if (job.status !== 'IN_PROGRESS') {
        throw new JobNotCompletableError();
      }
      if (input.note.trim() === '') {
        throw new JobNotCompletableError('A completion note is required to complete the job.');
      }
      const [updateResult] = await conn.query<ResultSetHeader>(
        'INSERT INTO `job_updates` (`job_id`, `author_id`, `phase`, `message`) VALUES (?, ?, \'AFTER\', ?)',
        [input.jobId, input.providerUserId, input.note],
      );
      const updateId = Number(updateResult.insertId);
      const [updated] = await conn.query<ResultSetHeader>(
        "UPDATE `jobs` SET `status` = 'COMPLETED', `completed_at` = NOW() WHERE `id` = ? AND `status` = 'IN_PROGRESS'",
        [input.jobId],
      );
      if (updated.affectedRows !== 1) throw new JobNotCompletableError();
      await conn.query(
        'INSERT INTO `job_status_history` (`job_id`, `previous_status`, `new_status`, `changed_by`, `reason`) VALUES (?, ?, ?, ?, ?)',
        [input.jobId, 'IN_PROGRESS', 'COMPLETED', input.providerUserId, 'Provider completed job'],
      );
      await conn.commit();
      const [rows] = await this.pool.query<UpdateRow[]>(
        'SELECT `id`, `job_id`, `author_id`, `phase`, `message`, `created_at` FROM `job_updates` WHERE `id` = ? LIMIT 1',
        [updateId],
      );
      const created = (rows as UpdateRow[])[0] as UpdateRow | undefined;
      if (!created) throw new Error('Job completion failed: record not found after update.');
      return mapUpdateRow(created);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async confirmJob(input: ConfirmJobPersistInput): Promise<void> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [jobRows] = await conn.query<JobStateRow[]>(
        'SELECT `id`, `source`, `status` FROM `jobs` WHERE `id` = ? FOR UPDATE',
        [input.jobId],
      );
      const job = (jobRows as JobStateRow[])[0] as JobStateRow | undefined;
      if (!job || job.source !== 'MARKETPLACE') {
        throw new JobNotConfirmableError('Job not found.');
      }
      if (job.status !== 'COMPLETED') {
        throw new JobNotConfirmableError();
      }
      const [confirmed] = await conn.query<ResultSetHeader>(
        "UPDATE `jobs` SET `status` = 'CONFIRMED', `confirmed_at` = NOW() WHERE `id` = ? AND `status` = 'COMPLETED'",
        [input.jobId],
      );
      if (confirmed.affectedRows !== 1) throw new JobNotConfirmableError();
      await conn.query(
        'INSERT INTO `job_status_history` (`job_id`, `previous_status`, `new_status`, `changed_by`, `reason`) VALUES (?, ?, ?, ?, ?)',
        [input.jobId, 'COMPLETED', 'CONFIRMED', input.customerUserId, 'Customer confirmed job'],
      );
      const [closed] = await conn.query<ResultSetHeader>(
        "UPDATE `jobs` SET `status` = 'CLOSED', `closed_at` = NOW() WHERE `id` = ? AND `status` = 'CONFIRMED'",
        [input.jobId],
      );
      if (closed.affectedRows !== 1) throw new JobNotConfirmableError();
      await conn.query(
        'INSERT INTO `job_status_history` (`job_id`, `previous_status`, `new_status`, `changed_by`, `reason`) VALUES (?, ?, ?, ?, ?)',
        [input.jobId, 'CONFIRMED', 'CLOSED', input.customerUserId, 'Job closed after customer confirmation'],
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async listStatusHistory(jobId: string): Promise<StatusHistoryEntry[]> {
    if (!/^[1-9][0-9]*$/.test(jobId)) return [];
    const [rows] = await this.pool.query<HistoryRow[]>(
      'SELECT `job_id`, `previous_status`, `new_status`, `reason`, `created_at` FROM `job_status_history` WHERE `job_id` = ? ORDER BY `created_at` ASC, `id` ASC',
      [jobId],
    );
    return (rows as HistoryRow[]).map((row) => ({
      jobId: toStringId(row.job_id),
      previousStatus: row.previous_status,
      status: row.new_status,
      reason: row.reason,
      createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    }));
  }

  buildTimelineEvents(
    history: StatusHistoryEntry[],
    updates: JobUpdateDto[],
    images: JobImageDto[],
  ): TimelineEventDto[] {
    return buildTimelineEvents(history, updates, images);
  }
}
