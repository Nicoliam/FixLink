/**
 * FixLink Stage 7A — in-memory business store for automated tests.
 *
 * Mirrors the MySQL implementation's rules (membership-derived access,
 * business-scoped roster, no double-linking, synced activation flags)
 * without requiring a database. Tests seed businesses explicitly via
 * `seedBusiness` / `addMembership`, mirroring the production
 * `business_profiles` / `business_members` rows that the MySQL store
 * reads — technician users themselves are created through the API
 * invite flow so the full path is exercised.
 */
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

function nowIso(): string {
  return new Date().toISOString();
}

interface BusinessRow extends Omit<BusinessDto, 'role' | 'technicianCount'> {
  ownerUserId: string;
}

interface MemberRow {
  businessId: string;
  userId: string;
  role: 'BUSINESS_OWNER' | 'BUSINESS_MANAGER' | 'TECHNICIAN';
  isActive: boolean;
}

interface TechnicianRow {
  id: string;
  businessId: string;
  userId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SeedBusinessInput {
  ownerUserId: string;
  businessName?: string;
  slug?: string;
  description?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  province?: string | null;
}

function rank(role: BusinessIdentity['role']): number {
  return role === 'OWNER' ? 0 : role === 'MANAGER' ? 1 : 2;
}

export class MemoryBusinessStore implements BusinessStore {
  private businessSeq = 0;
  private technicianSeq = 0;
  private readonly businesses = new Map<string, BusinessRow>();
  private readonly members: MemberRow[] = [];
  private readonly technicians = new Map<string, TechnicianRow>();

