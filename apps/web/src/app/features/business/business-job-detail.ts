import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { BusinessService } from '../../core/services/business.service';
import { getApiErrorMessage } from '../../core/models/api.model';
import {
  businessJobPriorityLabel,
  businessJobStatusLabel,
  technicianWorkPhaseLabel,
} from '../../core/models/business.model';
import type {
  BusinessJob,
  BusinessJobDetail,
  JobAssignmentDetail,
  Technician,
  TechnicianExecutionEvent,
  TechnicianJobImage,
  TechnicianJobUpdate,
  TechnicianVoiceNote,
} from '../../core/models/business.model';

type DetailStatus = 'loading' | 'ready' | 'error';

type ExecStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * FixLink internal job detail — Stage 7B (`/business/jobs/:id`,
 * authenticated BUSINESS_OWNER / BUSINESS_MANAGER) + Stage 7C
 * (technician assignment).
 *
 * Shows the customer, service, description, address, priority,
 * schedule, status, status-history timeline and business
 * information for one INTERNAL job belonging to the caller's
 * business, plus the current technician assignment with
 * assign/reassign controls. REQUESTED jobs offer a field editor and
 * cancellation; status itself is never set directly. Stage 7D adds a
 * read-only work-documentation section (technician photos, notes,
 * voice notes, execution timeline) once work has started. Parts,
 * approvals and notifications arrive in later stages and are not
 * shown.
 */
@Component({
  selector: 'app-business-job-detail',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './business-job-detail.html',
})
export class BusinessJobDetailComponent implements OnInit, OnDestroy {
  private readonly api = inject(BusinessService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = signal<DetailStatus>('loading');
  protected readonly errorMessage = signal('');
  protected readonly detail = signal<BusinessJobDetail | null>(null);
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  protected readonly cancelling = signal(false);
  protected readonly cancelError = signal('');
  protected readonly assignment = signal<JobAssignmentDetail | null>(null);
  protected readonly technicians = signal<Technician[]>([]);
  protected readonly assigning = signal(false);
  protected readonly assignError = signal('');

  protected readonly form = this.fb.group({
    title: ['', [Validators.maxLength(255)]],
    description: ['', [Validators.minLength(20), Validators.maxLength(2000)]],
    addressLine1: ['', [Validators.maxLength(255)]],
    city: ['', [Validators.maxLength(128)]],
    province: ['', [Validators.maxLength(128)]],
    priority: ['NORMAL'],
  });

  protected readonly assignForm = this.fb.group({
    technicianId: ['', [Validators.required]],
  });

  protected readonly statusText = businessJobStatusLabel;
  protected readonly priorityText = businessJobPriorityLabel;
  protected readonly phaseLabel = technicianWorkPhaseLabel;

  /**
   * Stage 7D read-only work documentation (technician BEFORE/DURING/
   * AFTER photos, notes, voice notes, execution timeline). Loaded for
   * jobs that have left REQUESTED; empty before work starts.
   */
  protected readonly execStatus = signal<ExecStatus>('idle');
  protected readonly execImages = signal<TechnicianJobImage[]>([]);
  protected readonly execUpdates = signal<TechnicianJobUpdate[]>([]);
  protected readonly execVoiceNotes = signal<TechnicianVoiceNote[]>([]);
  protected readonly execEvents = signal<TechnicianExecutionEvent[]>([]);
  protected readonly execPhotoUrls = signal<Record<string, string>>({});
  protected readonly execVoiceUrls = signal<Record<string, string>>({});

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    for (const url of Object.values(this.execPhotoUrls())) {
      URL.revokeObjectURL(url);
    }
    for (const url of Object.values(this.execVoiceUrls())) {
      URL.revokeObjectURL(url);
    }
  }

  protected jobId(): string {
    return this.route.snapshot.paramMap.get('id') ?? '';
  }

