import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { RegisterComponent } from './register';
import { API_BASE_URL } from '../../../core/config/api-config';
import type { AuthUser } from '../../../core/models/auth.model';

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

const validForm = {
  role: 'CUSTOMER' as const,
  email: 'new@example.co.za',
  phone: '',
  password: 'password123',
  confirmPassword: 'password123',
};

describe('RegisterComponent', () => {
  let fixture: ComponentFixture<RegisterComponent>;
  let component: RegisterComponent;
  let httpMock: HttpTestingController;

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

  it('defaults to the CUSTOMER role', () => {
    expect(component.role.value).toBe('CUSTOMER');
  });

  it('blocks submit and shows validation errors for an empty form', () => {
    component.submit();
    fixture.detectChanges();

    httpMock.expectNone(`${API}/auth/register`);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Email address is required.');
    expect(text).toContain('Password is required.');
    expect(text).toContain('Please confirm your password.');
  });

  it('rejects invalid email, short passwords and mismatched confirmation', () => {
    component.form.setValue({
      role: 'PROFESSIONAL',
      email: 'not-an-email',
      phone: 'abc',
      password: 'short',
      confirmPassword: 'different',
    });
    component.submit();
    fixture.detectChanges();

    httpMock.expectNone(`${API}/auth/register`);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Enter a valid email address.');
    expect(text).toContain('Enter a valid phone number.');
    expect(text).toContain('Password must be between 8 and 128 characters.');
    expect(text).toContain('Passwords do not match.');
  });

  it('submits a valid registration and shows the success state', () => {
    component.form.setValue(validForm);
    component.submit();
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('[data-testid="register-submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    const req = httpMock.expectOne(`${API}/auth/register`);
    expect(req.request.body).toEqual({
      email: 'new@example.co.za',
      password: 'password123',
      role: 'CUSTOMER',
    });
    req.flush({ success: true, data: { user: mockUser } });
    fixture.detectChanges();

    const success = fixture.nativeElement.querySelector('[data-testid="register-success"]') as HTMLElement;
    expect(success.textContent).toContain('Account created');
    expect(success.textContent).toContain('new@example.co.za');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  it('shows an API error when the email already exists', () => {
    component.form.setValue(validForm);
    component.submit();

    httpMock.expectOne(`${API}/auth/register`).flush(
      { success: false, error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' } },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    const error = fixture.nativeElement.querySelector('[data-testid="register-error"]') as HTMLElement;
    expect(error.textContent).toContain('An account with this email already exists');
    expect(fixture.nativeElement.querySelector('[data-testid="register-success"]')).toBeNull();
  });
});
