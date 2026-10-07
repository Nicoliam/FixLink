/**
 * Fixlynk Stage 6B — MySQL jobs store (production implementation).
 *
 * Persists marketplace job requests in the ONE shared `jobs` table with
 * `source = MARKETPLACE`, `status = REQUESTED`, plus the initial
 * `job_status_history` entry and the provider `job_assignments` row.
 * Every value is a bound parameter — no string-interpolated SQL. The
 * `location` free text is stored in `jobs.address_line1` (the existing
 * schema has no separate suburb column); city/province stay NULL until a
 * later stage captures structured address parts.
 */
import { randomInt } from 'node:crypto';
import type { Connection, Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  JobNotMutableError,
  JobRequestImageRejected,
  OPEN_REQUEST_SCAN_LIMIT,
  type CustomerProvision,
  type JobsStore,
  type OpenJobQuery,
} from './jobs.store';
import type {
  ActiveServiceRef,
  CustomerProfileRef,
  JobDto,
  JobStatus,
  PersistJobInput,
  RequestImagePersistInput,
} from './jobs.types';
import {
  CUSTOMER_MUTABLE_STATUSES,
  MAX_REQUEST_IMAGES_PER_JOB,
  REQUEST_IMAGE_STATUSES,
} from './jobs.types';
import type { PersistJobUpdateInput } from './jobs.types';
import type { JobImageDto } from '../execution/execution.types';

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

interface CustomerRow extends RowDataPacket {
  id: number;
}

interface ServiceRow extends RowDataPacket {
  id: number;
  name: string;
  slug: string;
  category_id: number;
  category_name: string;
}

