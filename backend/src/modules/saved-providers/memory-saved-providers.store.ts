/**
 * Fixlynk — in-memory customer saved professionals store (tests and AUTH_STORE=memory).
 *
 * Mirrors the MySQL implementation's semantics without a database:
 * uniqueness per (customer, provider), newest-first listing, a hard delete on
 * removal, and the exactly-one-owner rule.
 *
 * Customer profiles are synthesised on first use, one per user id, so two
 * customers registered in a test are two distinct owners and the isolation
 * tests are meaningful.
 */
import { SavedProvidersStoreError, type SavedProvidersStore } from './saved-providers.store';
import type { SavedProviderRow, SavedProviderType } from './saved-providers.types';

/** Provider profiles the store will accept as saveable, mirroring the seeder. */
const SAVEABLE_PROFILES: ReadonlySet<string> = new Set([
  'PROFESSIONAL:1',
  'PROFESSIONAL:2',
  'PROFESSIONAL:3',
  'BUSINESS:1',
  'BUSINESS:2',
]);

export class MemorySavedProvidersStore implements SavedProvidersStore {
  private readonly rows: SavedProviderRow[] = [];
  /** userId -> synthetic customer_profiles.id. */
  private readonly customerProfiles = new Map<string, string>();
  private nextCustomerId = 1;
  private nextRowId = 1;

  async findCustomerProfileByUserId(userId: string): Promise<string | null> {
    const existing = this.customerProfiles.get(userId);
    if (existing) return existing;
    const id = String(this.nextCustomerId);
    this.nextCustomerId += 1;
    this.customerProfiles.set(userId, id);
    return id;
  }

  async isSaveableProvider(providerType: SavedProviderType, providerId: string): Promise<boolean> {
    return SAVEABLE_PROFILES.has(`${providerType}:${providerId}`);
  }

  async listSavedProviders(customerId: string): Promise<SavedProviderRow[]> {
    return this.rows
      .filter((row) => row.customerId === customerId)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || Number(b.id) - Number(a.id));
  }

  async isSaved(
    customerId: string,
    providerType: SavedProviderType,
    providerId: string,
  ): Promise<boolean> {
    return this.rows.some((row) => matches(row, customerId, providerType, providerId));
  }

  async addSavedProvider(
    customerId: string,
    providerType: SavedProviderType,
    providerId: string,
  ): Promise<SavedProviderRow> {
    if (!(await this.isSaveableProvider(providerType, providerId))) {
      throw new SavedProvidersStoreError('NOT_FOUND', 'That professional is not available.');
    }
    if (await this.isSaved(customerId, providerType, providerId)) {
      throw new SavedProvidersStoreError('CONFLICT', 'That professional is already in your saved list.');
    }
    const row: SavedProviderRow = {
      id: String(this.nextRowId),
      customerId,
      savedProfessionalId: providerType === 'PROFESSIONAL' ? providerId : null,
      savedBusinessId: providerType === 'BUSINESS' ? providerId : null,
      createdAt: new Date().toISOString(),
    };
    this.nextRowId += 1;
    this.rows.push(row);
    return row;
  }

  async removeSavedProvider(
    customerId: string,
    providerType: SavedProviderType,
    providerId: string,
  ): Promise<boolean> {
    const index = this.rows.findIndex((row) => matches(row, customerId, providerType, providerId));
    if (index === -1) return false;
    this.rows.splice(index, 1);
    return true;
  }

  /** Drop every bookmark. Test-setup helper, never called by the service. */
  reset(): void {
    this.rows.length = 0;
    this.nextRowId = 1;
    this.customerProfiles.clear();
    this.nextCustomerId = 1;
  }
}

function matches(
  row: SavedProviderRow,
  customerId: string,
  providerType: SavedProviderType,
  providerId: string,
): boolean {
  if (row.customerId !== customerId) return false;
  return providerType === 'PROFESSIONAL'
    ? row.savedProfessionalId === providerId
    : row.savedBusinessId === providerId;
}
