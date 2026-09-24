/**
 * FixLink Stage 8 — notification routes (in-app only).
 *
 * GET  /api/v1/notifications             list own notifications
 *                                         (?unreadOnly, ?page, ?pageSize)
 * GET  /api/v1/notifications/unread-count  unread badge count
 * POST /api/v1/notifications/:id/read    mark one owned notification read
 * POST /api/v1/notifications/read-all    mark all owned notifications read
 *
 * The recipient is always derived from the session — no user id is
 * read from the request. Foreign notification ids read as 404.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../../middleware/auth';
import type { UserRepository } from '../users/user.repository';
import { makeNotificationsController } from './notifications.controller';
import { NotificationService } from './notifications.service';
import type { NotificationStore } from './notifications.store';

export function makeNotificationsRoutes(users: UserRepository, store: NotificationStore): Router {
  const router = Router();
  const service = new NotificationService(store);
  const controller = makeNotificationsController(service);

  // Per-app limiter (created in the factory, not at module level) so each
  // app instance — including every test app — gets an isolated store.
  const notificationsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } },
  });
  router.use(notificationsLimiter);
  router.use(requireAuth(users));

  // Static paths before `:id` so `unread-count` and `read-all` are never
  // captured as notification ids.
  router.get('/notifications/unread-count', controller.unreadCount);
  router.post('/notifications/read-all', controller.markAllRead);
  router.get('/notifications', controller.list);
  router.post('/notifications/:id/read', controller.markRead);

  return router;
}
