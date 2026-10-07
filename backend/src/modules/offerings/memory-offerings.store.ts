/**
 * Fixlynk — in-memory service offerings store (tests and AUTH_STORE=memory).
 *
 * The MySQL fixtures in memory-*.store.ts are module-level consts, but
 * offerings are mutable by definition, so this store keeps its own seeded
 * arrays plus explicit test-setup mutators for linking users to provider
 * identities and jobs to offerings.
 */
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

interface OfferingRow extends ServiceOfferingDto {
  deletedAt: boolean;
}

interface CategoryFixture extends ServiceCategoryRef {
  isActive: boolean;
}

const CATEGORIES: CategoryFixture[] = [
  { id: '1', name: 'Plumbing', slug: 'plumbing', isActive: true },
  { id: '2', name: 'Electrical', slug: 'electrical', isActive: true },
  { id: '3', name: 'Painting', slug: 'painting', isActive: true },
  { id: '4', name: 'Retired Category', slug: 'retired-category', isActive: false },
];

const SEEDED_OFFERINGS: OfferingRow[] = [
  {
    id: '1',
    providerType: 'PROFESSIONAL',
    providerId: '1',
    categoryId: '1',
    categoryName: 'Plumbing',
    categorySlug: 'plumbing',
    name: 'Emergency Burst Pipe Repair',
    description: 'Call-out and same-day repair of burst pipes.',
    priceAmount: 850,
    currency: 'ZAR',
    isActive: true,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
    deletedAt: false,
  },
];

export class MemoryOfferingsStore implements ServiceOfferingsStore {
  private readonly offerings: OfferingRow[] = SEEDED_OFFERINGS.map((row) => ({ ...row }));
  private readonly professionalByUserId = new Map<string, string>();
  private readonly businessesByUserId = new Map<string, BusinessIdentity[]>();
  /** offeringId -> job status, so the open-job removal guard is testable. */
  private readonly offeringJobs: { offeringId: string; status: string }[] = [];
  private seq = SEEDED_OFFERINGS.length + 1;

  /** Test setup: link a user to a professional fixture. */
  linkProfessionalProfile(userId: string, professionalId: string): void {
    this.professionalByUserId.set(userId, professionalId);
  }

  /** Test setup: grant a user OWNER/MANAGER access to a business fixture. */
  addBusinessMembership(userId: string, businessId: string, role: 'OWNER' | 'MANAGER'): void {
    const current = this.businessesByUserId.get(userId) ?? [];
    if (!current.some((entry) => entry.businessId === businessId)) current.push({ businessId, role });
    this.businessesByUserId.set(userId, current);
  }

  /** Test setup: attach a job to an offering in the given status. */
  addOfferingJob(offeringId: string, status: string): void {
    this.offeringJobs.push({ offeringId, status });
  }

  async findProfessionalProfileByUserId(userId: string): Promise<ProfessionalIdentity | null> {
    const id = this.professionalByUserId.get(userId);
    return id === undefined ? null : { id };
  }

  async findBusinessesForUser(userId: string): Promise<BusinessIdentity[]> {
    return [...(this.businessesByUserId.get(userId) ?? [])];
  }

  async getActiveCategory(categoryId: string): Promise<ServiceCategoryRef | null> {
    const category = CATEGORIES.find((entry) => entry.id === categoryId);
    if (!category || !category.isActive) return null;
    return { id: category.id, name: category.name, slug: category.slug };
  }

  async listOfferings(owners: OfferingOwner[]): Promise<ServiceOfferingDto[]> {
    const visible = this.offerings.filter(
      (row) =>
        !row.deletedAt &&
        owners.some(
          (owner) => owner.providerType === row.providerType && owner.providerId === row.providerId,
        ),
    );
    return visible.map(toDto).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getOfferingById(id: string): Promise<ServiceOfferingDto | null> {
    const row = this.offerings.find((entry) => entry.id === id);
    return row ? toDto(row) : null;
  }

  async createOffering(
    owner: OfferingOwner,
    input: OfferingMutationInput,
  ): Promise<ServiceOfferingDto> {
    this.assertNameFree(owner, input.name, null);
    const category = CATEGORIES.find((entry) => entry.id === input.categoryId);
    if (!category) throw new OfferingsStoreError('NOT_FOUND', 'Category not found.');
    const now = '2026-09-15T12:00:00.000Z';
    const row: OfferingRow = {
      id: String(this.seq++),
      providerType: owner.providerType,
      providerId: owner.providerId,
      categoryId: input.categoryId,
      categoryName: category.name,
      categorySlug: category.slug,
      name: input.name,
      description: input.description,
      priceAmount: input.priceAmount,
      currency: 'ZAR',
      isActive: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: false,
    };
    this.offerings.push(row);
    return toDto(row);
  }

  async updateOffering(
    id: string,
    input: Partial<OfferingMutationInput>,
  ): Promise<ServiceOfferingDto | null> {
    const row = this.offerings.find((entry) => entry.id === id);
    if (!row) return null;
    if (input.name !== undefined) {
      this.assertNameFree(
        { providerType: row.providerType, providerId: row.providerId },
        input.name,
        row.id,
      );
      row.name = input.name;
    }
    if (input.categoryId !== undefined) {
      const category = CATEGORIES.find((entry) => entry.id === input.categoryId);
      if (!category) throw new OfferingsStoreError('NOT_FOUND', 'Category not found.');
      row.categoryId = category.id;
      row.categoryName = category.name;
      row.categorySlug = category.slug;
    }
    if (input.description !== undefined) row.description = input.description;
    if (input.priceAmount !== undefined) row.priceAmount = input.priceAmount;
    row.updatedAt = '2026-09-15T12:05:00.000Z';
    return toDto(row);
  }

  async removeOffering(id: string): Promise<ServiceOfferingDto | null> {
    const row = this.offerings.find((entry) => entry.id === id);
    if (!row) return null;
    row.isActive = false;
    row.deletedAt = true;
    row.updatedAt = '2026-09-15T12:10:00.000Z';
    return toDto(row);
  }

  async countOpenJobsForOffering(id: string): Promise<number> {
    return this.offeringJobs.filter(
      (job) => job.offeringId === id && (OPEN_JOB_STATUSES as readonly string[]).includes(job.status),
    ).length;
  }

  /** Mirrors the per-owner unique indexes on the real table. */
  private assertNameFree(owner: OfferingOwner, name: string, exceptId: string | null): void {
    const clash = this.offerings.some(
      (row) =>
        row.id !== exceptId &&
        !row.deletedAt &&
        row.providerType === owner.providerType &&
        row.providerId === owner.providerId &&
        row.name === name,
    );
    if (clash) {
      throw new OfferingsStoreError('CONFLICT', 'You already have a service with that name.');
    }
  }
}

function toDto(row: OfferingRow): ServiceOfferingDto {
  const { deletedAt: _deletedAt, ...dto } = row;
  return { ...dto };
}