import type { Response } from 'express';

export const errorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  EMAIL_EXISTS: 'EMAIL_EXISTS',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN_ROLE: 'FORBIDDEN_ROLE',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];

export function ok(res: Response, data: unknown, message: string, status = 200): void {
  res.status(status).json({ success: true, data, message });
}

export function fail(res: Response, code: ErrorCode, message: string, status: number): void {
  res.status(status).json({ success: false, error: { code, message } });
}
