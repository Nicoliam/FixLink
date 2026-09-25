export type AdminResource =
  | 'users'
  | 'customers'
  | 'professionals'
  | 'businesses'
  | 'technicians'
  | 'services'
  | 'jobs'
  | 'verifications'
  | 'certificates'
  | 'reviews'
  | 'reports'
  | 'disputes'
  | 'audit-logs';

export type AdminUserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DELETED';
export type AdminJobStatus =
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
export type VerificationType = 'IDENTITY' | 'CERTIFICATE' | 'BUSINESS';
export type VerificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_INFO';
export type ReportType = 'PROVIDER' | 'REVIEW' | 'JOB' | 'USER' | 'CONTENT';
export type ReportStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED';
export type DisputeStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'CLOSED';

export interface AdminList<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminUser {
  id: string;
  email: string;
  phone: string | null;
  status: AdminUserStatus;
  roles: string[];
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface AdminCustomer {
  id: string;
  userId: string | null;
  businessId: string | null;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  preferredContact: 'EMAIL' | 'PHONE' | 'WHATSAPP' | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProfessional {
  id: string;
  userId: string;
  name: string;
  bio: string | null;
  experienceYears: number | null;
  verificationStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  ratingAvg: number;
  ratingCount: number;
  isActive: boolean;
  city: string | null;
  province: string | null;
  serviceCount: number;
  portfolioCount: number;
  certificateCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminBusiness {
  id: string;
  ownerUserId: string;
  name: string;
  description: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  verificationStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  ratingAvg: number;
  ratingCount: number;
  isActive: boolean;
  technicianCount: number;
  serviceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminTechnician {
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

export interface AdminServiceCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface AdminService {
  id: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminJob {
  id: string;
  reference: string;
  source: 'MARKETPLACE' | 'INTERNAL';
  status: AdminJobStatus;
  customerId: string;
  professionalId: string | null;
  businessId: string | null;
  serviceId: string | null;
  title: string | null;
  description: string;
  city: string | null;
  province: string | null;
  scheduledAt: string | null;
  agreedAmount: number | null;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSafeUserSummary {
  id: string;
  email: string;
  phone: string | null;
  status: AdminUserStatus;
  roles: string[];
  lastLoginAt: string | null;
}

export interface AdminServiceTag {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  categoryName: string;
}

export interface AdminServiceArea {
  areaName: string;
  city: string | null;
  province: string | null;
}

export interface AdminPortfolioMetadata {
  id: string;
  title: string;
  description: string | null;
  serviceId: string | null;
  serviceName: string | null;
  isPublished: boolean;
  imageCount: number;
  createdAt: string;
}

export interface AdminIdentityState {
  id: string;
  status: VerificationStatus;
  reviewedAt: string | null;
}

export interface AdminProfessionalDetail extends AdminProfessional {
  services: AdminServiceTag[];
  serviceAreas: AdminServiceArea[];
  portfolio: AdminPortfolioMetadata[];
  certificates: AdminCertificate[];
  identityVerification: AdminIdentityState | null;
  reviews: AdminReview[];
  summary: { serviceCount: number; portfolioCount: number; certificateCount: number; reviewCount: number; ratingAvg: number };
}

export interface AdminBusinessMember {
  userId: string;
  role: 'BUSINESS_OWNER' | 'BUSINESS_MANAGER' | 'TECHNICIAN';
  isActive: boolean;
  invitedAt: string | null;
  joinedAt: string | null;
}

export interface AdminBusinessJob extends AdminJob {
  customerName: string;
}

export interface AdminBusinessDetail extends AdminBusiness {
  owner: AdminSafeUserSummary;
  members: AdminBusinessMember[];
  technicians: AdminTechnician[];
  jobs: AdminBusinessJob[];
  summary: { memberCount: number; technicianCount: number; jobCount: number; activeJobCount: number };
}

export interface AdminTechnicianJob extends AdminJob {
  customerName: string;
  businessName: string;
}

export interface AdminAssignment {
  id: string;
  assignmentType: 'PROFESSIONAL' | 'BUSINESS' | 'TECHNICIAN';
  professionalId: string | null;
  businessId: string | null;
  technicianId: string | null;
  technicianName: string | null;
  assignedBy: string | null;
  assignedAt: string;
  unassignedAt: string | null;
  isActive: boolean;
}

export interface AdminTechnicianDetail extends AdminTechnician {
  business: Pick<AdminBusiness, 'id' | 'name' | 'city' | 'province'>;
  assignedJobCount: number;
  jobs: AdminTechnicianJob[];
  assignments: AdminAssignment[];
}

export interface AdminCustomerJob extends AdminJob {
  providerName: string;
  serviceName: string;
}

export interface AdminCustomerDetail extends AdminCustomer {
  jobs: AdminCustomerJob[];
  reviews: AdminReview[];
  summary: { jobCount: number; activeJobCount: number; reviewCount: number; ratingAvg: number };
}

export interface AdminTimelineEntry {
  previousStatus: string | null;
  status: string;
  reason: string | null;
  createdAt: string;
}

export interface AdminQuoteItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  sortOrder: number;
}

export interface AdminQuote {
  id: string;
  professionalId: string | null;
  businessId: string | null;
  providerName: string | null;
  total: number;
  currency: string;
  message: string | null;
  status: string;
  submittedAt: string | null;
  createdAt: string;
  items: AdminQuoteItem[];
}

export interface AdminJobImageMetadata {
  id: string;
  uploadedBy: string | null;
  phase: string;
  originalFilename: string | null;
  mimeType: string | null;
  size: number | null;
  createdAt: string;
}

export interface AdminJobUpdate {
  id: string;
  authorId: string | null;
  phase: string | null;
  note: string;
  createdAt: string;
}

export interface AdminVoiceNoteMetadata {
  id: string;
  authorId: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  size: number | null;
  durationSeconds: number | null;
  createdAt: string;
}

export interface AdminPartItemMetadata {
  id: string;
  partName: string;
  quantity: number;
  notes: string | null;
  hasPhoto: boolean;
  createdAt: string;
}

export interface AdminPartsRequest {
  id: string;
  requesterId: string | null;
  status: string;
  reason: string;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: AdminPartItemMetadata[];
}

export interface AdminJobDocumentation {
  images: AdminJobImageMetadata[];
  updates: AdminJobUpdate[];
  voiceNotes: AdminVoiceNoteMetadata[];
  partsRequests: AdminPartsRequest[];
}

export interface AdminJobDetail extends AdminJob {
  timeline: AdminTimelineEntry[];
  quotes: AdminQuote[];
  assignments: AdminAssignment[];
  documentation: AdminJobDocumentation;
}

export interface AdminVerification {
  id: string;
  userId: string;
  userEmail: string;
  type: VerificationType;
  status: VerificationStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCertificate {
  id: string;
  professionalId: string | null;
  businessId: string | null;
  ownerType: 'PROFESSIONAL' | 'BUSINESS';
  title: string;
  issuingOrganisation: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  verificationStatus: VerificationStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminReview {
  id: string;
  jobId: string;
  customerId: string;
  professionalId: string | null;
  businessId: string | null;
  customerName: string;
  providerName: string | null;
  rating: number;
  comment: string | null;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminReport {
  id: string;
  reporterId: string | null;
  reportType: ReportType;
  entityType: string | null;
  entityId: string | null;
  reason: string;
  description: string | null;
  status: ReportStatus;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminDispute {
  id: string;
  jobId: string;
  openedBy: string | null;
  reason: string;
  description: string | null;
  status: DisputeStatus;
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAuditLog {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

export interface AdminDashboard {
  users: { total: number; active: number; pending: number; suspended: number };
  customers: number;
  professionals: { total: number; verified: number; pending: number };
  businesses: { total: number; verified: number; pending: number };
  technicians: { total: number; active: number };
  services: { total: number; active: number; inactive: number };
  jobs: { total: number; open: number; inProgress: number; completed: number };
  verification: { pending: number; needsInfo: number };
  certificates: { pending: number; needsInfo: number };
  reports: { open: number; inReview: number };
  disputes: { open: number; inReview: number };
}

export interface AdminListFilters {
  search?: string;
  page?: number;
  pageSize?: number;
  status?: string;
  role?: string;
  verificationStatus?: string;
  businessId?: string;
  isActive?: boolean;
  categoryId?: string;
  source?: 'MARKETPLACE' | 'INTERNAL';
  from?: string;
  to?: string;
  customerId?: string;
  professionalId?: string;
  type?: string;
  userId?: string;
  rating?: number;
  minRating?: number;
  maxRating?: number;
  reportType?: ReportType;
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
}

export interface ServiceMutation {
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface DecisionInput {
  notes: string | null;
}

export interface ReportStatusInput {
  status: ReportStatus;
}

export interface DisputeUpdateInput {
  status: DisputeStatus;
  resolution: string | null;
}

export type AdminListItem =
  | AdminUser
  | AdminCustomer
  | AdminProfessional
  | AdminBusiness
  | AdminTechnician
  | AdminService
  | AdminJob
  | AdminCustomerDetail
  | AdminProfessionalDetail
  | AdminBusinessDetail
  | AdminTechnicianDetail
  | AdminJobDetail
  | AdminVerification
  | AdminCertificate
  | AdminReview
  | AdminReport
  | AdminDispute
  | AdminAuditLog;
