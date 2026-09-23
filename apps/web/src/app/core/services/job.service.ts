import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import type { ApiSuccess } from '../models/api.model';
import type {
  CreateJobRequest,
  CreateQuoteRequest,
  Job,
  JobList,
  ProviderRequest,
  ProviderRequestList,
  Quote,
} from '../models/job.model';

/**
 * FixLink jobs API client — Stage 6B (customer requests) + Stage 6C
 * (provider requests and quotes).
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

  /** List quotes for an authorized job (owning customer or provider). */
  listJobQuotes(jobId: string): Observable<Quote[]> {
    return this.http
      .get<ApiSuccess<{ items: Quote[]; total: number }>>(
        `${this.baseUrl}/jobs/${encodeURIComponent(jobId)}/quotes`,
      )
      .pipe(map((res) => res.data.items));
  }

  /** Retrieve one authorized quote. */
  getQuote(id: string): Observable<Quote> {
    return this.http
      .get<ApiSuccess<Quote>>(`${this.baseUrl}/quotes/${encodeURIComponent(id)}`)
      .pipe(map((res) => res.data));
  }
}
