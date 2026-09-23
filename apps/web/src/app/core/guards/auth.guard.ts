import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { map, Observable } from 'rxjs';
import { AuthService } from '../services/auth.service';

function loginRedirect(router: Router, returnUrl: string): UrlTree {
  return router.createUrlTree(['/login'], {
    queryParams: returnUrl && returnUrl !== '/login' ? { returnUrl } : {},
  });
}

/**
 * Protects routes that require an authenticated session.
 *
 * Frontend routing is UX-only (see docs/PERMISSIONS.md — the backend enforces
 * real authorization). When the session state is still unknown (e.g. a page
 * reload with persisted tokens), the guard restores it first instead of
 * bouncing an authenticated user to the login page.
 */
export const authGuard: CanActivateFn = (route, state): Observable<boolean | UrlTree> | boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;
  if (auth.authStatus() === 'anonymous') return loginRedirect(router, state.url);

  return auth.restoreSession().pipe(
    map((user) => (user ? true : loginRedirect(router, state.url))),
  );
};

/**
 * Keeps authenticated users away from login/register (they belong in the
 * authenticated area). Unknown sessions are restored first so a page reload
 * does not flash the login form for a signed-in user.
 */
export const guestGuard: CanActivateFn = (): Observable<boolean | UrlTree> | boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return router.createUrlTree(['/account']);
  if (auth.authStatus() === 'anonymous') return true;

  return auth.restoreSession().pipe(map((user) => (user ? router.createUrlTree(['/account']) : true)));
};
