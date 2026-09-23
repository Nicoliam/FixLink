/**
 * FixLink Stage 6C — MySQL quotes store (production implementation).
 *
 * Reuses the existing `quotes`, `quote_items`, `jobs` and
 * `job_status_history` tables — no migration was required. Every value is
 * a bound parameter. Quote creation + the REQUESTED → QUOTED transition
 * run in one transaction so they cannot become inconsistent; the status
 * update is guarded by `AND status = 'REQUESTED'` so a concurrent quote
 * cannot double-transition the job.
 */
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { JobDto, JobStatus } from '../jobs/jobs.types';
import {
  JobNotAcceptableError,
  JobNotQuoteableError,
  QuoteAlreadyAcceptedError,
  QuoteConflictError,
  QuoteNotEligibleError,
  type AcceptQuotePersistInput,
  type AcceptQuoteResult,
  type CreateQuotePersistInput,
  type ProviderRequestFilter,
  type QuotesStore,
} from './quotes.store';
import type {
  BusinessIdentity,
  ProfessionalIdentity,
  ProviderRequestDto,
  QuoteDto,
  QuoteItemDto,
  QuoteStatus,
} from './quotes.types';

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

function displayNameOf(firstName: string | null, lastName: string | null): string {
  const first = (firstName ?? '').trim() || 'Customer';
  const initial = (lastName ?? '').trim().charAt(0);
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
}

interface ProfileRow extends RowDataPacket {
  id: number;
}

interface MemberRow extends RowDataPacket {
  business_id: number;
  role: 'BUSINESS_OWNER' | 'BUSINESS_MANAGER' | 'TECHNICIAN';
}

interface CustomerRow extends RowDataPacket {
  first_name: string | null;
  last_name: string | null;
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
  created_at: Date | string;
}

interface QuoteRow extends RowDataPacket {
  id: number;
  job_id: number;
  professional_id: number | null;
  business_id: number | null;
  professional_name: string | null;
  business_name: string | null;
  total: number | string;
  currency: string;
  description: string | null;
  status: QuoteStatus;
  submitted_at: Date | string | null;
  created_at: Date | string;
}

interface QuoteItemRow extends RowDataPacket {
  id: number;
  quote_id: number;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  total: number | string;
  sort_order: number;
}

const JOB_DETAIL_SELECT = `
  SELECT j.\`id\`, j.\`reference\`, j.\`source\`, j.\`status\`, j.\`customer_id\`,
         j.\`professional_id\`, j.\`business_id\`,
         pp.\`display_name\` AS \`professional_name\`,
         bp.\`business_name\` AS \`business_name\`,
         j.\`service_id\`, s.\`name\` AS \`service_name\`, s.\`slug\` AS \`service_slug\`,
         j.\`description\`, j.\`address_line1\`, j.\`city\`, j.\`province\`,
         j.\`scheduled_at\`, j.\`created_at\`
    FROM \`jobs\` j
    LEFT JOIN \`professional_profiles\` pp ON pp.\`id\` = j.\`professional_id\`
    LEFT JOIN \`business_profiles\` bp ON bp.\`id\` = j.\`business_id\`
    LEFT JOIN \`services\` s ON s.\`id\` = j.\`service_id\``;

const QUOTE_DETAIL_SELECT = `
  SELECT q.\`id\`, q.\`job_id\`, q.\`professional_id\`, q.\`business_id\`,
         pp.\`display_name\` AS \`professional_name\`,
         bp.\`business_name\` AS \`business_name\`,
         q.\`total\`, q.\`currency\`, q.\`description\`, q.\`status\`,
         q.\`submitted_at\`, q.\`created_at\`
    FROM \`quotes\` q
    LEFT JOIN \`professional_profiles\` pp ON pp.\`id\` = q.\`professional_id\`
    LEFT JOIN \`business_profiles\` bp ON bp.\`id\` = q.\`business_id\``;