  /** Test setup: provision a business owned by the given user. */
  seedBusiness(input: SeedBusinessInput): BusinessRow {
    this.businessSeq += 1;
    const id = String(this.businessSeq);
    const name = input.businessName ?? `Test Business ${id}`;
    const row: BusinessRow = {
      id,
      ownerUserId: input.ownerUserId,
      businessName: name,
      slug: input.slug ?? `test-business-${id}`,
      description: input.description ?? null,
      logoReference: null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      addressLine1: null,
      city: input.city ?? null,
      province: input.province ?? null,
      postalCode: null,
      verificationStatus: 'UNVERIFIED',
      ratingAvg: 0,
      ratingCount: 0,
      isActive: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.businesses.set(id, row);
    this.members.push({ businessId: id, userId: input.ownerUserId, role: 'BUSINESS_OWNER', isActive: true });
    return row;
  }

  /** Test setup: grant a user an active role in a business. */
  addMembership(businessId: string, userId: string, role: MemberRow['role']): void {
    const existing = this.members.find((m) => m.businessId === businessId && m.userId === userId);
    if (existing) {
      existing.role = role;
      existing.isActive = true;
      return;
    }
    this.members.push({ businessId, userId, role, isActive: true });
  }

  async findBusinessesForUser(userId: string): Promise<BusinessIdentity[]> {
    const identities = new Map<string, BusinessIdentity>();
    for (const row of this.businesses.values()) {
      if (row.ownerUserId === userId) {
        identities.set(row.id, { businessId: row.id, role: 'OWNER' });
      }
    }
    for (const member of this.members) {
      if (member.userId !== userId || !member.isActive) continue;
      const role: BusinessIdentity['role'] =
        member.role === 'BUSINESS_OWNER' ? 'OWNER' : member.role === 'BUSINESS_MANAGER' ? 'MANAGER' : 'TECHNICIAN';
      const existing = identities.get(member.businessId);
      if (!existing || rank(role) < rank(existing.role)) {
        identities.set(member.businessId, { businessId: member.businessId, role });
      }
    }
    return [...identities.values()].sort(
      (a, b) => rank(a.role) - rank(b.role) || Number(a.businessId) - Number(b.businessId),
    );
  }

  async getBusinessById(businessId: string): Promise<Omit<BusinessDto, 'role' | 'technicianCount'> | null> {
    const row = this.businesses.get(businessId);
    if (!row) return null;
    const { ownerUserId: _owner, ...rest } = row;
    return { ...rest };
  }

  async updateBusiness(businessId: string, patch: UpdateBusinessInput): Promise<void> {
    const row = this.businesses.get(businessId);
    if (!row) return;
    const next: BusinessRow = { ...row, updatedAt: nowIso() };
    if (patch.businessName !== undefined) next.businessName = patch.businessName;
    if (patch.description !== undefined) next.description = patch.description;
    if (patch.email !== undefined) next.email = patch.email;
    if (patch.phone !== undefined) next.phone = patch.phone;
    if (patch.addressLine1 !== undefined) next.addressLine1 = patch.addressLine1;
    if (patch.city !== undefined) next.city = patch.city;
    if (patch.province !== undefined) next.province = patch.province;
    if (patch.postalCode !== undefined) next.postalCode = patch.postalCode;
    this.businesses.set(businessId, next);
  }

  async countTechnicians(businessId: string): Promise<number> {
    return [...this.technicians.values()].filter((t) => t.businessId === businessId).length;
  }

  async listTechnicians(businessId: string): Promise<TechnicianDto[]> {
    return [...this.technicians.values()]
      .filter((t) => t.businessId === businessId)
      .sort((a, b) => Number(a.id) - Number(b.id))
      .map(toDto);
  }

  async getTechnicianById(technicianId: string): Promise<TechnicianDto | null> {
    const row = this.technicians.get(technicianId);
    return row ? toDto(row) : null;
  }

  async findTechnicianByUserId(businessId: string, userId: string): Promise<TechnicianDto | null> {
    const row = [...this.technicians.values()].find((t) => t.businessId === businessId && t.userId === userId);
    return row ? toDto(row) : null;
  }

  async linkTechnician(input: LinkTechnicianPersistInput): Promise<TechnicianDto> {
    // All checks run before any mutation: a failed link leaves the
    // business untouched (no member row without a technician row).
    if (!this.businesses.has(input.businessId)) {
      throw new TechnicianConflictError('Business not found.');
    }
    const existingMember = this.members.find((m) => m.businessId === input.businessId && m.userId === input.userId);
    if (existingMember?.isActive) {
      throw new TechnicianConflictError();
    }
    const duplicateTech = [...this.technicians.values()].some(
      (t) => t.businessId === input.businessId && t.userId === input.userId,
    );
    if (duplicateTech) {
      throw new TechnicianConflictError();
    }
    if (existingMember) {
      existingMember.role = 'TECHNICIAN';
      existingMember.isActive = true;
    } else {
      this.members.push({
        businessId: input.businessId,
        userId: input.userId,
        role: 'TECHNICIAN',
        isActive: true,
      });
    }
    this.technicianSeq += 1;
    const row: TechnicianRow = {
      id: String(this.technicianSeq),
      businessId: input.businessId,
      userId: input.userId,
      displayName: input.displayName,
      email: input.email,
      phone: input.phone,
      isActive: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.technicians.set(row.id, row);
    return toDto(row);
  }

  async updateTechnician(
    businessId: string,
    technicianId: string,
    patch: UpdateTechnicianInput,
  ): Promise<TechnicianDto | null> {
    const row = this.technicians.get(technicianId);
    if (!row || row.businessId !== businessId) return null;
    const next: TechnicianRow = { ...row, updatedAt: nowIso() };
    if (patch.displayName !== undefined) next.displayName = patch.displayName;
    if (patch.isActive !== undefined) {
      next.isActive = patch.isActive;
      // The membership flag is the access gate — keep it in sync so
      // deactivation immediately revokes business access.
      const member = this.members.find((m) => m.businessId === businessId && m.userId === row.userId);
      if (member) member.isActive = patch.isActive;
    }
    this.technicians.set(technicianId, next);
    return toDto(next);
  }
}

function toDto(row: TechnicianRow): TechnicianDto {
  return {
    id: row.id,
    businessId: row.businessId,
    userId: row.userId,
    displayName: row.displayName,
    email: row.email,
    phone: row.phone,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
