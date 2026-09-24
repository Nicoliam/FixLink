/**
 * FixLink Stage 7A — business foundation + technician management types.
 *
 * Businesses and technicians reuse the existing tables
 * (`business_profiles`, `business_members`, `technicians`, `users`) —
 * no new tables were created for this stage. The DTOs below expose only
 * appropriate public/business fields: verification documents, internal
 * notes, audit data and private member information are never selected
 * or returned.
 */

/** Effective business role of the caller, derived server-side from membership. */
export type BusinessAccessRole = 'OWNER' | 'MANAGER' | 'TECHNICIAN';

/** Businesses the user may act for (owner row or active membership). */
export interface BusinessIdentity {
  businessId: string;
  role: BusinessAccessRole;
}

/** Business profile projection returned by the API (no private data). */
export interface BusinessDto {
  id: string;
  businessName: string;
  slug: string;
  description: string | null;
  /** Logo storage reference (metadata only — never bytes or private paths). */
  logoReference: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  verificationStatus: string;
  ratingAvg: number;
  ratingCount: number;
  isActive: boolean;
  /** The caller's own membership role in this business (server-derived). */
  role: 'OWNER' | 'MANAGER';
  /** Technicians currently on the roster (active + inactive rows). */
  technicianCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Technician roster projection (contact info only — never credentials). */
export interface TechnicianDto {
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

/** Validated business profile patch (all fields optional, at least one required). */
export interface UpdateBusinessInput {
  businessName?: string;
  description?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
}

/** Validated technician creation body. */
export interface CreateTechnicianInput {
  displayName: string;
  email: string;
  phone: string | null;
  /** Initial password — required only when the email has no account yet. */
  password: string | null;
}

/** Validated technician patch (at least one field required). */
export interface UpdateTechnicianInput {
  displayName?: string;
  isActive?: boolean;
}

/**
 * FixLink Stage 7B — business-managed customers + internal jobs.
 *
 * Business-managed customers reuse `customer_profiles` with
 * `user_id = NULL` and `business_id` set (see migration 003). Internal
 * jobs reuse the ONE shared `jobs` table with `source = INTERNAL`
 * (see migration 004). No new tables were created for this stage.
 */

/** Preferred contact channel for a business-managed customer. */
export type BusinessCustomerContact = 'EMAIL' | 'PHONE' | 'WHATSAPP';

/** Business-managed customer projection (never exposes auth internals). */
export interface BusinessCustomerDto {
  id: string;
  businessId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  preferredContact: BusinessCustomerContact | null;
  createdAt: string;
  updatedAt: string;
}

/** Validated business-customer creation body. */
export interface CreateBusinessCustomerInput {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  preferredContact: BusinessCustomerContact | null;
}

/** Validated business-customer patch (at least one field required). */
export interface UpdateBusinessCustomerInput {
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  preferredContact?: BusinessCustomerContact | null;
}

/** Internal job priority (`jobs.priority`). */
export type InternalJobPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

/** Internal job status — the shared lifecycle, server-controlled. */
export type InternalJobStatus =
  | 'REQUESTED'
  | 'QUOTED'
  | 'ACCEPTED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'AWAITING_PARTS'
  | 'COMPLETED'
  | 'CONFIRMED'
  | 'CLOSED'
  | 'CANCELLED'
  | 'DISPUTED';

/** Customer embedded in an internal job response (contact info only). */
export interface InternalJobCustomerSummary {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string | null;
  phone: string | null;
}

/** Service embedded in an internal job response. */
export interface InternalJobServiceSummary {
  id: string;
  name: string;
  slug: string;
}

/** Owning business embedded in an internal job response. */
export interface InternalJobBusinessSummary {
  id: string;
  businessName: string;
}

/** One status-history entry for the job timeline. */
export interface InternalJobTimelineEntry {
  previousStatus: InternalJobStatus | null;
  status: InternalJobStatus;
  reason: string | null;
  createdAt: string;
}

/** Internal job projection (`source` is always `INTERNAL`). */
export interface InternalJobDto {
  id: string;
  reference: string;
  source: 'INTERNAL';
  status: InternalJobStatus;
  businessId: string;
  business: InternalJobBusinessSummary;
  customerId: string;
  customer: InternalJobCustomerSummary;
  service: InternalJobServiceSummary;
  title: string | null;
  description: string;
  addressLine1: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  priority: InternalJobPriority;
  /** `jobs.scheduled_at` as an ISO instant, or null when unscheduled. */
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Internal job detail: the job plus its status-history timeline. */
export interface InternalJobDetailDto {
  job: InternalJobDto;
  timeline: InternalJobTimelineEntry[];
}

/** Validated internal-job creation body. */
export interface CreateInternalJobInput {
  customerId: string;
  serviceId: string;
  title: string | null;
  description: string;
  addressLine1: string;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  priority: InternalJobPriority;
  /** `YYYY-MM-DD HH:MM:SS` (UTC) for `scheduled_at`, or null. */
  scheduledAt: string | null;
}

/** Validated internal-job patch (at least one field required). */
export interface UpdateInternalJobInput {
  title?: string | null;
  description?: string;
  addressLine1?: string;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  priority?: InternalJobPriority;
  /** `YYYY-MM-DD HH:MM:SS` (UTC) for `scheduled_at`, or null to clear. */
  scheduledAt?: string | null;
}

/** Real-data summary for the business dashboard (all INTERNAL jobs). */
export interface InternalJobsSummary {
  total: number;
  requested: number;
  scheduled: number;
  inProgress: number;
  completed: number;
  cancelled: number;
}

/**
 * FixLink Stage 7G — business job board + history.
 *
 * The board reuses the ONE shared `jobs` table (`source = INTERNAL`)
 * plus `job_assignments`, `job_status_history`, `job_updates`,
 * `job_images`, `job_voice_notes`, `parts_requests` and
 * `job_approvals`. No new tables, no duplicate statuses, no second
 * timeline. "Assigned" is derived from the active TECHNICIAN
 * assignment row (`unassigned_at IS NULL`); "New" is `REQUESTED`;
 * "History" is the terminal set COMPLETED / CLOSED / CONFIRMED.
 */

/** Operational board category for GET /api/v1/business/jobs (`board`). */
export type InternalJobBoardCategory =
  | 'ALL'
  | 'NEW'
  | 'ASSIGNED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'AWAITING_PARTS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'HISTORY';

/** Result ordering for the business job board (`sort`). */
export type InternalJobBoardSort = 'RECENT' | 'SCHEDULED' | 'PRIORITY';

/** Board filter set parsed from the GET /api/v1/business/jobs query string. */
export interface InternalJobBoardQuery {
  status: InternalJobStatus | null;
  board: InternalJobBoardCategory | null;
  /** Active-assignment roster technician id (business-scoped by the service). */
  technicianId: string | null;
  priority: InternalJobPriority | null;
  /** Inclusive creation-date bounds as ISO instants (or null). */
  from: string | null;
  to: string | null;
  /** True = has an active assignment; false = unassigned. */
  assigned: boolean | null;
  sort: InternalJobBoardSort;
  search: string | null;
  page: number;
  pageSize: number;
}

/**
 * One operational board row: the shared INTERNAL job projection plus
 * the active technician assignment (null when unassigned), the number
 * of APPROVED-but-unfulfilled parts requests (outstanding materials)
 * and the most recent work-documentation timestamp (null when the job
 * has no notes, photos or voice notes yet).
 */
export interface BusinessBoardJobDto extends InternalJobDto {
  assignment: JobAssignmentDto | null;
  /** APPROVED parts requests not yet marked PARTS_AVAILABLE. */
  partsOutstanding: number;
  /** Latest job_updates / job_images / job_voice_notes timestamp, or null. */
  lastUpdateAt: string | null;
}

/**
 * Operational counts for the business job board
 * (GET /api/v1/business/jobs-board-summary). All INTERNAL jobs of the
 * caller's business; `assigned` counts jobs with an active technician
 * assignment (any status), `awaitingParts` counts AWAITING_PARTS jobs
 * and `history` counts the terminal set (COMPLETED / CLOSED /
 * CONFIRMED). The legacy `jobs-summary` shape is unchanged.
 */
export interface BusinessBoardSummary {
  total: number;
  requested: number;
  assigned: number;
  scheduled: number;
  inProgress: number;
  awaitingParts: number;
  completed: number;
  cancelled: number;
  history: number;
}

/**
 * FixLink Stage 7C — technician assignment.
 *
 * Assignments reuse the existing `job_assignments` table with
 * `assignment_type = TECHNICIAN`. The active assignment is the row
 * with `unassigned_at IS NULL`; reassignment closes the previous row
 * (sets `unassigned_at`) and inserts a new active row, preserving
 * full history. Job `status` is intentionally untouched by
 * assignment — there is no ASSIGNED status in the lifecycle.
 */

/** Technician embedded in an assignment response (contact info only). */
export interface JobAssignmentTechnicianSummary {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
}

/** Active technician assignment for one internal job. */
export interface JobAssignmentDto {
  id: string;
  jobId: string;
  businessId: string;
  technician: JobAssignmentTechnicianSummary;
  assignedBy: string | null;
  assignedAt: string;
}

/** One assignment history entry (active rows have `unassignedAt = null`). */
export interface JobAssignmentHistoryEntry {
  id: string;
  technician: JobAssignmentTechnicianSummary;
  assignedBy: string | null;
  assignedAt: string;
  unassignedAt: string | null;
  isActive: boolean;
}

/** Assignment detail: active assignment plus full history. */
export interface JobAssignmentDetailDto {
  jobId: string;
  assignment: JobAssignmentDto | null;
  history: JobAssignmentHistoryEntry[];
}

/** Validated assignment body (technician id only — business/job derived server-side). */
export interface AssignTechnicianInput {
  technicianId: string;
}

/**
 * FixLink Stage 7D — technician execution + voice notes.
 *
 * Reuses the ONE shared architecture: `jobs` (source = INTERNAL),
 * `job_images` (phase BEFORE/DURING/AFTER), `job_updates` (phase +
 * message), `job_voice_notes` (file reference + metadata) and
 * `job_status_history`. No technician-specific copies of job tables
 * exist — the DTOs below are projections of those shared tables.
 * Binary bytes are never stored in MySQL; `fileReference` fields are
 * opaque server-side storage keys (see `services/file-storage`).
 */

/** Work-documentation phase for technician photos and notes. */
export type TechnicianWorkPhase = 'BEFORE' | 'DURING' | 'AFTER';

/** File metadata for a technician job photo (never binaries or paths). */
export interface TechnicianJobImageDto {
  id: string;
  jobId: string;
  uploadedBy: string;
  phase: TechnicianWorkPhase;
  originalFilename: string | null;
  mimeType: string;
  size: number;
  createdAt: string;
}

/** A written progress / completion note on an internal job. */
export interface TechnicianJobUpdateDto {
  id: string;
  jobId: string;
  authorId: string;
  phase: TechnicianWorkPhase;
  note: string;
  createdAt: string;
}

/** File metadata for a technician voice note (never audio bytes). */
export interface TechnicianVoiceNoteDto {
  id: string;
  jobId: string;
  authorId: string;
  originalFilename: string | null;
  mimeType: string;
  size: number;
  /** Recorded length in seconds, when the client reported it. */
  durationSeconds: number | null;
  createdAt: string;
}

export type TechnicianExecutionEventKind = 'status' | 'assignment' | 'update' | 'image' | 'voice' | 'parts';

/**
 * One entry of the technician execution timeline (status transitions,
 * assignment events, progress notes, photos, voice notes).
 * `actor` is a role label only — never contact details.
 */
export interface TechnicianExecutionEventDto {
  kind: TechnicianExecutionEventKind;
  createdAt: string;
  /** 'technician' for work records, 'business' for management events. */
  actor: 'technician' | 'business';
  status?: InternalJobStatus;
  previousStatus?: InternalJobStatus | null;
  reason?: string | null;
  /** Assignment events only: who the job was assigned to. */
  technicianName?: string;
  phase?: TechnicianWorkPhase;
  note?: string;
  imageId?: string;
  voiceNoteId?: string;
  mimeType?: string;
  durationSeconds?: number | null;
  /** Parts events only: the request, its first item and its status. */
  partsRequestId?: string;
  partName?: string;
  quantity?: number;
  partsStatus?: PartsRequestStatus;
}

/** Technician execution timeline: the job plus chronological events. */
export interface TechnicianExecutionTimelineDto {
  job: InternalJobDto;
  events: TechnicianExecutionEventDto[];
}

/**
 * FixLink Stage 7E — technician parts requests.
 *
 * Reuses the existing `parts_requests` / `parts_request_items` tables
 * (migration 006) on the ONE shared job engine — no new tables were
 * created for this stage. A request is a header (`parts_requests`:
 * reason + PENDING status) with exactly one item in Stage 7E
 * (`parts_request_items`: part name, quantity, optional notes, optional
 * photo evidence). Multi-item requests are a documented future
 * extension the schema already supports.
 *
 * Business scoping is derived server-side from `jobs.business_id`
 * (the `parts_requests` table itself carries no business column); the
 * requesting technician is resolved from `requester_id` via the
 * business roster. Binary bytes are never stored in MySQL — a photo
 * is an opaque FileStorage key in `photo_reference` with metadata
 * columns, delivered only through authorized file endpoints.
 *
 * Status vocabulary reuses the table ENUM: PENDING, APPROVED,
 * REJECTED, NEEDS_INFO, CANCELLED. Stage 7E only ever creates
 * PENDING rows; APPROVED / REJECTED / NEEDS_INFO arrive with the
 * Stage 7F manager-approval workflow.
 */

/**
 * Lifecycle state of a parts request (mirrors the table ENUM;
 * PARTS_AVAILABLE arrives with migration 011, Stage 7F).
 *
 * State machine (all transitions server-side, see `business.store`):
 * PENDING → APPROVED → PARTS_AVAILABLE
 * PENDING → REJECTED | NEEDS_INFO
 * NEEDS_INFO → PENDING (technician responds) or → APPROVED / REJECTED /
 *   NEEDS_INFO (manager acts again)
 * REJECTED / CANCELLED / PARTS_AVAILABLE are terminal.
 */
export type PartsRequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'NEEDS_INFO'
  | 'CANCELLED'
  | 'PARTS_AVAILABLE';

/** Manager/technician decision on a parts request (a `job_approvals` row projection). */
export interface PartsApprovalDto {
  id: string;
  jobId: string;
  partsRequestId: string;
  /** Login user id that submitted the request (the technician). */
  requestedBy: string | null;
  /** Login user id that reviewed it (the owner/manager), or null for technician responses. */
  reviewedBy: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_INFO';
  comments: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

/** One requested part/material (a `parts_request_items` row projection). */
export interface PartsRequestItemDto {
  id: string;
  partName: string;
  quantity: number;
  notes: string | null;
  /** True when photo evidence was attached (bytes via the file endpoint). */
  hasPhoto: boolean;
  photoMime: string | null;
  createdAt: string;
}

/** The roster technician who submitted the request (contact info only). */
export interface PartsRequestRequesterSummary {
  technicianId: string;
  displayName: string;
}

/** A parts request with its items (a `parts_requests` row projection). */
export interface PartsRequestDto {
  id: string;
  jobId: string;
  businessId: string;
  requestedBy: PartsRequestRequesterSummary;
  status: PartsRequestStatus;
  reason: string;
  createdAt: string;
  updatedAt: string;
  items: PartsRequestItemDto[];
  /**
   * Stage 7F — latest manager decision (`parts_requests.reviewed_by` /
   * `reviewed_at` / `review_notes`; login user id only, never contact
   * details). Null until a manager first reviews the request.
   */
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  /**
   * Stage 7F — full decision history for this request (`job_approvals`
   * rows with `request_type = PARTS`, oldest first). Drives the manager
   * decision display and the timeline approval events; empty until the
   * first review or technician response.
   */
  approvals: PartsApprovalDto[];
}

/** Validated parts-request creation body (single item — see note above). */
export interface CreatePartsRequestInput {
  partName: string;
  quantity: number;
  reason: string;
  notes: string | null;
}
