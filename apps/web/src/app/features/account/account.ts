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

/**
 * The visual identity of one overview card: a Material Symbols icon, a colour
 * modifier, and a short action label.
 *
 * The icon and label exist so the card is identifiable WITHOUT its colour.
 * Colour alone would fail WCAG 1.4.1 (use of colour) and would leave the four
 * cards indistinguishable to a screen-reader user, who hears neither.
 */
interface StatCard {
  /** Extra class on the anchor, e.g. `fl-stat--blue`, which sets the accent. */
  tone: string;
  icon: string;
  label: string;
  value: string;
  /** Appended to the accessible name, e.g. "Total jobs, 3. View your requests." */
  action: string;
  /**
   * Where the card goes. Always set: a card that goes nowhere should not be
   * rendered as a link at all, and defaulting to `[]` would silently send the
   * user home.
   */
  href: string[];
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

  /**
   * Where the job cards link, by role.
   *
   * Each role reads a different job list, so "click the card" has to mean a
   * different destination per role. Resolved here rather than in the template
   * so the routing decision is one readable table instead of conditionals
   * scattered through markup.
   *
   * Deliberately UNFILTERED. `/my-jobs` and `/requests` ignore query
   * parameters entirely, so `?status=COMPLETED` would silently do nothing and
   * look like a broken filter. Wiring real filtering is separate work — see the
   * report on the "Completed" card being permanently 0 for professionals.
   */
  private readonly jobListRoute = computed<string[]>(() => {
    if (this.isBusiness()) return ['/business/jobs'];
    if (this.isTechnician()) return ['/technician/jobs'];
    if (this.isProvider()) return ['/requests'];
    return ['/my-jobs'];
  });

  /**
   * The overview cards, rebuilt from the loaded stats.
   *
   * "Total spent" is only offered to a CUSTOMER. It was previously shown to
   * professionals too, where it is always R0 and reads backwards: a
   * professional earns money, they do not spend it through Fixlynk. An
   * always-zero card is worse than no card.
   */
  protected readonly statCards = computed<StatCard[]>(() => {
    const s = this.stats();
    if (!s) return [];
    const href = this.jobListRoute();
    const cards: StatCard[] = [
      { tone: 'blue', icon: 'work', label: 'Total jobs', value: String(s.totalJobs), action: 'View all jobs', href },
      {
        tone: 'green',
        icon: 'task_alt',
        label: 'Completed',
        value: String(s.completedJobs),
        action: 'View all jobs',
        href,
      },
      {
        tone: 'amber',
        icon: 'pending_actions',
        label: 'In progress',
        value: String(s.inProgressJobs),
        action: 'View all jobs',
        href,
      },
    ];
    if (this.isCustomer()) {
      cards.push({
        tone: 'teal',
        icon: 'payments',
        label: 'Total spent',
        value: this.formatZar(s.totalSpent),
        action: 'View your jobs',
        href,
      });
    }
    return cards;
  });

  protected readonly memberSince = computed(() => {
    const created = this.currentUser()?.createdAt;
    if (!created) return '';
    return new Date(created).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
  });

  constructor() {
    void this.loadAccountData();
  }

  /** Re-run the role-specific load after a failure (see the error state's "Try again"). */
  retry(): void {
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
    const list = await this.jobsApi.listMyJobs(1, 50).toPromise();
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
    const list = await this.jobsApi.listProviderRequests(1, 50).toPromise();
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
    const list = await this.businessApi.listBusinessJobs({ page: 1, pageSize: 50 }).toPromise();
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
    const list = await this.technicianApi.listMyJobs({ page: 1, pageSize: 50 }).toPromise();
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
    return amount ? formatZar(amount) : '-';
  }

  protected formatDate(iso: string | null): string {
    if (!iso) return '-';
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
