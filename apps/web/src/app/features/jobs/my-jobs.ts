import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { JobService } from '../../core/services/job.service';
import { AuthService } from '../../core/services/auth.service';
import { getApiErrorMessage } from '../../core/models/api.model';
import { formatScheduledAt, jobProviderLabel, jobStatusLabel } from '../../core/models/job.model';
import type { Job } from '../../core/models/job.model';

type JobsStatus = 'loading' | 'ready' | 'empty' | 'error';

/**
 * Fixlynk My Jobs — Stage 6B (`/my-jobs`, authenticated CUSTOMER) +
 * Stage 6E (SCHEDULED / IN_PROGRESS badges with the scheduled slot).
 *
 * Lists the marketplace jobs the authenticated customer requested, newest
 * first, and launches the four-step request wizard at `/request-job`.
 *
 * STEP 14 — NO SAVED PROFESSIONALS HERE
 *
 * This page used to list the customer's saved professionals as an alternative
 * way to start a request. That is removed: this page tracks work, and who
 * someone has bookmarked only matters at the moment they are choosing one.
 * Step 02 of the wizard offers them there — first, when they have any — so
 * removing it here loses no capability and drops a second copy of the same
 * list, along with the extra loading and error states it needed.
 *
 * Because `providerId` is now optional, a customer with no saved professional
 * is not blocked either: step 02 can be skipped and the request is posted as
 * an open one (see request-job.ts).
 */
@Component({
  selector: 'app-my-jobs',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-jobs.html',
})
export class MyJobsComponent implements OnInit {
  private readonly api = inject(JobService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = signal<JobsStatus>('loading');
  protected readonly errorMessage = signal('');
  protected readonly jobs = signal<Job[]>([]);
  protected readonly total = signal(0);

  /**
   * Only a CUSTOMER may start a request: `POST /api/v1/jobs` is CUSTOMER-only
   * server-side, so offering the wizard to a professional would lead to a 403
   * one tap later. This gate is why the section is hidden rather than shown
   * broken to another role.
   */
  protected readonly canRequest = computed(
    () => this.auth.isAuthenticated() && (this.auth.currentUser()?.roles ?? []).includes('CUSTOMER'),
  );

  protected readonly statusLabel = jobStatusLabel;
  /** Step 14 — "Matching professionals" while an open request is being quoted. */
  protected readonly providerLabel = jobProviderLabel;
  protected readonly formatScheduled = formatScheduledAt;

  ngOnInit(): void {
    this.loadJobs();
  }

  protected retry(): void {
    this.status.set('loading');
    this.errorMessage.set('');
    this.loadJobs();
  }

  private loadJobs(): void {
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
}