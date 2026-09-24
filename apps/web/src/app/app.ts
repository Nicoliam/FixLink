import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';

const PROVIDER_ROLES = ['PROFESSIONAL', 'BUSINESS_OWNER', 'BUSINESS_MANAGER'];

const BUSINESS_ROLES = ['BUSINESS_OWNER', 'BUSINESS_MANAGER'];

/**
 * FixLink application shell — Stage 5B + 6C + 7A.
 *
 * Oceanic header with the FixLink logo and session-aware navigation,
 * plus the routed content. Navigation is UX-only: customers see My Jobs,
 * provider roles see Requests, business roles see Business/Technicians,
 * and the backend enforces the real authorization. Technicians get no
 * business-management navigation until Stage 7C. Dashboards arrive in
 * later stages.
 */
@Component({
  selector: 'app-root',
  imports: [NgOptimizedImage, RouterLink, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
})
export class App {
  protected readonly auth = inject(AuthService);

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

  /** Business navigation: dashboard and technician roster for business roles only. */
  protected readonly showBusiness = computed(
    () =>
      this.auth.isAuthenticated() &&
      (this.auth.currentUser()?.roles ?? []).some((role) => BUSINESS_ROLES.includes(role)),
  );
}
