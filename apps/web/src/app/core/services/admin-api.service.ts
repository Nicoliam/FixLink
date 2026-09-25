import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import type { ApiSuccess } from '../models/api.model';
import type {
  AdminAuditLog,
  AdminBusiness,
  AdminCertificate,
  AdminBusinessDetail,
  AdminCustomer,
  AdminCustomerDetail,
  AdminDashboard,
  AdminDispute,
  AdminJobDetail,
  AdminJob,
  AdminList,
  AdminListFilters,
  AdminProfessional,
  AdminProfessionalDetail,
  AdminReport,
  AdminReview,
  AdminService,
  AdminServiceCategory,
  AdminTechnician,
  AdminTechnicianDetail,
  AdminUser,
  AdminVerification,
  DecisionInput,
  DisputeUpdateInput,
  ReportStatusInput,
  ServiceMutation,
} from '../models/admin.model';

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly endpoint = `${this.baseUrl}/admin`;

  getDashboard(): Observable<AdminDashboard> {
    return this.data(this.http.get<ApiSuccess<AdminDashboard>>(`${this.endpoint}/dashboard`));
  }

  listUsers(filters: AdminListFilters = {}): Observable<AdminList<AdminUser>> {
    return this.data(this.http.get<ApiSuccess<AdminList<AdminUser>>>(`${this.endpoint}/users`, { params: this.params(filters) }));
  }

  getUser(id: string): Observable<AdminUser> {
    return this.data(this.http.get<ApiSuccess<AdminUser>>(`${this.endpoint}/users/${this.id(id)}`));
  }

  suspendUser(id: string): Observable<AdminUser> {
    return this.data(this.http.post<ApiSuccess<AdminUser>>(`${this.endpoint}/users/${this.id(id)}/suspend`, {}));
  }

  reactivateUser(id: string): Observable<AdminUser> {
    return this.data(this.http.post<ApiSuccess<AdminUser>>(`${this.endpoint}/users/${this.id(id)}/reactivate`, {}));
  }

  listCustomers(filters: AdminListFilters = {}): Observable<AdminList<AdminCustomer>> {
    return this.data(this.http.get<ApiSuccess<AdminList<AdminCustomer>>>(`${this.endpoint}/customers`, { params: this.params(filters) }));
  }

  getCustomer(id: string): Observable<AdminCustomerDetail> {
    return this.data(this.http.get<ApiSuccess<AdminCustomerDetail>>(`${this.endpoint}/customers/${this.id(id)}`));
  }

  listProfessionals(filters: AdminListFilters = {}): Observable<AdminList<AdminProfessional>> {
    return this.data(this.http.get<ApiSuccess<AdminList<AdminProfessional>>>(`${this.endpoint}/professionals`, { params: this.params(filters) }) );
  }

  getProfessional(id: string): Observable<AdminProfessionalDetail> {
    return this.data(this.http.get<ApiSuccess<AdminProfessionalDetail>>(`${this.endpoint}/professionals/${this.id(id)}`));
  }

  listBusinesses(filters: AdminListFilters = {}): Observable<AdminList<AdminBusiness>> {
    return this.data(this.http.get<ApiSuccess<AdminList<AdminBusiness>>>(`${this.endpoint}/businesses`, { params: this.params(filters) }));
  }

  getBusiness(id: string): Observable<AdminBusinessDetail> {
    return this.data(this.http.get<ApiSuccess<AdminBusinessDetail>>(`${this.endpoint}/businesses/${this.id(id)}`));
  }

  listTechnicians(filters: AdminListFilters = {}): Observable<AdminList<AdminTechnician>> {
    return this.data(this.http.get<ApiSuccess<AdminList<AdminTechnician>>>(`${this.endpoint}/technicians`, { params: this.params(filters) }));
  }

  getTechnician(id: string): Observable<AdminTechnicianDetail> {
    return this.data(this.http.get<ApiSuccess<AdminTechnicianDetail>>(`${this.endpoint}/technicians/${this.id(id)}`));
  }

  listServices(filters: AdminListFilters = {}): Observable<AdminList<AdminService>> {
    return this.data(this.http.get<ApiSuccess<AdminList<AdminService>>>(`${this.endpoint}/services`, { params: this.params(filters) }));
  }

  listServiceCategories(): Observable<AdminServiceCategory[]> {
    return this.data(this.http.get<ApiSuccess<AdminServiceCategory[]>>(`${this.endpoint}/services/categories`));
  }

  getService(id: string): Observable<AdminService> {
    return this.data(this.http.get<ApiSuccess<AdminService>>(`${this.endpoint}/services/${this.id(id)}`));
  }

  createService(payload: ServiceMutation): Observable<AdminService> {
    return this.data(this.http.post<ApiSuccess<AdminService>>(`${this.endpoint}/services`, payload));
  }

  updateService(id: string, payload: Partial<ServiceMutation>): Observable<AdminService> {
    return this.data(this.http.patch<ApiSuccess<AdminService>>(`${this.endpoint}/services/${this.id(id)}`, payload));
  }

  activateService(id: string, active: boolean): Observable<AdminService> {
    const action = active ? 'activate' : 'deactivate';
    return this.data(this.http.post<ApiSuccess<AdminService>>(`${this.endpoint}/services/${this.id(id)}/${action}`, {}));
  }

  listJobs(filters: AdminListFilters = {}): Observable<AdminList<AdminJob>> {
    return this.data(this.http.get<ApiSuccess<AdminList<AdminJob>>>(`${this.endpoint}/jobs`, { params: this.params(filters) }));
  }

  getJob(id: string): Observable<AdminJobDetail> {
    return this.data(this.http.get<ApiSuccess<AdminJobDetail>>(`${this.endpoint}/jobs/${this.id(id)}`));
  }

  listVerifications(filters: AdminListFilters = {}): Observable<AdminList<AdminVerification>> {
    return this.data(this.http.get<ApiSuccess<AdminList<AdminVerification>>>(`${this.endpoint}/verifications`, { params: this.params(filters) }));
  }

  getVerification(id: string): Observable<AdminVerification> {
    return this.data(this.http.get<ApiSuccess<AdminVerification>>(`${this.endpoint}/verifications/${this.id(id)}`));
  }

  getVerificationDocument(id: string): Observable<Blob> {
    return this.http.get(`${this.endpoint}/verifications/${this.id(id)}/document`, { responseType: 'blob' });
  }

  decideVerification(id: string, decision: 'approve' | 'reject' | 'request-info', input: DecisionInput = { notes: null }): Observable<AdminVerification> {
    return this.data(this.http.post<ApiSuccess<AdminVerification>>(`${this.endpoint}/verifications/${this.id(id)}/${decision}`, input));
  }

  listCertificates(filters: AdminListFilters = {}): Observable<AdminList<AdminCertificate>> {
    return this.data(this.http.get<ApiSuccess<AdminList<AdminCertificate>>>(`${this.endpoint}/certificates`, { params: this.params(filters) }));
  }

  getCertificate(id: string): Observable<AdminCertificate> {
    return this.data(this.http.get<ApiSuccess<AdminCertificate>>(`${this.endpoint}/certificates/${this.id(id)}`));
  }

  getCertificateDocument(id: string): Observable<Blob> {
    return this.http.get(`${this.endpoint}/certificates/${this.id(id)}/document`, { responseType: 'blob' });
  }

  decideCertificate(id: string, decision: 'approve' | 'reject' | 'request-info', input: DecisionInput = { notes: null }): Observable<AdminCertificate> {
    return this.data(this.http.post<ApiSuccess<AdminCertificate>>(`${this.endpoint}/certificates/${this.id(id)}/${decision}`, input));
  }

  listReviews(filters: AdminListFilters = {}): Observable<AdminList<AdminReview>> {
    return this.data(this.http.get<ApiSuccess<AdminList<AdminReview>>>(`${this.endpoint}/reviews`, { params: this.params(filters) }));
  }

  getReview(id: string): Observable<AdminReview> {
    return this.data(this.http.get<ApiSuccess<AdminReview>>(`${this.endpoint}/reviews/${this.id(id)}`));
  }

  listReports(filters: AdminListFilters = {}): Observable<AdminList<AdminReport>> {
    return this.data(this.http.get<ApiSuccess<AdminList<AdminReport>>>(`${this.endpoint}/reports`, { params: this.params(filters) }));
  }

  getReport(id: string): Observable<AdminReport> {
    return this.data(this.http.get<ApiSuccess<AdminReport>>(`${this.endpoint}/reports/${this.id(id)}`));
  }

  updateReport(id: string, input: ReportStatusInput): Observable<AdminReport> {
    return this.data(this.http.patch<ApiSuccess<AdminReport>>(`${this.endpoint}/reports/${this.id(id)}/status`, input));
  }

  listDisputes(filters: AdminListFilters = {}): Observable<AdminList<AdminDispute>> {
    return this.data(this.http.get<ApiSuccess<AdminList<AdminDispute>>>(`${this.endpoint}/disputes`, { params: this.params(filters) }));
  }

  getDispute(id: string): Observable<AdminDispute> {
    return this.data(this.http.get<ApiSuccess<AdminDispute>>(`${this.endpoint}/disputes/${this.id(id)}`));
  }

  updateDispute(id: string, input: DisputeUpdateInput): Observable<AdminDispute> {
    return this.data(this.http.patch<ApiSuccess<AdminDispute>>(`${this.endpoint}/disputes/${this.id(id)}`, input));
  }

  listAuditLogs(filters: AdminListFilters = {}): Observable<AdminList<AdminAuditLog>> {
    return this.data(this.http.get<ApiSuccess<AdminList<AdminAuditLog>>>(`${this.endpoint}/audit-logs`, { params: this.params(filters) }));
  }

  getAuditLog(id: string): Observable<AdminAuditLog> {
    return this.data(this.http.get<ApiSuccess<AdminAuditLog>>(`${this.endpoint}/audit-logs/${this.id(id)}`));
  }

  private data<T>(request: Observable<ApiSuccess<T>>): Observable<T> {
    return request.pipe(map((response) => response.data));
  }

  private id(id: string): string {
    return encodeURIComponent(id);
  }

  private params(filters: AdminListFilters): HttpParams {
    let params = new HttpParams();
    const set = (key: string, value: string | number | boolean | undefined | null): void => {
      if (value !== undefined && value !== null && String(value).trim() !== '') params = params.set(key, String(value));
    };
    set('search', filters.search?.trim());
    set('page', filters.page);
    set('pageSize', filters.pageSize);
    set('status', filters.status);
    set('role', filters.role);
    set('verificationStatus', filters.verificationStatus);
    set('businessId', filters.businessId);
    set('isActive', filters.isActive);
    set('categoryId', filters.categoryId);
    set('source', filters.source);
    set('from', filters.from);
    set('to', filters.to);
    set('customerId', filters.customerId);
    set('professionalId', filters.professionalId);
    set('type', filters.type);
    set('userId', filters.userId);
    set('rating', filters.rating);
    set('minRating', filters.minRating);
    set('maxRating', filters.maxRating);
    set('reportType', filters.reportType);
    set('actorId', filters.actorId);
    set('action', filters.action);
    set('entityType', filters.entityType);
    set('entityId', filters.entityId);
    return params;
  }
}
