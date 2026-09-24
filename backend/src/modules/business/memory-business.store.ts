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
  JobNotCancellableError,
  JobNotStartableError,
  TechnicianImageNotDeletableError,
  TechnicianConflictError,
  TechnicianJobNotCompletableError,
  TechnicianJobNotExecutableError,
  type BusinessStore,
  type CreateTechnicianImageInput,
  type CreateTechnicianUpdateInput,
  type CreateTechnicianVoiceNoteInput,
  type DeleteTechnicianImageInput,
  type LinkTechnicianPersistInput,
  type PersistInternalJobInput,
} from './business.store';
import type {
  AssignTechnicianInput,
  BusinessCustomerContact,
  BusinessCustomerDto,
  BusinessDto,
  BusinessIdentity,
  CreateBusinessCustomerInput,
  InternalJobBusinessSummary,
  InternalJobCustomerSummary,
  InternalJobDetailDto,
  InternalJobDto,
  InternalJobsSummary,
  InternalJobStatus,
  InternalJobTimelineEntry,
  JobAssignmentDetailDto,
  JobAssignmentDto,
  JobAssignmentHistoryEntry,
  TechnicianDto,
  TechnicianJobImageDto,
  TechnicianJobUpdateDto,
  TechnicianVoiceNoteDto,
  TechnicianWorkPhase,
  UpdateBusinessCustomerInput,
  UpdateBusinessInput,
  UpdateInternalJobInput,
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

interface BusinessCustomerRow {
  id: string;
  businessId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  preferredContact: BusinessCustomerContact | null;
  createdAt: string;
  updatedAt: string;
}

interface InternalJobRow {
  id: string;
  reference: string;
  status: InternalJobStatus;
  businessId: string;
  businessName: string;
  customerId: string;
  serviceId: string;
  serviceName: string;
  serviceSlug: string;
  title: string | null;
  description: string;
  addressLine1: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  priority: InternalJobDto['priority'];
  /** ISO instant, or null when unscheduled. */
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface HistoryRow {
  jobId: string;
  previousStatus: InternalJobStatus | null;
  status: InternalJobStatus;
  reason: string | null;
  createdAt: string;
}

interface AssignmentRow {
  id: string;
  jobId: string;
  businessId: string;
  technicianId: string;
  assignedBy: string | null;
  assignedAt: string;
  unassignedAt: string | null;
}

/** Stage 7D — mirrors one `job_images` row (shared table, INTERNAL jobs). */
interface TechnicianImageRow {
  id: string;
  jobId: string;
  uploadedBy: string;
  phase: TechnicianWorkPhase;
  storageKey: string;
  originalFilename: string | null;
  mimeType: string;
  size: number;
  createdAt: string;
}

/** Stage 7D — mirrors one `job_updates` row (shared table, INTERNAL jobs). */
interface TechnicianUpdateRow {
  id: string;
  jobId: string;
  authorId: string;
  phase: TechnicianWorkPhase;
  note: string;
  createdAt: string;
}

/** Stage 7D — mirrors one `job_voice_notes` row (shared table). */
interface TechnicianVoiceRow {
  id: string;
  jobId: string;
  authorId: string;
  storageKey: string;
  originalFilename: string | null;
  mimeType: string;
  size: number;
  durationSeconds: number | null;
  createdAt: string;
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
  private customerSeq = 0;
  private internalJobSeq = 0;
  private readonly businesses = new Map<string, BusinessRow>();
  private readonly members: MemberRow[] = [];
  private readonly technicians = new Map<string, TechnicianRow>();
  private readonly businessCustomers = new Map<string, BusinessCustomerRow>();
  private readonly internalJobs = new Map<string, InternalJobRow>();
  private readonly internalHistory: HistoryRow[] = [];
  private assignmentSeq = 0;
  private readonly assignments: AssignmentRow[] = [];
  private techImageSeq = 0;
  private readonly techImages = new Map<string, TechnicianImageRow>();
  private techUpdateSeq = 0;
  private readonly techUpdates: TechnicianUpdateRow[] = [];
  private voiceSeq = 0;
  private readonly voiceNotes = new Map<string, TechnicianVoiceRow>();

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

  // ------------------------------------------------------------------
  // Stage 7B — business-managed customers (memory implementation).
  // ------------------------------------------------------------------

  async listBusinessCustomers(
    businessId: string,
    page: number,
    pageSize: number,
    search: string | null,
  ): Promise<{ items: BusinessCustomerDto[]; total: number }> {
    const needle = search === null ? null : search.toLowerCase();
    const owned = [...this.businessCustomers.values()]
      .filter((row) => row.businessId === businessId)
      .filter((row) => {
        if (!needle) return true;
        const haystack = `${row.firstName} ${row.lastName} ${row.email ?? ''} ${row.phone ?? ''}`.toLowerCase();
        return haystack.includes(needle);
      })
      .sort((a, b) => Number(a.id) - Number(b.id));
    const start = (page - 1) * pageSize;
    return { items: owned.slice(start, start + pageSize).map(toCustomerDto), total: owned.length };
  }

  async getBusinessCustomer(businessId: string, customerId: string): Promise<BusinessCustomerDto | null> {
    const row = this.businessCustomers.get(customerId);
    if (!row || row.businessId !== businessId) return null;
    return toCustomerDto(row);
  }

  async createBusinessCustomer(businessId: string, input: CreateBusinessCustomerInput): Promise<BusinessCustomerDto> {
    this.customerSeq += 1;
    const now = nowIso();
    const row: BusinessCustomerRow = {
      id: String(this.customerSeq),
      businessId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      preferredContact: input.preferredContact,
      createdAt: now,
      updatedAt: now,
    };
    this.businessCustomers.set(row.id, row);
    return toCustomerDto(row);
  }

  async updateBusinessCustomer(
    businessId: string,
    customerId: string,
    patch: UpdateBusinessCustomerInput,
  ): Promise<BusinessCustomerDto | null> {
    const row = this.businessCustomers.get(customerId);
    if (!row || row.businessId !== businessId) return null;
    const next: BusinessCustomerRow = { ...row, updatedAt: nowIso() };
    if (patch.firstName !== undefined) next.firstName = patch.firstName;
    if (patch.lastName !== undefined) next.lastName = patch.lastName;
    if (patch.email !== undefined) next.email = patch.email;
    if (patch.phone !== undefined) next.phone = patch.phone;
    if (patch.preferredContact !== undefined) next.preferredContact = patch.preferredContact;
    this.businessCustomers.set(customerId, next);
    return toCustomerDto(next);
  }

  // ------------------------------------------------------------------
  // Stage 7B — internal business jobs (memory implementation).
  // ------------------------------------------------------------------

  async findInternalCustomer(businessId: string, customerId: string): Promise<{ id: string } | null> {
    const row = this.businessCustomers.get(customerId);
    if (!row || row.businessId !== businessId) return null;
    return { id: row.id };
  }

  async createInternalJob(input: PersistInternalJobInput): Promise<InternalJobDto> {
    this.internalJobSeq += 1;
    const now = nowIso();
    const row: InternalJobRow = {
      id: String(this.internalJobSeq),
      reference: input.reference,
      status: 'REQUESTED',
      businessId: input.businessId,
      businessName: input.businessName,
      customerId: input.customerId,
      serviceId: input.serviceId,
      serviceName: input.serviceName,
      serviceSlug: input.serviceSlug,
      title: input.title,
      description: input.description,
      addressLine1: input.addressLine1,
      city: input.city,
      province: input.province,
      postalCode: input.postalCode,
      priority: input.priority,
      scheduledAt: toJobIso(input.scheduledAt),
      createdAt: now,
      updatedAt: now,
    };
    this.internalJobs.set(row.id, row);
    this.internalHistory.push({
      jobId: row.id,
      previousStatus: null,
      status: 'REQUESTED',
      reason: 'Internal job created by business',
      createdAt: now,
    });
    const dto = this.toJobDto(row);
    if (!dto) throw new Error('Internal job creation failed: customer row not found after insert.');
    return dto;
  }

  async listInternalJobs(
    businessId: string,
    query: { status: InternalJobStatus | null; search: string | null; page: number; pageSize: number },
  ): Promise<{ items: InternalJobDto[]; total: number }> {
    const needle = query.search === null ? null : query.search.toLowerCase();
    const owned: InternalJobDto[] = [];
    for (const row of this.internalJobs.values()) {
      if (row.businessId !== businessId) continue;
      if (query.status !== null && row.status !== query.status) continue;
      const dto = this.toJobDto(row);
      if (!dto) continue;
      if (needle) {
        const haystack =
          `${dto.reference} ${dto.description} ${dto.title ?? ''} ${dto.customer.displayName} ${dto.service.name}`.toLowerCase();
        if (!haystack.includes(needle)) continue;
      }
      owned.push(dto);
    }
    owned.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const start = (query.page - 1) * query.pageSize;
    return { items: owned.slice(start, start + query.pageSize), total: owned.length };
  }

  async getInternalJob(businessId: string, jobId: string): Promise<InternalJobDto | null> {
    const row = this.internalJobs.get(jobId);
    if (!row || row.businessId !== businessId) return null;
    return this.toJobDto(row);
  }

  async updateInternalJob(
    businessId: string,
    jobId: string,
    patch: UpdateInternalJobInput,
  ): Promise<InternalJobDto | null> {
    const row = this.internalJobs.get(jobId);
    if (!row || row.businessId !== businessId) return null;
    const next: InternalJobRow = { ...row, updatedAt: nowIso() };
    if (patch.title !== undefined) next.title = patch.title;
    if (patch.description !== undefined) next.description = patch.description;
    if (patch.addressLine1 !== undefined) next.addressLine1 = patch.addressLine1;
    if (patch.city !== undefined) next.city = patch.city;
    if (patch.province !== undefined) next.province = patch.province;
    if (patch.postalCode !== undefined) next.postalCode = patch.postalCode;
    if (patch.priority !== undefined) next.priority = patch.priority;
    if (patch.scheduledAt !== undefined) next.scheduledAt = toJobIso(patch.scheduledAt);
    this.internalJobs.set(jobId, next);
    return this.toJobDto(next);
  }

  async cancelInternalJob(
    businessId: string,
    jobId: string,
    input: { reason: string | null; changedBy: string },
  ): Promise<InternalJobDto | null> {
    void input.changedBy;
    const row = this.internalJobs.get(jobId);
    if (!row || row.businessId !== businessId) return null;
    if (row.status !== 'REQUESTED') throw new JobNotCancellableError();
    const now = nowIso();
    const next: InternalJobRow = { ...row, status: 'CANCELLED', updatedAt: now };
    this.internalJobs.set(jobId, next);
    this.internalHistory.push({
      jobId,
      previousStatus: 'REQUESTED',
      status: 'CANCELLED',
      reason: input.reason ?? 'Internal job cancelled by business',
      createdAt: now,
    });
    return this.toJobDto(next);
  }

  async listInternalJobHistory(businessId: string, jobId: string): Promise<InternalJobTimelineEntry[] | null> {
    const row = this.internalJobs.get(jobId);
    if (!row || row.businessId !== businessId) return null;
    return this.internalHistory
      .filter((entry) => entry.jobId === jobId)
      .map((entry) => ({
        previousStatus: entry.previousStatus,
        status: entry.status,
        reason: entry.reason,
        createdAt: entry.createdAt,
      }));
  }

  async countInternalJobsByStatus(businessId: string): Promise<InternalJobsSummary> {
    const summary: InternalJobsSummary = {
      total: 0,
      requested: 0,
      scheduled: 0,
      inProgress: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const row of this.internalJobs.values()) {
      if (row.businessId !== businessId) continue;
      summary.total += 1;
      if (row.status === 'REQUESTED') summary.requested += 1;
      else if (row.status === 'SCHEDULED') summary.scheduled += 1;
      else if (row.status === 'IN_PROGRESS') summary.inProgress += 1;
      else if (row.status === 'COMPLETED') summary.completed += 1;
      else if (row.status === 'CANCELLED') summary.cancelled += 1;
    }
    return summary;
  }

  async getInternalJobDetail(
    businessId: string,
    jobId: string,
  ): Promise<InternalJobDetailDto | null> {
    const job = await this.getInternalJob(businessId, jobId);
    if (!job) return null;
    const timeline = (await this.listInternalJobHistory(businessId, jobId)) ?? [];
    return { job, timeline };
  }

  // ------------------------------------------------------------------
  // Stage 7C — technician assignment (memory implementation).
  //
  // Mirrors `job_assignments` with `assignment_type = TECHNICIAN`:
  // the active row has `unassignedAt = null`; reassignment closes it
  // and appends a new row. Job status is never touched.
  // ------------------------------------------------------------------

  async getActiveJobAssignment(businessId: string, jobId: string): Promise<JobAssignmentDto | null> {
    const job = this.internalJobs.get(jobId);
    if (!job || job.businessId !== businessId) return null;
    const active = this.assignments.find((a) => a.jobId === jobId && a.unassignedAt === null);
    if (!active) return null;
    return this.toAssignmentDto(active);
  }

  async listJobAssignmentHistory(businessId: string, jobId: string): Promise<JobAssignmentHistoryEntry[] | null> {
    const job = this.internalJobs.get(jobId);
    if (!job || job.businessId !== businessId) return null;
    return this.assignments
      .filter((a) => a.jobId === jobId)
      .sort((a, b) => (a.assignedAt < b.assignedAt ? 1 : -1))
      .map((a) => this.toAssignmentHistoryEntry(a))
      .filter((entry): entry is JobAssignmentHistoryEntry => entry !== null);
  }

  async getJobAssignmentDetail(businessId: string, jobId: string): Promise<JobAssignmentDetailDto | null> {
    const job = this.internalJobs.get(jobId);
    if (!job || job.businessId !== businessId) return null;
    const assignment = await this.getActiveJobAssignment(businessId, jobId);
    const history = (await this.listJobAssignmentHistory(businessId, jobId)) ?? [];
    return { jobId, assignment, history };
  }

  async assignJobTechnician(
    businessId: string,
    jobId: string,
    input: AssignTechnicianInput & { assignedBy: string },
  ): Promise<JobAssignmentDto | null> {
    const job = this.internalJobs.get(jobId);
    if (!job || job.businessId !== businessId) return null;
    const now = nowIso();
    for (const row of this.assignments) {
      if (row.jobId === jobId && row.unassignedAt === null) {
        row.unassignedAt = now;
      }
    }
    this.assignmentSeq += 1;
    const row: AssignmentRow = {
      id: String(this.assignmentSeq),
      jobId,
      businessId,
      technicianId: input.technicianId,
      assignedBy: input.assignedBy,
      assignedAt: now,
      unassignedAt: null,
    };
    this.assignments.push(row);
    const dto = this.toAssignmentDto(row);
    if (!dto) throw new Error('Assignment failed: technician row not found after insert.');
    return dto;
  }

  async listTechnicianJobs(
    technicianId: string,
    query: { status: InternalJobStatus | null; page: number; pageSize: number },
  ): Promise<{ items: InternalJobDto[]; total: number }> {
    const owned: InternalJobDto[] = [];
    for (const assignment of this.assignments) {
      if (assignment.technicianId !== technicianId || assignment.unassignedAt !== null) continue;
      const row = this.internalJobs.get(assignment.jobId);
      if (!row) continue;
      if (query.status !== null && row.status !== query.status) continue;
      const dto = this.toJobDto(row);
      if (dto) owned.push(dto);
    }
    owned.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const start = (query.page - 1) * query.pageSize;
    return { items: owned.slice(start, start + query.pageSize), total: owned.length };
  }

  async getTechnicianJob(technicianId: string, jobId: string): Promise<InternalJobDto | null> {
    const active = this.assignments.find(
      (a) => a.jobId === jobId && a.technicianId === technicianId && a.unassignedAt === null,
    );
    if (!active) return null;
    const row = this.internalJobs.get(jobId);
    if (!row) return null;
    return this.toJobDto(row);
  }

  async listTechnicianJobHistory(technicianId: string, jobId: string): Promise<InternalJobTimelineEntry[] | null> {
    const job = await this.getTechnicianJob(technicianId, jobId);
    if (!job) return null;
    return this.internalHistory
      .filter((entry) => entry.jobId === jobId)
      .map((entry) => ({
        previousStatus: entry.previousStatus,
        status: entry.status,
        reason: entry.reason,
        createdAt: entry.createdAt,
      }));
  }

  async getTechnicianJobDetail(technicianId: string, jobId: string): Promise<InternalJobDetailDto | null> {
    const job = await this.getTechnicianJob(technicianId, jobId);
    if (!job) return null;
    const timeline = (await this.listTechnicianJobHistory(technicianId, jobId)) ?? [];
    return { job, timeline };
  }

  // ------------------------------------------------------------------
  // Stage 7D — technician execution (memory implementation).
  //
  // Mirrors the shared `job_images` / `job_updates` / `job_voice_notes`
  // / `job_status_history` tables for INTERNAL jobs with the same rules
  // as the MySQL implementation: active-assignment scoping, IN_PROGRESS
  // gating for work documentation, uploader-only deletion, required
  // completion note, REQUESTED/SCHEDULED → IN_PROGRESS start and
  // IN_PROGRESS → COMPLETED completion.
  // ------------------------------------------------------------------

  private activeAssignment(technicianId: string, jobId: string): AssignmentRow | null {
    return (
      this.assignments.find(
        (a) => a.jobId === jobId && a.technicianId === technicianId && a.unassignedAt === null,
      ) ?? null
    );
  }

  async startTechnicianJob(
    technicianId: string,
    jobId: string,
    input: { startedBy: string },
  ): Promise<InternalJobDto | null> {
    void input.startedBy;
    if (!this.activeAssignment(technicianId, jobId)) return null;
    const row = this.internalJobs.get(jobId);
    if (!row) return null;
    if (row.status !== 'REQUESTED' && row.status !== 'SCHEDULED') throw new JobNotStartableError();
    const now = nowIso();
    const previous = row.status;
    this.internalJobs.set(jobId, { ...row, status: 'IN_PROGRESS', updatedAt: now });
    this.internalHistory.push({
      jobId,
      previousStatus: previous,
      status: 'IN_PROGRESS',
      reason: 'Technician started job',
      createdAt: now,
    });
    const next = this.internalJobs.get(jobId);
    return next ? this.toJobDto(next) : null;
  }

  private requireAssignedInProgress(technicianId: string, jobId: string): InternalJobRow {
    if (!this.activeAssignment(technicianId, jobId)) {
      throw new TechnicianJobNotExecutableError('Job not found.');
    }
    const row = this.internalJobs.get(jobId);
    if (!row) throw new TechnicianJobNotExecutableError('Job not found.');
    if (row.status !== 'IN_PROGRESS') throw new TechnicianJobNotExecutableError();
    return row;
  }

  async createTechnicianJobImage(input: CreateTechnicianImageInput): Promise<TechnicianJobImageDto> {
    this.requireAssignedInProgress(input.technicianId, input.jobId);
    this.techImageSeq += 1;
    const row: TechnicianImageRow = {
      id: String(this.techImageSeq),
      jobId: input.jobId,
      uploadedBy: input.uploadedBy,
      phase: input.phase,
      storageKey: input.storageKey,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      size: input.size,
      createdAt: nowIso(),
    };
    this.techImages.set(row.id, row);
    return stripTechImageKey(row);
  }

  async listTechnicianJobImages(technicianId: string, jobId: string): Promise<TechnicianJobImageDto[] | null> {
    if (!this.activeAssignment(technicianId, jobId)) return null;
    if (!this.internalJobs.get(jobId)) return null;
    return [...this.techImages.values()]
      .filter((image) => image.jobId === jobId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map(stripTechImageKey);
  }

  async getTechnicianJobImageFile(
    technicianId: string,
    jobId: string,
    imageId: string,
  ): Promise<{ image: TechnicianJobImageDto; storageKey: string } | null> {
    if (!this.activeAssignment(technicianId, jobId)) return null;
    const row = this.techImages.get(imageId);
    if (!row || row.jobId !== jobId) return null;
    return { image: stripTechImageKey(row), storageKey: row.storageKey };
  }

  async deleteTechnicianJobImage(input: DeleteTechnicianImageInput): Promise<{ storageKey: string }> {
    const row = this.techImages.get(input.imageId);
    if (!this.activeAssignment(input.technicianId, input.jobId) || !row || row.jobId !== input.jobId) {
      throw new TechnicianImageNotDeletableError('Image not found.');
    }
    const job = this.internalJobs.get(input.jobId);
    if (!job) throw new TechnicianImageNotDeletableError('Image not found.');
    if (job.status !== 'IN_PROGRESS') {
      throw new TechnicianImageNotDeletableError('Images can only be deleted while the job is in progress.');
    }
    if (row.uploadedBy !== input.deleterId) {
      throw new TechnicianImageNotDeletableError('You can only delete images you uploaded.');
    }
    this.techImages.delete(input.imageId);
    return { storageKey: row.storageKey };
  }

  async createTechnicianJobUpdate(input: CreateTechnicianUpdateInput): Promise<TechnicianJobUpdateDto> {
    this.requireAssignedInProgress(input.technicianId, input.jobId);
    this.techUpdateSeq += 1;
    const row: TechnicianUpdateRow = {
      id: String(this.techUpdateSeq),
      jobId: input.jobId,
      authorId: input.authorId,
      phase: input.phase,
      note: input.note,
      createdAt: nowIso(),
    };
    this.techUpdates.push(row);
    return { ...row };
  }

  async listTechnicianJobUpdates(
    technicianId: string,
    jobId: string,
  ): Promise<TechnicianJobUpdateDto[] | null> {
    if (!this.activeAssignment(technicianId, jobId)) return null;
    if (!this.internalJobs.get(jobId)) return null;
    return this.techUpdates
      .filter((update) => update.jobId === jobId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map((update) => ({ ...update }));
  }

  async createTechnicianVoiceNote(input: CreateTechnicianVoiceNoteInput): Promise<TechnicianVoiceNoteDto> {
    this.requireAssignedInProgress(input.technicianId, input.jobId);
    this.voiceSeq += 1;
    const row: TechnicianVoiceRow = {
      id: String(this.voiceSeq),
      jobId: input.jobId,
      authorId: input.authorId,
      storageKey: input.storageKey,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      size: input.size,
      durationSeconds: input.durationSeconds,
      createdAt: nowIso(),
    };
    this.voiceNotes.set(row.id, row);
    return stripVoiceKey(row);
  }

  async listTechnicianVoiceNotes(
    technicianId: string,
    jobId: string,
  ): Promise<TechnicianVoiceNoteDto[] | null> {
    if (!this.activeAssignment(technicianId, jobId)) return null;
    if (!this.internalJobs.get(jobId)) return null;
    return [...this.voiceNotes.values()]
      .filter((voice) => voice.jobId === jobId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map(stripVoiceKey);
  }

  async getTechnicianVoiceNoteFile(
    technicianId: string,
    jobId: string,
    voiceNoteId: string,
  ): Promise<{ voiceNote: TechnicianVoiceNoteDto; storageKey: string } | null> {
    if (!this.activeAssignment(technicianId, jobId)) return null;
    const row = this.voiceNotes.get(voiceNoteId);
    if (!row || row.jobId !== jobId) return null;
    return { voiceNote: stripVoiceKey(row), storageKey: row.storageKey };
  }

  async listTechnicianJobAssignmentEvents(
    technicianId: string,
    jobId: string,
  ): Promise<JobAssignmentHistoryEntry[] | null> {
    if (!this.activeAssignment(technicianId, jobId)) return null;
    const job = this.internalJobs.get(jobId);
    if (!job) return null;
    return this.assignments
      .filter((a) => a.jobId === jobId)
      .sort((a, b) => (a.assignedAt < b.assignedAt ? 1 : -1))
      .map((a) => this.toAssignmentHistoryEntry(a))
      .filter((entry): entry is JobAssignmentHistoryEntry => entry !== null);
  }

  async completeTechnicianJob(
    technicianId: string,
    jobId: string,
    input: { note: string; completedBy: string },
  ): Promise<{ job: InternalJobDto; update: TechnicianJobUpdateDto } | null> {
    if (!this.activeAssignment(technicianId, jobId)) return null;
    const row = this.internalJobs.get(jobId);
    if (!row) return null;
    if (row.status !== 'IN_PROGRESS') throw new TechnicianJobNotCompletableError();
    if (input.note.trim() === '') {
      throw new TechnicianJobNotCompletableError('A completion note is required to complete the job.');
    }
    // All checks passed before any mutation: a failed completion cannot
    // leave the job COMPLETED without its completion record (or vice versa).
    const now = nowIso();
    this.techUpdateSeq += 1;
    const update: TechnicianUpdateRow = {
      id: String(this.techUpdateSeq),
      jobId,
      authorId: input.completedBy,
      phase: 'AFTER',
      note: input.note,
      createdAt: now,
    };
    this.techUpdates.push(update);
    this.internalJobs.set(jobId, { ...row, status: 'COMPLETED', updatedAt: now });
    this.internalHistory.push({
      jobId,
      previousStatus: 'IN_PROGRESS',
      status: 'COMPLETED',
      reason: 'Technician completed job',
      createdAt: now,
    });
    const job = this.internalJobs.get(jobId);
    const dto = job ? this.toJobDto(job) : null;
    if (!dto) throw new Error('Job completion failed: job not found after update.');
    return { job: dto, update: { ...update } };
  }

  // ------------------------------------------------------------------
  // Stage 7D — business visibility of execution documentation (memory).
  // ------------------------------------------------------------------

  private ownedInternalJob(businessId: string, jobId: string): InternalJobRow | null {
    const row = this.internalJobs.get(jobId);
    return row && row.businessId === businessId ? row : null;
  }

  async listBusinessJobImages(businessId: string, jobId: string): Promise<TechnicianJobImageDto[] | null> {
    if (!this.ownedInternalJob(businessId, jobId)) return null;
    return [...this.techImages.values()]
      .filter((image) => image.jobId === jobId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map(stripTechImageKey);
  }

  async getBusinessJobImageFile(
    businessId: string,
    jobId: string,
    imageId: string,
  ): Promise<{ image: TechnicianJobImageDto; storageKey: string } | null> {
    if (!this.ownedInternalJob(businessId, jobId)) return null;
    const row = this.techImages.get(imageId);
    if (!row || row.jobId !== jobId) return null;
    return { image: stripTechImageKey(row), storageKey: row.storageKey };
  }

  async listBusinessJobUpdates(businessId: string, jobId: string): Promise<TechnicianJobUpdateDto[] | null> {
    if (!this.ownedInternalJob(businessId, jobId)) return null;
    return this.techUpdates
      .filter((update) => update.jobId === jobId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map((update) => ({ ...update }));
  }

  async listBusinessVoiceNotes(businessId: string, jobId: string): Promise<TechnicianVoiceNoteDto[] | null> {
    if (!this.ownedInternalJob(businessId, jobId)) return null;
    return [...this.voiceNotes.values()]
      .filter((voice) => voice.jobId === jobId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map(stripVoiceKey);
  }

  async getBusinessVoiceNoteFile(
    businessId: string,
    jobId: string,
    voiceNoteId: string,
  ): Promise<{ voiceNote: TechnicianVoiceNoteDto; storageKey: string } | null> {
    if (!this.ownedInternalJob(businessId, jobId)) return null;
    const row = this.voiceNotes.get(voiceNoteId);
    if (!row || row.jobId !== jobId) return null;
    return { voiceNote: stripVoiceKey(row), storageKey: row.storageKey };
  }

  private toAssignmentDto(row: AssignmentRow): JobAssignmentDto | null {
    const tech = this.technicians.get(row.technicianId);
    if (!tech) return null;
    return {
      id: row.id,
      jobId: row.jobId,
      businessId: row.businessId,
      technician: {
        id: tech.id,
        displayName: tech.displayName,
        email: tech.email,
        phone: tech.phone,
        isActive: tech.isActive,
      },
      assignedBy: row.assignedBy,
      assignedAt: row.assignedAt,
    };
  }

  private toAssignmentHistoryEntry(row: AssignmentRow): JobAssignmentHistoryEntry | null {
    const tech = this.technicians.get(row.technicianId);
    if (!tech) return null;
    return {
      id: row.id,
      technician: {
        id: tech.id,
        displayName: tech.displayName,
        email: tech.email,
        phone: tech.phone,
        isActive: tech.isActive,
      },
      assignedBy: row.assignedBy,
      assignedAt: row.assignedAt,
      unassignedAt: row.unassignedAt,
      isActive: row.unassignedAt === null,
    };
  }

  /** Embed the owning customer/business/service summaries (all server-side rows). */
  private toJobDto(row: InternalJobRow): InternalJobDto | null {
    const customer = this.businessCustomers.get(row.customerId);
    if (!customer || customer.businessId !== row.businessId) return null;
    const customerSummary: InternalJobCustomerSummary = {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      displayName: `${customer.firstName} ${customer.lastName}`,
      email: customer.email,
      phone: customer.phone,
    };
    const business: InternalJobBusinessSummary = { id: row.businessId, businessName: row.businessName };
    return {
      id: row.id,
      reference: row.reference,
      source: 'INTERNAL',
      status: row.status,
      businessId: row.businessId,
      business,
      customerId: row.customerId,
      customer: customerSummary,
      service: { id: row.serviceId, name: row.serviceName, slug: row.serviceSlug },
      title: row.title,
      description: row.description,
      addressLine1: row.addressLine1,
      city: row.city,
      province: row.province,
      postalCode: row.postalCode,
      priority: row.priority,
      scheduledAt: row.scheduledAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

/** Stage 7D: strip the protected storage key from image DTOs (never in API responses). */
function stripTechImageKey(row: TechnicianImageRow): TechnicianJobImageDto {
  const { storageKey: _storageKey, ...dto } = row;
  return dto;
}

/** Stage 7D: strip the protected storage key from voice-note DTOs. */
function stripVoiceKey(row: TechnicianVoiceRow): TechnicianVoiceNoteDto {
  const { storageKey: _storageKey, ...dto } = row;
  return dto;
}

function toDto(row: TechnicianRow): TechnicianDto {  return {
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

function toCustomerDto(row: BusinessCustomerRow): BusinessCustomerDto {
  return {
    id: row.id,
    businessId: row.businessId,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: `${row.firstName} ${row.lastName}`,
    email: row.email,
    phone: row.phone,
    preferredContact: row.preferredContact,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Normalize the validated `YYYY-MM-DD HH:MM:SS` scheduled value to the
 * ISO instant the API reports (wall-clock echo, no timezone shift —
 * the slot the business picked is what every consumer reads).
 */
function toJobIso(scheduledAt: string | null): string | null {
  if (scheduledAt === null) return null;
  return scheduledAt.replace(' ', 'T');
}
