import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  ReactiveFormsModule,
  FormBuilder,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { roleLandingRoute } from '../../../core/routing/role-landing';
import { SELF_REGISTER_ROLE_OPTIONS, type SelfRegisterRole } from '../../../core/models/auth.model';
import { AuthShellComponent } from '../auth-shell/auth-shell';
import { friendlyAuthMessage } from '../auth-errors';

/** Mirrors the backend phone rule (auth.validation.ts) for instant feedback. */
export const PHONE_PATTERN = /^0\d{9}$/;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Mirrors PROFILE_NAME_MAX in backend auth.validation.ts. */
export const PROFILE_NAME_MAX = 255;

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value as string | undefined;
  const confirm = group.get('confirmPassword')?.value as string | undefined;
  return password && confirm && password !== confirm ? { passwordsMismatch: true } : null;
}

/**
 * Fixlynk registration page — two-step self-registration.
 *
 * Step 1 asks only "I am joining as". Exactly one account type must be chosen
 * before the email/password fields are revealed, which keeps the commitment
 * clear and stops users filling in a form for the wrong role.
 *
 * Step 2 collects the account details and submits. Provider roles are asked
 * for the name their customers will see (display name / business name)
 * because the backend creates that profile together with the account.
 *
 * The role control starts empty (no implicit CUSTOMER) so the user always
 * makes a deliberate choice. It is held in its own form group, which is why
 * the selection survives navigating Back and Forward.
 *
 * Self-registration is limited to CUSTOMER, PROFESSIONAL and BUSINESS_OWNER
 * (see backend auth.validation.ts). ADMIN, BUSINESS_MANAGER and TECHNICIAN
 * are never offered as options.
 *
 * Registration is NOT verification-gated: the backend returns a session, so a
 * successful submit navigates straight to the new account's landing route.
 */
@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, AuthShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './register.html',
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly roleOptions = SELF_REGISTER_ROLE_OPTIONS;
  readonly isSubmitting = signal(false);
  readonly apiError = signal<string | null>(null);

  /**
   * Optional ?role= preselection, so links like "Join as an Artisan"
   * (/register?role=PROFESSIONAL) open with that card already chosen.
   *
   * Only roles the backend actually accepts are honoured — an unknown or
   * privileged value (ADMIN, TECHNICIAN, …) falls back to no preselection
   * rather than rendering a role the user cannot register as. The control
   * still starts empty when no valid hint is given, so the deliberate-choice
   * design of step 1 is unchanged.
   */
  private readonly preselectRole = ((): SelfRegisterRole | null => {
    const requested = this.route.snapshot.queryParamMap.get('role');
    const allowed: readonly string[] = SELF_REGISTER_ROLE_OPTIONS.map((option) => option.value);
    return requested && allowed.includes(requested) ? (requested as SelfRegisterRole) : null;
  })();

  /** 1 = choose account type, 2 = account details. */
  readonly step = signal<1 | 2>(1);

  /** Step 1. Empty unless a valid ?role= hint was supplied. */
  readonly roleForm = this.fb.group({
    role: this.fb.control<SelfRegisterRole | null>(this.preselectRole, {
      validators: [Validators.required],
    }),
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
      /** PROFESSIONAL only. */
      displayName: ['', [Validators.maxLength(PROFILE_NAME_MAX)]],
      /** BUSINESS_OWNER only. */
      businessName: ['', [Validators.maxLength(PROFILE_NAME_MAX)]],
    },
    { validators: [passwordsMatch] },
  );

  readonly role = this.roleForm.controls.role;
  readonly email = this.detailsForm.controls.email;
  readonly phone = this.detailsForm.controls.phone;
  readonly password = this.detailsForm.controls.password;
  readonly confirmPassword = this.detailsForm.controls.confirmPassword;
  readonly displayName = this.detailsForm.controls.displayName;
  readonly businessName = this.detailsForm.controls.businessName;

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

  get isProfessional(): boolean {
    return this.role.value === 'PROFESSIONAL';
  }

  get isBusinessOwner(): boolean {
    return this.role.value === 'BUSINESS_OWNER';
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

    const { email, phone, password, displayName, businessName } = this.detailsForm.getRawValue();
    this.auth
      .register({
        email,
        phone: phone || undefined,
        password,
        role,
        displayName: this.isProfessional ? displayName : undefined,
        businessName: this.isBusinessOwner ? businessName : undefined,
      })
      .subscribe({
        next: (user) => {
          // The account is logged in — go straight to its own landing route.
          void this.router.navigateByUrl(roleLandingRoute(user.roles));
        },
        error: (error: unknown) => {
          this.isSubmitting.set(false);
          this.apiError.set(friendlyAuthMessage(error, 'Registration failed. Please try again.'));
        },
      });
  }
}
