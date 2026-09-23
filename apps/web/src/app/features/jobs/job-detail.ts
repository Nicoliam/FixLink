import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { JobService } from '../../core/services/job.service';
import { getApiErrorCode, getApiErrorMessage } from '../../core/models/api.model';
import { formatZar, jobStatusLabel } from '../../core/models/job.model';
import type { Job } from '../../core/models/job.model';

type JobDetailStatus = 'loading' | 'ready' | 'error' | 'not-found';

/**
 * FixLink job detail — Stage 6B (`/my-jobs/:id`, authenticated CUSTOMER).
 *
 * Shows the request: provider, service, description, location, preferred
 * date/time, status and created date. Stage 6C adds the received-quote
 * section (read-only — quote acceptance arrives in a later stage).
 */
@Component({
  selector: 'app-job-detail',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './job-detail.html',
})
export class JobDetailComponent implements OnInit {
  private readonly api = inject(JobService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = signal<JobDetailStatus>('loading');
  protected readonly errorMessage = signal('');
  protected readonly job = signal<Job | null>(null);

  protected readonly statusLabel = jobStatusLabel;
  protected readonly formatAmount = formatZar;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    if (!id.trim()) {
      this.status.set('not-found');
      return;
    }
    this.api
      .getJob(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (job) => {
          this.job.set(job);
          this.status.set('ready');
        },
        error: (error: unknown) => {
          if (getApiErrorCode(error) === 'NOT_FOUND') {
            this.status.set('not-found');
          } else {
            this.errorMessage.set(getApiErrorMessage(error, 'Could not load this job. Please try again.'));
            this.status.set('error');
          }
        },
      });
  }

  protected retry(): void {
    this.status.set('loading');
    this.errorMessage.set('');
    this.ngOnInit();
  }

  protected goToMyJobs(): void {
    void this.router.navigate(['/my-jobs']);
  }
}
