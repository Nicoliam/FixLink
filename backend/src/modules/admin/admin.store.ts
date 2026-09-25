import type { UserStatus } from '../users/user.repository';
import type {
  AdminAuditFilters,
  AdminAuditLogDto,
  AdminBusinessDto,
  AdminBusinessDetailDto,
  AdminBusinessFilters,
  AdminCertificateDto,
  AdminCertificateFilters,
  AdminCustomerDto,
  AdminCustomerDetailDto,
  AdminDashboardDto,
  AdminDisputeDto,
  AdminDisputeFilters,
  AdminJobDto,
  AdminJobDetailDto,
  AdminJobFilters,
  AdminList,
  AdminProviderDto,
  AdminProfessionalDetailDto,
  AdminProviderFilters,
  AdminReportDto,
  AdminReportFilters,
  AdminReviewDto,
  AdminReviewFilters,
  AdminServiceCategoryDto,
  AdminServiceDto,
  AdminServiceFilters,
  AdminTechnicianDto,
  AdminTechnicianDetailDto,
  AdminTechnicianFilters,
  AdminUserFilters,
  AdminVerificationDto,
  AdminVerificationFilters,
  CertificateDecisionInput,
  DisputeUpdateInput,
  ReportStatusInput,
  DisputeStatus,
  ReportStatus,
  ServiceMutationInput,
  VerificationDecisionInput,
} from './admin.types';

export class AdminStoreError extends Error {
  constructor(public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL', message: string) {
    super(message);
    this.name = 'AdminStoreError';
  }
}

export interface AdminDocumentReference {
  storageKey: string;
  mimeType: string;
  filename: string;
}

export interface AdminStore {
  dashboard(): Promise<AdminDashboardDto>;
  listCustomers(filters: AdminListQuery): Promise<AdminList<AdminCustomerDto>>;
  getCustomer(id: string): Promise<AdminCustomerDetailDto | null>;
  listProfessionals(filters: AdminProviderFilters): Promise<AdminList<AdminProviderDto>>;
  getProfessional(id: string): Promise<AdminProfessionalDetailDto | null>;
  listBusinesses(filters: AdminBusinessFilters): Promise<AdminList<AdminBusinessDto>>;
  getBusiness(id: string): Promise<AdminBusinessDetailDto | null>;
  listTechnicians(filters: AdminTechnicianFilters): Promise<AdminList<AdminTechnicianDto>>;
  getTechnician(id: string): Promise<AdminTechnicianDetailDto | null>;
  listServiceCategories(): Promise<AdminServiceCategoryDto[]>;
  listServices(filters: AdminServiceFilters): Promise<AdminList<AdminServiceDto>>;
  getService(id: string): Promise<AdminServiceDto | null>;
  createService(input: ServiceMutationInput, actorId: string): Promise<AdminServiceDto>;
  updateService(id: string, input: Partial<ServiceMutationInput>, actorId: string): Promise<AdminServiceDto | null>;
  setUserStatus(id: string, expectedStatus: UserStatus, nextStatus: UserStatus, actorId: string): Promise<boolean>;
  listJobs(filters: AdminJobFilters): Promise<AdminList<AdminJobDto>>;
  getJob(id: string): Promise<AdminJobDetailDto | null>;
  listVerifications(filters: AdminVerificationFilters): Promise<AdminList<AdminVerificationDto>>;
  getVerification(id: string): Promise<AdminVerificationDto | null>;
  getVerificationDocument(id: string): Promise<AdminDocumentReference | null>;
  decideVerification(id: string, decision: 'APPROVED' | 'REJECTED' | 'NEEDS_INFO', input: VerificationDecisionInput, actorId: string): Promise<AdminVerificationDto | null>;
  listCertificates(filters: AdminCertificateFilters): Promise<AdminList<AdminCertificateDto>>;
  getCertificate(id: string): Promise<AdminCertificateDto | null>;
  getCertificateDocument(id: string): Promise<AdminDocumentReference | null>;
  decideCertificate(id: string, decision: 'APPROVED' | 'REJECTED' | 'NEEDS_INFO', input: CertificateDecisionInput, actorId: string): Promise<AdminCertificateDto | null>;
  listReviews(filters: AdminReviewFilters): Promise<AdminList<AdminReviewDto>>;
  getReview(id: string): Promise<AdminReviewDto | null>;
  listReports(filters: AdminReportFilters): Promise<AdminList<AdminReportDto>>;
  getReport(id: string): Promise<AdminReportDto | null>;
  updateReportStatus(id: string, expectedStatus: ReportStatus, input: ReportStatusInput, actorId: string): Promise<AdminReportDto | null>;
  listDisputes(filters: AdminDisputeFilters): Promise<AdminList<AdminDisputeDto>>;
  getDispute(id: string): Promise<AdminDisputeDto | null>;
  updateDispute(id: string, expectedStatus: DisputeStatus, input: DisputeUpdateInput, actorId: string): Promise<AdminDisputeDto | null>;
  listAuditLogs(filters: AdminAuditFilters): Promise<AdminList<AdminAuditLogDto>>;
  getAuditLog(id: string): Promise<AdminAuditLogDto | null>;
  appendAudit(action: string, entityType: string, entityId: string, actorId: string, metadata?: Record<string, unknown>): Promise<void>;
}
type AdminListQuery = { search: string | null; page: number; pageSize: number };
