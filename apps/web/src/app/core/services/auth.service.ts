import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, finalize, map, Observable, of, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import { TokenStorageService } from './token-storage.service';
import type { ApiSuccess } from '../models/api.model';
import type {
  AuthStatus,
  AuthUser,
  LoginRequest,
  LoginResponseData,
  MeResponseData,
  RefreshResponseData,
  RegisterRequest,
  RegisterResponseData,
} from '../models/auth.model';

/**
 * FixLink authentication service — Stage 5B.
 *
 * Single owner of client-side authentication state:
 *   register / login / logout / refresh / getCurrentUser
 *
 * State is exposed as signals. HTTP calls return observables; on success the
 * signals are updated, on failure they are left untouched (callers surface
 * the error). Token persistence is delegated to TokenStorageService.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly tokens = inject(TokenStorageService);

  private readonly _user = signal<AuthUser | null>(null);
  private readonly _status = signal<AuthStatus>('unknown');
  private readonly _restoring = signal(false);

  /** Currently authenticated user, or null when anonymous/unknown. */
  readonly currentUser = this._user.asReadonly();
  /** Lifecycle state of the session: unknown → authenticated | anonymous. */
  readonly authStatus = this._status.asReadonly();
  /** True while an initial session restoration is in flight. */
  readonly isRestoring = this._restoring.asReadonly();
  /** Derived: true only when a user session is established. */
  readonly isAuthenticated = computed(() => this._status() === 'authenticated' && this._user() !== null);

  /**
   * Register a new account. The backend returns the safe user only
   * (no tokens), so this does NOT establish a session — the caller should
   * direct the user to the login page afterwards.
   */
  register(payload: RegisterRequest): Observable<AuthUser> {
    const body: Record<string, string> = {
      email: payload.email.trim(),
      password: payload.password,
    };
    if (payload.phone?.trim()) body['phone'] = payload.phone.trim();
    if (payload.role) body['role'] = payload.role;
    return this.http
      .post<ApiSuccess<RegisterResponseData>>(`${this.baseUrl}/auth/register`, body)
      .pipe(map((res) => res.data.user));
  }

  /** Authenticate with email + password and establish a session. */
  login(payload: LoginRequest): Observable<AuthUser> {
    return this.http
      .post<ApiSuccess<LoginResponseData>>(`${this.baseUrl}/auth/login`, {
        email: payload.email.trim(),
        password: payload.password,
      })
      .pipe(
        tap((res) => {
          this.tokens.save(res.data.accessToken, res.data.refreshToken);
          this._user.set(res.data.user);
          this._status.set('authenticated');
        }),
        map((res) => res.data.user),
      );
  }

  /**
   * Rotate the token pair using the stored refresh token (single HTTP call).
   * Used directly by the 401 interceptor via refreshTokensShared().
   */
  refreshTokens(): Observable<AuthUser> {
    const refreshToken = this.tokens.getRefreshToken();
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token available.'));
    }
    return this.http
      .post<ApiSuccess<RefreshResponseData>>(`${this.baseUrl}/auth/refresh`, { refreshToken })
      .pipe(
        tap((res) => {
          this.tokens.save(res.data.accessToken, res.data.refreshToken);
          this._user.set(res.data.user);
          this._status.set('authenticated');
        }),
        map((res) => res.data.user),
      );
  }

  /**
   * Shared single-flight refresh so concurrent 401s trigger exactly one
   * POST /auth/refresh. The shared observable resets after completion.
   */
  refreshTokensShared(): Observable<AuthUser> {
    if (!this.refreshShared$) {
      this.refreshShared$ = this.refreshTokens().pipe(
        shareReplay({ bufferSize: 1, refCount: false }),
        finalize(() => {
          this.refreshShared$ = null;
        }),
      );
    }
    return this.refreshShared$;
  }

  private refreshShared$: Observable<AuthUser> | null = null;

  /** Fetch the current user for a valid access token. */
  getCurrentUser(): Observable<AuthUser> {
    return this.http
      .get<ApiSuccess<MeResponseData>>(`${this.baseUrl}/auth/me`)
      .pipe(
        tap((res) => {
          this._user.set(res.data.user);
          this._status.set('authenticated');
        }),
        map((res) => res.data.user),
      );
  }

  /**
   * Restore a persisted session (access token and/or refresh token).
   * Resolves with the user when restoration succeeds, or null when there is
   * no session or the tokens are no longer valid. Never throws.
   */
  restoreSession(): Observable<AuthUser | null> {
    if (this._status() === 'authenticated' && this._user()) {
      return of(this._user());
    }
    const hasAccess = this.tokens.getAccessToken() !== null;
    const hasRefresh = this.tokens.getRefreshToken() !== null;
    if (!hasAccess && !hasRefresh) {
      this._status.set('anonymous');
      return of(null);
    }
    this._restoring.set(true);
    return this.getCurrentUser().pipe(
      catchError(() => {
        // Access token rejected — try exactly one refresh before giving up.
        if (!hasRefresh) {
          this.clearLocalSession();
          return of(null);
        }
        return this.refreshTokens().pipe(
          catchError(() => {
            this.clearLocalSession();
            return of(null);
          }),
        );
      }),
      finalize(() => this._restoring.set(false)),
    );
  }

  /**
   * Log out. The backend revocation call is best-effort: local session state
   * is ALWAYS cleared so a failed network call can never leave the client
   * appearing authenticated.
   */
  logout(): Observable<void> {
    const refreshToken = this.tokens.getRefreshToken();
    const body: Record<string, string> = {};
    if (refreshToken) body['refreshToken'] = refreshToken;
    return this.http.post<ApiSuccess<Record<string, never>>>(`${this.baseUrl}/auth/logout`, body).pipe(
      // Backend logout is idempotent (unknown tokens still return 200).
      catchError(() => of(null)),
      switchMap(() => {
        this.clearLocalSession();
        return of(undefined);
      }),
    );
  }

  /** Drop tokens and reset signals. Used on refresh failure / logout. */
  clearLocalSession(): void {
    this.tokens.clear();
    this._user.set(null);
    this._status.set('anonymous');
  }
}
