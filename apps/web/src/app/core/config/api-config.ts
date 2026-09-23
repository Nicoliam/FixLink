import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Base URL for the FixLink REST API (no trailing slash), e.g.
 * `http://localhost:3000/api/v1`.
 *
 * Resolved from the environment configuration so the API origin is defined
 * in exactly one place. Inject this token instead of hardcoding URLs.
 */
export const API_BASE_URL = new InjectionToken<string>('FixLink API base URL', {
  providedIn: 'root',
  factory: () => environment.apiBaseUrl,
});
