/**
 * FixLink Stage 6C — provider request + quote controllers.
 * Authentication is enforced by `requireAuth`; provider identity and job
 * ownership are derived from the session user id inside the service —
 * never from the request body or parameters.
 */
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../../middleware/auth';
import { fail, ok, type ErrorCode } from '../../utils/response';
import type { QuotesService, ServiceResult } from './quotes.service';

const ERROR_CODES: readonly ErrorCode[] = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
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

export function makeQuotesController(service: QuotesService) {
  return {
    async listRequests(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const result = await service.listProviderRequests(user.id, req.query as Record<string, unknown>);
        send(res, result, 'Requests retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve requests. Please try again.', 500);
      }
    },

    async getRequest(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const result = await service.getProviderRequest(user.id, req.params['id'] ?? '');
        send(res, result, 'Request retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve the request. Please try again.', 500);
      }
    },

    async create(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const result = await service.createQuote(user.id, req.params['jobId'] ?? '', req.body);
        send(res, result, 'Quote submitted.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not submit the quote. Please try again.', 500);
      }
    },

    async listForJob(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const result = await service.listJobQuotes(user.id, req.params['jobId'] ?? '');
        send(res, result, 'Quotes retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve quotes. Please try again.', 500);
      }
    },

    async getById(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const result = await service.getQuote(user.id, req.params['id'] ?? '');
        send(res, result, 'Quote retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve the quote. Please try again.', 500);
      }
    },
  };
}
