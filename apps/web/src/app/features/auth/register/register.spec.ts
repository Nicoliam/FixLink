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
  displayName: 'Sipho Ndlovu',
  businessName: 'Mokoena Plumbing',
};

/** Landing route each self-registerable role is sent to. */
const LANDING: Record<SelfRegisterRole, string> = {
  CUSTOMER: '/my-jobs',
  PROFESSIONAL: '/requests',
  BUSINESS_OWNER: '/business',
};

describe('RegisterComponent (two-step registration)', () => {
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

  const goToStepTwo = (role: SelfRegisterRole = 'CUSTOMER'): void => {
    selectRole(role);
    component.continueToDetails();
    fixture.detectChanges();
  };

  const fillDetails = (values: Partial<typeof validDetails> = {}): void => {
    component.detailsForm.setValue({ ...validDetails, ...values });
    fixture.detectChanges();
  };

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // The landing routes are real, so a successful registration navigates
        // without the router rejecting an unknown URL segment.
        provideRouter(Object.values(LANDING).map((path) => ({ path: path.slice(1), component: DummyComponent }))),
        { provide: API_BASE_URL, useValue: API },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
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
   */
  const createWithQueryParams = (queryParams: Record<string, string>): { component: RegisterComponent } => {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
    });
    const extraFixture = TestBed.createComponent(RegisterComponent);
    extraFixture.detectChanges();
    return { component: extraFixture.componentInstance };
  };

  describe('step 1 — account type', () => {
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
      'preselects %s from the ?role= hint used by "Join as an Artisan"',
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
      component.continueToDetails();
      fixture.detectChanges();

      expect(component.step()).toBe(1);
      expect(el('register-email')).toBeNull();
      expect(el('register-role-error')?.textContent).toContain('Select an account type to continue.');
    });

    it('enables Continue once an account type is selected and advances to step 2', () => {
      selectRole('PROFESSIONAL');
      expect(component.canContinue).toBe(true);

      component.continueToDetails();
      fixture.detectChanges();

      expect(component.step()).toBe(2);
      expect(el('register-continue')).toBeNull();
      expect(el('register-email')).not.toBeNull();
      expect(el('register-password')).not.toBeNull();
      expect(el('register-confirm')).not.toBeNull();
      expect(el('register-submit')).not.toBeNull();
    });
  });

  describe('step 2 — account details', () => {
    it('shows the retained account type', () => {
      goToStepTwo('BUSINESS_OWNER');
      expect(el('register-selected-role')?.textContent).toContain('Business owner');
      expect(el('register-step-indicator')?.textContent).toContain('Step 2 of 2');
    });

    it('returns to step 1 via Back and retains the selection', () => {
      goToStepTwo('PROFESSIONAL');

      backButton().click();
      fixture.detectChanges();

      expect(component.step()).toBe(1);
      expect(component.role.value).toBe('PROFESSIONAL');
      expect(el('register-selected-role')).toBeNull();

      const selected = fixture.nativeElement.querySelector('.fl-role-card-selected') as HTMLElement;
      expect(selected.textContent).toContain('Professional');
    });

    it('keeps the selection correct after changing it and going forward again', () => {
      goToStepTwo('CUSTOMER');
      backButton().click();
      fixture.detectChanges();

      selectRole('BUSINESS_OWNER');
      component.continueToDetails();
      fixture.detectChanges();

      expect(el('register-selected-role')?.textContent).toContain('Business owner');
    });

    it('blocks submit and shows validation errors for an empty step 2', () => {
      goToStepTwo();
      component.submit();
      fixture.detectChanges();

      httpMock.expectNone(`${API}/auth/register`);
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Email address is required.');
      expect(text).toContain('Password is required.');
      expect(text).toContain('Please confirm your password.');
    });

    it('rejects invalid email, short passwords and mismatched confirmation', () => {
      goToStepTwo('PROFESSIONAL');
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
    it.each([
      ['CUSTOMER' as SelfRegisterRole],
      ['PROFESSIONAL' as SelfRegisterRole],
      ['BUSINESS_OWNER' as SelfRegisterRole],
    ])('logs the new %s account straight in and lands on its dashboard', (role) => {
      const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      goToStepTwo(role);
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
        // The provider profile is created with the account, so the name is sent.
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
    });

    it('only asks a professional for a display name', () => {
      goToStepTwo('PROFESSIONAL');
      expect(el('register-display-name')).not.toBeNull();
      expect(el('register-business-name')).toBeNull();
    });

    it('only asks a business owner for a business name', () => {
      goToStepTwo('BUSINESS_OWNER');
      expect(el('register-business-name')).not.toBeNull();
      expect(el('register-display-name')).toBeNull();
    });

    it('asks a customer for neither name', () => {
      goToStepTwo('CUSTOMER');
      expect(el('register-display-name')).toBeNull();
      expect(el('register-business-name')).toBeNull();
    });

    it('does not send a provider name the role does not use', () => {
      goToStepTwo('CUSTOMER');
      fillDetails();
      component.submit();

      const req = httpMock.expectOne(`${API}/auth/register`);
      expect(req.request.body).toEqual({
        email: 'new@example.co.za',
        password: 'password123',
        role: 'CUSTOMER',
      });
      req.flush({ success: true, data: { user: mockUser, accessToken: 'a', refreshToken: 'r' } });
    });

    it('includes the phone number when supplied', () => {
      goToStepTwo();
      fillDetails({ phone: '0825550101' });
      component.submit();

      const req = httpMock.expectOne(`${API}/auth/register`);
      expect(req.request.body).toEqual({
        email: 'new@example.co.za',
        phone: '0825550101',
        password: 'password123',
        role: 'CUSTOMER',
      });
      req.flush({ success: true, data: { user: mockUser, accessToken: 'a', refreshToken: 'r' } });
    });

    it('shows an API error when the email already exists', () => {
      goToStepTwo();
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
      goToStepTwo();
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
      goToStepTwo();
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
      goToStepTwo('PROFESSIONAL');
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
});
