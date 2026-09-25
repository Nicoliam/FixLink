import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  ReactiveFormsModule,
  FormBuilder,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { SELF_REGISTER_ROLE_OPTIONS, type SelfRegisterRole } from '../../../core/models/auth.model';
import { AuthShellComponent } from '../auth-shell/auth-shell';
import { friendlyAuthMessage } from '../auth-errors';

/** Mirrors the backend phone rule (auth.validation.ts) for instant feedback. */
export const PHONE_PATTERN = /^[+]?[0-9][0-9\s\-()]{5,18}[0-9]$/;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value as string | undefined;
  const confirm = group.get('confirmPassword')?.value as string | undefined;
  return password && confirm && password !== confirm ? { passwordsMismatch: true } : null;
}

/**
 * FixLink registration page — two-step self-registration.
 *
 * Step 1 asks only "I am joining as". Exactly one account type must be chosen
 * before the email/password fields are revealed, which keeps the commitment
 * clear and stops users filling in a form for the wrong role.
 *
 * Step 2 collects the account details and submits.
 *
 * The role control starts empty (no implicit CUSTOMER) so the user always
 * makes a deliberate choice. It is held in its own form group, which is why
 * the selection survives navigating Back and Forward.
 *
 * Self-registration is limited to CUSTOMER, PROFESSIONAL and BUSINESS_OWNER
 * (see backend auth.validation.ts). ADMIN, BUSINESS_MANAGER and TECHNICIAN
 * are never offered as options. The backend creates the account only — the
 * success state directs the user to log in (no tokens are issued at
 * registration).
 */
@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './register.html',
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  readonly roleOptions = SELF_REGISTER_ROLE_OPTIONS;
  readonly isSubmitting = signal(false);
  readonly apiError = signal<string | null>(null);
  readonly registeredEmail = signal<string | null>(null);

  /** 1 = choose account type, 2 = account details. */
  readonly step = signal<1 | 2>(1);

  /** Step 1. Starts empty so the user must choose deliberately. */
  readonly roleForm = this.fb.group({
    role: this.fb.control<SelfRegisterRole | null>(null, { validators: [Validators.required] }),
  });

  /** Step 2. Validation rules are unchanged from the previous single-page form. */
  readonly detailsForm = this.fb.nonNullable.group(
    {
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.pattern(PHONE_PATTERN)]],
      password: [
        '',
        [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH), Validators.maxLength(PASSWORD_MAX_LENGTH)],
      ],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: [passwordsMatch] },
  );

  readonly role = this.roleForm.controls.role;
  readonly email = this.detailsForm.controls.email;
  readonly phone = this.detailsForm.controls.phone;
  readonly password = this.detailsForm.controls.password;
  readonly confirmPassword = this.detailsForm.controls.confirmPassword;

  /**
   * Angular form-control values are not signals, so these must be plain
   * getters — a `computed()` would have no signal dependency to invalidate on
   * and would cache the first value it ever read.
   */
  get canContinue(): boolean {
    return this.role.value !== null && this.role.valid;
  }

  /** Label of the retained selection, shown on step 2. */
  get selectedRoleLabel(): string {
    return this.roleOptions.find((option) => option.value === this.role.value)?.label ?? '';
  }

  get onStepOne(): boolean {
    return this.step() === 1;
  }

  /**
   * Continue is focusable even with nothing selected so keyboard and screen
   * reader users can reach it and be told what is missing, rather than
   * meeting a disabled control they cannot focus or interrogate.
   */
  continueToDetails(): void {
    if (!this.canContinue) {
      this.roleForm.markAllAsTouched();
      return;
    }
    this.apiError.set(null);
    this.step.set(2);
  }

  /** Return to step 1. The role selection is retained so the user can change it. */
  back(): void {
    if (this.isSubmitting()) return;
    this.apiError.set(null);
    this.step.set(1);
  }

  submit(): void {
    if (this.isSubmitting() || this.step() !== 2) return;
    this.detailsForm.markAllAsTouched();
    this.roleForm.markAllAsTouched();
    if (this.detailsForm.invalid || this.roleForm.invalid) return;

    const role = this.role.value;
    if (!role) return;

    this.isSubmitting.set(true);
    this.apiError.set(null);

    const { email, phone, password } = this.detailsForm.getRawValue();
    this.auth.register({ email, phone: phone || undefined, password, role }).subscribe({
      next: (user) => {
        this.isSubmitting.set(false);
        this.registeredEmail.set(user.email);
      },
      error: (error: unknown) => {
        this.isSubmitting.set(false);
        this.apiError.set(friendlyAuthMessage(error, 'Registration failed. Please try again.'));
      },
    });
  }
}
