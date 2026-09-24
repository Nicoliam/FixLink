/**
 * FixLink Stage 8 — central notification service.
 *
 * The single owner of notification persistence. Feature services
 * (jobs, quotes, execution, business) resolve recipients server-side
 * from their own stores and call `create` / `createForUsers` AFTER
 * the core state change has committed, wrapped so a notification
 * failure can never leave the business operation inconsistent (the
 * caller catches — delivery is best-effort, the job/quote/assignment
 * outcome stands). No queues, no event bus, no microservices: direct
 * store writes in the same modular monolith.
 *
 * Controllers never touch notification persistence directly — they go
 * through this service, and listing/count/read entry points scope
 * every operation to the authenticated recipient (`userId` only).
 */
import type { NotificationStore } from './notifications.store';
import type {
  CreateNotificationInput,
  NotificationDto,
  NotificationReferenceType,
  NotificationType,
} from './notifications.types';
import { isNotificationType } from './notifications.types';

export interface ServiceResult<T> {
  status: number;
  code?: string;
  message?: string;
  data?: T;
}

function fail<T>(status: number, code: string, message: string): ServiceResult<T> {
  return { status, code, message };
}

function readPage(value: unknown, fallback: number, max: number): number | null {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const num = Number(String(value).trim());
  if (!Number.isInteger(num) || num < 1 || num > max) return null;
  return num;
}

function readUnreadOnly(value: unknown): boolean | null {
  if (value === undefined || value === null || String(value).trim() === '') return false;
  const normalised = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalised)) return true;
  if (['false', '0', 'no'].includes(normalised)) return false;
  return null;
}

export function validNotificationId(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value.trim());
}

export class NotificationService {
  constructor(private readonly notifications: NotificationStore) {}

  /**
   * Persist one notification. Validation failures resolve to null
   * (callers treat delivery as best-effort); storage errors throw so
   * the caller can decide — feature services always catch and keep
   * the core operation green.
   */
  async create(input: CreateNotificationInput): Promise<NotificationDto | null> {
    if (!isNotificationType(input.type)) return null;
    const title = input.title.trim();
    if (!title || title.length > 255) return null;
    if (!/^[1-9][0-9]*$/.test(input.userId.trim())) return null;
    if (input.referenceId !== null && !/^[1-9][0-9]*$/.test(input.referenceId.trim())) return null;
    const message = input.message === null ? null : input.message.slice(0, 2000);
    return this.notifications.create({
      userId: input.userId.trim(),
      type: input.type,
      title: title.slice(0, 255),
      message,
      referenceType: input.referenceType,
      referenceId: input.referenceId === null ? null : input.referenceId.trim(),
    });
  }

  /** Persist the same event for several recipients (deduped, actor-safe). */
  async createForUsers(
    userIds: string[],
    input: Omit<CreateNotificationInput, 'userId'>,
  ): Promise<NotificationDto[]> {
    const recipients = [...new Set(userIds.map((id) => id.trim()).filter((id) => /^[1-9][0-9]*$/.test(id)))];
    const created: NotificationDto[] = [];
    for (const userId of recipients) {
      const row = await this.create({ ...input, userId });
      if (row) created.push(row);
    }
    return created;
  }

  async listForUser(
    authUserId: string,
    query: Record<string, unknown>,
  ): Promise<ServiceResult<{ items: NotificationDto[]; total: number; page: number; pageSize: number }>> {
    const page = readPage(query['page'], 1, 1000);
    const pageSize = readPage(query['pageSize'] ?? query['page_size'], 20, 50);
    const unreadOnly = readUnreadOnly(query['unreadOnly'] ?? query['unread_only']);
    if (page === null || pageSize === null || unreadOnly === null) {
      return fail(
        422,
        'VALIDATION_ERROR',
        'Invalid pagination or filter. Use page 1–1000, pageSize 1–50, unreadOnly true/false.',
      );
    }
    const result = await this.notifications.listForUser({ userId: authUserId, unreadOnly, page, pageSize });
    return { status: 200, data: { ...result, page, pageSize } };
  }

  async getUnreadCount(authUserId: string): Promise<ServiceResult<{ unreadCount: number }>> {
    const unreadCount = await this.notifications.countUnread(authUserId);
    return { status: 200, data: { unreadCount } };
  }

  async markRead(authUserId: string, notificationId: string): Promise<ServiceResult<NotificationDto>> {
    if (!validNotificationId(notificationId)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid notification id.');
    }
    const row = await this.notifications.markRead(authUserId, notificationId.trim());
    // Ownership is part of existence: another user's notification reads
    // as 404 so ids cannot be probed across accounts.
    if (!row) return fail(404, 'NOT_FOUND', 'Notification not found.');
    return { status: 200, data: row };
  }

  async markAllRead(authUserId: string): Promise<ServiceResult<{ markedRead: number }>> {
    const markedRead = await this.notifications.markAllRead(authUserId);
    return { status: 200, data: { markedRead } };
  }
}

/** Recipient + reference context every feature service resolves server-side. */
export interface NotificationEvent {
  type: NotificationType;
  title: string;
  message: string | null;
  referenceType: NotificationReferenceType | null;
  referenceId: string | null;
}
