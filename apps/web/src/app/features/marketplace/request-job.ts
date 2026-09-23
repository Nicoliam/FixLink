import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { MarketplaceService } from '../../core/services/marketplace.service';
import type { ProviderProfile, ServiceListing } from '../../core/models/marketplace.model';

/**
 * FixLink Request-a-Job foundation — Stage 6A (`/request-job`, authenticated).
 *
 * Establishes the form and navigation contract for Stage 6B:
 * service, description, location, preferred date and photo-attachment
 * readiness. It does NOT create jobs, quotes or assignments — submitting
 * shows the next-step notice so Stage 6B can connect `POST /api/v1/jobs`.
 */
@Component({
  selector: 'app-request-job',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './request-job.html',
})
export class RequestJobComponent implements OnInit {
  private readonly api = inject(MarketplaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly provider = signal<ProviderProfile | null>(null);
  protected readonly providerLoading = signal(false);
  protected readonly providerMissing = signal(false);
  protected readonly services = signal<ServiceListing[]>([]);
  protected readonly submitted = signal(false);

  readonly form = this.fb.group({
    serviceId: ['', Validators.required],
    description: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(2000)]],
    location: ['', [Validators.required, Validators.maxLength(255)]],
    preferredDate: [''],
    photoNote: ['', Validators.maxLength(500)],
  });

  ngOnInit(): void {
    this.api
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
    this.api
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

  onSubmit(): void {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    // Stage 6B contract: values below map directly onto POST /api/v1/jobs.
    // No network call in Stage 6A — surface the collected request instead.
  }

  protected fieldInvalid(name: 'serviceId' | 'description' | 'location' | 'preferredDate' | 'photoNote'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }
}
