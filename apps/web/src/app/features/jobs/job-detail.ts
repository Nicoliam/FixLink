import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { JobService } from '../../core/services/job.service';
import { getApiErrorCode, getApiErrorMessage } from '../../core/models/api.model';
import {
  formatScheduledAt,
  formatZar,
  isCustomerMutable,
  jobProviderLabel,
  jobStatusLabel,
  quoteStatusLabel,
  workPhaseLabel,
} from '../../core/models/job.model';
import type { Job, JobImage, JobUpdate, Quote, TimelineEvent, WorkPhase } from '../../core/models/job.model';

type JobDetailStatus = 'loading' | 'ready' | 'error' | 'not-found';

type WorkStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Fixlynk job detail — Stage 6B (`/my-jobs/:id`, authenticated CUSTOMER)
 * + Stage 6C (read-only received quotes) + Stage 6D (customer quote
 * acceptance: QUOTED → ACCEPTED) + Stage 6E (read-only schedule and
 * in-progress states: ACCEPTED → SCHEDULED → IN_PROGRESS) + Stage 6F
 * (read-only work documentation, completion confirmation and timeline:
 * IN_PROGRESS → COMPLETED → CONFIRMED → CLOSED).
 *
 * Shows the request, its quotes, and — for QUOTED jobs — an Accept Quote
 * action per eligible (SUBMITTED) quote with a confirmation step. Once
 * accepted, the customer sees the agreed price, the provider-scheduled
 * date and time, and the in-progress state. For IN_PROGRESS jobs the
 * customer sees the provider's Job Progress (BEFORE/DURING/AFTER photos
 * and notes, read-only); for COMPLETED jobs the completion record plus a
 * single Confirm Completion action (which closes the job server-side);
 * CLOSED jobs are read-only history. The backend performs every
 * transition and validates ownership server-side; acceptance only
 * records the agreed price (MVP: payment is arranged directly with the
 * professional, never processed by Fixlynk).
 */
