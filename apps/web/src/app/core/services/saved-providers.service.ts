import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import type { ApiSuccess } from '../models/api.model';
import type { SavedProvider, SavedProviderState } from '../models/saved-provider.model';

/**
 * Fixlynk saved-professional API client.
 *
 * Customer-owned bookmarks (`/api/v1/customer/saved-providers`). Every call
 * requires a session; the backend derives the owning customer from it, so
 * this client never sends a user id.
 */
@Injectable({ providedIn: 'root' })
export class SavedProvidersService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  /** The caller's saved professionals, newest first. */
  list(): Observable<SavedProvider[]> {
    return this.http
      .get<ApiSuccess<{ items: SavedProvider[] }>>(`${this.baseUrl}/customer/saved-providers`)
      .pipe(map((res) => res.data.items));
  }

  /** Whether one provider is bookmarked, so a page can render its toggle. */
  state(providerId: string): Observable<SavedProviderState> {
    return this.http
      .get<ApiSuccess<SavedProviderState>>(
        `${this.baseUrl}/customer/saved-providers/${encodeURIComponent(providerId)}`,
      )
      .pipe(map((res) => res.data));
  }

  /** Bookmark a provider. The backend answers 409 when it is already saved. */
  save(providerId: string): Observable<SavedProvider> {
    return this.http
      .post<ApiSuccess<SavedProvider>>(`${this.baseUrl}/customer/saved-providers`, { providerId })
      .pipe(map((res) => res.data));
  }

  /** Remove one of the caller's own bookmarks. */
  remove(providerId: string): Observable<void> {
    return this.http
      .delete<void>(`${this.baseUrl}/customer/saved-providers/${encodeURIComponent(providerId)}`)
      .pipe(map(() => undefined));
  }
}
