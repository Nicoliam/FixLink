/**
 * Fixlynk API response envelope (see docs/API.md).
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

/**
 * The `{ code, message }` object of a failed call. The API wraps it as
 * `{ success: false, error: { code, message } }` and HttpClient puts that whole
 * body on `HttpErrorResponse.error`, so the details sit one level deeper. A flat
 * `{ code, message }` body is still accepted.
 */
function errorDetail(error: unknown): { code?: unknown; message?: unknown } | null {
  if (typeof error !== 'object' || error === null) return null;
  const body = (error as { error?: unknown }).error;
  if (typeof body !== 'object' || body === null) return null;
  const nested = (body as { error?: unknown }).error;
  const detail = typeof nested === 'object' && nested !== null ? nested : body;
  return detail as { code?: unknown; message?: unknown };
}

/** Backend error code delivered inside a 4xx/5xx response body, if present. */
export function getApiErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const detail = errorDetail(error);
  if (detail === null) return null;
  const code = detail.code;
  return typeof code === 'string' ? code : null;
}

/** Human-readable message from a failed API call, with a safe fallback. */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || error === null) return fallback;
  const detail = errorDetail(error);
  if (detail === null) return fallback;
  const message = detail.message;
  return typeof message === 'string' && message.length > 0 ? message : fallback;
}
