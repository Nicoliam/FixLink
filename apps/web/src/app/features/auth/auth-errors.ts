import { getApiErrorCode, getApiErrorMessage } from '../../core/models/api.model';

/**
 * `HttpClient` reports a request that never reached the API — API down,
 * wrong port, blocked by CORS, DNS failure, offline — as status `0` with a
 * `ProgressEvent` body instead of the standard error envelope. Without this
 * check such a failure falls through to the generic fallback, which is the
 * same copy the API uses for a genuine 500, so an unreachable backend is
 * indistinguishable from a server fault.
 */
function isUnreachable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (error as { status?: unknown }).status === 0;
}

/**
 * Maps backend auth error codes to user-facing copy.
 * Unknown errors fall back to the backend message (safe, human-readable
 * by API contract) and finally to a generic message. Never surfaces
 * technical details such as status codes or stack traces.
 */
export function friendlyAuthMessage(error: unknown, fallback: string): string {
  if (isUnreachable(error)) {
    return 'Cannot reach the Fixlynk service. Please check your connection and try again.';
  }

  const code = getApiErrorCode(error);
  const backendMessage = getApiErrorMessage(error, '');
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return 'Invalid email or password. Please try again.';
    case 'EMAIL_EXISTS':
      return 'An account with this email already exists. Try logging in instead.';
    case 'FORBIDDEN_ROLE':
      return 'This account type cannot be registered here. Please choose a supported account type.';
    case 'VALIDATION_ERROR':
      return backendMessage || 'Please check the highlighted fields and try again.';
    case 'RATE_LIMITED':
      return 'Too many attempts. Please wait a moment and try again.';
    default:
      return backendMessage || fallback;
  }
}
