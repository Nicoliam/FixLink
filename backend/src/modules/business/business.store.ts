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
  TechnicianExecutionEventDto,
  TechnicianJobImageDto,
  TechnicianJobUpdateDto,
  TechnicianVoiceNoteDto,
  TechnicianWorkPhase,
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
  // ------------------------------------------------------------------
  // Stage 7D — technician execution (shared `jobs` / `job_images` /
  // `job_updates` / `job_voice_notes` / `job_status_history`
  // architecture — no technician-specific job tables). Every method is
  // scoped by the active TECHNICIAN assignment: without one the job
  // reads as null (NOT_FOUND upstream), so one technician can never
  // reach another technician's job and a technician from another
  // business can never reach this business's jobs.
  // ------------------------------------------------------------------
  /**
   * Start work: REQUESTED/SCHEDULED → IN_PROGRESS plus the history
   * entry, atomically. Returns null when the job is unknown or not
   * assigned to this technician; throws JobNotStartableError when the
   * current state forbids starting (the service maps it to 422).
   */
  startTechnicianJob(
    technicianId: string,
    jobId: string,
    input: { startedBy: string },
  ): Promise<InternalJobDto | null>;
  /** Persist a BEFORE/DURING/AFTER photo while IN_PROGRESS. */
  createTechnicianJobImage(input: CreateTechnicianImageInput): Promise<TechnicianJobImageDto>;
  /** Photo metadata for an assigned job, oldest first (null when not assigned). */
  listTechnicianJobImages(technicianId: string, jobId: string): Promise<TechnicianJobImageDto[] | null>;
  /**
   * One photo plus its protected storage key for authorized downloads
   * (null when not assigned or the photo is not on this job).
   */
  getTechnicianJobImageFile(
    technicianId: string,
    jobId: string,
    imageId: string,
  ): Promise<{ image: TechnicianJobImageDto; storageKey: string } | null>;
  /**
   * Delete a photo while IN_PROGRESS. Only the uploader may delete.
   * Returns the storage key so the service can remove the file bytes.
   */
  deleteTechnicianJobImage(input: DeleteTechnicianImageInput): Promise<{ storageKey: string }>;
  /** Persist a BEFORE/DURING/AFTER progress note while IN_PROGRESS. */
  createTechnicianJobUpdate(input: CreateTechnicianUpdateInput): Promise<TechnicianJobUpdateDto>;
  /** Progress notes for an assigned job, oldest first (null when not assigned). */
  listTechnicianJobUpdates(technicianId: string, jobId: string): Promise<TechnicianJobUpdateDto[] | null>;
  /** Persist a voice-note record while IN_PROGRESS (bytes already stored). */
  createTechnicianVoiceNote(input: CreateTechnicianVoiceNoteInput): Promise<TechnicianVoiceNoteDto>;
  /** Voice-note metadata for an assigned job, oldest first (null when not assigned). */
  listTechnicianVoiceNotes(technicianId: string, jobId: string): Promise<TechnicianVoiceNoteDto[] | null>;
  /**
   * One voice note plus its protected storage key for authorized
   * streaming (null when not assigned or not on this job).
   */
  getTechnicianVoiceNoteFile(
    technicianId: string,
    jobId: string,
    voiceNoteId: string,
  ): Promise<{ voiceNote: TechnicianVoiceNoteDto; storageKey: string } | null>;
  /** Assignment events for an assigned job, newest first (null when not assigned). */
  listTechnicianJobAssignmentEvents(
    technicianId: string,
    jobId: string,
  ): Promise<JobAssignmentHistoryEntry[] | null>;
  /**
   * Complete work: IN_PROGRESS → COMPLETED with the completion note
   * stored as an AFTER update, atomically. Returns null when the job
   * is unknown or not assigned; throws
   * TechnicianJobNotCompletableError when the state forbids it.
   */
  completeTechnicianJob(
    technicianId: string,
    jobId: string,
    input: { note: string; completedBy: string },
  ): Promise<{ job: InternalJobDto; update: TechnicianJobUpdateDto } | null>;
  // ------------------------------------------------------------------
  // Stage 7D — business visibility of execution documentation.
  // Owner/manager reads for their own INTERNAL jobs (another
  // business's job reads as null — NOT_FOUND upstream). Read-only:
  // no technician-only capability is exposed here.
  // ------------------------------------------------------------------
  /** Photo metadata for an owned INTERNAL job, oldest first (null when foreign). */
  listBusinessJobImages(businessId: string, jobId: string): Promise<TechnicianJobImageDto[] | null>;
  /** One photo plus its protected storage key (null when foreign/off-job). */
  getBusinessJobImageFile(
    businessId: string,
    jobId: string,
    imageId: string,
  ): Promise<{ image: TechnicianJobImageDto; storageKey: string } | null>;
  /** Progress notes for an owned INTERNAL job, oldest first (null when foreign). */
  listBusinessJobUpdates(businessId: string, jobId: string): Promise<TechnicianJobUpdateDto[] | null>;
  /** Voice-note metadata for an owned INTERNAL job, oldest first (null when foreign). */
  listBusinessVoiceNotes(businessId: string, jobId: string): Promise<TechnicianVoiceNoteDto[] | null>;
  /** One voice note plus its protected storage key (null when foreign/off-job). */
  getBusinessVoiceNoteFile(
    businessId: string,
    jobId: string,
    voiceNoteId: string,
  ): Promise<{ voiceNote: TechnicianVoiceNoteDto; storageKey: string } | null>;
}

