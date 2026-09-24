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
import {
  JOB_IMAGE_ALLOWED_MIME,
  JOB_IMAGE_MAX_BYTES,
  LocalFileStorage,
  VOICE_NOTE_ALLOWED_MIME,
  VOICE_NOTE_MAX_BYTES,
  detectAudioType,
  detectImageType,
  extensionForAudioMime,
  extensionForMime,
  sanitizeOriginalFilename,
  type FileStorage,
} from '../../services/file-storage';
import type { UserRepository } from '../users/user.repository';
import type { JobsStore } from '../jobs/jobs.store';
import type { NotificationService } from '../notifications/notifications.service';
import type { NotificationType } from '../notifications/notifications.types';
import {
  JobNotCancellableError,
  JobNotStartableError,
  PartsRequestNotActionableError,
  TechnicianConflictError,
  TechnicianImageNotDeletableError,
  TechnicianJobNotCompletableError,
  TechnicianJobNotExecutableError,
  buildTechnicianExecutionEvents,
  type BusinessStore,
} from './business.store';
import {
  PartsRequestEventBus,
  approvalEvent,
  jobReadyEvent,
  partsAvailableEvent,
  technicianRespondedEvent,
} from './parts-request-events';
import type {
  BusinessCustomerDto,
  BusinessDto,
  BusinessIdentity,
  InternalJobDetailDto,
  InternalJobDto,
  InternalJobsSummary,
  BusinessBoardJobDto,
  BusinessBoardSummary,
  JobAssignmentDetailDto,
  JobAssignmentDto,
  PartsApprovalDto,
  PartsRequestDto,
  TechnicianDto,
  TechnicianExecutionTimelineDto,
  TechnicianJobImageDto,
  TechnicianJobUpdateDto,
  TechnicianVoiceNoteDto,
  TechnicianWorkPhase,
} from './business.types';
import {
  validateBusinessPatch,
  validateTechnicianCreate,
  validateTechnicianPatch,
} from './business.validation';
import { validateBusinessCustomerCreate, validateBusinessCustomerPatch } from './business-customers.validation';
import { validateAssignmentCreate } from './business-assignment.validation';
import { validatePartsRequestCreate } from './business-parts.validation';
import { validateApprovalDecision, validatePartsResponse } from './business-approvals.validation';
import {
  validateInternalJobCancel,
  validateInternalJobCreate,
  validateInternalJobListQuery,
  validateInternalJobPatch,
} from './business-jobs.validation';
import { parseWorkPhase, validateCompletionNote, validateWorkUpdate } from '../execution/execution.validation';

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

function readPage(value: unknown, fallback: number, max: number): number | null {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const num = Number(String(value).trim());
  if (!Number.isInteger(num) || num < 1 || num > max) return null;
  return num;
}

export class BusinessService {
  private readonly storage: FileStorage;
  private readonly events: PartsRequestEventBus;

  constructor(
    private readonly users: UserRepository,
    private readonly business: BusinessStore,
    /**
     * Catalogue reads for internal-job service validation. Optional so
     * pre-7B constructions keep compiling; Stage 7B wiring always
     * supplies the shared jobs store (memory in tests, MySQL in
     * production) so fixture and catalogue ids stay consistent.
     */
    private readonly jobs?: Pick<JobsStore, 'findActiveService'>,
    /**
     * File bytes for technician execution (photos + voice notes).
     * Optional so pre-7D constructions keep compiling; Stage 7D wiring
     * always supplies the shared storage adapter (isolated tmp dirs in
     * tests, the local MVP dir in production).
     */
    storage?: FileStorage,
    /**
     * Stage 7F notification seam. Optional so pre-7F constructions keep
     * compiling; Stage 7F wiring supplies the shared bus (a fresh bus
     * per test app, one process-wide bus in production) that Stage 8
     * will persist into the `notifications` table.
     */
    events?: PartsRequestEventBus,
    /**
     * Stage 8 — central notification delivery (in-app only). Optional
     * so pre-8 constructions keep compiling. Every emission runs
     * AFTER the state change commits and is best-effort: delivery
     * failures never roll back the assignment/execution/approval
     * outcome. The Stage 7F bus keeps emitting (existing tests drain
     * it); persistence goes through this service directly, so no
     * event is ever delivered twice.
     */
    private readonly notify?: NotificationService,
  ) {
    this.storage = storage ?? new LocalFileStorage();
    this.events = events ?? new PartsRequestEventBus();
  }

  /** Stage 7F notification seam (Stage 8 persists these into `notifications`). */
  get eventBus(): PartsRequestEventBus {
    return this.events;
  }

  /**
   * Stage 8 — notify the business owners/managers of one business.
   * Recipients resolve server-side (`findActiveManagerUserIds` —
   * owner + active owner/manager members, never technicians, never
   * another business); the actor is excluded. Messages carry only
   * the job reference/service/part facts visible on the job —
   * never verification, customer-contact or admin-only data.
   */
  private async emitToManagers(
    businessId: string,
    excludeUserId: string,
    event: { type: NotificationType; title: string; message: string; jobId: string },
  ): Promise<void> {
    if (!this.notify) return;
    try {
      const managers = await this.business.findActiveManagerUserIds(businessId);
      const recipients = managers.filter((id) => id !== excludeUserId);
      if (recipients.length === 0) return;
      await this.notify.createForUsers(recipients, {
        type: event.type,
        title: event.title,
        message: event.message,
        referenceType: 'INTERNAL_JOB',
        referenceId: event.jobId,
      });
    } catch {
      // Best-effort — the committed business operation stands.
    }
  }

  /** Stage 8 — notify exactly one technician (assignment / parts decisions). */
  private async emitToTechnician(
    technicianUserId: string,
    event: { type: NotificationType; title: string; message: string; jobId: string },
  ): Promise<void> {
    if (!this.notify) return;
    try {
      await this.notify.createForUsers([technicianUserId], {
        type: event.type,
        title: event.title,
        message: event.message,
        referenceType: 'INTERNAL_JOB',
        referenceId: event.jobId,
      });
    } catch {
      // Best-effort — the committed business operation stands.
    }
  }

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

  // ------------------------------------------------------------------
  // Stage 7B — business-managed customers.
  //
  // The owning business is always derived server-side from the
  // authenticated membership — a `business_id` in the request is
  // never read. Every customer row is re-scoped to that business:
  // another business's customer reads as 404 NOT_FOUND, never 403.
  // ------------------------------------------------------------------

  async listBusinessCustomers(
    authUserId: string,
    query: Record<string, unknown>,
  ): Promise<ServiceResult<{ items: BusinessCustomerDto[]; total: number; page: number; pageSize: number }>> {
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const page = readPage(query['page'], 1, 1000);
    const pageSize = readPage(query['pageSize'] ?? query['page_size'], 20, 50);
    if (page === null || pageSize === null) {
      return fail(422, 'VALIDATION_ERROR', 'Invalid pagination. Use page 1–1000 and pageSize 1–50.');
    }
    const rawSearch = query['search'] ?? query['q'];
    const search =
      rawSearch === undefined || rawSearch === null || String(rawSearch).trim() === ''
        ? null
        : String(rawSearch).trim();
    if (search !== null && search.length > 128) {
      return fail(422, 'VALIDATION_ERROR', 'Search must be 128 characters or fewer.');
    }
    const result = await this.business.listBusinessCustomers(access.businessId, page, pageSize, search);
    return { status: 200, data: { ...result, page, pageSize } };
  }

