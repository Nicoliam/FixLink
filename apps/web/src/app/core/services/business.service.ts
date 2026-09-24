import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import type { ApiSuccess } from '../models/api.model';
import type {
  AssignTechnicianRequest,
  Business,
  BusinessBoardJobList,
  BusinessBoardSummary,
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
  PartsAvailableResult,
  PartsDecisionRequest,
  PartsRequest,
  PartsRequestList,
  PartsReviewResult,
  Technician,
  TechnicianExecutionTimeline,
  TechnicianJobImage,
  TechnicianJobImageList,
  TechnicianJobUpdate,
  TechnicianJobUpdateList,
  TechnicianList,
  TechnicianVoiceNote,
  TechnicianVoiceNoteList,
  UpdateBusinessCustomerRequest,
  UpdateBusinessJobRequest,
  UpdateBusinessRequest,
  UpdateTechnicianRequest,
} from '../models/business.model';

/**
 * FixLink business API client — Stage 7A (business foundation +
 * technician management) + Stage 7B (business-managed customers and
 * internal jobs) + Stage 7C (technician assignment) + Stage 7D
 * (read-only execution visibility: photos, notes, voice notes,
 * timeline) + Stage 7E (read-only parts-request visibility) + Stage 7F
 * (manager approvals: approve/reject/request-info/available).
 *
 * Single owner of business calls. All endpoints require authentication
 * (the interceptor attaches the Bearer token); the business is derived
 * by the backend from the session membership, never from these payloads.
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
    return this.listBoardJobs(params).pipe(
      map((list) => ({ items: list.items, total: list.total, page: list.page, pageSize: list.pageSize })),
    );
  }

  /**
   * Stage 7G — list INTERNAL jobs with the operational board filters
   * (board category, technician, priority, creation-date range,
   * assigned, sort) plus status/search/pagination. Rows carry the
   * active assignment, outstanding parts and latest work timestamp.
   */
  listBoardJobs(params: BusinessJobListParams = {}): Observable<BusinessBoardJobList> {
    let httpParams = new HttpParams();
    if (params.status?.trim()) httpParams = httpParams.set('status', params.status.trim());
    if (params.board?.trim()) httpParams = httpParams.set('board', params.board.trim());
    if (params.technicianId?.trim()) httpParams = httpParams.set('technicianId', params.technicianId.trim());
    if (params.priority?.trim()) httpParams = httpParams.set('priority', params.priority.trim());
    if (params.from?.trim()) httpParams = httpParams.set('from', params.from.trim());
    if (params.to?.trim()) httpParams = httpParams.set('to', params.to.trim());
    if (params.assigned !== undefined) httpParams = httpParams.set('assigned', String(params.assigned));
    if (params.sort?.trim()) httpParams = httpParams.set('sort', params.sort.trim());
    if (params.search?.trim()) httpParams = httpParams.set('search', params.search.trim());
    if (params.page) httpParams = httpParams.set('page', String(params.page));
    if (params.pageSize) httpParams = httpParams.set('pageSize', String(params.pageSize));
    return this.http
      .get<ApiSuccess<BusinessBoardJobList>>(`${this.baseUrl}/business/jobs`, { params: httpParams })
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

  /**
   * Stage 7G — operational board counts (requested/assigned/scheduled/
   * in-progress/awaiting-parts/completed/cancelled/history) for the
   * dashboard and the job board tabs.
   */
  getBusinessBoardSummary(): Observable<BusinessBoardSummary> {
    return this.http
      .get<ApiSuccess<BusinessBoardSummary>>(`${this.baseUrl}/business/jobs-board-summary`)
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

  /**
   * Stage 7D — read-only execution visibility for owner/manager.
   * The technician's BEFORE/DURING/AFTER photos for an owned job.
   */
  listBusinessJobImages(jobId: string): Observable<TechnicianJobImage[]> {
    return this.http
      .get<ApiSuccess<TechnicianJobImageList>>(
        `${this.baseUrl}/business/jobs/${encodeURIComponent(jobId)}/images`,
      )
      .pipe(map((res) => res.data.items));
  }

  /** Authorized URL for execution photo bytes (fetch as a Blob for <img>). */
  businessJobImageFileUrl(jobId: string, imageId: string): string {
    return `${this.baseUrl}/business/jobs/${encodeURIComponent(jobId)}/images/${encodeURIComponent(imageId)}/file`;
  }

  /** Fetch authorized execution photo bytes as a Blob. */
  fetchBusinessJobImageBlob(jobId: string, imageId: string): Observable<Blob> {
    return this.http.get(this.businessJobImageFileUrl(jobId, imageId), { responseType: 'blob' });
  }

  /** The technician's progress notes for an owned job (read-only). */
  listBusinessJobUpdates(jobId: string): Observable<TechnicianJobUpdate[]> {
    return this.http
      .get<ApiSuccess<TechnicianJobUpdateList>>(
        `${this.baseUrl}/business/jobs/${encodeURIComponent(jobId)}/updates`,
      )
      .pipe(map((res) => res.data.items));
  }

  /** The technician's voice notes for an owned job (metadata only, read-only). */
  listBusinessVoiceNotes(jobId: string): Observable<TechnicianVoiceNote[]> {
    return this.http
      .get<ApiSuccess<TechnicianVoiceNoteList>>(
        `${this.baseUrl}/business/jobs/${encodeURIComponent(jobId)}/voice-notes`,
      )
      .pipe(map((res) => res.data.items));
  }

  /** Authorized URL for voice-note bytes (fetch as a Blob for <audio>). */
  businessJobVoiceNoteFileUrl(jobId: string, voiceNoteId: string): string {
    return `${this.baseUrl}/business/jobs/${encodeURIComponent(jobId)}/voice-notes/${encodeURIComponent(voiceNoteId)}/file`;
  }

  /** Fetch authorized voice-note bytes as a Blob. */
  fetchBusinessJobVoiceNoteBlob(jobId: string, voiceNoteId: string): Observable<Blob> {
    return this.http.get(this.businessJobVoiceNoteFileUrl(jobId, voiceNoteId), { responseType: 'blob' });
  }

  /** Execution timeline for an owned job (status + assignment + work + voice). */
  getBusinessExecutionTimeline(jobId: string): Observable<TechnicianExecutionTimeline> {
    return this.http
      .get<ApiSuccess<TechnicianExecutionTimeline>>(
        `${this.baseUrl}/business/jobs/${encodeURIComponent(jobId)}/timeline`,
      )
      .pipe(map((res) => res.data));
  }

  /**
   * Stage 7E — read-only parts-request visibility for owner/manager.
   * The technician's submitted requests for an owned job (newest
   * workflow state included). Approval actions arrive in Stage 7F.
   */
  listBusinessJobPartsRequests(jobId: string): Observable<PartsRequest[]> {
    return this.http
      .get<ApiSuccess<PartsRequestList>>(
        `${this.baseUrl}/business/jobs/${encodeURIComponent(jobId)}/parts`,
      )
      .pipe(map((res) => res.data.items));
  }

  /** Stage 7E — retrieve one parts request for an owned job (read-only). */
  getBusinessJobPartsRequest(jobId: string, requestId: string): Observable<PartsRequest> {
    return this.http
      .get<ApiSuccess<PartsRequest>>(
        `${this.baseUrl}/business/jobs/${encodeURIComponent(jobId)}/parts/${encodeURIComponent(requestId)}`,
      )
      .pipe(map((res) => res.data));
  }

  /** Stage 7E — authorized URL for parts photo-evidence bytes. */
  businessJobPartsPhotoFileUrl(jobId: string, requestId: string): string {
    return `${this.baseUrl}/business/jobs/${encodeURIComponent(jobId)}/parts/${encodeURIComponent(requestId)}/photo/file`;
  }

  /** Stage 7E — fetch authorized photo-evidence bytes as a Blob. */
  fetchBusinessJobPartsPhotoBlob(jobId: string, requestId: string): Observable<Blob> {
    return this.http.get(this.businessJobPartsPhotoFileUrl(jobId, requestId), { responseType: 'blob' });
  }

  /**
   * Stage 7F — manager decisions on a parts request (owner/manager
   * only; the backend enforces the state machine and business
   * isolation). Approve moves the job IN_PROGRESS → AWAITING_PARTS;
   * reject and request-info leave it in progress. Reject and
   * request-info require a comment/reason for the technician.
   */
  private decideJobPartsRequest(
    jobId: string,
    requestId: string,
    action: 'approve' | 'reject' | 'request-info',
    payload: PartsDecisionRequest = {},
  ): Observable<PartsReviewResult> {
    const body: Record<string, string> = {};
    const comment = payload.comment?.trim() || payload.reason?.trim();
    if (comment) body['comment'] = comment;
    return this.http
      .post<ApiSuccess<PartsReviewResult>>(
        `${this.baseUrl}/business/jobs/${encodeURIComponent(jobId)}/parts/${encodeURIComponent(requestId)}/${action}`,
        body,
      )
      .pipe(map((res) => res.data));
  }

  /** Stage 7F — approve a PENDING (or NEEDS_INFO) parts request. */
  approveJobPartsRequest(jobId: string, requestId: string, payload: PartsDecisionRequest = {}): Observable<PartsReviewResult> {
    return this.decideJobPartsRequest(jobId, requestId, 'approve', payload);
  }

  /** Stage 7F — reject a parts request (reason required, job stays in progress). */
  rejectJobPartsRequest(jobId: string, requestId: string, payload: PartsDecisionRequest): Observable<PartsReviewResult> {
    return this.decideJobPartsRequest(jobId, requestId, 'reject', payload);
  }

  /** Stage 7F — ask the technician for more information (comment required). */
  requestJobPartsInfo(jobId: string, requestId: string, payload: PartsDecisionRequest): Observable<PartsReviewResult> {
    return this.decideJobPartsRequest(jobId, requestId, 'request-info', payload);
  }

  /**
   * Stage 7F — mark an APPROVED request as fulfilled (APPROVED →
   * PARTS_AVAILABLE). The job resumes (AWAITING_PARTS → IN_PROGRESS)
   * only when no APPROVED request remains outstanding.
   */
  markJobPartsAvailable(jobId: string, requestId: string, payload: PartsDecisionRequest = {}): Observable<PartsAvailableResult> {
    const body: Record<string, string> = {};
    const comment = payload.comment?.trim() || payload.reason?.trim();
    if (comment) body['comment'] = comment;
    return this.http
      .post<ApiSuccess<PartsAvailableResult>>(
        `${this.baseUrl}/business/jobs/${encodeURIComponent(jobId)}/parts/${encodeURIComponent(requestId)}/available`,
        body,
      )
      .pipe(map((res) => res.data));
  }
}
