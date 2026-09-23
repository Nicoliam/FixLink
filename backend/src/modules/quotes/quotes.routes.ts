/**
 * FixLink Stage 6C — provider request + quote routes.
 * Stage 6D adds customer quote acceptance.
 *
 * GET  /api/v1/provider/requests                  provider inbox (REQUESTED + QUOTED)
 * GET  /api/v1/provider/requests/:id              one addressed request with quotes
 * POST /api/v1/jobs/:jobId/quotes                 submit a quote (REQUESTED → QUOTED)
 * GET  /api/v1/jobs/:jobId/quotes                 quotes for an authorized job
 * GET  /api/v1/quotes/:id                         one authorized quote
 * POST /api/v1/jobs/:jobId/quotes/:quoteId/accept customer accepts a quote (QUOTED → ACCEPTED)
 *
 * Quote decline / withdrawal belong to a later stage and are
 * intentionally absent. The `/provider` prefix avoids any ambiguity with
 * the customer `GET /api/v1/jobs/:id` route.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../../middleware/auth';
import type { UserRepository } from '../users/user.repository';
import type { JobsStore } from '../jobs/jobs.store';
import { makeQuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import type { QuotesStore } from './quotes.store';

export function makeQuotesRoutes(users: UserRepository, jobs: JobsStore, quotes: QuotesStore): Router {
  const router = Router();
  const service = new QuotesService(jobs, quotes, users);
  const controller = makeQuotesController(service);

  // Per-app limiter (created in the factory, not at module level) so each
  // app instance — including every test app — gets an isolated store.
  const quotesLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } },
  });
  router.use(quotesLimiter);
  router.use(requireAuth(users));

  router.get('/provider/requests', controller.listRequests);
  router.get('/provider/requests/:id', controller.getRequest);
  router.post('/jobs/:jobId/quotes', controller.create);
  router.post('/jobs/:jobId/quotes/:quoteId/accept', controller.accept);
  router.get('/jobs/:jobId/quotes', controller.listForJob);
  router.get('/quotes/:id', controller.getById);

  return router;
}
