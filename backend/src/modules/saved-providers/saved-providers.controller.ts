/**
 * Fixlynk — customer saved professional controllers.
 * Authentication is enforced by `requireAuth`; the owning customer is derived
 * from the session user id inside the service — never from the request body
 * or parameters.
 */
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../../middleware/auth';
import { fail, ok, type ErrorCode } from '../../utils/response';
import type { SavedProvidersResult, SavedProvidersService } from './saved-providers.service';

const ERROR_CODES: readonly ErrorCode[] = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'FORBIDDEN_ROLE',
  'UNAUTHORIZED',
  'INTERNAL_ERROR',
];

function send<T>(res: Response, result: SavedProvidersResult<T>, successMessage: string): void {
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

export function makeSavedProvidersController(service: SavedProvidersService) {
  return {
    async list(req: Request, res: Response): Promise<void> {
      try {
        send(res, await service.listSavedProviders(authUser(req).id), 'Saved professionals retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve your saved professionals. Please try again.', 500);
      }
    },

    async getState(req: Request, res: Response): Promise<void> {
      try {
        send(
          res,
          await service.getSavedState(authUser(req).id, req.params['providerId'] ?? ''),
          'Saved state retrieved.',
        );
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve the saved state. Please try again.', 500);
      }
    },

    async save(req: Request, res: Response): Promise<void> {
      try {
        send(res, await service.saveProvider(authUser(req).id, req.body), 'Professional saved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not save this professional. Please try again.', 500);
      }
    },

    async remove(req: Request, res: Response): Promise<void> {
      try {
        send(
          res,
          await service.removeProvider(authUser(req).id, req.params['providerId'] ?? ''),
          'Professional removed from your saved list.',
        );
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not remove this professional. Please try again.', 500);
      }
    },
  };
}
