/**
 * FixLink Stage 7A — business foundation + technician management service.
 *
 * Owns the authenticated business surface: profile read/update and the
 * technician roster. The business is always derived server-side from the
 * authenticated user's membership (`business_profiles.owner_user_id` /
 * active `business_members` rows) — a `business_id` in the request is
 * never read. TECHNICIAN members are never marketplace providers and
 * cannot manage the business; CUSTOMERs, PROFESSIONALs and ADMINs have
 * no business identity in this stage.
 *
 * Isolation: every technician row is re-scoped to the caller's business
 * before it is returned. Another business's technician reads as
 * 404 NOT_FOUND, never 403, so technician ids cannot be probed across
 * businesses.
 */
import { hashPassword } from '../../utils/password';
import type { UserRepository } from '../users/user.repository';
import { TechnicianConflictError, type BusinessStore } from './business.store';
import type { BusinessDto, BusinessIdentity, TechnicianDto } from './business.types';
import {
  validateBusinessPatch,
  validateTechnicianCreate,
  validateTechnicianPatch,
} from './business.validation';

export interface ServiceResult<T> {
  status: number;
  code?: string;
  message?: string;
  data?: T;
}

function fail<T>(status: number, code: string, message: string): ServiceResult<T> {
  return { status, code, message };
}

const MANAGER_ROLES = ['BUSINESS_OWNER', 'BUSINESS_MANAGER'];

function isNumericId(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value.trim());
}

export class BusinessService {
  constructor(
    private readonly users: UserRepository,
    private readonly business: BusinessStore,
  ) {}

  /**
   * Resolve the caller's primary business. Owners/managers act for their
   * membership business (owned first, then lowest id — multi-business
   * support is a documented future extension). Returns the forbidden /
   * missing signals the controller maps to 403 / 404.
   */
  private async resolveManagement(
    authUserId: string,
  ): Promise<
    | { businessId: string; role: 'OWNER' | 'MANAGER' }
    | { businessId: null; status: number; code: string; message: string }
  > {
    const roles = await this.users.getRoles(authUserId);
    if (!roles.some((role) => MANAGER_ROLES.includes(role))) {
      if (roles.includes('TECHNICIAN')) {
        return {
          businessId: null,
          status: 403,
          code: 'FORBIDDEN_ROLE',
          message: 'Technicians cannot access business administration.',
        };
      }
      if (roles.includes('CUSTOMER') || roles.includes('PROFESSIONAL')) {
        return {
          businessId: null,
          status: 403,
          code: 'FORBIDDEN_ROLE',
          message: 'Only business accounts can access this resource.',
        };
      }
      return {
        businessId: null,
        status: 403,
        code: 'FORBIDDEN_ROLE',
        message: 'Your account cannot access business resources.',
      };
    }
    const identities = await this.business.findBusinessesForUser(authUserId);
    const primary = identities.find(
      (entry): entry is BusinessIdentity & { role: 'OWNER' | 'MANAGER' } =>
        entry.role === 'OWNER' || entry.role === 'MANAGER',
    );
    if (!primary) {
      return { businessId: null, status: 404, code: 'NOT_FOUND', message: 'No business found for your account.' };
    }
    return { businessId: primary.businessId, role: primary.role };
  }

  async getBusiness(authUserId: string): Promise<ServiceResult<BusinessDto>> {
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const row = await this.business.getBusinessById(access.businessId);
    if (!row) return fail(404, 'NOT_FOUND', 'No business found for your account.');
    const technicianCount = await this.business.countTechnicians(access.businessId);
    return { status: 200, data: { ...row, role: access.role, technicianCount } };
  }

  async updateBusiness(authUserId: string, body: unknown): Promise<ServiceResult<BusinessDto>> {
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    // Profile edits are an owner action; managers operate the roster and
    // jobs but do not rewrite the business identity.
    if (access.role !== 'OWNER') {
      return fail(403, 'FORBIDDEN_ROLE', 'Only business owners can update the business profile.');
    }
    const { input, error } = validateBusinessPatch(body);
    if (!input || error) {
      return fail(error?.status ?? 422, error?.code ?? 'VALIDATION_ERROR', error?.message ?? 'Invalid business profile.');
    }
    const row = await this.business.getBusinessById(access.businessId);
    if (!row) return fail(404, 'NOT_FOUND', 'No business found for your account.');
    await this.business.updateBusiness(access.businessId, input);
    const updated = await this.business.getBusinessById(access.businessId);
    if (!updated) return fail(404, 'NOT_FOUND', 'No business found for your account.');
    const technicianCount = await this.business.countTechnicians(access.businessId);
    return { status: 200, data: { ...updated, role: access.role, technicianCount } };
  }

  async listTechnicians(authUserId: string): Promise<ServiceResult<{ items: TechnicianDto[]; total: number }>> {
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const items = await this.business.listTechnicians(access.businessId);
    return { status: 200, data: { items, total: items.length } };
  }

