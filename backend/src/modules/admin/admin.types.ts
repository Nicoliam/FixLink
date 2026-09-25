export type AdminUserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DELETED';
export type VerificationType = 'IDENTITY' | 'CERTIFICATE' | 'BUSINESS';
export type VerificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_INFO';
export type CertificateStatus = VerificationStatus;
export type ReportType = 'PROVIDER' | 'REVIEW' | 'JOB' | 'USER' | 'CONTENT';
export type ReportStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED';
export type DisputeStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'CLOSED';

export interface AdminList<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminUserDto {
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

export interface AdminCustomerDto {
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

export interface AdminProviderDto {
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

export interface AdminBusinessDto {
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

export interface AdminTechnicianDto {
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

export interface AdminServiceCategoryDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface AdminServiceDto {
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

export interface AdminJobDto {
  id: string;
  reference: string;
  source: 'MARKETPLACE' | 'INTERNAL';
  status: string;
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

export interface AdminSafeUserSummaryDto {
  id: string;
  email: string;
  phone: string | null;
  status: AdminUserStatus;
  roles: string[];
  lastLoginAt: string | null;
}

export interface AdminServiceTagDto { id: string; name: string; slug: string; categoryId: string; categoryName: string; }
export interface AdminServiceAreaDto { areaName: string; city: string | null; province: string | null; }
export interface AdminPortfolioMetadataDto { id: string; title: string; description: string | null; serviceId: string | null; serviceName: string | null; isPublished: boolean; imageCount: number; createdAt: string; }
export interface AdminIdentityStateDto { id: string; status: VerificationStatus; reviewedAt: string | null; }
export interface AdminProfessionalDetailDto extends AdminProviderDto {
  services: AdminServiceTagDto[];
  serviceAreas: AdminServiceAreaDto[];
  portfolio: AdminPortfolioMetadataDto[];
  certificates: AdminCertificateDto[];
  identityVerification: AdminIdentityStateDto | null;
  reviews: AdminReviewDto[];
  summary: { serviceCount: number; portfolioCount: number; certificateCount: number; reviewCount: number; ratingAvg: number };
}
export interface AdminBusinessMemberDto { userId: string; role: 'BUSINESS_OWNER' | 'BUSINESS_MANAGER' | 'TECHNICIAN'; isActive: boolean; invitedAt: string | null; joinedAt: string | null; }
export interface AdminBusinessJobDto extends AdminJobDto { customerName: string; }
export interface AdminBusinessDetailDto extends AdminBusinessDto {
  owner: AdminSafeUserSummaryDto;
  members: AdminBusinessMemberDto[];
  technicians: AdminTechnicianDto[];
  jobs: AdminBusinessJobDto[];
  summary: { memberCount: number; technicianCount: number; jobCount: number; activeJobCount: number };
}
export interface AdminTechnicianJobDto extends AdminJobDto { customerName: string; businessName: string; }
export interface AdminAssignmentDto { id: string; assignmentType: 'PROFESSIONAL' | 'BUSINESS' | 'TECHNICIAN'; professionalId: string | null; businessId: string | null; technicianId: string | null; technicianName: string | null; assignedBy: string | null; assignedAt: string; unassignedAt: string | null; isActive: boolean; }
export interface AdminTechnicianDetailDto extends AdminTechnicianDto { business: Pick<AdminBusinessDto, 'id' | 'name' | 'city' | 'province'>; assignedJobCount: number; jobs: AdminTechnicianJobDto[]; assignments: AdminAssignmentDto[]; }
export interface AdminCustomerJobDto extends AdminJobDto { providerName: string; serviceName: string; }
export interface AdminCustomerDetailDto extends AdminCustomerDto { jobs: AdminCustomerJobDto[]; reviews: AdminReviewDto[]; summary: { jobCount: number; activeJobCount: number; reviewCount: number; ratingAvg: number }; }
export interface AdminTimelineEntryDto { previousStatus: string | null; status: string; reason: string | null; createdAt: string; }
export interface AdminQuoteItemDto { id: string; description: string; quantity: number; unitPrice: number; total: number; sortOrder: number; }
export interface AdminQuoteDto { id: string; professionalId: string | null; businessId: string | null; providerName: string | null; total: number; currency: string; message: string | null; status: string; submittedAt: string | null; createdAt: string; items: AdminQuoteItemDto[]; }
export interface AdminJobImageMetadataDto { id: string; uploadedBy: string | null; phase: string; originalFilename: string | null; mimeType: string | null; size: number | null; createdAt: string; }
export interface AdminJobUpdateDto { id: string; authorId: string | null; phase: string | null; note: string; createdAt: string; }
export interface AdminVoiceNoteMetadataDto { id: string; authorId: string | null; originalFilename: string | null; mimeType: string | null; size: number | null; durationSeconds: number | null; createdAt: string; }
export interface AdminPartItemMetadataDto { id: string; partName: string; quantity: number; notes: string | null; hasPhoto: boolean; createdAt: string; }
export interface AdminPartsRequestDto { id: string; requesterId: string | null; status: string; reason: string; reviewNotes: string | null; reviewedAt: string | null; createdAt: string; updatedAt: string; items: AdminPartItemMetadataDto[]; }
export interface AdminJobDocumentationDto { images: AdminJobImageMetadataDto[]; updates: AdminJobUpdateDto[]; voiceNotes: AdminVoiceNoteMetadataDto[]; partsRequests: AdminPartsRequestDto[]; }
export interface AdminJobDetailDto extends AdminJobDto { timeline: AdminTimelineEntryDto[]; quotes: AdminQuoteDto[]; assignments: AdminAssignmentDto[]; documentation: AdminJobDocumentationDto; }

export interface AdminVerificationDto {
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

export interface AdminCertificateDto {
  id: string;
  professionalId: string | null;
  businessId: string | null;
  ownerType: 'PROFESSIONAL' | 'BUSINESS';
  title: string;
  issuingOrganisation: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  verificationStatus: CertificateStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminReviewDto {
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

export interface AdminReportDto {
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

export interface AdminDisputeDto {
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

export interface AdminAuditLogDto {
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

export interface AdminDashboardDto {
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

export interface AdminUserFilters {
  search: string | null;
  status: AdminUserStatus | null;
  role: string | null;
  page: number;
  pageSize: number;
}
export interface AdminTextFilters { search: string | null; page: number; pageSize: number; }
export interface AdminProviderFilters extends AdminTextFilters { status: string | null; }
export interface AdminBusinessFilters extends AdminTextFilters { status: string | null; }
export interface AdminTechnicianFilters extends AdminTextFilters { businessId: string | null; isActive: boolean | null; }
export interface AdminServiceFilters extends AdminTextFilters { categoryId: string | null; isActive: boolean | null; }
export interface AdminJobFilters extends AdminTextFilters {
  source: 'MARKETPLACE' | 'INTERNAL' | null;
  status: string | null;
  from: string | null;
  to: string | null;
  customerId: string | null;
  professionalId: string | null;
  businessId: string | null;
}
export interface AdminVerificationFilters extends AdminTextFilters { type: VerificationType | null; status: VerificationStatus | null; userId: string | null; }
export interface AdminCertificateFilters extends AdminTextFilters { status: CertificateStatus | null; professionalId: string | null; businessId: string | null; }
export interface AdminReviewFilters extends AdminTextFilters { rating: number | null; minRating: number | null; maxRating: number | null; }
export interface AdminReportFilters extends AdminTextFilters { type: ReportType | null; status: ReportStatus | null; }
export interface AdminDisputeFilters extends AdminTextFilters { status: DisputeStatus | null; }
export interface AdminAuditFilters extends AdminTextFilters { actorId: string | null; action: string | null; entityType: string | null; entityId: string | null; from: string | null; to: string | null; }

export interface ServiceMutationInput { categoryId: string; name: string; slug: string; description: string | null; sortOrder: number; isActive: boolean; }
export interface VerificationDecisionInput { notes: string | null; }
export interface CertificateDecisionInput { notes: string | null; }
export interface ReportStatusInput { status: ReportStatus; }
export interface DisputeUpdateInput { status: DisputeStatus; resolution: string | null; }
