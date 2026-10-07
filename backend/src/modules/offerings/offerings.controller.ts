/**
 * Fixlynk — provider service offering controllers.
 * Authentication is enforced by `requireAuth`; provider identity and
 * offering ownership are derived from the session user id inside the
 * service — never from the request body or parameters.
 */
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../../middleware/auth';
import { fail, ok, type ErrorCode } from '../../utils/response';
import type { OfferingsService, OfferingServiceResult } from './offerings.service';

const ERROR_CODES: readonly ErrorCode[] = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'FORBIDDEN_ROLE',
  'UNAUTHORIZED',
  'INTERNAL_ERROR',
];

function send<T>(res: Response, result: OfferingServiceResult<T>, successMessage: string): void {
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

export function makeOfferingsController(service: OfferingsService) {
  return {
    async list(_req: Request, res: Response): Promise<void> {
      try {
        send(res, await service.listOfferings(authUser(_req).id), 'Services retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve services. Please try again.', 500);
      }
    },

    async get(req: Request, res: Response): Promise<void> {
      try {
        send(res, await service.getOffering(authUser(req).id, req.params['id'] ?? ''), 'Service retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve the service. Please try again.', 500);
      }
    },

    async create(req: Request, res: Response): Promise<void> {
      try {
        send(res, await service.createOffering(authUser(req).id, req.body), 'Service created.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not create the service. Please try again.', 500);
      }
    },

    async update(req: Request, res: Response): Promise<void> {
      try {
        send(
          res,
          await service.updateOffering(authUser(req).id, req.params['id'] ?? '', req.body),
          'Service updated.',
        );
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not save the service. Please try again.', 500);
      }
    },

    async remove(req: Request, res: Response): Promise<void> {
      try {
        send(res, await service.removeOffering(authUser(req).id, req.params['id'] ?? ''), 'Service removed.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not remove the service. Please try again.', 500);
      }
    },
  };
}