/** The job is not in a cancellable state (only REQUESTED may cancel in Stage 7B). */
export class JobNotCancellableError extends Error {
  constructor(message = 'Only requested jobs can be cancelled.') {
    super(message);
    this.name = 'JobNotCancellableError';
  }
}

/** The job is not in a startable state (only REQUESTED/SCHEDULED may start). */
export class JobNotStartableError extends Error {
  constructor(message = 'Only requested or scheduled jobs can be started.') {
    super(message);
    this.name = 'JobNotStartableError';
  }
}

/** The job is not accepting work documentation (must be IN_PROGRESS). */
export class TechnicianJobNotExecutableError extends Error {
  constructor(message = 'This job is not accepting work documentation in its current state.') {
    super(message);
    this.name = 'TechnicianJobNotExecutableError';
  }
}

/** The image cannot be deleted (wrong state or not the uploader). */
export class TechnicianImageNotDeletableError extends Error {
  constructor(message = 'This image cannot be deleted.') {
    super(message);
    this.name = 'TechnicianImageNotDeletableError';
  }
}

/** The job is not in a state that allows completion (must be IN_PROGRESS). */
export class TechnicianJobNotCompletableError extends Error {
  constructor(message = 'This job cannot be completed in its current state.') {
    super(message);
    this.name = 'TechnicianJobNotCompletableError';
  }
}

/** Persist input for a technician job photo (assignment already verified). */
export interface CreateTechnicianImageInput {
  technicianId: string;
  jobId: string;
  uploadedBy: string;
  phase: TechnicianWorkPhase;
  /** Opaque key from FileStorage (stored in `job_images.file_reference`). */
  storageKey: string;
  originalFilename: string | null;
  mimeType: string;
  size: number;
}

export interface DeleteTechnicianImageInput {
  technicianId: string;
  jobId: string;
  imageId: string;
  deleterId: string;
}

/** Persist input for a technician progress note. */
export interface CreateTechnicianUpdateInput {
  technicianId: string;
  jobId: string;
  authorId: string;
  phase: TechnicianWorkPhase;
  note: string;
}

/** Persist input for a technician voice note (bytes already stored). */
export interface CreateTechnicianVoiceNoteInput {
  technicianId: string;
  jobId: string;
  authorId: string;
  /** Opaque key from FileStorage (stored in `job_voice_notes.file_reference`). */
  storageKey: string;
  originalFilename: string | null;
  mimeType: string;
  size: number;
  durationSeconds: number | null;
}

/** Build the chronological execution timeline from its parts (shared helper). */
export function buildTechnicianExecutionEvents(
  history: InternalJobTimelineEntry[],
  assignments: JobAssignmentHistoryEntry[],
  updates: TechnicianJobUpdateDto[],
  images: TechnicianJobImageDto[],
  voiceNotes: TechnicianVoiceNoteDto[],
): TechnicianExecutionEventDto[] {
  const events: TechnicianExecutionEventDto[] = [];
  for (const entry of history) {
    events.push({
      kind: 'status',
      createdAt: entry.createdAt,
      actor: 'business',
      status: entry.status,
      previousStatus: entry.previousStatus,
      reason: entry.reason,
    });
  }
  for (const entry of assignments) {
    events.push({
      kind: 'assignment',
      createdAt: entry.assignedAt,
      actor: 'business',
      technicianName: entry.technician.displayName,
      reason: 'Technician assigned to job',
    });
  }
  for (const update of updates) {
    events.push({
      kind: 'update',
      createdAt: update.createdAt,
      actor: 'technician',
      phase: update.phase,
      note: update.note,
    });
  }
  for (const image of images) {
    events.push({
      kind: 'image',
      createdAt: image.createdAt,
      actor: 'technician',
      phase: image.phase,
      imageId: image.id,
      mimeType: image.mimeType,
    });
  }
  for (const voice of voiceNotes) {
    events.push({
      kind: 'voice',
      createdAt: voice.createdAt,
      actor: 'technician',
      voiceNoteId: voice.id,
      mimeType: voice.mimeType,
      durationSeconds: voice.durationSeconds,
    });
  }
  const kindOrder: Record<TechnicianExecutionEventDto['kind'], number> = {
    status: 0,
    assignment: 1,
    update: 2,
    image: 3,
    voice: 4,
  };
  events.sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : kindOrder[a.kind] - kindOrder[b.kind],
  );
  return events;
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
