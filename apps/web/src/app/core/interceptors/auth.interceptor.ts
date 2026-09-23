import {
  HttpContextToken,
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, Observable, switchMap, throwError } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import { AuthService } from '../services/auth.service';
import { TokenStorageService } from '../services/token-storage.service';

/**
 * Marks a request that has already been retried after a token refresh.
 * Guarantees each request is retried at most once → no infinite loops.
 */
export const AUTH_RETRY_MARKER = new HttpContextToken<boolean>(() => false);

/** Auth endpoints that must never trigger the refresh flow themselves. */
const NO_REFRESH_URLS = ['/auth/login', '/auth/register', '/auth/refresh'];

/** Endpoints that receive no Authorization header (credentials live in the body). */
const NO_ATTACH_URLS = ['/auth/login', '/auth/register', '/auth/refresh'];

function urlPath(url: string): string {
  const queryIndex = url.indexOf('?');
  return queryIndex >= 0 ? url.slice(0, queryIndex) : url;
}

function matches(url: string, suffixes: string[]): boolean {
  const path = urlPath(url);
  return suffixes.some((suffix) => path === suffix || path.endsWith(suffix));
}

/**
 * Attaches the access token to API requests and recovers from expiry:
 *
 *  - Adds `Authorization: Bearer <accessToken>` to API calls (except the
 *    login/register/refresh endpoints whose credentials travel in the body).
 *  - On 401, attempts exactly one shared token refresh and retries the
 *    original request once with the new token.
 *  - If refresh fails (or no refresh token exists), the local session is
 *    cleared and the original 401 propagates. Navigation is left to route
 *    guards and pages so session restoration (GET /auth/me at startup) can
 *    fail silently without redirect side effects.
 *
 * Infinite-loop protection:
 *  1. The refresh endpoint itself is never intercepted for refresh.
 *  2. A retried request carries AUTH_RETRY_MARKER and is never refreshed again.
 *  3. Concurrent 401s share one refresh via AuthService.refreshTokensShared().
 */
export function authInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> {
  const baseUrl = inject(API_BASE_URL);
  const tokens = inject(TokenStorageService);
  const auth = inject(AuthService);

  const isApiRequest = req.url.startsWith(baseUrl) || req.url.startsWith('/api/');

  let outgoing = req;
  if (isApiRequest && !matches(req.url, NO_ATTACH_URLS)) {
    const accessToken = tokens.getAccessToken();
    if (accessToken) {
      outgoing = req.clone({
        setHeaders: { Authorization: `Bearer ${accessToken}` },
      });
    }
  }

  return next(outgoing).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }
      if (!isApiRequest || matches(req.url, NO_REFRESH_URLS) || req.context.get(AUTH_RETRY_MARKER)) {
        return throwError(() => error);
      }
      return auth.refreshTokensShared().pipe(
        switchMap(() => {
          const retryToken = tokens.getAccessToken();
          const retried = retryToken
            ? outgoing.clone({
                setHeaders: { Authorization: `Bearer ${retryToken}` },
                context: outgoing.context.set(AUTH_RETRY_MARKER, true),
              })
            : outgoing.clone({ context: outgoing.context.set(AUTH_RETRY_MARKER, true) });
          return next(retried);
        }),
        catchError(() => {
          auth.clearLocalSession();
          // Surface the original 401 to the caller.
          return throwError(() => error);
        }),
      );
    }),
  );
}
