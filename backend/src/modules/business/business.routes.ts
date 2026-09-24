/**
 * FixLink Stage 7A — business foundation + technician management routes.
 *
 * GET   /api/v1/business/me                  own business profile
 * PATCH /api/v1/business/me                  update own business profile (owner)
 * GET   /api/v1/business/technicians         roster for the caller's business
 * POST  /api/v1/business/technicians         invite a technician (owner/manager)
 * GET   /api/v1/business/technicians/:id     one roster row (owner/manager, or own row)
 * PATCH /api/v1/business/technicians/:id     rename / activate / deactivate (owner/manager)
 *
 * Job assignment, internal jobs, parts and approvals belong to later
 * stages and are intentionally absent.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../../middleware/auth';
import type { UserRepository } from '../users/user.repository';
import { makeBusinessController } from './business.controller';
import { BusinessService } from './business.service';
import type { BusinessStore } from './business.store';

export function makeBusinessRoutes(users: UserRepository, business: BusinessStore): Router {
  const router = Router();
  const service = new BusinessService(users, business);
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

  return router;
}