  /**
   * Technician detail. Owners/managers read any roster row in their
   * business; a technician reads only their own row (self-access via
   * the user association). Every other technician id — same business
   * or not — reads as 404 so roster membership cannot be probed.
   */
  async getTechnician(authUserId: string, technicianId: string): Promise<ServiceResult<TechnicianDto>> {
    if (!isNumericId(technicianId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid technician id.');
    }
    const id = technicianId.trim();
    const roles = await this.users.getRoles(authUserId);
    if (roles.some((role) => MANAGER_ROLES.includes(role))) {
      const access = await this.resolveManagement(authUserId);
      if (access.businessId === null) {
        return fail(access.status, access.code, access.message);
      }
      const row = await this.business.getTechnicianById(id);
      if (!row || row.businessId !== access.businessId) {
        return fail(404, 'NOT_FOUND', 'Technician not found.');
      }
      return { status: 200, data: row };
    }
    if (roles.includes('TECHNICIAN')) {
      const identities = await this.business.findBusinessesForUser(authUserId);
      const membership = identities.find((entry) => entry.role === 'TECHNICIAN');
      if (!membership) return fail(404, 'NOT_FOUND', 'Technician not found.');
      const own = await this.business.findTechnicianByUserId(membership.businessId, authUserId);
      if (own && own.id === id) {
        const row = await this.business.getTechnicianById(id);
        if (row) return { status: 200, data: row };
      }
      return fail(404, 'NOT_FOUND', 'Technician not found.');
    }
    if (roles.includes('CUSTOMER') || roles.includes('PROFESSIONAL')) {
      return fail(403, 'FORBIDDEN_ROLE', 'Your account cannot access technician records.');
    }
    return fail(403, 'FORBIDDEN_ROLE', 'Your account cannot access technician records.');
  }

  /**
   * Invite a technician into the caller's business. A brand-new email
   * creates a TECHNICIAN login (ACTIVE, bcrypt hash — never plaintext)
   * plus the member and technician rows; an existing account is linked
   * (and gains the TECHNICIAN role) without touching its password — a
   * `password` alongside an existing email is rejected with 422 so the
   * caller can never believe they reset someone else's credentials.
   * Technicians never gain a marketplace provider profile here.
   */
  async createTechnician(authUserId: string, body: unknown): Promise<ServiceResult<TechnicianDto>> {
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const { input, error } = validateTechnicianCreate(body);
    if (!input || error) {
      return fail(error?.status ?? 422, error?.code ?? 'VALIDATION_ERROR', error?.message ?? 'Invalid technician.');
    }
    const existing = await this.users.findByEmail(input.email);
    try {
      if (existing) {
        if (input.password !== null) {
          return fail(422, 'VALIDATION_ERROR', 'Password cannot be set for an existing account.');
        }
        await this.users.setRoles(existing.id, ['TECHNICIAN']);
        const linked = await this.business.linkTechnician({
          businessId: access.businessId,
          userId: existing.id,
          displayName: input.displayName,
          email: existing.email,
          phone: existing.phone,
          invitedBy: authUserId,
        });
        return { status: 201, data: linked };
      }
      if (input.password === null) {
        return fail(422, 'VALIDATION_ERROR', 'Password is required for a new technician account.');
      }
      const passwordHash = await hashPassword(input.password);
      let created = await this.users.create({ email: input.email, phone: input.phone, passwordHash });
      await this.users.setRoles(created.id, ['TECHNICIAN']);
      await this.users.setStatus(created.id, 'ACTIVE');
      created = (await this.users.findById(created.id)) ?? created;
      const linked = await this.business.linkTechnician({
        businessId: access.businessId,
        userId: created.id,
        displayName: input.displayName,
        email: created.email,
        phone: created.phone,
        invitedBy: authUserId,
      });
      return { status: 201, data: linked };
    } catch (err) {
      if (err instanceof TechnicianConflictError) {
        return fail(409, 'CONFLICT', err.message);
      }
      if ((err as { code?: unknown } | null)?.code === 'ER_DUP_ENTRY') {
        // Lost a creation race: the email now exists — link it instead.
        const raced = await this.users.findByEmail(input.email);
        if (!raced) throw err;
        try {
          await this.users.setRoles(raced.id, ['TECHNICIAN']);
          const linked = await this.business.linkTechnician({
            businessId: access.businessId,
            userId: raced.id,
            displayName: input.displayName,
            email: raced.email,
            phone: raced.phone,
            invitedBy: authUserId,
          });
          return { status: 201, data: linked };
        } catch (nested) {
          if (nested instanceof TechnicianConflictError) {
            return fail(409, 'CONFLICT', nested.message);
          }
          throw nested;
        }
      }
      throw err;
    }
  }

  /**
   * Update a roster row (display name and/or active flag). Owners and
   * managers may edit; technicians never manage — not even themselves.
   * Another business's id reads as 404 (no cross-business probing).
   */
  async updateTechnician(
    authUserId: string,
    technicianId: string,
    body: unknown,
  ): Promise<ServiceResult<TechnicianDto>> {
    if (!isNumericId(technicianId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid technician id.');
    }
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const { input, error } = validateTechnicianPatch(body);
    if (!input || error) {
      return fail(error?.status ?? 422, error?.code ?? 'VALIDATION_ERROR', error?.message ?? 'Invalid technician update.');
    }
    const updated = await this.business.updateTechnician(access.businessId, technicianId.trim(), input);
    if (!updated) return fail(404, 'NOT_FOUND', 'Technician not found.');
    return { status: 200, data: updated };
  }
}
