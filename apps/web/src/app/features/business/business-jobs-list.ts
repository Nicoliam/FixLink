import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BusinessService } from '../../core/services/business.service';
import { getApiErrorMessage } from '../../core/models/api.model';
import { businessJobPriorityLabel, businessJobStatusLabel } from '../../core/models/business.model';
import type { BusinessJob } from '../../core/models/business.model';

type JobsStatus = 'loading' | 'ready' | 'empty' | 'error';

const STATUS_OPTIONS = ['', 'REQUESTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

/**
 * FixLink business internal jobs — Stage 7B (`/business/jobs`,
 * authenticated BUSINESS_OWNER / BUSINESS_MANAGER).
 *
 * Lists INTERNAL jobs belonging to the caller's business (marketplace
 * jobs never appear here) with status/search filters and pagination.
 * Technician assignment and parts arrive in later stages, so no
 * assignment controls are shown. Authorization is backend-enforced;
 * the role checks in navigation only decide which links are offered.
 */
@Component({
  selector: 'app-business-jobs-list',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './business-jobs-list.html',
})
export class BusinessJobsListComponent implements OnInit {
  private readonly api = inject(BusinessService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = signal<JobsStatus>('loading');
  protected readonly errorMessage = signal('');
  protected readonly jobs = signal<BusinessJob[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(20);
  protected readonly statusFilter = signal('');
  protected readonly search = signal('');

  protected readonly statusLabel = businessJobStatusLabel;
  protected readonly priorityLabel = businessJobPriorityLabel;
  protected readonly statusOptions = STATUS_OPTIONS;

  ngOnInit(): void {
    this.load();
  }

  protected load(targetPage = 1): void {
    this.status.set('loading');
    this.errorMessage.set('');
    const filter = this.statusFilter().trim();
    const search = this.search().trim();
    this.api
      .listBusinessJobs({
        ...(filter ? { status: filter } : {}),
        ...(search ? { search } : {}),
        page: targetPage,
        pageSize: this.pageSize(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.jobs.set(list.items);
          this.total.set(list.total);
          this.page.set(list.page);
          this.pageSize.set(list.pageSize);
          this.status.set(list.items.length === 0 ? 'empty' : 'ready');
        },
        error: (error: unknown) => {
          this.errorMessage.set(getApiErrorMessage(error, 'Could not load jobs. Please try again.'));
          this.status.set('error');
        },
      });
  }

  protected applyFilters(): void {
    this.load(1);
  }

  protected clearFilters(): void {
    this.statusFilter.set('');
    this.search.set('');
    this.load(1);
  }

  protected nextPage(): void {
    if (this.hasNextPage()) this.load(this.page() + 1);
  }

  protected previousPage(): void {
    if (this.page() > 1) this.load(this.page() - 1);
  }

  protected hasNextPage(): boolean {
    return this.page() * this.pageSize() < this.total();
  }

  protected statusFilterLabel(value: string): string {
    return value === '' ? 'All statuses' : businessJobStatusLabel(value as Parameters<typeof businessJobStatusLabel>[0]);
  }

  protected dateLabel(job: BusinessJob): string {
    return job.scheduledAt ?? job.createdAt;
  }
}
