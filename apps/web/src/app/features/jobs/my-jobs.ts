import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { JobService } from '../../core/services/job.service';
import { getApiErrorMessage } from '../../core/models/api.model';
import { jobStatusLabel } from '../../core/models/job.model';
import type { Job } from '../../core/models/job.model';

type JobsStatus = 'loading' | 'ready' | 'empty' | 'error';

/**
 * FixLink My Jobs — Stage 6B (`/my-jobs`, authenticated CUSTOMER).
 *
 * Lists the marketplace jobs the authenticated customer requested,
 * newest first. Quotes, execution and payment arrive in later stages.
 */
@Component({
  selector: 'app-my-jobs',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-jobs.html',
})
export class MyJobsComponent implements OnInit {
  private readonly api = inject(JobService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = signal<JobsStatus>('loading');
  protected readonly errorMessage = signal('');
  protected readonly jobs = signal<Job[]>([]);
  protected readonly total = signal(0);

  protected readonly statusLabel = jobStatusLabel;

  ngOnInit(): void {
    this.api
      .listMyJobs()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.jobs.set(list.items);
          this.total.set(list.total);
          this.status.set(list.items.length === 0 ? 'empty' : 'ready');
        },
        error: (error: unknown) => {
          this.errorMessage.set(getApiErrorMessage(error, 'Could not load your jobs. Please try again.'));
          this.status.set('error');
        },
      });
  }

  protected retry(): void {
    this.status.set('loading');
    this.errorMessage.set('');
    this.ngOnInit();
  }
}
