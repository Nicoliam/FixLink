import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { MarketplaceService } from '../../core/services/marketplace.service';
import { JobService } from '../../core/services/job.service';
import { getApiErrorMessage } from '../../core/models/api.model';
import type { ProviderProfile, ServiceListing } from '../../core/models/marketplace.model';
import type { Job } from '../../core/models/job.model';

/**
 * FixLink Request-a-Job — Stage 6B (`/request-job`, authenticated CUSTOMER).
 *
 * Submits a marketplace job request to POST /api/v1/jobs. The backend
 * establishes customer ownership from the session and creates the job with
 * source MARKETPLACE in status REQUESTED. Photo attachments stay disabled:
 * file upload infrastructure arrives in a later stage.
 */
@Component({
  selector: 'app-request-job',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './request-job.html',
})
export class RequestJobComponent implements OnInit {
  private readonly marketplace = inject(MarketplaceService);
  private readonly jobs = inject(JobService);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly provider = signal<ProviderProfile | null>(null);
  protected readonly providerLoading = signal(false);
  protected readonly providerMissing = signal(false);
  protected readonly services = signal<ServiceListing[]>([]);
  protected readonly submitted = signal(false);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly createdJob = signal<Job | null>(null);

  readonly form = this.fb.group({
    serviceId: ['', Validators.required],
    description: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(2000)]],
    location: ['', [Validators.required, Validators.maxLength(255)]],
    preferredDate: [''],
    preferredTime: [''],
    photoNote: ['', Validators.maxLength(500)],
  });

  ngOnInit(): void {
    this.marketplace
      .listServices()
      .pipe(
        catchError(() => of([])),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => this.services.set(items));

    const providerId = this.route.snapshot.queryParamMap.get('provider') ?? '';
    if (!providerId.trim()) {
      this.providerMissing.set(true);
      return;
    }
    this.providerLoading.set(true);
    this.marketplace
      .getProvider(providerId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile) => {
          this.provider.set(profile);
          this.providerLoading.set(false);
        },
        error: () => {
          this.provider.set(null);
          this.providerLoading.set(false);
        },
      });
  }

  protected serviceName(serviceId: string): string {
    return this.services().find((service) => service.id === serviceId)?.name ?? 'Selected service';
  }

  onSubmit(): void {
    if (this.submitting() || this.createdJob()) return;
    this.submitted.set(true);
    this.submitError.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const selected = this.provider();
    if (!selected) {
      this.submitError.set(
        'No provider selected yet. Browse the marketplace and choose “Request a job” on a profile.',
      );
      return;
    }
    const value = this.form.getRawValue();
    this.submitting.set(true);
    this.jobs
      .createJob({
        providerId: selected.id,
        serviceId: value.serviceId ?? '',
        description: value.description ?? '',
        location: value.location ?? '',
        preferredDate: value.preferredDate ?? '',
        preferredTime: value.preferredTime ?? '',
        notes: value.photoNote ?? '',
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (job) => {
          this.submitting.set(false);
          this.createdJob.set(job);
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.submitError.set(
            getApiErrorMessage(error, 'Could not submit the job request. Please try again.'),
          );
        },
      });
  }

  protected fieldInvalid(
    name: 'serviceId' | 'description' | 'location' | 'preferredDate' | 'preferredTime' | 'photoNote',
  ): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }
}
