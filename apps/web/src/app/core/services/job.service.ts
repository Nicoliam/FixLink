import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import type { ApiSuccess } from '../models/api.model';
import type { CreateJobRequest, Job, JobList } from '../models/job.model';

/**
 * FixLink customer jobs API client — Stage 6B.
 *
 * Single owner of job-request calls. All endpoints require authentication
 * (the interceptor attaches the Bearer token); customer ownership is
 * established by the backend from the session, never from these payloads.
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
}
