import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { MarketplaceService } from '../../core/services/marketplace.service';
import { JobService } from '../../core/services/job.service';
import { SavedProvidersService } from '../../core/services/saved-providers.service';
import { AuthService } from '../../core/services/auth.service';
import { getApiErrorMessage } from '../../core/models/api.model';
import { formatScheduledAt, jobStatusLabel } from '../../core/models/job.model';
import type { Job } from '../../core/models/job.model';
import type { ProviderCard, ProviderProfile, ServiceListing } from '../../core/models/marketplace.model';
import type { SavedProvider } from '../../core/models/saved-provider.model';

/** Wizard steps. 01 and 02 collect input; 03 reviews it; 04 is submitted. */
type StepNumber = 1 | 2 | 3 | 4;

/** A photo picked in step 01, not yet uploaded. */
interface PendingPhoto {
  file: File;
  /** Object URL for the preview; revoked when the photo is removed. */
  url: string;
}

/**
 * Mirrors MAX_REQUEST_IMAGES_PER_JOB, JOB_IMAGE_ALLOWED_MIME and
 * JOB_IMAGE_MAX_BYTES in the backend. Checked client-side so the customer gets
 * an instant answer; the backend still re-validates every file, including the
 * magic bytes, because a client check is a convenience and never a control.
 */
const MAX_REQUEST_PHOTOS = 6;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type ProviderSearchStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

/**
 * Fixlynk Request-a-Job wizard — Stage 6B (`/request-job`, CUSTOMER).
 *
 * Replaces the single-page form with the same four transparent steps the
 * marketing site promises on the home page:
 *
 *   01 Tell us what you need       the job details
 *   02 Find the right professional choose here, without leaving the flow
 *   03 Review and send             confirm before anything is created
 *   04 What happens next           quote, then the work
 *
 * Note the order: the customer describes the job BEFORE choosing a provider,
 * which is the reverse of the old page (provider first, via `?provider=`).
 * That is deliberate — it matches the frictionless copy, and it means the
 * search in step 02 can use the service the customer just picked.
 *
 * Two facts shape the design:
 *
 * 1. Step 02 is OPTIONAL. `POST /api/v1/jobs` takes `providerId` but does not
 *    require it: a customer who skips the step posts an OPEN REQUEST, which
 *    the backend offers to every professional matching it on category and
 *    service area, capped at 3 quotes. Skipping is a real choice — it is the
 *    fastest route to the first quote — so it is offered plainly rather than
 *    hidden behind an empty state.
 * 2. A saved professional is offered first when the customer has one, because
 *    re-requesting a known pro is the common repeat case. When they have
 *    none, that section is not rendered at all rather than shown empty.
 *
 * Arriving with `?provider=<id>` pre-selects that professional and jumps
 * straight to step 02, so the marketplace and profile CTAs keep working as
 * one-tap entry points.
 */
@Component({
  selector: 'app-request-job',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './request-job.html',
  styleUrl: './request-job.scss',
})
export class RequestJobComponent implements OnInit {
  private readonly marketplace = inject(MarketplaceService);
  private readonly jobs = inject(JobService);
  private readonly saved = inject(SavedProvidersService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  /** The four steps, mirroring the home page's frictionless process. */
  protected readonly steps = [
    {
      number: '01',
      icon: 'edit_note',
      title: 'Tell us what you need',
      text: 'Describe your job so the professional can assess the scope accurately.',
      footer: 'Instant request',
    },
    {
      number: '02',
      icon: 'badge',
      title: 'Find the right professional',
      text: 'Choose one, or skip this and let matching professionals quote.',
      footer: 'Optional',
    },
    {
      number: '03',
      icon: 'receipt_long',
      title: 'Review and send',
      text: 'Check the details below, then send your request to the professional.',
      footer: 'No hidden fees',
    },
    {
      number: '04',
      icon: 'task_alt',
      title: 'What happens next',
      text: 'Review the quote in South African Rand (ZAR), then communicate and complete the job.',
      footer: 'Satisfaction guarantee',
    },
  ] as const;

  protected readonly step = signal<StepNumber>(1);
  protected readonly services = signal<ServiceListing[]>([]);
  protected readonly createdJob = signal<Job | null>(null);

  // --- Step 01: the details -------------------------------------------------
  protected readonly submitted = signal(false);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);

