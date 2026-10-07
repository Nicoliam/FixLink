import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  ReactiveFormsModule,
  FormBuilder,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { MarketplaceService } from '../../../core/services/marketplace.service';
import { OfferingService } from '../../../core/services/offering.service';
import type { ServiceListing } from '../../../core/models/marketplace.model';
import { AuthService } from '../../../core/services/auth.service';
import { roleLandingRoute } from '../../../core/routing/role-landing';
import {
  SELF_REGISTER_ROLE_OPTIONS,
  type AuthUser,
  type SelfRegisterRole,
  type UserRole,
} from '../../../core/models/auth.model';
import { AuthShellComponent } from '../auth-shell/auth-shell';
import { friendlyAuthMessage } from '../auth-errors';

/** Mirrors the backend phone rule (auth.validation.ts) for instant feedback. */
export const PHONE_PATTERN = /^0\d{9}$/;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Mirrors PROFILE_NAME_MAX in backend auth.validation.ts. */
export const PROFILE_NAME_MAX = 255;

/** Mirrors CUSTOMER_NAME_MAX in backend auth.validation.ts. */
export const CUSTOMER_NAME_MAX = 128;

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value as string | undefined;
  const confirm = group.get('confirmPassword')?.value as string | undefined;
  return password && confirm && password !== confirm ? { passwordsMismatch: true } : null;
}

