/**
 * FixLink Stage 6F — job execution & work-documentation routes.
 *
 * POST   /api/v1/jobs/:jobId/images              provider uploads a BEFORE/DURING/AFTER photo (IN_PROGRESS only)
 * GET    /api/v1/jobs/:jobId/images              authorized photo metadata (owning customer or addressed provider)
 * GET    /api/v1/jobs/:jobId/images/:imageId/file  authorized photo bytes (never a raw path or storage key)
 * DELETE /api/v1/jobs/:jobId/images/:imageId     uploader deletes their photo while IN_PROGRESS
 * POST   /api/v1/jobs/:jobId/updates              provider saves a BEFORE/DURING/AFTER note (IN_PROGRESS only)
 * GET    /api/v1/jobs/:jobId/updates              authorized progress notes
 * GET    /api/v1/jobs/:jobId/timeline             authorized combined timeline (status + updates + photos)
 * POST   /api/v1/jobs/:jobId/complete             provider completes (IN_PROGRESS → COMPLETED, note required)
 * POST   /api/v1/jobs/:jobId/confirm              customer confirms (COMPLETED → CONFIRMED → CLOSED)
 *
 * No payment, parts, manager-approval or notification routes are added.
 */
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import multer, { MulterError } from 'multer';
import { requireAuth } from '../../middleware/auth';
import { JOB_IMAGE_MAX_BYTES } from '../../services/file-storage';
import type { FileStorage } from '../../services/file-storage';
import type { JobsStore } from '../jobs/jobs.store';
import type { NotificationService } from '../notifications/notifications.service';
import type { QuotesStore } from '../quotes/quotes.store';
import type { UserRepository } from '../users/user.repository';
import { makeExecutionController } from './execution.controller';
import { ExecutionService } from './execution.service';
import type { ExecutionStore } from './execution.store';
import { fail } from '../../utils/response';

export function makeExecutionRoutes(
  users: UserRepository,
  jobs: JobsStore,
  quotes: QuotesStore,
  execution: ExecutionStore,
  storage: FileStorage,
  notify?: NotificationService,
): Router {
  const router = Router();
  const service = new ExecutionService(jobs, quotes, users, execution, storage, notify);
  const controller = makeExecutionController(service);

  // Per-app limiter (created in the factory, not at module level) so each
  // app instance — including every test app — gets an isolated store.
  const executionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } },
  });
  router.use(executionLimiter);
  router.use(requireAuth(users));

  // Memory adapter: image bytes are held in RAM (5MB cap) and written to
  // the local storage dir by the service. Field name: `image`.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: JOB_IMAGE_MAX_BYTES, files: 1 },
  });

  router.post('/jobs/:jobId/images', upload.single('image'), controller.uploadImage);
  router.get('/jobs/:jobId/images', controller.listImages);
  router.get('/jobs/:jobId/images/:imageId/file', controller.getImageFile);
  router.delete('/jobs/:jobId/images/:imageId', controller.deleteImage);
  router.post('/jobs/:jobId/updates', controller.createUpdate);
  router.get('/jobs/:jobId/updates', controller.listUpdates);
  router.get('/jobs/:jobId/timeline', controller.getTimeline);
  router.post('/jobs/:jobId/complete', controller.complete);
  router.post('/jobs/:jobId/confirm', controller.confirm);

  // Multer errors surface here (before the controller): map size/field
  // violations to the standard 422 envelope instead of a 500.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  router.use((err: unknown, _req: Request, res: Response, next: NextFunction): void => {
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        fail(res, 'VALIDATION_ERROR', 'Image must be 5MB or smaller.', 422);
        return;
      }
      fail(res, 'VALIDATION_ERROR', 'Invalid image upload.', 422);
      return;
    }
    next(err as Error);
  });

  return router;
}
