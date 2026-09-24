import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import type { ApiSuccess } from '../models/api.model';
import type { BusinessJobDetail, BusinessJobList, BusinessJobListParams } from '../models/business.model';

/**
 * FixLink technician API client — Stage 7C (My Jobs).
 *
 * Single owner of technician calls. All endpoints require
 * authentication; the technician identity is derived by the backend
 * from the session user, never from these payloads. Only jobs with
 * an active TECHNICIAN assignment to the caller are visible.
 * Parts, approvals and notifications arrive in later stages.
 */
@Injectable({ providedIn: 'root' })
export class TechnicianService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  /** List INTERNAL jobs actively assigned to the authenticated technician. */
  listMyJobs(params: BusinessJobListParams = {}): Observable<BusinessJobList> {
    let httpParams = new HttpParams();
    if (params.status?.trim()) httpParams = httpParams.set('status', params.status.trim());
    if (params.page) httpParams = httpParams.set('page', String(params.page));
    if (params.pageSize) httpParams = httpParams.set('pageSize', String(params.pageSize));
    return this.http
      .get<ApiSuccess<BusinessJobList>>(`${this.baseUrl}/technician/jobs`, { params: httpParams })
      .pipe(map((res) => res.data));
  }

  /** Retrieve one assigned INTERNAL job with its timeline. */
  getMyJob(id: string): Observable<BusinessJobDetail> {
    return this.http
      .get<ApiSuccess<BusinessJobDetail>>(`${this.baseUrl}/technician/jobs/${encodeURIComponent(id)}`)
      .pipe(map((res) => res.data));
  }
}
