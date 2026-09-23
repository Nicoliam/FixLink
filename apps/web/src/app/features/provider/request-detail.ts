import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { JobService } from '../../core/services/job.service';
import { getApiErrorCode, getApiErrorMessage } from '../../core/models/api.model';
import { formatZar, jobStatusLabel, quoteStatusLabel } from '../../core/models/job.model';
import type { ProviderRequest, Quote } from '../../core/models/job.model';

type RequestDetailStatus = 'loading' | 'ready' | 'error' | 'not-found';

/**
 * FixLink provider request detail — Stage 6C (`/requests/:id`) + Stage
 * 6D (accepted-quote display).
 *
 * Shows the request context needed to quote, the submitted quote when one
 * exists, and the quote form for REQUESTED jobs. When the customer
 * accepts the quote (QUOTED → ACCEPTED) the provider sees the Accepted
 * state with the agreed amount — the provider never accepts or changes
 * that state (scheduling belongs to a later stage).
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

  /** The customer-accepted quote, when acceptance has happened. */
  protected readonly acceptedQuote = computed<Quote | null>(() => {
    const quotes = this.request()?.quotes ?? [];
    return quotes.find((quote) => quote.status === 'ACCEPTED') ?? null;
  });

  readonly form = this.fb.group({
    total: [null as number | null, [Validators.required, Validators.min(0), Validators.max(9999999999.99)]],
    message: ['', Validators.maxLength(2000)],
    items: this.fb.array<FormGroup>([]),
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

  protected goToRequests(): void {
    void this.router.navigate(['/requests']);
  }
}
