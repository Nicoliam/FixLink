import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, provideRouter, Router } from '@angular/router';
import { firstValueFrom, isObservable, Observable } from 'rxjs';
import { providerGuard } from './provider.guard';
import { AuthService } from '../services/auth.service';
import { TokenStorageService } from '../services/token-storage.service';
import { API_BASE_URL } from '../config/api-config';
import { routes } from '../../app.routes';

@Component({ template: '' })
class TestComponent {}
const user = { id: '1', email: 'person@example.co.za', phone: null, status: 'ACTIVE', roles: ['PROFESSIONAL'] as const, createdAt: '', updatedAt: '' };

function snapshots(url: string): [ActivatedRouteSnapshot, RouterStateSnapshot] { return [new ActivatedRouteSnapshot(), { url } as RouterStateSnapshot]; }

describe('providerGuard', () => {
  let auth: AuthService;
  let tokens: TokenStorageService;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([{ path: 'login', component: TestComponent }, { path: 'account', component: TestComponent }, { path: 'my-services', component: TestComponent }]), { provide: API_BASE_URL, useValue: 'http://test.local/api/v1' }] }).compileComponents();
    auth = TestBed.inject(AuthService);
    tokens = TestBed.inject(TokenStorageService);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });
  afterEach(() => { http.verify(); localStorage.clear(); TestBed.resetTestingModule(); });

  function signIn(roles: string[]): void {
    auth.login({ email: 'person@example.co.za', password: 'password' }).subscribe();
    http.expectOne('http://test.local/api/v1/auth/login').flush({ success: true, data: { user: { ...user, roles }, accessToken: 'access', refreshToken: 'refresh' }, message: 'Success' });
  }

  async function resolve(url: string): Promise<unknown> {
    const result = TestBed.runInInjectionContext(() => providerGuard(...snapshots(url)));
    return isObservable(result) ? await firstValueFrom(result as Observable<unknown>) : result;
  }

  it.each(['PROFESSIONAL', 'BUSINESS_OWNER', 'BUSINESS_MANAGER'])('allows a %s', (role) => {
    signIn([role]);
    expect(TestBed.runInInjectionContext(() => providerGuard(...snapshots('/my-services')))).toBe(true);
  });

  it('allows a provider who also holds another role', () => {
    signIn(['CUSTOMER', 'PROFESSIONAL']);
    expect(TestBed.runInInjectionContext(() => providerGuard(...snapshots('/my-services')))).toBe(true);
  });

  it.each(['CUSTOMER', 'TECHNICIAN', 'ADMIN'])('denies a %s and redirects to account', async (role) => {
    signIn([role]);
    expect(router.serializeUrl((await resolve('/my-services')) as UrlTree)).toBe('/account');
  });

  it('redirects anonymous users to login with a return URL', async () => {
    expect(router.serializeUrl((await resolve('/my-services')) as UrlTree)).toBe('/login?returnUrl=%2Fmy-services');
  });

  it('restores an unknown session before allowing a provider', async () => {
    tokens.save('access', 'refresh');
    const pending = firstValueFrom(
      (TestBed.runInInjectionContext(() => providerGuard(...snapshots('/my-services'))) as Observable<unknown>),
    );
    http.expectOne('http://test.local/api/v1/auth/me').flush({ success: true, data: { user }, message: 'Success' });
    await expect(pending).resolves.toBe(true);
  });
});

describe('my-services route', () => {
  it('is registered as a lazy provider-guarded route without colliding with the public /services page', () => {
    const route = routes.find((entry) => entry.path === 'my-services');
    expect(route?.loadComponent).toBeDefined();
    expect(route?.canActivate).toEqual([providerGuard]);

    const publicServices = routes.find((entry) => entry.path === 'services');
    expect(publicServices?.canActivate).toBeUndefined();
    expect(routes.filter((entry) => entry.path === 'services')).toHaveLength(1);
    expect(routes.filter((entry) => entry.path === 'my-services')).toHaveLength(1);
  });
});