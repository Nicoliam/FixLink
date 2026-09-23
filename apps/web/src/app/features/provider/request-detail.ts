import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { JobService } from '../../core/services/job.service';
import { getApiErrorCode, getApiErrorMessage } from '../../core/models/api.model';
import { formatScheduledAt, formatZar, jobStatusLabel, quoteStatusLabel } from '../../core/models/job.model';
import type { ProviderRequest, Quote } from '../../core/models/job.model';

type RequestDetailStatus = 'loading' | 'ready' | 'error' | 'not-found';

/**
 * FixLink provider request detail — Stage 6C (`/requests/:id`) + Stage
 * 6D (accepted-quote display) + Stage 6E (scheduling and start).
 *
 * Shows the request context needed to quote, the submitted quote when one
 * exists, and the quote form for REQUESTED jobs. When the customer
 * accepts the quote (QUOTED → ACCEPTED) the provider sees the Accepted
 * state with the agreed amount plus a scheduling section (ACCEPTED →
 * SCHEDULED); a scheduled job shows a Start action (SCHEDULED →
 * IN_PROGRESS). The backend performs every transition and validates
 * provider association server-side — the provider never accepts or
 * changes quote state.
 */
@Component({
  selector: 'app-request-detail',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './request-detail.html',
})
export class RequestDetailComponent implements OnInit {
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

  protected get items(): FormArray<FormGroup> {
    return this.form.get('items') as FormArray<FormGroup>;
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    if (!id.trim()) {
      this.status.set('not-found');
      return;
    }
    this.api
      .getProviderRequest(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          this.request.set(detail);
          const latest = detail.quotes[detail.quotes.length - 1] ?? null;
          this.createdQuote.set(latest);
          this.status.set('ready');
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
        },
        error: (error: unknown) => {
          this.starting.set(false);
          this.startError.set(getApiErrorMessage(error, 'Could not start the job. Please try again.'));
        },
      });
  }

  protected goToRequests(): void {
    void this.router.navigate(['/requests']);
  }
}
