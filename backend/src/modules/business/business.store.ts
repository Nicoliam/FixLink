/**
 * FixLink Stage 7A — business data-access contract.
 *
 * The MySQL implementation serves production (transactional technician
 * linking + activation); the memory implementation serves automated
 * tests with the same rules. Membership resolution lives here because
 * it is persistence-specific: production reads `business_profiles` /
 * `business_members`, tests use explicit seed links.
 *
 * No schema change was required — the existing `business_profiles`,
 * `business_members`, `technicians` and `users` tables already support
 * this stage. Technicians are business team members and are never
 * created as marketplace professionals here.
 */
import type {
  BusinessDto,
  BusinessIdentity,
  TechnicianDto,
  UpdateBusinessInput,
  UpdateTechnicianInput,
} from './business.types';

/** The account is already a member of this business — never double-link. */
export class TechnicianConflictError extends Error {
  constructor(message = 'This account is already a member of the business.') {
    super(message);
    this.name = 'TechnicianConflictError';
  }
}

export interface LinkTechnicianPersistInput {
  businessId: string;
  /** Resolved user id (created by the service, or an existing account). */
  userId: string;
  displayName: string;
  /** Contact snapshot at invite time (memory store persists it; the MySQL
   * implementation reads contact info live from `users` via JOIN). */
  email: string | null;
  phone: string | null;
  /** Authenticated owner/manager user id — recorded for future audit use. */
  invitedBy: string;
}

export interface BusinessStore {
  /** Businesses the user may act for (owner row or active membership). */
  findBusinessesForUser(userId: string): Promise<BusinessIdentity[]>;
  /** Business profile row, or null when unknown/deleted. */
  getBusinessById(businessId: string): Promise<Omit<BusinessDto, 'role' | 'technicianCount'> | null>;
  /** Apply a validated profile patch; the row must exist (checked by the service). */
  updateBusiness(businessId: string, patch: UpdateBusinessInput): Promise<void>;
  /** Roster size (active + inactive rows) for the dashboard summary. */
  countTechnicians(businessId: string): Promise<number>;
  /** Roster for one business, creation order, contact info included. */
  listTechnicians(businessId: string): Promise<TechnicianDto[]>;
  /** One technician row with contact info, or null when unknown/deleted. */
  getTechnicianById(technicianId: string): Promise<TechnicianDto | null>;
  /** Technician row for a user within a business (self-access), or null. */
  findTechnicianByUserId(businessId: string, userId: string): Promise<TechnicianDto | null>;
  /**
   * Link a user as a TECHNICIAN member of the business (member row +
   * technician row), atomically. Throws TechnicianConflictError when the
   * account already holds an active membership in this business; the
   * business is left untouched.
   */
  linkTechnician(input: LinkTechnicianPersistInput): Promise<TechnicianDto>;
  /**
   * Apply a validated technician patch (display name and/or active flag).
   * The active flag is kept in sync across `technicians.is_active` and
   * `business_members.is_active` so deactivation immediately revokes
   * business access. Returns null when the row is unknown (or belongs to
   * another business — the service treats that as NOT_FOUND).
   */
  updateTechnician(
    businessId: string,
    technicianId: string,
    patch: UpdateTechnicianInput,
  ): Promise<TechnicianDto | null>;
}
