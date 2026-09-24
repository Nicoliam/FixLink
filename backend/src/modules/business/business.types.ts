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

export type TechnicianExecutionEventKind = 'status' | 'assignment' | 'update' | 'image' | 'voice';

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
}

/** Technician execution timeline: the job plus chronological events. */
export interface TechnicianExecutionTimelineDto {
  job: InternalJobDto;
  events: TechnicianExecutionEventDto[];
}
