/**
 * FixLink Stage 6B — authenticated customer job routes.
 *
 * POST /api/v1/jobs      create a MARKETPLACE job request (CUSTOMER only)
 * GET  /api/v1/jobs      list the authenticated customer's jobs
 * GET  /api/v1/jobs/:id  retrieve one owned job with its quotes embedded
 *                         (other customers' jobs read as 404)
 *
 * Route shapes follow docs/API.md §10. Assignment, execution and payment
 * routes belong to later stages and are intentionally absent. Quote
 * submission/retrieval lives in the quotes module (Stage 6C).
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../../middleware/auth';
import type { MarketplaceStore } from '../marketplace/marketplace.store';
import type { JobQuotesReader } from '../quotes/quotes.store';
import type { UserRepository } from '../users/user.repository';
import { makeJobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import type { JobsStore } from './jobs.store';

export function makeJobsRoutes(
  users: UserRepository,
  jobs: JobsStore,
  marketplace: MarketplaceStore,
  quotes?: JobQuotesReader,
): Router {
  const router = Router();
  const service = new JobsService(jobs, marketplace, users, quotes);
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

  router.post('/jobs', controller.create);
  router.get('/jobs', controller.list);
  router.get('/jobs/:id', controller.getById);

  return router;
}
