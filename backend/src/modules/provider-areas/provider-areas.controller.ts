/**
 * Fixlynk Step 14 — provider service-area controller.
 *
 * Authentication is enforced by `requireAuth`; which provider profile the areas
 * belong to is derived from the session user id inside the service. No provider
 * id is read from the request anywhere on this controller.
 */
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../../middleware/auth';
import { fail, ok, type ErrorCode } from '../../utils/response';
import type { ProviderAreasService, ServiceResult } from './provider-areas.service';

const ERROR_CODES: readonly ErrorCode[] = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'FORBIDDEN_ROLE',
  'UNAUTHORIZED',
  'INTERNAL_ERROR',
];

function send<T>(res: Response, result: ServiceResult<T>, successMessage: string): void {
  if (result.data !== undefined) {
    ok(res, result.data, successMessage, result.status);
    return;
  }
  const code: ErrorCode = ERROR_CODES.includes(result.code as ErrorCode)
    ? (result.code as ErrorCode)
    : 'VALIDATION_ERROR';
  fail(res, code, result.message ?? 'Request failed.', result.status);
}

function authUser(req: Request): AuthenticatedUser {
  return (req as Request & { user: AuthenticatedUser }).user;
}

export function makeProviderAreasController(service: ProviderAreasService) {
  return {
    async list(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        send(res, await service.list(user.id), 'Service areas retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve your service areas. Please try again.', 500);
      }
    },

    async replace(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        send(res, await service.replace(user.id, req.body), 'Service areas saved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not save your service areas. Please try again.', 500);
      }
    },
  };
}