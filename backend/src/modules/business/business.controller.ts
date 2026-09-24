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
  };
}

function queryOf(req: Request): Record<string, unknown> {
  return req.query as Record<string, unknown>;
}
