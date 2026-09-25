import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { RegisterComponent } from './register';
import { API_BASE_URL } from '../../../core/config/api-config';
import type { AuthUser, SelfRegisterRole } from '../../../core/models/auth.model';

const API = 'http://test.local/api/v1';

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
};

describe('RegisterComponent (two-step registration)', () => {
  let fixture: ComponentFixture<RegisterComponent>;
  let component: RegisterComponent;
  let httpMock: HttpTestingController;

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
        provideRouter([]),
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
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

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
      expect(text).toContain('Enter a valid phone number.');
      expect(text).toContain('Password must be between 8 and 128 characters.');
      expect(text).toContain('Passwords do not match.');
    });
  });

  describe('submission', () => {
    it.each([
      ['CUSTOMER' as SelfRegisterRole],
      ['PROFESSIONAL' as SelfRegisterRole],
      ['BUSINESS_OWNER' as SelfRegisterRole],
    ])('submits the %s role and shows the success state', (role) => {
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
      });
      req.flush({ success: true, data: { user: { ...mockUser, roles: [role] } } });
      fixture.detectChanges();

      const success = el('register-success') as HTMLElement;
      expect(success.textContent).toContain('Account created');
      expect(success.textContent).toContain('new@example.co.za');
      expect(fixture.nativeElement.querySelector('form')).toBeNull();
    });

    it('includes the phone number when supplied', () => {
      goToStepTwo();
      fillDetails({ phone: '+27 82 555 0101' });
      component.submit();

      const req = httpMock.expectOne(`${API}/auth/register`);
      expect(req.request.body).toEqual({
        email: 'new@example.co.za',
        phone: '+27 82 555 0101',
        password: 'password123',
        role: 'CUSTOMER',
      });
      req.flush({ success: true, data: { user: mockUser } });
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
      fillDetails({ phone: '+27825550101' });
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
  });
});
