import { Injectable } from '@angular/core';

const ACCESS_TOKEN_KEY = 'fixlink.access_token';
const REFRESH_TOKEN_KEY = 'fixlink.refresh_token';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (e.g. private mode) — session simply won't persist.
  }
}

/**
 * Persistence for the FixLink token pair.
 *
 * Only opaque tokens are stored here — never passwords or user data.
 * All reads/writes are guarded so server-side rendering or blocked storage
 * cannot crash the application.
 */
@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  getAccessToken(): string | null {
    return safeGet(ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return safeGet(REFRESH_TOKEN_KEY);
  }

  save(accessToken: string, refreshToken: string): void {
    safeSet(ACCESS_TOKEN_KEY, accessToken);
    safeSet(REFRESH_TOKEN_KEY, refreshToken);
  }

  clear(): void {
    try {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    } catch {
      // Ignore — nothing sensitive remains readable on failure paths.
    }
  }
}
