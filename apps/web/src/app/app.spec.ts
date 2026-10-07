import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import type { Provider } from '@angular/core';
import { App } from './app';
import { API_BASE_URL } from './core/config/api-config';
import { AuthService } from './core/services/auth.service';
import type { UserRole } from './core/models/auth.model';

describe('App', () => {
  afterEach(() => {
    localStorage.clear();
  });

  /** Configure the shell, optionally with a stubbed authenticated session. */
  async function setup(extraProviders: Provider[] = []): Promise<void> {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE_URL, useValue: 'http://test.local/api/v1' },
        ...extraProviders,
      ],
    }).compileComponents();
  }

  /** Stub an authenticated session with the given roles (UX-only gating). */
  function sessionWith(roles: UserRole[]): Provider {
    return {
      provide: AuthService,
      useValue: {
        isAuthenticated: signal(true),
        currentUser: signal({ roles }),
        logout: () => ({ subscribe: () => undefined }),
        clearLocalSession: () => undefined,
      },
    };
  }

  it('should create the app', async () => {
    await setup();
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the Fixlynk header with auth entry points when anonymous', async () => {
    await setup();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const header = (fixture.nativeElement as HTMLElement).querySelector('.fl-stitch-header') as HTMLElement;
    expect(header.querySelector('img[alt="Fixlynk"]')).toBeTruthy();
    expect(header.textContent).toContain('Login');
    expect(header.textContent).toContain('Create account');
    expect(header.textContent).toContain('Find a Handyman');
    expect(header.textContent).not.toContain('Log out');
  });

  it('should hide Login, Create account and the search CTA for a customer', async () => {
    await setup([sessionWith(['CUSTOMER'])]);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const header = (fixture.nativeElement as HTMLElement).querySelector('.fl-stitch-header') as HTMLElement;
    expect(header.querySelector('.fl-stitch-login')).toBeNull();
    expect(header.querySelector('.fl-stitch-join')).toBeNull();
    expect(header.querySelector('.fl-stitch-cta')).toBeNull();
    expect(header.textContent).not.toContain('Create account');
  });

  it('should give a customer My Jobs navigation and the session actions', async () => {
    await setup([sessionWith(['CUSTOMER'])]);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const header = (fixture.nativeElement as HTMLElement).querySelector('.fl-stitch-header') as HTMLElement;
    // The marketplace journey stays available for signed-in customers.
    expect(header.textContent).toContain('Find a Handyman');
    const navLinks = Array.from(header.querySelectorAll('nav .fl-stitch-nav-link')).map((link) =>
      (link as HTMLElement).textContent?.trim(),
    );
    expect(navLinks).toEqual(['Home', 'Find a Handyman', 'My Jobs', 'Account']);
    expect(header.textContent).toContain('Log out');
  });

  it('should keep the provider workspace header for provider roles', async () => {
    await setup([sessionWith(['PROFESSIONAL'])]);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const header = (fixture.nativeElement as HTMLElement).querySelector('.fl-stitch-header') as HTMLElement;
    expect(header.textContent).toContain('Requests');
    expect(header.textContent).toContain('My services');
    expect(header.querySelector('.fl-stitch-login')).toBeNull();
    expect(header.querySelector('.fl-stitch-cta')).toBeNull();
  });
});