@Component({
  selector: 'app-job-detail',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './job-detail.html',
})
export class JobDetailComponent implements OnInit, OnDestroy {
  private readonly api = inject(JobService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  protected readonly status = signal<JobDetailStatus>('loading');
  protected readonly errorMessage = signal('');
  protected readonly job = signal<Job | null>(null);
  protected readonly pendingQuoteId = signal<string | null>(null);
  protected readonly accepting = signal(false);
  protected readonly acceptError = signal<string | null>(null);

  protected readonly statusLabel = jobStatusLabel;
  /** Step 14 — "Matching professionals" while an open request is being quoted. */
  protected readonly providerLabel = jobProviderLabel;
  protected readonly quoteLabel = quoteStatusLabel;
  protected readonly phaseLabel = workPhaseLabel;
  protected readonly formatAmount = formatZar;
  protected readonly formatScheduled = formatScheduledAt;

  /** Stage 6F work record (photos, notes, timeline) — read-only here. */
  protected readonly workStatus = signal<WorkStatus>('idle');
  protected readonly workError = signal('');
  protected readonly images = signal<JobImage[]>([]);
  protected readonly updates = signal<JobUpdate[]>([]);
  protected readonly timeline = signal<TimelineEvent[]>([]);
  protected readonly photoUrls = signal<Record<string, string>>({});

  /** Step 15 — customer controls, available only while the job is REQUESTED/QUOTED. */
  protected readonly editForm = this.fb.nonNullable.group({
    description: ['', [Validators.required, Validators.minLength(25), Validators.maxLength(4000)]],
    location: ['', [Validators.required, Validators.maxLength(255)]],
    preferredDate: [''],
  });
  protected readonly editing = signal(false);
  protected readonly savingEdit = signal(false);
  protected readonly editError = signal<string | null>(null);
  /** Set after an edit that left live quotes on an earlier description. */
  protected readonly quotesStaleNotice = signal(false);

  protected readonly confirmingCancel = signal(false);
  protected readonly cancelling = signal(false);
  protected readonly cancelError = signal<string | null>(null);

  protected readonly confirmingDelete = signal(false);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<string | null>(null);

  protected readonly showConfirm = signal(false);
  protected readonly confirming = signal(false);
  protected readonly confirmError = signal<string | null>(null);
  protected readonly confirmDeclined = signal(false);

  /** The accepted quote, once the job is ACCEPTED. */
  protected readonly acceptedQuote = computed<Quote | null>(() => {
    const quotes = this.job()?.quotes ?? [];
    return quotes.find((quote) => quote.status === 'ACCEPTED') ?? null;
  });

  /** The provider completion note (the AFTER record), once completed. */
  protected readonly completionNote = computed<string | null>(() => {
    const after = this.updates().filter((update) => update.phase === 'AFTER');
    return after.length > 0 ? (after[after.length - 1] as JobUpdate).note : null;
  });

  protected readonly completionAt = computed<string | null>(() => this.job()?.completedAt ?? null);
  protected readonly closedAt = computed<string | null>(() => this.job()?.closedAt ?? null);

  protected imagesFor(phase: WorkPhase): JobImage[] {
    return this.images().filter((image) => image.phase === phase);
  }

  protected notesFor(phase: WorkPhase): JobUpdate[] {
    return this.updates().filter((update) => update.phase === phase);
  }

  protected photoUrl(imageId: string): string {
    return this.photoUrls()[imageId] ?? '';
  }

  /** Confirm Completion is shown only for COMPLETED jobs. */
  protected canConfirm(): boolean {
    return this.job()?.status === 'COMPLETED';
  }

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
          this.loadWork(job);
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

  ngOnDestroy(): void {
    for (const url of Object.values(this.photoUrls())) {
      URL.revokeObjectURL(url);
    }
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

  /**
   * Step 15 — may this customer still change the request?
   *
   * Delegated to `isCustomerMutable` so the UI and the backend agree on the
   * cut-off. The backend remains the enforcement point; this only stops the
   * screen offering an action that would come back 409.
   */
  protected canMutate(): boolean {
    const detail = this.job();
    return detail !== null && isCustomerMutable(detail);
  }

  /** Open the inline edit form, seeded with the current values. */
  protected startEdit(): void {
    const detail = this.job();
    if (!detail || !this.canMutate()) return;
    this.editForm.setValue({
      description: detail.description,
      location: detail.location,
      preferredDate: detail.preferredDate ?? '',
    });
    this.editError.set(null);
    this.editing.set(true);
  }

  protected cancelEdit(): void {
    if (this.savingEdit()) return;
    this.editing.set(false);
    this.editError.set(null);
  }

  protected saveEdit(): void {
    const detail = this.job();
    if (!detail || this.savingEdit() || !this.canMutate()) return;
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      this.editError.set('Fix the highlighted fields before saving.');
      return;
    }
    const raw = this.editForm.getRawValue();
    this.savingEdit.set(true);
    this.editError.set(null);
    // Only the editable fields are sent. An empty date is sent as null to
    // CLEAR that preference; an omitted key would leave it untouched.
    //
    // `preferredTime` is deliberately never sent: the API does not return it,
    // so the form cannot show the current value, and sending a blank would
    // erase a preference the customer never sees. Omitting the key leaves it
    // exactly as submitted.
    this.api
      .updateJob(detail.id, {
        description: raw.description.trim(),
        location: raw.location.trim(),
        preferredDate: raw.preferredDate ? raw.preferredDate : null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.savingEdit.set(false);
          this.editing.set(false);
          this.job.set(result.job);
          this.quotesStaleNotice.set(result.quotedRequestsChanged);
        },
        error: (error: unknown) => {
          this.savingEdit.set(false);
          this.editError.set(getApiErrorMessage(error, 'Could not save your changes. Please try again.'));
        },
      });
  }

  /** Dismiss the "your quotes may be out of date" advisory. */
  protected dismissStaleNotice(): void {
    this.quotesStaleNotice.set(false);
  }

  protected startCancel(): void {
    if (!this.canMutate()) return;
    this.cancelError.set(null);
    this.confirmingCancel.set(true);
  }

  protected dismissCancel(): void {
    if (this.cancelling()) return;
    this.confirmingCancel.set(false);
    this.cancelError.set(null);
  }

