import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { JobService } from '../../core/services/job.service';
import { getApiErrorMessage } from '../../core/models/api.model';
import {
  MAX_QUOTES_PER_OPEN_REQUEST,
  formatScheduledAt,
  jobStatusLabel,
  quoteStatusLabel,
} from '../../core/models/job.model';
import type { ProviderRequest } from '../../core/models/job.model';

type BoardStatus = 'loading' | 'ready' | 'empty' | 'error';

/**
 * Fixlynk provider open requests — Step 14 (`/open-requests`, authenticated
 * PROFESSIONAL / BUSINESS_OWNER / BUSINESS_MANAGER).
 *
 * The board of unaddressed marketplace requests the backend has matched to this
 * provider on BOTH their service categories and their published service areas.
 * It is deliberately separate from `/requests` (the inbox), because the two mean
 * different things:
 *
 *   /requests       requests addressed to you, plus any you have quoted
 *   /open-requests  requests nobody has chosen yet, that you may still quote
 *
 * Once a professional quotes, the request leaves this board and appears in
 * their inbox — the backend enforces that, so nothing here needs to.
 *
 * No filters are offered, and that is not an omission. The endpoint accepts
 * only `page` and `pageSize`: the match is computed server-side from the
 * caller's own profile, so there is no category, area or distance control to
 * expose. A radius filter in particular does not exist on this platform.
 */
@Component({
  selector: 'app-open-requests',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './open-requests.html',
})
export class OpenRequestsComponent implements OnInit {
  private readonly api = inject(JobService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = signal<BoardStatus>('loading');
  protected readonly errorMessage = signal('');
  protected readonly requests = signal<ProviderRequest[]>([]);
  protected readonly total = signal(0);

  protected readonly statusLabel = jobStatusLabel;
  protected readonly quoteLabel = quoteStatusLabel;
  protected readonly formatScheduled = formatScheduledAt;
  /** Exposed so the board copy cannot drift from the enforced cap. */
  protected readonly quoteCap = MAX_QUOTES_PER_OPEN_REQUEST;

  /**
   * Whether any request on the board already has quotes.
   *
   * A QUOTED status on an unaddressed request means a competitor has quoted,
   * so the first quote is no longer guaranteed and the urgency copy changes.
   * The count itself is hidden: professionals must not see each other's prices.
   */
  protected readonly someAlreadyQuoted = computed(() =>
    this.requests().some((request) => request.quotes.length > 0),
  );

  ngOnInit(): void {
    this.api
      .listOpenRequests()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.requests.set(list.items);
          this.total.set(list.total);
          this.status.set(list.items.length === 0 ? 'empty' : 'ready');
        },
        error: (error: unknown) => {
          this.errorMessage.set(getApiErrorMessage(error, 'Could not load open requests. Please try again.'));
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