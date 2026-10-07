import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { OfferingService } from '../../core/services/offering.service';
import { MarketplaceService } from '../../core/services/marketplace.service';
import { getApiErrorCode, getApiErrorMessage } from '../../core/models/api.model';
import { formatZar } from '../../core/models/job.model';
import type { Offering, OfferingOwnerRef, OfferingProviderType } from '../../core/models/offering.model';
import type { ServiceCategory } from '../../core/models/marketplace.model';

type OfferingsStatus = 'loading' | 'ready' | 'empty' | 'error';

const PROVIDER_TYPES: readonly OfferingProviderType[] = ['PROFESSIONAL', 'BUSINESS'];

/** Must match the backend column limits so the form never sends a 422. */
const NAME_MAX = 128;
const DESCRIPTION_MAX = 500;

/**
 * Non-negative rand with at most two decimals, matching the DECIMAL(10,2)
 * column and the backend validator. Catching this here beats surfacing a
 * server validation message for something the input control could prevent.
 */
const PRICE_PATTERN = /^\d+(\.\d{1,2})?$/;
const PRICE_VALIDATORS = [Validators.pattern(PRICE_PATTERN), Validators.maxLength(12)];

/**
 * Fixlynk "My services" — the provider's own service offerings
 * (`/my-services`, authenticated PROFESSIONAL / BUSINESS_OWNER /
 * BUSINESS_MANAGER).
 *
 * Providers advertise services, each under a platform service category
 * with an indicative starting price. The MVP does not process payments:
 * the price is a "from R850" guide only and the customer still pays the
 * provider directly. No admin approval is involved.
 *
 * The backend derives the owning provider from the session; the client
 * only sends `providerType` on create when the user manages more than
 * one provider, and never on update (the backend rejects it with 422).
 */
