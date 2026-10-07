/**
 * Fixlynk Stage 6B — authenticated customer job routes.
 *
 * POST   /api/v1/jobs                 create a MARKETPLACE job request (CUSTOMER only)
 * GET    /api/v1/jobs                 list the authenticated customer's jobs
 * GET    /api/v1/jobs/:id             retrieve one owned job with its quotes embedded
 *                                      (other customers' jobs read as 404)
 * POST   /api/v1/jobs/:id/request-images  attach a photo of the problem (owning
 *                                      CUSTOMER, while REQUESTED/QUOTED)
 *
 * Route shapes follow docs/API.md §10. Assignment, execution and payment
 * routes belong to later stages and are intentionally absent. Quote
 * submission/retrieval lives in the quotes module (Stage 6C).
 */
import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import { fail } from '../../utils/response';
import { JOB_IMAGE_MAX_BYTES } from '../../services/file-storage';
import type { MarketplaceStore } from '../marketplace/marketplace.store';
import type { NotificationService } from '../notifications/notifications.service';
import type { JobQuotesReader } from '../quotes/quotes.store';
import type { UserRepository } from '../users/user.repository';
import { makeJobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import type { JobsStore } from './jobs.store';
import type { FileStorage } from '../../services/file-storage';
import type { OpsAlertSender } from '../../services/ops-alert';

/**
 * Translate multer's own failures into the standard error envelope.
 *
 * Without this, an oversized or unexpected file surfaces as an HTML error page
 * from Express rather than the documented JSON shape, which breaks every client
 * that parses responses uniformly.
 */
function requestImageUploadErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: (err?: unknown) => void,
): void {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: string }).code;
    if (code === 'LIMIT_FILE_SIZE') {
      fail(res, 'VALIDATION_ERROR', 'Image must be 5MB or smaller.', 422);
      return;
    }
    if (code === 'LIMIT_UNEXPECTED_FILE') {
      fail(res, 'VALIDATION_ERROR', 'Unexpected file field. Use the "image" field.', 422);
      return;
    }
  }
  next(err);
}

export function makeJobsRoutes(
  users: UserRepository,
  jobs: JobsStore,
  marketplace: MarketplaceStore,
  quotes?: JobQuotesReader,
  notify?: NotificationService,
  storage?: FileStorage,
  /** Optional: new-job alerts are skipped when absent. */
  opsAlert?: OpsAlertSender,
): Router {
  const router = Router();
  const service = new JobsService(
    jobs,
    marketplace,
    users,
    quotes,
    notify,
    quotes as unknown as {
      findUserIdsForProvider(
        providerType: 'professional' | 'business',
        providerNumericId: string,
      ): Promise<string[]>;
    },
    storage,
    opsAlert,
  );
  const controller = makeJobsController(service);

  // Per-app limiter (created in the factory, not at module level) so each
  // app instance — including every test app — gets an isolated store.
  const jobsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } },
  });
  router.use(jobsLimiter);
  router.use(requireAuth(users));

  // Request photos: bytes are held in memory (5MB cap, matching the execution
  // module) and written to the storage dir by the service. Field name: `image`.
  const requestImageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: JOB_IMAGE_MAX_BYTES, files: 1 },
  });

  router.post('/jobs', controller.create);
  // Registered before `/jobs/:id` is irrelevant here (that is a GET), but kept
  // adjacent to the create route because it is part of the same request flow.
  router.post('/jobs/:id/request-images', requestImageUpload.single('image'), controller.uploadRequestImage);
  router.use(requestImageUploadErrorHandler);
  router.get('/jobs', controller.list);
  router.get('/jobs/:id', controller.getById);
  // Step 15 - customer corrections and withdrawal. Registered after the GETs so
  // the literal paths can never be read as an :id.
  router.patch('/jobs/:id', controller.update);
  router.post('/jobs/:id/cancel', controller.cancel);
  router.delete('/jobs/:id', controller.remove);

  return router;
}
