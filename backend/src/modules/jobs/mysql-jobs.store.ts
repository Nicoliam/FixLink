/**
 * FixLink Stage 6B — MySQL jobs store (production implementation).
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
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { CustomerProvision, JobsStore } from './jobs.store';
import type { ActiveServiceRef, CustomerProfileRef, JobDto, JobStatus, PersistJobInput } from './jobs.types';

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
  const isProfessional = row.professional_id !== null;
  const providerId = isProfessional ? `professional-${row.professional_id}` : `business-${row.business_id}`;
  const providerName = isProfessional ? (row.professional_name ?? providerId) : (row.business_name ?? providerId);
  const scheduledAt = toIso(row.scheduled_at);
  return {
    id: toStringId(row.id),
    reference: row.reference,
    source: row.source,
    status: row.status,
    customerId: toStringId(row.customer_id),
    provider: {
      id: providerId,
      providerType: isProfessional ? 'professional' : 'business',
      name: providerName,
    },
    service: {
      id: row.service_id === null ? '' : toStringId(row.service_id),
      name: row.service_name ?? '',
      slug: row.service_slug ?? '',
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
          j.\`description\`, j.\`address_line1\`, j.\`city\`, j.\`province\`,
          j.\`scheduled_at\`, j.\`agreed_amount\`, j.\`currency\`,
          j.\`completed_at\`, j.\`confirmed_at\`, j.\`closed_at\`,
          j.\`created_at\`, j.\`updated_at\`
     FROM \`jobs\` j
    LEFT JOIN \`professional_profiles\` pp ON pp.\`id\` = j.\`professional_id\`
    LEFT JOIN \`business_profiles\` bp ON bp.\`id\` = j.\`business_id\`
    LEFT JOIN \`services\` s ON s.\`id\` = j.\`service_id\``;

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
    return { id: toStringId(row.id), name: row.name, slug: row.slug };
  }

  async createJob(input: PersistJobInput): Promise<JobDto> {
    // Reference comes from the service; retried with a random suffix on the
    // (unlikely) unique collision. Column is VARCHAR(32).
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
    const created = await this.getJobById(String(jobId));
    if (!created) throw new Error('Job creation failed: row not found after insert.');
    return created;
  }

  async getJobById(jobId: string): Promise<JobDto | null> {
    if (!/^[1-9][0-9]*$/.test(jobId)) return null;
    const [rows] = await this.pool.query<JobRow[]>(`${JOB_DETAIL_SELECT} WHERE j.\`id\` = ? LIMIT 1`, [jobId]);
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
      'SELECT COUNT(*) AS `total` FROM `jobs` WHERE `customer_id` = ? AND `deleted_at` IS NULL',
      [customerId],
    );
    const total = Number((countRows[0] as CountRow | undefined)?.total ?? 0);
    if (total === 0) return { items: [], total: 0 };
    const offset = (page - 1) * pageSize;
    const [rows] = await this.pool.query<JobRow[]>(
      `${JOB_DETAIL_SELECT} WHERE j.\`customer_id\` = ? AND j.\`deleted_at\` IS NULL ORDER BY j.\`created_at\` DESC LIMIT ? OFFSET ?`,
      [customerId, pageSize, offset],
    );
    return { items: (rows as JobRow[]).map(mapRow), total };
  }
}
