import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BusinessService } from '../../core/services/business.service';
import { AuthService } from '../../core/services/auth.service';
import { getApiErrorMessage } from '../../core/models/api.model';
import type { Technician } from '../../core/models/business.model';

type RosterStatus = 'loading' | 'ready' | 'empty' | 'error';

const MANAGER_ROLES = ['BUSINESS_OWNER', 'BUSINESS_MANAGER'];

/**
 * FixLink technician roster — Stage 7A (`/business/technicians`,
 * authenticated BUSINESS_OWNER / BUSINESS_MANAGER).
 *
 * Lists the technicians belonging to the caller's business with an
 * invite form for managers. Technicians never see this surface: the
 * backend rejects them, and navigation only exposes it to business
 * roles. Job assignment arrives in a later stage.
 */
@Component({
  selector: 'app-technician-list',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './technician-list.html',
})
export class TechnicianListComponent implements OnInit {
  private readonly api = inject(BusinessService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = signal<RosterStatus>('loading');
  protected readonly errorMessage = signal('');
  protected readonly technicians = signal<Technician[]>([]);
  protected readonly inviting = signal(false);
  protected readonly inviteError = signal('');

  protected readonly inviteForm = this.fb.group({
    displayName: ['', [Validators.required, Validators.maxLength(255)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
    phone: ['', [Validators.maxLength(32)]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
  });

  /** The invite form is offered to managers; the backend enforces it. */
  protected readonly canInvite = computed(() =>
    (this.auth.currentUser()?.roles ?? []).some((role) => MANAGER_ROLES.includes(role)),
  );

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.status.set('loading');
    this.errorMessage.set('');
    this.api
      .listTechnicians()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.technicians.set(list.items);
          this.status.set(list.items.length === 0 ? 'empty' : 'ready');
        },
        error: (error: unknown) => {
          this.errorMessage.set(getApiErrorMessage(error, 'Could not load technicians. Please try again.'));
          this.status.set('error');
        },
      });
  }

  protected invite(): void {
    if (this.inviting() || this.inviteForm.invalid) {
      this.inviteForm.markAllAsTouched();
      return;
    }
    this.inviting.set(true);
    this.inviteError.set('');
    const value = this.inviteForm.getRawValue();
    this.api
      .createTechnician({
        displayName: value.displayName ?? '',
        email: value.email ?? '',
        phone: value.phone ?? undefined,
        password: value.password ?? undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (technician) => {
          this.technicians.update((items) => [...items, technician]);
          this.status.set('ready');
          this.inviteForm.reset();
          this.inviting.set(false);
        },
        error: (error: unknown) => {
          this.inviteError.set(getApiErrorMessage(error, 'Could not invite the technician. Please try again.'));
          this.inviting.set(false);
        },
      });
  }

  protected statusLabel(technician: Technician): string {
    return technician.isActive ? 'Active' : 'Inactive';
  }

  protected contactLabel(technician: Technician): string {
    return [technician.email, technician.phone].filter((part) => part && part.length > 0).join(' · ') || 'No contact on file';
  }
}
