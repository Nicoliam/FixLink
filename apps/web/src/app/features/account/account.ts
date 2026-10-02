import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { JobService } from '../../core/services/job.service';
import { BusinessService } from '../../core/services/business.service';
import { TechnicianService } from '../../core/services/technician.service';
import { formatZar, jobStatusLabel } from '../../core/models/job.model';
import type { Job, JobList } from '../../core/models/job.model';
import type { BusinessJob, BusinessJobList } from '../../core/models/business.model';
import { businessJobStatusLabel } from '../../core/models/business.model';

interface AccountStats {
  totalJobs: number;
  completedJobs: number;
  inProgressJobs: number;
  totalSpent: number;
}

interface CompletedJobDisplay {
  id: string;
  reference: string;
  service: string;
  status: string;
  completedAt: string | null;
  amount: number | null;
  location: string;
}

@Component({
  selector: 'app-account',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account.html',
})
export class AccountComponent {
  private readonly auth = inject(AuthService);
  private readonly jobsApi = inject(JobService);
  private readonly businessApi = inject(BusinessService);
  private readonly technicianApi = inject(TechnicianService);
  private readonly router = inject(Router);

  protected readonly currentUser = this.auth.currentUser;
  protected readonly isLoggingOut = signal(false);
  protected readonly stats = signal<AccountStats | null>(null);
  protected readonly completedJobs = signal<CompletedJobDisplay[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly isCustomer = computed(() => this.hasRole('CUSTOMER'));
  protected readonly isProvider = computed(() => this.hasRole('PROFESSIONAL'));
  protected readonly isBusiness = computed(() => this.hasRole('BUSINESS_OWNER') || this.hasRole('BUSINESS_MANAGER'));
  protected readonly isTechnician = computed(() => this.hasRole('TECHNICIAN'));
  protected readonly isAdmin = computed(() => this.hasRole('ADMIN'));

  protected readonly memberSince = computed(() => {
    const created = this.currentUser()?.createdAt;
    if (!created) return '';
    return new Date(created).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
  });

  constructor() {
    void this.loadAccountData();
  }

  private hasRole(role: string): boolean {
    return (this.currentUser()?.roles ?? []).includes(role as never);
  }

  private async loadAccountData(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      if (this.isCustomer()) {
        await this.loadCustomerData();
      } else if (this.isProvider()) {
        await this.loadProviderData();
      } else if (this.isBusiness()) {
        await this.loadBusinessData();
      } else if (this.isTechnician()) {
        await this.loadTechnicianData();
      } else {
        this.stats.set({ totalJobs: 0, completedJobs: 0, inProgressJobs: 0, totalSpent: 0 });
      }
    } catch {
      this.error.set('Could not load your account data. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadCustomerData(): Promise<void> {
    const list = await this.jobsApi.listMyJobs(1, 100).toPromise();
    const jobs = list?.items ?? [];
    const completed = jobs.filter((j) => j.status === 'COMPLETED' || j.status === 'CONFIRMED' || j.status === 'CLOSED');
    const inProgress = jobs.filter((j) => ['REQUESTED', 'QUOTED', 'ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'AWAITING_PARTS'].includes(j.status));
    const totalSpent = completed.reduce((sum, j) => sum + (j.agreedAmount ?? 0), 0);

    this.stats.set({
      totalJobs: jobs.length,
      completedJobs: completed.length,
      inProgressJobs: inProgress.length,
      totalSpent,
    });

    this.completedJobs.set(
      completed.slice(0, 10).map((j) => this.toCompletedJobDisplay(j)),
    );
  }

  private async loadProviderData(): Promise<void> {
    const list = await this.jobsApi.listProviderRequests(1, 100).toPromise();
    const jobs = list?.items ?? [];
    const completed = jobs.filter((j) => j.status === 'COMPLETED' || j.status === 'CONFIRMED' || j.status === 'CLOSED');
    const inProgress = jobs.filter((j) => ['REQUESTED', 'QUOTED', 'ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'AWAITING_PARTS'].includes(j.status));

    this.stats.set({
      totalJobs: jobs.length,
      completedJobs: completed.length,
      inProgressJobs: inProgress.length,
      totalSpent: 0,
    });

    this.completedJobs.set(
      completed.slice(0, 10).map((j) => ({
        id: j.id,
        reference: j.reference,
        service: j.service.name,
        status: jobStatusLabel(j.status),
        completedAt: j.completedAt ?? j.closedAt ?? null,
        amount: null,
        location: j.city ?? j.location,
      })),
    );
  }

  private async loadBusinessData(): Promise<void> {
    const list = await this.businessApi.listBusinessJobs({ page: 1, pageSize: 100 }).toPromise();
    const jobs = list?.items ?? [];
    const completed = jobs.filter((j) => j.status === 'COMPLETED' || j.status === 'CONFIRMED' || j.status === 'CLOSED');
    const inProgress = jobs.filter((j) => ['REQUESTED', 'QUOTED', 'ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'AWAITING_PARTS'].includes(j.status));

    this.stats.set({
      totalJobs: jobs.length,
      completedJobs: completed.length,
      inProgressJobs: inProgress.length,
      totalSpent: 0,
    });

    this.completedJobs.set(
      completed.slice(0, 10).map((j) => this.toBusinessCompletedJobDisplay(j)),
    );
  }

  private async loadTechnicianData(): Promise<void> {
    const list = await this.technicianApi.listMyJobs({ page: 1, pageSize: 100 }).toPromise();
    const jobs = list?.items ?? [];
    const completed = jobs.filter((j) => j.status === 'COMPLETED' || j.status === 'CONFIRMED' || j.status === 'CLOSED');
    const inProgress = jobs.filter((j) => ['REQUESTED', 'QUOTED', 'ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'AWAITING_PARTS'].includes(j.status));

    this.stats.set({
      totalJobs: jobs.length,
      completedJobs: completed.length,
      inProgressJobs: inProgress.length,
      totalSpent: 0,
    });

    this.completedJobs.set(
      completed.slice(0, 10).map((j) => this.toBusinessCompletedJobDisplay(j)),
    );
  }

  private toCompletedJobDisplay(job: Job): CompletedJobDisplay {
    return {
      id: job.id,
      reference: job.reference,
      service: job.service.name,
      status: jobStatusLabel(job.status),
      completedAt: job.completedAt ?? job.closedAt ?? null,
      amount: job.agreedAmount ?? null,
      location: job.city ?? job.location,
    };
  }

  private toBusinessCompletedJobDisplay(job: BusinessJob): CompletedJobDisplay {
    return {
      id: job.id,
      reference: job.reference,
      service: job.service.name,
      status: businessJobStatusLabel(job.status),
      completedAt: null,
      amount: null,
      location: job.city ?? job.addressLine1 ?? '',
    };
  }

  protected formatZar(amount: number | null): string {
    return amount ? formatZar(amount) : '—';
  }

  protected formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  logout(): void {
    if (this.isLoggingOut()) return;
    this.isLoggingOut.set(true);
    this.auth.logout().subscribe({
      next: () => void this.router.navigate(['/']),
      error: () => void this.router.navigate(['/']),
    });
  }
}
