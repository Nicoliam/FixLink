import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-admin-shell',
  imports: [NgOptimizedImage, RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="admin-shell">
      <aside class="admin-sidebar" aria-label="Admin navigation">
        <div class="admin-brand"><img class="admin-brand-logo" ngSrc="brand/fixlink-logo.png" width="132" height="44" alt="FixLink operations"><small>Operations</small></div>
        <nav class="admin-nav">
          @for (item of navigation; track item.path) {
             <a [routerLink]="item.path" routerLinkActive="admin-nav-active" [routerLinkActiveOptions]="{ exact: item.path === '/admin' }" ariaCurrentWhenActive="page">{{ item.label }}</a>
          }
        </nav>
        <div class="admin-sidebar-footer">
          <span class="admin-status-dot"></span>
          <span>{{ auth.currentUser()?.email }}</span>
        </div>
      </aside>
      <main class="admin-content"><router-outlet /></main>
    </div>
  `,
})
export class AdminShellComponent {
  protected readonly auth = inject(AuthService);
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
