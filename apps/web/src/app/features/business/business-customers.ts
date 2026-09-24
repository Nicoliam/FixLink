import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BusinessService } from '../../core/services/business.service';
import { getApiErrorMessage } from '../../core/models/api.model';
import type { BusinessCustomer } from '../../core/models/business.model';

type CustomersStatus = 'loading' | 'ready' | 'empty' | 'error';

/**
 * FixLink business customers — Stage 7B (`/business/customers`,
 * authenticated BUSINESS_OWNER / BUSINESS_MANAGER).
 *
 * Lists the customers the business manages directly (private to the
 * business) with a creation form and inline contact editing.
 * Customers without a login never appear in the marketplace;
 * authorization is backend-enforced.
 */
@Component({
  selector: 'app-business-customers',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './business-customers.html',
})
export class BusinessCustomersComponent implements OnInit {
  private readonly api = inject(BusinessService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = signal<CustomersStatus>('loading');
  protected readonly errorMessage = signal('');
  protected readonly customers = signal<BusinessCustomer[]>([]);
  protected readonly creating = signal(false);
  protected readonly createError = signal('');
  protected readonly editingId = signal<string | null>(null);
  protected readonly editError = signal('');

  protected readonly createForm = this.fb.group({
    firstName: ['', [Validators.required, Validators.maxLength(128)]],
    lastName: ['', [Validators.required, Validators.maxLength(128)]],
    email: ['', [Validators.email, Validators.maxLength(255)]],
    phone: ['', [Validators.maxLength(32)]],
  });

  protected readonly editForm = this.fb.group({
    firstName: ['', [Validators.maxLength(128)]],
    lastName: ['', [Validators.maxLength(128)]],
    email: ['', [Validators.email, Validators.maxLength(255)]],
    phone: ['', [Validators.maxLength(32)]],
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.status.set('loading');
    this.errorMessage.set('');
    this.api
      .listBusinessCustomers({ pageSize: 50 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.customers.set(list.items);
          this.status.set(list.items.length === 0 ? 'empty' : 'ready');
        },
        error: (error: unknown) => {
          this.errorMessage.set(getApiErrorMessage(error, 'Could not load customers. Please try again.'));
          this.status.set('error');
        },
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
    this.api
      .createBusinessCustomer({
        firstName: value.firstName ?? '',
        lastName: value.lastName ?? '',
        email: value.email ?? undefined,
        phone: value.phone ?? undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (customer) => {
          this.customers.update((items) => [...items, customer]);
          this.status.set('ready');
          this.createForm.reset();
          this.creating.set(false);
        },
        error: (error: unknown) => {
          this.createError.set(getApiErrorMessage(error, 'Could not add the customer. Please try again.'));
          this.creating.set(false);
        },
      });
  }

  protected startEditing(customer: BusinessCustomer): void {
    this.editForm.reset({
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email ?? '',
      phone: customer.phone ?? '',
    });
    this.editError.set('');
    this.editingId.set(customer.id);
  }

  protected cancelEditing(): void {
    this.editingId.set(null);
    this.editError.set('');
  }

  protected saveEdit(customer: BusinessCustomer): void {
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const value = this.editForm.getRawValue();
    this.editError.set('');
    this.api
      .updateBusinessCustomer(customer.id, {
        ...(value.firstName?.trim() ? { firstName: value.firstName.trim() } : {}),
        ...(value.lastName?.trim() ? { lastName: value.lastName.trim() } : {}),
        ...(value.email !== undefined ? { email: value.email?.trim() ? value.email.trim() : null } : {}),
        ...(value.phone !== undefined ? { phone: value.phone?.trim() ? value.phone.trim() : null } : {}),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.customers.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
          this.editingId.set(null);
        },
        error: (error: unknown) => {
          this.editError.set(getApiErrorMessage(error, 'Could not save the customer. Please try again.'));
        },
      });
  }

  protected contactLabel(customer: BusinessCustomer): string {
    return (
      [customer.email, customer.phone].filter((part) => part && part.length > 0).join(' · ') || 'No contact on file'
    );
  }
}
