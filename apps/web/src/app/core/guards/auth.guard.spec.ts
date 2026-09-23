import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { firstValueFrom, isObservable, Observable } from 'rxjs';
import { authGuard, guestGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';
import { TokenStorageService } from '../services/token-storage.service';
import { API_BASE_URL } from '../config/api-config';
import type { AuthUser } from '../models/auth.model';

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

function snapshots(url: string): [ActivatedRouteSnapshot, RouterStateSnapshot] {
  return [new ActivatedRouteSnapshot(), { url } as RouterStateSnapshot];
}

describe('authGuard', () => {
  let auth: AuthService;
  let tokens: TokenStorageService;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'login', component: DummyComponent },
          { path: 'account', component: DummyComponent },
        ]),
        { provide: API_BASE_URL, useValue: API },
      ],
    }).compileComponents();
    auth = TestBed.inject(AuthService);
    tokens = TestBed.inject(TokenStorageService);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('allows an authenticated user', () => {
    auth.login({ email: 'u@e.co.za', password: 'password123' }).subscribe();
    httpMock
      .expectOne(`${API}/auth/login`)
      .flush({ success: true, data: { user: mockUser, accessToken: 'a', refreshToken: 'r' } });

    expect(TestBed.runInInjectionContext(() => authGuard(...snapshots('/account')))).toBe(true);
  });

  it('redirects an anonymous user to login with returnUrl', async () => {
    const result = TestBed.runInInjectionContext(() => authGuard(...snapshots('/account')));
    // Fresh service state is unknown with no tokens → restores to anonymous without HTTP.
    const value = isObservable(result) ? await firstValueFrom(result) : result;
    expect(value).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(value as UrlTree)).toBe('/login?returnUrl=%2Faccount');
  });

  it('restores an unknown session and allows access when tokens are valid', async () => {
    tokens.save('access-1', 'refresh-1');
    const result = TestBed.runInInjectionContext(() => authGuard(...snapshots('/account')));
    expect(isObservable(result)).toBe(true);
    const pending = firstValueFrom(result as Observable<boolean | UrlTree>);
    httpMock.expectOne(`${API}/auth/me`).flush({ success: true, data: { user: mockUser } });
    await expect(pending).resolves.toBe(true);
  });

  it('redirects to login when restoration fails', async () => {
    const result = TestBed.runInInjectionContext(() => authGuard(...snapshots('/account')));
    expect(isObservable(result)).toBe(true);
    // No tokens stored → restores to anonymous without HTTP; observable resolves.
    const value = await firstValueFrom(result as Observable<boolean | UrlTree>);
    expect(value).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(value as UrlTree)).toBe('/login?returnUrl=%2Faccount');
  });
});

describe('guestGuard', () => {
  let auth: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'login', component: DummyComponent },
          { path: 'account', component: DummyComponent },
        ]),
        { provide: API_BASE_URL, useValue: API },
      ],
    }).compileComponents();
    auth = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('redirects an authenticated user to /account', () => {
    auth.login({ email: 'u@e.co.za', password: 'password123' }).subscribe();
    httpMock
      .expectOne(`${API}/auth/login`)
      .flush({ success: true, data: { user: mockUser, accessToken: 'a', refreshToken: 'r' } });

    const result = TestBed.runInInjectionContext(() => guestGuard(...snapshots('/login')));
    expect(result).toBeInstanceOf(UrlTree);
  });

  it('allows an anonymous user to reach login/register', async () => {
    const result = TestBed.runInInjectionContext(() => guestGuard(...snapshots('/login')));
    // Unknown with no tokens resolves via restoreSession → true.
    expect(isObservable(result)).toBe(true);
    await expect(firstValueFrom(result as Observable<boolean | UrlTree>)).resolves.toBe(true);
  });
});
