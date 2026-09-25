import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, provideRouter, Router } from '@angular/router';
import { firstValueFrom, isObservable, Observable } from 'rxjs';
import { adminGuard } from './admin.guard';
import { AuthService } from '../services/auth.service';
import { TokenStorageService } from '../services/token-storage.service';
import { API_BASE_URL } from '../config/api-config';
import { routes } from '../../app.routes';

@Component({ template: '' })
class TestComponent {}
const user = { id: '1', email: 'admin@example.co.za', phone: null, status: 'ACTIVE', roles: ['ADMIN'] as const, createdAt: '', updatedAt: '' };

function snapshots(url: string): [ActivatedRouteSnapshot, RouterStateSnapshot] { return [new ActivatedRouteSnapshot(), { url } as RouterStateSnapshot]; }

describe('adminGuard', () => {
  let auth: AuthService;
  let tokens: TokenStorageService;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([{ path: 'login', component: TestComponent }, { path: 'account', component: TestComponent }, { path: 'admin', component: TestComponent }]), { provide: API_BASE_URL, useValue: 'http://test.local/api/v1' }] }).compileComponents();
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

  it('allows a user with ADMIN among multiple roles', () => {
    signIn(['CUSTOMER', 'ADMIN']);
    expect(TestBed.runInInjectionContext(() => adminGuard(...snapshots('/admin')))).toBe(true);
  });

  it('denies an authenticated non-admin and redirects to account', async () => {
    signIn(['CUSTOMER']);
    const result = TestBed.runInInjectionContext(() => adminGuard(...snapshots('/admin')));
    const value = isObservable(result) ? await firstValueFrom(result as Observable<boolean | UrlTree>) : result;
    expect(router.serializeUrl(value as UrlTree)).toBe('/account');
  });

  it('redirects anonymous users to login with a return URL', async () => {
    const result = TestBed.runInInjectionContext(() => adminGuard(...snapshots('/admin/users')));
    const value = isObservable(result) ? await firstValueFrom(result as Observable<boolean | UrlTree>) : result;
    expect(router.serializeUrl(value as UrlTree)).toBe('/login?returnUrl=%2Fadmin%2Fusers');
  });

  it('restores an unknown session before allowing an admin', async () => {
    tokens.save('access', 'refresh');
    const result = TestBed.runInInjectionContext(() => adminGuard(...snapshots('/admin')));
    const pending = firstValueFrom(result as Observable<boolean | UrlTree>);
    http.expectOne('http://test.local/api/v1/auth/me').flush({ success: true, data: { user }, message: 'Success' });
    await expect(pending).resolves.toBe(true);
  });
});

describe('admin routes', () => {
  it('keeps the admin area lazy and static detail paths before dynamic paths', () => {
    const area = routes.find((route) => route.path === 'admin');
    expect(area?.loadComponent).toBeDefined();
    const children = area?.children ?? [];
    const paths = children.map((route) => route.path);
    expect(paths.indexOf('services/new')).toBeLessThan(paths.indexOf('services/:id/edit'));
    expect(paths.indexOf('services/:id/edit')).toBeLessThan(paths.indexOf('services/:id'));
    expect(paths).toEqual(expect.arrayContaining(['users', 'customers', 'professionals', 'businesses', 'technicians', 'services', 'jobs', 'verification', 'certificates', 'reviews', 'reports', 'disputes', 'audit-logs', 'settings', '**']));
  });
});
