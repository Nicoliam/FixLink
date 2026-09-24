import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BusinessService } from '../../core/services/business.service';
import { AuthService } from '../../core/services/auth.service';
import { getApiErrorMessage } from '../../core/models/api.model';
import type { Technician } from '../../core/models/business.model';

type DetailStatus = 'loading' | 'ready' | 'error';

const MANAGER_ROLES = ['BUSINESS_OWNER', 'BUSINESS_MANAGER'];

/**
 * FixLink technician detail — Stage 7A
 * (`/business/technicians/:id`, authenticated owner/manager, or the
 * technician themself via the backend self-access rule).
 *
 * Shows the roster row with contact info plus rename and
 * activate/deactivate actions for managers. The backend enforces every
 * permission; the role checks here only decide which actions are offered.
 */
@Component({
  selector: 'app-technician-detail',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './technician-detail.html',
})
export class TechnicianDetailComponent implements OnInit {
  private readonly api = inject(BusinessService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = signal<DetailStatus>('loading');
  protected readonly errorMessage = signal('');
  protected readonly technician = signal<Technician | null>(null);
  protected readonly renaming = signal(false);
  protected readonly toggling = signal(false);
  protected readonly actionError = signal('');

  protected readonly renameForm = this.fb.group({
    displayName: ['', [Validators.required, Validators.maxLength(255)]],
  });

  /** Rename/activation are manager actions; the backend enforces them. */
  protected readonly canManage = computed(() =>
    (this.auth.currentUser()?.roles ?? []).some((role) => MANAGER_ROLES.includes(role)),
  );

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.status.set('loading');
    this.errorMessage.set('');
    this.api
      .getTechnician(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (technician) => {
          this.technician.set(technician);
          this.renameForm.reset({ displayName: technician.displayName });
          this.renaming.set(false);
          this.status.set('ready');
        },
        error: (error: unknown) => {
          this.errorMessage.set(getApiErrorMessage(error, 'Could not load the technician. Please try again.'));
          this.status.set('error');
        },
      });
  }

  protected saveName(): void {
    const current = this.technician();
    if (this.renaming() || !current || this.renameForm.invalid) {
      this.renameForm.markAllAsTouched();
      return;
    }
    this.renaming.set(true);
    this.actionError.set('');
    this.api
      .updateTechnician(current.id, { displayName: this.renameForm.getRawValue().displayName ?? '' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (technician) => {
          this.technician.set(technician);
          this.renaming.set(false);
        },
        error: (error: unknown) => {
          this.actionError.set(getApiErrorMessage(error, 'Could not rename the technician. Please try again.'));
          this.renaming.set(false);
        },
      });
  }

  protected toggleActive(): void {
    const current = this.technician();
    if (this.toggling() || !current) return;
    this.toggling.set(true);
    this.actionError.set('');
    this.api
      .updateTechnician(current.id, { isActive: !current.isActive })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (technician) => {
          this.technician.set(technician);
          this.toggling.set(false);
        },
        error: (error: unknown) => {
          this.actionError.set(getApiErrorMessage(error, 'Could not update the technician. Please try again.'));
          this.toggling.set(false);
        },
      });
  }

  protected statusLabel(technician: Technician): string {
    return technician.isActive ? 'Active' : 'Inactive';
  }
}
