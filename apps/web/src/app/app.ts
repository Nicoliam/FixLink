import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { NotificationService } from './core/services/notification.service';
import { getApiErrorMessage } from './core/models/api.model';
import { formatNotificationTime, notificationRouteFor, notificationTypeLabel } from './core/models/notification.model';
import type { NotificationItem } from './core/models/notification.model';

const PROVIDER_ROLES = ['PROFESSIONAL', 'BUSINESS_OWNER', 'BUSINESS_MANAGER'];

const BUSINESS_ROLES = ['BUSINESS_OWNER', 'BUSINESS_MANAGER'];

/**
 * FixLink application shell — Stage 5B + 6C + 7A + 7B + 7C + 8.
 *
 * Oceanic header with the FixLink logo and session-aware navigation,
 * plus the routed content. Navigation is UX-only: customers see My Jobs,
 * provider roles see Requests, business roles see the business section
 * (Dashboard, Jobs, Customers, Technicians, Profile, Settings),
 * technicians see My Jobs, and the backend enforces the real
 * authorization. Technician parts, messages and notifications arrive in
 * later stages. Dashboards arrive in later stages.
 *
 * Stage 8 adds the notification bell: an unread badge (polled modestly
 * while authenticated, no WebSockets) with a compact panel for recent
 * notifications. The full inbox lives at `/notifications`.
 */
@Component({
  selector: 'app-root',
  imports: [NgOptimizedImage, RouterLink, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Customer navigation: track and review own job requests. */
  protected readonly showMyJobs = computed(
    () => this.auth.isAuthenticated() && (this.auth.currentUser()?.roles ?? []).includes('CUSTOMER'),
  );

  /** Provider navigation: marketplace requests addressed to the provider. */
  protected readonly showRequests = computed(
    () =>
      this.auth.isAuthenticated() &&
      (this.auth.currentUser()?.roles ?? []).some((role) => PROVIDER_ROLES.includes(role)),
  );

  /** Business navigation: dashboard, jobs, customers, technicians, profile and settings. */
  protected readonly showBusiness = computed(
    () =>
      this.auth.isAuthenticated() &&
      (this.auth.currentUser()?.roles ?? []).some((role) => BUSINESS_ROLES.includes(role)),
  );

  /** Technician navigation: jobs assigned to the caller. */
  protected readonly showTechnicianJobs = computed(
    () => this.auth.isAuthenticated() && (this.auth.currentUser()?.roles ?? []).includes('TECHNICIAN'),
  );

  /** Notification bell: every authenticated role has an inbox. */
  protected readonly showNotifications = computed(() => this.auth.isAuthenticated());

  /** Compact panel state (the full inbox is the `/notifications` page). */
  protected readonly panelOpen = signal(false);
  protected readonly panelLoading = signal(false);
  protected readonly panelError = signal('');
  protected readonly panelItems = signal<NotificationItem[]>([]);

  protected readonly typeLabel = notificationTypeLabel;
  protected readonly formatTime = formatNotificationTime;

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.notifications.startPolling();
      } else {
        this.notifications.stopPolling();
        this.notifications.unreadCount.set(0);
        this.panelOpen.set(false);
      }
    });
  }

  /** Toggle the compact panel; opening refreshes the recent items. */
  protected togglePanel(): void {
    const next = !this.panelOpen();
    this.panelOpen.set(next);
    if (next) this.refreshPanel();
  }

  protected closePanel(): void {
    this.panelOpen.set(false);
  }

  protected refreshPanel(): void {
    this.panelLoading.set(true);
    this.panelError.set('');
    this.notifications
      .list(1, 8)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.panelItems.set(list.items);
          this.panelLoading.set(false);
        },
        error: (error: unknown) => {
          this.panelError.set(
            getApiErrorMessage(error, 'Could not load your notifications. Please try again.'),
          );
          this.panelLoading.set(false);
        },
      });
  }

  protected markAllRead(): void {
    this.notifications
      .markAllRead()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.refreshPanel(),
        error: (error: unknown) => {
          this.panelError.set(
            getApiErrorMessage(error, 'Could not mark your notifications as read. Please try again.'),
          );
        },
      });
  }

  /** Open a panel notification: mark it read, close the panel, navigate. */
  protected openPanelItem(item: NotificationItem): void {
    const destination = notificationRouteFor(item, this.auth.currentUser()?.roles ?? []);
    this.panelOpen.set(false);
    if (!item.read) {
      this.notifications
        .markRead(item.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            void this.router.navigate(destination);
          },
          error: () => {
            void this.router.navigate(destination);
          },
        });
      return;
    }
    void this.router.navigate(destination);
  }
}
