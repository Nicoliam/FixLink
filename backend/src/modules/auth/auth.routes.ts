import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { UserRepository } from '../users/user.repository';
import { AuthService } from './auth.service';
import { makeAuthController } from './auth.controller';
import { optionalAuth, requireAuth } from '../../middleware/auth';
import type { RefreshStore } from './refresh.store';

export function makeAuthRoutes(users: UserRepository, refreshStore: RefreshStore): Router {
  const router = Router();
  const service = new AuthService(users, refreshStore);
  const controller = makeAuthController(service);

  // Per-app limiter (created in the factory, not at module level) so each
  // app instance — including every test app — gets an isolated store.
  // Production runs one app per process, so runtime behaviour is unchanged.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } },
  });
  router.use(authLimiter);

  router.post('/register', controller.register);
  router.post('/login', controller.login);
  router.post('/refresh', controller.refresh);
  // Logout works with a refresh token in the body, an access token, or both.
  router.post('/logout', optionalAuth(users), controller.logout);
  router.get('/me', requireAuth(users), controller.me);

  return router;
}
