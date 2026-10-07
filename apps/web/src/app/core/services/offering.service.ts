import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import type { ApiSuccess } from '../models/api.model';
import type {
  CreateOfferingRequest,
  Offering,
  OfferingList,
  UpdateOfferingRequest,
} from '../models/offering.model';

/**
 * Fixlynk provider service-offering API client.
 *
 * Single owner of `/api/v1/provider/offerings`. All endpoints require
 * authentication and the backend derives the owning provider from the
 * session; the client only sends `providerType` on create when the user
 * manages more than one provider.
 *
 * Errors are deliberately NOT handled here — they propagate as raw
 * `HttpErrorResponse` so components can translate the documented
 * `VALIDATION_ERROR` / `CONFLICT` / `FORBIDDEN_ROLE` codes into the
 * right UI state.
 */
@Injectable({ providedIn: 'root' })
export class OfferingService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly endpoint = `${this.baseUrl}/provider/offerings`;

  list(): Observable<OfferingList> {
    return this.data(this.http.get<ApiSuccess<OfferingList>>(this.endpoint));
  }

  get(id: string): Observable<Offering> {
    return this.data(this.http.get<ApiSuccess<Offering>>(`${this.endpoint}/${this.id(id)}`));
  }

  create(payload: CreateOfferingRequest): Observable<Offering> {
    return this.data(this.http.post<ApiSuccess<Offering>>(this.endpoint, payload));
  }

  /** `providerType` is never sent here — the backend rejects it with 422. */
  update(id: string, payload: UpdateOfferingRequest): Observable<Offering> {
    return this.data(this.http.patch<ApiSuccess<Offering>>(`${this.endpoint}/${this.id(id)}`, payload));
  }

  /** Soft delete: resolves with the offering flagged `isActive: false`. */
  remove(id: string): Observable<Offering> {
    return this.data(this.http.delete<ApiSuccess<Offering>>(`${this.endpoint}/${this.id(id)}`));
  }

  private data<T>(request: Observable<ApiSuccess<T>>): Observable<T> {
    return request.pipe(map((response) => response.data));
  }

  private id(id: string): string {
    return encodeURIComponent(id);
  }
}