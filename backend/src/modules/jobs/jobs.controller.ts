/**
 * FixLink Stage 6B — authenticated customer job controllers.
 * Authentication is enforced by `requireAuth`; customer ownership is
 * derived from the session user id inside the service — never from the
 * request body.
 */
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../../middleware/auth';
import { fail, ok, type ErrorCode } from '../../utils/response';
import type { JobsService, ServiceResult } from './jobs.service';

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

export function makeJobsController(service: JobsService) {
  return {
    async create(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const result = await service.createMarketplaceJob(user.id, user.email, req.body);
        send(res, result, 'Job request submitted.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not submit the job request. Please try again.', 500);
      }
    },

    async list(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const result = await service.listMyJobs(user.id, req.query as Record<string, unknown>);
        send(res, result, 'Jobs retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve jobs. Please try again.', 500);
      }
    },

    async getById(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const result = await service.getMyJobById(user.id, req.params['id'] ?? '');
        send(res, result, 'Job retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve the job. Please try again.', 500);
      }
    },
  };
}
