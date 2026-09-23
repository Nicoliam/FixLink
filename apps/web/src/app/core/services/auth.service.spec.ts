import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { TokenStorageService } from './token-storage.service';
import { API_BASE_URL } from '../config/api-config';
import type { AuthUser } from '../models/auth.model';

const API = 'http://test.local/api/v1';

const mockUser: AuthUser = {
  id: 'user-1',
  email: 'user@example.co.za',
  phone: null,
  status: 'ACTIVE',
  roles: ['CUSTOMER'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let tokens: TokenStorageService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: API },
      ],
    }).compileComponents();
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    tokens = TestBed.inject(TokenStorageService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('logs in successfully and establishes a session', () => {
    let result: AuthUser | null = null;
    service.login({ email: 'user@example.co.za', password: 'password123' }).subscribe((user) => {
      result = user;
    });

    const req = httpMock.expectOne(`${API}/auth/login`);
    expect(req.request.method).toBe('POST');
    req.flush({ success: true, data: { user: mockUser, accessToken: 'access-1', refreshToken: 'refresh-1' } });

    expect(result).toEqual(mockUser);
    expect(tokens.getAccessToken()).toBe('access-1');
    expect(tokens.getRefreshToken()).toBe('refresh-1');
    expect(service.isAuthenticated()).toBe(true);
    expect(service.currentUser()).toEqual(mockUser);
  });

  it(' surfaces failed login without touching session state', () => {
    let failureCode: string | null = null;
    service.login({ email: 'user@example.co.za', password: 'wrong' }).subscribe({
      next: () => {},
      error: (err) => {
        failureCode = err.error?.error?.code ?? null;
      },
    });

    const req = httpMock.expectOne(`${API}/auth/login`);
    req.flush(
      { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(failureCode).toBe('INVALID_CREDENTIALS');
    expect(service.currentUser()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(tokens.getAccessToken()).toBeNull();
    expect(tokens.getRefreshToken()).toBeNull();
  });

  it('registers successfully without establishing a session (backend issues no tokens)', () => {
    let result: AuthUser | null = null;
    service
      .register({ email: 'new@example.co.za', password: 'password123', role: 'CUSTOMER' })
      .subscribe((user) => {
        result = user;
      });

    const req = httpMock.expectOne(`${API}/auth/register`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'new@example.co.za', password: 'password123', role: 'CUSTOMER' });
    req.flush({ success: true, data: { user: mockUser } });

    expect(result).toEqual(mockUser);
    expect(service.isAuthenticated()).toBe(false);
    expect(tokens.getAccessToken()).toBeNull();
  });

  it('propagates registration conflicts (duplicate email)', () => {
    let failureCode: string | null = null;
    service.register({ email: 'taken@example.co.za', password: 'password123' }).subscribe({
      next: () => {},
      error: (err) => {
        failureCode = err.error?.error?.code ?? null;
      },
    });

    const req = httpMock.expectOne(`${API}/auth/register`);
    req.flush(
      { success: false, error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' } },
      { status: 409, statusText: 'Conflict' },
    );

    expect(failureCode).toBe('EMAIL_EXISTS');
    expect(service.isAuthenticated()).toBe(false);
  });

  it('restores a persisted session via GET /auth/me', () => {
    tokens.save('access-1', 'refresh-1');
    let result: AuthUser | null | undefined;
    service.restoreSession().subscribe((user) => {
      result = user;
    });

    const req = httpMock.expectOne(`${API}/auth/me`);
    req.flush({ success: true, data: { user: mockUser } });

    expect(result).toEqual(mockUser);
    expect(service.isAuthenticated()).toBe(true);
  });

  it('restoration with no stored tokens resolves anonymous without HTTP', () => {
    let result: AuthUser | null | undefined = mockUser;
    service.restoreSession().subscribe((user) => {
      result = user;
    });

    httpMock.expectNone(`${API}/auth/me`);
    expect(result).toBeNull();
    expect(service.authStatus()).toBe('anonymous');
  });

  it('restoration falls back to a single refresh when the access token expired', () => {
    tokens.save('stale-access', 'refresh-1');
    let result: AuthUser | null | undefined;
    service.restoreSession().subscribe((user) => {
      result = user;
    });

    httpMock.expectOne(`${API}/auth/me`).flush(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } },
      { status: 401, statusText: 'Unauthorized' },
    );
    const refresh = httpMock.expectOne(`${API}/auth/refresh`);
    expect(refresh.request.body).toEqual({ refreshToken: 'refresh-1' });
    refresh.flush({ success: true, data: { user: mockUser, accessToken: 'access-2', refreshToken: 'refresh-2' } });

    expect(result).toEqual(mockUser);
    expect(tokens.getAccessToken()).toBe('access-2');
    expect(service.isAuthenticated()).toBe(true);
  });

  it('restoration clears the session when both tokens are invalid', () => {
    tokens.save('stale-access', 'stale-refresh');
    let result: AuthUser | null | undefined = mockUser;
    service.restoreSession().subscribe((user) => {
      result = user;
    });

    httpMock.expectOne(`${API}/auth/me`).flush(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } },
      { status: 401, statusText: 'Unauthorized' },
    );
    httpMock.expectOne(`${API}/auth/refresh`).flush(
      { success: false, error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid or expired.' } },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(result).toBeNull();
    expect(service.authStatus()).toBe('anonymous');
    expect(tokens.getAccessToken()).toBeNull();
    expect(tokens.getRefreshToken()).toBeNull();
  });

  it('logout revokes the session and always clears local state, even on network failure', () => {
    tokens.save('access-1', 'refresh-1');
    service.login({ email: 'user@example.co.za', password: 'password123' }).subscribe();
    httpMock
      .expectOne(`${API}/auth/login`)
      .flush({ success: true, data: { user: mockUser, accessToken: 'access-1', refreshToken: 'refresh-1' } });
    expect(service.isAuthenticated()).toBe(true);

    let completed = false;
    service.logout().subscribe(() => {
      completed = true;
    });

    const req = httpMock.expectOne(`${API}/auth/logout`);
    expect(req.request.body).toEqual({ refreshToken: 'refresh-1' });
    req.error(new ProgressEvent('error'));

    expect(completed).toBe(true);
    expect(service.isAuthenticated()).toBe(false);
    expect(service.currentUser()).toBeNull();
    expect(tokens.getAccessToken()).toBeNull();
    expect(tokens.getRefreshToken()).toBeNull();
  });
});
