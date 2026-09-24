import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TechnicianService } from '../../core/services/technician.service';
import { getApiErrorMessage } from '../../core/models/api.model';
import { businessJobPriorityLabel, businessJobStatusLabel } from '../../core/models/business.model';
import type { BusinessJobDetail } from '../../core/models/business.model';

type DetailStatus = 'loading' | 'ready' | 'error';

/**
 * FixLink technician job detail — Stage 7C (`/technician/jobs/:id`,
 * authenticated TECHNICIAN).
 *
 * Shows the service, customer, contact details, description, address,
 * priority, schedule, status and timeline for one INTERNAL job with
 * an active assignment to the caller. The backend enforces access:
 * opening another technician's job (for example by editing the URL)
 * reads as not found. Execution updates, parts, approvals and
 * notifications arrive in later stages and are not shown.
 */
@Component({
  selector: 'app-technician-job-detail',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './technician-job-detail.html',
})
export class TechnicianJobDetailComponent implements OnInit {
  private readonly api = inject(TechnicianService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = signal<DetailStatus>('loading');
  protected readonly errorMessage = signal('');
  protected readonly detail = signal<BusinessJobDetail | null>(null);

  protected readonly statusText = businessJobStatusLabel;
  protected readonly priorityText = businessJobPriorityLabel;

  ngOnInit(): void {
    this.load();
  }

  protected jobId(): string {
    return this.route.snapshot.paramMap.get('id') ?? '';
  }

  protected load(): void {
    this.status.set('loading');
    this.errorMessage.set('');
    this.api
      .getMyJob(this.jobId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          this.detail.set(detail);
          this.status.set('ready');
        },
        error: (error: unknown) => {
          this.errorMessage.set(getApiErrorMessage(error, 'Could not load the job. Please try again.'));
          this.status.set('error');
        },
      });
  }
}
