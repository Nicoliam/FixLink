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
  AssignTechnicianInput,
  BusinessCustomerDto,
  BusinessDto,
  BusinessIdentity,
  CreateBusinessCustomerInput,
  CreateInternalJobInput,
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
  // ------------------------------------------------------------------
  // Stage 7B — business-managed customers (`customer_profiles` with
  // `user_id = NULL`, scoped by `business_id`). Every method re-scopes
  // to the caller's business: another business's customer reads as
  // null (NOT_FOUND upstream), never as a forbidden signal.
  // ------------------------------------------------------------------
  /** Customers for one business, creation order, paginated. */
  listBusinessCustomers(
    businessId: string,
    page: number,
    pageSize: number,
    search: string | null,
  ): Promise<{ items: BusinessCustomerDto[]; total: number }>;
  /** One business customer, or null when unknown (or owned by another business). */
  getBusinessCustomer(businessId: string, customerId: string): Promise<BusinessCustomerDto | null>;
  /** Insert a `user_id = NULL` customer row owned by the business. */
  createBusinessCustomer(businessId: string, input: CreateBusinessCustomerInput): Promise<BusinessCustomerDto>;
  /** Apply a validated customer patch; null when unknown (or foreign). */
  updateBusinessCustomer(
    businessId: string,
    customerId: string,
    patch: UpdateBusinessCustomerInput,
  ): Promise<BusinessCustomerDto | null>;
  // ------------------------------------------------------------------
  // Stage 7B — internal business jobs (the ONE shared `jobs` table with
  // `source = INTERNAL`). Marketplace rows are never returned here: every
  // read filters `source = INTERNAL` in addition to `business_id`.
  // ------------------------------------------------------------------
  /** Customer row for job validation (id + owning business), or null. */
  findInternalCustomer(businessId: string, customerId: string): Promise<{ id: string } | null>;
  /**
   * Insert an INTERNAL / REQUESTED job plus the initial `NULL →
   * REQUESTED` history entry. The caller guarantees the customer
   * belongs to the business and the service is active.
   */
  createInternalJob(input: PersistInternalJobInput): Promise<InternalJobDto>;
  /** INTERNAL jobs for one business, newest first, paginated + filtered. */
  listInternalJobs(
    businessId: string,
    query: { status: InternalJobStatus | null; search: string | null; page: number; pageSize: number },
  ): Promise<{ items: InternalJobDto[]; total: number }>;
  /** One INTERNAL job with embedded customer/service/business, or null. */
  getInternalJob(businessId: string, jobId: string): Promise<InternalJobDto | null>;
  /** Apply a validated field patch (no status change); null when unknown/foreign. */
  updateInternalJob(
    businessId: string,
    jobId: string,
    patch: UpdateInternalJobInput,
  ): Promise<InternalJobDto | null>;
  /**
   * Cancel a REQUESTED internal job: guarded `REQUESTED → CANCELLED`
   * update plus the history entry, atomically. Returns null when the
   * job is unknown/foreign; throws JobNotCancellableError when the
   * current state forbids cancellation (the service maps it to 422).
   */
  cancelInternalJob(businessId: string, jobId: string, input: { reason: string | null; changedBy: string }): Promise<InternalJobDto | null>;
  /** Status history for one INTERNAL job, oldest first (null when foreign). */
  listInternalJobHistory(businessId: string, jobId: string): Promise<InternalJobTimelineEntry[] | null>;
  /** INTERNAL job counts by status for the business dashboard. */
  countInternalJobsByStatus(businessId: string): Promise<InternalJobsSummary>;
  /** Full internal-job detail (job + timeline) for the detail endpoint. */
  getInternalJobDetail(businessId: string, jobId: string): Promise<InternalJobDetailDto | null>;
  // ------------------------------------------------------------------
  // Stage 7C — technician assignment (existing `job_assignments` table
  // with `assignment_type = TECHNICIAN`). The active row has
  // `unassigned_at IS NULL`; reassignment closes it and inserts a new
  // row. Job status is never changed by assignment.
  // ------------------------------------------------------------------
  /**
   * Active TECHNICIAN assignment for one INTERNAL job, or null when
   * unassigned. Returns null when the job is unknown, foreign, or not
   * INTERNAL (NOT_FOUND upstream — no cross-business probing).
   */
  getActiveJobAssignment(businessId: string, jobId: string): Promise<JobAssignmentDto | null>;
  /** Assignment history for one INTERNAL job, newest first (null when foreign). */
  listJobAssignmentHistory(businessId: string, jobId: string): Promise<JobAssignmentHistoryEntry[] | null>;
  /** Full assignment detail (active + history) for the assignment endpoint. */
  getJobAssignmentDetail(businessId: string, jobId: string): Promise<JobAssignmentDetailDto | null>;
  /**
   * Assign (or reassign) a technician: closes any active TECHNICIAN row
   * for the job and inserts a new active row, atomically. The caller
   * guarantees the job is INTERNAL and owned by the business and the
   * technician is active in the same business. Returns null when the
   * job is unknown/foreign (NOT_FOUND upstream).
   */
  assignJobTechnician(
    businessId: string,
    jobId: string,
    input: AssignTechnicianInput & { assignedBy: string },
  ): Promise<JobAssignmentDto | null>;
  // ------------------------------------------------------------------
  // Stage 7C — technician My Jobs. The technician identity is derived
  // server-side from the authenticated user; a technician_id from the
  // request is never trusted.
  // ------------------------------------------------------------------
  /** INTERNAL jobs actively assigned to one technician, newest first. */
  listTechnicianJobs(
    technicianId: string,
    query: { status: InternalJobStatus | null; page: number; pageSize: number },
  ): Promise<{ items: InternalJobDto[]; total: number }>;
  /** One INTERNAL job actively assigned to the technician, or null. */
  getTechnicianJob(technicianId: string, jobId: string): Promise<InternalJobDto | null>;
  /** Status history for a technician-assigned job, oldest first (null when not assigned). */
  listTechnicianJobHistory(technicianId: string, jobId: string): Promise<InternalJobTimelineEntry[] | null>;
  /** Full technician job detail (job + timeline) for the detail endpoint. */
  getTechnicianJobDetail(technicianId: string, jobId: string): Promise<InternalJobDetailDto | null>;
}

/** The job is not in a cancellable state (only REQUESTED may cancel in Stage 7B). */
export class JobNotCancellableError extends Error {
  constructor(message = 'Only requested jobs can be cancelled.') {
    super(message);
    this.name = 'JobNotCancellableError';
  }
}

/** Persist input for an internal job (ownership already verified by the service). */
export interface PersistInternalJobInput extends CreateInternalJobInput {
  reference: string;
  businessId: string;
  businessName: string;
  createdBy: string;
  /** Resolved service name/slug for the embedded projection. */
  serviceName: string;
  serviceSlug: string;
}
