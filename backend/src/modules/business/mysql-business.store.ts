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
  TechnicianConflictError,
  type BusinessStore,
  type LinkTechnicianPersistInput,
} from './business.store';
import type {
  BusinessDto,
  BusinessIdentity,
  TechnicianDto,
  UpdateBusinessInput,
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
}
