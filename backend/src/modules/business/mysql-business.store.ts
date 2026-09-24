/**
 * FixLink Stage 7A — MySQL business store (production implementation).
 *
 * Reuses the existing `business_profiles`, `business_members`,
 * `technicians` and `users` tables — no migration was required. Every
 * value is a bound parameter. Technician linking (member row +
 * technician row) and activation (both `is_active` flags) run in one
 * transaction each so they cannot become inconsistent.
 *
 * Contact info (email/phone) is read live from `users` via JOIN — the
 * `technicians` table holds no contact columns. Verification documents
 * and internal notes are never selected.
 */
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  JobNotCancellableError,
  TechnicianConflictError,
  type BusinessStore,
  type LinkTechnicianPersistInput,
  type PersistInternalJobInput,
} from './business.store';
import type {
  AssignTechnicianInput,
  BusinessCustomerContact,
  BusinessCustomerDto,
  BusinessDto,
  BusinessIdentity,
  CreateBusinessCustomerInput,
  InternalJobBusinessSummary,
  InternalJobCustomerSummary,
  InternalJobDetailDto,
  InternalJobDto,
  InternalJobsSummary,
  InternalJobStatus,
  InternalJobTimelineEntry,
  JobAssignmentDetailDto,
  JobAssignmentDto,
  JobAssignmentHistoryEntry,
  TechnicianDto,
  UpdateBusinessCustomerInput,
  UpdateBusinessInput,
  UpdateInternalJobInput,
  UpdateTechnicianInput,
} from './business.types';

