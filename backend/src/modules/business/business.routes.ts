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
 * Execution, parts and approvals belong to later stages and are
 * intentionally absent.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../../middleware/auth';
import type { JobsStore } from '../jobs/jobs.store';
import type { UserRepository } from '../users/user.repository';
import { makeBusinessController } from './business.controller';
import { BusinessService } from './business.service';
import type { BusinessStore } from './business.store';

export function makeBusinessRoutes(
  users: UserRepository,
  business: BusinessStore,
  jobs?: Pick<JobsStore, 'findActiveService'>,
): Router {
  const router = Router();
  const service = new BusinessService(users, business, jobs);
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

  return router;
}
