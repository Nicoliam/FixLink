import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-admin-shell',
  imports: [NgOptimizedImage, RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="admin-shell">
      <aside class="admin-sidebar" [class.admin-sidebar-open]="mobileMenuOpen()" aria-label="Admin navigation">
        <div class="admin-mobile-bar">
          <div class="admin-brand">
            <img class="admin-brand-logo" ngSrc="brand/fixlynk-home-repair-logo.png" width="132" height="66" alt="Fixlynk">
          </div>
          <button type="button" class="admin-menu-toggle" (click)="toggleMobileMenu()" [attr.aria-expanded]="mobileMenuOpen()" aria-controls="admin-navigation">
            {{ mobileMenuOpen() ? 'Close menu' : 'Menu' }}
          </button>
        </div>
        <div class="admin-brand admin-brand-desktop">
          <img class="admin-brand-logo" ngSrc="brand/fixlynk-home-repair-logo.png" width="132" height="66" alt="Fixlynk">
        </div>
<nav id="admin-navigation" class="admin-nav">
          @for (item of navigation; track item.path) {
<a [routerLink]="item.path" routerLinkActive="admin-nav-active" [routerLinkActiveOptions]="{ exact: item.path === '/admin' }" ariaCurrentWhenActive="page" (click)="closeMobileMenu()">{{ item.label }}</a>
          }
        </nav>
        <button type="button" class="admin-nav-logout-icon"
          (click)="logout()" [disabled]="isLoggingOut()"
          [attr.aria-label]="isLoggingOut() ? 'Logging out' : 'Log out'"
          title="Log out">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 17l5-5-5-5M15 12H3M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>
          </svg>
          <span>Log out</span>
        </button>

        <div class="admin-sidebar-footer">
          <span class="admin-status-dot"></span>
          <span>{{ auth.currentUser()?.email }}</span>
        </div>
      </aside>
      <main class="admin-content">
<router-outlet />
      </main>
    </div>
  `,
})
export class AdminShellComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly mobileMenuOpen = signal(false);
  protected readonly isLoggingOut = signal(false);

  protected toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  protected closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  protected logout(): void {
    if (this.isLoggingOut()) return;
    this.isLoggingOut.set(true);
    this.auth.logout().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => void this.router.navigate(['/']),
      error: () => void this.router.navigate(['/']),
      complete: () => this.isLoggingOut.set(false),
    });
  }

  protected readonly navigation = [
    { path: '/admin', label: 'Dashboard' },
    { path: '/admin/users', label: 'Users' },
    { path: '/admin/customers', label: 'Customers' },
    { path: '/admin/professionals', label: 'Professionals' },
    { path: '/admin/businesses', label: 'Businesses' },
    { path: '/admin/technicians', label: 'Technicians' },
    { path: '/admin/services', label: 'Services' },
    { path: '/admin/jobs', label: 'Jobs' },
    { path: '/admin/verification', label: 'Verification' },
    { path: '/admin/certificates', label: 'Certificates' },
    { path: '/admin/reviews', label: 'Reviews' },
    { path: '/admin/reports', label: 'Reports' },
    { path: '/admin/disputes', label: 'Disputes' },
    { path: '/admin/audit-logs', label: 'Audit Logs' },
    { path: '/admin/settings', label: 'Settings' },
  ] as const;
  protected readonly title = computed(() => 'Admin operations');
}
