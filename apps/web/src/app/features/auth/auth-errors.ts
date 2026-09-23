import { getApiErrorCode, getApiErrorMessage } from '../../core/models/api.model';

/**
 * Maps backend auth error codes to user-facing copy.
 * Unknown errors fall back to the backend message (safe, human-readable
 * by API contract) and finally to a generic message. Never surfaces
 * technical details such as status codes or stack traces.
 */
export function friendlyAuthMessage(error: unknown, fallback: string): string {
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
