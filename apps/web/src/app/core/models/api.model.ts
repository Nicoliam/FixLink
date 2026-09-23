/**
 * FixLink API response envelope (see docs/API.md).
 *
 * Success:
 *   { "success": true, "data": {}, "message": "Success" }
 * Error:
 *   { "success": false, "error": { "code": "ERROR_CODE", "message": "..." } }
 */

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message: string;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorBody;

/** Backend error code delivered inside a 4xx/5xx response body, if present. */
export function getApiErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const body = (error as { error?: unknown }).error;
  if (typeof body !== 'object' || body === null) return null;
  const apiError = (body as { error?: unknown }).error;
  if (typeof apiError !== 'object' || apiError === null) return null;
  const code = (apiError as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/** Human-readable message from a failed API call, with a safe fallback. */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || error === null) return fallback;
  const body = (error as { error?: unknown }).error;
  if (typeof body !== 'object' || body === null) return fallback;
  const apiError = (body as { error?: unknown }).error;
  if (typeof apiError !== 'object' || apiError === null) return fallback;
  const message = (apiError as { message?: unknown }).message;
  return typeof message === 'string' && message.length > 0 ? message : fallback;
}