/**
 * Fixlynk registration page — self-registration in two or three steps.
 *
 * Step 1 asks only "I am joining as". Exactly one account type must be chosen
 * before anything else is revealed, which keeps the commitment clear and stops
 * users filling in a form for the wrong role.
 *
 * A customer then goes straight to step 2, which collects the account details
 * and submits.
 *
 * A provider (PROFESSIONAL / BUSINESS_OWNER) gets one step in between:
 *
 *   Step 2 — the services they offer
 *   Step 3 — the account details, ending on "Create account"
 *
 * Services come BEFORE the account is created on purpose: the catalogue is
 * public, so a provider can say what they do before committing to a form, and
 * the last thing they do is create the account with their skills already
 * chosen. The selected services are saved as offerings right after the account
 * is created, still on step 3, so a partial failure can be retried without
 * making the provider register again.
 *
 * Provider roles are asked for the name their customers will see (display name
 * / business name) because the backend creates that profile with the account.
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
  private readonly marketplace = inject(MarketplaceService);
  private readonly offerings = inject(OfferingService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly roleOptions = SELF_REGISTER_ROLE_OPTIONS;
  readonly isSubmitting = signal(false);
  readonly apiError = signal<string | null>(null);

  /**
   * Set once the account exists. A second submit must retry saving the chosen
   * services, not re-register: the email is taken from that point on.
   */
  readonly accountCreated = signal<AuthUser | null>(null);

  /**
   * Optional ?role= preselection, so the artisan CTAs
   * (/register?role=PROFESSIONAL) open with that card already chosen. The
   * generic "Create account" link passes no hint, so step 1 starts empty and
   * every account type is a deliberate choice.
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

  /**
   * 1 = choose account type. For a provider, 2 = services offered and
   * 3 = account details (which submits). For a customer, 2 = account details.
   */
  readonly step = signal<1 | 2 | 3>(1);

  /** Step 1. Empty unless a valid ?role= hint was supplied. */
  readonly roleForm = this.fb.group({
    role: this.fb.control<SelfRegisterRole | null>(this.preselectRole, {
      validators: [Validators.required],
    }),
  });

  /** The last step. Validation rules are unchanged from the previous form. */
  readonly detailsForm = this.fb.nonNullable.group(
    {
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.pattern(PHONE_PATTERN)]],
      password: [
        '',
        [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH), Validators.maxLength(PASSWORD_MAX_LENGTH)],
      ],
      confirmPassword: ['', [Validators.required]],
      /** CUSTOMER only — customer_profiles.first_name / last_name (NOT NULL). */
      firstName: ['', [Validators.maxLength(CUSTOMER_NAME_MAX)]],
      lastName: ['', [Validators.maxLength(CUSTOMER_NAME_MAX)]],
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
  readonly firstName = this.detailsForm.controls.firstName;
  readonly lastName = this.detailsForm.controls.lastName;
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

  /** Label of the retained selection, shown on steps 2 and 3. */
  get selectedRoleLabel(): string {
    return this.roleOptions.find((option) => option.value === this.role.value)?.label ?? '';
  }

  get onStepOne(): boolean {
    return this.step() === 1;
  }

  /** Providers pick what they offer before they create the account. */
  get onServicesStep(): boolean {
    return this.step() === 2 && this.isProviderRole;
  }

  /** The account details step: step 3 for a provider, step 2 for a customer. */
  get onDetailsStep(): boolean {
    return this.isProviderRole ? this.step() === 3 : this.step() === 2;
  }

  /** How many steps this role walks through, for the "Step X of Y" hint. */
  get totalSteps(): number {
    return this.isProviderRole ? 3 : 2;
  }

  get currentStep(): number {
    return this.onServicesStep ? 2 : this.step();
  }

  get isProfessional(): boolean {
    return this.role.value === 'PROFESSIONAL';
  }

  get isBusinessOwner(): boolean {
    return this.role.value === 'BUSINESS_OWNER';
  }

  get isCustomer(): boolean {
    return this.role.value === 'CUSTOMER';
  }

  /**
   * Continue is focusable even with nothing selected so keyboard and screen
   * reader users can reach it and be told what is missing, rather than
   * meeting a disabled control they cannot focus or interrogate.
   */
  continueFromRole(): void {
    if (!this.canContinue) {
      this.roleForm.markAllAsTouched();
      return;
    }
    this.apiError.set(null);
    this.step.set(2);
    // A provider's next step is the services catalogue, which is public, so it
    // is fetched here — before the account exists.
    if (this.isProviderRole && this.servicesStatus() === 'idle') {
      this.loadServices();
    }
  }

  /** Provider only: leave the services step for the account details. */
  continueFromServices(): void {
    this.apiError.set(null);
    this.step.set(3);
  }

  // ---------------------------------------------------------------------
  // Step 2 - services offered (PROFESSIONAL / BUSINESS_OWNER only)
  // ---------------------------------------------------------------------
  //
  // A customer has no services, so they go straight from step 1 to their
  // landing route. A provider picks what they offer here — before the account
  // exists — and prices are set later on My Services, so nothing on this step
  // asks for money.
  readonly servicesStatus = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly servicesError = signal('');
  readonly allServices = signal<ServiceListing[]>([]);
  /** Catalogue service ids the provider has ticked. */
  readonly selectedServiceIds = signal<ReadonlySet<string>>(new Set<string>());
  readonly savingServices = signal(false);
  /** Set when the account was created but saving the services failed. */
  readonly servicesSaveError = signal<string | null>(null);
  /**
   * Services already created as offerings. Not a signal: it is only read while
   * a save is in flight, never rendered.
   */
  private readonly savedServiceIds = new Set<string>();

  /** Services grouped by category, for a heading per group. */
  readonly servicesByCategory = computed(() => {
    const groups = new Map<string, { name: string; services: ServiceListing[] }>();
    for (const service of this.allServices()) {
      const existing = groups.get(service.categoryId);
      if (existing) existing.services.push(service);
      else groups.set(service.categoryId, { name: service.categoryName, services: [service] });
    }
    return [...groups.values()];
  });

  readonly selectedCount = computed(() => this.selectedServiceIds().size);

  isServiceSelected(serviceId: string): boolean {
    return this.selectedServiceIds().has(serviceId);
  }

  /** Toggle one service. */
  toggleService(serviceId: string): void {
    this.selectedServiceIds.update((current) => {
      const next = new Set(current);
      if (next.has(serviceId)) next.delete(serviceId);
      else next.add(serviceId);
      return next;
    });
  }

  isCategorySelected(categoryId: string): boolean {
    return this.allServices()
      .filter((service) => service.categoryId === categoryId)
      .every((service) => this.selectedServiceIds().has(service.id));
  }

  toggleCategory(categoryId: string): void {
    const inCategory = this.allServices().filter((service) => service.categoryId === categoryId);
    this.selectedServiceIds.update((current) => {
      const next = new Set(current);
      const allSelected = inCategory.every((service) => next.has(service.id));
      for (const service of inCategory) {
        if (allSelected) next.delete(service.id);
        else next.add(service.id);
      }
      return next;
    });
  }

  /**
   * Return to the previous step. The role selection is retained, so a provider
   * stepping back from the account details returns to their ticked services
   * rather than losing them.
   */
  back(): void {
    if (this.isSubmitting()) return;
    this.apiError.set(null);
    this.servicesSaveError.set(null);
    this.step.set(this.step() === 3 ? 2 : 1);
  }

  /** Label of the submitting button, which changes once the account exists. */
  get submitLabel(): string {
    if (this.isSubmitting()) return this.accountCreated() === null ? 'Creating account…' : 'Saving…';
    return this.accountCreated() === null ? 'Create account' : 'Finish setup';
  }

  submit(): void {
    if (this.isSubmitting() || !this.onDetailsStep) return;

    // The account already exists (a previous attempt saved the account but not
    // every service), so re-registering would fail on the duplicate email.
    // Retry the services instead.
    const created = this.accountCreated();
    if (created !== null) {
      void this.saveSelectedServices(created.roles);
      return;
    }

    this.detailsForm.markAllAsTouched();
    this.roleForm.markAllAsTouched();
    if (this.detailsForm.invalid || this.roleForm.invalid) return;

    const role = this.role.value;
    if (!role) return;

    this.isSubmitting.set(true);
    this.apiError.set(null);

    const { email, phone, password, firstName, lastName, displayName, businessName } =
      this.detailsForm.getRawValue();
    this.auth
      .register({
        email,
        phone: phone || undefined,
        password,
        role,
        firstName: this.isCustomer && firstName ? firstName : undefined,
        lastName: this.isCustomer && lastName ? lastName : undefined,
        displayName: this.isProfessional ? displayName : undefined,
        businessName: this.isBusinessOwner ? businessName : undefined,
      })
      .subscribe({
        next: (user) => {
          this.accountCreated.set(user);
          // A customer has no services, so they are done. A provider's ticked
          // services are saved now, on this same step, so a failure can be
          // retried without discarding the account they just created.
          if (this.isProviderRole) {
            void this.saveSelectedServices(user.roles);
            return;
          }
          this.isSubmitting.set(false);
          void this.router.navigateByUrl(roleLandingRoute(user.roles));
        },
        error: (error: unknown) => {
          this.isSubmitting.set(false);
          this.apiError.set(friendlyAuthMessage(error, 'Registration failed. Please try again.'));
        },
      });
  }

  /** Does this registration pick services? PROFESSIONAL / BUSINESS_OWNER do. */
  get isProviderRole(): boolean {
    return this.isProfessional || this.isBusinessOwner;
  }

  /** Load the public service catalogue for the services picker. */
  private loadServices(): void {
    this.servicesStatus.set('loading');
    this.servicesError.set('');
    this.marketplace
      .listServices()
      .pipe(catchError(() => of(null)))
      .subscribe((services) => {
        if (services === null) {
          this.servicesStatus.set('error');
          this.servicesError.set('Could not load the service list. You can add these later.');
          return;
        }
        this.allServices.set(services);
        this.servicesStatus.set(services.length > 0 ? 'ready' : 'error');
        if (services.length === 0) {
          this.servicesError.set('No services are available yet. You can add these later.');
        }
      });
  }

  /** Re-run the catalogue load after a failure. */
  retryServices(): void {
    this.loadServices();
  }

  /**
   * Save the ticked services as offerings, then land on the dashboard.
   *
   * Called only after the account was created, so this is a plain
   * authenticated POST — no change to the registration contract.
   *
   * Each service is created without a price: a brand-new provider has not
   * decided what to charge yet, and Fixlynk does not invent one (AGENTS.md
   * section 12). `price_amount` is nullable for exactly this case, and prices
   * are set afterwards on My Services.
   *
   * Failures here are reported WITHOUT discarding the account. Losing a
   * registered professional's services is recoverable; making them re-register
   * because one POST failed is not. The provider stays on the details step,
   * where the button becomes "Finish setup" so the remaining services can be
   * retried.
   */
  private async saveSelectedServices(roles: readonly UserRole[]): Promise<void> {
    if (this.savingServices()) return;
    // Already-created offerings are excluded, so a retry after a partial save
    // finishes the remainder instead of failing on duplicates.
    const selected = this.allServices().filter(
      (service) => this.selectedServiceIds().has(service.id) && !this.savedServiceIds.has(service.id),
    );
    if (selected.length === 0 || this.servicesSavingUnavailable) {
      this.isSubmitting.set(false);
      void this.router.navigateByUrl(roleLandingRoute(roles));
      return;
    }

    this.savingServices.set(true);
    this.servicesSaveError.set(null);

    const results = await firstValueFrom(
      forkJoin(
        selected.map((service) =>
          this.offerings
            .create({
              categoryId: service.categoryId,
              name: service.name,
              description: service.description ?? undefined,
            })
            .pipe(
              map(() => ({ id: service.id, saved: true })),
              catchError(() => {
                // One rejected service must not lose the others.
                return of({ id: service.id, saved: false });
              }),
            ),
        ),
      ),
    );

    for (const result of results) {
      if (result.saved) this.savedServiceIds.add(result.id);
    }
    this.savingServices.set(false);
    this.isSubmitting.set(false);

    if (results.some((result) => !result.saved)) {
      this.servicesSaveError.set(
        `Saved ${this.savedServiceIds.size} of ${this.selectedCount()} services. You can add the rest from My Services.`,
      );
      return;
    }
    void this.router.navigateByUrl(roleLandingRoute(roles));
  }

  /** True when the picker cannot be used, so saving is skipped not attempted. */
  get servicesSavingUnavailable(): boolean {
    return this.allServices().length === 0;
  }
}