function mapJobRow(row: JobRow): Omit<ProviderRequestDto, 'customer' | 'quotes'> {
  const isProfessional = row.professional_id !== null;
  const providerId = isProfessional ? `professional-${row.professional_id}` : `business-${row.business_id}`;
  const scheduledAt = toIso(row.scheduled_at);
  return {
    id: toStringId(row.id),
    reference: row.reference,
    source: row.source,
    status: row.status,
    provider: {
      id: providerId,
      providerType: isProfessional ? 'professional' : 'business',
      name: isProfessional ? (row.professional_name ?? providerId) : (row.business_name ?? providerId),
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
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
  };
}

export class MysqlQuotesStore implements QuotesStore {
  constructor(private readonly pool: Pool) {}

  async findProfessionalProfileByUserId(userId: string): Promise<ProfessionalIdentity | null> {
    const [rows] = await this.pool.query<ProfileRow[]>(
      'SELECT `id` FROM `professional_profiles` WHERE `user_id` = ? AND `deleted_at` IS NULL LIMIT 1',
      [userId],
    );
    if (rows.length === 0) return null;
    return { id: toStringId((rows[0] as ProfileRow).id) };
  }

  async findBusinessIdsForUser(userId: string): Promise<BusinessIdentity[]> {
    const identities = new Map<string, BusinessIdentity>();
    const [owned] = await this.pool.query<ProfileRow[]>(
      'SELECT `id` FROM `business_profiles` WHERE `owner_user_id` = ? AND `deleted_at` IS NULL',
      [userId],
    );
    for (const row of owned as ProfileRow[]) {
      identities.set(toStringId(row.id), { businessId: toStringId(row.id), role: 'OWNER' });
    }
    const [memberships] = await this.pool.query<MemberRow[]>(
      'SELECT `business_id`, `role` FROM `business_members` WHERE `user_id` = ? AND `is_active` = 1',
      [userId],
    );
    // TECHNICIAN members are never marketplace providers — ignore them.
    for (const row of memberships as MemberRow[]) {
      if (row.role === 'TECHNICIAN') continue;
      const businessId = toStringId(row.business_id);
      const role = row.role === 'BUSINESS_OWNER' ? 'OWNER' : 'MANAGER';
      const existing = identities.get(businessId);
      if (!existing || (existing.role === 'MANAGER' && role === 'OWNER')) {
        identities.set(businessId, { businessId, role });
      }
    }
    return [...identities.values()];
  }

  async listProviderRequests(filter: ProviderRequestFilter): Promise<{ items: ProviderRequestDto[]; total: number }> {
    const statuses = filter.statuses.length > 0 ? filter.statuses : ['REQUESTED', 'QUOTED'];
    const clauses: string[] = ['j.`source` = \'MARKETPLACE\'', 'j.`deleted_at` IS NULL'];
    const params: Array<string | number> = [];
    const ownership: string[] = [];
    if (filter.professionalIds.length > 0) {
      ownership.push(`j.\`professional_id\` IN (${filter.professionalIds.map(() => '?').join(', ')})`);
      params.push(...filter.professionalIds);
    }
    if (filter.businessIds.length > 0) {
      ownership.push(`j.\`business_id\` IN (${filter.businessIds.map(() => '?').join(', ')})`);
      params.push(...filter.businessIds);
    }
    if (ownership.length === 0) return { items: [], total: 0 };
    clauses.push(`(${ownership.join(' OR ')})`);
    clauses.push(`j.\`status\` IN (${statuses.map(() => '?').join(', ')})`);
    params.push(...statuses);
    const where = `WHERE ${clauses.join(' AND ')}`;

    interface CountRow extends RowDataPacket {
      total: number;
    }
    const [countRows] = await this.pool.query<CountRow[]>(`SELECT COUNT(*) AS \`total\` FROM \`jobs\` j ${where}`, params);
    const total = Number((countRows[0] as CountRow | undefined)?.total ?? 0);
    if (total === 0) return { items: [], total: 0 };
    const offset = (filter.page - 1) * filter.pageSize;
    const [rows] = await this.pool.query<JobRow[]>(
      `${JOB_DETAIL_SELECT} ${where} ORDER BY j.\`created_at\` DESC LIMIT ? OFFSET ?`,
      [...params, filter.pageSize, offset],
    );
    const items: ProviderRequestDto[] = [];
    for (const row of rows as JobRow[]) {
      const base = mapJobRow(row);
      items.push({
        ...base,
        customer: { displayName: await this.findCustomerDisplayName(toStringId(row.customer_id)) },
        quotes: await this.listQuotesByJobId(toStringId(row.id)),
      });
    }
    return { items, total };
  }

  async findCustomerDisplayName(customerId: string): Promise<string> {
    if (!/^[1-9][0-9]*$/.test(customerId)) return 'Customer';
    const [rows] = await this.pool.query<CustomerRow[]>(
      'SELECT `first_name`, `last_name` FROM `customer_profiles` WHERE `id` = ? LIMIT 1',
      [customerId],
    );
    if (rows.length === 0) return 'Customer';
    const row = rows[0] as CustomerRow;
    return displayNameOf(row.first_name, row.last_name);
  }

  async createQuote(input: CreateQuotePersistInput): Promise<QuoteDto> {
    const expectedProfessionalId = input.providerType === 'professional' ? input.providerNumericId : null;
    const expectedBusinessId = input.providerType === 'business' ? input.providerNumericId : null;
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [jobRows] = await conn.query<JobRow[]>(
        'SELECT `id`, `source`, `status`, `professional_id`, `business_id` FROM `jobs` WHERE `id` = ? FOR UPDATE',
        [input.job.id],
      );
      const job = (jobRows as JobRow[])[0] as JobRow | undefined;
      const addressedHere =
        job !== undefined &&
        ((expectedProfessionalId !== null && String(job.professional_id ?? '') === expectedProfessionalId) ||
          (expectedBusinessId !== null && String(job.business_id ?? '') === expectedBusinessId));
      if (!job || job.source !== 'MARKETPLACE' || !addressedHere) {
        throw new JobNotQuoteableError('This job is not addressed to your provider profile.');
      }
      // Duplicate check before the status check: a second submission from
      // the same provider is always a conflict, even though the job is
      // already QUOTED by the first submission.
      const [existing] = await conn.query<RowDataPacket[]>(
        `SELECT \`id\` FROM \`quotes\`
          WHERE \`job_id\` = ? AND \`status\` IN ('DRAFT', 'SUBMITTED')
            AND ((\`professional_id\` IS NOT NULL AND \`professional_id\` = ?)
              OR (\`business_id\` IS NOT NULL AND \`business_id\` = ?))
          LIMIT 1`,
        [input.job.id, expectedProfessionalId, expectedBusinessId],
      );
      if ((existing as RowDataPacket[]).length > 0) throw new QuoteConflictError();
      if (job.status !== 'REQUESTED') {
        throw new JobNotQuoteableError('This job can no longer be quoted.');
      }

      const [quoteResult] = await conn.query<ResultSetHeader>(
        `INSERT INTO \`quotes\`
           (\`job_id\`, \`professional_id\`, \`business_id\`, \`total\`, \`currency\`,
            \`description\`, \`status\`, \`submitted_at\`, \`created_by\`)
         VALUES (?, ?, ?, ?, ?, ?, 'SUBMITTED', NOW(), ?)`,
        [
          input.job.id,
          expectedProfessionalId,
          expectedBusinessId,
          input.input.total,
          input.input.currency,
          input.input.message,
          input.createdBy,
        ],
      );
      const quoteId = Number(quoteResult.insertId);
      for (let index = 0; index < input.input.items.length; index += 1) {
        const item = input.input.items[index] as { description: string; quantity: number; unitPrice: number };
        await conn.query(
          'INSERT INTO `quote_items` (`quote_id`, `description`, `quantity`, `unit_price`, `sort_order`) VALUES (?, ?, ?, ?, ?)',
          [quoteId, item.description, item.quantity, item.unitPrice, index],
        );
      }
      const [updated] = await conn.query<ResultSetHeader>(
        'UPDATE `jobs` SET `status` = \'QUOTED\' WHERE `id` = ? AND `status` = \'REQUESTED\'',
        [input.job.id],
      );
      if (updated.affectedRows !== 1) throw new JobNotQuoteableError();
      await conn.query(
        'INSERT INTO `job_status_history` (`job_id`, `previous_status`, `new_status`, `changed_by`, `reason`) VALUES (?, ?, ?, ?, ?)',
        [input.job.id, 'REQUESTED', 'QUOTED', input.createdBy, 'Provider submitted quote'],
      );
      await conn.commit();
      const created = await this.getQuoteById(String(quoteId));
      if (!created) throw new Error('Quote creation failed: row not found after insert.');
      return created;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async acceptQuote(input: AcceptQuotePersistInput): Promise<AcceptQuoteResult> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [jobRows] = await conn.query<JobRow[]>(
        'SELECT `id`, `source`, `status` FROM `jobs` WHERE `id` = ? FOR UPDATE',
        [input.jobId],
      );
      const job = (jobRows as JobRow[])[0] as JobRow | undefined;
      // Authorization (customer ownership, quote↔job match) is enforced
      // by the service before this call; the store re-validates state
      // under lock so concurrent accepts cannot double-transition.
      if (!job || job.source !== 'MARKETPLACE') {
        throw new JobNotAcceptableError('Quote not found.');
      }
      const [quoteRows] = await conn.query<QuoteRow[]>(
        'SELECT `id`, `job_id`, `status`, `total`, `currency` FROM `quotes` WHERE `id` = ? FOR UPDATE',
        [input.quoteId],
      );
      const target = (quoteRows as QuoteRow[])[0] as QuoteRow | undefined;
      if (!target || String(target.job_id) !== String(job.id)) {
        throw new JobNotAcceptableError('Quote not found.');
      }
      if (target.status === 'ACCEPTED') throw new QuoteAlreadyAcceptedError();
      if (target.status !== 'SUBMITTED') throw new QuoteNotEligibleError();
      if (job.status !== 'QUOTED') throw new JobNotAcceptableError();

      const [accepted] = await conn.query<ResultSetHeader>(
        "UPDATE `quotes` SET `status` = 'ACCEPTED', `accepted_at` = NOW() WHERE `id` = ? AND `status` = 'SUBMITTED'",
        [input.quoteId],
      );
      if (accepted.affectedRows !== 1) throw new QuoteNotEligibleError();
      // Competing quotes are retired, never deleted: they stay visible
      // as DECLINED so neither side can re-select them.
      const [retired] = await conn.query<ResultSetHeader>(
        `UPDATE \`quotes\` SET \`status\` = 'DECLINED', \`declined_at\` = NOW()
          WHERE \`job_id\` = ? AND \`id\` <> ? AND \`status\` IN ('DRAFT', 'SUBMITTED')`,
        [input.jobId, input.quoteId],
      );
      void retired;
      const [jobUpdated] = await conn.query<ResultSetHeader>(
        "UPDATE `jobs` SET `status` = 'ACCEPTED', `agreed_amount` = ?, `currency` = ? WHERE `id` = ? AND `status` = 'QUOTED'",
        [toNumber(target.total), target.currency, input.jobId],
      );
      if (jobUpdated.affectedRows !== 1) throw new JobNotAcceptableError();
      await conn.query(
        'INSERT INTO `job_status_history` (`job_id`, `previous_status`, `new_status`, `changed_by`, `reason`) VALUES (?, ?, ?, ?, ?)',
        [input.jobId, 'QUOTED', 'ACCEPTED', input.acceptedBy, 'Customer accepted provider quote'],
      );
      await conn.commit();
      const [retiredRows] = await this.pool.query<QuoteRow[]>(
        `${QUOTE_DETAIL_SELECT} WHERE q.\`job_id\` = ? AND q.\`status\` = 'DECLINED'`,
        [input.jobId],
      );
      const created = await this.getQuoteById(input.quoteId);
      if (!created) throw new Error('Quote acceptance failed: row not found after update.');
      return {
        quote: created,
        retiredQuoteIds: (retiredRows as QuoteRow[]).map((row) => toStringId(row.id)),
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async listQuotesByJobId(jobId: string): Promise<QuoteDto[]> {
    if (!/^[1-9][0-9]*$/.test(jobId)) return [];
    const [rows] = await this.pool.query<QuoteRow[]>(`${QUOTE_DETAIL_SELECT} WHERE q.\`job_id\` = ? ORDER BY q.\`created_at\` ASC`, [
      jobId,
    ]);
    return this.withItems(rows as QuoteRow[]);
  }

  async getQuoteById(quoteId: string): Promise<QuoteDto | null> {
    if (!/^[1-9][0-9]*$/.test(quoteId)) return null;
    const [rows] = await this.pool.query<QuoteRow[]>(`${QUOTE_DETAIL_SELECT} WHERE q.\`id\` = ? LIMIT 1`, [quoteId]);
    const list = await this.withItems(rows as QuoteRow[]);
    return list[0] ?? null;
  }

  private async withItems(rows: QuoteRow[]): Promise<QuoteDto[]> {
    const quotes: QuoteDto[] = [];
    for (const row of rows) {
      const [itemRows] = await this.pool.query<QuoteItemRow[]>(
        'SELECT `id`, `quote_id`, `description`, `quantity`, `unit_price`, `total`, `sort_order` FROM `quote_items` WHERE `quote_id` = ? ORDER BY `sort_order` ASC, `id` ASC',
        [row.id],
      );
      const isProfessional = row.professional_id !== null;
      const providerId = isProfessional ? `professional-${row.professional_id}` : `business-${row.business_id}`;
      quotes.push({
        id: toStringId(row.id),
        jobId: toStringId(row.job_id),
        provider: {
          id: providerId,
          providerType: isProfessional ? 'professional' : 'business',
          name: isProfessional ? (row.professional_name ?? providerId) : (row.business_name ?? providerId),
        },
        total: toNumber(row.total),
        currency: row.currency,
        message: row.description,
        status: row.status,
        items: (itemRows as QuoteItemRow[]).map((item) => ({
          id: toStringId(item.id),
          description: item.description,
          quantity: toNumber(item.quantity),
          unitPrice: toNumber(item.unit_price),
          total: toNumber(item.total),
          sortOrder: item.sort_order,
        })),
        submittedAt: toIso(row.submitted_at),
        createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
      });
    }
    return quotes;
  }
}
