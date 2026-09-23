import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import type { ApiSuccess } from '../models/api.model';
import type {
  AcceptQuoteResult,
  CompleteJobResult,
  CreateJobRequest,
  CreateQuoteRequest,
  Job,
  JobImage,
  JobImageList,
  JobList,
  JobTimeline,
  JobUpdate,
  JobUpdateList,
  ProviderRequest,
  ProviderRequestList,
  Quote,
  WorkPhase,
} from '../models/job.model';

/**
 * FixLink jobs API client — Stage 6B (customer requests) + Stage 6C
 * (provider requests and quotes) + Stage 6D (customer quote acceptance)
 * + Stage 6E (provider scheduling and start) + Stage 6F (work
 * documentation, completion, confirmation, timeline).
 *
 * Single owner of job/quote calls. All endpoints require authentication
 * (the interceptor attaches the Bearer token); customer ownership and
 * provider identity are established by the backend from the session,
 * never from these payloads.
 */
@Injectable({ providedIn: 'root' })
export class JobService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  /** Submit a marketplace job request; resolves with the REQUESTED job. */
  createJob(payload: CreateJobRequest): Observable<Job> {
    const body: Record<string, string> = {
      providerId: payload.providerId.trim(),
      serviceId: payload.serviceId.trim(),
      description: payload.description.trim(),
      location: payload.location.trim(),
    };
    if (payload.preferredDate?.trim()) body['preferredDate'] = payload.preferredDate.trim();
    if (payload.preferredTime?.trim()) body['preferredTime'] = payload.preferredTime.trim();
    if (payload.notes?.trim()) body['notes'] = payload.notes.trim();
    return this.http
      .post<ApiSuccess<Job>>(`${this.baseUrl}/jobs`, body)
      .pipe(map((res) => res.data));
  }

  /** List the authenticated customer's jobs (newest first). */
  listMyJobs(page = 1, pageSize = 20): Observable<JobList> {
    return this.http
      .get<ApiSuccess<JobList>>(`${this.baseUrl}/jobs`, {
        params: new HttpParams().set('page', String(page)).set('pageSize', String(pageSize)),
      })
      .pipe(map((res) => res.data));
  }

  /** Retrieve one owned job; other customers' jobs read as 404. */
  getJob(id: string): Observable<Job> {
    return this.http
      .get<ApiSuccess<Job>>(`${this.baseUrl}/jobs/${encodeURIComponent(id)}`)
      .pipe(map((res) => res.data));
  }

  /** List marketplace requests addressed to the authenticated provider. */
  listProviderRequests(page = 1, pageSize = 20, status?: string): Observable<ProviderRequestList> {
    let params = new HttpParams().set('page', String(page)).set('pageSize', String(pageSize));
    if (status?.trim()) params = params.set('status', status.trim());
    return this.http
      .get<ApiSuccess<ProviderRequestList>>(`${this.baseUrl}/provider/requests`, { params })
      .pipe(map((res) => res.data));
  }

  /** Retrieve one addressed request with its quotes. */
  getProviderRequest(id: string): Observable<ProviderRequest> {
    return this.http
      .get<ApiSuccess<ProviderRequest>>(`${this.baseUrl}/provider/requests/${encodeURIComponent(id)}`)
      .pipe(map((res) => res.data));
  }

  /** Submit a quote for an addressed REQUESTED job (→ QUOTED). */
  createQuote(jobId: string, payload: CreateQuoteRequest): Observable<Quote> {
    const body: Record<string, unknown> = { total: payload.total };
    if (payload.currency?.trim()) body['currency'] = payload.currency.trim().toUpperCase();
    if (payload.message?.trim()) body['message'] = payload.message.trim();
    if (payload.items) body['items'] = payload.items;
    return this.http
      .post<ApiSuccess<Quote>>(`${this.baseUrl}/jobs/${encodeURIComponent(jobId)}/quotes`, body)
      .pipe(map((res) => res.data));
  }

  /**
   * Accept an eligible quote on an owned QUOTED job (→ ACCEPTED).
   * The backend validates ownership, role and state server-side and
   * performs the transition — the client never sends a status.
   */
  acceptQuote(jobId: string, quoteId: string): Observable<AcceptQuoteResult> {
    return this.http
      .post<ApiSuccess<AcceptQuoteResult>>(
        `${this.baseUrl}/jobs/${encodeURIComponent(jobId)}/quotes/${encodeURIComponent(quoteId)}/accept`,
        {},
      )
      .pipe(map((res) => res.data));
  }

  /** List quotes for an authorized job (owning customer or provider). */
  listJobQuotes(jobId: string): Observable<Quote[]> {
    return this.http
      .get<ApiSuccess<{ items: Quote[]; total: number }>>(
        `${this.baseUrl}/jobs/${encodeURIComponent(jobId)}/quotes`,
      )
      .pipe(map((res) => res.data.items));
  }

  /**
   * Schedule an ACCEPTED job (→ SCHEDULED). The provider picks a local
   * date and time; the instant is sent as an ISO string with the SAST
   * (UTC+2) offset so the backend stores exactly the chosen wall time.
   * The backend validates the provider, the ACCEPTED state and the
   * accepted quote server-side.
   */
  scheduleJob(jobId: string, scheduledAt: string): Observable<Job> {
    return this.http
      .post<ApiSuccess<{ job: Job }>>(`${this.baseUrl}/jobs/${encodeURIComponent(jobId)}/schedule`, {
        scheduledAt,
      })
      .pipe(map((res) => res.data.job));
  }

  /**
   * Start a SCHEDULED job (→ IN_PROGRESS). The backend validates the
   * provider and the SCHEDULED state server-side.
   */
  startJob(jobId: string): Observable<Job> {
    return this.http
      .post<ApiSuccess<{ job: Job }>>(`${this.baseUrl}/jobs/${encodeURIComponent(jobId)}/start`, {})
      .pipe(map((res) => res.data.job));
  }

  /** Retrieve one authorized quote. */
  getQuote(id: string): Observable<Quote> {
    return this.http
      .get<ApiSuccess<Quote>>(`${this.baseUrl}/quotes/${encodeURIComponent(id)}`)
      .pipe(map((res) => res.data));
  }

  /**
   * Upload a BEFORE/DURING/AFTER photo for an IN_PROGRESS job (provider
   * only). Sent as multipart FormData (`image` file + `phase` field);
   * resolves with the stored file metadata (never binaries or paths).
   */
  uploadJobImage(jobId: string, phase: WorkPhase, file: File): Observable<JobImage> {
    const form = new FormData();
    form.append('phase', phase);
    form.append('image', file, file.name);
    return this.http
      .post<ApiSuccess<JobImage>>(`${this.baseUrl}/jobs/${encodeURIComponent(jobId)}/images`, form)
      .pipe(map((res) => res.data));
  }

  /** List authorized photo metadata for a job (customer or provider). */
  listJobImages(jobId: string): Observable<JobImage[]> {
    return this.http
      .get<ApiSuccess<JobImageList>>(`${this.baseUrl}/jobs/${encodeURIComponent(jobId)}/images`)
      .pipe(map((res) => res.data.items));
  }

  /**
   * Authorized URL for photo bytes (backend checks ownership/provider
   * association; the browser sends the Bearer token via the interceptor
   * for XHR — for <img> use an object URL from fetch where needed).
   */
  imageFileUrl(jobId: string, imageId: string): string {
    return `${this.baseUrl}/jobs/${encodeURIComponent(jobId)}/images/${encodeURIComponent(imageId)}/file`;
  }

  /**
   * Fetch authorized photo bytes as a Blob (the interceptor attaches the
   * Bearer token; callers turn the blob into an object URL for <img>).
   */
  fetchImageBlob(jobId: string, imageId: string): Observable<Blob> {
    return this.http.get(this.imageFileUrl(jobId, imageId), { responseType: 'blob' });
  }

  /** Delete an uploaded photo while the job is still IN_PROGRESS. */
  deleteJobImage(jobId: string, imageId: string): Observable<void> {
    return this.http
      .delete<ApiSuccess<{ deleted: boolean }>>(
        `${this.baseUrl}/jobs/${encodeURIComponent(jobId)}/images/${encodeURIComponent(imageId)}`,
      )
      .pipe(map(() => undefined));
  }

  /** Save a BEFORE/DURING/AFTER progress note (IN_PROGRESS, provider only). */
  createJobUpdate(jobId: string, phase: WorkPhase, note: string): Observable<JobUpdate> {
    return this.http
      .post<ApiSuccess<JobUpdate>>(`${this.baseUrl}/jobs/${encodeURIComponent(jobId)}/updates`, {
        phase,
        note: note.trim(),
      })
      .pipe(map((res) => res.data));
  }

  /** List authorized progress notes for a job (customer or provider). */
  listJobUpdates(jobId: string): Observable<JobUpdate[]> {
    return this.http
      .get<ApiSuccess<JobUpdateList>>(`${this.baseUrl}/jobs/${encodeURIComponent(jobId)}/updates`)
      .pipe(map((res) => res.data.items));
  }

  /** Retrieve the combined timeline (status + updates + photos). */
  getJobTimeline(jobId: string): Observable<JobTimeline> {
    return this.http
      .get<ApiSuccess<JobTimeline>>(`${this.baseUrl}/jobs/${encodeURIComponent(jobId)}/timeline`)
      .pipe(map((res) => res.data));
  }

  /**
   * Complete an IN_PROGRESS job (→ COMPLETED). The completion note is
   * required and stored as the AFTER record; the backend validates the
   * provider and state server-side.
   */
  completeJob(jobId: string, note: string): Observable<CompleteJobResult> {
    return this.http
      .post<ApiSuccess<CompleteJobResult>>(`${this.baseUrl}/jobs/${encodeURIComponent(jobId)}/complete`, {
        note: note.trim(),
      })
      .pipe(map((res) => res.data));
  }

  /**
   * Confirm a COMPLETED job (→ CONFIRMED → CLOSED server-side, owning
   * customer only). Resolves with the final CLOSED job.
   */
  confirmJob(jobId: string): Observable<Job> {
    return this.http
      .post<ApiSuccess<{ job: Job }>>(`${this.baseUrl}/jobs/${encodeURIComponent(jobId)}/confirm`, {})
      .pipe(map((res) => res.data.job));
  }
}