  /**
   * Photos of the problem chosen in step 01, as object URLs for preview.
   *
   * The files are NOT uploaded yet: `job_images.job_id` is NOT NULL, so a photo
   * cannot exist before its job does. They are sent immediately after the job is
   * created, and `uploadWarnings` reports anything that did not make it.
   */
  protected readonly photos = signal<PendingPhoto[]>([]);
  protected readonly photoError = signal('');
  protected readonly uploadWarnings = signal<string[]>([]);
  protected readonly uploadProgress = signal<{ done: number; total: number } | null>(null);

  // --- Step 02: the professional --------------------------------------------
  protected readonly selected = signal<ProviderCard | null>(null);
  protected readonly providerSearch = signal('');
  protected readonly providerStatus = signal<ProviderSearchStatus>('idle');
  protected readonly providerError = signal('');
  protected readonly results = signal<ProviderCard[]>([]);
  protected readonly savedProviders = signal<SavedProvider[]>([]);
  protected readonly savedStatus = signal<'loading' | 'ready' | 'empty' | 'error'>('loading');
  protected readonly savedError = signal('');

  protected readonly canSave = computed(
    () => this.auth.isAuthenticated() && (this.auth.currentUser()?.roles ?? []).includes('CUSTOMER'),
  );
  /** The saved section is hidden entirely when the customer has none. */
  protected readonly hasSaved = computed(() => this.savedProviders().length > 0);

  /**
   * Whether the customer chose a professional.
   *
   * This is deliberately NOT what gates the Review button any more. Step 02 is
   * skippable, so the button is always enabled and the choice is expressed by
   * this flag plus a visible skip affordance — a disabled button that silently
   * does nothing is worse than a clear "skip" the customer controls.
   */
  protected readonly hasChosen = computed(() => this.selected() !== null);
  protected readonly photoCount = computed(() => this.photos().length);
  /** Exposed for the hint text so the copy cannot drift from the enforced cap. */
  protected readonly maxRequestPhotos = MAX_REQUEST_PHOTOS;
  protected readonly canAddPhotos = computed(
    () => this.photos().length < MAX_REQUEST_PHOTOS && !this.submitting(),
  );
  protected readonly statusLabel = jobStatusLabel;
  protected readonly formatScheduled = formatScheduledAt;

