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

  const registrationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many registration attempts. Please try again later.' } },
  });
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Please try again later.' } },
  });
  const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many refresh attempts. Please try again later.' } },
  });

  router.post('/register', registrationLimiter, controller.register);
  router.post('/login', loginLimiter, controller.login);
  router.post('/refresh', refreshLimiter, controller.refresh);
  // Logout works with a refresh token in the body, an access token, or both.
  router.post('/logout', optionalAuth(users), controller.logout);
  router.get('/me', requireAuth(users), controller.me);

  return router;
}
