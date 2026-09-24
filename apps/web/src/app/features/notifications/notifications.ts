import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService } from '../../core/services/auth.service';
import { getApiErrorMessage } from '../../core/models/api.model';
import {
  formatNotificationTime,
  notificationRouteFor,
  notificationTypeLabel,
} from '../../core/models/notification.model';
import type { NotificationItem } from '../../core/models/notification.model';

type NotificationsStatus = 'loading' | 'ready' | 'empty' | 'error';

/**
 * FixLink notifications inbox — Stage 8 (`/notifications`,
 * authenticated, in-app only).
 *
 * Lists the session user's notifications newest first with
 * unread/read styling, an unread-only filter, per-item mark-read
 * (opening a notification marks it read, then navigates to the
 * role-specific job detail), mark-all-read and pagination. Loading,
 * empty and error states follow the shared Oceanic Modern patterns.
 */
@Component({
  selector: 'app-notifications',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notifications.html',
})
export class NotificationsComponent implements OnInit {
  private readonly api = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = signal<NotificationsStatus>('loading');
  protected readonly errorMessage = signal('');
  protected readonly items = signal<NotificationItem[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(20);
  protected readonly unreadOnly = signal(false);
  protected readonly markingAll = signal(false);

  protected readonly typeLabel = notificationTypeLabel;
  protected readonly formatTime = formatNotificationTime;

  ngOnInit(): void {
    this.load(1);
  }

  protected load(page: number): void {
    this.status.set('loading');
    this.errorMessage.set('');
    this.api
      .list(page, this.pageSize(), this.unreadOnly())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.items.set(list.items);
          this.total.set(list.total);
          this.page.set(list.page);
          this.status.set(list.items.length === 0 ? 'empty' : 'ready');
        },
        error: (error: unknown) => {
          this.errorMessage.set(
            getApiErrorMessage(error, 'Could not load your notifications. Please try again.'),
          );
          this.status.set('error');
        },
      });
  }

  protected retry(): void {
    this.load(this.page());
  }

  protected toggleUnreadOnly(): void {
    this.unreadOnly.update((value) => !value);
    this.load(1);
  }

  protected nextPage(): void {
    if (this.page() * this.pageSize() < this.total()) this.load(this.page() + 1);
  }

  protected previousPage(): void {
    if (this.page() > 1) this.load(this.page() - 1);
  }

  protected markAllRead(): void {
    if (this.markingAll()) return;
    this.markingAll.set(true);
    this.api
      .markAllRead()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.markingAll.set(false);
          this.items.update((items) => items.map((item) => ({ ...item, read: true, readAt: item.readAt })));
          this.load(this.unreadOnly() ? 1 : this.page());
        },
        error: (error: unknown) => {
          this.markingAll.set(false);
          this.errorMessage.set(
            getApiErrorMessage(error, 'Could not mark your notifications as read. Please try again.'),
          );
          this.status.set('error');
        },
      });
  }

  /** Open a notification: mark it read, then route to the job detail. */
  protected open(item: NotificationItem): void {
    const destination = notificationRouteFor(item, this.auth.currentUser()?.roles ?? []);
    if (!item.read) {
      this.api
        .markRead(item.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.items.update((items) => items.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry)));
            void this.router.navigate(destination);
          },
          error: () => {
            // Read-tracking is best-effort — still open the destination.
            void this.router.navigate(destination);
          },
        });
      return;
    }
    void this.router.navigate(destination);
  }
}
