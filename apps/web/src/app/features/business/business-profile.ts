import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BusinessService } from '../../core/services/business.service';
import { getApiErrorMessage } from '../../core/models/api.model';
import { businessRoleLabel, verificationLabel } from '../../core/models/business.model';
import type { Business } from '../../core/models/business.model';

type ProfileStatus = 'loading' | 'ready' | 'error';

/**
 * FixLink business profile — Stage 7B (`/business/profile`,
 * authenticated BUSINESS_OWNER / BUSINESS_MANAGER).
 *
 * Shows the server-derived business profile with an owner-only
 * editor (the same rules as the dashboard card). Managers see the
 * profile read-only; the backend enforces the owner-only update.
 */
@Component({
  selector: 'app-business-profile',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './business-profile.html',
})
export class BusinessProfileComponent implements OnInit {
  private readonly api = inject(BusinessService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = signal<ProfileStatus>('loading');
  protected readonly errorMessage = signal('');
  protected readonly business = signal<Business | null>(null);
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');

  protected readonly form = this.fb.group({
    businessName: ['', [Validators.required, Validators.maxLength(255)]],
    description: ['', [Validators.maxLength(2000)]],
    email: ['', [Validators.email, Validators.maxLength(255)]],
    phone: ['', [Validators.maxLength(32)]],
    city: ['', [Validators.maxLength(128)]],
    province: ['', [Validators.maxLength(128)]],
  });

  /** Profile editing is offered to owners; the backend enforces it. */
  protected readonly canEdit = computed(() => this.business()?.role === 'OWNER');

  protected readonly roleLabel = businessRoleLabel;
  protected readonly verificationText = verificationLabel;

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.status.set('loading');
    this.errorMessage.set('');
    this.api
      .getMyBusiness()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (business) => {
          this.business.set(business);
          this.status.set('ready');
        },
        error: (error: unknown) => {
          this.errorMessage.set(getApiErrorMessage(error, 'Could not load your business. Please try again.'));
          this.status.set('error');
        },
      });
  }

  protected startEditing(): void {
    const current = this.business();
    if (!current) return;
    this.form.reset({
      businessName: current.businessName,
      description: current.description ?? '',
      email: current.email ?? '',
      phone: current.phone ?? '',
      city: current.city ?? '',
      province: current.province ?? '',
    });
    this.saveError.set('');
    this.editing.set(true);
  }

  protected cancelEditing(): void {
    this.editing.set(false);
    this.saveError.set('');
  }

  protected save(): void {
    if (this.saving() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.saveError.set('');
    const value = this.form.getRawValue();
    this.api
      .updateBusiness({
        businessName: value.businessName ?? undefined,
        description: value.description ?? undefined,
        email: value.email ?? undefined,
        phone: value.phone ?? undefined,
        city: value.city ?? undefined,
        province: value.province ?? undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (business) => {
          this.business.set(business);
          this.saving.set(false);
          this.editing.set(false);
        },
        error: (error: unknown) => {
          this.saveError.set(getApiErrorMessage(error, 'Could not save the business profile. Please try again.'));
          this.saving.set(false);
        },
      });
  }
}
