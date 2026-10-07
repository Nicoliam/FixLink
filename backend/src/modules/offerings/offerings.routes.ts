/**
 * Fixlynk — provider service offering routes.
 *
 * GET    /api/v1/provider/offerings       the caller's own services
 * GET    /api/v1/provider/offerings/:id   one of the caller's own services
 * POST   /api/v1/provider/offerings       describe a new service
 * PATCH  /api/v1/provider/offerings/:id   edit name, description, category or price
 * DELETE /api/v1/provider/offerings/:id   remove a service
 *
 * The `/provider` prefix matches the existing provider inbox
 * (`GET /api/v1/provider/requests`) and avoids any ambiguity with the public
 * `GET /api/v1/providers/:id` marketplace route.
 *
 * Requires PROFESSIONAL, BUSINESS_OWNER or BUSINESS_MANAGER. Technicians,
 * customers and administrators are refused by the service, which derives
 * identity from the session rather than trusting the request.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../../middleware/auth';
import type { UserRepository } from '../users/user.repository';
import type { ServiceOfferingsStore } from './offerings.store';
import { makeOfferingsController } from './offerings.controller';
import { OfferingsService } from './offerings.service';

export function makeOfferingsRoutes(users: UserRepository, store: ServiceOfferingsStore): Router {
  const router = Router();
  const controller = makeOfferingsController(new OfferingsService(store, users));

  // Per-app limiter (created in the factory, not at module level) so each
  // app instance — including every test app — gets an isolated store.
  const offeringsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
    },
  });
  router.use(offeringsLimiter);
  router.use(requireAuth(users));

  router.get('/provider/offerings', controller.list);
  router.get('/provider/offerings/:id', controller.get);
  router.post('/provider/offerings', controller.create);
  router.patch('/provider/offerings/:id', controller.update);
  router.delete('/provider/offerings/:id', controller.remove);

  return router;
}