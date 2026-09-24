/**
 * FixLink Stage 7A — business + technician controllers.
 * Authentication is enforced by `requireAuth`; business membership and
 * technician ownership are derived from the session user id inside the
 * service — never from the request body or parameters.
 */
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../../middleware/auth';
import { fail, ok, type ErrorCode } from '../../utils/response';
import type { BusinessService, ServiceResult, UploadedFile } from './business.service';

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
  return cleaned === '' ? 'fixlink-file' : cleaned;
}

export function makeBusinessController(service: BusinessService) {
  return {
    async getBusiness(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.getBusiness(authUser(req).id);
        send(res, result, 'Business retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve the business. Please try again.', 500);
      }
    },

    async updateBusiness(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.updateBusiness(authUser(req).id, req.body);
        send(res, result, 'Business updated.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not update the business. Please try again.', 500);
      }
    },

    async listTechnicians(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.listTechnicians(authUser(req).id);
        send(res, result, 'Technicians retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve technicians. Please try again.', 500);
      }
    },

    async getTechnician(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.getTechnician(authUser(req).id, req.params['technicianId'] ?? '');
        send(res, result, 'Technician retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve the technician. Please try again.', 500);
      }
    },

    async createTechnician(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.createTechnician(authUser(req).id, req.body);
        send(res, result, 'Technician added.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not add the technician. Please try again.', 500);
      }
    },

    async updateTechnician(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.updateTechnician(authUser(req).id, req.params['technicianId'] ?? '', req.body);
        send(res, result, 'Technician updated.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not update the technician. Please try again.', 500);
      }
    },

    async listBusinessCustomers(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.listBusinessCustomers(authUser(req).id, queryOf(req));
        send(res, result, 'Customers retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve customers. Please try again.', 500);
      }
    },

    async getBusinessCustomer(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.getBusinessCustomer(authUser(req).id, req.params['customerId'] ?? '');
        send(res, result, 'Customer retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve the customer. Please try again.', 500);
      }
    },

    async createBusinessCustomer(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.createBusinessCustomer(authUser(req).id, req.body);
        send(res, result, 'Customer added.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not add the customer. Please try again.', 500);
      }
    },

    async updateBusinessCustomer(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.updateBusinessCustomer(
          authUser(req).id,
          req.params['customerId'] ?? '',
          req.body,
        );
        send(res, result, 'Customer updated.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not update the customer. Please try again.', 500);
      }
    },

    async listInternalJobs(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.listInternalJobs(authUser(req).id, queryOf(req));
        send(res, result, 'Jobs retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve jobs. Please try again.', 500);
      }
    },

    async createInternalJob(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.createInternalJob(authUser(req).id, req.body);
        send(res, result, 'Internal job created.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not create the job. Please try again.', 500);
      }
    },

    async getInternalJob(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.getInternalJob(authUser(req).id, req.params['jobId'] ?? '');
        send(res, result, 'Job retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve the job. Please try again.', 500);
      }
    },

    async updateInternalJob(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.updateInternalJob(authUser(req).id, req.params['jobId'] ?? '', req.body);
        send(res, result, 'Job updated.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not update the job. Please try again.', 500);
      }
    },

    async cancelInternalJob(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.cancelInternalJob(authUser(req).id, req.params['jobId'] ?? '', req.body);
        send(res, result, 'Job cancelled.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not cancel the job. Please try again.', 500);
      }
    },

    async getInternalJobsSummary(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.getInternalJobsSummary(authUser(req).id);
        send(res, result, 'Job summary retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve the job summary. Please try again.', 500);
      }
    },

    async assignTechnician(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.assignTechnician(authUser(req).id, req.params['jobId'] ?? '', req.body);
        send(res, result, 'Technician assigned.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not assign the technician. Please try again.', 500);
      }
    },

    async getJobAssignment(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.getJobAssignment(authUser(req).id, req.params['jobId'] ?? '');
        send(res, result, 'Assignment retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve the assignment. Please try again.', 500);
      }
    },

    async listTechnicianJobs(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.listTechnicianJobs(authUser(req).id, queryOf(req));
        send(res, result, 'Jobs retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve jobs. Please try again.', 500);
      }
    },

    async getTechnicianJob(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.getTechnicianJob(authUser(req).id, req.params['jobId'] ?? '');
        send(res, result, 'Job retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve the job. Please try again.', 500);
      }
    },

    // --------------------------------------------------------------
    // Stage 7D — technician execution (start, BEFORE/DURING/AFTER
    // photos + notes, voice notes, timeline, completion). File bytes
    // stream back with their stored MIME type; storage keys and
    // filesystem paths are never exposed.
    // --------------------------------------------------------------

    async startTechnicianJob(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.startTechnicianJob(authUser(req).id, req.params['jobId'] ?? '');
        send(res, result, 'Work started.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not start the job. Please try again.', 500);
      }
    },

    async uploadTechnicianImage(req: Request, res: Response): Promise<void> {
      try {
        const phase = (req.body as Record<string, unknown> | undefined)?.['phase'];
        const result = await service.uploadTechnicianImage(
          authUser(req).id,
          req.params['jobId'] ?? '',
          phase,
          uploadedFile(req),
        );
        send(res, result, 'Photo uploaded.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not upload the photo. Please try again.', 500);
      }
    },

    async listTechnicianImages(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.listTechnicianImages(authUser(req).id, req.params['jobId'] ?? '');
        send(res, result, 'Photos retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve photos. Please try again.', 500);
      }
    },

    async getTechnicianImageFile(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.getTechnicianImageFile(
          authUser(req).id,
          req.params['jobId'] ?? '',
          req.params['imageId'] ?? '',
        );
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

    async deleteTechnicianImage(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.deleteTechnicianImage(
          authUser(req).id,
          req.params['jobId'] ?? '',
          req.params['imageId'] ?? '',
        );
        send(res, result, 'Photo deleted.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not delete the photo. Please try again.', 500);
      }
    },

    async createTechnicianUpdate(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.createTechnicianUpdate(
          authUser(req).id,
          req.params['jobId'] ?? '',
          req.body,
        );
        send(res, result, 'Progress update saved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not save the update. Please try again.', 500);
      }
    },

    async listTechnicianUpdates(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.listTechnicianUpdates(authUser(req).id, req.params['jobId'] ?? '');
        send(res, result, 'Updates retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve updates. Please try again.', 500);
      }
    },

    async uploadTechnicianVoiceNote(req: Request, res: Response): Promise<void> {
      try {
        const body = (req.body as Record<string, unknown> | undefined) ?? {};
        const duration = body['duration'] ?? body['durationSeconds'] ?? body['duration_seconds'];
        const result = await service.uploadTechnicianVoiceNote(
          authUser(req).id,
          req.params['jobId'] ?? '',
          uploadedFile(req),
          duration,
        );
        send(res, result, 'Voice note uploaded.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not upload the voice note. Please try again.', 500);
      }
    },

    async listTechnicianVoiceNotes(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.listTechnicianVoiceNotes(authUser(req).id, req.params['jobId'] ?? '');
        send(res, result, 'Voice notes retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve voice notes. Please try again.', 500);
      }
    },

    async getTechnicianVoiceNoteFile(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.getTechnicianVoiceNoteFile(
          authUser(req).id,
          req.params['jobId'] ?? '',
          req.params['voiceNoteId'] ?? '',
        );
        if (result.data === undefined) {
          send(res, result, 'Voice note retrieved.');
          return;
        }
        res.setHeader('Content-Type', result.data.mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${safeDownloadName(result.data.filename)}"`);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.status(200).send(result.data.buffer);
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve the voice note. Please try again.', 500);
      }
    },

    async getTechnicianExecutionTimeline(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.getTechnicianExecutionTimeline(authUser(req).id, req.params['jobId'] ?? '');
        send(res, result, 'Timeline retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve the timeline. Please try again.', 500);
      }
    },

    async completeTechnicianJob(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.completeTechnicianJob(
          authUser(req).id,
          req.params['jobId'] ?? '',
          req.body,
        );
        send(res, result, 'Job completed successfully.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not complete the job. Please try again.', 500);
      }
    },

    // --------------------------------------------------------------
    // Stage 7D — business visibility of execution documentation
    // (read-only; no technician-only capability is exposed here).
    // --------------------------------------------------------------

    async listBusinessJobImages(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.listBusinessJobImages(authUser(req).id, req.params['jobId'] ?? '');
        send(res, result, 'Photos retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve photos. Please try again.', 500);
      }
    },

    async getBusinessJobImageFile(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.getBusinessJobImageFile(
          authUser(req).id,
          req.params['jobId'] ?? '',
          req.params['imageId'] ?? '',
        );
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

    async listBusinessJobUpdates(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.listBusinessJobUpdates(authUser(req).id, req.params['jobId'] ?? '');
        send(res, result, 'Updates retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve updates. Please try again.', 500);
      }
    },

    async listBusinessVoiceNotes(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.listBusinessVoiceNotes(authUser(req).id, req.params['jobId'] ?? '');
        send(res, result, 'Voice notes retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve voice notes. Please try again.', 500);
      }
    },

    async getBusinessVoiceNoteFile(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.getBusinessVoiceNoteFile(
          authUser(req).id,
          req.params['jobId'] ?? '',
          req.params['voiceNoteId'] ?? '',
        );
        if (result.data === undefined) {
          send(res, result, 'Voice note retrieved.');
          return;
        }
        res.setHeader('Content-Type', result.data.mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${safeDownloadName(result.data.filename)}"`);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.status(200).send(result.data.buffer);
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve the voice note. Please try again.', 500);
      }
    },

    async getBusinessExecutionTimeline(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.getBusinessExecutionTimeline(authUser(req).id, req.params['jobId'] ?? '');
        send(res, result, 'Timeline retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve the timeline. Please try again.', 500);
      }
    },
  };
}

function queryOf(req: Request): Record<string, unknown> {
  return req.query as Record<string, unknown>;
}
