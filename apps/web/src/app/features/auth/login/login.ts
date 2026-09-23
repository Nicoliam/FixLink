import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AuthShellComponent } from '../auth-shell/auth-shell';
import { friendlyAuthMessage } from '../auth-errors';

/**
 * FixLink login page (Stage 5B).
 *
 * Oceanic card layout with client-side validation, loading state, API error
 * state and post-login redirect (honours ?returnUrl=, falls back to
 * /account). Successful authentication state is the /account session page —
 * dashboards are out of scope for this stage.
 */
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.html',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly isSubmitting = signal(false);
  readonly apiError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  constructor() {
    const prefill = this.route.snapshot.queryParamMap.get('email');
    if (prefill) this.form.controls.email.setValue(prefill);
  }

  get email() {
    return this.form.controls.email;
  }

  get password() {
    return this.form.controls.password;
  }

  submit(): void {
    if (this.isSubmitting()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.isSubmitting.set(true);
    this.apiError.set(null);

    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        void this.router.navigateByUrl(returnUrl && returnUrl.startsWith('/') ? returnUrl : '/account');
      },
      error: (error: unknown) => {
        this.isSubmitting.set(false);
        this.apiError.set(friendlyAuthMessage(error, 'Login failed. Please try again.'));
      },
    });
  }
}