@Component({
  selector: 'app-my-services',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-services.html',
})
export class MyServicesComponent implements OnInit {
  private readonly api = inject(OfferingService);
  private readonly marketplace = inject(MarketplaceService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = signal<OfferingsStatus>('loading');
  protected readonly errorMessage = signal('');
  protected readonly errorCode = signal<string | null>(null);
  protected readonly offerings = signal<Offering[]>([]);
  protected readonly categories = signal<ServiceCategory[]>([]);
  protected readonly categoryError = signal('');

  protected readonly creating = signal(false);
  protected readonly createError = signal('');
  protected readonly editingId = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  protected readonly confirmingRemoveId = signal<string | null>(null);
  protected readonly removingId = signal<string | null>(null);
  protected readonly removeError = signal('');

  /**
   * Provider identities the server says this account may act for. This comes
   * from the list response rather than from the loaded offerings, because a
   * second identity with nothing listed yet is exactly the case that needs
   * the picker.
   */
  private readonly owners = signal<OfferingOwnerRef[]>([]);

  /** Distinct owners behind the loaded listings (0, 1 or 2 entries). */
  protected readonly providerTypeOptions = computed<OfferingProviderType[]>(() => {
    const present = new Set(this.owners().map((owner) => owner.providerType));
    return PROVIDER_TYPES.filter((type) => present.has(type));
  });

  /** Only disambiguate with a picker when the user manages several providers. */
  protected readonly requiresProviderType = computed(() => this.providerTypeOptions().length > 1);

  protected readonly createForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(NAME_MAX)]],
    categoryId: ['', [Validators.required]],
    description: ['', [Validators.maxLength(DESCRIPTION_MAX)]],
    // Typed as number because the input is type="number": Angular selects
    // NumberValueAccessor, so the runtime value is a number, not a string.
    priceAmount: this.fb.control<number | null>(null, [Validators.required, ...PRICE_VALIDATORS]),
    providerType: [''],
  });

  protected readonly editForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(NAME_MAX)]],
    categoryId: ['', [Validators.required]],
    description: ['', [Validators.maxLength(DESCRIPTION_MAX)]],
    // Typed as number because the input is type="number": Angular selects
    // NumberValueAccessor, so the runtime value is a number, not a string.
    priceAmount: this.fb.control<number | null>(null, [Validators.required, ...PRICE_VALIDATORS]),
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.status.set('loading');
    this.errorMessage.set('');
    this.errorCode.set(null);
    this.loadCategories();
    this.api
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.offerings.set(list.items);
          this.owners.set(list.providers ?? []);
          this.status.set(list.items.length === 0 ? 'empty' : 'ready');
        },
        error: (error: unknown) => {
          this.errorMessage.set(
            getApiErrorMessage(error, 'We could not load your services. Please try again.'),
          );
          this.errorCode.set(getApiErrorCode(error));
          this.status.set('error');
        },
      });
  }

  protected loadCategories(): void {
    this.categoryError.set('');
    this.marketplace
      .listCategories()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => this.categories.set(items),
        error: () =>
          this.categoryError.set('We could not load the service categories. Reload the page to try again.'),
      });
  }

  protected create(): void {
    if (this.creating() || this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }
    this.creating.set(true);
    this.createError.set('');
    const value = this.createForm.getRawValue();
    const description = value.description?.trim() ?? '';
    const providerType = value.providerType as OfferingProviderType | '';
    this.api
      .create({
        categoryId: value.categoryId?.trim() ?? '',
        name: value.name?.trim() ?? '',
        priceAmount: this.toAmount(value.priceAmount),
        ...(description ? { description } : {}),
        ...(this.requiresProviderType() && providerType ? { providerType } : {}),
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        // Clear the pending flag on completion, error AND cancellation, so a
        // thrown handler or an unsubscribed request can never strand the
        // button on "Adding…".
        finalize(() => this.creating.set(false)),
      )
      .subscribe({
        next: (offering) => {
          this.offerings.update((items) => [...items, offering]);
          this.status.set('ready');
          this.createForm.reset();
        },
        error: (error: unknown) => {
          this.createError.set(
            getApiErrorMessage(
              error,
              'We could not add that service. Check the details and try again.',
            ),
          );
        },
      });
  }

  protected startEditing(offering: Offering): void {
    this.editForm.reset({
      name: offering.name,
      categoryId: offering.categoryId,
      description: offering.description ?? '',
      // The control is a number input (NumberValueAccessor), so hand back a number.
      priceAmount: offering.priceAmount,
    });
    this.saveError.set('');
    this.removeError.set('');
    this.confirmingRemoveId.set(null);
    this.editingId.set(offering.id);
  }

  protected cancelEditing(): void {
    this.editingId.set(null);
    this.saveError.set('');
  }

  protected saveEdit(offering: Offering): void {
    if (this.saving() || this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.saveError.set('');
    const value = this.editForm.getRawValue();
    const description = value.description?.trim() ?? '';
    this.api
      .update(offering.id, {
        categoryId: value.categoryId?.trim() ?? '',
        name: value.name?.trim() ?? '',
        priceAmount: this.toAmount(value.priceAmount),
        description: description === '' ? null : description,
      })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.saving.set(false)))
      .subscribe({
        next: (updated) => {
          this.offerings.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
          this.editingId.set(null);
        },
        error: (error: unknown) => {
          this.saveError.set(
            getApiErrorMessage(error, 'We could not save your changes. Please try again.'),
          );
        },
      });
  }

  protected askRemove(offering: Offering): void {
    this.removeError.set('');
    this.confirmingRemoveId.set(offering.id);
  }

  protected cancelRemove(): void {
    this.confirmingRemoveId.set(null);
    this.removeError.set('');
  }

  protected remove(offering: Offering): void {
    if (this.removingId() === offering.id) return;
    this.removingId.set(offering.id);
    this.removeError.set('');
    this.api
      .remove(offering.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.removingId.set(null)),
      )
      .subscribe({
        next: () => {
          this.offerings.update((items) => items.filter((item) => item.id !== offering.id));
          this.confirmingRemoveId.set(null);
          this.editingId.set(null);
          this.status.set(this.offerings().length === 0 ? 'empty' : 'ready');
        },
        error: (error: unknown) => {
          this.removeError.set(
            getApiErrorMessage(
              error,
              'We could not remove that service. It may still be attached to open work.',
            ),
          );
          this.confirmingRemoveId.set(null);
        },
      });
  }

  protected priceFrom(offering: Offering): string {
    return `from ${formatZar(offering.priceAmount)}`;
  }

  protected formatAmount(amount: number): string {
    return formatZar(amount);
  }

  /** 403 / 404 mean the account may not manage services at all. */
  protected errorTitle(): string {
    return this.errorCode() === 'FORBIDDEN_ROLE' || this.errorCode() === 'NOT_FOUND'
      ? 'Not available for your account'
      : 'Something went wrong';
  }

  /**
   * Coerce the price control to a number.
   *
   * The price input is `type="number"`, so Angular selects
   * NumberValueAccessor and the control holds a NUMBER, not a string —
   * assuming a string here threw before the request was ever built.
   * Accept both so the helper is safe regardless of control value type.
   */
  private toAmount(raw: string | number | null | undefined): number {
    const parsed =
      typeof raw === 'number' ? raw : Number.parseFloat((raw ?? '').trim());
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
  }
}