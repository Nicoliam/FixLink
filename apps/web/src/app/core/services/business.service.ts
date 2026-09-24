import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import type { ApiSuccess } from '../models/api.model';
import type {
  AssignTechnicianRequest,
  Business,
  BusinessCustomer,
  BusinessCustomerList,
  BusinessJob,
  BusinessJobDetail,
  BusinessJobList,
  BusinessJobListParams,
  BusinessJobsSummary,
  CreateBusinessCustomerRequest,
  CreateBusinessJobRequest,
  CreateTechnicianRequest,
  JobAssignment,
  JobAssignmentDetail,
  Technician,
  TechnicianList,
  UpdateBusinessCustomerRequest,
  UpdateBusinessJobRequest,
  UpdateBusinessRequest,
  UpdateTechnicianRequest,
} from '../models/business.model';

/**
 * FixLink business API client — Stage 7A (business foundation +
 * technician management) + Stage 7B (business-managed customers and
 * internal jobs) + Stage 7C (technician assignment).
 *
 * Single owner of business calls. All endpoints require authentication
 * (the interceptor attaches the Bearer token); the business is derived
 * by the backend from the session membership, never from these payloads.
 * Technician execution, parts and approvals arrive in later stages.
 */
@Injectable({ providedIn: 'root' })
export class BusinessService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  /** Retrieve the authenticated user's business profile. */
  getMyBusiness(): Observable<Business> {
    return this.http
      .get<ApiSuccess<Business>>(`${this.baseUrl}/business/me`)
      .pipe(map((res) => res.data));
  }

  /** Update the business profile (owner only — the backend enforces it). */
  updateBusiness(payload: UpdateBusinessRequest): Observable<Business> {
    const body: Record<string, string> = {};
    if (payload.businessName?.trim()) body['businessName'] = payload.businessName.trim();
    if (payload.description?.trim()) body['description'] = payload.description.trim();
    if (payload.email?.trim()) body['email'] = payload.email.trim();
    if (payload.phone?.trim()) body['phone'] = payload.phone.trim();
    if (payload.addressLine1?.trim()) body['addressLine1'] = payload.addressLine1.trim();
    if (payload.city?.trim()) body['city'] = payload.city.trim();
    if (payload.province?.trim()) body['province'] = payload.province.trim();
    if (payload.postalCode?.trim()) body['postalCode'] = payload.postalCode.trim();
    return this.http
      .patch<ApiSuccess<Business>>(`${this.baseUrl}/business/me`, body)
      .pipe(map((res) => res.data));
  }

  /** List technicians belonging to the authenticated user's business. */
  listTechnicians(): Observable<TechnicianList> {
    return this.http
      .get<ApiSuccess<TechnicianList>>(`${this.baseUrl}/business/technicians`)
      .pipe(map((res) => res.data));
  }

  /** Retrieve one roster row (owner/manager, or the technician's own row). */
  getTechnician(id: string): Observable<Technician> {
    return this.http
      .get<ApiSuccess<Technician>>(`${this.baseUrl}/business/technicians/${encodeURIComponent(id)}`)
      .pipe(map((res) => res.data));
  }

  /** Invite a technician into the authenticated user's business. */
  createTechnician(payload: CreateTechnicianRequest): Observable<Technician> {
    const body: Record<string, string> = {
      displayName: payload.displayName.trim(),
      email: payload.email.trim(),
    };
    if (payload.phone?.trim()) body['phone'] = payload.phone.trim();
    if (payload.password) body['password'] = payload.password;
    return this.http
      .post<ApiSuccess<Technician>>(`${this.baseUrl}/business/technicians`, body)
      .pipe(map((res) => res.data));
  }

  /** Rename a technician or change their active status (owner/manager). */
  updateTechnician(id: string, payload: UpdateTechnicianRequest): Observable<Technician> {
    const body: Record<string, string | boolean> = {};
    if (payload.displayName?.trim()) body['displayName'] = payload.displayName.trim();
    if (payload.isActive !== undefined) body['isActive'] = payload.isActive;
    return this.http
      .patch<ApiSuccess<Technician>>(`${this.baseUrl}/business/technicians/${encodeURIComponent(id)}`, body)
      .pipe(map((res) => res.data));
  }

  /** List customers belonging to the authenticated user's business. */
  listBusinessCustomers(params: BusinessJobListParams = {}): Observable<BusinessCustomerList> {
    let httpParams = new HttpParams();
    if (params.search?.trim()) httpParams = httpParams.set('search', params.search.trim());
    if (params.page) httpParams = httpParams.set('page', String(params.page));
    if (params.pageSize) httpParams = httpParams.set('pageSize', String(params.pageSize));
    return this.http
      .get<ApiSuccess<BusinessCustomerList>>(`${this.baseUrl}/business/customers`, { params: httpParams })
      .pipe(map((res) => res.data));
  }

  /** Retrieve one business-managed customer. */
  getBusinessCustomer(id: string): Observable<BusinessCustomer> {
    return this.http
      .get<ApiSuccess<BusinessCustomer>>(`${this.baseUrl}/business/customers/${encodeURIComponent(id)}`)
      .pipe(map((res) => res.data));
  }

  /** Create a business-managed customer (no login — private to the business). */
  createBusinessCustomer(payload: CreateBusinessCustomerRequest): Observable<BusinessCustomer> {
    const body: Record<string, string> = {};
    if (payload.firstName?.trim()) body['firstName'] = payload.firstName.trim();
    if (payload.lastName?.trim()) body['lastName'] = payload.lastName.trim();
    if (payload.name?.trim()) body['name'] = payload.name.trim();
    if (payload.email?.trim()) body['email'] = payload.email.trim();
    if (payload.phone?.trim()) body['phone'] = payload.phone.trim();
    if (payload.preferredContact) body['preferredContact'] = payload.preferredContact;
    return this.http
      .post<ApiSuccess<BusinessCustomer>>(`${this.baseUrl}/business/customers`, body)
      .pipe(map((res) => res.data));
  }

  /** Update a business-managed customer. */
  updateBusinessCustomer(id: string, payload: UpdateBusinessCustomerRequest): Observable<BusinessCustomer> {
    const body: Record<string, string | null> = {};
    if (payload.firstName?.trim()) body['firstName'] = payload.firstName.trim();
    if (payload.lastName?.trim()) body['lastName'] = payload.lastName.trim();
    if (payload.email !== undefined) body['email'] = payload.email?.trim() ? (payload.email as string).trim() : null;
    if (payload.phone !== undefined) body['phone'] = payload.phone?.trim() ? (payload.phone as string).trim() : null;
    if (payload.preferredContact !== undefined) body['preferredContact'] = payload.preferredContact;
    return this.http
      .patch<ApiSuccess<BusinessCustomer>>(`${this.baseUrl}/business/customers/${encodeURIComponent(id)}`, body)
      .pipe(map((res) => res.data));
  }

  /** List INTERNAL jobs belonging to the authenticated user's business. */
  listBusinessJobs(params: BusinessJobListParams = {}): Observable<BusinessJobList> {
    let httpParams = new HttpParams();
    if (params.status?.trim()) httpParams = httpParams.set('status', params.status.trim());
    if (params.search?.trim()) httpParams = httpParams.set('search', params.search.trim());
    if (params.page) httpParams = httpParams.set('page', String(params.page));
    if (params.pageSize) httpParams = httpParams.set('pageSize', String(params.pageSize));
    return this.http
      .get<ApiSuccess<BusinessJobList>>(`${this.baseUrl}/business/jobs`, { params: httpParams })
      .pipe(map((res) => res.data));
  }

  /** Retrieve one INTERNAL job with its status-history timeline. */
  getBusinessJob(id: string): Observable<BusinessJobDetail> {
    return this.http
      .get<ApiSuccess<BusinessJobDetail>>(`${this.baseUrl}/business/jobs/${encodeURIComponent(id)}`)
      .pipe(map((res) => res.data));
  }

  /** Create an INTERNAL job (the backend sets source INTERNAL, status REQUESTED). */
  createBusinessJob(payload: CreateBusinessJobRequest): Observable<BusinessJob> {
    const body: Record<string, string> = {
      customerId: payload.customerId,
      serviceId: payload.serviceId,
      description: payload.description.trim(),
    };
    if (payload.title?.trim()) body['title'] = payload.title.trim();
    const address = payload.addressLine1?.trim() || payload.address?.trim();
    if (address) body['addressLine1'] = address;
    if (payload.city?.trim()) body['city'] = payload.city.trim();
    if (payload.province?.trim()) body['province'] = payload.province.trim();
    if (payload.postalCode?.trim()) body['postalCode'] = payload.postalCode.trim();
    if (payload.priority) body['priority'] = payload.priority;
    if (payload.scheduledAt?.trim()) body['scheduledAt'] = payload.scheduledAt.trim();
    return this.http
      .post<ApiSuccess<BusinessJob>>(`${this.baseUrl}/business/jobs`, body)
      .pipe(map((res) => res.data));
  }

  /** Update permitted fields of a REQUESTED internal job (no status control). */
  updateBusinessJob(id: string, payload: UpdateBusinessJobRequest): Observable<BusinessJob> {
    const body: Record<string, string | null> = {};
    if (payload.title !== undefined) body['title'] = payload.title?.trim() ? (payload.title as string).trim() : null;
    if (payload.description?.trim()) body['description'] = payload.description.trim();
    if (payload.addressLine1?.trim()) body['addressLine1'] = payload.addressLine1.trim();
    if (payload.city !== undefined) body['city'] = payload.city?.trim() ? (payload.city as string).trim() : null;
    if (payload.province !== undefined)
      body['province'] = payload.province?.trim() ? (payload.province as string).trim() : null;
    if (payload.postalCode !== undefined)
      body['postalCode'] = payload.postalCode?.trim() ? (payload.postalCode as string).trim() : null;
    if (payload.priority) body['priority'] = payload.priority;
    if (payload.scheduledAt !== undefined)
      body['scheduledAt'] = payload.scheduledAt?.trim() ? (payload.scheduledAt as string).trim() : null;
    return this.http
      .patch<ApiSuccess<BusinessJob>>(`${this.baseUrl}/business/jobs/${encodeURIComponent(id)}`, body)
      .pipe(map((res) => res.data));
  }

  /** Cancel an eligible (REQUESTED) internal job. */
  cancelBusinessJob(id: string, reason?: string): Observable<BusinessJob> {
    const body: Record<string, string> = {};
    if (reason?.trim()) body['reason'] = reason.trim();
    return this.http
      .post<ApiSuccess<BusinessJob>>(`${this.baseUrl}/business/jobs/${encodeURIComponent(id)}/cancel`, body)
      .pipe(map((res) => res.data));
  }

  /** Real-data INTERNAL job counts for the business dashboard. */
  getBusinessJobsSummary(): Observable<BusinessJobsSummary> {
    return this.http
      .get<ApiSuccess<BusinessJobsSummary>>(`${this.baseUrl}/business/jobs-summary`)
      .pipe(map((res) => res.data));
  }

  /** Assign (or reassign) a technician to an INTERNAL job (owner/manager — backend enforces). */
  assignTechnician(jobId: string, payload: AssignTechnicianRequest): Observable<JobAssignment> {
    return this.http
      .post<ApiSuccess<JobAssignment>>(
        `${this.baseUrl}/business/jobs/${encodeURIComponent(jobId)}/assign`,
        { technicianId: payload.technicianId },
      )
      .pipe(map((res) => res.data));
  }

  /** Retrieve the active assignment plus history for an INTERNAL job (owner/manager). */
  getJobAssignment(jobId: string): Observable<JobAssignmentDetail> {
    return this.http
      .get<ApiSuccess<JobAssignmentDetail>>(
        `${this.baseUrl}/business/jobs/${encodeURIComponent(jobId)}/assignment`,
      )
      .pipe(map((res) => res.data));
  }
}
