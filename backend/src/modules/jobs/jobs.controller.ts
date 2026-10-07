/**
 * Fixlynk Stage 6B — authenticated customer job controllers.
 * Authentication is enforced by `requireAuth`; customer ownership is
 * derived from the session user id inside the service — never from the
 * request body.
 */
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../../middleware/auth';
import { fail, ok, type ErrorCode } from '../../utils/response';
import type { JobsService, RequestImageUpload, ServiceResult } from './jobs.service';

const ERROR_CODES: readonly ErrorCode[] = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  // Step 15: an accepted job is a conflict, not a 404 - it exists, the caller
  // owns it, and the reason it cannot change is worth saying.
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

/** The single uploaded image, or null when the field was absent or empty. */
function uploadedImage(req: Request): RequestImageUpload | null {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) return null;
  return {
    buffer: file.buffer,
    mimetype: file.mimetype,
    originalname: file.originalname,
    size: file.size,
  };
}

export function makeJobsController(service: JobsService) {
  return {
    /** Step 15 - correct an owned request before a quote is accepted. */
    async update(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const result = await service.updateJob(user.id, req.params['id'] ?? '', req.body);
        send(res, result, 'Request updated.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not update the request. Please try again.', 500);
      }
    },

    /** Step 15 - withdraw a request, keeping its record. */
    async cancel(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const result = await service.cancelJob(user.id, req.params['id'] ?? '');
        send(res, result, 'Request cancelled.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not cancel the request. Please try again.', 500);
      }
    },

    /** Step 15 - soft delete an owned request. */
    async remove(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const result = await service.deleteJob(user.id, req.params['id'] ?? '');
        send(res, result, 'Request deleted.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not delete the request. Please try again.', 500);
      }
    },

    async create(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const result = await service.createMarketplaceJob(user.id, user.email, req.body);
        send(res, result, 'Job request submitted.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not submit the job request. Please try again.', 500);
      }
    },

    async uploadRequestImage(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const result = await service.uploadRequestImage(
          user.id,
          req.params['id'] ?? '',
          uploadedImage(req),
        );
        send(res, result, 'Photo attached to your request.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not attach the photo. Please try again.', 500);
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
