import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';
import { TokenStorageService } from '../services/token-storage.service';
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

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let tokens: TokenStorageService;
  let auth: AuthService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: API },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    tokens = TestBed.inject(TokenStorageService);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('attaches the access token to authenticated API requests', () => {
    tokens.save('access-1', 'refresh-1');
    http.get(`${API}/jobs`).subscribe();
    const req = httpMock.expectOne(`${API}/jobs`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer access-1');
    req.flush({ success: true, data: [] });
  });

  it('does not attach a token to login/register/refresh endpoints', () => {
    tokens.save('access-1', 'refresh-1');
    http.post(`${API}/auth/login`, {}).subscribe({ next: () => {}, error: () => {} });
    http.post(`${API}/auth/refresh`, {}).subscribe({ next: () => {}, error: () => {} });

    for (const url of [`${API}/auth/login`, `${API}/auth/refresh`]) {
      const req = httpMock.expectOne(url);
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({ success: false, error: { code: 'X', message: 'X' } }, { status: 401, statusText: 'Unauthorized' });
    }
  });

  it('refreshes once and retries the failed request with the new token', () => {
    tokens.save('stale-access', 'refresh-1');
    let body: unknown = null;
    http.get(`${API}/jobs`).subscribe((res) => {
      body = res;
    });

    httpMock.expectOne(`${API}/jobs`).flush(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } },
      { status: 401, statusText: 'Unauthorized' },
    );

    const refresh = httpMock.expectOne(`${API}/auth/refresh`);
    expect(refresh.request.body).toEqual({ refreshToken: 'refresh-1' });
    refresh.flush({
      success: true,
      data: { user: mockUser, accessToken: 'access-2', refreshToken: 'refresh-2' },
    });

    const retried = httpMock.expectOne(`${API}/jobs`);
    expect(retried.request.headers.get('Authorization')).toBe('Bearer access-2');
    retried.flush({ success: true, data: [{ id: 'job-1' }] });

    expect(body).toEqual({ success: true, data: [{ id: 'job-1' }] });
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('shares a single refresh between concurrent 401s', () => {
    tokens.save('stale-access', 'refresh-1');
    http.get(`${API}/jobs`).subscribe({ next: () => {}, error: () => {} });
    http.get(`${API}/jobs?page=2`).subscribe({ next: () => {}, error: () => {} });

    const first = httpMock.expectOne(`${API}/jobs`);
    const second = httpMock.expectOne(`${API}/jobs?page=2`);
    first.flush({ success: false, error: { code: 'UNAUTHORIZED', message: 'x' } }, { status: 401, statusText: 'x' });
    second.flush({ success: false, error: { code: 'UNAUTHORIZED', message: 'x' } }, { status: 401, statusText: 'x' });

    // Exactly one refresh for both failures.
    const refreshes = httpMock.match(`${API}/auth/refresh`);
    expect(refreshes.length).toBe(1);
    refreshes[0].flush({
      success: true,
      data: { user: mockUser, accessToken: 'access-2', refreshToken: 'refresh-2' },
    });

    httpMock.expectOne(`${API}/jobs`).flush({ success: true, data: [] });
    httpMock.expectOne(`${API}/jobs?page=2`).flush({ success: true, data: [] });
  });

  it('clears the session and surfaces the 401 when refresh fails (no retry loop)', () => {
    tokens.save('stale-access', 'stale-refresh');
    let status: number | null = null;
    http.get(`${API}/jobs`).subscribe({
      next: () => {},
      error: (err) => {
        status = err.status;
      },
    });

    httpMock.expectOne(`${API}/jobs`).flush(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } },
      { status: 401, statusText: 'Unauthorized' },
    );
    httpMock.expectOne(`${API}/auth/refresh`).flush(
      { success: false, error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid or expired.' } },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(status).toBe(401);
    expect(tokens.getAccessToken()).toBeNull();
    expect(tokens.getRefreshToken()).toBeNull();
    expect(auth.authStatus()).toBe('anonymous');
    // No outstanding requests — the failed retry is never refreshed again.
    httpMock.expectNone(`${API}/auth/refresh`);
  });

  it('does not attempt refresh for failed login (invalid credentials)', () => {
    let status: number | null = null;
    http.post(`${API}/auth/login`, { email: 'a@b.co', password: 'wrong' }).subscribe({
      next: () => {},
      error: (err) => {
        status = err.status;
      },
    });

    httpMock.expectOne(`${API}/auth/login`).flush(
      { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(status).toBe(401);
    httpMock.expectNone(`${API}/auth/refresh`);
  });
});