function toIso(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toStringId(value: number | string): string {
  return String(value);
}

function isDuplicate(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 'ER_DUP_ENTRY';
}

interface OwnedRow extends RowDataPacket {
  id: number;
}

interface MemberRow extends RowDataPacket {
  business_id: number;
  role: 'BUSINESS_OWNER' | 'BUSINESS_MANAGER' | 'TECHNICIAN';
}

interface BusinessRow extends RowDataPacket {
  id: number;
  business_name: string;
  slug: string;
  description: string | null;
  logo_reference: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  verification_status: string;
  rating_avg: number | string;
  rating_count: number;
  is_active: number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface TechnicianRow extends RowDataPacket {
  id: number;
  business_id: number;
  user_id: number;
  display_name: string;
  user_email: string | null;
  user_phone: string | null;
  is_active: number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface BusinessCustomerRow extends RowDataPacket {
  id: number;
  business_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  preferred_contact: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface InternalJobRow extends RowDataPacket {
  id: number;
  reference: string;
  source: 'MARKETPLACE' | 'INTERNAL';
  status: InternalJobStatus;
  business_id: number;
  business_name: string | null;
  customer_id: number;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  service_id: number | null;
  service_name: string | null;
  service_slug: string | null;
  title: string | null;
  description: string;
  address_line1: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  priority: InternalJobDto['priority'];
  scheduled_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface InternalHistoryRow extends RowDataPacket {
  previous_status: InternalJobStatus | null;
  new_status: InternalJobStatus;
  reason: string | null;
  created_at: Date | string;
}

interface AssignmentRow extends RowDataPacket {
  id: number;
  job_id: number;
  business_id: number | null;
  technician_id: number;
  technician_display_name: string;
  technician_email: string | null;
  technician_phone: string | null;
  technician_is_active: number;
  assigned_by: number | null;
  assigned_at: Date | string;
  unassigned_at: Date | string | null;
}

const BUSINESS_SELECT = `
  SELECT \`id\`, \`business_name\`, \`slug\`, \`description\`, \`logo_reference\`,
         \`email\`, \`phone\`, \`address_line1\`, \`city\`, \`province\`,
         \`postal_code\`, \`verification_status\`, \`rating_avg\`,
         \`rating_count\`, \`is_active\`, \`created_at\`, \`updated_at\`
    FROM \`business_profiles\``;

const TECHNICIAN_SELECT = `
  SELECT t.\`id\`, t.\`business_id\`, t.\`user_id\`, t.\`display_name\`,
         u.\`email\` AS \`user_email\`, u.\`phone\` AS \`user_phone\`,
         t.\`is_active\`, t.\`created_at\`, t.\`updated_at\`
    FROM \`technicians\` t
    INNER JOIN \`users\` u ON u.\`id\` = t.\`user_id\``;

function mapBusiness(row: BusinessRow): Omit<BusinessDto, 'role' | 'technicianCount'> {
  return {
    id: toStringId(row.id),
    businessName: row.business_name,
    slug: row.slug,
    description: row.description,
    logoReference: row.logo_reference,
    email: row.email,
    phone: row.phone,
    addressLine1: row.address_line1,
    city: row.city,
    province: row.province,
    postalCode: row.postal_code,
    verificationStatus: row.verification_status,
    ratingAvg: typeof row.rating_avg === 'number' ? row.rating_avg : Number(row.rating_avg),
    ratingCount: row.rating_count,
    isActive: row.is_active === 1,
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function mapTechnician(row: TechnicianRow): TechnicianDto {
  return {
    id: toStringId(row.id),
    businessId: toStringId(row.business_id),
    userId: toStringId(row.user_id),
    displayName: row.display_name,
    email: row.user_email,
    phone: row.user_phone,
    isActive: row.is_active === 1,
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function mapBusinessCustomer(row: BusinessCustomerRow): BusinessCustomerDto {
  const preferred = row.preferred_contact as BusinessCustomerContact | null;
  return {
    id: toStringId(row.id),
    businessId: toStringId(row.business_id),
    firstName: row.first_name,
    lastName: row.last_name,
    displayName: `${row.first_name} ${row.last_name}`,
    email: row.email,
    phone: row.phone,
    preferredContact: preferred === 'EMAIL' || preferred === 'PHONE' || preferred === 'WHATSAPP' ? preferred : null,
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function mapInternalJob(row: InternalJobRow): InternalJobDto {
  const customer: InternalJobCustomerSummary = {
    id: toStringId(row.customer_id),
    firstName: row.customer_first_name ?? '',
    lastName: row.customer_last_name ?? '',
    displayName: `${row.customer_first_name ?? ''} ${row.customer_last_name ?? ''}`.trim(),
    email: row.customer_email,
    phone: row.customer_phone,
  };
  const business: InternalJobBusinessSummary = {
    id: toStringId(row.business_id),
    businessName: row.business_name ?? '',
  };
  return {
    id: toStringId(row.id),
    reference: row.reference,
    source: 'INTERNAL',
    status: row.status,
    businessId: toStringId(row.business_id),
    business,
    customerId: toStringId(row.customer_id),
    customer,
    service: {
      id: row.service_id === null ? '' : toStringId(row.service_id),
      name: row.service_name ?? '',
      slug: row.service_slug ?? '',
    },
    title: row.title,
    description: row.description,
    addressLine1: row.address_line1,
    city: row.city,
    province: row.province,
    postalCode: row.postal_code,
    priority: row.priority,
    scheduledAt: toIso(row.scheduled_at),
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

const BUSINESS_CUSTOMER_SELECT = `
  SELECT \`id\`, \`business_id\`, \`first_name\`, \`last_name\`, \`email\`,
         \`phone\`, \`preferred_contact\`, \`created_at\`, \`updated_at\`
    FROM \`customer_profiles\``;

const INTERNAL_JOB_SELECT = `
  SELECT j.\`id\`, j.\`reference\`, j.\`source\`, j.\`status\`,
         j.\`business_id\`, bp.\`business_name\`,
         j.\`customer_id\`, cp.\`first_name\` AS \`customer_first_name\`,
         cp.\`last_name\` AS \`customer_last_name\`,
         cp.\`email\` AS \`customer_email\`, cp.\`phone\` AS \`customer_phone\`,
         j.\`service_id\`, s.\`name\` AS \`service_name\`, s.\`slug\` AS \`service_slug\`,
         j.\`title\`, j.\`description\`, j.\`address_line1\`, j.\`city\`,
         j.\`province\`, j.\`postal_code\`, j.\`priority\`, j.\`scheduled_at\`,
         j.\`created_at\`, j.\`updated_at\`
    FROM \`jobs\` j
    INNER JOIN \`customer_profiles\` cp ON cp.\`id\` = j.\`customer_id\`
    LEFT JOIN \`business_profiles\` bp ON bp.\`id\` = j.\`business_id\`
    LEFT JOIN \`services\` s ON s.\`id\` = j.\`service_id\``;

const ASSIGNMENT_SELECT = `
  SELECT a.\`id\`, a.\`job_id\`, a.\`business_id\`, a.\`technician_id\`,
         t.\`display_name\` AS \`technician_display_name\`,
         u.\`email\` AS \`technician_email\`, u.\`phone\` AS \`technician_phone\`,
         t.\`is_active\` AS \`technician_is_active\`,
         a.\`assigned_by\`, a.\`assigned_at\`, a.\`unassigned_at\`
    FROM \`job_assignments\` a
    INNER JOIN \`technicians\` t ON t.\`id\` = a.\`technician_id\`
    INNER JOIN \`users\` u ON u.\`id\` = t.\`user_id\``;

const ASSIGNMENT_ACTIVE_SCOPE = `a.\`job_id\` = ? AND a.\`assignment_type\` = 'TECHNICIAN' AND a.\`unassigned_at\` IS NULL`;

const TECHNICIAN_JOB_SELECT = `
  SELECT j.\`id\`, j.\`reference\`, j.\`source\`, j.\`status\`,
         j.\`business_id\`, bp.\`business_name\`,
         j.\`customer_id\`, cp.\`first_name\` AS \`customer_first_name\`,
         cp.\`last_name\` AS \`customer_last_name\`,
         cp.\`email\` AS \`customer_email\`, cp.\`phone\` AS \`customer_phone\`,
         j.\`service_id\`, s.\`name\` AS \`service_name\`, s.\`slug\` AS \`service_slug\`,
         j.\`title\`, j.\`description\`, j.\`address_line1\`, j.\`city\`,
         j.\`province\`, j.\`postal_code\`, j.\`priority\`, j.\`scheduled_at\`,
         j.\`created_at\`, j.\`updated_at\`
    FROM \`job_assignments\` a
    INNER JOIN \`jobs\` j ON j.\`id\` = a.\`job_id\`
    INNER JOIN \`customer_profiles\` cp ON cp.\`id\` = j.\`customer_id\`
    LEFT JOIN \`business_profiles\` bp ON bp.\`id\` = j.\`business_id\`
    LEFT JOIN \`services\` s ON s.\`id\` = j.\`service_id\``;

function mapAssignment(row: AssignmentRow, jobId: string, businessId: string): JobAssignmentDto {
  return {
    id: toStringId(row.id),
    jobId,
    businessId,
    technician: {
      id: toStringId(row.technician_id),
      displayName: row.technician_display_name,
      email: row.technician_email,
      phone: row.technician_phone,
      isActive: row.technician_is_active === 1,
    },
    assignedBy: row.assigned_by === null ? null : toStringId(row.assigned_by),
    assignedAt: toIso(row.assigned_at) ?? new Date(0).toISOString(),
  };
}

function mapAssignmentHistory(row: AssignmentRow): JobAssignmentHistoryEntry {
  return {
    id: toStringId(row.id),
    technician: {
      id: toStringId(row.technician_id),
      displayName: row.technician_display_name,
      email: row.technician_email,
      phone: row.technician_phone,
      isActive: row.technician_is_active === 1,
    },
    assignedBy: row.assigned_by === null ? null : toStringId(row.assigned_by),
    assignedAt: toIso(row.assigned_at) ?? new Date(0).toISOString(),
    unassignedAt: toIso(row.unassigned_at),
    isActive: row.unassigned_at === null,
  };
}

export class MysqlBusinessStore implements BusinessStore {
  constructor(private readonly pool: Pool) {}

  async findBusinessesForUser(userId: string): Promise<BusinessIdentity[]> {
    const identities = new Map<string, BusinessIdentity>();
    const [owned] = await this.pool.query<OwnedRow[]>(
      'SELECT `id` FROM `business_profiles` WHERE `owner_user_id` = ? AND `deleted_at` IS NULL',
      [userId],
    );
    for (const row of owned as OwnedRow[]) {
      identities.set(toStringId(row.id), { businessId: toStringId(row.id), role: 'OWNER' });
    }
    const [memberships] = await this.pool.query<MemberRow[]>(
      'SELECT `business_id`, `role` FROM `business_members` WHERE `user_id` = ? AND `is_active` = 1',
      [userId],
    );
    for (const row of memberships as MemberRow[]) {
      const businessId = toStringId(row.business_id);
      const role: BusinessIdentity['role'] =
        row.role === 'BUSINESS_OWNER' ? 'OWNER' : row.role === 'BUSINESS_MANAGER' ? 'MANAGER' : 'TECHNICIAN';
      const existing = identities.get(businessId);
      // Owner rows win; otherwise the strongest membership wins
      // (MANAGER outranks TECHNICIAN for the primary business pick).
      if (!existing || (existing.role === 'TECHNICIAN' && role !== 'TECHNICIAN') || role === 'OWNER') {
        identities.set(businessId, { businessId, role });
      }
    }
    const rank = (role: BusinessIdentity['role']): number =>
      role === 'OWNER' ? 0 : role === 'MANAGER' ? 1 : 2;
    return [...identities.values()].sort(
      (a, b) => rank(a.role) - rank(b.role) || Number(a.businessId) - Number(b.businessId),
    );
  }

  async getBusinessById(businessId: string): Promise<Omit<BusinessDto, 'role' | 'technicianCount'> | null> {
    if (!/^[1-9][0-9]*$/.test(businessId)) return null;
    const [rows] = await this.pool.query<BusinessRow[]>(
      `${BUSINESS_SELECT} WHERE \`id\` = ? AND \`deleted_at\` IS NULL LIMIT 1`,
      [businessId],
    );
    const list = rows as BusinessRow[];
    return list.length === 0 ? null : mapBusiness(list[0] as BusinessRow);
  }

  async updateBusiness(businessId: string, patch: UpdateBusinessInput): Promise<void> {
    const sets: string[] = [];
    const params: Array<string | null> = [];
    if (patch.businessName !== undefined) {
      sets.push('`business_name` = ?');
      params.push(patch.businessName);
    }
    if (patch.description !== undefined) {
      sets.push('`description` = ?');
      params.push(patch.description);
    }
    if (patch.email !== undefined) {
      sets.push('`email` = ?');
      params.push(patch.email);
    }
    if (patch.phone !== undefined) {
      sets.push('`phone` = ?');
      params.push(patch.phone);
    }
    if (patch.addressLine1 !== undefined) {
      sets.push('`address_line1` = ?');
      params.push(patch.addressLine1);
    }
    if (patch.city !== undefined) {
      sets.push('`city` = ?');
      params.push(patch.city);
    }
    if (patch.province !== undefined) {
      sets.push('`province` = ?');
      params.push(patch.province);
    }
    if (patch.postalCode !== undefined) {
      sets.push('`postal_code` = ?');
      params.push(patch.postalCode);
    }
    if (sets.length === 0) return;
    await this.pool.query(`UPDATE \`business_profiles\` SET ${sets.join(', ')} WHERE \`id\` = ?`, [
      ...params,
      businessId,
    ]);
  }

  async countTechnicians(businessId: string): Promise<number> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS `total` FROM `technicians` WHERE `business_id` = ? AND `deleted_at` IS NULL',
      [businessId],
    );
    return Number((rows as Array<{ total: number }>)[0]?.total ?? 0);
  }

  async listTechnicians(businessId: string): Promise<TechnicianDto[]> {
    const [rows] = await this.pool.query<TechnicianRow[]>(
      `${TECHNICIAN_SELECT} WHERE t.\`business_id\` = ? AND t.\`deleted_at\` IS NULL ORDER BY t.\`id\` ASC`,
      [businessId],
    );
    return (rows as TechnicianRow[]).map(mapTechnician);
  }

  async getTechnicianById(technicianId: string): Promise<TechnicianDto | null> {
    if (!/^[1-9][0-9]*$/.test(technicianId)) return null;
    const [rows] = await this.pool.query<TechnicianRow[]>(
      `${TECHNICIAN_SELECT} WHERE t.\`id\` = ? AND t.\`deleted_at\` IS NULL LIMIT 1`,
      [technicianId],
    );
    const list = rows as TechnicianRow[];
    return list.length === 0 ? null : mapTechnician(list[0] as TechnicianRow);
  }

  async findTechnicianByUserId(businessId: string, userId: string): Promise<TechnicianDto | null> {
    const [rows] = await this.pool.query<TechnicianRow[]>(
      `${TECHNICIAN_SELECT} WHERE t.\`business_id\` = ? AND t.\`user_id\` = ? AND t.\`deleted_at\` IS NULL LIMIT 1`,
      [businessId, userId],
    );
    const list = rows as TechnicianRow[];
    return list.length === 0 ? null : mapTechnician(list[0] as TechnicianRow);
  }

  async linkTechnician(input: LinkTechnicianPersistInput): Promise<TechnicianDto> {
    void input.email;
    void input.phone;
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [businessRows] = await conn.query<BusinessRow[]>(
        'SELECT `id` FROM `business_profiles` WHERE `id` = ? AND `deleted_at` IS NULL FOR UPDATE',
        [input.businessId],
      );
      if ((businessRows as BusinessRow[]).length === 0) {
        throw new TechnicianConflictError('Business not found.');
      }
      // An active membership of any kind blocks the link — an account is
      // never double-linked to the same business.
      const [memberRows] = await conn.query<RowDataPacket[]>(
        'SELECT `id` FROM `business_members` WHERE `business_id` = ? AND `user_id` = ? AND `is_active` = 1 FOR UPDATE',
        [input.businessId, input.userId],
      );
      if ((memberRows as RowDataPacket[]).length > 0) {
        throw new TechnicianConflictError();
      }
      try {
        await conn.query(
          "INSERT INTO `business_members` (`business_id`, `user_id`, `role`, `is_active`, `invited_at`, `joined_at`) VALUES (?, ?, 'TECHNICIAN', 1, NOW(), NOW())",
          [input.businessId, input.userId],
        );
      } catch (err) {
        if (isDuplicate(err)) throw new TechnicianConflictError();
        throw err;
      }
      let technicianId: number;
      try {
        const [result] = await conn.query<ResultSetHeader>(
          'INSERT INTO `technicians` (`business_id`, `user_id`, `display_name`, `is_active`) VALUES (?, ?, ?, 1)',
          [input.businessId, input.userId, input.displayName],
        );
        technicianId = Number(result.insertId);
      } catch (err) {
        if (isDuplicate(err)) throw new TechnicianConflictError();
        throw err;
      }
      await conn.commit();
      const [rows] = await this.pool.query<TechnicianRow[]>(`${TECHNICIAN_SELECT} WHERE t.\`id\` = ? LIMIT 1`, [
        technicianId,
      ]);
      const created = (rows as TechnicianRow[])[0] as TechnicianRow | undefined;
      if (!created) throw new Error('Technician creation failed: row not found after insert.');
      return mapTechnician(created);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async updateTechnician(
    businessId: string,
    technicianId: string,
    patch: UpdateTechnicianInput,
  ): Promise<TechnicianDto | null> {
    if (!/^[1-9][0-9]*$/.test(technicianId)) return null;
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<TechnicianRow[]>(
        'SELECT t.`id`, t.`business_id`, t.`user_id` FROM `technicians` t WHERE t.`id` = ? AND t.`deleted_at` IS NULL FOR UPDATE',
        [technicianId],
      );
      const row = (rows as TechnicianRow[])[0] as TechnicianRow | undefined;
      // Business scoping is part of existence: another business's
      // technician reads as NOT_FOUND so ids cannot be probed.
      if (!row || toStringId(row.business_id) !== businessId) {
        await conn.rollback();
        return null;
      }
      if (patch.displayName !== undefined) {
        await conn.query('UPDATE `technicians` SET `display_name` = ? WHERE `id` = ?', [
          patch.displayName,
          technicianId,
        ]);
      }
      if (patch.isActive !== undefined) {
        const flag = patch.isActive ? 1 : 0;
        await conn.query('UPDATE `technicians` SET `is_active` = ? WHERE `id` = ?', [flag, technicianId]);
        // The membership flag is the access gate — keep it in sync so
        // deactivation immediately revokes business access.
        await conn.query('UPDATE `business_members` SET `is_active` = ? WHERE `business_id` = ? AND `user_id` = ?', [
          flag,
          businessId,
          row.user_id,
        ]);
      }
      await conn.commit();
      return this.getTechnicianById(technicianId);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // ------------------------------------------------------------------
  // Stage 7B — business-managed customers (MySQL implementation).
  //
  // Business customers are `customer_profiles` rows with
  // `user_id = NULL` and `business_id` set (migration 003). Every
  // read and write is scoped by `business_id` so Business A can
  // never see Business B's customers.
  // ------------------------------------------------------------------

  async listBusinessCustomers(
    businessId: string,
    page: number,
    pageSize: number,
    search: string | null,
  ): Promise<{ items: BusinessCustomerDto[]; total: number }> {
    const needle = search === null ? null : `%${escapeLike(search)}%`;
    const scope = '`business_id` = ? AND `user_id` IS NULL AND `deleted_at` IS NULL';
    const searchSql = needle === null ? '' : ' AND (`first_name` LIKE ? ESCAPE \'\\\' OR `last_name` LIKE ? ESCAPE \'\\\' OR `email` LIKE ? ESCAPE \'\\\' OR `phone` LIKE ? ESCAPE \'\\\')';
    const countParams = needle === null ? [businessId] : [businessId, needle, needle, needle, needle];
    const [countRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS \`total\` FROM \`customer_profiles\` WHERE ${scope}${searchSql}`,
      countParams,
    );
    const total = Number((countRows as Array<{ total: number }>)[0]?.total ?? 0);
    if (total === 0) return { items: [], total: 0 };
    const offset = (page - 1) * pageSize;
    const [rows] = await this.pool.query<BusinessCustomerRow[]>(
      `${BUSINESS_CUSTOMER_SELECT} WHERE ${scope}${searchSql} ORDER BY \`id\` ASC LIMIT ? OFFSET ?`,
      [...countParams, pageSize, offset],
    );
    return { items: (rows as BusinessCustomerRow[]).map(mapBusinessCustomer), total };
  }

  async getBusinessCustomer(businessId: string, customerId: string): Promise<BusinessCustomerDto | null> {
    if (!/^[1-9][0-9]*$/.test(customerId)) return null;
    const [rows] = await this.pool.query<BusinessCustomerRow[]>(
      `${BUSINESS_CUSTOMER_SELECT} WHERE \`id\` = ? AND \`business_id\` = ? AND \`user_id\` IS NULL AND \`deleted_at\` IS NULL LIMIT 1`,
      [customerId, businessId],
    );
    const list = rows as BusinessCustomerRow[];
    // Business scoping is part of existence: another business's
    // customer reads as NOT_FOUND so customer ids cannot be probed.
    return list.length === 0 ? null : mapBusinessCustomer(list[0] as BusinessCustomerRow);
  }

  async createBusinessCustomer(businessId: string, input: CreateBusinessCustomerInput): Promise<BusinessCustomerDto> {
    const [result] = await this.pool.query<ResultSetHeader>(
      'INSERT INTO `customer_profiles` (`user_id`, `business_id`, `first_name`, `last_name`, `email`, `phone`, `preferred_contact`) VALUES (NULL, ?, ?, ?, ?, ?, ?)',
      [businessId, input.firstName, input.lastName, input.email, input.phone, input.preferredContact],
    );
    const created = await this.getBusinessCustomer(businessId, String(result.insertId));
    if (!created) throw new Error('Business customer creation failed: row not found after insert.');
    return created;
  }

  async updateBusinessCustomer(
    businessId: string,
    customerId: string,
    patch: UpdateBusinessCustomerInput,
  ): Promise<BusinessCustomerDto | null> {
    if (!/^[1-9][0-9]*$/.test(customerId)) return null;
    const existing = await this.getBusinessCustomer(businessId, customerId);
    if (!existing) return null;
    const sets: string[] = [];
    const params: Array<string | null> = [];
    if (patch.firstName !== undefined) {
      sets.push('`first_name` = ?');
      params.push(patch.firstName);
    }
    if (patch.lastName !== undefined) {
      sets.push('`last_name` = ?');
      params.push(patch.lastName);
    }
    if (patch.email !== undefined) {
      sets.push('`email` = ?');
      params.push(patch.email);
    }
    if (patch.phone !== undefined) {
      sets.push('`phone` = ?');
      params.push(patch.phone);
    }
    if (patch.preferredContact !== undefined) {
      sets.push('`preferred_contact` = ?');
      params.push(patch.preferredContact);
    }
    if (sets.length > 0) {
      await this.pool.query(
        `UPDATE \`customer_profiles\` SET ${sets.join(', ')} WHERE \`id\` = ? AND \`business_id\` = ? AND \`user_id\` IS NULL AND \`deleted_at\` IS NULL`,
        [...params, customerId, businessId],
      );
    }
    return this.getBusinessCustomer(businessId, customerId);
  }

  // ------------------------------------------------------------------
  // Stage 7B — internal business jobs (MySQL implementation).
  //
  // Internal jobs reuse the ONE shared `jobs` table with
  // `source = INTERNAL` (migration 004). Every read filters both
  // `business_id` and `source`, so marketplace rows never leak into
  // the business surface and Business A never sees Business B jobs.
  // ------------------------------------------------------------------

  async findInternalCustomer(businessId: string, customerId: string): Promise<{ id: string } | null> {
    if (!/^[1-9][0-9]*$/.test(customerId)) return null;
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT `id` FROM `customer_profiles` WHERE `id` = ? AND `business_id` = ? AND `user_id` IS NULL AND `deleted_at` IS NULL LIMIT 1',
      [customerId, businessId],
    );
    const list = rows as Array<{ id: number }>;
    return list.length === 0 ? null : { id: toStringId((list[0] as { id: number }).id) };
  }

  async createInternalJob(input: PersistInternalJobInput): Promise<InternalJobDto> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      let reference = input.reference;
      let jobId = 0;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          const [result] = await conn.query<ResultSetHeader>(
            `INSERT INTO \`jobs\`
               (\`reference\`, \`source\`, \`customer_id\`, \`business_id\`, \`service_id\`,
                \`title\`, \`description\`, \`address_line1\`, \`city\`, \`province\`,
                \`postal_code\`, \`priority\`, \`scheduled_at\`, \`status\`, \`currency\`, \`created_by\`)
             VALUES (?, 'INTERNAL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REQUESTED', 'ZAR', ?)`,
            [
              reference,
              input.customerId,
              input.businessId,
              input.serviceId,
              input.title,
              input.description,
              input.addressLine1,
              input.city,
              input.province,
              input.postalCode,
              input.priority,
              input.scheduledAt,
              input.createdBy,
            ],
          );
          jobId = Number(result.insertId);
          break;
        } catch (err) {
          if ((err as { code?: string } | null)?.code !== 'ER_DUP_ENTRY' || attempt === 4) throw err;
          reference = `${input.reference.slice(0, 24)}-${Math.floor(Math.random() * 10000)}`;
        }
      }
      await conn.query(
        'INSERT INTO `job_status_history` (`job_id`, `previous_status`, `new_status`, `changed_by`, `reason`) VALUES (?, NULL, ?, ?, ?)',
        [jobId, 'REQUESTED', input.createdBy, 'Internal job created by business'],
      );
      await conn.commit();
      const created = await this.getInternalJob(input.businessId, String(jobId));
      if (!created) throw new Error('Internal job creation failed: row not found after insert.');
      return created;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async listInternalJobs(
    businessId: string,
    query: { status: InternalJobStatus | null; search: string | null; page: number; pageSize: number },
  ): Promise<{ items: InternalJobDto[]; total: number }> {
    const scope = 'j.`business_id` = ? AND j.`source` = \'INTERNAL\' AND j.`deleted_at` IS NULL';
    const params: Array<string | number> = [businessId];
    let filter = '';
    if (query.status !== null) {
      filter += ' AND j.`status` = ?';
      params.push(query.status);
    }
    if (query.search !== null) {
      filter += ' AND (j.`reference` LIKE ? ESCAPE \'\\\' OR j.`description` LIKE ? ESCAPE \'\\\' OR j.`title` LIKE ? ESCAPE \'\\\' OR cp.`first_name` LIKE ? ESCAPE \'\\\' OR cp.`last_name` LIKE ? ESCAPE \'\\\' OR s.`name` LIKE ? ESCAPE \'\\\')';
      const needle = `%${escapeLike(query.search)}%`;
      params.push(needle, needle, needle, needle, needle, needle);
    }
    const [countRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS \`total\` FROM \`jobs\` j INNER JOIN \`customer_profiles\` cp ON cp.\`id\` = j.\`customer_id\` LEFT JOIN \`services\` s ON s.\`id\` = j.\`service_id\` WHERE ${scope}${filter}`,
      params,
    );
    const total = Number((countRows as Array<{ total: number }>)[0]?.total ?? 0);
    if (total === 0) return { items: [], total: 0 };
    const offset = (query.page - 1) * query.pageSize;
    const [rows] = await this.pool.query<InternalJobRow[]>(
      `${INTERNAL_JOB_SELECT} WHERE ${scope}${filter} ORDER BY j.\`created_at\` DESC LIMIT ? OFFSET ?`,
      [...params, query.pageSize, offset],
    );
    return { items: (rows as InternalJobRow[]).map(mapInternalJob), total };
  }

  async getInternalJob(businessId: string, jobId: string): Promise<InternalJobDto | null> {
    if (!/^[1-9][0-9]*$/.test(jobId)) return null;
    const [rows] = await this.pool.query<InternalJobRow[]>(
      `${INTERNAL_JOB_SELECT} WHERE j.\`id\` = ? AND j.\`business_id\` = ? AND j.\`source\` = 'INTERNAL' AND j.\`deleted_at\` IS NULL LIMIT 1`,
      [jobId, businessId],
    );
    const list = rows as InternalJobRow[];
    // Business scoping + source are part of existence: another
    // business's job (or any marketplace job) reads as NOT_FOUND.
    return list.length === 0 ? null : mapInternalJob(list[0] as InternalJobRow);
  }

  async updateInternalJob(
    businessId: string,
    jobId: string,
    patch: UpdateInternalJobInput,
  ): Promise<InternalJobDto | null> {
    if (!/^[1-9][0-9]*$/.test(jobId)) return null;
    const existing = await this.getInternalJob(businessId, jobId);
    if (!existing) return null;
    const sets: string[] = [];
    const params: Array<string | null> = [];
    if (patch.title !== undefined) {
      sets.push('`title` = ?');
      params.push(patch.title);
    }
    if (patch.description !== undefined) {
      sets.push('`description` = ?');
      params.push(patch.description);
    }
    if (patch.addressLine1 !== undefined) {
      sets.push('`address_line1` = ?');
      params.push(patch.addressLine1);
    }
    if (patch.city !== undefined) {
      sets.push('`city` = ?');
      params.push(patch.city);
    }
    if (patch.province !== undefined) {
      sets.push('`province` = ?');
      params.push(patch.province);
    }
    if (patch.postalCode !== undefined) {
      sets.push('`postal_code` = ?');
      params.push(patch.postalCode);
    }
    if (patch.priority !== undefined) {
      sets.push('`priority` = ?');
      params.push(patch.priority);
    }
    if (patch.scheduledAt !== undefined) {
      sets.push('`scheduled_at` = ?');
      params.push(patch.scheduledAt);
    }
    if (sets.length > 0) {
      await this.pool.query(
        `UPDATE \`jobs\` SET ${sets.join(', ')} WHERE \`id\` = ? AND \`business_id\` = ? AND \`source\` = 'INTERNAL' AND \`deleted_at\` IS NULL`,
        [...params, jobId, businessId],
      );
    }
    return this.getInternalJob(businessId, jobId);
  }

  async cancelInternalJob(
    businessId: string,
    jobId: string,
    input: { reason: string | null; changedBy: string },
  ): Promise<InternalJobDto | null> {
    if (!/^[1-9][0-9]*$/.test(jobId)) return null;
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT `id`, `status` FROM `jobs` WHERE `id` = ? AND `business_id` = ? AND `source` = 'INTERNAL' AND `deleted_at` IS NULL FOR UPDATE",
        [jobId, businessId],
      );
      const row = (rows as Array<{ id: number; status: InternalJobStatus }>)[0];
      if (!row) {
        await conn.rollback();
        return null;
      }
      if (row.status !== 'REQUESTED') {
        throw new JobNotCancellableError();
      }
      const [updated] = await conn.query<ResultSetHeader>(
        "UPDATE `jobs` SET `status` = 'CANCELLED' WHERE `id` = ? AND `status` = 'REQUESTED'",
        [jobId],
      );
      if (updated.affectedRows !== 1) throw new JobNotCancellableError();
      await conn.query(
        'INSERT INTO `job_status_history` (`job_id`, `previous_status`, `new_status`, `changed_by`, `reason`) VALUES (?, ?, ?, ?, ?)',
        [jobId, 'REQUESTED', 'CANCELLED', input.changedBy, input.reason ?? 'Internal job cancelled by business'],
      );
      await conn.commit();
      return this.getInternalJob(businessId, jobId);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async listInternalJobHistory(businessId: string, jobId: string): Promise<InternalJobTimelineEntry[] | null> {
    if (!/^[1-9][0-9]*$/.test(jobId)) return null;
    const owned = await this.getInternalJob(businessId, jobId);
    if (!owned) return null;
    const [rows] = await this.pool.query<InternalHistoryRow[]>(
      'SELECT `previous_status`, `new_status`, `reason`, `created_at` FROM `job_status_history` WHERE `job_id` = ? ORDER BY `created_at` ASC, `id` ASC',
      [jobId],
    );
    return (rows as InternalHistoryRow[]).map((row) => ({
      previousStatus: row.previous_status,
      status: row.new_status,
      reason: row.reason,
      createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    }));
  }

  async countInternalJobsByStatus(businessId: string): Promise<InternalJobsSummary> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT `status`, COUNT(*) AS `total` FROM `jobs` WHERE `business_id` = ? AND `source` = 'INTERNAL' AND `deleted_at` IS NULL GROUP BY `status`",
      [businessId],
    );
    const summary: InternalJobsSummary = {
      total: 0,
      requested: 0,
      scheduled: 0,
      inProgress: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const row of rows as Array<{ status: InternalJobStatus; total: number }>) {
      summary.total += Number(row.total);
      if (row.status === 'REQUESTED') summary.requested += Number(row.total);
      else if (row.status === 'SCHEDULED') summary.scheduled += Number(row.total);
      else if (row.status === 'IN_PROGRESS') summary.inProgress += Number(row.total);
      else if (row.status === 'COMPLETED') summary.completed += Number(row.total);
      else if (row.status === 'CANCELLED') summary.cancelled += Number(row.total);
    }
    return summary;
  }

  async getInternalJobDetail(businessId: string, jobId: string): Promise<InternalJobDetailDto | null> {
    const job = await this.getInternalJob(businessId, jobId);
    if (!job) return null;
    const timeline = (await this.listInternalJobHistory(businessId, jobId)) ?? [];
    return { job, timeline };
  }

  // ------------------------------------------------------------------
  // Stage 7C — technician assignment (MySQL implementation).
  //
  // Reuses `job_assignments` with `assignment_type = 'TECHNICIAN'`.
  // The active row has `unassigned_at IS NULL`; reassignment closes it
  // and inserts a new row in one transaction. Job status is never
  // changed by assignment. Every read re-scopes to the caller's
  // business + `source = INTERNAL` so foreign jobs read as NOT_FOUND.
  // ------------------------------------------------------------------

  async getActiveJobAssignment(businessId: string, jobId: string): Promise<JobAssignmentDto | null> {
    if (!/^[1-9][0-9]*$/.test(jobId)) return null;
    const owned = await this.getInternalJob(businessId, jobId);
    if (!owned) return null;
    const [rows] = await this.pool.query<AssignmentRow[]>(`${ASSIGNMENT_SELECT} WHERE ${ASSIGNMENT_ACTIVE_SCOPE} LIMIT 1`, [
      jobId,
    ]);
    const list = rows as AssignmentRow[];
    return list.length === 0 ? null : mapAssignment(list[0] as AssignmentRow, jobId, businessId);
  }

  async listJobAssignmentHistory(businessId: string, jobId: string): Promise<JobAssignmentHistoryEntry[] | null> {
    if (!/^[1-9][0-9]*$/.test(jobId)) return null;
    const owned = await this.getInternalJob(businessId, jobId);
    if (!owned) return null;
    const [rows] = await this.pool.query<AssignmentRow[]>(
      `${ASSIGNMENT_SELECT} WHERE a.\`job_id\` = ? AND a.\`assignment_type\` = 'TECHNICIAN' ORDER BY a.\`assigned_at\` DESC, a.\`id\` DESC`,
      [jobId],
    );
    return (rows as AssignmentRow[]).map(mapAssignmentHistory);
  }

  async getJobAssignmentDetail(businessId: string, jobId: string): Promise<JobAssignmentDetailDto | null> {
    if (!/^[1-9][0-9]*$/.test(jobId)) return null;
    const owned = await this.getInternalJob(businessId, jobId);
    if (!owned) return null;
    const assignment = await this.getActiveJobAssignment(businessId, jobId);
    const history = (await this.listJobAssignmentHistory(businessId, jobId)) ?? [];
    return { jobId, assignment, history };
  }

  async assignJobTechnician(
    businessId: string,
    jobId: string,
    input: AssignTechnicianInput & { assignedBy: string },
  ): Promise<JobAssignmentDto | null> {
    if (!/^[1-9][0-9]*$/.test(jobId)) return null;
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [jobRows] = await conn.query<RowDataPacket[]>(
        "SELECT `id` FROM `jobs` WHERE `id` = ? AND `business_id` = ? AND `source` = 'INTERNAL' AND `deleted_at` IS NULL FOR UPDATE",
        [jobId, businessId],
      );
      if ((jobRows as RowDataPacket[]).length === 0) {
        await conn.rollback();
        return null;
      }
      await conn.query(
        "UPDATE `job_assignments` SET `unassigned_at` = NOW() WHERE `job_id` = ? AND `assignment_type` = 'TECHNICIAN' AND `unassigned_at` IS NULL",
        [jobId],
      );
      await conn.query(
        "INSERT INTO `job_assignments` (`job_id`, `assignment_type`, `technician_id`, `business_id`, `assigned_by`) VALUES (?, 'TECHNICIAN', ?, ?, ?)",
        [jobId, input.technicianId, businessId, input.assignedBy],
      );
      await conn.commit();
      return this.getActiveJobAssignment(businessId, jobId);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async listTechnicianJobs(
    technicianId: string,
    query: { status: InternalJobStatus | null; page: number; pageSize: number },
  ): Promise<{ items: InternalJobDto[]; total: number }> {
    if (!/^[1-9][0-9]*$/.test(technicianId)) return { items: [], total: 0 };
    const scope = `a.\`technician_id\` = ? AND a.\`assignment_type\` = 'TECHNICIAN' AND a.\`unassigned_at\` IS NULL AND j.\`source\` = 'INTERNAL' AND j.\`deleted_at\` IS NULL`;
    const params: Array<string> = [technicianId];
    let filter = '';
    if (query.status !== null) {
      filter += ' AND j.`status` = ?';
      params.push(query.status);
    }
    const [countRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS \`total\` FROM \`job_assignments\` a INNER JOIN \`jobs\` j ON j.\`id\` = a.\`job_id\` WHERE ${scope}${filter}`,
      params,
    );
    const total = Number((countRows as Array<{ total: number }>)[0]?.total ?? 0);
    if (total === 0) return { items: [], total: 0 };
    const offset = (query.page - 1) * query.pageSize;
    const [rows] = await this.pool.query<InternalJobRow[]>(
      `${TECHNICIAN_JOB_SELECT} WHERE ${scope}${filter} ORDER BY j.\`created_at\` DESC LIMIT ? OFFSET ?`,
      [...params, query.pageSize, offset],
    );
    return { items: (rows as InternalJobRow[]).map(mapInternalJob), total };
  }

  async getTechnicianJob(technicianId: string, jobId: string): Promise<InternalJobDto | null> {
    if (!/^[1-9][0-9]*$/.test(technicianId) || !/^[1-9][0-9]*$/.test(jobId)) return null;
    const [rows] = await this.pool.query<InternalJobRow[]>(
      `${TECHNICIAN_JOB_SELECT} WHERE a.\`technician_id\` = ? AND a.\`assignment_type\` = 'TECHNICIAN' AND a.\`unassigned_at\` IS NULL AND j.\`id\` = ? AND j.\`source\` = 'INTERNAL' AND j.\`deleted_at\` IS NULL LIMIT 1`,
      [technicianId, jobId],
    );
    const list = rows as InternalJobRow[];
    return list.length === 0 ? null : mapInternalJob(list[0] as InternalJobRow);
  }

  async listTechnicianJobHistory(technicianId: string, jobId: string): Promise<InternalJobTimelineEntry[] | null> {
    const job = await this.getTechnicianJob(technicianId, jobId);
    if (!job) return null;
    const [rows] = await this.pool.query<InternalHistoryRow[]>(
      'SELECT `previous_status`, `new_status`, `reason`, `created_at` FROM `job_status_history` WHERE `job_id` = ? ORDER BY `created_at` ASC, `id` ASC',
      [jobId],
    );
    return (rows as InternalHistoryRow[]).map((row) => ({
      previousStatus: row.previous_status,
      status: row.new_status,
      reason: row.reason,
      createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    }));
  }

  async getTechnicianJobDetail(technicianId: string, jobId: string): Promise<InternalJobDetailDto | null> {
    const job = await this.getTechnicianJob(technicianId, jobId);
    if (!job) return null;
    const timeline = (await this.listTechnicianJobHistory(technicianId, jobId)) ?? [];
    return { job, timeline };
  }
}

/** Escape SQL LIKE wildcards so search input matches literally. */
function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
