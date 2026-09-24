/**
 * FixLink Stage 7A + 7B — business routes.
 *
 * Stage 7A (foundation + technicians):
 * GET   /api/v1/business/me                  own business profile
 * PATCH /api/v1/business/me                  update own business profile (owner)
 * GET   /api/v1/business/technicians         roster for the caller's business
 * POST  /api/v1/business/technicians         invite a technician (owner/manager)
 * GET   /api/v1/business/technicians/:id     one roster row (owner/manager, or own row)
 * PATCH /api/v1/business/technicians/:id     rename / activate / deactivate (owner/manager)
 *
 * Stage 7B (business-managed customers + internal jobs):
 * GET   /api/v1/business/customers           list own business customers
 * POST  /api/v1/business/customers           create a business-managed customer
 * GET   /api/v1/business/customers/:id       one own business customer
 * PATCH /api/v1/business/customers/:id       update an own business customer
 * GET   /api/v1/business/jobs-summary        real-data INTERNAL job counts
 * GET   /api/v1/business/jobs                list own INTERNAL jobs
 * POST  /api/v1/business/jobs                create an INTERNAL job (REQUESTED)
 * GET   /api/v1/business/jobs/:id            one own INTERNAL job + timeline
 * PATCH /api/v1/business/jobs/:id            update permitted fields (REQUESTED only)
 * POST  /api/v1/business/jobs/:id/cancel     cancel an eligible INTERNAL job
 *
 * Stage 7C (technician assignment + My Jobs):
 * POST  /api/v1/business/jobs/:id/assign     assign/reassign a technician (owner/manager)
 * PATCH /api/v1/business/jobs/:id/assignment assign/reassign alias (owner/manager)
 * GET   /api/v1/business/jobs/:id/assignment active assignment + history (owner/manager)
 * GET   /api/v1/technician/jobs              jobs assigned to the caller (technician)
 * GET   /api/v1/technician/jobs/:id          one assigned job + timeline (technician)
 *
 * Stage 7D (technician execution + voice notes + business visibility):
 * POST  /api/v1/technician/jobs/:id/start                    start work (REQUESTED/SCHEDULED → IN_PROGRESS)
 * POST  /api/v1/technician/jobs/:id/images                   upload a BEFORE/DURING/AFTER photo (IN_PROGRESS)
 * GET   /api/v1/technician/jobs/:id/images                   photo metadata for the assigned job
 * GET   /api/v1/technician/jobs/:id/images/:imageId/file     photo bytes (authorized, never a path)
 * DELETE /api/v1/technician/jobs/:id/images/:imageId         uploader deletes their photo (IN_PROGRESS)
 * POST  /api/v1/technician/jobs/:id/updates                  save a BEFORE/DURING/AFTER note (IN_PROGRESS)
 * GET   /api/v1/technician/jobs/:id/updates                  progress notes for the assigned job
 * POST  /api/v1/technician/jobs/:id/voice-notes               upload a voice note (IN_PROGRESS)
 * GET   /api/v1/technician/jobs/:id/voice-notes               voice-note metadata for the assigned job
 * GET   /api/v1/technician/jobs/:id/voice-notes/:voiceNoteId/file  voice-note bytes (authorized)
 * GET   /api/v1/technician/jobs/:id/timeline                 execution timeline (status + work + voice)
 * POST  /api/v1/technician/jobs/:id/complete                 complete (IN_PROGRESS → COMPLETED, note required)
 * GET   /api/v1/business/jobs/:id/images                    photo metadata (owner/manager, read-only)
 * GET   /api/v1/business/jobs/:id/images/:imageId/file       photo bytes (owner/manager)
 * GET   /api/v1/business/jobs/:id/updates                   progress notes (owner/manager, read-only)
 * GET   /api/v1/business/jobs/:id/voice-notes                voice-note metadata (owner/manager, read-only)
 * GET   /api/v1/business/jobs/:id/voice-notes/:voiceNoteId/file  voice-note bytes (owner/manager)
 * GET   /api/v1/business/jobs/:id/timeline                  execution timeline (owner/manager, read-only)
 *
 * Stage 7E (technician parts requests + business visibility):
 * POST  /api/v1/technician/jobs/:id/parts                   submit a parts request (IN_PROGRESS/AWAITING_PARTS)
 * GET   /api/v1/technician/jobs/:id/parts                   submitted requests for the assigned job
 * GET   /api/v1/technician/jobs/:id/parts/:requestId        one submitted request
 * GET   /api/v1/technician/jobs/:id/parts/:requestId/photo/file  photo evidence bytes (authorized)
 * GET   /api/v1/business/jobs/:id/parts                     requests for an owned job (owner/manager, read-only)
 * GET   /api/v1/business/jobs/:id/parts/:requestId          one request (owner/manager, read-only)
 * GET   /api/v1/business/jobs/:id/parts/:requestId/photo/file  photo evidence bytes (owner/manager)
 *
 * Parts requests are the job-scoped /jobs/:jobId/parts surface applied
 * to the existing technician/business surfaces so business isolation
 * holds; creating a request never changes job status. Manager
 * approvals (approve/reject/needs-info, IN_PROGRESS → AWAITING_PARTS)
 * and notifications belong to Stage 7F and are intentionally absent.
 */
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import multer, { MulterError } from 'multer';
import { requireAuth } from '../../middleware/auth';
import { VOICE_NOTE_MAX_BYTES } from '../../services/file-storage';
import type { FileStorage } from '../../services/file-storage';
import type { JobsStore } from '../jobs/jobs.store';
import type { UserRepository } from '../users/user.repository';
import { makeBusinessController } from './business.controller';
import { BusinessService } from './business.service';
import type { BusinessStore } from './business.store';
import { fail } from '../../utils/response';