  readonly form = this.fb.group({
    serviceId: ['', Validators.required],
    description: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(2000)]],
    location: ['', [Validators.required, Validators.maxLength(255)]],
    preferredDate: [''],
    preferredTime: [''],
  });

  /**
   * A method, not a computed: reactive-form control values are not signals, so
   * a computed would never re-evaluate when the service changes.
   */
  protected serviceName(): string {
    return this.services().find((service) => service.id === this.form.controls.serviceId.value)?.name ?? '';
  }

  ngOnInit(): void {
    this.marketplace
      .listServices()
      .pipe(
        catchError(() => of([])),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => this.services.set(items));

    if (this.canSave()) this.loadSavedProviders();

    // A provider from the marketplace or a profile CTA pre-selects and skips
    // straight to choosing, so those links stay a single tap.
    const providerId = this.route.snapshot.queryParamMap.get('provider') ?? '';
    if (providerId.trim()) {
      this.preselect(providerId);
      return;
    }
    this.searchProviders();
  }

  /** Step 01 -> 02. Blocks on invalid details rather than advancing silently. */
  protected goToProviderStep(): void {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.step.set(2);
    // Re-run the search so the results reflect the service just chosen. The
    // initial load on ngOnInit runs before any service is selected, so without
    // this the list would be unfiltered by the one thing that matters most.
    this.searchProviders();
  }

  protected backToDetails(): void {
    this.step.set(1);
  }

  /**
   * Step 02 -> 03, with or without a professional.
   *
   * Skipping is a deliberate act recorded by `chooseForMe`, so the review step
   * can tell the customer what will happen instead of what they are losing.
   */
  protected goToReview(): void {
    this.step.set(3);
  }

  /**
   * "Skip and let a professional come to you": post an open request.
   *
   * Clears any selection so the review screen cannot show a professional the
   * customer has just said they do not want. Does not advance — the customer
   * still confirms on the review step.
   */
  protected chooseForMe(): void {
    this.selected.set(null);
    this.step.set(3);
  }

  protected backToProviderStep(): void {
    this.step.set(2);
  }

  protected edit(step: StepNumber): void {
    this.step.set(step);
  }

  /** Choose a professional from the search results or the saved list. */
  protected choose(provider: ProviderCard): void {
    this.selected.set(provider);
  }

  /** Step back into 02 from the review screen, to change the mind. */
  protected changeProfessional(): void {
    this.step.set(2);
  }

  protected searchProviders(): void {
    this.providerStatus.set('loading');
    this.providerError.set('');
    this.marketplace
      .searchProviders({
        // Only supported filters are sent: the endpoint rejects unknown
        // query parameters with 422.
        q: this.providerSearch(),
        service: this.form.controls.serviceId.value ?? undefined,
        page: 1,
        pageSize: 12,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.results.set(page.items);
          this.providerStatus.set(page.items.length === 0 ? 'empty' : 'ready');
        },
        error: (error: unknown) => {
          this.results.set([]);
          this.providerError.set(getApiErrorMessage(error, 'Could not load professionals. Please try again.'));
          this.providerStatus.set('error');
        },
      });
  }

  protected retrySearch(): void {
    this.searchProviders();
  }

  protected retrySaved(): void {
    this.savedStatus.set('loading');
    this.savedError.set('');
    this.loadSavedProviders();
  }

  onSubmit(): void {
    if (this.submitting() || this.createdJob()) return;
    this.submitted.set(true);
    this.submitError.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    // Step 14: no professional is a valid state. The details are all that
    // must be valid now, so there is nothing left to guard here.
    const provider = this.selected();
    const value = this.form.getRawValue();
    const pending = this.photos();
    this.submitting.set(true);
    this.jobs
      .createJob({
        // Omitted entirely when nobody was chosen, which is how the request
        // becomes an open request the backend matches on category and area.
        ...(provider ? { providerId: provider.id } : {}),
        serviceId: value.serviceId ?? '',
        description: value.description ?? '',
        location: value.location ?? '',
        preferredDate: value.preferredDate ?? '',
        preferredTime: value.preferredTime ?? '',
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (job) => {
          this.createdJob.set(job);
          this.step.set(4);
          if (pending.length === 0) {
            this.submitting.set(false);
            return;
          }
          // The job exists now, so the photos can be attached. A failure here
          // must NOT lose the request: the job is created and the customer is
          // told which photos did not upload, so they can add them from the job.
          this.uploadPhotos(job.id, pending);
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.submitError.set(getApiErrorMessage(error, 'Could not submit the job request. Please try again.'));
        },
      });
  }

  /** Add photos, ignoring anything the client can already rule out. */
  protected onPhotosSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const chosen = Array.from(input.files ?? []);
    // Reset immediately so re-picking the same file still fires a change event.
    input.value = '';
    if (chosen.length === 0) return;

    this.photoError.set('');
    const accepted: PendingPhoto[] = [];
    const rejected: string[] = [];
    for (const file of chosen) {
      if (this.photos().length + accepted.length >= MAX_REQUEST_PHOTOS) {
        rejected.push(`${file.name} (limit is ${MAX_REQUEST_PHOTOS} photos)`);
        continue;
      }
      // Mirrors the backend allowlist and 5MB cap so the customer gets an
      // immediate answer instead of a round-trip rejection.
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        rejected.push(`${file.name} (only JPEG, PNG or WebP)`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        rejected.push(`${file.name} (larger than 5MB)`);
        continue;
      }
      accepted.push({ file, url: URL.createObjectURL(file) });
    }
    if (accepted.length > 0) this.photos.update((current) => [...current, ...accepted]);
    if (rejected.length > 0) this.photoError.set(`Some photos were not added: ${rejected.join(', ')}.`);
  }

  protected removePhoto(index: number): void {
    this.photos.update((current) => {
      const target = current[index];
      // Release the object URL so the blob can be collected.
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((_, i) => i !== index);
    });
  }

  protected fieldInvalid(name: 'serviceId' | 'description' | 'location' | 'preferredDate' | 'preferredTime'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }

  protected value(name: 'description' | 'location'): string {
    return this.form.controls[name].value ?? '';
  }

  protected preferredSlot(): string {
    const date = this.form.controls.preferredDate.value;
    if (!date) return 'Not specified';
    const time = this.form.controls.preferredTime.value;
    if (!time) return date;
    return formatScheduledAt(new Date(`${date}T${time}:00`).toISOString());
  }

  /**
   * Attach the picked photos to the freshly created job, one request per photo.
   *
   * Sequential on purpose: it keeps the per-job cap honest under the backend's
   * own counting, bounds memory, and makes the progress message meaningful. The
   * job is already created at this point, so a failure is recoverable and is
   * reported rather than thrown.
   */
  private uploadPhotos(jobId: string, pending: PendingPhoto[]): void {
    this.uploadProgress.set({ done: 0, total: pending.length });
    const failed: string[] = [];
    const failedIds: number[] = [];

    const uploadNext = (index: number): void => {
      if (index >= pending.length) {
        this.uploadProgress.set(null);
        this.submitting.set(false);
        if (failed.length > 0) {
          this.uploadWarnings.update((current) => [
            ...current,
            `${failed.length} of ${pending.length} photos could not be attached: ${failed.join(', ')}. You can add them again from your job page.`,
          ]);
          // Drop the failed entries so a retry does not re-send them.
          for (const id of failedIds) this.removePhoto(id);
        }
        return;
      }
      const photo = pending[index] as PendingPhoto;
      this.jobs
        .uploadJobRequestImage(jobId, photo.file)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.uploadProgress.set({ done: index + 1, total: pending.length });
            uploadNext(index + 1);
          },
          error: (error: unknown) => {
            failed.push(photo.file.name);
            failedIds.push(index);
            this.uploadProgress.set({ done: index + 1, total: pending.length });
            void error;
            uploadNext(index + 1);
          },
        });
    };

    uploadNext(0);
  }

  /**
   * Load the customer's saved professionals. A failure must not block the
   * wizard: step 02 falls back to search, which is always available.
   */
  private loadSavedProviders(): void {
    this.saved
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.savedProviders.set(items);
          this.savedStatus.set(items.length === 0 ? 'empty' : 'ready');
        },
        error: (error: unknown) => {
          this.savedError.set(getApiErrorMessage(error, 'Could not load your saved professionals.'));
          this.savedStatus.set('error');
        },
      });
  }

  /** Resolve a `?provider=` id into a selectable card, then jump to step 02. */
  private preselect(providerId: string): void {
    this.marketplace
      .getProvider(providerId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile: ProviderProfile) => {
          this.selected.set(profile);
          this.step.set(2);
        },
        error: () => {
          // An unknown or deactivated provider must not strand the customer
          // on an empty step: fall back to searching.
          this.step.set(2);
          this.searchProviders();
        },
      });
  }
}
