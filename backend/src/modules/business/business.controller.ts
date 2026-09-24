/**
 * FixLink Stage 7A — business + technician controllers.
 * Authentication is enforced by `requireAuth`; business membership and
 * technician ownership are derived from the session user id inside the
 * service — never from the request body or parameters.
 */
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../../middleware/auth';
import { fail, ok, type ErrorCode } from '../../utils/response';
import type { BusinessService, ServiceResult } from './business.service';

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
  };
}
