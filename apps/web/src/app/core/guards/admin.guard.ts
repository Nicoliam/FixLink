import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { map, Observable } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = (route, state): Observable<boolean | UrlTree> | boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const denied = (): UrlTree => router.createUrlTree(['/account']);
  const hasAdmin = (): boolean => auth.isAuthenticated() && (auth.currentUser()?.roles ?? []).includes('ADMIN');
  if (hasAdmin()) return true;
  if (auth.authStatus() === 'anonymous') return loginRedirect(router, state.url);
  return auth.restoreSession().pipe(map((user) => (user ? (hasAdmin() ? true : denied()) : loginRedirect(router, state.url))));
};

function loginRedirect(router: Router, returnUrl: string): UrlTree {
  return router.createUrlTree(['/login'], { queryParams: { returnUrl } });
}