  /**
   * Cancel keeps the job in the customer's history at CANCELLED. It is the
   * action for "I am going elsewhere", as opposed to delete below.
   */
  protected confirmCancel(): void {
    const detail = this.job();
    if (!detail || this.cancelling() || !this.canMutate()) return;
    this.cancelling.set(true);
    this.cancelError.set(null);
    this.api
      .cancelJob(detail.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (job) => {
          this.cancelling.set(false);
          this.confirmingCancel.set(false);
          this.editing.set(false);
          this.job.set(job);
        },
        error: (error: unknown) => {
          this.cancelling.set(false);
          this.cancelError.set(getApiErrorMessage(error, 'Could not cancel this request. Please try again.'));
        },
      });
  }

  protected startDelete(): void {
    if (!this.canMutate()) return;
    this.deleteError.set(null);
    this.confirmingDelete.set(true);
  }

  protected dismissDelete(): void {
    if (this.deleting()) return;
    this.confirmingDelete.set(false);
    this.deleteError.set(null);
  }

  /**
   * Delete hides the request from both sides. There is no undo, so the
   * confirm step spells that out rather than offering a one-click removal.
   */
  protected confirmDelete(): void {
    const detail = this.job();
    if (!detail || this.deleting() || !this.canMutate()) return;
    this.deleting.set(true);
    this.deleteError.set(null);
    this.api
      .deleteJob(detail.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleting.set(false);
          this.confirmingDelete.set(false);
          // The job is gone; staying put would show a 404. Back to the list.
          void this.router.navigate(['/my-jobs']);
        },
        error: (error: unknown) => {
          this.deleting.set(false);
          this.deleteError.set(getApiErrorMessage(error, 'Could not remove this request. Please try again.'));
        },
      });
  }

  protected goToMyJobs(): void {
    void this.router.navigate(['/my-jobs']);
  }

  /** Load the read-only work record for execution-stage jobs. */
  protected loadWork(job: Job): void {
    if (job.status !== 'IN_PROGRESS' && job.status !== 'COMPLETED' && job.status !== 'CONFIRMED' && job.status !== 'CLOSED') {
      this.workStatus.set('idle');
      return;
    }
    this.workStatus.set('loading');
    this.workError.set('');
    forkJoin({
      images: this.api.listJobImages(job.id).pipe(catchError(() => of(null))),
      updates: this.api.listJobUpdates(job.id).pipe(catchError(() => of(null))),
      timeline: this.api.getJobTimeline(job.id).pipe(catchError(() => of(null))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result.images === null || result.updates === null || result.timeline === null) {
          this.workError.set('Could not load the work record. Please try again.');
          this.workStatus.set('error');
          return;
        }
        this.images.set(result.images);
        this.updates.set(result.updates);
        this.timeline.set(result.timeline.events);
        this.workStatus.set('ready');
        this.loadPhotoBlobs(job.id, result.images);
      });
  }

  private loadPhotoBlobs(jobId: string, images: JobImage[]): void {
    for (const image of images) {
      if (this.photoUrls()[image.id]) continue;
      this.api
        .fetchImageBlob(jobId, image.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (blob) => {
            this.photoUrls.update((current) => ({ ...current, [image.id]: URL.createObjectURL(blob) }));
          },
          error: () => {
            // A single unreadable photo must not break the work record.
          },
        });
    }
  }

  protected retryWork(): void {
    const job = this.job();
    if (job) this.loadWork(job);
  }

  protected startConfirm(): void {
    this.showConfirm.set(true);
    this.confirmError.set(null);
    this.confirmDeclined.set(false);
  }

  protected cancelConfirm(): void {
    if (this.confirming()) return;
    this.showConfirm.set(false);
    this.confirmError.set(null);
  }

  /**
   * "Not Yet" never changes the job state — it guides the customer to
   * contact the provider instead of inventing a new status.
   */
  protected declineConfirm(): void {
    if (this.confirming()) return;
    this.showConfirm.set(false);
    this.confirmDeclined.set(true);
  }

  protected confirmCompletion(): void {
    const detail = this.job();
    if (!detail || this.confirming() || !this.canConfirm()) return;
    this.confirming.set(true);
    this.confirmError.set(null);
    this.api
      .confirmJob(detail.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (job) => {
          this.confirming.set(false);
          this.showConfirm.set(false);
          this.confirmDeclined.set(false);
          this.job.set(job);
        },
        error: (error: unknown) => {
          this.confirming.set(false);
          this.confirmError.set(getApiErrorMessage(error, 'Could not confirm the job. Please try again.'));
        },
      });
  }
}
