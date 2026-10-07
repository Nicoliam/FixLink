/**
 * Fixlynk — MySQL customer saved professionals store (production implementation).
 *
 * Reads and writes `saved_professionals` (migration 008, hardened by migration
 * 016). Every value is a bound parameter; the only interpolated identifiers are
 * the fixed owner column names chosen from a closed union.
 *
 * Duplicate detection relies on uq_saved_professionals_unique, whose unique
 * key is expressed over the VIRTUAL COALESCE columns. A plain
 * UNIQUE (customer_id, saved_professional_id, saved_business_id) cannot work
 * because MySQL treats NULLs as distinct, so the unset half of every row would
 * simply never collide.
 *
 * The exactly-one-owner rule is enforced by chk_saved_professionals_owner and
 * is re-asserted here, so a programming error cannot produce a half-owned row.
 */
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { SavedProvidersStoreError, type SavedProvidersStore } from './saved-providers.store';
import type { SavedProviderRow, SavedProviderType } from './saved-providers.types';

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** Owner column for a provider type. Closed union, so interpolation is safe. */
const OWNER_COLUMN = {
  PROFESSIONAL: 'saved_professional_id',
  BUSINESS: 'saved_business_id',
} as const satisfies Record<SavedProviderType, string>;

interface SavedProviderDbRow extends RowDataPacket {
  id: number;
  customer_id: number;
  saved_professional_id: number | null;
  saved_business_id: number | null;
  created_at: Date | string;
}

function mapRow(row: SavedProviderDbRow): SavedProviderRow {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    savedProfessionalId: row.saved_professional_id === null ? null : String(row.saved_professional_id),
    savedBusinessId: row.saved_business_id === null ? null : String(row.saved_business_id),
    createdAt: toIso(row.created_at),
  };
}

function toNumericId(value: string): number | null {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 1 ? numeric : null;
}

export class MysqlSavedProvidersStore implements SavedProvidersStore {
  constructor(private readonly pool: Pool) {}

  async findCustomerProfileByUserId(userId: string): Promise<string | null> {
    const numericUserId = toNumericId(userId);
    if (numericUserId === null) return null;
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT `id` FROM `customer_profiles` WHERE `user_id` = ? AND `deleted_at` IS NULL LIMIT 1',
      [numericUserId],
    );
    return rows.length > 0 ? String(rows[0]['id']) : null;
  }

  async isSaveableProvider(providerType: SavedProviderType, providerId: string): Promise<boolean> {
    const numericId = toNumericId(providerId);
    if (numericId === null) return false;
    const table = providerType === 'PROFESSIONAL' ? 'professional_profiles' : 'business_profiles';
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT 1 FROM \`${table}\` WHERE \`id\` = ? AND \`is_active\` = 1 AND \`deleted_at\` IS NULL LIMIT 1`,
      [numericId],
    );
    return rows.length > 0;
  }

  async listSavedProviders(customerId: string): Promise<SavedProviderRow[]> {
    const [rows] = await this.pool.query<SavedProviderDbRow[]>(
      `SELECT \`id\`, \`customer_id\`, \`saved_professional_id\`, \`saved_business_id\`, \`created_at\`
         FROM \`saved_professionals\`
        WHERE \`customer_id\` = ?
        ORDER BY \`created_at\` DESC, \`id\` DESC`,
      [Number(customerId)],
    );
    return rows.map(mapRow);
  }

  async isSaved(
    customerId: string,
    providerType: SavedProviderType,
    providerId: string,
  ): Promise<boolean> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT 1 FROM \`saved_professionals\`
        WHERE \`customer_id\` = ? AND \`${OWNER_COLUMN[providerType]}\` = ?
        LIMIT 1`,
      [Number(customerId), Number(providerId)],
    );
    return rows.length > 0;
  }

  async addSavedProvider(
    customerId: string,
    providerType: SavedProviderType,
    providerId: string,
  ): Promise<SavedProviderRow> {
    const ownerColumn = OWNER_COLUMN[providerType];
    try {
      const [result] = await this.pool.query<ResultSetHeader>(
        `INSERT INTO \`saved_professionals\` (\`customer_id\`, \`${ownerColumn}\`) VALUES (?, ?)`,
        [Number(customerId), Number(providerId)],
      );
      const [rows] = await this.pool.query<SavedProviderDbRow[]>(
        `SELECT \`id\`, \`customer_id\`, \`saved_professional_id\`, \`saved_business_id\`, \`created_at\`
           FROM \`saved_professionals\` WHERE \`id\` = ?`,
        [result.insertId],
      );
      if (rows.length === 0) {
        throw new SavedProvidersStoreError('INTERNAL', 'Could not save this professional.');
      }
      return mapRow(rows[0]);
    } catch (error) {
      if (isDuplicateEntry(error)) {
        throw new SavedProvidersStoreError('CONFLICT', 'That professional is already in your saved list.');
      }
      if (isCheckViolation(error)) {
        throw new SavedProvidersStoreError('INTERNAL', 'Could not save this professional.');
      }
      throw error;
    }
  }

  async removeSavedProvider(
    customerId: string,
    providerType: SavedProviderType,
    providerId: string,
  ): Promise<boolean> {
    const [result] = await this.pool.query<ResultSetHeader>(
      `DELETE FROM \`saved_professionals\`
        WHERE \`customer_id\` = ? AND \`${OWNER_COLUMN[providerType]}\` = ?`,
      [Number(customerId), Number(providerId)],
    );
    return result.affectedRows > 0;
  }
}

/** MySQL ER_DUP_ENTRY, raised by uq_saved_professionals_unique. */
function isDuplicateEntry(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ER_DUP_ENTRY'
  );
}

/** MySQL ER_CHECK_CONSTRAINT_VIOLATED, raised by chk_saved_professionals_owner. */
function isCheckViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'ER_CHECK_CONSTRAINT_VIOLATED'
  );
}
