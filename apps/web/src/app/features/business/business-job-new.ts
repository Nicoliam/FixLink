import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { BusinessService } from '../../core/services/business.service';
import { MarketplaceService } from '../../core/services/marketplace.service';
import { getApiErrorMessage } from '../../core/models/api.model';
import { businessJobStatusLabel } from '../../core/models/business.model';
import type { BusinessCustomer, BusinessJob } from '../../core/models/business.model';
import type { ServiceListing as MarketplaceServiceListing } from '../../core/models/marketplace.model';

type CreateStatus = 'loading' | 'ready' | 'saving' | 'created' | 'error';

/**
 * FixLink create internal job — Stage 7B (`/business/jobs/new`,
 * authenticated BUSINESS_OWNER / BUSINESS_MANAGER).
 *
 * Creates an INTERNAL job for an existing business-managed customer
 * (with a link to create the customer first), a catalogue service,
 * description, address, priority and an optional scheduled visit.
 * The backend sets `source = INTERNAL` and `status = REQUESTED`;
 * after creation the job reference and REQUESTED status are shown.
 * Technician assignment and parts controls arrive in later stages.
 */
@Component({
  selector: 'app-business-job-new',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './business-job-new.html',
})
export class BusinessJobNewComponent implements OnInit {
  private readonly api = inject(BusinessService);
  private readonly catalogue = inject(MarketplaceService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = signal<CreateStatus>('loading');
  protected readonly errorMessage = signal('');
  protected readonly saveError = signal('');
  protected readonly customers = signal<BusinessCustomer[]>([]);
  protected readonly services = signal<MarketplaceServiceListing[]>([]);
  protected readonly createdJob = signal<BusinessJob | null>(null);

  protected readonly form = this.fb.group({
    customerId: ['', [Validators.required]],
    serviceId: ['', [Validators.required]],
    title: ['', [Validators.maxLength(255)]],
    description: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(2000)]],
    address: ['', [Validators.required, Validators.maxLength(255)]],
    city: ['', [Validators.maxLength(128)]],
    province: ['', [Validators.maxLength(128)]],
    priority: ['NORMAL'],
    scheduledAt: [''],
  });

  protected readonly statusText = businessJobStatusLabel;

  ngOnInit(): void {
    this.loadOptions();
  }

  protected loadOptions(): void {
    this.status.set('loading');
    this.errorMessage.set('');
    let loadedCustomers: BusinessCustomer[] | null = null;
    let loadedServices: MarketplaceServiceListing[] | null = null;
    const finish = (): void => {
      if (loadedCustomers === null || loadedServices === null) return;
      this.customers.set(loadedCustomers);
      this.services.set(loadedServices);
      this.status.set('ready');
    };
    this.api
      .listBusinessCustomers({ pageSize: 50 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          loadedCustomers = list.items;
          finish();
        },
        error: (error: unknown) => {
          this.errorMessage.set(getApiErrorMessage(error, 'Could not load customers. Please try again.'));
          this.status.set('error');
        },
      });
    this.catalogue
      .listServices()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          loadedServices = items;
          finish();
        },
        error: (error: unknown) => {
          this.errorMessage.set(getApiErrorMessage(error, 'Could not load services. Please try again.'));
          this.status.set('error');
        },
      });
  }

  protected save(): void {
    if (this.status() === 'saving' || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.status.set('saving');
    this.saveError.set('');
    const value = this.form.getRawValue();
    this.api
      .createBusinessJob({
        customerId: value.customerId ?? '',
        serviceId: value.serviceId ?? '',
        title: value.title ?? undefined,
        description: value.description ?? '',
        address: value.address ?? undefined,
        city: value.city ?? undefined,
        province: value.province ?? undefined,
        priority: (value.priority as BusinessJob['priority']) ?? 'NORMAL',
        scheduledAt: value.scheduledAt ? new Date(value.scheduledAt).toISOString() : undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (job) => {
          this.createdJob.set(job);
          this.status.set('created');
        },
        error: (error: unknown) => {
          this.saveError.set(getApiErrorMessage(error, 'Could not create the job. Please try again.'));
          this.status.set('ready');
        },
      });
  }

  protected viewJob(): void {
    const job = this.createdJob();
    if (job) void this.router.navigate(['/business/jobs', job.id]);
  }

  protected serviceName(services: MarketplaceServiceListing[], id: string): string {
    return services.find((service) => service.id === id)?.name ?? id;
  }
}
