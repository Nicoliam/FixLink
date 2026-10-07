/**
 * Fixlynk — customer saved professional routes.
 *
 * GET    /api/v1/customer/saved-providers           the caller's saved list
 * GET    /api/v1/customer/saved-providers/:id       whether one is saved
 * POST   /api/v1/customer/saved-providers           bookmark a professional
 * DELETE /api/v1/customer/saved-providers/:id       remove a bookmark
 *
 * The `/customer` prefix marks these as customer-owned data and keeps them
 * clear of the public `GET /api/v1/providers/:id` marketplace route and of
 * the provider-owned `/provider/*` routes.
 *
 * Requires an authenticated CUSTOMER. The service refuses every other role
 * with a 403, because a bookmark is part of the customer journey.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../../middleware/auth';
import type { UserRepository } from '../users/user.repository';
import type { MarketplaceStore } from '../marketplace/marketplace.store';
import type { SavedProvidersStore } from './saved-providers.store';
import { makeSavedProvidersController } from './saved-providers.controller';
import { SavedProvidersService } from './saved-providers.service';

export function makeSavedProvidersRoutes(
  users: UserRepository,
  store: SavedProvidersStore,
  marketplace: MarketplaceStore,
): Router {
  const router = Router();
  const controller = makeSavedProvidersController(new SavedProvidersService(store, marketplace, users));

  // Per-app limiter (created in the factory, not at module level) so each
  // app instance — including every test app — gets an isolated store.
  const savedProvidersLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
    },
  });
  router.use(savedProvidersLimiter);
  router.use(requireAuth(users));

  router.get('/customer/saved-providers', controller.list);
  router.get('/customer/saved-providers/:providerId', controller.getState);
  router.post('/customer/saved-providers', controller.save);
  router.delete('/customer/saved-providers/:providerId', controller.remove);

  return router;
}
