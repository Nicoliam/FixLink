/**
 * FixLink Stage 6B — authenticated customer job routes.
 *
 * POST /api/v1/jobs      create a MARKETPLACE job request (CUSTOMER only)
 * GET  /api/v1/jobs      list the authenticated customer's jobs
 * GET  /api/v1/jobs/:id  retrieve one owned job (other customers' jobs read as 404)
 *
 * Route shapes follow docs/API.md §10. Quote, assignment, execution and
 * payment routes belong to later stages and are intentionally absent.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../../middleware/auth';
import type { MarketplaceStore } from '../marketplace/marketplace.store';
import type { UserRepository } from '../users/user.repository';
import { makeJobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import type { JobsStore } from './jobs.store';

const jobsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } },
});

export function makeJobsRoutes(users: UserRepository, jobs: JobsStore, marketplace: MarketplaceStore): Router {
  const router = Router();
  const service = new JobsService(jobs, marketplace, users);
  const controller = makeJobsController(service);

  router.use(jobsLimiter);
  router.use(requireAuth(users));

  router.post('/jobs', controller.create);
  router.get('/jobs', controller.list);
  router.get('/jobs/:id', controller.getById);

  return router;
}
