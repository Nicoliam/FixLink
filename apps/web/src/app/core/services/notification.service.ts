import { inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { catchError, map, Observable, of } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import type { ApiSuccess } from '../models/api.model';
import type { NotificationItem, NotificationList } from '../models/notification.model';

/**
 * Unread-count poll cadence (in-app freshness without WebSockets).
 * One lightweight count request per minute while authenticated —
 * deliberately modest; the full list is fetched on demand only.
 */
export const NOTIFICATION_POLL_INTERVAL_MS = 60_000;

/**
 * FixLink notifications API client — Stage 8 (in-app only).
 *
 * Single owner of notification calls plus the global unread badge
 * state. All endpoints require authentication (the interceptor
 * attaches the Bearer token); the recipient is always the session
 * user, established by the backend — never from these payloads.
 * Every state-changing call refreshes the badge; failures leave the
 * badge untouched (callers surface list errors themselves).
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  /** Global unread badge count for the authenticated user. */
  readonly unreadCount = signal(0);

  /** List own notifications, newest first. */
  list(page = 1, pageSize = 20, unreadOnly = false): Observable<NotificationList> {
    let params = new HttpParams().set('page', String(page)).set('pageSize', String(pageSize));
    if (unreadOnly) params = params.set('unreadOnly', 'true');
    return this.http
      .get<ApiSuccess<NotificationList>>(`${this.baseUrl}/notifications`, { params })
      .pipe(map((res) => res.data));
  }

  /** Raw unread count (callers that need the value, not the signal). */
  fetchUnreadCount(): Observable<number> {
    return this.http
      .get<ApiSuccess<{ unreadCount: number }>>(`${this.baseUrl}/notifications/unread-count`)
      .pipe(map((res) => res.data.unreadCount));
  }

  /** Refresh the global badge; never throws (badge keeps its last value). */
  refreshUnreadCount(): void {
    this.fetchUnreadCount()
      .pipe(catchError(() => of(null)))
      .subscribe((count) => {
        if (count !== null) this.unreadCount.set(count);
      });
  }

  /**
   * Mark one notification read and refresh the badge. The badge is
   * re-read from the server (rather than decremented locally) so an
   * already-read notification cannot drive the count negative.
   */
  markRead(id: string): Observable<NotificationItem> {
    return this.http
      .post<ApiSuccess<NotificationItem>>(`${this.baseUrl}/notifications/${encodeURIComponent(id)}/read`, {})
      .pipe(
        map((res) => {
          this.refreshUnreadCount();
          return res.data;
        }),
      );
  }

  /** Mark every notification read; the badge becomes zero. */
  markAllRead(): Observable<number> {
    return this.http
      .post<ApiSuccess<{ markedRead: number }>>(`${this.baseUrl}/notifications/read-all`, {})
      .pipe(
        map((res) => {
          this.unreadCount.set(0);
          return res.data.markedRead;
        }),
      );
  }

  /**
   * Modest polling for badge freshness only (no WebSockets in the
   * MVP). Safe to call repeatedly — an existing timer is replaced.
   */
  startPolling(intervalMs: number = NOTIFICATION_POLL_INTERVAL_MS): void {
    this.stopPolling();
    this.refreshUnreadCount();
    this.pollTimer = setInterval(() => this.refreshUnreadCount(), intervalMs);
  }

  /** Stop badge polling (logout, teardown). */
  stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}
