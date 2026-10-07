import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { map, Observable } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Protects provider-only pages (`/my-services`).
 *
 * Frontend routing is UX-only — the backend enforces the real
 * authorization on /api/v1/provider/offerings. When the session state is
 * still unknown (page reload with persisted tokens) the guard restores it
 * instead of bouncing an authenticated provider to the login page.
 */
export const providerGuard: CanActivateFn = (route, state): Observable<boolean | UrlTree> | boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const denied = (): UrlTree => router.createUrlTree(['/account']);
  const hasProvider = (): boolean =>
    auth.isAuthenticated() &&
    (auth.currentUser()?.roles ?? []).some((role) =>
      ['PROFESSIONAL', 'BUSINESS_OWNER', 'BUSINESS_MANAGER'].includes(role),
    );
  if (hasProvider()) return true;
  if (auth.authStatus() === 'anonymous') return loginRedirect(router, state.url);
  return auth.restoreSession().pipe(map((user) => (user ? (hasProvider() ? true : denied()) : loginRedirect(router, state.url))));
};

function loginRedirect(router: Router, returnUrl: string): UrlTree {
  return router.createUrlTree(['/login'], { queryParams: { returnUrl } });
}