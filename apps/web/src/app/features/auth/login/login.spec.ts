import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { LoginComponent } from './login';
import { API_BASE_URL } from '../../../core/config/api-config';
import type { AuthUser } from '../../../core/models/auth.model';

const API = 'http://test.local/api/v1';

@Component({ template: '' })
class DummyComponent {}

const mockUser: AuthUser = {
  id: 'user-1',
  email: 'user@example.co.za',
  phone: null,
  status: 'ACTIVE',
  roles: ['CUSTOMER'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let component: LoginComponent;
  let httpMock: HttpTestingController;
  let router: Router;

  async function setup(queryParams: Record<string, string> = {}): Promise<void> {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'account', component: DummyComponent }]),
        { provide: API_BASE_URL, useValue: API },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    fixture.detectChanges();
  }

  afterEach(() => {
    httpMock?.verify();
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('creates with an empty form', async () => {
    await setup();
    expect(component).toBeTruthy();
    expect(component.form.value).toEqual({ email: '', password: '' });
  });

  it('blocks submit and shows validation errors when fields are empty', async () => {
    await setup();
    component.submit();
    fixture.detectChanges();

    httpMock.expectNone(`${API}/auth/login`);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Email address is required.');
    expect(text).toContain('Password is required.');
  });

  it('shows an email format error for invalid input', async () => {
    await setup();
    component.form.setValue({ email: 'not-an-email', password: 'password123' });
    component.submit();
    fixture.detectChanges();

    httpMock.expectNone(`${API}/auth/login`);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Enter a valid email address.');
  });

  it('shows a loading state while the request is in flight', async () => {
    await setup();
    component.form.setValue({ email: 'user@example.co.za', password: 'password123' });
    component.submit();
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('[data-testid="login-submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Logging in');

    httpMock.expectOne(`${API}/auth/login`).flush({
      success: true,
      data: { user: mockUser, accessToken: 'a', refreshToken: 'r' },
    });
  });

  it('navigates to /account after successful login', async () => {
    await setup();
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    component.form.setValue({ email: 'user@example.co.za', password: 'password123' });
    component.submit();

    httpMock.expectOne(`${API}/auth/login`).flush({
      success: true,
      data: { user: mockUser, accessToken: 'a', refreshToken: 'r' },
    });

    expect(navigateSpy).toHaveBeenCalledWith('/account');
  });

  it('honours the returnUrl query parameter after successful login', async () => {
    await setup({ returnUrl: '/account' });
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    component.form.setValue({ email: 'user@example.co.za', password: 'password123' });
    component.submit();

    httpMock.expectOne(`${API}/auth/login`).flush({
      success: true,
      data: { user: mockUser, accessToken: 'a', refreshToken: 'r' },
    });

    expect(navigateSpy).toHaveBeenCalledWith('/account');
  });

  it('shows an API error state on failed login', async () => {
    await setup();
    component.form.setValue({ email: 'user@example.co.za', password: 'wrong-password' });
    component.submit();

    httpMock.expectOne(`${API}/auth/login`).flush(
      { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } },
      { status: 401, statusText: 'Unauthorized' },
    );
    fixture.detectChanges();

    const error = fixture.nativeElement.querySelector('[data-testid="login-error"]') as HTMLElement;
    expect(error.textContent).toContain('Invalid email or password');
    const button = fixture.nativeElement.querySelector('[data-testid="login-submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
});
