/**
 * Fixlynk — MySQL service offerings store (production implementation).
 *
 * Reads and writes `service_offerings` (migration 015). Every value is a
 * bound parameter; the only interpolated identifiers are the fixed owner
 * column names chosen from a closed union.
 *
 * Ownership columns are `professional_id` / `business_id` with the
 * exactly-one-owner rule enforced in the service layer, matching
 * customer_profiles and service_areas.
 */
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { OfferingsStoreError, type ServiceOfferingsStore } from './offerings.store';
import {
  OPEN_JOB_STATUSES,
  type BusinessIdentity,
  type OfferingMutationInput,
  type OfferingOwner,
  type ProfessionalIdentity,
  type ServiceCategoryRef,
  type ServiceOfferingDto,
} from './offerings.types';

function toStringId(value: number | string): string {
  return String(value);
}

/** DECIMAL columns arrive as strings unless decimalNumbers is set. */
function toNumber(value: number | string): number {
  return typeof value === 'number' ? value : Number(value);
}

/**
 * DECIMAL that may be NULL: an offering chosen at registration has no price
 * yet. `toNumber(null)` would yield 0, which would render as a real "from R0"
 * to customers — inventing a price the provider never agreed to.
 */
function toNullableNumber(value: number | string | null): number | null {
  return value === null || value === undefined ? null : toNumber(value);
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

interface OfferingRow extends RowDataPacket {
  id: number;
  professional_id: number | null;
  business_id: number | null;
  category_id: number;
  category_name: string;
  category_slug: string;
  name: string;
  description: string | null;
  price_amount: number | string;
  currency: string;
  is_active: number;
  created_at: Date | string;
  updated_at: Date | string;
}

const SELECT_OFFERING = `SELECT o.\`id\`, o.\`professional_id\`, o.\`business_id\`,
       o.\`category_id\`, c.\`name\` AS \`category_name\`, c.\`slug\` AS \`category_slug\`,
       o.\`name\`, o.\`description\`, o.\`price_amount\`, o.\`currency\`, o.\`is_active\`,
       o.\`created_at\`, o.\`updated_at\`
  FROM \`service_offerings\` o
  INNER JOIN \`service_categories\` c ON c.\`id\` = o.\`category_id\``;

function mapOffering(row: OfferingRow): ServiceOfferingDto {
  return {
    id: toStringId(row.id),
    providerType: row.professional_id !== null ? 'PROFESSIONAL' : 'BUSINESS',
    providerId: toStringId(row.professional_id ?? row.business_id ?? 0),
    categoryId: toStringId(row.category_id),
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    name: row.name,
    description: row.description,
    priceAmount: toNullableNumber(row.price_amount),
    currency: row.currency,
    isActive: row.is_active === 1,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export class MysqlOfferingsStore implements ServiceOfferingsStore {
  constructor(private readonly pool: Pool) {}

  async findProfessionalProfileByUserId(userId: string): Promise<ProfessionalIdentity | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT `id` FROM `professional_profiles` WHERE `user_id` = ? AND `deleted_at` IS NULL LIMIT 1',
      [userId],
    );
    if (rows.length === 0) return null;
    return { id: toStringId((rows[0] as { id: number }).id) };
  }

  async findBusinessesForUser(userId: string): Promise<BusinessIdentity[]> {
    const identities = new Map<string, BusinessIdentity>();
    const [owned] = await this.pool.query<RowDataPacket[]>(
      'SELECT `id` FROM `business_profiles` WHERE `owner_user_id` = ? AND `deleted_at` IS NULL',
      [userId],
    );
    for (const row of owned as { id: number }[]) {
      const businessId = toStringId(row.id);
      identities.set(businessId, { businessId, role: 'OWNER' });
    }
    const [members] = await this.pool.query<RowDataPacket[]>(
      'SELECT `business_id`, `role` FROM `business_members` WHERE `user_id` = ? AND `is_active` = 1',
      [userId],
    );
    // TECHNICIAN members are employees, never marketplace providers.
    for (const row of members as { business_id: number; role: string }[]) {
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

  async getActiveCategory(categoryId: string): Promise<ServiceCategoryRef | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT `id`, `name`, `slug` FROM `service_categories` WHERE `id` = ? AND `is_active` = 1 LIMIT 1',
      [categoryId],
    );
    const row = rows[0] as { id: number; name: string; slug: string } | undefined;
    if (!row) return null;
    return { id: toStringId(row.id), name: row.name, slug: row.slug };
  }

  async listOfferings(owners: OfferingOwner[]): Promise<ServiceOfferingDto[]> {
    if (owners.length === 0) return [];
    const { clause, params } = ownerClause(owners);
    const [rows] = await this.pool.query<OfferingRow[]>(
      `${SELECT_OFFERING} WHERE o.\`deleted_at\` IS NULL AND ${clause} ORDER BY o.\`name\``,
      params,
    );
    return rows.map(mapOffering);
  }

  async getOfferingById(id: string): Promise<ServiceOfferingDto | null> {
    const [rows] = await this.pool.query<OfferingRow[]>(
      `${SELECT_OFFERING} WHERE o.\`id\` = ? LIMIT 1`,
      [id],
    );
    return rows.length === 0 ? null : mapOffering(rows[0]);
  }

  async createOffering(
    owner: OfferingOwner,
    input: OfferingMutationInput,
  ): Promise<ServiceOfferingDto> {
    const professionalId = owner.providerType === 'PROFESSIONAL' ? owner.providerId : null;
    const businessId = owner.providerType === 'BUSINESS' ? owner.providerId : null;
    try {
      const [result] = await this.pool.query<ResultSetHeader>(
        'INSERT INTO `service_offerings` (`professional_id`, `business_id`, `category_id`, `name`, `description`, `price_amount`) VALUES (?, ?, ?, ?, ?, ?)',
        [professionalId, businessId, input.categoryId, input.name, input.description, input.priceAmount],
      );
      const created = await this.getOfferingById(toStringId(result.insertId));
      if (!created) throw new OfferingsStoreError('INTERNAL', 'Service creation failed.');
      return created;
    } catch (error) {
      if (isDuplicate(error)) {
        throw new OfferingsStoreError('CONFLICT', 'You already have a service with that name.');
      }
      throw error;
    }
  }

  async updateOffering(
    id: string,
    input: Partial<OfferingMutationInput>,
  ): Promise<ServiceOfferingDto | null> {
    const columns: Record<keyof OfferingMutationInput, string> = {
      categoryId: 'category_id',
      name: 'name',
      description: 'description',
      priceAmount: 'price_amount',
    };
    const assignments: string[] = [];
    const params: unknown[] = [];
    for (const [field, column] of Object.entries(columns) as [keyof OfferingMutationInput, string][]) {
      if (input[field] === undefined) continue;
      assignments.push(`\`${column}\` = ?`);
      params.push(input[field]);
    }
    if (assignments.length === 0) return this.getOfferingById(id);
    try {
      await this.pool.query(
        `UPDATE \`service_offerings\` SET ${assignments.join(', ')} WHERE \`id\` = ? AND \`deleted_at\` IS NULL`,
        [...params, id],
      );
    } catch (error) {
      if (isDuplicate(error)) {
        throw new OfferingsStoreError('CONFLICT', 'You already have a service with that name.');
      }
      throw error;
    }
    return this.getOfferingById(id);
  }

  /**
   * Soft delete plus is_active = 0. Closed jobs keep referencing the row, so
   * a hard delete is never correct here; the FK is ON DELETE RESTRICT.
   */
  async removeOffering(id: string): Promise<ServiceOfferingDto | null> {
    await this.pool.query(
      'UPDATE `service_offerings` SET `is_active` = 0, `deleted_at` = NOW() WHERE `id` = ? AND `deleted_at` IS NULL',
      [id],
    );
    return this.getOfferingById(id);
  }

  async countOpenJobsForOffering(id: string): Promise<number> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS \`n\` FROM \`jobs\`
        WHERE \`service_offering_id\` = ? AND \`deleted_at\` IS NULL AND \`status\` IN (${placeholders(OPEN_JOB_STATUSES)})`,
      [id, ...OPEN_JOB_STATUSES],
    );
    return Number((rows[0] as { n: number | string }).n);
  }
}

/** Owner ids are bound; only these fixed column names are interpolated. */
function ownerClause(
  owners: OfferingOwner[],
): { clause: string; params: unknown[] } {
  const professionalIds = owners.filter((o) => o.providerType === 'PROFESSIONAL').map((o) => o.providerId);
  const businessIds = owners.filter((o) => o.providerType === 'BUSINESS').map((o) => o.providerId);
  const parts: string[] = [];
  const params: unknown[] = [];
  if (professionalIds.length > 0) {
    parts.push(`o.\`professional_id\` IN (${placeholders(professionalIds)})`);
    params.push(...professionalIds);
  }
  if (businessIds.length > 0) {
    parts.push(`o.\`business_id\` IN (${placeholders(businessIds)})`);
    params.push(...businessIds);
  }
  return { clause: parts.join(' OR '), params };
}

function placeholders(values: readonly unknown[]): string {
  return values.map(() => '?').join(', ');
}

function isDuplicate(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'ER_DUP_ENTRY';
}