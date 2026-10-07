/**
 * Fixlynk Step 14 — provider service-area routes.
 *
 *   GET   /api/v1/provider/me/service-areas   the caller's published areas
 *   PATCH /api/v1/provider/me/service-areas   replace the caller's whole list
 *
 * `/provider/me/...` rather than `/provider/:id/...` on purpose: there is no id
 * in the path, so there is nothing for a client to tamper with. Ownership
 * comes from the session.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../../middleware/auth';
import type { MarketplaceStore } from '../marketplace/marketplace.store';
import type { UserRepository } from '../users/user.repository';
import { makeProviderAreasController } from './provider-areas.controller';
import { ProviderAreasService } from './provider-areas.service';
import type { AreaOwnerResolver } from './provider-areas.types';

export function makeProviderAreasRoutes(
  marketplace: MarketplaceStore,
  owners: AreaOwnerResolver,
  users: UserRepository,
): Router {
  const router = Router();
  const service = new ProviderAreasService(marketplace, owners, users);
  const controller = makeProviderAreasController(service);

  // Per-app limiter (created in the factory, not at module level) so each app
  // instance — including every test app — gets an isolated store. Writes are
  // limited harder than reads: publishing coverage triggers matching for open
  // requests, so it must not be something a script can hammer.
  const areasLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } },
  });
  router.use(areasLimiter);
  router.use(requireAuth(users));

  router.get('/provider/me/service-areas', controller.list);
  router.patch('/provider/me/service-areas', controller.replace);

  return router;
}