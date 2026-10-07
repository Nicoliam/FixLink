/**
 * Fixlynk Stage 6C — MySQL quotes store (production implementation).
 *
 * Reuses the existing `quotes`, `quote_items`, `jobs` and
 * `job_status_history` tables — no migration was required. Every value is
 * a bound parameter. Quote creation + the REQUESTED → QUOTED transition
 * run in one transaction so they cannot become inconsistent; the status
 * update is guarded by `AND status = 'REQUESTED'` so a concurrent quote
 * cannot double-transition the job.
 *
 * Step 14 adds open requests: a MARKETPLACE job whose `professional_id` and
 * `business_id` are both NULL, quotable by up to MAX_QUOTES_PER_OPEN_JOB
 * matching providers instead of only the addressed one. The job row is held
 * with `FOR UPDATE` for the whole of `createQuote`, which is what makes the
 * quote cap race-safe: two simultaneous fourth quotes cannot both count three.
 */
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { JobDto, JobStatus } from '../jobs/jobs.types';
import {
  JobNotAcceptableError,
  JobNotQuoteableError,
  JobNotSchedulableError,
  JobNotStartableError,
  MAX_QUOTES_PER_OPEN_JOB,
  QuoteAlreadyAcceptedError,
  QuoteConflictError,
  QuoteLimitReachedError,
  QuoteNotEligibleError,
  type AcceptQuotePersistInput,
  type AcceptQuoteResult,
  type CreateQuotePersistInput,
  type ProviderRequestFilter,
  type QuotesStore,
  type ScheduleJobPersistInput,
  type StartJobPersistInput,
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
  service_category_id: number | null;
  service_category_name: string | null;
  description: string;
  address_line1: string | null;
  city: string | null;
  province: string | null;
  scheduled_at: Date | string | null;
  completed_at: Date | string | null;
  confirmed_at: Date | string | null;
  closed_at: Date | string | null;
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
          s.\`category_id\` AS \`service_category_id\`, c.\`name\` AS \`service_category_name\`,
          j.\`description\`, j.\`address_line1\`, j.\`city\`, j.\`province\`,
          j.\`scheduled_at\`, j.\`completed_at\`, j.\`confirmed_at\`, j.\`closed_at\`, j.\`created_at\`
    FROM \`jobs\` j
    LEFT JOIN \`professional_profiles\` pp ON pp.\`id\` = j.\`professional_id\`
    LEFT JOIN \`business_profiles\` bp ON bp.\`id\` = j.\`business_id\`
    LEFT JOIN \`services\` s ON s.\`id\` = j.\`service_id\`
    LEFT JOIN \`service_categories\` c ON c.\`id\` = s.\`category_id\``;

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
  // Step 14: both provider columns NULL is an OPEN REQUEST. Reporting
  // `business-null` here would hand every open request a phantom business.
  const isProfessional = row.professional_id !== null;
  const isBusiness = row.business_id !== null;
  const providerId = isProfessional ? `professional-${row.professional_id}` : `business-${row.business_id}`;
  const scheduledAt = toIso(row.scheduled_at);
  return {
    id: toStringId(row.id),
    reference: row.reference,
    source: row.source,
    status: row.status,
    provider:
      isProfessional || isBusiness
        ? {
            id: providerId,
            providerType: isProfessional ? 'professional' : 'business',
            name: isProfessional ? (row.professional_name ?? providerId) : (row.business_name ?? providerId),
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
    completedAt: toIso(row.completed_at),
    confirmedAt: toIso(row.confirmed_at),
    closedAt: toIso(row.closed_at),
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

  /**
   * Stage 8 — reverse lookup for notification recipients: login user
   * ids that may act for a marketplace provider (the professional
   * owner, or the business owner plus active owner/manager members —
   * technicians are never marketplace recipients).
   */
  async findUserIdsForProvider(
    providerType: 'professional' | 'business',
    providerNumericId: string,
  ): Promise<string[]> {
    if (!/^[1-9][0-9]*$/.test(providerNumericId)) return [];
    const userIds = new Set<string>();
    if (providerType === 'professional') {
      const [rows] = await this.pool.query<RowDataPacket[]>(
        'SELECT `user_id` FROM `professional_profiles` WHERE `id` = ? AND `deleted_at` IS NULL LIMIT 1',
        [providerNumericId],
      );
      for (const row of rows as RowDataPacket[]) {
        userIds.add(String(row['user_id'] as number));
      }
      return [...userIds];
    }
    const [owned] = await this.pool.query<RowDataPacket[]>(
      'SELECT `owner_user_id` FROM `business_profiles` WHERE `id` = ? AND `deleted_at` IS NULL LIMIT 1',
      [providerNumericId],
    );
    for (const row of owned as RowDataPacket[]) {
      userIds.add(String(row['owner_user_id'] as number));
    }
    const [members] = await this.pool.query<MemberRow[]>(
      "SELECT `user_id` FROM `business_members` WHERE `business_id` = ? AND `is_active` = 1 AND `role` IN ('BUSINESS_OWNER', 'BUSINESS_MANAGER')",
      [providerNumericId],
    );
    for (const row of members as RowDataPacket[]) {
      userIds.add(String(row['user_id'] as number));
    }
    return [...userIds];
  }

  async listProviderRequests(filter: ProviderRequestFilter): Promise<{ items: ProviderRequestDto[]; total: number }> {
    const statuses =
      filter.statuses.length > 0
        ? filter.statuses
        : (['REQUESTED', 'QUOTED', 'ACCEPTED', 'SCHEDULED', 'IN_PROGRESS'] as ProviderRequestFilter['statuses']);
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
    // Step 14: an OPEN request has no provider column to match on. Quoting is
    // the access grant, so a job this provider has a live quote on joins the
    // addressed set. It is a correlated EXISTS rather than a join so a job
    // with several of this provider's historical quotes still appears once.
    const quotedByMe: string[] = [];
    for (const numericId of filter.professionalIds) {
      quotedByMe.push(
        `EXISTS (SELECT 1 FROM \`quotes\` q WHERE q.\`job_id\` = j.\`id\`
           AND q.\`professional_id\` = ? AND q.\`status\` IN ('DRAFT','SUBMITTED'))`,
      );
      params.push(numericId);
    }
    for (const numericId of filter.businessIds) {
      quotedByMe.push(
        `EXISTS (SELECT 1 FROM \`quotes\` q WHERE q.\`job_id\` = j.\`id\`
           AND q.\`business_id\` = ? AND q.\`status\` IN ('DRAFT','SUBMITTED'))`,
      );
      params.push(numericId);
    }
    ownership.push(`(j.\`professional_id\` IS NULL AND j.\`business_id\` IS NULL AND (${quotedByMe.join(' OR ')}))`);
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

  async hasQuoteFromProvider(
    jobId: string,
    providerType: 'professional' | 'business',
    providerNumericId: string,
  ): Promise<boolean> {
    if (!/^[1-9][0-9]*$/.test(jobId) || !/^[1-9][0-9]*$/.test(providerNumericId)) return false;
    const column = providerType === 'professional' ? 'professional_id' : 'business_id';
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT 1 AS \`hit\` FROM \`quotes\`
        WHERE \`job_id\` = ? AND \`${column}\` = ? AND \`status\` IN ('DRAFT','SUBMITTED')
        LIMIT 1`,
      [jobId, providerNumericId],
    );
    return rows.length > 0;
  }

  async listJobIdsQuotedBy(
    providerType: 'professional' | 'business',
    providerNumericId: string,
  ): Promise<string[]> {
    if (!/^[1-9][0-9]*$/.test(providerNumericId)) return [];
    const column = providerType === 'professional' ? 'professional_id' : 'business_id';
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT DISTINCT \`job_id\` FROM \`quotes\`
        WHERE \`${column}\` = ? AND \`status\` IN ('DRAFT','SUBMITTED')`,
      [providerNumericId],
    );
    return rows.map((row) => toStringId(row['job_id'] as number));
  }

  async createQuote(input: CreateQuotePersistInput): Promise<QuoteDto> {
    const expectedProfessionalId = input.providerType === 'professional' ? input.providerNumericId : null;
    const expectedBusinessId = input.providerType === 'business' ? input.providerNumericId : null;
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [jobRows] = await conn.query<JobRow[]>(
        'SELECT `id`, `source`, `status`, `professional_id`, `business_id` FROM `jobs` WHERE `id` = ? AND `deleted_at` IS NULL FOR UPDATE',
        [input.job.id],
      );
      const job = (jobRows as JobRow[])[0] as JobRow | undefined;
      // Step 14: both provider columns NULL is an OPEN request — quotable by
      // any matching provider. The service proved the match (category AND
      // area) before calling; here only the eligibility rules are re-checked,
      // under the same row lock the quote count is taken with.
      const isOpenRequest =
        job !== undefined && job.professional_id === null && job.business_id === null;
      const addressedHere =
        job !== undefined &&
        ((expectedProfessionalId !== null && String(job.professional_id ?? '') === expectedProfessionalId) ||
          (expectedBusinessId !== null && String(job.business_id ?? '') === expectedBusinessId));
      if (!job || job.source !== 'MARKETPLACE' || (!isOpenRequest && !addressedHere)) {
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

      if (isOpenRequest) {
        // The cap is counted HERE, while the job row is locked by FOR UPDATE
        // above. A count in the service would be a read-then-write and two
        // concurrent fourth quotes could both pass it.
        const [countRows] = await conn.query<RowDataPacket[]>(
          `SELECT COUNT(*) AS \`n\` FROM \`quotes\`
            WHERE \`job_id\` = ? AND \`status\` IN ('DRAFT','SUBMITTED')`,
          [input.job.id],
        );
        const active = Number((countRows[0] as RowDataPacket | undefined)?.['n'] ?? 0);
        if (active >= MAX_QUOTES_PER_OPEN_JOB) {
          throw new QuoteLimitReachedError(
            `This request already has ${MAX_QUOTES_PER_OPEN_JOB} quotes, so the customer is no longer accepting more.`,
          );
        }
        // QUOTED is quoteable too: on an open request the 2nd and 3rd quotes
        // arrive after the 1st has already moved it there.
        if (job.status !== 'REQUESTED' && job.status !== 'QUOTED') {
          throw new JobNotQuoteableError('This job can no longer be quoted.');
        }
      } else if (job.status !== 'REQUESTED') {
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
      // Step 14: only the FIRST quote on an open request moves REQUESTED ->
      // QUOTED. Later quotes leave the already-QUOTED job alone, so no further
      // `job_status_history` entry is written — the job did not change state,
      // and history records state changes (AGENTS.md section 37).
      if (job.status === 'REQUESTED') {
        const [updated] = await conn.query<ResultSetHeader>(
          'UPDATE `jobs` SET `status` = \'QUOTED\' WHERE `id` = ? AND `status` = \'REQUESTED\'',
          [input.job.id],
        );
        if (updated.affectedRows !== 1) throw new JobNotQuoteableError();
        await conn.query(
          'INSERT INTO `job_status_history` (`job_id`, `previous_status`, `new_status`, `changed_by`, `reason`) VALUES (?, ?, ?, ?, ?)',
          [input.job.id, 'REQUESTED', 'QUOTED', input.createdBy, 'Provider submitted quote'],
        );
      }
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
        'SELECT `id`, `source`, `status`, `professional_id`, `business_id` FROM `jobs` WHERE `id` = ? AND `deleted_at` IS NULL FOR UPDATE',
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
        'SELECT `id`, `job_id`, `status`, `total`, `currency`, `professional_id`, `business_id` FROM `quotes` WHERE `id` = ? FOR UPDATE',
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
      // Step 14: accepting a quote on an OPEN request writes the winner onto
      // the job — `professional_id`/`business_id` from the accepted quote. This
      // is the moment the customer chooses a professional, so the job becomes
      // an addressed request and every downstream module (schedule, start,
      // execution, assignment) keeps working with no open-request branch.
      const wasOpenRequest = job.professional_id === null && job.business_id === null;
      if (wasOpenRequest) {
        if (target.professional_id === null && target.business_id === null) {
          throw new JobNotAcceptableError('Quote has no provider to assign.');
        }
      }
      const [jobUpdated] = await conn.query<ResultSetHeader>(
        wasOpenRequest
          ? "UPDATE `jobs` SET `status` = 'ACCEPTED', `agreed_amount` = ?, `currency` = ?, `professional_id` = ?, `business_id` = ? WHERE `id` = ? AND `status` = 'QUOTED'"
          : "UPDATE `jobs` SET `status` = 'ACCEPTED', `agreed_amount` = ?, `currency` = ? WHERE `id` = ? AND `status` = 'QUOTED'",
        wasOpenRequest
          ? [toNumber(target.total), target.currency, target.professional_id, target.business_id, input.jobId]
          : [toNumber(target.total), target.currency, input.jobId],
      );
      if (jobUpdated.affectedRows !== 1) throw new JobNotAcceptableError();
      if (wasOpenRequest) {
        // An open request has no `job_assignments` row at creation, so the
        // winning provider's assignment is written here, inside the same
        // transaction as the acceptance that caused it.
        await conn.query(
          'INSERT INTO `job_assignments` (`job_id`, `assignment_type`, `professional_id`, `business_id`, `assigned_by`) VALUES (?, ?, ?, ?, ?)',
          [
            input.jobId,
            target.professional_id !== null ? 'PROFESSIONAL' : 'BUSINESS',
            target.professional_id,
            target.business_id,
            input.acceptedBy,
          ],
        );
      }
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

  /**
   * Stage 6E — schedule an ACCEPTED marketplace job with an accepted
   * quote. The status update is guarded by `AND status = 'ACCEPTED'` so a
   * concurrent transition cannot double-schedule the job. `scheduled_at`
   * is stored as a UTC DATETIME; readers convert it back to the same
   * instant with `toIso`, so the provider's chosen time is preserved.
   */
  async scheduleJob(input: ScheduleJobPersistInput): Promise<void> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [jobRows] = await conn.query<JobRow[]>(
        'SELECT `id`, `source`, `status`, `professional_id`, `business_id` FROM `jobs` WHERE `id` = ? AND `deleted_at` IS NULL FOR UPDATE',
        [input.jobId],
      );
      const job = (jobRows as JobRow[])[0] as JobRow | undefined;
      // Authorization (provider association) is enforced by the service
      // before this call; the store re-validates state under lock.
      if (!job || job.source !== 'MARKETPLACE') {
        throw new JobNotSchedulableError('Job not found.');
      }
      const [acceptedRows] = await conn.query<RowDataPacket[]>(
        "SELECT `id` FROM `quotes` WHERE `job_id` = ? AND `status` = 'ACCEPTED' LIMIT 1 FOR UPDATE",
        [input.jobId],
      );
      if ((acceptedRows as RowDataPacket[]).length === 0) {
        throw new JobNotSchedulableError('This job cannot be scheduled without an accepted quote.');
      }
      if (job.status !== 'ACCEPTED') {
        throw new JobNotSchedulableError();
      }
      const scheduledAt = new Date(input.scheduledAtIso).toISOString().slice(0, 19).replace('T', ' ');
      const [updated] = await conn.query<ResultSetHeader>(
        "UPDATE `jobs` SET `status` = 'SCHEDULED', `scheduled_at` = ? WHERE `id` = ? AND `status` = 'ACCEPTED'",
        [scheduledAt, input.jobId],
      );
      if (updated.affectedRows !== 1) throw new JobNotSchedulableError();
      await conn.query(
        'INSERT INTO `job_status_history` (`job_id`, `previous_status`, `new_status`, `changed_by`, `reason`) VALUES (?, ?, ?, ?, ?)',
        [input.jobId, 'ACCEPTED', 'SCHEDULED', input.scheduledBy, 'Provider scheduled job'],
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Stage 6E — start a SCHEDULED marketplace job. Guarded by
   * `AND status = 'SCHEDULED'` so a concurrent start cannot
   * double-transition the job.
   */
  async startJob(input: StartJobPersistInput): Promise<void> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [jobRows] = await conn.query<JobRow[]>(
        'SELECT `id`, `source`, `status`, `professional_id`, `business_id` FROM `jobs` WHERE `id` = ? AND `deleted_at` IS NULL FOR UPDATE',
        [input.jobId],
      );
      const job = (jobRows as JobRow[])[0] as JobRow | undefined;
      if (!job || job.source !== 'MARKETPLACE') {
        throw new JobNotStartableError('Job not found.');
      }
      if (job.status !== 'SCHEDULED') {
        throw new JobNotStartableError();
      }
      const [updated] = await conn.query<ResultSetHeader>(
        "UPDATE `jobs` SET `status` = 'IN_PROGRESS' WHERE `id` = ? AND `status` = 'SCHEDULED'",
        [input.jobId],
      );
      if (updated.affectedRows !== 1) throw new JobNotStartableError();
      await conn.query(
        'INSERT INTO `job_status_history` (`job_id`, `previous_status`, `new_status`, `changed_by`, `reason`) VALUES (?, ?, ?, ?, ?)',
        [input.jobId, 'SCHEDULED', 'IN_PROGRESS', input.startedBy, 'Provider started job'],
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
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
