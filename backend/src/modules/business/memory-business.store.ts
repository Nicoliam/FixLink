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
  PartsRequestNotActionableError,
  TechnicianImageNotDeletableError,
  TechnicianConflictError,
  TechnicianJobNotCompletableError,
  TechnicianJobNotExecutableError,
  type BusinessStore,
  type CreatePartsRequestPersistInput,
  type CreateTechnicianImageInput,
  type CreateTechnicianUpdateInput,
  type CreateTechnicianVoiceNoteInput,
  type DeleteTechnicianImageInput,
  type LinkTechnicianPersistInput,
  type PersistInternalJobInput,
} from './business.store';
import type {
  AssignTechnicianInput,
  BusinessBoardJobDto,
  BusinessBoardSummary,
  BusinessCustomerContact,
  BusinessCustomerDto,
  BusinessDto,
  BusinessIdentity,
  CreateBusinessCustomerInput,
  InternalJobBoardQuery,
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
  PartsApprovalDto,
  PartsRequestDto,
  PartsRequestItemDto,
  PartsRequestStatus,
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

/** Stage 7E — mirrors one `parts_requests` row (shared table). */
interface PartsRequestRow {
  id: string;
  jobId: string;
  /** Authenticated user id (`parts_requests.requester_id`). */
  requesterId: string;
  technicianId: string;
  technicianName: string;
  status: PartsRequestStatus;
  reason: string;
  /** Stage 7F — latest manager decision (`reviewed_by` / `reviewed_at` / `review_notes`). */
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Stage 7F — mirrors one `job_approvals` row with
 * `request_type = PARTS` (shared table, no new tables).
 */
interface PartsApprovalRow {
  id: string;
  jobId: string;
  requestId: string;
  requestedBy: string | null;
  reviewedBy: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_INFO';
  comments: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

/** Stage 7E — mirrors one `parts_request_items` row (shared table). */
interface PartsRequestItemRow {
  id: string;
  requestId: string;
  partName: string;
  quantity: number;
  notes: string | null;
  /** Opaque FileStorage key (`photo_reference`); null when no photo. */
  photoStorageKey: string | null;
  photoOriginalFilename: string | null;
  photoMime: string | null;
  photoSize: number | null;
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
  private partsRequestSeq = 0;
  private readonly partsRequests = new Map<string, PartsRequestRow>();
  private partsItemSeq = 0;
  private readonly partsItems = new Map<string, PartsRequestItemRow>();
  /** Stage 7F — mirrors `job_approvals` rows with `request_type = PARTS`. */
  private partsApprovalSeq = 0;
  private readonly partsApprovals: PartsApprovalRow[] = [];

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

  /**
   * Stage 8 — notification recipients for business events: the owning
   * user id plus active BUSINESS_OWNER / BUSINESS_MANAGER member user
   * ids (technicians never included).
   */
  async findActiveManagerUserIds(businessId: string): Promise<string[]> {
    const userIds = new Set<string>();
    const business = this.businesses.get(businessId);
    if (business) userIds.add(business.ownerUserId);
    for (const member of this.members) {
      if (member.businessId !== businessId || !member.isActive) continue;
      if (member.role === 'BUSINESS_OWNER' || member.role === 'BUSINESS_MANAGER') {
        userIds.add(member.userId);
      }
    }
    return [...userIds];
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
    query: InternalJobBoardQuery,
  ): Promise<{ items: BusinessBoardJobDto[]; total: number }> {
    const needle = query.search === null ? null : query.search.toLowerCase();
    const owned: InternalJobRow[] = [];
    for (const row of this.internalJobs.values()) {
      if (row.businessId !== businessId) continue;
      if (query.status !== null && row.status !== query.status) continue;
      if (!matchesBoardCategory(row, query.board, (jobId) => this.activeAssignmentForJob(jobId))) continue;
      if (query.assigned !== null) {
        const hasAssignment = this.activeAssignmentForJob(row.id) !== null;
        if (hasAssignment !== query.assigned) continue;
      }
      if (query.technicianId !== null) {
        const active = this.activeAssignmentForJob(row.id);
        if (!active || active.technicianId !== query.technicianId) continue;
      }
      if (query.priority !== null && row.priority !== query.priority) continue;
      if (query.from !== null && row.createdAt < query.from) continue;
      if (query.to !== null && row.createdAt > endOfDayIso(query.to)) continue;
      const dto = this.toJobDto(row);
      if (!dto) continue;
      if (needle) {
        const haystack =
          `${dto.reference} ${dto.description} ${dto.title ?? ''} ${dto.customer.displayName} ${dto.customer.email ?? ''} ${dto.customer.phone ?? ''} ${dto.service.name}`.toLowerCase();
        if (!haystack.includes(needle)) continue;
      }
      owned.push(row);
    }
    sortBoardRows(owned, query.sort);
    const start = (query.page - 1) * query.pageSize;
    return {
      items: owned.slice(start, start + query.pageSize).map((row) => this.toBoardJobDto(row)),
      total: owned.length,
    };
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
  // Stage 7G — business job board enrichment + operational counts.
  // ------------------------------------------------------------------

  /** Active assignment (contact info only), outstanding APPROVED parts and latest work timestamp. */
  private toBoardJobDto(row: InternalJobRow): BusinessBoardJobDto {
    const job = this.toJobDto(row);
    if (!job) throw new Error('Board job failed: customer row not found after insert.');
    const active = this.activeAssignmentForJob(row.id);
    const assignment = active ? this.toAssignmentDto(active) : null;
    let partsOutstanding = 0;
    for (const request of this.partsRequests.values()) {
      if (request.jobId === row.id && request.status === 'APPROVED') partsOutstanding += 1;
    }
    let lastUpdateAt: string | null = null;
    const consider = (value: string): void => {
      if (lastUpdateAt === null || value > lastUpdateAt) lastUpdateAt = value;
    };
    for (const update of this.techUpdates) {
      if (update.jobId === row.id) consider(update.createdAt);
    }
    for (const image of this.techImages.values()) {
      if (image.jobId === row.id) consider(image.createdAt);
    }
    for (const voice of this.voiceNotes.values()) {
      if (voice.jobId === row.id) consider(voice.createdAt);
    }
    return { ...job, assignment, partsOutstanding, lastUpdateAt };
  }

  async countBoardJobs(businessId: string): Promise<BusinessBoardSummary> {
    const summary: BusinessBoardSummary = {
      total: 0,
      requested: 0,
      assigned: 0,
      scheduled: 0,
      inProgress: 0,
      awaitingParts: 0,
      completed: 0,
      cancelled: 0,
      history: 0,
    };
    for (const row of this.internalJobs.values()) {
      if (row.businessId !== businessId) continue;
      summary.total += 1;
      if (this.activeAssignmentForJob(row.id) !== null) summary.assigned += 1;
      if (row.status === 'REQUESTED') summary.requested += 1;
      if (isScheduledBoardRow(row)) summary.scheduled += 1;
      if (row.status === 'IN_PROGRESS') summary.inProgress += 1;
      else if (row.status === 'AWAITING_PARTS') summary.awaitingParts += 1;
      else if (row.status === 'COMPLETED') summary.completed += 1;
      else if (row.status === 'CANCELLED') summary.cancelled += 1;
      if (row.status === 'COMPLETED' || row.status === 'CLOSED' || row.status === 'CONFIRMED') {
        summary.history += 1;
      }
    }
    return summary;
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

  // ------------------------------------------------------------------
  // Stage 7E — technician parts requests (memory implementation).
  //
  // Mirrors the shared `parts_requests` / `parts_request_items` tables
  // with the same rules as the MySQL implementation: active-assignment
  // scoping, IN_PROGRESS / AWAITING_PARTS gating, PENDING on creation
  // and no job-status change. Timeline inclusion is read-time (see the
  // shared `buildTechnicianExecutionEvents` helper) — no history row
  // is written when a request is created.
  // ------------------------------------------------------------------

  /** Guard shared by the 7E write: assignment + execution state. */
  private requireAssignedForParts(technicianId: string, jobId: string): InternalJobRow {
    if (!this.activeAssignment(technicianId, jobId)) {
      throw new TechnicianJobNotExecutableError('Job not found.');
    }
    const row = this.internalJobs.get(jobId);
    if (!row) throw new TechnicianJobNotExecutableError('Job not found.');
    if (row.status !== 'IN_PROGRESS' && row.status !== 'AWAITING_PARTS') {
      throw new TechnicianJobNotExecutableError('Parts can only be requested while the job is in progress.');
    }
    return row;
  }

  async createPartsRequest(input: CreatePartsRequestPersistInput): Promise<PartsRequestDto> {
    this.requireAssignedForParts(input.technicianId, input.jobId);
    const technician = this.technicians.get(input.technicianId);
    if (!technician) throw new TechnicianJobNotExecutableError('Job not found.');
    // All checks passed before any mutation: a failed insert cannot
    // leave a header without its item (or vice versa).
    const now = nowIso();
    this.partsRequestSeq += 1;
    const request: PartsRequestRow = {
      id: String(this.partsRequestSeq),
      jobId: input.jobId,
      requesterId: input.requestedBy,
      technicianId: input.technicianId,
      technicianName: technician.displayName,
      status: 'PENDING',
      reason: input.reason,
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      createdAt: now,
      updatedAt: now,
    };
    this.partsRequests.set(request.id, request);
    this.partsItemSeq += 1;
    const item: PartsRequestItemRow = {
      id: String(this.partsItemSeq),
      requestId: request.id,
      partName: input.partName,
      quantity: input.quantity,
      notes: input.notes,
      photoStorageKey: input.photoStorageKey,
      photoOriginalFilename: input.photoOriginalFilename,
      photoMime: input.photoMime,
      photoSize: input.photoSize,
      createdAt: now,
    };
    this.partsItems.set(item.id, item);
    return this.toPartsRequestDto(request);
  }

  async listTechnicianPartsRequests(technicianId: string, jobId: string): Promise<PartsRequestDto[] | null> {
    if (!this.activeAssignment(technicianId, jobId)) return null;
    if (!this.internalJobs.get(jobId)) return null;
    return [...this.partsRequests.values()]
      .filter((request) => request.jobId === jobId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map((request) => this.toPartsRequestDto(request));
  }

  async getTechnicianPartsRequest(
    technicianId: string,
    jobId: string,
    requestId: string,
  ): Promise<PartsRequestDto | null> {
    if (!this.activeAssignment(technicianId, jobId)) return null;
    const row = this.partsRequests.get(requestId);
    if (!row || row.jobId !== jobId) return null;
    return this.toPartsRequestDto(row);
  }

  async getTechnicianPartsRequestPhotoFile(
    technicianId: string,
    jobId: string,
    requestId: string,
  ): Promise<{ request: PartsRequestDto; mimeType: string; filename: string | null; storageKey: string } | null> {
    if (!this.activeAssignment(technicianId, jobId)) return null;
    return this.partsPhotoFor(jobId, requestId);
  }

  async listBusinessPartsRequests(businessId: string, jobId: string): Promise<PartsRequestDto[] | null> {
    if (!this.ownedInternalJob(businessId, jobId)) return null;
    return [...this.partsRequests.values()]
      .filter((request) => request.jobId === jobId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map((request) => this.toPartsRequestDto(request));
  }

  async getBusinessPartsRequest(
    businessId: string,
    jobId: string,
    requestId: string,
  ): Promise<PartsRequestDto | null> {
    if (!this.ownedInternalJob(businessId, jobId)) return null;
    const row = this.partsRequests.get(requestId);
    if (!row || row.jobId !== jobId) return null;
    return this.toPartsRequestDto(row);
  }

  async getBusinessPartsRequestPhotoFile(
    businessId: string,
    jobId: string,
    requestId: string,
  ): Promise<{ request: PartsRequestDto; mimeType: string; filename: string | null; storageKey: string } | null> {
    if (!this.ownedInternalJob(businessId, jobId)) return null;
    return this.partsPhotoFor(jobId, requestId);
  }

  /** Shared photo lookup: the request's first item carrying a photo key. */
  private partsPhotoFor(
    jobId: string,
    requestId: string,
  ): { request: PartsRequestDto; mimeType: string; filename: string | null; storageKey: string } | null {
    const row = this.partsRequests.get(requestId);
    if (!row || row.jobId !== jobId) return null;
    const item = [...this.partsItems.values()].find(
      (entry) => entry.requestId === requestId && entry.photoStorageKey !== null,
    );
    if (!item || !item.photoStorageKey || !item.photoMime) return null;
    return {
      request: this.toPartsRequestDto(row),
      mimeType: item.photoMime,
      filename: item.photoOriginalFilename,
      storageKey: item.photoStorageKey,
    };
  }

  private toPartsRequestDto(row: PartsRequestRow): PartsRequestDto {
    const items: PartsRequestItemDto[] = [...this.partsItems.values()]
      .filter((item) => item.requestId === row.id)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map((item) => ({
        id: item.id,
        partName: item.partName,
        quantity: item.quantity,
        notes: item.notes,
        hasPhoto: item.photoStorageKey !== null,
        photoMime: item.photoMime,
        createdAt: item.createdAt,
      }));
    const approvals: PartsApprovalDto[] = this.partsApprovals
      .filter((approval) => approval.requestId === row.id)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map((approval) => ({ ...approval, partsRequestId: approval.requestId }));
    const job = this.internalJobs.get(row.jobId);
    return {
      id: row.id,
      jobId: row.jobId,
      businessId: job?.businessId ?? '',
      requestedBy: { technicianId: row.technicianId, displayName: row.technicianName },
      status: row.status,
      reason: row.reason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      items,
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt,
      reviewNotes: row.reviewNotes,
      approvals,
    };
  }

  // ------------------------------------------------------------------
  // Stage 7F — manager approvals + awaiting parts (memory).
  //
  // Mirrors the shared `parts_requests` / `job_approvals` / `jobs` /
  // `job_status_history` tables with the same rules as the MySQL
  // implementation. Every method validates everything before mutating
  // anything, so a rejected action leaves request, approval, job and
  // history untouched (the in-memory equivalent of a rolled-back
  // transaction).
  // ------------------------------------------------------------------

  /** Owned INTERNAL job row, or null (NOT_FOUND upstream). */
  private ownedInternalJobRow(businessId: string, jobId: string): InternalJobRow | null {
    const row = this.internalJobs.get(jobId);
    return row && row.businessId === businessId ? row : null;
  }

  /** Active TECHNICIAN assignment of the job, or null. */
  private activeAssignmentForJob(jobId: string): AssignmentRow | null {
    return this.assignments.find((a) => a.jobId === jobId && a.unassignedAt === null) ?? null;
  }

  /** True while the job waits on approved-but-unavailable parts. */
  private hasOutstandingApprovedParts(jobId: string, excludeRequestId: string | null = null): boolean {
    return [...this.partsRequests.values()].some(
      (request) =>
        request.jobId === jobId && request.status === 'APPROVED' && request.id !== excludeRequestId,
    );
  }

  private recordPartsApproval(input: {
    jobId: string;
    requestId: string;
    requestedBy: string | null;
    reviewedBy: string | null;
    status: PartsApprovalRow['status'];
    comments: string | null;
    reviewedAt: string | null;
  }): PartsApprovalRow {
    this.partsApprovalSeq += 1;
    const now = nowIso();
    const row: PartsApprovalRow = {
      id: String(this.partsApprovalSeq),
      jobId: input.jobId,
      requestId: input.requestId,
      requestedBy: input.requestedBy,
      reviewedBy: input.reviewedBy,
      status: input.status,
      comments: input.comments,
      reviewedAt: input.reviewedAt,
      createdAt: now,
    };
    this.partsApprovals.push(row);
    return row;
  }

  private toPartsApprovalDto(row: PartsApprovalRow): PartsApprovalDto {
    return { ...row, partsRequestId: row.requestId };
  }

  async reviewPartsRequest(
    businessId: string,
    jobId: string,
    requestId: string,
    input: { decision: 'APPROVE' | 'REJECT' | 'REQUEST_INFO'; comment: string | null; reviewerId: string },
  ): Promise<{ request: PartsRequestDto; approval: PartsApprovalDto; job: InternalJobDto; technicianUserId: string } | null> {
    const job = this.ownedInternalJobRow(businessId, jobId);
    if (!job) return null;
    const request = this.partsRequests.get(requestId);
    if (!request || request.jobId !== jobId) return null;
    // Only PENDING and NEEDS_INFO requests are reviewable — every other
    // state (incl. a second APPROVE) is rejected, never silently applied.
    if (request.status !== 'PENDING' && request.status !== 'NEEDS_INFO') {
      throw new PartsRequestNotActionableError(
        `This parts request has already been ${request.status === 'APPROVED' ? 'approved' : request.status === 'REJECTED' ? 'rejected' : 'actioned'}.`,
      );
    }
    if (request.requesterId === input.reviewerId) {
      throw new PartsRequestNotActionableError('You cannot review your own parts request.');
    }
    // Approvals only run on live execution jobs that are actually
    // assigned — approving parts for a cancelled/completed/closed or
    // unassigned job is meaningless.
    if (job.status !== 'IN_PROGRESS' && job.status !== 'AWAITING_PARTS') {
      throw new PartsRequestNotActionableError('Parts can only be reviewed while the job is in progress.');
    }
    if (!this.activeAssignmentForJob(jobId)) {
      throw new PartsRequestNotActionableError('Parts can only be reviewed for an assigned job.');
    }
    const now = nowIso();
    const nextStatus: PartsRequestStatus =
      input.decision === 'APPROVE' ? 'APPROVED' : input.decision === 'REJECT' ? 'REJECTED' : 'NEEDS_INFO';
    const approvalStatus: PartsApprovalRow['status'] =
      input.decision === 'APPROVE' ? 'APPROVED' : input.decision === 'REJECT' ? 'REJECTED' : 'NEEDS_INFO';
    // All checks passed before any mutation (atomic): request, approval
    // row and any job move below are written together.
    const updatedRequest: PartsRequestRow = {
      ...request,
      status: nextStatus,
      reviewedBy: input.reviewerId,
      reviewedAt: now,
      reviewNotes: input.comment,
      updatedAt: now,
    };
    this.partsRequests.set(requestId, updatedRequest);
    const approval = this.recordPartsApproval({
      jobId,
      requestId,
      requestedBy: request.requesterId,
      reviewedBy: input.reviewerId,
      status: approvalStatus,
      comments: input.comment,
      reviewedAt: now,
    });
    let nextJob = this.internalJobs.get(jobId);
    if (input.decision === 'APPROVE' && nextJob && nextJob.status === 'IN_PROGRESS') {
      const moved: InternalJobRow = { ...nextJob, status: 'AWAITING_PARTS', updatedAt: now };
      this.internalJobs.set(jobId, moved);
      this.internalHistory.push({
        jobId,
        previousStatus: 'IN_PROGRESS',
        status: 'AWAITING_PARTS',
        reason: 'Parts request approved — awaiting parts',
        createdAt: now,
      });
      nextJob = moved;
    }
    const dto = nextJob ? this.toJobDto(nextJob) : null;
    if (!dto) throw new Error('Parts review failed: job not found after update.');
    return {
      request: this.toPartsRequestDto(updatedRequest),
      approval: this.toPartsApprovalDto(approval),
      job: dto,
      technicianUserId: request.requesterId,
    };
  }

  async markPartsAvailable(
    businessId: string,
    jobId: string,
    requestId: string,
    input: { comment: string | null; markedBy: string },
  ): Promise<{ request: PartsRequestDto; job: InternalJobDto; jobResumed: boolean; technicianUserId: string } | null> {
    void input.markedBy;
    void input.comment;
    const job = this.ownedInternalJobRow(businessId, jobId);
    if (!job) return null;
    const request = this.partsRequests.get(requestId);
    if (!request || request.jobId !== jobId) return null;
    // Only APPROVED requests can become available — PENDING must be
    // approved first, and terminal states never move again.
    if (request.status !== 'APPROVED') {
      throw new PartsRequestNotActionableError(
        request.status === 'PARTS_AVAILABLE'
          ? 'These parts have already been marked as available.'
          : 'Only approved parts requests can be marked as available.',
      );
    }
    if (job.status !== 'AWAITING_PARTS' && job.status !== 'IN_PROGRESS') {
      throw new PartsRequestNotActionableError('Parts availability can only be recorded while the job is awaiting parts.');
    }
    const now = nowIso();
    // All checks passed before any mutation (atomic).
    const updatedRequest: PartsRequestRow = { ...request, status: 'PARTS_AVAILABLE', updatedAt: now };
    this.partsRequests.set(requestId, updatedRequest);
    // Multiple-request rule: resume only when no APPROVED request
    // remains outstanding for the job.
    let jobResumed = false;
    let nextJob = this.internalJobs.get(jobId);
    if (nextJob && nextJob.status === 'AWAITING_PARTS' && !this.hasOutstandingApprovedParts(jobId, requestId)) {
      const resumed: InternalJobRow = { ...nextJob, status: 'IN_PROGRESS', updatedAt: now };
      this.internalJobs.set(jobId, resumed);
      this.internalHistory.push({
        jobId,
        previousStatus: 'AWAITING_PARTS',
        status: 'IN_PROGRESS',
        reason: 'Parts available — job ready to continue',
        createdAt: now,
      });
      nextJob = resumed;
      jobResumed = true;
    }
    const dto = nextJob ? this.toJobDto(nextJob) : null;
    if (!dto) throw new Error('Parts availability failed: job not found after update.');
    return {
      request: this.toPartsRequestDto(updatedRequest),
      job: dto,
      jobResumed,
      technicianUserId: request.requesterId,
    };
  }

  async respondToPartsRequest(
    technicianId: string,
    jobId: string,
    requestId: string,
    input: { note: string | null; responderId: string },
  ): Promise<PartsRequestDto | null> {
    if (!this.activeAssignment(technicianId, jobId)) return null;
    if (!this.internalJobs.get(jobId)) return null;
    const request = this.partsRequests.get(requestId);
    if (!request || request.jobId !== jobId) return null;
    if (request.status !== 'NEEDS_INFO') {
      throw new PartsRequestNotActionableError('This parts request is not waiting for more information.');
    }
    const now = nowIso();
    // All checks passed before any mutation (atomic): the request
    // returns to PENDING and the technician's note is preserved as a
    // PENDING approval row for the manager's next review.
    const updatedRequest: PartsRequestRow = { ...request, status: 'PENDING', updatedAt: now };
    this.partsRequests.set(requestId, updatedRequest);
    this.recordPartsApproval({
      jobId,
      requestId,
      requestedBy: input.responderId,
      reviewedBy: null,
      status: 'PENDING',
      comments: input.note,
      reviewedAt: null,
    });
    return this.toPartsRequestDto(updatedRequest);
  }

  async resumeTechnicianJob(
    technicianId: string,
    jobId: string,
    input: { resumedBy: string },
  ): Promise<InternalJobDto | null> {
    void input.resumedBy;
    if (!this.activeAssignment(technicianId, jobId)) return null;
    const job = this.internalJobs.get(jobId);
    if (!job) return null;
    if (job.status !== 'AWAITING_PARTS') {
      throw new PartsRequestNotActionableError('Only jobs awaiting parts can be resumed.');
    }
    // The technician may continue only when every approved request has
    // its parts available — an outstanding APPROVED request blocks.
    if (this.hasOutstandingApprovedParts(jobId)) {
      throw new PartsRequestNotActionableError('Some approved parts are still outstanding.');
    }
    const now = nowIso();
    const resumed: InternalJobRow = { ...job, status: 'IN_PROGRESS', updatedAt: now };
    this.internalJobs.set(jobId, resumed);
    this.internalHistory.push({
      jobId,
      previousStatus: 'AWAITING_PARTS',
      status: 'IN_PROGRESS',
      reason: 'Technician resumed job — parts available',
      createdAt: now,
    });
    const dto = this.toJobDto(resumed);
    if (!dto) throw new Error('Job resume failed: job not found after update.');
    return dto;
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
 * Stage 7G — board category predicate. "Assigned" is derived from the
 * active TECHNICIAN assignment (no ASSIGNED status exists); "New" is
 * REQUESTED; "Scheduled" is derived from the `scheduled_at` visit slot
 * (no promotion endpoint moves internal jobs to SCHEDULED);
 * "History" is the terminal set COMPLETED / CLOSED / CONFIRMED. Every
 * other category maps to its lifecycle status.
 */
function matchesBoardCategory(
  row: InternalJobRow,
  board: InternalJobBoardQuery['board'],
  activeAssignment: (jobId: string) => { technicianId: string } | null,
): boolean {
  if (board === null || board === 'ALL') return true;
  switch (board) {
    case 'NEW':
      return row.status === 'REQUESTED';
    case 'ASSIGNED':
      return activeAssignment(row.id) !== null;
    case 'SCHEDULED':
      return isScheduledBoardRow(row);
    case 'IN_PROGRESS':
      return row.status === 'IN_PROGRESS';
    case 'AWAITING_PARTS':
      return row.status === 'AWAITING_PARTS';
    case 'COMPLETED':
      return row.status === 'COMPLETED';
    case 'CANCELLED':
      return row.status === 'CANCELLED';
    case 'HISTORY':
      return row.status === 'COMPLETED' || row.status === 'CLOSED' || row.status === 'CONFIRMED';
    default:
      return true;
  }
}

/**
 * Stage 7G — "scheduled" derivation shared by the SCHEDULED board
 * category and the board-summary count. No promotion endpoint moves
 * internal jobs to a SCHEDULED status, so the board derives it from
 * the visit slot itself: a REQUESTED/SCHEDULED job with `scheduled_at`
 * set. Completed, cancelled and in-progress jobs keep their own
 * categories even when they retain a slot.
 */
function isScheduledBoardRow(row: InternalJobRow): boolean {
  return (row.status === 'REQUESTED' || row.status === 'SCHEDULED') && row.scheduledAt !== null;
}

/** Stage 7G — board ordering: recent, scheduled visit, then priority. */
function sortBoardRows(rows: InternalJobRow[], sort: InternalJobBoardQuery['sort']): void {
  const priorityRank = (priority: InternalJobRow['priority']): number =>
    priority === 'URGENT' ? 0 : priority === 'HIGH' ? 1 : priority === 'NORMAL' ? 2 : 3;
  if (sort === 'SCHEDULED') {
    rows.sort((a, b) => {
      if (a.scheduledAt === null && b.scheduledAt === null) return a.createdAt < b.createdAt ? 1 : -1;
      if (a.scheduledAt === null) return 1;
      if (b.scheduledAt === null) return -1;
      if (a.scheduledAt !== b.scheduledAt) return a.scheduledAt < b.scheduledAt ? -1 : 1;
      return a.createdAt < b.createdAt ? 1 : -1;
    });
    return;
  }
  if (sort === 'PRIORITY') {
    rows.sort((a, b) => {
      const rank = priorityRank(a.priority) - priorityRank(b.priority);
      if (rank !== 0) return rank;
      return a.createdAt < b.createdAt ? 1 : -1;
    });
    return;
  }
  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
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

/**
 * Stage 7G — extend a `to` bound parsed as a bare YYYY-MM-DD date to the
 * end of that UTC day so the whole day is included (a full ISO datetime
 * is honoured as given).
 */
function endOfDayIso(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(value)) {
    const day = value.slice(0, 10);
    return `${day}T23:59:59.999Z`;
  }
  return value;
}
