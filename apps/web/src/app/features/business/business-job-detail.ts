import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { BusinessService } from '../../core/services/business.service';
import { getApiErrorMessage } from '../../core/models/api.model';
import { businessJobPriorityLabel, businessJobStatusLabel } from '../../core/models/business.model';
import type {
  BusinessJob,
  BusinessJobDetail,
  JobAssignmentDetail,
  Technician,
} from '../../core/models/business.model';

type DetailStatus = 'loading' | 'ready' | 'error';

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
 * cancellation; status itself is never set directly. Parts,
 * approvals and notifications arrive in later stages and are not
 * shown.
 */
@Component({
  selector: 'app-business-job-detail',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './business-job-detail.html',
})
export class BusinessJobDetailComponent implements OnInit {
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

  ngOnInit(): void {
    this.load();
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
