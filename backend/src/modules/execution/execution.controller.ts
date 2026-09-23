/**
 * FixLink Stage 6F — execution controllers.
 *
 * Authentication is enforced by `requireAuth`; provider identity, customer
 * ownership and job state are derived inside the service — never from the
 * request body. File bytes are streamed back with their stored MIME type;
 * storage keys and filesystem paths are never exposed.
 */
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../../middleware/auth';
import { fail, ok, type ErrorCode } from '../../utils/response';
import type { ExecutionService, ServiceResult, UploadedFile } from './execution.service';

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

function uploadedFile(req: Request): UploadedFile | null {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) return null;
  return {
    buffer: file.buffer,
    mimetype: file.mimetype,
    originalname: file.originalname,
    size: file.size,
  };
}

function safeDownloadName(name: string): string {
  const cleaned = name.replace(/["\r\n]/g, '').trim();
  return cleaned === '' ? 'job-image' : cleaned;
}

export function makeExecutionController(service: ExecutionService) {
  return {
    async uploadImage(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const phase = (req.body as Record<string, unknown> | undefined)?.['phase'];
        const result = await service.uploadImage(user.id, req.params['jobId'] ?? '', phase, uploadedFile(req));
        send(res, result, 'Photo uploaded.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not upload the photo. Please try again.', 500);
      }
    },

    async listImages(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const result = await service.listImages(user.id, req.params['jobId'] ?? '');
        send(res, result, 'Photos retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve photos. Please try again.', 500);
      }
    },

    async getImageFile(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const result = await service.getImageFile(user.id, req.params['jobId'] ?? '', req.params['imageId'] ?? '');
        if (result.data === undefined) {
          send(res, result, 'Photo retrieved.');
          return;
        }
        res.setHeader('Content-Type', result.data.mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${safeDownloadName(result.data.filename)}"`);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.status(200).send(result.data.buffer);
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve the photo. Please try again.', 500);
      }
    },

    async deleteImage(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const result = await service.deleteImage(user.id, req.params['jobId'] ?? '', req.params['imageId'] ?? '');
        send(res, result, 'Photo deleted.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not delete the photo. Please try again.', 500);
      }
    },

    async createUpdate(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const result = await service.createUpdate(user.id, req.params['jobId'] ?? '', req.body);
        send(res, result, 'Progress update saved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not save the update. Please try again.', 500);
      }
    },

    async listUpdates(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const result = await service.listUpdates(user.id, req.params['jobId'] ?? '');
        send(res, result, 'Updates retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve updates. Please try again.', 500);
      }
    },

    async getTimeline(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const result = await service.getTimeline(user.id, req.params['jobId'] ?? '');
        send(res, result, 'Timeline retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve the timeline. Please try again.', 500);
      }
    },

    async complete(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const result = await service.completeJob(user.id, req.params['jobId'] ?? '', req.body);
        send(res, result, 'Job completed successfully.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not complete the job. Please try again.', 500);
      }
    },

    async confirm(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const result = await service.confirmJob(user.id, req.params['jobId'] ?? '');
        send(res, result, 'Job confirmed successfully.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not confirm the job. Please try again.', 500);
      }
    },
  };
}
