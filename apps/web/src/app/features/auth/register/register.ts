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
 * FixLink registration page (Stage 5B).
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

  readonly form = this.fb.nonNullable.group(
    {
      role: this.fb.nonNullable.control<SelfRegisterRole>('CUSTOMER', [Validators.required]),
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

  get role() {
    return this.form.controls.role;
  }

  get email() {
    return this.form.controls.email;
  }

  get phone() {
    return this.form.controls.phone;
  }

  get password() {
    return this.form.controls.password;
  }

  get confirmPassword() {
    return this.form.controls.confirmPassword;
  }

  submit(): void {
    if (this.isSubmitting()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.isSubmitting.set(true);
    this.apiError.set(null);

    const { email, phone, password, role } = this.form.getRawValue();
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
