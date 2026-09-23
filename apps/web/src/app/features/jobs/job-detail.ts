import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { JobService } from '../../core/services/job.service';
import { getApiErrorCode, getApiErrorMessage } from '../../core/models/api.model';
import { formatZar, jobStatusLabel, quoteStatusLabel } from '../../core/models/job.model';
import type { Job, Quote } from '../../core/models/job.model';

type JobDetailStatus = 'loading' | 'ready' | 'error' | 'not-found';

/**
 * FixLink job detail — Stage 6B (`/my-jobs/:id`, authenticated CUSTOMER)
 * + Stage 6C (read-only received quotes) + Stage 6D (customer quote
 * acceptance: QUOTED → ACCEPTED).
 *
 * Shows the request, its quotes, and — for QUOTED jobs — an Accept Quote
 * action per eligible (SUBMITTED) quote with a confirmation step. The
 * backend performs the transition and validates ownership server-side;
 * acceptance only records the agreed price (MVP: payment is arranged
 * directly with the professional, never processed by FixLink).
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
  protected readonly pendingQuoteId = signal<string | null>(null);
  protected readonly accepting = signal(false);
  protected readonly acceptError = signal<string | null>(null);

  protected readonly statusLabel = jobStatusLabel;
  protected readonly quoteLabel = quoteStatusLabel;
  protected readonly formatAmount = formatZar;

  /** The accepted quote, once the job is ACCEPTED. */
  protected readonly acceptedQuote = computed<Quote | null>(() => {
    const quotes = this.job()?.quotes ?? [];
    return quotes.find((quote) => quote.status === 'ACCEPTED') ?? null;
  });

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

  /**
   * The Accept action is shown only for eligible quotes on QUOTED jobs.
   * Visibility never depends on the in-flight `accepting` flag — the
   * confirm step stays on screen (disabled, "Accepting…") while the
   * request runs instead of vanishing.
   */
  protected canAccept(quote: Quote): boolean {
    return this.job()?.status === 'QUOTED' && quote.status === 'SUBMITTED';
  }

  protected startAccept(quoteId: string): void {
    this.pendingQuoteId.set(quoteId);
    this.acceptError.set(null);
  }

  protected cancelAccept(): void {
    if (this.accepting()) return;
    this.pendingQuoteId.set(null);
    this.acceptError.set(null);
  }

  protected confirmAccept(quote: Quote): void {
    const detail = this.job();
    if (!detail || this.accepting()) return;
    this.accepting.set(true);
    this.acceptError.set(null);
    this.api
      .acceptQuote(detail.id, quote.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.accepting.set(false);
          this.pendingQuoteId.set(null);
          this.job.set(result.job);
        },
        error: (error: unknown) => {
          this.accepting.set(false);
          this.acceptError.set(getApiErrorMessage(error, 'Could not accept the quote. Please try again.'));
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