export function makeBusinessRoutes(
  users: UserRepository,
  business: BusinessStore,
  jobs?: Pick<JobsStore, 'findActiveService'>,
  storage?: FileStorage,
): Router {
  const router = Router();
  const service = new BusinessService(users, business, jobs, storage);
  const controller = makeBusinessController(service);

  // Per-app limiter (created in the factory, not at module level) so each
  // app instance — including every test app — gets an isolated store.
  const businessLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } },
  });
  router.use(businessLimiter);
  router.use(requireAuth(users));

  router.get('/business/me', controller.getBusiness);
  router.patch('/business/me', controller.updateBusiness);
  router.get('/business/technicians', controller.listTechnicians);
  router.post('/business/technicians', controller.createTechnician);
  router.get('/business/technicians/:technicianId', controller.getTechnician);
  router.patch('/business/technicians/:technicianId', controller.updateTechnician);

  router.get('/business/customers', controller.listBusinessCustomers);
  router.post('/business/customers', controller.createBusinessCustomer);
  router.get('/business/customers/:customerId', controller.getBusinessCustomer);
  router.patch('/business/customers/:customerId', controller.updateBusinessCustomer);

  // The summary path must be registered before `:jobId` so it is not
  // captured as a job id (which would read as 400, not the summary).
  router.get('/business/jobs-summary', controller.getInternalJobsSummary);
  router.get('/business/jobs', controller.listInternalJobs);
  router.post('/business/jobs', controller.createInternalJob);
  router.get('/business/jobs/:jobId', controller.getInternalJob);
  router.patch('/business/jobs/:jobId', controller.updateInternalJob);
  router.post('/business/jobs/:jobId/cancel', controller.cancelInternalJob);
  router.post('/business/jobs/:jobId/assign', controller.assignTechnician);
  router.patch('/business/jobs/:jobId/assignment', controller.assignTechnician);
  router.get('/business/jobs/:jobId/assignment', controller.getJobAssignment);

  router.get('/technician/jobs', controller.listTechnicianJobs);
  router.get('/technician/jobs/:jobId', controller.getTechnicianJob);

  // Stage 7D — technician execution. Memory adapter: file bytes are held
  // in RAM (10MB cap covers the largest voice note) and written to the
  // storage dir by the service. Photo field: `image`; voice field: `audio`.
  const executionUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: VOICE_NOTE_MAX_BYTES, files: 1 },
  });

  router.post('/technician/jobs/:jobId/start', controller.startTechnicianJob);
  router.post('/technician/jobs/:jobId/images', executionUpload.single('image'), controller.uploadTechnicianImage);
  router.get('/technician/jobs/:jobId/images', controller.listTechnicianImages);
  router.get('/technician/jobs/:jobId/images/:imageId/file', controller.getTechnicianImageFile);
  router.delete('/technician/jobs/:jobId/images/:imageId', controller.deleteTechnicianImage);
  router.post('/technician/jobs/:jobId/updates', controller.createTechnicianUpdate);
  router.get('/technician/jobs/:jobId/updates', controller.listTechnicianUpdates);
  router.post(
    '/technician/jobs/:jobId/voice-notes',
    executionUpload.single('audio'),
    controller.uploadTechnicianVoiceNote,
  );
  router.get('/technician/jobs/:jobId/voice-notes', controller.listTechnicianVoiceNotes);
  router.get('/technician/jobs/:jobId/voice-notes/:voiceNoteId/file', controller.getTechnicianVoiceNoteFile);
  router.get('/technician/jobs/:jobId/timeline', controller.getTechnicianExecutionTimeline);
  router.post('/technician/jobs/:jobId/complete', controller.completeTechnicianJob);

  router.get('/business/jobs/:jobId/images', controller.listBusinessJobImages);
  router.get('/business/jobs/:jobId/images/:imageId/file', controller.getBusinessJobImageFile);
  router.get('/business/jobs/:jobId/updates', controller.listBusinessJobUpdates);
  router.get('/business/jobs/:jobId/voice-notes', controller.listBusinessVoiceNotes);
  router.get('/business/jobs/:jobId/voice-notes/:voiceNoteId/file', controller.getBusinessVoiceNoteFile);
  router.get('/business/jobs/:jobId/timeline', controller.getBusinessExecutionTimeline);

  // Stage 7E — parts requests. POST accepts JSON (no photo) or
  // multipart FormData (part fields + optional `photo` file); the
  // same 10MB execution upload adapter covers the optional evidence
  // photo (the service enforces the 5MB image cap).
  router.post('/technician/jobs/:jobId/parts', executionUpload.single('photo'), controller.createTechnicianPartsRequest);
  router.get('/technician/jobs/:jobId/parts', controller.listTechnicianPartsRequests);
  router.get('/technician/jobs/:jobId/parts/:requestId', controller.getTechnicianPartsRequest);
  router.get('/technician/jobs/:jobId/parts/:requestId/photo/file', controller.getTechnicianPartsPhotoFile);
  router.get('/business/jobs/:jobId/parts', controller.listBusinessPartsRequests);
  router.get('/business/jobs/:jobId/parts/:requestId', controller.getBusinessPartsRequest);
  router.get('/business/jobs/:jobId/parts/:requestId/photo/file', controller.getBusinessPartsPhotoFile);

  // Multer errors surface here (before the controller): map size/field
  // violations to the standard 422 envelope instead of a 500.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  router.use((err: unknown, _req: Request, res: Response, next: NextFunction): void => {
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        fail(res, 'VALIDATION_ERROR', 'File must be 10MB or smaller.', 422);
        return;
      }
      fail(res, 'VALIDATION_ERROR', 'Invalid file upload.', 422);
      return;
    }
    next(err as Error);
  });

  return router;
}