  protected load(): void {
    this.status.set('loading');
    this.errorMessage.set('');
    this.cancelError.set('');
    forkJoin({
      detail: this.api.getBusinessJob(this.jobId()),
      assignment: this.api.getJobAssignment(this.jobId()).pipe(catchError(() => of(null))),
      technicians: this.api.listTechnicians().pipe(catchError(() => of({ items: [], total: 0 }))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ detail, assignment, technicians }) => {
          this.detail.set(detail);
          this.assignment.set(assignment);
          this.technicians.set(technicians.items.filter((tech) => tech.isActive));
          this.status.set('ready');
          this.loadExecution(detail.job);
        },
        error: (error: unknown) => {
          this.errorMessage.set(getApiErrorMessage(error, 'Could not load the job. Please try again.'));
          this.status.set('error');
        },
      });
  }

  protected canManage(job: BusinessJob): boolean {
    return job.status === 'REQUESTED';
  }

  /** Stage 7D: load read-only execution documentation once work has started. */
  protected loadExecution(job: BusinessJob): void {
    if (job.status === 'REQUESTED' || job.status === 'CANCELLED') {
      this.execStatus.set('idle');
      return;
    }
    this.execStatus.set('loading');
    forkJoin({
      images: this.api.listBusinessJobImages(job.id).pipe(catchError(() => of(null))),
      updates: this.api.listBusinessJobUpdates(job.id).pipe(catchError(() => of(null))),
      voiceNotes: this.api.listBusinessVoiceNotes(job.id).pipe(catchError(() => of(null))),
      timeline: this.api.getBusinessExecutionTimeline(job.id).pipe(catchError(() => of(null))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result.images === null || result.updates === null || result.voiceNotes === null || result.timeline === null) {
          this.execStatus.set('error');
          return;
        }
        this.execImages.set(result.images);
        this.execUpdates.set(result.updates);
        this.execVoiceNotes.set(result.voiceNotes);
        this.execEvents.set(result.timeline.events);
        this.execStatus.set('ready');
        this.loadExecBlobs(job.id, result.images, result.voiceNotes);
      });
  }

  protected execPhotoUrl(imageId: string): string {
    return this.execPhotoUrls()[imageId] ?? '';
  }

  protected execVoiceUrl(voiceId: string): string {
    return this.execVoiceUrls()[voiceId] ?? '';
  }

  private loadExecBlobs(jobId: string, images: TechnicianJobImage[], voiceNotes: TechnicianVoiceNote[]): void {
    for (const image of images) {
      if (this.execPhotoUrls()[image.id]) continue;
      this.api
        .fetchBusinessJobImageBlob(jobId, image.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (blob) => {
            this.execPhotoUrls.update((current) => ({ ...current, [image.id]: URL.createObjectURL(blob) }));
          },
          error: () => {
            // A single unreadable photo must not break the section.
          },
        });
    }
    for (const voice of voiceNotes) {
      if (this.execVoiceUrls()[voice.id]) continue;
      this.api
        .fetchBusinessJobVoiceNoteBlob(jobId, voice.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (blob) => {
            this.execVoiceUrls.update((current) => ({ ...current, [voice.id]: URL.createObjectURL(blob) }));
          },
          error: () => {
            // A single unreadable voice note must not break the section.
          },
        });
    }
  }

  protected startEditing(): void {
    const job = this.detail()?.job;
    if (!job) return;
    this.form.reset({
      title: job.title ?? '',
      description: job.description,
      addressLine1: job.addressLine1 ?? '',
      city: job.city ?? '',
      province: job.province ?? '',
      priority: job.priority,
    });
    this.saveError.set('');
    this.editing.set(true);
  }

  protected cancelEditing(): void {
    this.editing.set(false);
    this.saveError.set('');
  }

  protected save(): void {
    const job = this.detail()?.job;
    if (!job || this.saving()) return;
    const value = this.form.getRawValue();
    const description = (value.description ?? '').trim();
    if (description !== '' && (description.length < 20 || description.length > 2000)) {
      this.form.controls.description.markAsTouched();
      return;
    }
    this.saving.set(true);
    this.saveError.set('');
    this.api
      .updateBusinessJob(job.id, {
        ...(value.title?.trim() ? { title: value.title.trim() } : {}),
        ...(description ? { description } : {}),
        ...(value.addressLine1?.trim() ? { addressLine1: value.addressLine1.trim() } : {}),
        ...(value.city !== undefined ? { city: value.city?.trim() ? value.city.trim() : null } : {}),
        ...(value.province !== undefined ? { province: value.province?.trim() ? value.province.trim() : null } : {}),
        ...(value.priority ? { priority: value.priority as BusinessJob['priority'] } : {}),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.editing.set(false);
          this.load();
        },
        error: (error: unknown) => {
          this.saveError.set(getApiErrorMessage(error, 'Could not save the job. Please try again.'));
          this.saving.set(false);
        },
      });
  }

  protected cancelJob(): void {
    const job = this.detail()?.job;
    if (!job || this.cancelling()) return;
    this.cancelling.set(true);
    this.cancelError.set('');
    this.api
      .cancelBusinessJob(job.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.cancelling.set(false);
          this.load();
        },
        error: (error: unknown) => {
          this.cancelError.set(getApiErrorMessage(error, 'Could not cancel the job. Please try again.'));
          this.cancelling.set(false);
        },
      });
  }

  protected assign(): void {
    const job = this.detail()?.job;
    const technicianId = this.assignForm.controls.technicianId.value?.trim();
    if (!job || !technicianId || this.assigning()) return;
    this.assigning.set(true);
    this.assignError.set('');
    this.api
      .assignTechnician(job.id, { technicianId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.assigning.set(false);
          this.load();
        },
        error: (error: unknown) => {
          this.assignError.set(getApiErrorMessage(error, 'Could not assign the technician. Please try again.'));
          this.assigning.set(false);
        },
      });
  }
}
