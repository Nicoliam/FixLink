/**
 * Business foundation contracts for Stage 7A.
 *
 * These mirror the backend behaviour documented in docs/API.md
 * section 8.1. The business is derived server-side from the
 * authenticated membership — the client never sends a business_id.
 */

export type BusinessMembershipRole = 'OWNER' | 'MANAGER';

/** Business profile returned by GET/PATCH /api/v1/business/me. */
export interface Business {
  id: string;
  businessName: string;
  slug: string;
  description: string | null;
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
  /** The caller's own membership role (server-derived). */
  role: BusinessMembershipRole;
  technicianCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Technician roster row returned by the /business/technicians endpoints. */
export interface Technician {
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

export interface TechnicianList {
  items: Technician[];
  total: number;
}

export interface CreateTechnicianRequest {
  displayName: string;
  email: string;
  phone?: string;
  password?: string;
}

export interface UpdateTechnicianRequest {
  displayName?: string;
  isActive?: boolean;
}

export interface UpdateBusinessRequest {
  businessName?: string;
  description?: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  city?: string;
  province?: string;
  postalCode?: string;
}

/** Human-readable membership role for the dashboard. */
export function businessRoleLabel(role: BusinessMembershipRole): string {
  return role === 'OWNER' ? 'Owner' : 'Manager';
}

/** Human-readable verification state (badge text only — never a document). */
export function verificationLabel(status: string): string {
  switch (status) {
    case 'VERIFIED':
      return 'Verified';
    case 'PENDING':
      return 'Verification pending';
    case 'REJECTED':
      return 'Verification rejected';
    default:
      return 'Unverified';
  }
}

/**
 * Business-managed customer contracts for Stage 7B.
 *
 * Mirrors GET/POST/PATCH /api/v1/business/customers. Customers are
 * private to the business; the owning business is derived server-side
 * and never sent by the client.
 */

export type BusinessCustomerContact = 'EMAIL' | 'PHONE' | 'WHATSAPP';

/** Business-managed customer returned by the /business/customers endpoints. */
export interface BusinessCustomer {
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

export interface BusinessCustomerList {
  items: BusinessCustomer[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateBusinessCustomerRequest {
  firstName?: string;
  lastName?: string;
  /** Free-text fallback split server-side into first/last names. */
  name?: string;
  email?: string;
  phone?: string;
  preferredContact?: BusinessCustomerContact;
}

export interface UpdateBusinessCustomerRequest {
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  preferredContact?: BusinessCustomerContact | null;
}

/**
 * Internal business job contracts for Stage 7B.
 *
 * Mirrors /api/v1/business/jobs. Internal jobs reuse the shared jobs
 * table with `source = INTERNAL`; status transitions stay
 * server-controlled (the client never sends a status).
 */

export type BusinessJobPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type BusinessJobStatus =
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

export interface BusinessJobCustomerSummary {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string | null;
  phone: string | null;
}

export interface BusinessJobServiceSummary {
  id: string;
  name: string;
  slug: string;
}

export interface BusinessJobBusinessSummary {
  id: string;
  businessName: string;
}

export interface BusinessJobTimelineEntry {
  previousStatus: BusinessJobStatus | null;
  status: BusinessJobStatus;
  reason: string | null;
  createdAt: string;
}

/** Internal job returned by the /business/jobs endpoints. */
export interface BusinessJob {
  id: string;
  reference: string;
  source: 'INTERNAL';
  status: BusinessJobStatus;
  businessId: string;
  business: BusinessJobBusinessSummary;
  customerId: string;
  customer: BusinessJobCustomerSummary;
  service: BusinessJobServiceSummary;
  title: string | null;
  description: string;
  addressLine1: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  priority: BusinessJobPriority;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Internal job detail: the job plus its status-history timeline. */
export interface BusinessJobDetail {
  job: BusinessJob;
  timeline: BusinessJobTimelineEntry[];
}

export interface BusinessJobList {
  items: BusinessJob[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BusinessJobListParams {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateBusinessJobRequest {
  customerId: string;
  serviceId: string;
  title?: string;
  description: string;
  address?: string;
  addressLine1?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  priority?: BusinessJobPriority;
  /** ISO date/time for the scheduled visit. */
  scheduledAt?: string;
}

export interface UpdateBusinessJobRequest {
  title?: string | null;
  description?: string;
  addressLine1?: string;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  priority?: BusinessJobPriority;
  scheduledAt?: string | null;
}

/** Real-data INTERNAL job counts for the business dashboard. */
export interface BusinessJobsSummary {
  total: number;
  requested: number;
  scheduled: number;
  inProgress: number;
  completed: number;
  cancelled: number;
}

/**
 * Technician assignment contracts for Stage 7C.
 *
 * Mirrors POST/GET /api/v1/business/jobs/:id/assign(ment).
 * Assignments reuse the shared `job_assignments` table; job status is
 * never changed by assignment (there is no ASSIGNED status).
 */

/** Technician embedded in an assignment response (contact info only). */
export interface JobAssignmentTechnician {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
}

/** Active technician assignment for one internal job. */
export interface JobAssignment {
  id: string;
  jobId: string;
  businessId: string;
  technician: JobAssignmentTechnician;
  assignedBy: string | null;
  assignedAt: string;
}

/** One assignment history entry (active rows have `unassignedAt = null`). */
export interface JobAssignmentHistoryEntry {
  id: string;
  technician: JobAssignmentTechnician;
  assignedBy: string | null;
  assignedAt: string;
  unassignedAt: string | null;
  isActive: boolean;
}

/** Assignment detail: active assignment plus full history. */
export interface JobAssignmentDetail {
  jobId: string;
  assignment: JobAssignment | null;
  history: JobAssignmentHistoryEntry[];
}

export interface AssignTechnicianRequest {
  technicianId: string;
}

/** Human-readable internal job status for badges and headings. */
export function businessJobStatusLabel(status: BusinessJobStatus): string {
  switch (status) {
    case 'REQUESTED':
      return 'Requested';
    case 'QUOTED':
      return 'Quoted';
    case 'ACCEPTED':
      return 'Accepted';
    case 'SCHEDULED':
      return 'Scheduled';
    case 'IN_PROGRESS':
      return 'In progress';
    case 'AWAITING_PARTS':
      return 'Awaiting parts';
    case 'COMPLETED':
      return 'Completed';
    case 'CONFIRMED':
      return 'Confirmed';
    case 'CLOSED':
      return 'Closed';
    case 'CANCELLED':
      return 'Cancelled';
    case 'DISPUTED':
      return 'Disputed';
    default:
      return status;
  }
}

/** Human-readable priority for badges. */
export function businessJobPriorityLabel(priority: BusinessJobPriority): string {
  switch (priority) {
    case 'LOW':
      return 'Low';
    case 'NORMAL':
      return 'Normal';
    case 'HIGH':
      return 'High';
    case 'URGENT':
      return 'Urgent';
    default:
      return priority;
  }
}
