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
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { JobService } from '../../core/services/job.service';
import { getApiErrorCode, getApiErrorMessage } from '../../core/models/api.model';
import {
  formatScheduledAt,
  formatZar,
  jobStatusLabel,
  quoteStatusLabel,
  workPhaseLabel,
} from '../../core/models/job.model';
import type { JobImage, JobUpdate, ProviderRequest, Quote, TimelineEvent, WorkPhase } from '../../core/models/job.model';

type RequestDetailStatus = 'loading' | 'ready' | 'error' | 'not-found';

type WorkStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * FixLink provider request detail — Stage 6C (`/requests/:id`) + Stage
 * 6D (accepted-quote display) + Stage 6E (scheduling and start) +
 * Stage 6F (work documentation and completion: IN_PROGRESS →
 * COMPLETED, read-only afterwards).
 *
 * Shows the request context needed to quote, the submitted quote when one
 * exists, and the quote form for REQUESTED jobs. When the customer
 * accepts the quote (QUOTED → ACCEPTED) the provider sees the Accepted
 * state with the agreed amount plus a scheduling section (ACCEPTED →
 * SCHEDULED); a scheduled job shows a Start action (SCHEDULED →
 * IN_PROGRESS). An in-progress job shows Job Progress (BEFORE/DURING/
 * AFTER photos and notes) plus a completion section where the required
 * completion note enables the Complete Job action (IN_PROGRESS →
 * COMPLETED). The backend performs every transition and validates
 * provider association server-side — the provider never accepts or
 * changes quote state, and never sees the customer confirmation action.
 */
@Component({
  selector: 'app-request-detail',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './request-detail.html',
})
export class RequestDetailComponent implements OnInit, OnDestroy {
  private readonly api = inject(JobService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = signal<RequestDetailStatus>('loading');
  protected readonly errorMessage = signal('');
  protected readonly request = signal<ProviderRequest | null>(null);
  protected readonly submitted = signal(false);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly createdQuote = signal<Quote | null>(null);

  protected readonly statusLabel = jobStatusLabel;
  protected readonly quoteLabel = quoteStatusLabel;
  protected readonly phaseLabel = workPhaseLabel;
  protected readonly formatAmount = formatZar;
  protected readonly formatScheduled = formatScheduledAt;

  /** The customer-accepted quote, when acceptance has happened. */
  protected readonly acceptedQuote = computed<Quote | null>(() => {
    const quotes = this.request()?.quotes ?? [];
    return quotes.find((quote) => quote.status === 'ACCEPTED') ?? null;
  });

  /** Scheduling section is shown only for ACCEPTED jobs with an accepted quote. */
  protected readonly canSchedule = computed<boolean>(() => {
    const detail = this.request();
    return detail?.status === 'ACCEPTED' && this.acceptedQuote() !== null;
  });

  /** The Start action is shown only for SCHEDULED jobs. */
  protected readonly canStart = computed<boolean>(() => this.request()?.status === 'SCHEDULED');

  /** SAST display of the scheduled slot, e.g. "5 October 2026 at 10:00". */
  protected readonly scheduledDisplay = computed<string>(() =>
    formatScheduledAt(this.request()?.scheduledAt),
  );

  protected readonly scheduling = signal(false);
  protected readonly scheduleSubmitted = signal(false);
  protected readonly scheduleError = signal<string | null>(null);
  protected readonly showStartConfirm = signal(false);
  protected readonly starting = signal(false);
  protected readonly startError = signal<string | null>(null);

  /** Stage 6F work record for IN_PROGRESS jobs and later (read-only once closed). */
  protected readonly workStatus = signal<WorkStatus>('idle');
  protected readonly workError = signal('');
  protected readonly images = signal<JobImage[]>([]);
  protected readonly updates = signal<JobUpdate[]>([]);
  protected readonly timeline = signal<TimelineEvent[]>([]);
  protected readonly photoUrls = signal<Record<string, string>>({});

  protected readonly uploadingPhase = signal<WorkPhase | null>(null);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly deletingImageId = signal<string | null>(null);
  protected readonly deleteError = signal<string | null>(null);

  protected readonly savingNote = signal<WorkPhase | null>(null);
  protected readonly noteError = signal<string | null>(null);

  protected readonly showCompleteConfirm = signal(false);
  protected readonly completing = signal(false);
  protected readonly completeError = signal<string | null>(null);

  /**
   * Mirror of the completion-note textarea. Reactive-form values are not
   * signals, so the input is forwarded here for the `canComplete`
   * derivation below (re-evaluated on every keystroke via valueChanges).
   */
  protected readonly completionNoteValue = signal('');

  /** The provider completion note (the AFTER record), once completed. */
  protected readonly completionNote = computed<string | null>(() => {
    const after = this.updates().filter((update) => update.phase === 'AFTER');
    return after.length > 0 ? (after[after.length - 1] as JobUpdate).note : null;
  });

  protected readonly completionAt = computed<string | null>(() => this.request()?.completedAt ?? null);

  /**
   * The Complete Job action is enabled only for IN_PROGRESS jobs with a
   * non-empty completion note — the note is required by the backend.
   */
  protected readonly canComplete = computed<boolean>(() => {
    const detail = this.request();
    if (detail?.status !== 'IN_PROGRESS' || this.completing()) return false;
    return this.completionNoteValue().trim().length > 0;
  });

  readonly form = this.fb.group({
    total: [null as number | null, [Validators.required, Validators.min(0), Validators.max(9999999999.99)]],
    message: ['', Validators.maxLength(2000)],
    items: this.fb.array<FormGroup>([]),
  });

  /**
   * Stage 6E scheduling form. The provider picks a local date and time;
   * the instant is sent with the SAST (UTC+2, no daylight saving) offset
   * so the backend stores exactly the chosen wall time.
   */
  readonly scheduleForm = this.fb.group({
    date: ['', [Validators.required, Validators.pattern(/^\d{4}-\d{2}-\d{2}$/)]],
    time: ['', [Validators.required, Validators.pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)]],
  });