interface JobRow extends RowDataPacket {
  id: number;
  reference: string;
  source: 'MARKETPLACE' | 'INTERNAL';
  status: JobStatus;
  customer_id: number;
  professional_id: number | null;
  business_id: number | null;
  professional_name: string | null;
  business_name: string | null;
  service_id: number | null;
  service_name: string | null;
  service_slug: string | null;
  service_category_id: number | null;
  service_category_name: string | null;
  description: string;
  address_line1: string | null;
  city: string | null;
  province: string | null;
  scheduled_at: Date | string | null;
  agreed_amount: number | string | null;
  currency: string;
  completed_at: Date | string | null;
  confirmed_at: Date | string | null;
  closed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapRow(row: JobRow): JobDto {
  // Step 14: both provider columns null means an open request. The previous
  // fallback (`business-${row.business_id}`) would have produced the literal
  // string "business-null" as both a provider id and a display name, which is
  // worse than admitting there is no provider.
  const isProfessional = row.professional_id !== null;
  const isBusiness = row.business_id !== null;
  const providerId = isProfessional ? `professional-${row.professional_id}` : `business-${row.business_id}`;
  const providerName = isProfessional ? (row.professional_name ?? providerId) : (row.business_name ?? providerId);
  const scheduledAt = toIso(row.scheduled_at);
  return {
    id: toStringId(row.id),
    reference: row.reference,
    source: row.source,
    status: row.status,
    customerId: toStringId(row.customer_id),
    provider: isProfessional || isBusiness
      ? {
          id: providerId,
          providerType: isProfessional ? 'professional' : 'business',
          name: providerName,
        }
      : null,
    service: {
      id: row.service_id === null ? '' : toStringId(row.service_id),
      name: row.service_name ?? '',
      slug: row.service_slug ?? '',
      categoryId: row.service_category_id === null ? '' : toStringId(row.service_category_id),
      categoryName: row.service_category_name ?? '',
    },
    description: row.description,
    location: row.address_line1 ?? '',
    city: row.city,
    province: row.province,
    preferredDate: scheduledAt === null ? null : scheduledAt.slice(0, 10),
    scheduledAt,
    agreedAmount: row.agreed_amount === null ? null : toNumber(row.agreed_amount),
    currency: row.currency,
    completedAt: toIso(row.completed_at),
    confirmedAt: toIso(row.confirmed_at),
    closedAt: toIso(row.closed_at),
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

const JOB_DETAIL_SELECT = `
  SELECT j.\`id\`, j.\`reference\`, j.\`source\`, j.\`status\`, j.\`customer_id\`,
         j.\`professional_id\`, j.\`business_id\`,
         pp.\`display_name\` AS \`professional_name\`,
         bp.\`business_name\` AS \`business_name\`,
         j.\`service_id\`, s.\`name\` AS \`service_name\`, s.\`slug\` AS \`service_slug\`,
         s.\`category_id\` AS \`service_category_id\`, c.\`name\` AS \`service_category_name\`,
         j.\`description\`, j.\`address_line1\`, j.\`city\`, j.\`province\`,
         j.\`scheduled_at\`, j.\`agreed_amount\`, j.\`currency\`,
         j.\`completed_at\`, j.\`confirmed_at\`, j.\`closed_at\`,
         j.\`created_at\`, j.\`updated_at\`
     FROM \`jobs\` j
    LEFT JOIN \`professional_profiles\` pp ON pp.\`id\` = j.\`professional_id\`
    LEFT JOIN \`business_profiles\` bp ON bp.\`id\` = j.\`business_id\`
    LEFT JOIN \`services\` s ON s.\`id\` = j.\`service_id\`
    LEFT JOIN \`service_categories\` c ON c.\`id\` = s.\`category_id\``;

export class MysqlJobsStore implements JobsStore {
  constructor(private readonly pool: Pool) {}

  async findCustomerProfileByUserId(userId: string): Promise<CustomerProfileRef | null> {
    const [rows] = await this.pool.query<CustomerRow[]>(
      'SELECT `id` FROM `customer_profiles` WHERE `user_id` = ? AND `deleted_at` IS NULL LIMIT 1',
      [userId],
    );
    if (rows.length === 0) return null;
    return { id: toStringId((rows[0] as CustomerRow).id) };
  }

  /**
   * Stage 8 — reverse lookup for notification recipients: the login
   * user id behind a customer profile (null for business-managed
   * `user_id = NULL` rows, which never receive notifications).
   */
  async findUserIdByCustomerId(customerId: string): Promise<string | null> {
    if (!/^[1-9][0-9]*$/.test(customerId)) return null;
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT `user_id` FROM `customer_profiles` WHERE `id` = ? AND `deleted_at` IS NULL LIMIT 1',
      [customerId],
    );
    if (rows.length === 0) return null;
    const userId = (rows[0] as RowDataPacket)['user_id'] as number | null;
    return userId === null || userId === undefined ? null : String(userId);
  }

  async createCustomerProfile(userId: string, provision: CustomerProvision): Promise<CustomerProfileRef> {
    try {
      await this.pool.query(
        'INSERT INTO `customer_profiles` (`user_id`, `first_name`, `last_name`, `email`) VALUES (?, ?, ?, ?)',
        [userId, provision.firstName, provision.lastName, provision.email],
      );
    } catch (err) {
      if ((err as { code?: string } | null)?.code !== 'ER_DUP_ENTRY') throw err;
      // Lost a check-then-insert race: re-read the winner's row.
    }
    const existing = await this.findCustomerProfileByUserId(userId);
    if (!existing) throw new Error('Customer profile creation failed: row not found after insert.');
    return existing;
  }

  async createRequestImage(input: RequestImagePersistInput): Promise<JobImageDto> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      // Lock the job row so the state gate and the photo cap cannot be raced:
      // two concurrent uploads would otherwise both read REQUESTED and both
      // insert, exceeding the cap.
      const [jobRows] = await connection.query<RowDataPacket[]>(
        'SELECT `id`, `status` FROM `jobs` WHERE `id` = ? FOR UPDATE',
        [Number(input.jobId)],
      );
      if (jobRows.length === 0) {
        throw new JobRequestImageRejected('NOT_FOUND', 'Job not found.');
      }
      const status = String(jobRows[0]['status']);
      if (!REQUEST_IMAGE_STATUSES.includes(status as JobStatus)) {
        throw new JobRequestImageRejected(
          'INVALID_STATE',
          'This request is no longer accepting photos of the problem.',
        );
      }
      const [countRows] = await connection.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS `n` FROM `job_images` WHERE `job_id` = ? AND `context` = 'REQUEST'",
        [Number(input.jobId)],
      );
      if (Number(countRows[0]?.['n'] ?? 0) >= MAX_REQUEST_IMAGES_PER_JOB) {
        throw new JobRequestImageRejected(
          'TOO_MANY',
          `You can attach up to ${MAX_REQUEST_IMAGES_PER_JOB} photos to a request.`,
        );
      }

      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO \`job_images\`
           (\`job_id\`, \`uploader_id\`, \`phase\`, \`context\`, \`file_reference\`,
            \`original_filename\`, \`mime_type\`, \`file_size\`)
         VALUES (?, ?, 'BEFORE', 'REQUEST', ?, ?, ?, ?)`,
        [
          Number(input.jobId),
          Number(input.uploadedBy),
          input.storageKey,
          input.originalFilename,
          input.mimeType,
          input.size,
        ],
      );
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT \`id\`, \`job_id\`, \`uploader_id\`, \`created_at\`
           FROM \`job_images\` WHERE \`id\` = ?`,
        [result.insertId],
      );
      await connection.commit();
      if (rows.length === 0) throw new Error('Request image insert returned no row.');
      return {
        id: String(rows[0]['id']),
        jobId: String(rows[0]['job_id']),
        uploadedBy: String(rows[0]['uploader_id'] ?? ''),
        // The column is NOT NULL with no default, and BEFORE is the only honest
        // value: the photo was taken before any work. `context` is what actually
        // distinguishes it from a professional's Before photo.
        phase: 'BEFORE',
        context: 'REQUEST',
        originalFilename: input.originalFilename,
        mimeType: input.mimeType,
        size: input.size,
        createdAt: toIso(rows[0]['created_at'] as Date | string) ?? '',
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async findActiveService(serviceId: string): Promise<ActiveServiceRef | null> {
    const [rows] = await this.pool.query<ServiceRow[]>(
      `SELECT s.\`id\`, s.\`name\`, s.\`slug\`
         FROM \`services\` s
         INNER JOIN \`service_categories\` c ON c.\`id\` = s.\`category_id\`
        WHERE s.\`id\` = ? AND s.\`is_active\` = 1 AND c.\`is_active\` = 1
        LIMIT 1`,
      [serviceId],
    );
    if (rows.length === 0) return null;
    const row = rows[0] as ServiceRow;
    return {
      id: toStringId(row.id),
      name: row.name,
      slug: row.slug,
      categoryId: toStringId(row.category_id),
      categoryName: row.category_name,
    };
  }

  async createJob(input: PersistJobInput): Promise<JobDto> {
    // Reference comes from the service; retried with a random suffix on the
    // (unlikely) unique collision. Column is VARCHAR(32).
    const isOpenRequest = input.providerType === null || input.providerNumericId === null;
    let reference = input.reference;
    let jobId = 0;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const [result] = await this.pool.query(
          `INSERT INTO \`jobs\`
             (\`reference\`, \`source\`, \`customer_id\`, \`professional_id\`, \`business_id\`,
              \`service_id\`, \`description\`, \`address_line1\`, \`scheduled_at\`,
              \`status\`, \`currency\`, \`created_by\`)
           VALUES (?, 'MARKETPLACE', ?, ?, ?, ?, ?, ?, ?, 'REQUESTED', 'ZAR', ?)`,
          [
            reference,
            input.customerId,
            input.providerType === 'professional' ? input.providerNumericId : null,
            input.providerType === 'business' ? input.providerNumericId : null,
            input.serviceId,
            input.description,
            input.location,
            input.scheduledAt,
            input.createdBy,
          ],
        );
        jobId = Number((result as { insertId: number }).insertId);
        break;
      } catch (err) {
        if ((err as { code?: string } | null)?.code !== 'ER_DUP_ENTRY' || attempt === 4) throw err;
        reference = `${input.reference.slice(0, 24)}-${randomInt(0, 10000)}`;
      }
    }
    await this.pool.query(
      'INSERT INTO `job_status_history` (`job_id`, `previous_status`, `new_status`, `changed_by`, `reason`) VALUES (?, NULL, ?, ?, ?)',
      [jobId, 'REQUESTED', input.createdBy, 'Customer submitted request'],
    );
    // Step 14: an open request has no provider to assign, and
    // `job_assignments.assignment_type` has no unassigned value. Writing a
    // BUSINESS row with a null id would fabricate an assignment to nobody.
    if (!isOpenRequest && input.providerType !== null && input.providerNumericId !== null) {
      await this.pool.query(
        'INSERT INTO `job_assignments` (`job_id`, `assignment_type`, `professional_id`, `business_id`, `assigned_by`) VALUES (?, ?, ?, ?, ?)',
        [
          jobId,
          input.providerType === 'professional' ? 'PROFESSIONAL' : 'BUSINESS',
          input.providerType === 'professional' ? input.providerNumericId : null,
          input.providerType === 'business' ? input.providerNumericId : null,
          input.createdBy,
        ],
      );
    }
    const created = await this.getJobById(String(jobId));
    if (!created) throw new Error('Job creation failed: row not found after insert.');
    return created;
  }

  /**
   * Step 15 - lock the job row and confirm the customer may still change it.
   *
   * Shared by updateJob and cancelJob so both are gated identically and both
   * hold the lock for the whole of their transaction. The re-read is what
   * makes the gate race-free against an acceptance landing at the same moment.
   */
  private async lockMutableJob(conn: Connection, jobId: string): Promise<{ status: JobStatus }> {
    const [rows] = await conn.query<JobRow[]>(
      'SELECT `id`, `status` FROM `jobs` WHERE `id` = ? AND `deleted_at` IS NULL FOR UPDATE',
      [jobId],
    );
    const job = (rows as JobRow[])[0];
    if (!job) throw new JobNotMutableError('NOT_FOUND', 'Job not found.');
    if (!(CUSTOMER_MUTABLE_STATUSES as readonly string[]).includes(job.status)) {
      throw new JobNotMutableError();
    }
    return job;
  }

  async updateJob(input: PersistJobUpdateInput): Promise<JobDto> {
    const sets: string[] = [];
    const params: Array<string | null> = [];
    if (input.patch.description !== undefined) {
      sets.push('`description` = ?');
      params.push(input.patch.description);
    }
    if (input.patch.location !== undefined) {
      sets.push('`address_line1` = ?');
      params.push(input.patch.location);
    }
    if (input.patch.scheduledAt !== undefined) {
      sets.push('`scheduled_at` = ?');
      params.push(input.patch.scheduledAt);
    }
    if (sets.length === 0) return this.requireJob(input.jobId);

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      await this.lockMutableJob(conn, input.jobId);
      await conn.query(`UPDATE \`jobs\` SET ${sets.join(', ')} WHERE \`id\` = ?`, [
        ...params,
        input.jobId,
      ]);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    return this.requireJob(input.jobId);
  }

  async cancelJob(jobId: string, cancelledBy: string): Promise<JobDto> {
    const conn = await this.pool.getConnection();
    let previous: JobStatus = 'REQUESTED';
    try {
      await conn.beginTransaction();
      const locked = await this.lockMutableJob(conn, jobId);
      previous = locked.status;
      // Guarded on the same status the lock just confirmed, so a concurrent
      // transition cannot make this write land on a job it should not.
      const [updated] = await conn.query<ResultSetHeader>(
        "UPDATE `jobs` SET `status` = 'CANCELLED' WHERE `id` = ? AND `status` = ?",
        [jobId, previous],
      );
      if (updated.affectedRows !== 1) throw new JobNotMutableError();
      await conn.query(
        'INSERT INTO `job_status_history` (`job_id`, `previous_status`, `new_status`, `changed_by`, `reason`) VALUES (?, ?, ?, ?, ?)',
        [jobId, previous, 'CANCELLED', cancelledBy, 'Customer cancelled request'],
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    return this.requireJob(jobId);
  }

  async deleteJob(jobId: string): Promise<void> {
    // No history row: a delete is not a status transition, and
    // `job_status_history` records transitions only (AGENTS.md section 37).
    const [result] = await this.pool.query<ResultSetHeader>(
      'UPDATE `jobs` SET `deleted_at` = NOW() WHERE `id` = ? AND `deleted_at` IS NULL',
      [jobId],
    );
    if (result.affectedRows === 0) {
      // Either unknown or already deleted. Ownership is resolved by the caller
      // before this runs, so this is a lost race or a genuinely absent row.
      const [rows] = await this.pool.query<RowDataPacket[]>(
        'SELECT 1 AS `hit` FROM `jobs` WHERE `id` = ? LIMIT 1',
        [jobId],
      );
      if (rows.length === 0) throw new JobNotMutableError('NOT_FOUND', 'Job not found.');
    }
  }

  /** Re-read a job after a write, failing loudly rather than returning a stub. */
  private async requireJob(jobId: string): Promise<JobDto> {
    // `deleted_at IS NULL` matters here too: a delete followed immediately by a
    // read of the same job must not resurrect it.
    const [rows] = await this.pool.query<JobRow[]>(
      `${JOB_DETAIL_SELECT} WHERE j.\`id\` = ? AND j.\`deleted_at\` IS NULL LIMIT 1`,
      [jobId],
    );
    if (rows.length === 0) throw new Error('Job update failed: row not found after write.');
    return mapRow(rows[0] as JobRow);
  }

  async getJobById(jobId: string): Promise<JobDto | null> {
    if (!/^[1-9][0-9]*$/.test(jobId)) return null;
    // Step 15: a soft-deleted job must read as absent everywhere, not just in
    // the customer's list. Without this the owner kept a working detail URL
    // for a request they had already removed.
    const [rows] = await this.pool.query<JobRow[]>(
      `${JOB_DETAIL_SELECT} WHERE j.\`id\` = ? AND j.\`deleted_at\` IS NULL LIMIT 1`,
      [jobId],
    );
    if (rows.length === 0) return null;
    return mapRow(rows[0] as JobRow);
  }

  async listJobsByCustomerId(
    customerId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: JobDto[]; total: number }> {
    interface CountRow extends RowDataPacket {
      total: number;
    }
    const [countRows] = await this.pool.query<CountRow[]>(
      "SELECT COUNT(*) AS `total` FROM `jobs` WHERE `customer_id` = ? AND `source` = 'MARKETPLACE' AND `deleted_at` IS NULL",
      [customerId],
    );
    const total = Number((countRows[0] as CountRow | undefined)?.total ?? 0);
    if (total === 0) return { items: [], total: 0 };
    const offset = (page - 1) * pageSize;
    const [rows] = await this.pool.query<JobRow[]>(
      `${JOB_DETAIL_SELECT} WHERE j.\`customer_id\` = ? AND j.\`source\` = 'MARKETPLACE' AND j.\`deleted_at\` IS NULL ORDER BY j.\`created_at\` DESC LIMIT ? OFFSET ?`,
      [customerId, pageSize, offset],
    );
    return { items: (rows as JobRow[]).map(mapRow), total };
  }

  /**
   * Step 14 — open requests this provider's categories reach.
   *
   * The `professional_id IS NULL AND business_id IS NULL` pair is the whole
   * definition of "open" and is served by `idx_jobs_open_board` (migration
   * 018); the existing single-column provider indexes cannot help because a
   * NULL never matches an index range.
   *
   * The active-quote count is a correlated subquery rather than a join, so a
   * job with several quotes is counted once and cannot appear twice. It is
   * bounded by the 3-quote cap in practice, so the subquery cost is trivial.
   *
   * No area test here — see the store contract; the service narrows.
   */
  async listOpenJobs(query: OpenJobQuery): Promise<JobDto[]> {
    if (query.categoryIds.length === 0 || query.statuses.length === 0) return [];
    const validCategories = query.categoryIds.filter((id) => /^[1-9][0-9]*$/.test(id));
    if (validCategories.length === 0) return [];
    const validQuoted = query.quotedJobIds.filter((id) => /^[1-9][0-9]*$/.test(id));
    const maxQuotes = Math.max(0, Math.trunc(query.maxQuotes));

    const params: unknown[] = [...validCategories];
    const categoryPlaceholders = validCategories.map(() => '?').join(', ');
    const statusPlaceholders = query.statuses.map(() => '?').join(', ');
    params.push(...query.statuses, maxQuotes);

    const quotedClause = validQuoted.length > 0
      ? `AND j.\`id\` NOT IN (${validQuoted.map(() => '?').join(', ')})`
      : '';
    params.push(...validQuoted);
    params.push(OPEN_REQUEST_SCAN_LIMIT);

    const [rows] = await this.pool.query<JobRow[]>(
      `${JOB_DETAIL_SELECT}
        WHERE j.\`source\` = 'MARKETPLACE'
          AND j.\`deleted_at\` IS NULL
          AND j.\`professional_id\` IS NULL
          AND j.\`business_id\` IS NULL
          AND s.\`category_id\` IN (${categoryPlaceholders})
          AND j.\`status\` IN (${statusPlaceholders})
          AND (
            SELECT COUNT(*) FROM \`quotes\` q
             WHERE q.\`job_id\` = j.\`id\` AND q.\`status\` IN ('DRAFT','SUBMITTED')
          ) < ?
          ${quotedClause}
        ORDER BY j.\`created_at\` DESC
        LIMIT ?`,
      params,
    );
    return (rows as JobRow[]).map(mapRow);
  }
}
