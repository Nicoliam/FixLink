import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BusinessService } from '../../core/services/business.service';
import { getApiErrorMessage } from '../../core/models/api.model';
import { businessRoleLabel, verificationLabel } from '../../core/models/business.model';
import type { Business, BusinessBoardSummary, BusinessJobsSummary } from '../../core/models/business.model';

type DashboardStatus = 'loading' | 'ready' | 'error';

/**
 * FixLink business dashboard — Stage 7A + 7B (`/business`, authenticated
 * BUSINESS_OWNER / BUSINESS_MANAGER).
 *
 * Shows the server-derived business profile (name, status, technician
 * count) with an owner-only profile editor, plus REAL internal-job
 * counts from GET /api/v1/business/jobs-summary (total, requested,
 * scheduled, in progress, completed — zero when there is no data,
 * never fake numbers). Stage 7G adds the operational board counts
 * from GET /api/v1/business/jobs-board-summary (assigned, awaiting
 * parts, history) for the job board workflow. Technician assignment
 * arrives in a later stage. Authorization is backend-enforced; the role checks here only
 * decide which actions are offered.
 */
@Component({
  selector: 'app-business-dashboard',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './business-dashboard.html',
})
export class BusinessDashboardComponent implements OnInit {
  private readonly api = inject(BusinessService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = signal<DashboardStatus>('loading');
  protected readonly errorMessage = signal('');
  protected readonly business = signal<Business | null>(null);
  protected readonly summary = signal<BusinessJobsSummary | null>(null);
  protected readonly boardSummary = signal<BusinessBoardSummary | null>(null);
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
    let loadedBusiness: Business | null = null;
    let loadedSummary: BusinessJobsSummary | null = null;
    let failed = false;
    const finish = (): void => {
      if (failed || loadedBusiness === null || loadedSummary === null) return;
      this.business.set(loadedBusiness);
      this.summary.set(loadedSummary);
      this.status.set('ready');
    };
    const fail = (error: unknown, fallback: string): void => {
      if (failed) return;
      failed = true;
      this.errorMessage.set(getApiErrorMessage(error, fallback));
      this.status.set('error');
    };
    this.api
      .getMyBusiness()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (business) => {
          loadedBusiness = business;
          finish();
        },
        error: (error: unknown) => fail(error, 'Could not load your business. Please try again.'),
      });
    this.api
      .getBusinessJobsSummary()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => {
          loadedSummary = summary;
          finish();
        },
        error: (error: unknown) => fail(error, 'Could not load job statistics. Please try again.'),
      });
    // Operational board counts are supplementary: a failure here never
    // blocks the dashboard — the tiles simply stay hidden.
    this.api
      .getBusinessBoardSummary()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (boardSummary) => this.boardSummary.set(boardSummary),
        error: () => this.boardSummary.set(null),
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

  protected technicianLabel(count: number): string {
    return count === 1 ? '1 technician' : `${count} technicians`;
  }

  protected jobLabel(count: number): string {
    return count === 1 ? '1 internal job' : `${count} internal jobs`;
  }
}
