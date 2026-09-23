/**
 * FixLink Stage 6A — public marketplace routes.
 *
 * Catalogue and provider discovery are public (no auth): customers browse
 * the marketplace before registering. Rate-limited like the auth routes.
 * Route shapes follow docs/API.md §6–7 (`/services`, `/categories`,
 * `/providers`).
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { MarketplaceStore } from './marketplace.store';
import { makeServicesController } from './services.controller';
import { makeProvidersController } from './providers.controller';

export function makeMarketplaceRoutes(store: MarketplaceStore): Router {
  const router = Router();
  const services = makeServicesController(store);
  const providers = makeProvidersController(store);

  // Per-app limiter (created in the factory, not at module level) so each
  // app instance — including every test app — gets an isolated store.
  const marketplaceLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } },
  });
  router.use(marketplaceLimiter);

  router.get('/services', services.listServices);
  // Compatibility alias: the stage brief suggests /services/categories.
  // The documented canonical route is /categories — both are served.
  router.get('/services/categories', services.listCategories);
  router.get('/services/:id', services.getService);

  router.get('/categories', services.listCategories);
  router.get('/categories/:id', services.getCategory);

  router.get('/providers', providers.search);
  router.get('/providers/:id', providers.getById);
  router.get('/providers/:id/portfolio', providers.getPortfolio);
  router.get('/providers/:id/certificates', providers.getCertificates);
  router.get('/providers/:id/reviews', providers.getReviews);

  return router;
}
