import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { Component } from '@angular/core';
import { vi } from 'vitest';
import { RegisterComponent } from './register';
import { API_BASE_URL } from '../../../core/config/api-config';
import type { AuthUser, SelfRegisterRole } from '../../../core/models/auth.model';

const API = 'http://test.local/api/v1';

@Component({ template: '' })
class DummyComponent {}

const mockUser: AuthUser = {
  id: 'user-1',
  email: 'new@example.co.za',
  phone: null,
  status: 'ACTIVE',
  roles: ['CUSTOMER'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const validDetails = {
  email: 'new@example.co.za',
  phone: '',
  password: 'password123',
  confirmPassword: 'password123',
  firstName: 'Naledi',
  lastName: 'Dlamini',
  displayName: 'Sipho Ndlovu',
  businessName: 'Mokoena Plumbing',
};

/** Landing route each self-registerable role is sent to. */
const LANDING: Record<SelfRegisterRole, string> = {
  CUSTOMER: '/my-jobs',
  PROFESSIONAL: '/requests',
  BUSINESS_OWNER: '/business',
};

/** The public catalogue a provider picks from on the services step. */
const CATALOGUE = [
  { id: '1', categoryId: '10', categoryName: 'Plumbing', categorySlug: 'plumbing', name: 'Leak Repair', slug: 'leak-repair', description: 'Leaks and pipe fixes' },
  { id: '2', categoryId: '10', categoryName: 'Plumbing', categorySlug: 'plumbing', name: 'Geyser Installation', slug: 'geyser', description: null },
  { id: '3', categoryId: '20', categoryName: 'Electrical', categorySlug: 'electrical', name: 'DB Board Upgrades', slug: 'db-board', description: null },
];

describe('RegisterComponent (registration steps)', () => {
  let fixture: ComponentFixture<RegisterComponent>;
  let component: RegisterComponent;
  let httpMock: HttpTestingController;
  let router: Router;

  const el = (testid: string): HTMLElement | null =>
    fixture.nativeElement.querySelector(`[data-testid="${testid}"]`);

  const backButton = (): HTMLButtonElement => el('register-back') as HTMLButtonElement;

  const selectRole = (role: SelfRegisterRole): void => {
    component.role.setValue(role);
    fixture.detectChanges();
  };

  /** Step 1 -> the next step: services for a provider, details for a customer. */
  const continueFromRole = (role: SelfRegisterRole = 'CUSTOMER'): void => {
    selectRole(role);
    component.continueFromRole();
    fixture.detectChanges();
  };

  /** Resolve the catalogue request the provider's services step makes. */
  const flushCatalogue = (): void => {
    httpMock
      .expectOne(`${API}/services`)
      .flush({ success: true, data: { items: CATALOGUE, total: CATALOGUE.length } });
    fixture.detectChanges();
  };

  /**
   * Reach the account details step for any role, walking through the provider's
   * services step first (as a user must).
   */
  const goToDetails = (role: SelfRegisterRole = 'CUSTOMER'): void => {
    continueFromRole(role);
    if (component.isProviderRole) {
      flushCatalogue();
      component.continueFromServices();
      fixture.detectChanges();
    }
  };

  const fillDetails = (values: Partial<typeof validDetails> = {}): void => {
    component.detailsForm.setValue({ ...validDetails, ...values });
    fixture.detectChanges();
  };

  /**
   * Lets the async offering saves run to completion. A single microtask is not
   * enough: the save awaits a forkJoin and then updates signals.
   */
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  const providers = (queryParams: Record<string, string>) => [
    provideHttpClient(),
    provideHttpClientTesting(),
    // The landing routes are real, so a successful registration navigates
    // without the router rejecting an unknown URL segment.
    provideRouter(Object.values(LANDING).map((path) => ({ path: path.slice(1), component: DummyComponent }))),
    { provide: API_BASE_URL, useValue: API },
    {
      provide: ActivatedRoute,
      useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
    },
  ];

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: providers({}),
    }).compileComponents();
    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  /**
   * Builds a second, independent component whose ActivatedRoute carries the
   * given query params, so the ?role= preselection can be exercised without
   * disturbing the shared fixture (which must stay unselected).
   *
   * It needs a fresh TestBed: the shared one has already been instantiated by
   * beforeEach, and a provider cannot be overridden after that point.
   */
  const createWithQueryParams = (queryParams: Record<string, string>): { component: RegisterComponent } => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [RegisterComponent], providers: providers(queryParams) });
    const extraFixture = TestBed.createComponent(RegisterComponent);
    extraFixture.detectChanges();
    return { component: extraFixture.componentInstance };
  };

  describe('step 1 - account type', () => {
    it('only offers self-registrable roles (ADMIN, TECHNICIAN, BUSINESS_MANAGER excluded)', () => {
      const values = component.roleOptions.map((option) => option.value).sort();
      expect(values).toEqual(['BUSINESS_OWNER', 'CUSTOMER', 'PROFESSIONAL']);

      const radios = fixture.nativeElement.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>;
      expect(radios.length).toBe(3);
      const radioRoles = Array.from(radios)
        .map((radio) => radio.getAttribute('data-testid')?.replace('register-role-', ''))
        .sort();
      expect(radioRoles).toEqual(['BUSINESS_OWNER', 'CUSTOMER', 'PROFESSIONAL']);
    });

    it('shows the required heading and each option description', () => {
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('I am joining as');
      expect(text).toContain('Customer');
      expect(text).toContain('Request home services, receive quotes and review completed work.');
      expect(text).toContain('Professional');
      expect(text).toContain('Offer services, submit quotes and manage your jobs.');
      expect(text).toContain('Business owner');
      expect(text).toContain('Register a service business and manage your team and jobs.');
    });

    it('starts on step 1 with no account type preselected', () => {
      expect(component.step()).toBe(1);
      expect(component.role.value).toBeNull();
      expect(component.canContinue).toBe(false);
    });

    it.each(['CUSTOMER', 'PROFESSIONAL', 'BUSINESS_OWNER'] as const)(
      'preselects %s from the ?role= hint used by the artisan CTAs',
      (role) => {
        const withHint = createWithQueryParams({ role });
        expect(withHint.component.role.value).toBe(role);
        expect(withHint.component.canContinue).toBe(true);
        // Still on step 1: the user confirms the type rather than skipping it.
        expect(withHint.component.step()).toBe(1);
      },
    );

    it.each(['ADMIN', 'TECHNICIAN', 'BUSINESS_MANAGER', 'nonsense', ''])(
      'ignores an invalid ?role=%s hint and stays unselected',
      (role) => {
        const withHint = createWithQueryParams({ role });
        expect(withHint.component.role.value).toBeNull();
        expect(withHint.component.canContinue).toBe(false);
      },
    );

    it('hides the email and password fields until an account type is chosen', () => {
      expect(el('register-email')).toBeNull();
      expect(el('register-password')).toBeNull();
      expect(el('register-confirm')).toBeNull();
      expect(el('register-phone')).toBeNull();
      expect(el('register-continue')).not.toBeNull();
      expect(el('register-submit')).toBeNull();
    });

    it('cannot continue without selecting an account type', () => {
      // Continue stays focusable, but must not advance and must explain why.
      component.continueFromRole();
      fixture.detectChanges();

      expect(component.step()).toBe(1);
      expect(el('register-email')).toBeNull();
      expect(el('register-role-error')?.textContent).toContain('Select an account type to continue.');
    });

    it('sends a customer straight to the account details', () => {
      continueFromRole('CUSTOMER');

      expect(component.step()).toBe(2);
      expect(el('register-step-indicator')?.textContent).toContain('Step 2 of 2');
      expect(el('register-email')).not.toBeNull();
      expect(el('register-password')).not.toBeNull();
      expect(el('register-confirm')).not.toBeNull();
      expect(el('register-submit')).not.toBeNull();
      expect(el('register-services-count')).toBeNull();
    });

    it('sends a provider to the services step BEFORE the account details', () => {
      continueFromRole('PROFESSIONAL');

      expect(component.step()).toBe(2);
      expect(el('register-step-indicator')?.textContent).toContain('Step 2 of 3');
      expect(el('register-services-summary')).not.toBeNull();
      // No account details yet: the provider picks their skills first.
      expect(el('register-email')).toBeNull();
      expect(el('register-submit')).toBeNull();

      flushCatalogue();
    });

    it('asks the provider for their services before anything else', () => {
      selectRole('PROFESSIONAL');
      expect((el('register-continue') as HTMLElement).textContent?.trim()).toBe('Choose your services');
    });
  });

  describe('account details (the final step)', () => {
    it('shows the retained account type', () => {
      goToDetails('BUSINESS_OWNER');
      expect(el('register-selected-role')?.textContent).toContain('Business owner');
      expect(el('register-step-indicator')?.textContent).toContain('Step 3 of 3');
    });

    it('is step 3 of 3 for a provider, who already picked their services', () => {
      continueFromRole('PROFESSIONAL');
      flushCatalogue();
      component.toggleService('1');
      component.continueFromServices();
      fixture.detectChanges();

      expect(el('register-step-indicator')?.textContent).toContain('Step 3 of 3');
      expect(el('register-selected-role')?.textContent).toContain('Professional');
      expect(el('register-selected-services')?.textContent).toContain('1 service selected');
      // The account is created from here, which is the whole point of the swap.
      expect((el('register-submit') as HTMLElement).textContent?.trim()).toBe('Create account');
    });

    it('returns to step 1 via Back from the services step and retains the selection', () => {
      continueFromRole('PROFESSIONAL');
      flushCatalogue();

      backButton().click();
      fixture.detectChanges();

      expect(component.step()).toBe(1);
      expect(component.role.value).toBe('PROFESSIONAL');
      expect(el('register-selected-role')).toBeNull();

      const selected = fixture.nativeElement.querySelector('.fl-role-card-selected') as HTMLElement;
      expect(selected.textContent).toContain('Professional');
    });

    it('goes Back from the details to the ticked services, not to step 1', () => {
      continueFromRole('PROFESSIONAL');
      flushCatalogue();
      component.toggleService('1');
      component.continueFromServices();
      fixture.detectChanges();

      backButton().click();
      fixture.detectChanges();

      expect(component.step()).toBe(2);
      expect(el('register-services-summary')).not.toBeNull();
      expect(component.isServiceSelected('1')).toBe(true);
    });

    it('keeps the selection correct after changing it and going forward again', () => {
      goToDetails('PROFESSIONAL');
      // Details -> services -> step 1.
      backButton().click();
      fixture.detectChanges();
      backButton().click();
      fixture.detectChanges();

      selectRole('CUSTOMER');
      component.continueFromRole();
      fixture.detectChanges();

      // A customer goes straight to the details, with no services step.
      expect(el('register-selected-role')?.textContent).toContain('Customer');
      expect(el('register-step-indicator')?.textContent).toContain('Step 2 of 2');
    });

    it('blocks submit and shows validation errors for an empty form', () => {
      goToDetails();
      component.submit();
      fixture.detectChanges();

      httpMock.expectNone(`${API}/auth/register`);
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Email address is required.');
      expect(text).toContain('Password is required.');
      expect(text).toContain('Please confirm your password.');
    });

    it('rejects invalid email, short passwords and mismatched confirmation', () => {
      goToDetails('PROFESSIONAL');
      fillDetails({ email: 'not-an-email', phone: 'abc', password: 'short', confirmPassword: 'different' });
      component.submit();
      fixture.detectChanges();

      httpMock.expectNone(`${API}/auth/register`);
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Enter a valid email address.');
      expect(text).toContain('Enter a valid South African cell number (10 digits starting with 0).');
      expect(text).toContain('Password must be between 8 and 128 characters.');
      expect(text).toContain('Passwords do not match.');
    });
  });

  describe('submission', () => {
    /**
     * A CUSTOMER is done once the details are submitted. A provider picks their
     * services BEFORE this step, so their chosen services are saved here, just
     * after the account is created.
     */
    it('logs a new CUSTOMER straight in and lands on its dashboard', () => {
      const role = 'CUSTOMER' as SelfRegisterRole;
      const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      goToDetails(role);
      fillDetails();
      component.submit();
      fixture.detectChanges();

      const button = el('register-submit') as HTMLButtonElement;
      expect(button.disabled).toBe(true);

      const req = httpMock.expectOne(`${API}/auth/register`);
      expect(req.request.body).toEqual({
        email: 'new@example.co.za',
        password: 'password123',
        role,
        // Each role's profile is created with the account, so its name is sent.
        ...(role === 'CUSTOMER' ? { firstName: 'Naledi', lastName: 'Dlamini' } : {}),
        ...(role === 'PROFESSIONAL' ? { displayName: 'Sipho Ndlovu' } : {}),
        ...(role === 'BUSINESS_OWNER' ? { businessName: 'Mokoena Plumbing' } : {}),
      });
      // The response carries a session, so no second login step is needed.
      req.flush({
        success: true,
        data: { user: { ...mockUser, roles: [role] }, accessToken: 'access-1', refreshToken: 'refresh-1' },
      });
      fixture.detectChanges();

      expect(navigateSpy).toHaveBeenCalledWith(LANDING[role]);
      // There is no "account created, now log in" interstitial any more.
      expect(el('register-success')).toBeNull();
      expect(el('register-continue-login')).toBeNull();
      expect(localStorage.getItem('fixlynk.access_token')).toBe('access-1');
      // A customer has no services to pick, so the services step never appears.
      expect(el('register-services-summary')).toBeNull();
    });

    it('asks a customer for the names their profile needs', () => {
      goToDetails('CUSTOMER');
      expect(el('register-first-name')).not.toBeNull();
      expect(el('register-last-name')).not.toBeNull();
      // Provider-only name fields stay hidden for this role.
      expect(el('register-display-name')).toBeNull();
      expect(el('register-business-name')).toBeNull();
    });

    it('lets a customer submit without names and lets the backend derive them', () => {
      goToDetails('CUSTOMER');
      fillDetails({ firstName: '', lastName: '' });
      component.submit();
      fixture.detectChanges();

      const req = httpMock.expectOne(`${API}/auth/register`);
      // Omitted rather than sent empty: the backend derives a name from the
      // email, and an empty string would be rejected.
      expect(req.request.body).toEqual({
        email: 'new@example.co.za',
        password: 'password123',
        role: 'CUSTOMER',
      });
      req.flush({
        success: true,
        data: { user: { ...mockUser, roles: ['CUSTOMER'] }, accessToken: 'access-1', refreshToken: 'refresh-1' },
      });
    });

    it('never sends customer names for a provider role', () => {
      goToDetails('PROFESSIONAL');
      fillDetails();
      component.submit();
      fixture.detectChanges();
      const req = httpMock.expectOne(`${API}/auth/register`);
      expect(req.request.body).not.toHaveProperty('firstName');
      expect(req.request.body).not.toHaveProperty('lastName');
      req.flush({
        success: true,
        data: { user: { ...mockUser, roles: ['PROFESSIONAL'] }, accessToken: 'access-1', refreshToken: 'refresh-1' },
      });
    });

    it('only asks a professional for a display name', () => {
      goToDetails('PROFESSIONAL');
      expect(el('register-display-name')).not.toBeNull();
      expect(el('register-business-name')).toBeNull();
    });

    it('only asks a business owner for a business name', () => {
      goToDetails('BUSINESS_OWNER');
      expect(el('register-business-name')).not.toBeNull();
      expect(el('register-display-name')).toBeNull();
    });

    it('does not send a provider name the role does not use', () => {
      goToDetails('CUSTOMER');
      fillDetails();
      component.submit();

      const req = httpMock.expectOne(`${API}/auth/register`);
      expect(req.request.body).toEqual({
        email: 'new@example.co.za',
        password: 'password123',
        role: 'CUSTOMER',
        firstName: 'Naledi',
        lastName: 'Dlamini',
      });
      req.flush({ success: true, data: { user: mockUser, accessToken: 'a', refreshToken: 'r' } });
    });

    it('includes the phone number when supplied', () => {
      goToDetails();
      fillDetails({ phone: '0825550101' });
      component.submit();

      const req = httpMock.expectOne(`${API}/auth/register`);
      expect(req.request.body).toEqual({
        email: 'new@example.co.za',
        phone: '0825550101',
        password: 'password123',
        role: 'CUSTOMER',
        firstName: 'Naledi',
        lastName: 'Dlamini',
      });
      req.flush({ success: true, data: { user: mockUser, accessToken: 'a', refreshToken: 'r' } });
    });

    it('shows an API error when the email already exists', () => {
      goToDetails();
      fillDetails();
      component.submit();

      httpMock.expectOne(`${API}/auth/register`).flush(
        { success: false, error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' } },
        { status: 409, statusText: 'Conflict' },
      );
      fixture.detectChanges();

      const error = el('register-error') as HTMLElement;
      expect(error.textContent).toContain('An account with this email already exists');
      expect(el('register-success')).toBeNull();
    });

    it('shows the accurate message when the phone number is already registered', () => {
      goToDetails();
      fillDetails({ phone: '0825550101' });
      component.submit();

      httpMock.expectOne(`${API}/auth/register`).flush(
        {
          success: false,
          error: { code: 'CONFLICT', message: 'This phone number is already registered to another account.' },
        },
        { status: 409, statusText: 'Conflict' },
      );
      fixture.detectChanges();

      const error = el('register-error') as HTMLElement;
      expect(error.textContent).toContain('This phone number is already registered to another account.');
      expect(error.textContent).not.toContain('email already exists');
    });

    it('distinguishes an unreachable API from a server error', () => {
      goToDetails();
      fillDetails();
      component.submit();

      httpMock
        .expectOne(`${API}/auth/register`)
        .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
      fixture.detectChanges();

      const error = el('register-error') as HTMLElement;
      expect(error.textContent).toContain('Cannot reach the Fixlynk service');
      expect(error.textContent).not.toContain('Registration failed');
    });

    it('stays on the form and reports the reason when the provider name is rejected', () => {
      goToDetails('PROFESSIONAL');
      fillDetails();
      component.submit();

      httpMock.expectOne(`${API}/auth/register`).flush(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Display name is required.' } },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      fixture.detectChanges();

      expect(el('register-error')?.textContent).toContain('Display name is required.');
      expect(el('register-submit')).not.toBeNull();
    });
  });
  /**
   * Step 2 - services offered, which a provider sees BEFORE the account is
   * created, so "Create account" is the last thing they do.
   *
   * Only PROFESSIONAL and BUSINESS_OWNER reach it. Prices are deliberately NOT
   * collected here: a new provider has not decided what to charge, and Fixlynk
   * must not invent a figure.
   */
  describe('step 2 - services offered, before the account is created', () => {
    /** Open the services step for a provider and resolve the catalogue. */
    const openServices = (role: SelfRegisterRole = 'PROFESSIONAL'): void => {
      continueFromRole(role);
      flushCatalogue();
    };

    /**
     * Submit the details already on screen and flush the account creation.
     * The caller must already be on the account details step.
     */
    const registerProvider = (role: SelfRegisterRole = 'PROFESSIONAL') => {
      const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      fillDetails();
      component.submit();
      fixture.detectChanges();
      httpMock.expectOne(`${API}/auth/register`).flush({
        success: true,
        data: {
          user: { ...mockUser, roles: [role] },
          accessToken: 'access-1',
          refreshToken: 'refresh-1',
        },
      });
      fixture.detectChanges();
      return navigateSpy;
    };

    it('asks for the services before the account details, with no account created', () => {
      openServices();

      expect(el('register-services-summary')?.textContent).toContain('Tick the services you offer');
      expect(el('register-services-summary')?.textContent).toContain('Professional');
      expect(el('register-email')).toBeNull();
      // Nothing is registered until the provider has picked their skills.
      httpMock.expectNone(`${API}/auth/register`);
      expect(component.accountCreated()).toBeNull();
    });

    it('shows one checkbox per catalogue service, grouped by category', () => {
      openServices();
      const boxes = fixture.nativeElement.querySelectorAll('.fl-sv-option input[type="checkbox"]');
      expect(boxes.length).toBe(3);
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Plumbing');
      expect(text).toContain('Electrical');
      expect(text).toContain('Leak Repair');
    });

    it('never shows the services step to a customer', () => {
      goToDetails('CUSTOMER');
      fillDetails();
      component.submit();
      fixture.detectChanges();
      httpMock.expectOne(`${API}/auth/register`).flush({
        success: true,
        data: { user: { ...mockUser, roles: ['CUSTOMER'] }, accessToken: 'a', refreshToken: 'r' },
      });
      fixture.detectChanges();
      expect(el('register-services-summary')).toBeNull();
      // No catalogue fetch either - a customer has nothing to pick.
      httpMock.expectNone(`${API}/services`);
    });

    it('toggling a service selects then deselects it', () => {
      openServices();
      expect(component.selectedCount()).toBe(0);
      component.toggleService('1');
      fixture.detectChanges();
      expect(component.selectedCount()).toBe(1);
      expect(component.isServiceSelected('1')).toBe(true);
      component.toggleService('1');
      fixture.detectChanges();
      expect(component.selectedCount()).toBe(0);
      expect(component.isServiceSelected('1')).toBe(false);
    });

    it('ticking a category selects every service in it, and unticking clears them', () => {
      openServices();
      component.toggleCategory('10');
      fixture.detectChanges();
      expect(component.isServiceSelected('1')).toBe(true);
      expect(component.isServiceSelected('2')).toBe(true);
      expect(component.isServiceSelected('3')).toBe(false);
      component.toggleCategory('10');
      fixture.detectChanges();
      expect(component.selectedCount()).toBe(0);
    });

    it('carries the ticked services on to the account details step', () => {
      openServices();
      component.toggleService('1');
      component.toggleService('2');
      fixture.detectChanges();

      component.continueFromServices();
      fixture.detectChanges();

      expect(el('register-selected-services')?.textContent).toContain('2 services selected');
      expect(el('register-email')).not.toBeNull();
      expect(el('register-services-summary')).toBeNull();
    });

    it('saves each ticked service as an offering WITHOUT a price', () => {
      openServices();
      component.toggleService('1');
      component.toggleService('3');
      component.continueFromServices();
      fixture.detectChanges();
      registerProvider();

      const posts = httpMock.match(`${API}/provider/offerings`);
      expect(posts.length).toBe(2);
      const bodies = posts.map((r) => r.request.body as Record<string, unknown>);
      expect(bodies.map((b) => b['name']).sort()).toEqual(['DB Board Upgrades', 'Leak Repair']);
      for (const body of bodies) {
        // The point of this change: a new provider has not chosen a price, so
        // none is sent and none is invented.
        expect('priceAmount' in body).toBe(false);
      }
      expect(bodies.every((b) => b['categoryId'] !== undefined)).toBe(true);
      for (const req of posts) req.flush({ success: true, data: { id: 'o1', isActive: true } });
    });

    it('lands on the provider dashboard once the services are saved', async () => {
      openServices();
      component.toggleService('1');
      component.continueFromServices();
      fixture.detectChanges();
      const navigateSpy = registerProvider();

      httpMock.expectOne(`${API}/provider/offerings`).flush({ success: true, data: { id: 'o1', isActive: true } });
      await settle();
      fixture.detectChanges();

      expect(navigateSpy).toHaveBeenCalledWith('/requests');
    });

    it('sends nothing when the provider ticked nothing', async () => {
      openServices();
      component.continueFromServices();
      fixture.detectChanges();
      const navigateSpy = registerProvider();
      await settle();
      fixture.detectChanges();

      httpMock.expectNone(`${API}/provider/offerings`);
      expect(navigateSpy).toHaveBeenCalledWith('/requests');
    });

    it('offers "Skip for now" while nothing is ticked', () => {
      openServices();
      expect((el('register-services-continue') as HTMLElement).textContent?.trim()).toBe('Skip for now');

      component.toggleService('1');
      fixture.detectChanges();
      expect((el('register-services-continue') as HTMLElement).textContent?.trim()).toBe('Continue');
    });

    it('keeps the account and reports partial success when a service is rejected', async () => {
      openServices();
      component.toggleService('1');
      component.toggleService('3');
      component.continueFromServices();
      fixture.detectChanges();
      const navigateSpy = registerProvider();

      const posts = httpMock.match(`${API}/provider/offerings`);
      expect(posts.length).toBe(2);
      posts[0]?.flush(
        { success: false, error: { code: 'CONFLICT', message: 'You already have a service with that name.' } },
        { status: 409, statusText: 'Conflict' },
      );
      posts[1]?.flush({ success: true, data: { id: 'o1', isActive: true } });
      await settle();
      fixture.detectChanges();

      // Still on the details step with an explanation - the account was NOT
      // discarded, and Back is gone so they cannot re-register.
      expect(el('register-services-error')?.textContent).toContain('1 of 2');
      expect((el('register-submit') as HTMLElement).textContent?.trim()).toBe('Finish setup');
      expect(el('register-back')).toBeNull();
      expect(navigateSpy).not.toHaveBeenCalledWith('/requests');
      // The session survives, so the provider can finish from My Services.
      expect(localStorage.getItem('fixlynk.access_token')).toBe('access-1');
    });

    it('retries only the services that failed, without re-registering', async () => {
      openServices();
      component.toggleService('1');
      component.toggleService('3');
      component.continueFromServices();
      fixture.detectChanges();
      const navigateSpy = registerProvider();

      const posts = httpMock.match(`${API}/provider/offerings`);
      posts[0]?.flush(
        { success: false, error: { code: 'CONFLICT', message: 'You already have a service with that name.' } },
        { status: 409, statusText: 'Conflict' },
      );
      posts[1]?.flush({ success: true, data: { id: 'o1', isActive: true } });
      await settle();
      fixture.detectChanges();

      // "Finish setup" retries the save; the email is taken from now on.
      component.submit();
      fixture.detectChanges();
      httpMock.expectNone(`${API}/auth/register`);

      const retry = httpMock.match(`${API}/provider/offerings`);
      expect(retry.length).toBe(1);
      expect((retry[0]?.request.body as Record<string, unknown>)['name']).toBe('Leak Repair');
      retry[0]?.flush({ success: true, data: { id: 'o2', isActive: true } });
      await settle();
      fixture.detectChanges();

      expect(navigateSpy).toHaveBeenCalledWith('/requests');
      expect(el('register-services-error')).toBeNull();
    });

    it('offers a retry and a way through when the catalogue cannot be loaded', () => {
      continueFromRole('PROFESSIONAL');
      httpMock.expectOne(`${API}/services`).flush({ success: false, error: { code: 'X', message: 'down' } });
      fixture.detectChanges();

      expect(el('register-services-retry')).not.toBeNull();
      expect(fixture.nativeElement.textContent).toContain('add these later');
      // The provider is not blocked: they can still create the account.
      (el('register-services-continue') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(el('register-email')).not.toBeNull();
    });
  });
});