  /** Stage 6F progress-note forms (BEFORE/DURING notes, AFTER completion note). */
  readonly beforeForm = this.fb.group({
    note: ['', [Validators.required, Validators.maxLength(2000)]],
  });

  readonly duringForm = this.fb.group({
    note: ['', [Validators.required, Validators.maxLength(2000)]],
  });

  readonly completionForm = this.fb.group({
    note: ['', [Validators.required, Validators.maxLength(2000)]],
  });

  protected get items(): FormArray<FormGroup> {
    return this.form.get('items') as FormArray<FormGroup>;
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    if (!id.trim()) {
      this.status.set('not-found');
      return;
    }
    // Forward the completion-note input into a signal so the Complete
    // Job enablement stays in sync with what the provider typed.
    this.completionForm
      .get('note')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value: unknown) => {
        this.completionNoteValue.set(typeof value === 'string' ? value : '');
      });
    this.api
      .getProviderRequest(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          this.request.set(detail);
          const latest = detail.quotes[detail.quotes.length - 1] ?? null;
          this.createdQuote.set(latest);
          this.status.set('ready');
          this.loadWork(detail);
        },
        error: (error: unknown) => {
          if (getApiErrorCode(error) === 'NOT_FOUND') {
            this.status.set('not-found');
          } else {
            this.errorMessage.set(getApiErrorMessage(error, 'Could not load this request. Please try again.'));
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

  protected imagesFor(phase: WorkPhase): JobImage[] {
    return this.images().filter((image) => image.phase === phase);
  }

  protected notesFor(phase: WorkPhase): JobUpdate[] {
    return this.updates().filter((update) => update.phase === phase);
  }

  protected photoUrl(imageId: string): string {
    return this.photoUrls()[imageId] ?? '';
  }

  protected addItem(): void {
    this.items.push(
      this.fb.group({
        description: ['', [Validators.required, Validators.maxLength(255)]],
        quantity: [1, [Validators.required, Validators.min(0.01)]],
        unitPrice: [null as number | null, [Validators.required, Validators.min(0)]],
      }),
    );
  }

  protected removeItem(index: number): void {
    this.items.removeAt(index);
  }

  protected fieldInvalid(control: { invalid: boolean; touched: boolean }): boolean {
    return control.invalid && (control.touched || this.submitted());
  }

  protected onSubmit(): void {
    if (this.submitting() || this.createdQuote()) return;
    this.submitted.set(true);
    this.form.markAllAsTouched();
    const detail = this.request();
    if (this.form.invalid || !detail) {
      this.submitError.set('Please check the quote form and try again.');
      return;
    }
    this.submitting.set(true);
    this.submitError.set(null);
    const raw = this.form.getRawValue();
    const items = (raw.items ?? []) as Array<{ description?: unknown; quantity?: unknown; unitPrice?: unknown }>;
    this.api
      .createQuote(detail.id, {
        total: Number(raw.total),
        currency: 'ZAR',
        message: raw.message?.trim() ? raw.message.trim() : undefined,
        items: items.map((item) => ({
          description: String(item.description ?? '').trim(),
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
        })),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (quote) => {
          this.submitting.set(false);
          this.createdQuote.set(quote);
          this.request.update((current) =>
            current ? { ...current, status: 'QUOTED', quotes: [...current.quotes, quote] } : current,
          );
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.submitError.set(getApiErrorMessage(error, 'Could not submit the quote. Please try again.'));
        },
      });
  }

  protected retry(): void {
    this.status.set('loading');
    this.errorMessage.set('');
    this.ngOnInit();
  }

  protected scheduleFieldInvalid(control: { invalid: boolean; touched: boolean }): boolean {
    return control.invalid && (control.touched || this.scheduleSubmitted());
  }

  protected onSchedule(): void {
    if (this.scheduling() || !this.canSchedule()) return;
    this.scheduleSubmitted.set(true);
    this.scheduleForm.markAllAsTouched();
    const detail = this.request();
    if (this.scheduleForm.invalid || !detail) {
      this.scheduleError.set('Please choose a valid date and time for the job.');
      return;
    }
    this.scheduling.set(true);
    this.scheduleError.set(null);
    const raw = this.scheduleForm.getRawValue();
    // South Africa observes SAST (UTC+2) year-round — no daylight saving —
    // so the fixed offset keeps the chosen wall time exact.
    const scheduledAt = `${raw.date}T${raw.time}:00+02:00`;
    this.api
      .scheduleJob(detail.id, scheduledAt)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (job) => {
          this.scheduling.set(false);
          this.request.update((current) =>
            current
              ? {
                  ...current,
                  status: job.status,
                  scheduledAt: job.scheduledAt,
                  preferredDate: job.preferredDate ?? current.preferredDate,
                  quotes: job.quotes ?? current.quotes,
                }
              : current,
          );
        },
        error: (error: unknown) => {
          this.scheduling.set(false);
          this.scheduleError.set(getApiErrorMessage(error, 'Could not schedule the job. Please try again.'));
        },
      });
  }

  protected startStart(): void {
    this.showStartConfirm.set(true);
    this.startError.set(null);
  }

  protected cancelStart(): void {
    if (this.starting()) return;
    this.showStartConfirm.set(false);
    this.startError.set(null);
  }

  protected confirmStart(): void {
    const detail = this.request();
    if (!detail || this.starting() || !this.canStart()) return;
    this.starting.set(true);
    this.startError.set(null);
    this.api
      .startJob(detail.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (job) => {
          this.starting.set(false);
          this.showStartConfirm.set(false);
          this.request.update((current) =>
            current
              ? {
                  ...current,
                  status: job.status,
                  scheduledAt: job.scheduledAt ?? current.scheduledAt,
                  quotes: job.quotes ?? current.quotes,
                }
              : current,
          );
          const updated = this.request();
          if (updated) this.loadWork(updated);
        },
        error: (error: unknown) => {
          this.starting.set(false);
          this.startError.set(getApiErrorMessage(error, 'Could not start the job. Please try again.'));
        },
      });
  }

  /** Load the work record for IN_PROGRESS jobs and later stages. */
  protected loadWork(detail: ProviderRequest): void {
    if (detail.status !== 'IN_PROGRESS' && detail.status !== 'COMPLETED' && detail.status !== 'CONFIRMED' && detail.status !== 'CLOSED') {
      this.workStatus.set('idle');
      return;
    }
    this.workStatus.set('loading');
    this.workError.set('');
    forkJoin({
      images: this.api.listJobImages(detail.id).pipe(catchError(() => of(null))),
      updates: this.api.listJobUpdates(detail.id).pipe(catchError(() => of(null))),
      timeline: this.api.getJobTimeline(detail.id).pipe(catchError(() => of(null))),
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
        this.loadPhotoBlobs(detail.id, result.images);
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
    const detail = this.request();
    if (detail) this.loadWork(detail);
  }

  /** Upload a photo for a work phase (JPEG, PNG or WebP, 5MB max). */
  protected onFileSelected(event: Event, phase: WorkPhase): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    const detail = this.request();
    if (!file || !detail || this.uploadingPhase()) return;
    this.uploadingPhase.set(phase);
    this.uploadError.set(null);
    this.api
      .uploadJobImage(detail.id, phase, file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (image) => {
          this.uploadingPhase.set(null);
          this.images.update((current) => [...current, image]);
          this.loadPhotoBlobs(detail.id, [image]);
          if (input) input.value = '';
        },
        error: (error: unknown) => {
          this.uploadingPhase.set(null);
          this.uploadError.set(getApiErrorMessage(error, 'Could not upload the photo. Please try again.'));
          if (input) input.value = '';
        },
      });
  }

  /** Delete an incorrectly uploaded photo while the job is IN_PROGRESS. */
  protected deletePhoto(imageId: string): void {
    const detail = this.request();
    if (!detail || this.deletingImageId()) return;
    this.deletingImageId.set(imageId);
    this.deleteError.set(null);
    this.api
      .deleteJobImage(detail.id, imageId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deletingImageId.set(null);
          const url = this.photoUrls()[imageId];
          if (url) URL.revokeObjectURL(url);
          this.photoUrls.update((current) => {
            const next = { ...current };
            delete next[imageId];
            return next;
          });
          this.images.update((current) => current.filter((image) => image.id !== imageId));
        },
        error: (error: unknown) => {
          this.deletingImageId.set(null);
          this.deleteError.set(getApiErrorMessage(error, 'Could not delete the photo. Please try again.'));
        },
      });
  }

  /** Save a BEFORE/DURING progress note. */
  protected saveNote(phase: 'BEFORE' | 'DURING'): void {
    const form = phase === 'BEFORE' ? this.beforeForm : this.duringForm;
    const detail = this.request();
    if (!detail || this.savingNote()) return;
    form.markAllAsTouched();
    if (form.invalid) {
      this.noteError.set('Please write a note of 2000 characters or fewer.');
      return;
    }
    this.savingNote.set(phase);
    this.noteError.set(null);
    const note = (form.get('note')?.value as string | null ?? '').trim();
    this.api
      .createJobUpdate(detail.id, phase, note)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (update) => {
          this.savingNote.set(null);
          this.updates.update((current) => [...current, update]);
          form.reset();
        },
        error: (error: unknown) => {
          this.savingNote.set(null);
          this.noteError.set(getApiErrorMessage(error, 'Could not save the note. Please try again.'));
        },
      });
  }

  protected startComplete(): void {
    this.completionForm.markAllAsTouched();
    if (!this.canComplete()) {
      this.completeError.set('A completion note is required to complete the job.');
      return;
    }
    this.showCompleteConfirm.set(true);
    this.completeError.set(null);
  }

  protected cancelComplete(): void {
    if (this.completing()) return;
    this.showCompleteConfirm.set(false);
    this.completeError.set(null);
  }

  protected confirmComplete(): void {
    const detail = this.request();
    if (!detail || this.completing() || !this.canComplete()) return;
    this.completing.set(true);
    this.completeError.set(null);
    const note = (this.completionForm.get('note')?.value as string | null ?? '').trim();
    this.api
      .completeJob(detail.id, note)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.completing.set(false);
          this.showCompleteConfirm.set(false);
          this.updates.update((current) => [...current, result.update]);
          this.request.update((current) =>
            current
              ? {
                  ...current,
                  status: result.job.status,
                  completedAt: result.job.completedAt ?? current.completedAt,
                  quotes: (result.job.quotes ?? current.quotes) as Quote[],
                }
              : current,
          );
        },
        error: (error: unknown) => {
          this.completing.set(false);
          this.completeError.set(getApiErrorMessage(error, 'Could not complete the job. Please try again.'));
        },
      });
  }

  protected goToRequests(): void {
    void this.router.navigate(['/requests']);
  }
}
