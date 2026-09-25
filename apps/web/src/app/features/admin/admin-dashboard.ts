import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { getApiErrorMessage } from '../../core/models/api.model';
import { AdminApiService } from '../../core/services/admin-api.service';
import type { AdminDashboard } from '../../core/models/admin.model';

@Component({
  selector: 'app-admin-dashboard',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="admin-page">
      <header class="admin-page-header"><div><p class="admin-eyebrow">Operations overview</p><h1>Dashboard</h1><p>Monitor FixLink activity and the work that needs attention.</p></div><span class="admin-live"><i></i> Live data</span></header>
      @if (loading()) { <div class="admin-state" role="status">Loading dashboard…</div> }
      @else if (error()) { <div class="admin-state admin-state-error" role="alert"><h2>Dashboard unavailable</h2><p>{{ error() }}</p><button class="admin-btn" type="button" (click)="load()">Try again</button></div> }
      @else if (dashboard(); as data) {
        <div class="admin-metric-grid">
          <a class="admin-metric" routerLink="/admin/users"><span>Users</span><strong>{{ data.users.total }}</strong><small>{{ data.users.active }} active · {{ data.users.pending }} pending</small></a>
          <a class="admin-metric" routerLink="/admin/jobs"><span>Jobs</span><strong>{{ data.jobs.total }}</strong><small>{{ data.jobs.open }} open · {{ data.jobs.inProgress }} in progress</small></a>
          <a class="admin-metric" routerLink="/admin/professionals"><span>Professionals</span><strong>{{ data.professionals.total }}</strong><small>{{ data.professionals.verified }} verified · {{ data.professionals.pending }} pending</small></a>
          <a class="admin-metric" routerLink="/admin/businesses"><span>Businesses</span><strong>{{ data.businesses.total }}</strong><small>{{ data.businesses.verified }} verified · {{ data.businesses.pending }} pending</small></a>
        </div>
        <div class="admin-grid-2">
           <section class="admin-card"><div class="admin-card-heading"><h2>Review queue</h2><span class="admin-count">{{ data.verification.pending + data.verification.needsInfo + data.certificates.pending + data.certificates.needsInfo }}</span></div><a routerLink="/admin/verification" [queryParams]="{ status: 'PENDING' }" class="admin-queue-row"><span>Verification requests</span><strong>{{ data.verification.pending }}</strong></a><a routerLink="/admin/verification" [queryParams]="{ status: 'NEEDS_INFO' }" class="admin-queue-row"><span>Verification needing information</span><strong>{{ data.verification.needsInfo }}</strong></a><a routerLink="/admin/certificates" [queryParams]="{ status: 'PENDING' }" class="admin-queue-row"><span>Certificates</span><strong>{{ data.certificates.pending }}</strong></a><a routerLink="/admin/certificates" [queryParams]="{ status: 'NEEDS_INFO' }" class="admin-queue-row"><span>Certificates needing information</span><strong>{{ data.certificates.needsInfo }}</strong></a><a routerLink="/admin/reports" [queryParams]="{ status: 'OPEN' }" class="admin-queue-row"><span>Reports</span><strong>{{ data.reports.open + data.reports.inReview }}</strong></a><a routerLink="/admin/disputes" [queryParams]="{ status: 'OPEN' }" class="admin-queue-row"><span>Disputes</span><strong>{{ data.disputes.open + data.disputes.inReview }}</strong></a></section>
          <section class="admin-card"><div class="admin-card-heading"><h2>Platform health</h2></div><div class="admin-health-row"><span>Customers</span><strong>{{ data.customers }}</strong></div><div class="admin-health-row"><span>Technicians</span><strong>{{ data.technicians.active }} / {{ data.technicians.total }} active</strong></div><div class="admin-health-row"><span>Services</span><strong>{{ data.services.active }} active / {{ data.services.inactive }} inactive</strong></div><div class="admin-health-row"><span>Completed jobs</span><strong>{{ data.jobs.completed }}</strong></div></section>
        </div>
      }
    </section>
  `,
})
export class AdminDashboardComponent implements OnInit {
  private readonly api = inject(AdminApiService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly dashboard = signal<AdminDashboard | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  ngOnInit(): void { this.load(); }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.getDashboard().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (value) => { this.dashboard.set(value); this.loading.set(false); },
      error: (value: unknown) => { this.error.set(getApiErrorMessage(value, 'Could not load the dashboard.')); this.loading.set(false); },
    });
  }
}