  async getBusinessCustomer(authUserId: string, customerId: string): Promise<ServiceResult<BusinessCustomerDto>> {
    if (!isNumericId(customerId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid customer id.');
    }
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const customer = await this.business.getBusinessCustomer(access.businessId, customerId.trim());
    if (!customer) return fail(404, 'NOT_FOUND', 'Customer not found.');
    return { status: 200, data: customer };
  }

  async createBusinessCustomer(authUserId: string, body: unknown): Promise<ServiceResult<BusinessCustomerDto>> {
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const { input, error } = validateBusinessCustomerCreate(body);
    if (!input || error) {
      return fail(error?.status ?? 422, error?.code ?? 'VALIDATION_ERROR', error?.message ?? 'Invalid customer.');
    }
    const created = await this.business.createBusinessCustomer(access.businessId, input);
    return { status: 201, data: created };
  }

  async updateBusinessCustomer(
    authUserId: string,
    customerId: string,
    body: unknown,
  ): Promise<ServiceResult<BusinessCustomerDto>> {
    if (!isNumericId(customerId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid customer id.');
    }
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const { input, error } = validateBusinessCustomerPatch(body);
    if (!input || error) {
      return fail(error?.status ?? 422, error?.code ?? 'VALIDATION_ERROR', error?.message ?? 'Invalid customer update.');
    }
    const updated = await this.business.updateBusinessCustomer(access.businessId, customerId.trim(), input);
    if (!updated) return fail(404, 'NOT_FOUND', 'Customer not found.');
    return { status: 200, data: updated };
  }

  // ------------------------------------------------------------------
  // Stage 7B — internal business jobs.
  //
  // Internal jobs reuse the ONE shared `jobs` table with
  // `source = INTERNAL` and an initial `status = REQUESTED`. The
  // business, customer ownership and service are all derived or
  // verified server-side; `source`, `status`, `business_id` and
  // `reference` are never read from the request. Status transitions
  // stay server-controlled: PATCH rejects any `status` key, and only
  // REQUESTED jobs may be edited or cancelled in this stage.
  // Technician assignment, execution, parts and approvals belong to
  // later stages and are intentionally absent.
  // ------------------------------------------------------------------

  async createInternalJob(authUserId: string, body: unknown): Promise<ServiceResult<InternalJobDto>> {
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const { input, error } = validateInternalJobCreate(body);
    if (!input || error) {
      return fail(error?.status ?? 422, error?.code ?? 'VALIDATION_ERROR', error?.message ?? 'Invalid job.');
    }
    const customer = await this.business.findInternalCustomer(access.businessId, input.customerId);
    if (!customer) return fail(404, 'NOT_FOUND', 'Customer not found.');
    const service = await this.jobs?.findActiveService(input.serviceId);
    if (!service) return fail(404, 'NOT_FOUND', 'Service not found.');
    const business = await this.business.getBusinessById(access.businessId);
    if (!business) return fail(404, 'NOT_FOUND', 'No business found for your account.');
    const year = new Date().getFullYear();
    const reference = `FL-${year}-${Date.now().toString().slice(-6)}`;
    const job = await this.business.createInternalJob({
      ...input,
      reference,
      businessId: access.businessId,
      businessName: business.businessName,
      serviceName: service.name,
      serviceSlug: service.slug,
      createdBy: authUserId,
    });
    return { status: 201, data: job };
  }

  async listInternalJobs(
    authUserId: string,
    query: Record<string, unknown>,
  ): Promise<ServiceResult<{ items: BusinessBoardJobDto[]; total: number; page: number; pageSize: number }>> {
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const parsed = validateInternalJobListQuery(query);
    if (parsed.error) {
      return fail(parsed.error.status, parsed.error.code, parsed.error.message);
    }
    // A technician filter for a roster row outside the caller's
    // business yields an empty page (200) rather than 404: filters
    // never leak whether a foreign technician id exists.
    if (parsed.technicianId !== null) {
      const technician = await this.business.getTechnicianById(parsed.technicianId);
      if (!technician || technician.businessId !== access.businessId) {
        return { status: 200, data: { items: [], total: 0, page: parsed.page, pageSize: parsed.pageSize } };
      }
    }
    const result = await this.business.listInternalJobs(access.businessId, {
      status: parsed.status,
      board: parsed.board,
      technicianId: parsed.technicianId,
      priority: parsed.priority,
      from: parsed.from,
      to: parsed.to,
      assigned: parsed.assigned,
      sort: parsed.sort,
      search: parsed.search,
      page: parsed.page,
      pageSize: parsed.pageSize,
    });
    return { status: 200, data: { ...result, page: parsed.page, pageSize: parsed.pageSize } };
  }

  async getInternalJob(authUserId: string, jobId: string): Promise<ServiceResult<InternalJobDetailDto>> {
    if (!isNumericId(jobId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    }
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const detail = await this.business.getInternalJobDetail(access.businessId, jobId.trim());
    // Ownership + source are part of existence: another business's
    // job (or any marketplace job) reads as 404, never 403.
    if (!detail) return fail(404, 'NOT_FOUND', 'Job not found.');
    return { status: 200, data: detail };
  }

  async updateInternalJob(
    authUserId: string,
    jobId: string,
    body: unknown,
  ): Promise<ServiceResult<InternalJobDto>> {
    if (!isNumericId(jobId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    }
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const { input, error } = validateInternalJobPatch(body);
    if (!input || error) {
      return fail(error?.status ?? 422, error?.code ?? 'VALIDATION_ERROR', error?.message ?? 'Invalid job update.');
    }
    const existing = await this.business.getInternalJob(access.businessId, jobId.trim());
    if (!existing) return fail(404, 'NOT_FOUND', 'Job not found.');
    if (existing.status !== 'REQUESTED') {
      return fail(422, 'VALIDATION_ERROR', 'Only requested jobs can be updated.');
    }
    const updated = await this.business.updateInternalJob(access.businessId, jobId.trim(), input);
    if (!updated) return fail(404, 'NOT_FOUND', 'Job not found.');
    return { status: 200, data: updated };
  }

  async cancelInternalJob(authUserId: string, jobId: string, body: unknown): Promise<ServiceResult<InternalJobDto>> {
    if (!isNumericId(jobId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    }
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const { reason, error } = validateInternalJobCancel(body);
    if (error) {
      return fail(error.status, error.code, error.message);
    }
    const existing = await this.business.getInternalJob(access.businessId, jobId.trim());
    if (!existing) return fail(404, 'NOT_FOUND', 'Job not found.');
    if (existing.status !== 'REQUESTED') {
      return fail(422, 'VALIDATION_ERROR', 'Only requested jobs can be cancelled.');
    }
    try {
      const cancelled = await this.business.cancelInternalJob(access.businessId, jobId.trim(), {
        reason,
        changedBy: authUserId,
      });
      if (!cancelled) return fail(404, 'NOT_FOUND', 'Job not found.');
      return { status: 200, data: cancelled };
    } catch (err) {
      if (err instanceof JobNotCancellableError) {
        return fail(422, 'VALIDATION_ERROR', err.message);
      }
      throw err;
    }
  }

  async getInternalJobsSummary(authUserId: string): Promise<ServiceResult<InternalJobsSummary>> {
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const summary = await this.business.countInternalJobsByStatus(access.businessId);
    return { status: 200, data: summary };
  }

  /**
   * Stage 7G — operational board counts (requested/assigned/scheduled/
   * in-progress/awaiting-parts/completed/cancelled/history) for the
   * business dashboard and the job board tabs. Business-scoped like
   * every other management read; the legacy summary above is unchanged.
   */
  async getBoardJobsSummary(authUserId: string): Promise<ServiceResult<BusinessBoardSummary>> {
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const summary = await this.business.countBoardJobs(access.businessId);
    return { status: 200, data: summary };
  }

  // ------------------------------------------------------------------
  // Stage 7C — technician assignment.
  //
  // Only BUSINESS_OWNER / BUSINESS_MANAGER (via resolveManagement) may
  // assign. The job must be INTERNAL and owned by the caller's
  // business; the technician must be an active roster row in the same
  // business. Foreign job or technician ids read as 404 NOT_FOUND so
  // ids cannot be probed across businesses. Assignment never changes
  // job status — it is recorded in `job_assignments` with history.
  // ------------------------------------------------------------------

  async assignTechnician(
    authUserId: string,
    jobId: string,
    body: unknown,
  ): Promise<ServiceResult<JobAssignmentDto>> {
    if (!isNumericId(jobId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    }
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const { input, error } = validateAssignmentCreate(body);
    if (!input || error) {
      return fail(error?.status ?? 422, error?.code ?? 'VALIDATION_ERROR', error?.message ?? 'Invalid assignment.');
    }
    const job = await this.business.getInternalJob(access.businessId, jobId.trim());
    if (!job) return fail(404, 'NOT_FOUND', 'Job not found.');
    const technician = await this.business.getTechnicianById(input.technicianId);
    if (!technician || technician.businessId !== access.businessId) {
      return fail(404, 'NOT_FOUND', 'Technician not found.');
    }
    if (!technician.isActive) {
      return fail(422, 'VALIDATION_ERROR', 'Only active technicians can be assigned to jobs.');
    }
    const previous = await this.business.getActiveJobAssignment(access.businessId, jobId.trim());
    const assigned = await this.business.assignJobTechnician(access.businessId, jobId.trim(), {
      technicianId: technician.id,
      assignedBy: authUserId,
    });
    if (!assigned) return fail(404, 'NOT_FOUND', 'Job not found.');
    // Stage 8 — assignment notification to the newly assigned
    // technician only (never unrelated technicians, never the
    // previous assignee). A previous active assignment to a
    // different technician makes this a reassignment.
    const reassigned = previous !== null && previous.technician.id !== technician.id;
    await this.emitToTechnician(technician.userId, {
      type: reassigned ? 'TECHNICIAN_REASSIGNED' : 'TECHNICIAN_ASSIGNED',
      title: reassigned ? 'Job reassigned to you' : 'Job assigned to you',
      message: `You were assigned to job ${job.reference} (${job.service.name}).`,
      jobId: job.id,
    });
    return { status: 200, data: assigned };
  }

  async getJobAssignment(authUserId: string, jobId: string): Promise<ServiceResult<JobAssignmentDetailDto>> {
    if (!isNumericId(jobId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    }
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const detail = await this.business.getJobAssignmentDetail(access.businessId, jobId.trim());
    if (!detail) return fail(404, 'NOT_FOUND', 'Job not found.');
    return { status: 200, data: detail };
  }

  // ------------------------------------------------------------------
  // Stage 7C — technician My Jobs.
  //
  // The technician identity is derived server-side from the
  // authenticated user (membership + technician row). A technician_id
  // from the request is never trusted. Only jobs with an active
  // TECHNICIAN assignment to this technician are visible.
  // ------------------------------------------------------------------

  private async resolveTechnician(
    authUserId: string,
  ): Promise<{ technicianId: string; businessId: string } | { technicianId: null; status: number; code: string; message: string }> {
    const roles = await this.users.getRoles(authUserId);
    if (!roles.includes('TECHNICIAN')) {
      if (roles.some((role) => MANAGER_ROLES.includes(role))) {
        return {
          technicianId: null,
          status: 403,
          code: 'FORBIDDEN_ROLE',
          message: 'Business managers use the business job surface, not technician jobs.',
        };
      }
      if (roles.includes('CUSTOMER') || roles.includes('PROFESSIONAL')) {
        return {
          technicianId: null,
          status: 403,
          code: 'FORBIDDEN_ROLE',
          message: 'Only technicians can access technician jobs.',
        };
      }
      return {
        technicianId: null,
        status: 403,
        code: 'FORBIDDEN_ROLE',
        message: 'Your account cannot access technician jobs.',
      };
    }
    const identities = await this.business.findBusinessesForUser(authUserId);
    const membership = identities.find((entry) => entry.role === 'TECHNICIAN');
    if (!membership) {
      return { technicianId: null, status: 404, code: 'NOT_FOUND', message: 'Technician record not found.' };
    }
    const row = await this.business.findTechnicianByUserId(membership.businessId, authUserId);
    if (!row || !row.isActive) {
      return { technicianId: null, status: 404, code: 'NOT_FOUND', message: 'Technician record not found.' };
    }
    return { technicianId: row.id, businessId: membership.businessId };
  }

  async listTechnicianJobs(
    authUserId: string,
    query: Record<string, unknown>,
  ): Promise<ServiceResult<{ items: InternalJobDto[]; total: number; page: number; pageSize: number }>> {
    const identity = await this.resolveTechnician(authUserId);
    if (identity.technicianId === null) {
      return fail(identity.status, identity.code, identity.message);
    }
    const page = readPage(query['page'], 1, 1000);
    const pageSize = readPage(query['pageSize'] ?? query['page_size'], 20, 50);
    if (page === null || pageSize === null) {
      return fail(422, 'VALIDATION_ERROR', 'Invalid pagination. Use page 1–1000 and pageSize 1–50.');
    }
    const rawStatus = query['status'];
    let status: InternalJobDto['status'] | null = null;
    if (rawStatus !== undefined && rawStatus !== null && String(rawStatus).trim() !== '') {
      const upper = String(rawStatus).trim().toUpperCase() as InternalJobDto['status'];
      const allowed: readonly string[] = [
        'REQUESTED', 'QUOTED', 'ACCEPTED', 'SCHEDULED', 'IN_PROGRESS',
        'AWAITING_PARTS', 'COMPLETED', 'CONFIRMED', 'CLOSED', 'CANCELLED', 'DISPUTED',
      ];
      if (!allowed.includes(upper)) {
        return fail(422, 'VALIDATION_ERROR', 'Invalid status filter.');
      }
      status = upper;
    }
    const result = await this.business.listTechnicianJobs(identity.technicianId, { status, page, pageSize });
    return { status: 200, data: { ...result, page, pageSize } };
  }

  async getTechnicianJob(authUserId: string, jobId: string): Promise<ServiceResult<InternalJobDetailDto>> {
    if (!isNumericId(jobId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    }
    const identity = await this.resolveTechnician(authUserId);
    if (identity.technicianId === null) {
      return fail(identity.status, identity.code, identity.message);
    }
    const detail = await this.business.getTechnicianJobDetail(identity.technicianId, jobId.trim());
    if (!detail) return fail(404, 'NOT_FOUND', 'Job not found.');
    return { status: 200, data: detail };
  }

  // ------------------------------------------------------------------
  // Stage 7D — technician execution + voice notes.
  //
  // The technician identity is derived server-side from the
  // authenticated user (membership + technician row); a technician_id
  // from the request is never trusted. Only jobs with an active
  // TECHNICIAN assignment to this technician are reachable — every
  // other job reads as 404 NOT_FOUND, never 403, so job ids cannot be
  // probed across technicians or businesses. Photos, notes and voice
  // notes reuse the shared job_images / job_updates / job_voice_notes
  // architecture with the same validation pipeline as marketplace
  // execution (content sniffing, size limits, sanitized names, opaque
  // server-side storage keys, authorized byte delivery).
  // ------------------------------------------------------------------

  async startTechnicianJob(authUserId: string, jobId: string): Promise<ServiceResult<InternalJobDto>> {
    if (!isNumericId(jobId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    }
    const identity = await this.resolveTechnician(authUserId);
    if (identity.technicianId === null) {
      return fail(identity.status, identity.code, identity.message);
    }
    try {
      const job = await this.business.startTechnicianJob(identity.technicianId, jobId.trim(), {
        startedBy: authUserId,
      });
      if (!job) return fail(404, 'NOT_FOUND', 'Job not found.');
      await this.emitToManagers(job.businessId, authUserId, {
        type: 'JOB_STARTED',
        title: 'Technician started job',
        message: `Work started on job ${job.reference} (${job.service.name}).`,
        jobId: job.id,
      });
      return { status: 200, data: job };
    } catch (err) {
      if (err instanceof JobNotStartableError) {
        return fail(422, 'VALIDATION_ERROR', err.message);
      }
      throw err;
    }
  }

  private validateImageFile(
    file: UploadedFile | null | undefined,
  ): { extension: 'jpg' | 'png' | 'webp'; mime: string } | { error: string } {
    if (!file || file.buffer.length === 0) return { error: 'An image file is required.' };
    if (file.size > JOB_IMAGE_MAX_BYTES || file.buffer.length > JOB_IMAGE_MAX_BYTES) {
      return { error: 'Image must be 5MB or smaller.' };
    }
    const claimed = file.mimetype.toLowerCase().trim();
    if (!(JOB_IMAGE_ALLOWED_MIME as readonly string[]).includes(claimed)) {
      return { error: 'Only JPEG, PNG or WebP images are allowed.' };
    }
    // Never trust the client-provided extension/MIME alone: the stored
    // type comes from the actual file content (magic bytes).
    const detected = detectImageType(file.buffer);
    if (!detected) return { error: 'Only JPEG, PNG or WebP images are allowed.' };
    if (detected !== claimed) return { error: 'Only JPEG, PNG or WebP images are allowed.' };
    return { extension: extensionForMime(detected), mime: detected };
  }

  private validateVoiceFile(
    file: UploadedFile | null | undefined,
  ): { extension: 'webm' | 'mp4' | 'mp3' | 'wav' | 'ogg'; mime: string } | { error: string } {
    if (!file || file.buffer.length === 0) return { error: 'An audio file is required.' };
    if (file.size > VOICE_NOTE_MAX_BYTES || file.buffer.length > VOICE_NOTE_MAX_BYTES) {
      return { error: 'Voice note must be 10MB or smaller.' };
    }
    const claimed = file.mimetype.toLowerCase().trim().split(';')[0]?.trim() ?? '';
    if (!(VOICE_NOTE_ALLOWED_MIME as readonly string[]).includes(claimed)) {
      return { error: 'Only WebM, MP4, MP3, WAV or Ogg audio is allowed.' };
    }
    // Never trust the client-provided MIME alone: the stored type comes
    // from the actual file content (container signatures).
    const detected = detectAudioType(file.buffer);
    if (!detected) return { error: 'Only WebM, MP4, MP3, WAV or Ogg audio is allowed.' };
    if (detected !== claimed) return { error: 'Only WebM, MP4, MP3, WAV or Ogg audio is allowed.' };
    return { extension: extensionForAudioMime(detected), mime: detected };
  }

  private parseVoiceDuration(value: unknown): { duration: number | null; error: string | null } {
    if (value === undefined || value === null || String(value).trim() === '') {
      return { duration: null, error: null };
    }
    const num = Number(String(value).trim());
    if (!Number.isFinite(num) || num < 0 || num > 36000) {
      return { duration: null, error: 'Duration must be between 0 and 36000 seconds.' };
    }
    return { duration: Math.round(num), error: null };
  }

  /** Active-assignment detail for the technician, or the 404/403 signal. */
  private async technicianJob(
    authUserId: string,
    jobId: string,
  ): Promise<{ technicianId: string; job: InternalJobDto } | { technicianId: null; status: number; code: string; message: string }> {
    if (!isNumericId(jobId)) {
      return { technicianId: null, status: 400, code: 'VALIDATION_ERROR', message: 'Invalid job id.' };
    }
    const identity = await this.resolveTechnician(authUserId);
    if (identity.technicianId === null) return identity;
    const job = await this.business.getTechnicianJob(identity.technicianId, jobId.trim());
    if (!job) {
      return { technicianId: null, status: 404, code: 'NOT_FOUND', message: 'Job not found.' };
    }
    return { technicianId: identity.technicianId, job };
  }

  async uploadTechnicianImage(
    authUserId: string,
    jobId: string,
    phaseRaw: unknown,
    file: UploadedFile | null | undefined,
  ): Promise<ServiceResult<TechnicianJobImageDto>> {
    const scoped = await this.technicianJob(authUserId, jobId);
    if (scoped.technicianId === null) {
      return fail(scoped.status, scoped.code, scoped.message);
    }
    if (scoped.job.status !== 'IN_PROGRESS') {
      return fail(422, 'VALIDATION_ERROR', 'This job is not accepting work documentation in its current state.');
    }
    const phase = parseWorkPhase(phaseRaw);
    if (!phase) return fail(422, 'VALIDATION_ERROR', 'Phase must be BEFORE, DURING or AFTER.');
    const checked = this.validateImageFile(file);
    if ('error' in checked) return fail(422, 'VALIDATION_ERROR', checked.error);
    const uploaded = file as UploadedFile;
    let stored: { storageKey: string; size: number };
    try {
      stored = await this.storage.save(scoped.job.id, uploaded.buffer, checked.extension);
    } catch {
      return fail(500, 'INTERNAL_ERROR', 'Could not store the image. Please try again.');
    }
    try {
      const image = await this.business.createTechnicianJobImage({
        technicianId: scoped.technicianId,
        jobId: scoped.job.id,
        uploadedBy: authUserId,
        phase: phase as TechnicianWorkPhase,
        storageKey: stored.storageKey,
        originalFilename: sanitizeOriginalFilename(uploaded.originalname),
        mimeType: checked.mime,
        size: stored.size,
      });
      await this.emitToManagers(scoped.job.businessId, authUserId, {
        type: 'WORK_DOCUMENTED',
        title: 'New work photos',
        message: `New work photos were added to job ${scoped.job.reference}.`,
        jobId: scoped.job.id,
      });
      return { status: 201, data: image };
    } catch (err) {
      await this.storage.remove(stored.storageKey);
      if (err instanceof TechnicianJobNotExecutableError) {
        return fail(
          err.message === 'Job not found.' ? 404 : 422,
          err.message === 'Job not found.' ? 'NOT_FOUND' : 'VALIDATION_ERROR',
          err.message,
        );
      }
      throw err;
    }
  }

  async listTechnicianImages(
    authUserId: string,
    jobId: string,
  ): Promise<ServiceResult<{ items: TechnicianJobImageDto[]; total: number }>> {
    const scoped = await this.technicianJob(authUserId, jobId);
    if (scoped.technicianId === null) {
      return fail(scoped.status, scoped.code, scoped.message);
    }
    const items = (await this.business.listTechnicianJobImages(scoped.technicianId, scoped.job.id)) ?? [];
    return { status: 200, data: { items, total: items.length } };
  }

  async getTechnicianImageFile(
    authUserId: string,
    jobId: string,
    imageId: string,
  ): Promise<ServiceResult<{ buffer: Buffer; mimeType: string; filename: string }>> {
    if (!isNumericId(imageId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid image id.');
    }
    const scoped = await this.technicianJob(authUserId, jobId);
    if (scoped.technicianId === null) {
      return fail(scoped.status, scoped.code, scoped.message);
    }
    const found = await this.business.getTechnicianJobImageFile(scoped.technicianId, scoped.job.id, imageId.trim());
    if (!found) return fail(404, 'NOT_FOUND', 'Image not found.');
    const buffer = await this.storage.read(found.storageKey);
    if (!buffer) return fail(404, 'NOT_FOUND', 'Image not found.');
    return {
      status: 200,
      data: {
        buffer,
        mimeType: found.image.mimeType,
        filename: found.image.originalFilename ?? `job-${scoped.job.id}-image`,
      },
    };
  }

  async deleteTechnicianImage(
    authUserId: string,
    jobId: string,
    imageId: string,
  ): Promise<ServiceResult<{ deleted: boolean }>> {
    if (!isNumericId(imageId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid image id.');
    }
    const scoped = await this.technicianJob(authUserId, jobId);
    if (scoped.technicianId === null) {
      return fail(scoped.status, scoped.code, scoped.message);
    }
    try {
      const { storageKey } = await this.business.deleteTechnicianJobImage({
        technicianId: scoped.technicianId,
        jobId: scoped.job.id,
        imageId: imageId.trim(),
        deleterId: authUserId,
      });
      await this.storage.remove(storageKey);
      return { status: 200, data: { deleted: true } };
    } catch (err) {
      if (err instanceof TechnicianImageNotDeletableError) {
        if (err.message === 'Image not found.') return fail(404, 'NOT_FOUND', err.message);
        if (err.message === 'You can only delete images you uploaded.') {
          return fail(403, 'FORBIDDEN_ROLE', err.message);
        }
        return fail(422, 'VALIDATION_ERROR', err.message);
      }
      throw err;
    }
  }

  async createTechnicianUpdate(
    authUserId: string,
    jobId: string,
    body: unknown,
  ): Promise<ServiceResult<TechnicianJobUpdateDto>> {
    const scoped = await this.technicianJob(authUserId, jobId);
    if (scoped.technicianId === null) {
      return fail(scoped.status, scoped.code, scoped.message);
    }
    if (scoped.job.status !== 'IN_PROGRESS') {
      return fail(422, 'VALIDATION_ERROR', 'This job is not accepting work documentation in its current state.');
    }
    const { phase, note, error } = validateWorkUpdate(body);
    if (!phase || !note || error) {
      const failure = error ?? { status: 422, code: 'VALIDATION_ERROR', message: 'Invalid update.' };
      return fail(failure.status, failure.code, failure.message);
    }
    try {
      const update = await this.business.createTechnicianJobUpdate({
        technicianId: scoped.technicianId,
        jobId: scoped.job.id,
        authorId: authUserId,
        phase: phase as TechnicianWorkPhase,
        note,
      });
      await this.emitToManagers(scoped.job.businessId, authUserId, {
        type: 'JOB_UPDATE',
        title: 'New job update',
        message: `A progress update was added to job ${scoped.job.reference}.`,
        jobId: scoped.job.id,
      });
      return { status: 201, data: update };
    } catch (err) {
      if (err instanceof TechnicianJobNotExecutableError) {
        return fail(
          err.message === 'Job not found.' ? 404 : 422,
          err.message === 'Job not found.' ? 'NOT_FOUND' : 'VALIDATION_ERROR',
          err.message,
        );
      }
      throw err;
    }
  }

  async listTechnicianUpdates(
    authUserId: string,
    jobId: string,
  ): Promise<ServiceResult<{ items: TechnicianJobUpdateDto[]; total: number }>> {
    const scoped = await this.technicianJob(authUserId, jobId);
    if (scoped.technicianId === null) {
      return fail(scoped.status, scoped.code, scoped.message);
    }
    const items = (await this.business.listTechnicianJobUpdates(scoped.technicianId, scoped.job.id)) ?? [];
    return { status: 200, data: { items, total: items.length } };
  }

  async uploadTechnicianVoiceNote(
    authUserId: string,
    jobId: string,
    file: UploadedFile | null | undefined,
    durationRaw: unknown,
  ): Promise<ServiceResult<TechnicianVoiceNoteDto>> {
    const scoped = await this.technicianJob(authUserId, jobId);
    if (scoped.technicianId === null) {
      return fail(scoped.status, scoped.code, scoped.message);
    }
    if (scoped.job.status !== 'IN_PROGRESS') {
      return fail(422, 'VALIDATION_ERROR', 'This job is not accepting work documentation in its current state.');
    }
    const checked = this.validateVoiceFile(file);
    if ('error' in checked) return fail(422, 'VALIDATION_ERROR', checked.error);
    const { duration, error } = this.parseVoiceDuration(durationRaw);
    if (error) return fail(422, 'VALIDATION_ERROR', error);
    const uploaded = file as UploadedFile;
    let stored: { storageKey: string; size: number };
    try {
      stored = await this.storage.saveVoiceNote(scoped.job.id, uploaded.buffer, checked.extension);
    } catch {
      return fail(500, 'INTERNAL_ERROR', 'Could not store the voice note. Please try again.');
    }
    try {
      const voiceNote = await this.business.createTechnicianVoiceNote({
        technicianId: scoped.technicianId,
        jobId: scoped.job.id,
        authorId: authUserId,
        storageKey: stored.storageKey,
        originalFilename: sanitizeOriginalFilename(uploaded.originalname),
        mimeType: checked.mime,
        size: stored.size,
        durationSeconds: duration,
      });
      await this.emitToManagers(scoped.job.businessId, authUserId, {
        type: 'WORK_DOCUMENTED',
        title: 'New voice note',
        message: `A voice note was added to job ${scoped.job.reference}.`,
        jobId: scoped.job.id,
      });
      return { status: 201, data: voiceNote };
    } catch (err) {
      await this.storage.remove(stored.storageKey);
      if (err instanceof TechnicianJobNotExecutableError) {
        return fail(
          err.message === 'Job not found.' ? 404 : 422,
          err.message === 'Job not found.' ? 'NOT_FOUND' : 'VALIDATION_ERROR',
          err.message,
        );
      }
      throw err;
    }
  }

  async listTechnicianVoiceNotes(
    authUserId: string,
    jobId: string,
  ): Promise<ServiceResult<{ items: TechnicianVoiceNoteDto[]; total: number }>> {
    const scoped = await this.technicianJob(authUserId, jobId);
    if (scoped.technicianId === null) {
      return fail(scoped.status, scoped.code, scoped.message);
    }
    const items = (await this.business.listTechnicianVoiceNotes(scoped.technicianId, scoped.job.id)) ?? [];
    return { status: 200, data: { items, total: items.length } };
  }

  async getTechnicianVoiceNoteFile(
    authUserId: string,
    jobId: string,
    voiceNoteId: string,
  ): Promise<ServiceResult<{ buffer: Buffer; mimeType: string; filename: string }>> {
    if (!isNumericId(voiceNoteId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid voice note id.');
    }
    const scoped = await this.technicianJob(authUserId, jobId);
    if (scoped.technicianId === null) {
      return fail(scoped.status, scoped.code, scoped.message);
    }
    const found = await this.business.getTechnicianVoiceNoteFile(
      scoped.technicianId,
      scoped.job.id,
      voiceNoteId.trim(),
    );
    if (!found) return fail(404, 'NOT_FOUND', 'Voice note not found.');
    const buffer = await this.storage.read(found.storageKey);
    if (!buffer) return fail(404, 'NOT_FOUND', 'Voice note not found.');
    return {
      status: 200,
      data: {
        buffer,
        mimeType: found.voiceNote.mimeType,
        filename: found.voiceNote.originalFilename ?? `job-${scoped.job.id}-voice-note`,
      },
    };
  }

  async getTechnicianExecutionTimeline(
    authUserId: string,
    jobId: string,
  ): Promise<ServiceResult<TechnicianExecutionTimelineDto>> {
    const scoped = await this.technicianJob(authUserId, jobId);
    if (scoped.technicianId === null) {
      return fail(scoped.status, scoped.code, scoped.message);
    }
    const [history, assignments, updates, images, voiceNotes, parts] = await Promise.all([
      this.business.listTechnicianJobHistory(scoped.technicianId, scoped.job.id),
      this.business.listTechnicianJobAssignmentEvents(scoped.technicianId, scoped.job.id),
      this.business.listTechnicianJobUpdates(scoped.technicianId, scoped.job.id),
      this.business.listTechnicianJobImages(scoped.technicianId, scoped.job.id),
      this.business.listTechnicianVoiceNotes(scoped.technicianId, scoped.job.id),
      this.business.listTechnicianPartsRequests(scoped.technicianId, scoped.job.id),
    ]);
    const events = buildTechnicianExecutionEvents(
      history ?? [],
      assignments ?? [],
      updates ?? [],
      images ?? [],
      voiceNotes ?? [],
      parts ?? [],
    );
    return { status: 200, data: { job: scoped.job, events } };
  }

  /**
   * Technician completion: IN_PROGRESS → COMPLETED with a required
   * completion note stored as the AFTER record. Only the actively
   * assigned technician may complete.
   */
  async completeTechnicianJob(
    authUserId: string,
    jobId: string,
    body: unknown,
  ): Promise<ServiceResult<{ job: InternalJobDto; update: TechnicianJobUpdateDto }>> {
    const scoped = await this.technicianJob(authUserId, jobId);
    if (scoped.technicianId === null) {
      return fail(scoped.status, scoped.code, scoped.message);
    }
    const { note, error } = validateCompletionNote(body);
    if (!note || error) {
      const failure = error ?? {
        status: 422,
        code: 'VALIDATION_ERROR',
        message: 'A completion note is required to complete the job.',
      };
      return fail(failure.status, failure.code, failure.message);
    }
    try {
      const result = await this.business.completeTechnicianJob(scoped.technicianId, scoped.job.id, {
        note,
        completedBy: authUserId,
      });
      if (!result) return fail(404, 'NOT_FOUND', 'Job not found.');
      await this.emitToManagers(result.job.businessId, authUserId, {
        type: 'JOB_COMPLETED',
        title: 'Job completed',
        message: `Work completed on job ${result.job.reference}. Please review the job.`,
        jobId: result.job.id,
      });
      return { status: 200, data: result };
    } catch (err) {
      if (err instanceof TechnicianJobNotCompletableError) {
        return fail(422, 'VALIDATION_ERROR', err.message);
      }
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // Stage 7D — business visibility of execution documentation.
  // Owner/manager reads for their own INTERNAL jobs; another
  // business's job reads as 404 NOT_FOUND. Read-only by design.
  // ------------------------------------------------------------------

  async listBusinessJobImages(
    authUserId: string,
    jobId: string,
  ): Promise<ServiceResult<{ items: TechnicianJobImageDto[]; total: number }>> {
    if (!isNumericId(jobId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    }
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const items = (await this.business.listBusinessJobImages(access.businessId, jobId.trim())) ?? null;
    if (items === null) return fail(404, 'NOT_FOUND', 'Job not found.');
    return { status: 200, data: { items, total: items.length } };
  }

  async getBusinessJobImageFile(
    authUserId: string,
    jobId: string,
    imageId: string,
  ): Promise<ServiceResult<{ buffer: Buffer; mimeType: string; filename: string }>> {
    if (!isNumericId(jobId) || !isNumericId(imageId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid id.');
    }
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const found = await this.business.getBusinessJobImageFile(access.businessId, jobId.trim(), imageId.trim());
    if (!found) return fail(404, 'NOT_FOUND', 'Image not found.');
    const buffer = await this.storage.read(found.storageKey);
    if (!buffer) return fail(404, 'NOT_FOUND', 'Image not found.');
    return {
      status: 200,
      data: {
        buffer,
        mimeType: found.image.mimeType,
        filename: found.image.originalFilename ?? `job-${jobId.trim()}-image`,
      },
    };
  }

  async listBusinessJobUpdates(
    authUserId: string,
    jobId: string,
  ): Promise<ServiceResult<{ items: TechnicianJobUpdateDto[]; total: number }>> {
    if (!isNumericId(jobId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    }
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const items = (await this.business.listBusinessJobUpdates(access.businessId, jobId.trim())) ?? null;
    if (items === null) return fail(404, 'NOT_FOUND', 'Job not found.');
    return { status: 200, data: { items, total: items.length } };
  }

  async listBusinessVoiceNotes(
    authUserId: string,
    jobId: string,
  ): Promise<ServiceResult<{ items: TechnicianVoiceNoteDto[]; total: number }>> {
    if (!isNumericId(jobId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    }
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const items = (await this.business.listBusinessVoiceNotes(access.businessId, jobId.trim())) ?? null;
    if (items === null) return fail(404, 'NOT_FOUND', 'Job not found.');
    return { status: 200, data: { items, total: items.length } };
  }

  async getBusinessVoiceNoteFile(
    authUserId: string,
    jobId: string,
    voiceNoteId: string,
  ): Promise<ServiceResult<{ buffer: Buffer; mimeType: string; filename: string }>> {
    if (!isNumericId(jobId) || !isNumericId(voiceNoteId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid id.');
    }
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const found = await this.business.getBusinessVoiceNoteFile(
      access.businessId,
      jobId.trim(),
      voiceNoteId.trim(),
    );
    if (!found) return fail(404, 'NOT_FOUND', 'Voice note not found.');
    const buffer = await this.storage.read(found.storageKey);
    if (!buffer) return fail(404, 'NOT_FOUND', 'Voice note not found.');
    return {
      status: 200,
      data: {
        buffer,
        mimeType: found.voiceNote.mimeType,
        filename: found.voiceNote.originalFilename ?? `job-${jobId.trim()}-voice-note`,
      },
    };
  }

  async getBusinessExecutionTimeline(
    authUserId: string,
    jobId: string,
  ): Promise<ServiceResult<TechnicianExecutionTimelineDto>> {
    if (!isNumericId(jobId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    }
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const detail = await this.business.getInternalJobDetail(access.businessId, jobId.trim());
    if (!detail) return fail(404, 'NOT_FOUND', 'Job not found.');
    const [assignments, updates, images, voiceNotes, parts] = await Promise.all([
      this.business.listJobAssignmentHistory(access.businessId, jobId.trim()),
      this.business.listBusinessJobUpdates(access.businessId, jobId.trim()),
      this.business.listBusinessJobImages(access.businessId, jobId.trim()),
      this.business.listBusinessVoiceNotes(access.businessId, jobId.trim()),
      this.business.listBusinessPartsRequests(access.businessId, jobId.trim()),
    ]);
    const events = buildTechnicianExecutionEvents(
      detail.timeline,
      assignments ?? [],
      updates ?? [],
      images ?? [],
      voiceNotes ?? [],
      parts ?? [],
    );
    return { status: 200, data: { job: detail.job, events } };
  }

  // ------------------------------------------------------------------
  // Stage 7E — technician parts requests + business visibility.
  //
  // The technician identity is derived server-side from the
  // authenticated user (membership + technician row); a technician_id
  // from the request is never trusted. Only jobs with an active
  // TECHNICIAN assignment to this technician are reachable — every
  // other job reads as 404 NOT_FOUND, never 403. Requests are allowed
  // only while IN_PROGRESS or AWAITING_PARTS; creating a request
  // never changes job status (the IN_PROGRESS → AWAITING_PARTS move
  // waits for the Stage 7F manager-approval workflow). The optional
  // photo reuses the shared FileStorage pipeline (content sniffing,
  // size limits, opaque server-side keys, authorized byte delivery).
  // Owner/manager reads are scoped to owned INTERNAL jobs
  // (read-only in this stage — approve/reject arrives in Stage 7F).
  // ------------------------------------------------------------------

  /** States in which a technician may submit a parts request. */
  private static readonly PARTS_REQUESTABLE: readonly string[] = ['IN_PROGRESS', 'AWAITING_PARTS'];

  async createTechnicianPartsRequest(
    authUserId: string,
    jobId: string,
    body: unknown,
    file: UploadedFile | null | undefined,
  ): Promise<ServiceResult<PartsRequestDto>> {
    const scoped = await this.technicianJob(authUserId, jobId);
    if (scoped.technicianId === null) {
      return fail(scoped.status, scoped.code, scoped.message);
    }
    if (!BusinessService.PARTS_REQUESTABLE.includes(scoped.job.status)) {
      return fail(422, 'VALIDATION_ERROR', 'Parts can only be requested while the job is in progress.');
    }
    const { input, error } = validatePartsRequestCreate(body);
    if (!input || error) {
      return fail(error?.status ?? 422, error?.code ?? 'VALIDATION_ERROR', error?.message ?? 'Invalid parts request.');
    }
    let photo: { storageKey: string; size: number; mime: string; filename: string | null } | null = null;
    if (file && file.buffer.length > 0) {
      const checked = this.validateImageFile(file);
      if ('error' in checked) return fail(422, 'VALIDATION_ERROR', checked.error);
      try {
        const stored = await this.storage.save(scoped.job.id, file.buffer, checked.extension);
        photo = {
          storageKey: stored.storageKey,
          size: stored.size,
          mime: checked.mime,
          filename: sanitizeOriginalFilename(file.originalname),
        };
      } catch {
        return fail(500, 'INTERNAL_ERROR', 'Could not store the photo. Please try again.');
      }
    }
    try {
      const request = await this.business.createPartsRequest({
        ...input,
        technicianId: scoped.technicianId,
        jobId: scoped.job.id,
        requestedBy: authUserId,
        photoStorageKey: photo?.storageKey ?? null,
        photoOriginalFilename: photo?.filename ?? null,
        photoMime: photo?.mime ?? null,
        photoSize: photo?.size ?? null,
      });
      await this.emitToManagers(scoped.job.businessId, authUserId, {
        type: 'PARTS_REQUESTED',
        title: 'New parts request',
        message: `${this.partNameOf(request) ?? 'A part'} was requested for job ${scoped.job.reference}.`,
        jobId: scoped.job.id,
      });
      return { status: 201, data: request };
    } catch (err) {
      if (photo) await this.storage.remove(photo.storageKey);
      if (err instanceof TechnicianJobNotExecutableError) {
        return fail(
          err.message === 'Job not found.' ? 404 : 422,
          err.message === 'Job not found.' ? 'NOT_FOUND' : 'VALIDATION_ERROR',
          err.message,
        );
      }
      throw err;
    }
  }

  async listTechnicianPartsRequests(
    authUserId: string,
    jobId: string,
  ): Promise<ServiceResult<{ items: PartsRequestDto[]; total: number }>> {
    const scoped = await this.technicianJob(authUserId, jobId);
    if (scoped.technicianId === null) {
      return fail(scoped.status, scoped.code, scoped.message);
    }
    const items = (await this.business.listTechnicianPartsRequests(scoped.technicianId, scoped.job.id)) ?? [];
    return { status: 200, data: { items, total: items.length } };
  }

  async getTechnicianPartsRequest(
    authUserId: string,
    jobId: string,
    requestId: string,
  ): Promise<ServiceResult<PartsRequestDto>> {
    if (!isNumericId(requestId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid parts request id.');
    }
    const scoped = await this.technicianJob(authUserId, jobId);
    if (scoped.technicianId === null) {
      return fail(scoped.status, scoped.code, scoped.message);
    }
    const request = await this.business.getTechnicianPartsRequest(
      scoped.technicianId,
      scoped.job.id,
      requestId.trim(),
    );
    if (!request) return fail(404, 'NOT_FOUND', 'Parts request not found.');
    return { status: 200, data: request };
  }

  async getTechnicianPartsPhotoFile(
    authUserId: string,
    jobId: string,
    requestId: string,
  ): Promise<ServiceResult<{ buffer: Buffer; mimeType: string; filename: string }>> {
    if (!isNumericId(requestId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid parts request id.');
    }
    const scoped = await this.technicianJob(authUserId, jobId);
    if (scoped.technicianId === null) {
      return fail(scoped.status, scoped.code, scoped.message);
    }
    const found = await this.business.getTechnicianPartsRequestPhotoFile(
      scoped.technicianId,
      scoped.job.id,
      requestId.trim(),
    );
    if (!found) return fail(404, 'NOT_FOUND', 'Photo not found.');
    const buffer = await this.storage.read(found.storageKey);
    if (!buffer) return fail(404, 'NOT_FOUND', 'Photo not found.');
    return {
      status: 200,
      data: {
        buffer,
        mimeType: found.mimeType,
        filename: found.filename ?? `job-${scoped.job.id}-part-photo`,
      },
    };
  }

  async listBusinessPartsRequests(
    authUserId: string,
    jobId: string,
  ): Promise<ServiceResult<{ items: PartsRequestDto[]; total: number }>> {
    if (!isNumericId(jobId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    }
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const items = (await this.business.listBusinessPartsRequests(access.businessId, jobId.trim())) ?? null;
    if (items === null) return fail(404, 'NOT_FOUND', 'Job not found.');
    return { status: 200, data: { items, total: items.length } };
  }

  async getBusinessPartsRequest(
    authUserId: string,
    jobId: string,
    requestId: string,
  ): Promise<ServiceResult<PartsRequestDto>> {
    if (!isNumericId(jobId) || !isNumericId(requestId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid id.');
    }
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const request = await this.business.getBusinessPartsRequest(
      access.businessId,
      jobId.trim(),
      requestId.trim(),
    );
    if (!request) return fail(404, 'NOT_FOUND', 'Parts request not found.');
    return { status: 200, data: request };
  }

  async getBusinessPartsPhotoFile(
    authUserId: string,
    jobId: string,
    requestId: string,
  ): Promise<ServiceResult<{ buffer: Buffer; mimeType: string; filename: string }>> {
    if (!isNumericId(jobId) || !isNumericId(requestId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid id.');
    }
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const found = await this.business.getBusinessPartsRequestPhotoFile(
      access.businessId,
      jobId.trim(),
      requestId.trim(),
    );
    if (!found) return fail(404, 'NOT_FOUND', 'Photo not found.');
    const buffer = await this.storage.read(found.storageKey);
    if (!buffer) return fail(404, 'NOT_FOUND', 'Photo not found.');
    return {
      status: 200,
      data: {
        buffer,
        mimeType: found.mimeType,
        filename: found.filename ?? `job-${jobId.trim()}-part-photo`,
      },
    };
  }

  // ------------------------------------------------------------------
  // Stage 7F — manager approvals + awaiting parts.
  //
  // Only BUSINESS_OWNER / BUSINESS_MANAGER (via resolveManagement) may
  // review or fulfil. Technicians review through the technician
  // surface only (respond/resume); customers, marketplace
  // professionals and technicians hitting the business routes receive
  // 403 FORBIDDEN_ROLE, and cross-business jobs read as 404 NOT_FOUND.
  // Reviewers can never approve their own requests (the store rejects
  // reviewer == requester). Every decision emits one notification
  // event on the Stage 8 seam — the service never writes to the
  // `notifications` table directly.
  // ------------------------------------------------------------------

  private partNameOf(request: PartsRequestDto): string | null {
    return request.items[0]?.partName ?? null;
  }

  private async decidePartsRequest(
    authUserId: string,
    jobId: string,
    requestId: string,
    body: unknown,
    decision: 'APPROVE' | 'REJECT' | 'REQUEST_INFO',
  ): Promise<ServiceResult<{ request: PartsRequestDto; approval: PartsApprovalDto; job: InternalJobDto }>> {
    if (!isNumericId(jobId) || !isNumericId(requestId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid id.');
    }
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const { comment, error } = validateApprovalDecision(body, decision);
    if (error) {
      return fail(error.status, error.code, error.message);
    }
    try {
      const result = await this.business.reviewPartsRequest(access.businessId, jobId.trim(), requestId.trim(), {
        decision,
        comment,
        reviewerId: authUserId,
      });
      if (!result) return fail(404, 'NOT_FOUND', 'Parts request not found.');
      const eventType =
        decision === 'APPROVE'
          ? 'PARTS_REQUEST_APPROVED'
          : decision === 'REJECT'
            ? 'PARTS_REQUEST_REJECTED'
            : 'PARTS_REQUEST_NEEDS_INFO';
      this.events.emit(
        approvalEvent(eventType, {
          businessId: access.businessId,
          jobId: result.job.id,
          partsRequestId: result.request.id,
          actorUserId: authUserId,
          technicianUserId: result.technicianUserId,
          partName: this.partNameOf(result.request),
        }),
      );
      // Stage 8 — the decision persists as an in-app notification to
      // the requesting technician (the bus event above stays a
      // test-observable seam and is never persisted, so delivery is
      // exactly once).
      const partLabel = this.partNameOf(result.request) ?? 'The requested part';
      if (decision === 'APPROVE') {
        await this.emitToTechnician(result.technicianUserId, {
          type: 'PARTS_APPROVED',
          title: 'Parts request approved',
          message: `${partLabel} was approved for job ${result.job.reference}. The job is awaiting parts.`,
          jobId: result.job.id,
        });
      } else if (decision === 'REJECT') {
        await this.emitToTechnician(result.technicianUserId, {
          type: 'PARTS_REJECTED',
          title: 'Parts request rejected',
          message: `${partLabel} was not approved for job ${result.job.reference}. See the manager's reason.`,
          jobId: result.job.id,
        });
      } else {
        await this.emitToTechnician(result.technicianUserId, {
          type: 'PARTS_MORE_INFO',
          title: 'More information requested',
          message: `The manager needs more information about ${partLabel.toLowerCase()} for job ${result.job.reference}.`,
          jobId: result.job.id,
        });
      }
      return { status: 200, data: result };
    } catch (err) {
      if (err instanceof PartsRequestNotActionableError) {
        return fail(422, 'VALIDATION_ERROR', err.message);
      }
      throw err;
    }
  }

  /** Manager approves a PENDING (or NEEDS_INFO) request; the job moves IN_PROGRESS → AWAITING_PARTS. */
  async approvePartsRequest(
    authUserId: string,
    jobId: string,
    requestId: string,
    body: unknown,
  ): Promise<ServiceResult<{ request: PartsRequestDto; approval: PartsApprovalDto; job: InternalJobDto }>> {
    return this.decidePartsRequest(authUserId, jobId, requestId, body, 'APPROVE');
  }

  /** Manager rejects a PENDING (or NEEDS_INFO) request; the job stays IN_PROGRESS. */
  async rejectPartsRequest(
    authUserId: string,
    jobId: string,
    requestId: string,
    body: unknown,
  ): Promise<ServiceResult<{ request: PartsRequestDto; approval: PartsApprovalDto; job: InternalJobDto }>> {
    return this.decidePartsRequest(authUserId, jobId, requestId, body, 'REJECT');
  }

  /** Manager asks the technician for more information; the job stays IN_PROGRESS. */
  async requestPartsInfo(
    authUserId: string,
    jobId: string,
    requestId: string,
    body: unknown,
  ): Promise<ServiceResult<{ request: PartsRequestDto; approval: PartsApprovalDto; job: InternalJobDto }>> {
    return this.decidePartsRequest(authUserId, jobId, requestId, body, 'REQUEST_INFO');
  }

  /**
   * Manager marks an APPROVED request as fulfilled (APPROVED →
   * PARTS_AVAILABLE). The job resumes (AWAITING_PARTS → IN_PROGRESS)
   * only when no APPROVED request remains outstanding — otherwise it
   * stays waiting. Emits PARTS_AVAILABLE and, on resume, JOB_READY.
   */
  async markPartsAvailable(
    authUserId: string,
    jobId: string,
    requestId: string,
    body: unknown,
  ): Promise<ServiceResult<{ request: PartsRequestDto; job: InternalJobDto; jobResumed: boolean }>> {
    if (!isNumericId(jobId) || !isNumericId(requestId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid id.');
    }
    const access = await this.resolveManagement(authUserId);
    if (access.businessId === null) {
      return fail(access.status, access.code, access.message);
    }
    const { comment, error } = validateApprovalDecision(body, 'AVAILABLE');
    if (error) {
      return fail(error.status, error.code, error.message);
    }
    try {
      const result = await this.business.markPartsAvailable(access.businessId, jobId.trim(), requestId.trim(), {
        comment,
        markedBy: authUserId,
      });
      if (!result) return fail(404, 'NOT_FOUND', 'Parts request not found.');
      this.events.emit(
        partsAvailableEvent({
          businessId: access.businessId,
          jobId: result.job.id,
          partsRequestId: result.request.id,
          actorUserId: authUserId,
          technicianUserId: result.technicianUserId,
          partName: this.partNameOf(result.request),
          jobResumed: result.jobResumed,
        }),
      );
      if (result.jobResumed) {
        this.events.emit(
          jobReadyEvent({
            businessId: access.businessId,
            jobId: result.job.id,
            partsRequestId: result.request.id,
            actorUserId: authUserId,
            technicianUserId: result.technicianUserId,
          }),
        );
      }
      // Stage 8 — one notification per fulfilment (the resume is folded
      // into the same message when the job continues, so a single
      // request never produces two notifications).
      const availableLabel = this.partNameOf(result.request) ?? 'The requested part';
      await this.emitToTechnician(result.technicianUserId, {
        type: 'PARTS_AVAILABLE',
        title: 'Parts available',
        message: result.jobResumed
          ? `${availableLabel} is available for job ${result.job.reference}. The job is ready to continue.`
          : `${availableLabel} is available for job ${result.job.reference}. Other approved parts are still outstanding.`,
        jobId: result.job.id,
      });
      return { status: 200, data: result };
    } catch (err) {
      if (err instanceof PartsRequestNotActionableError) {
        return fail(422, 'VALIDATION_ERROR', err.message);
      }
      throw err;
    }
  }

  /**
   * Technician responds to a NEEDS_INFO request (NEEDS_INFO → PENDING)
   * with an optional note for the manager's next review. Only the
   * actively assigned technician may respond.
   */
  async respondToPartsRequest(
    authUserId: string,
    jobId: string,
    requestId: string,
    body: unknown,
  ): Promise<ServiceResult<PartsRequestDto>> {
    if (!isNumericId(requestId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid parts request id.');
    }
    const scoped = await this.technicianJob(authUserId, jobId);
    if (scoped.technicianId === null) {
      return fail(scoped.status, scoped.code, scoped.message);
    }
    const { note, error } = validatePartsResponse(body);
    if (error) {
      return fail(error.status, error.code, error.message);
    }
    try {
      const request = await this.business.respondToPartsRequest(
        scoped.technicianId,
        scoped.job.id,
        requestId.trim(),
        { note, responderId: authUserId },
      );
      if (!request) return fail(404, 'NOT_FOUND', 'Parts request not found.');
      this.events.emit(
        technicianRespondedEvent({
          businessId: request.businessId,
          jobId: request.jobId,
          partsRequestId: request.id,
          actorUserId: authUserId,
          technicianUserId: authUserId,
          partName: this.partNameOf(request),
        }),
      );
      // Stage 8 — the technician's response needs manager attention.
      await this.emitToManagers(request.businessId, authUserId, {
        type: 'PARTS_REQUESTED',
        title: 'Technician responded to a parts request',
        message: `Additional information was provided for ${(this.partNameOf(request) ?? 'a part').toLowerCase()} on job ${scoped.job.reference}.`,
        jobId: request.jobId,
      });
      return { status: 200, data: request };
    } catch (err) {
      if (err instanceof PartsRequestNotActionableError) {
        return fail(422, 'VALIDATION_ERROR', err.message);
      }
      throw err;
    }
  }

  /**
   * Technician continues work (AWAITING_PARTS → IN_PROGRESS) once every
   * approved request has its parts available. Blocked while any APPROVED
   * request remains outstanding.
   */
  async resumeTechnicianJob(authUserId: string, jobId: string): Promise<ServiceResult<InternalJobDto>> {
    const scoped = await this.technicianJob(authUserId, jobId);
    if (scoped.technicianId === null) {
      return fail(scoped.status, scoped.code, scoped.message);
    }
    try {
      const job = await this.business.resumeTechnicianJob(scoped.technicianId, scoped.job.id, {
        resumedBy: authUserId,
      });
      if (!job) return fail(404, 'NOT_FOUND', 'Job not found.');
      this.events.emit(
        jobReadyEvent({
          businessId: job.businessId,
          jobId: job.id,
          partsRequestId: '',
          actorUserId: authUserId,
          technicianUserId: authUserId,
        }),
      );
      return { status: 200, data: job };
    } catch (err) {
      if (err instanceof PartsRequestNotActionableError) {
        return fail(422, 'VALIDATION_ERROR', err.message);
      }
      throw err;
    }
  }
}

/** File bytes for photo / voice-note uploads (mirrors the execution module shape). */
export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}
