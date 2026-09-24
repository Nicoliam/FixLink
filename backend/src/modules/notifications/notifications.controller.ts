/**
 * FixLink Stage 8 — authenticated notification controllers.
 *
 * Authentication is enforced by `requireAuth`; the recipient is always
 * the session user id inside the service — the request never carries
 * ownership, and notification ids from other accounts read as 404.
 */
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../../middleware/auth';
import { fail, ok, type ErrorCode } from '../../utils/response';
import type { NotificationService, ServiceResult } from './notifications.service';

const ERROR_CODES: readonly ErrorCode[] = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'FORBIDDEN_ROLE',
  'UNAUTHORIZED',
  'INTERNAL_ERROR',
];

function send<T>(res: Response, result: ServiceResult<T>, successMessage: string): void {
  if (result.data !== undefined) {
    ok(res, result.data, successMessage, result.status);
    return;
  }
  const code: ErrorCode = ERROR_CODES.includes(result.code as ErrorCode)
    ? (result.code as ErrorCode)
    : 'VALIDATION_ERROR';
  fail(res, code, result.message ?? 'Request failed.', result.status);
}

function authUser(req: Request): AuthenticatedUser {
  return (req as Request & { user: AuthenticatedUser }).user;
}

export function makeNotificationsController(service: NotificationService) {
  return {
    async list(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const result = await service.listForUser(user.id, req.query as Record<string, unknown>);
        send(res, result, 'Notifications retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve notifications. Please try again.', 500);
      }
    },

    async unreadCount(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const result = await service.getUnreadCount(user.id);
        send(res, result, 'Unread count retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve the unread count. Please try again.', 500);
      }
    },

    async markRead(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const result = await service.markRead(user.id, req.params['id'] ?? '');
        send(res, result, 'Notification marked as read.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not mark the notification as read. Please try again.', 500);
      }
    },

    async markAllRead(req: Request, res: Response): Promise<void> {
      try {
        const user = authUser(req);
        const result = await service.markAllRead(user.id);
        send(res, result, 'All notifications marked as read.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not mark notifications as read. Please try again.', 500);
      }
    },
  };
}
