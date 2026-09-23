import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { JobService } from '../../core/services/job.service';
import { getApiErrorMessage } from '../../core/models/api.model';
import { formatScheduledAt, jobStatusLabel } from '../../core/models/job.model';
import type { ProviderRequest } from '../../core/models/job.model';

type RequestsStatus = 'loading' | 'ready' | 'empty' | 'error';

/**
 * FixLink provider requests — Stage 6C (`/requests`, authenticated
 * PROFESSIONAL / BUSINESS_OWNER / BUSINESS_MANAGER) + Stage 6E
 * (ACCEPTED / SCHEDULED / IN_PROGRESS badges with the scheduled slot).
 *
 * Lists marketplace job requests addressed to the authenticated provider
 * or their business. Technicians never see this surface: the backend
 * rejects them, and navigation only exposes it to provider roles.
 */
@Component({
  selector: 'app-provider-requests',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './requests.html',
})
export class ProviderRequestsComponent implements OnInit {
  private readonly api = inject(JobService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = signal<RequestsStatus>('loading');
  protected readonly errorMessage = signal('');
  protected readonly requests = signal<ProviderRequest[]>([]);
  protected readonly total = signal(0);

  protected readonly statusLabel = jobStatusLabel;
  protected readonly formatScheduled = formatScheduledAt;

  ngOnInit(): void {
    this.api
      .listProviderRequests()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.requests.set(list.items);
          this.total.set(list.total);
          this.status.set(list.items.length === 0 ? 'empty' : 'ready');
        },
        error: (error: unknown) => {
          this.errorMessage.set(getApiErrorMessage(error, 'Could not load requests. Please try again.'));
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
