import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BusinessService } from '../../core/services/business.service';
import { getApiErrorMessage } from '../../core/models/api.model';
import {
  businessJobBoardLabel,
  businessJobPriorityLabel,
  businessJobStatusLabel,
} from '../../core/models/business.model';
import type {
  BusinessBoardJob,
  BusinessBoardSummary,
  BusinessJobBoard,
  BusinessJobBoardSort,
  BusinessJobPriority,
  Technician,
} from '../../core/models/business.model';

type JobsStatus = 'loading' | 'ready' | 'empty' | 'error';

const BOARD_TABS: readonly BusinessJobBoard[] = [
  'ALL',
  'NEW',
  'ASSIGNED',
  'SCHEDULED',
  'IN_PROGRESS',
  'AWAITING_PARTS',
  'COMPLETED',
  'CANCELLED',
  'HISTORY',
];

const PRIORITY_OPTIONS: readonly ('' | BusinessJobPriority)[] = ['', 'LOW', 'NORMAL', 'HIGH', 'URGENT'];

const SORT_OPTIONS: readonly BusinessJobBoardSort[] = ['RECENT', 'SCHEDULED', 'PRIORITY'];

/**
 * FixLink business job board — Stage 7G (`/business/jobs`, authenticated
 * BUSINESS_OWNER / BUSINESS_MANAGER).
 *
 * The operational board for the business's INTERNAL jobs (marketplace
 * jobs never appear here). Board tabs derive from existing job state —
 * NEW is REQUESTED, ASSIGNED means an active technician assignment
 * exists, SCHEDULED is derived from the `scheduled_at` visit slot and
 * HISTORY is the terminal set — never new statuses. Filtering is
 * server-backed (board, technician, priority, creation-date range,
 * search, sort) with business isolation enforced by the backend; the
 * role checks in navigation only decide which links are offered.
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
  protected readonly jobs = signal<BusinessBoardJob[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(20);
  protected readonly board = signal<BusinessJobBoard>('ALL');
  protected readonly technicianId = signal('');
  protected readonly priority = signal<'' | BusinessJobPriority>('');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly sort = signal<BusinessJobBoardSort>('RECENT');
  protected readonly search = signal('');
  protected readonly technicians = signal<Technician[]>([]);
  protected readonly summary = signal<BusinessBoardSummary | null>(null);

  protected readonly statusLabel = businessJobStatusLabel;
  protected readonly priorityLabel = businessJobPriorityLabel;
  protected readonly boardLabel = businessJobBoardLabel;
  protected readonly boardTabs = BOARD_TABS;
  protected readonly priorityOptions = PRIORITY_OPTIONS;
  protected readonly sortOptions = SORT_OPTIONS;

  ngOnInit(): void {
    this.loadTechnicians();
    this.loadSummary();
    this.load();
  }

  protected load(targetPage = 1): void {
    this.status.set('loading');
    this.errorMessage.set('');
    const board = this.board();
    this.api
      .listBoardJobs({
        ...(board !== 'ALL' ? { board } : {}),
        ...(this.technicianId().trim() ? { technicianId: this.technicianId().trim() } : {}),
        ...(this.priority() ? { priority: this.priority() } : {}),
        ...(this.from().trim() ? { from: this.from().trim() } : {}),
        ...(this.to().trim() ? { to: this.to().trim() } : {}),
        ...(this.sort() !== 'RECENT' ? { sort: this.sort() } : {}),
        ...(this.search().trim() ? { search: this.search().trim() } : {}),
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

  private loadTechnicians(): void {
    this.api
      .listTechnicians()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => this.technicians.set(list.items),
        error: () => this.technicians.set([]),
      });
  }

  private loadSummary(): void {
    this.api
      .getBusinessBoardSummary()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => this.summary.set(summary),
        error: () => this.summary.set(null),
      });
  }

  protected selectBoard(tab: BusinessJobBoard): void {
    if (this.board() === tab) return;
    this.board.set(tab);
    this.load(1);
  }

  protected applyFilters(): void {
    this.load(1);
  }

  protected clearFilters(): void {
    this.board.set('ALL');
    this.technicianId.set('');
    this.priority.set('');
    this.from.set('');
    this.to.set('');
    this.sort.set('RECENT');
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

  protected boardCount(tab: BusinessJobBoard): number | null {
    const summary = this.summary();
    if (!summary) return null;
    switch (tab) {
      case 'ALL':
        return summary.total;
      case 'NEW':
        return summary.requested;
      case 'ASSIGNED':
        return summary.assigned;
      case 'SCHEDULED':
        return summary.scheduled;
      case 'IN_PROGRESS':
        return summary.inProgress;
      case 'AWAITING_PARTS':
        return summary.awaitingParts;
      case 'COMPLETED':
        return summary.completed;
      case 'CANCELLED':
        return summary.cancelled;
      case 'HISTORY':
        return summary.history;
    }
  }

  protected priorityFilterLabel(value: '' | BusinessJobPriority): string {
    return value === '' ? 'All priorities' : businessJobPriorityLabel(value);
  }

  protected sortLabel(value: BusinessJobBoardSort): string {
    switch (value) {
      case 'RECENT':
        return 'Most recent';
      case 'SCHEDULED':
        return 'Scheduled visit';
      case 'PRIORITY':
        return 'Priority';
    }
  }

  protected emptyTitle(): string {
    return this.board() === 'ALL' ? 'No internal jobs yet' : 'No jobs in this view yet';
  }

  protected technicianLabel(job: BusinessBoardJob): string {
    return job.assignment ? job.assignment.technician.displayName : 'Unassigned';
  }

  protected scheduledLabel(job: BusinessBoardJob): string {
    return job.scheduledAt ?? 'Not scheduled yet';
  }

  protected partsLabel(job: BusinessBoardJob): string {
    return job.partsOutstanding === 1 ? '1 part outstanding' : `${job.partsOutstanding} parts outstanding`;
  }
}
