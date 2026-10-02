/**
 * Fixlynk Stage 8 — central notification service.
 * Stage 13 — adds the email delivery channel.
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
 * Email rides on the same rows rather than running as a parallel
 * system: the in-app notification is always written first, then — for
 * provider-side recipients only — the same event is emailed with a deep
 * link back into the app. That ordering is deliberate. Email is the
 * channel that reaches a provider who is not signed in, but it must
 * never become the record of what happened, because a relay failure
 * must not be able to hide a job request.
 *
 * Controllers never touch notification persistence directly — they go
 * through this service, and listing/count/read entry points scope
 * every operation to the authenticated recipient (`userId` only).
 */
import type { Mailer } from '../../services/mailer';
import {
  isEmailRecipient,
  renderNotificationEmail,
  type EmailDetail,
} from '../../services/notification-email';
import type { UserRepository } from '../users/user.repository';
import { logError, logInfo } from '../../utils/logger';
import type { NotificationStore } from './notifications.store';
import type {
  EmailDeliveryStatus,
  NotificationDto,
  NotificationReferenceType,
  NotificationRequest,
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
  constructor(
    private readonly notifications: NotificationStore,
    /**
     * Stage 13 — recipient lookup for the email channel. Optional so
     * pre-13 constructions (and the notifications router) keep compiling:
     * without it the service is in-app only, exactly as in Stage 8.
     */
    private readonly users?: UserRepository,
    /**
     * Stage 13 — email transport. A mailer that cannot deliver (mail
     * disabled) reports `delivers: false` and no attempt is recorded, so
     * an unconfigured deployment leaves the tracking columns NULL.
     */
    private readonly mailer?: Mailer,
    /** Stage 13 — public base URL of the web app, for email deep links. */
    private readonly webBaseUrl: string = 'http://localhost:4200',
  ) {}

  /**
   * Persist one notification. Validation failures resolve to null
   * (callers treat delivery as best-effort); storage errors throw so
   * the caller can decide — feature services always catch and keep
   * the core operation green.
   *
   * The email channel runs after the row exists and never throws: a
   * recipient lookup, render or transport failure is recorded and
   * swallowed here, because the in-app row is the notification of record.
   */
  async create(input: NotificationRequest): Promise<NotificationDto | null> {
    if (!isNotificationType(input.type)) return null;
    const title = input.title.trim();
    if (!title || title.length > 255) return null;
    if (!/^[1-9][0-9]*$/.test(input.userId.trim())) return null;
    if (input.referenceId !== null && !/^[1-9][0-9]*$/.test(input.referenceId.trim())) return null;
    const message = input.message === null ? null : input.message.slice(0, 2000);
    const userId = input.userId.trim();
    const row = await this.notifications.create({
      userId,
      type: input.type,
      title: title.slice(0, 255),
      message,
      referenceType: input.referenceType,
      referenceId: input.referenceId === null ? null : input.referenceId.trim(),
    });
    await this.deliverEmail(row, userId, input.email?.details ?? []);
    return row;
  }

  /** Persist the same event for several recipients (deduped, actor-safe). */
  async createForUsers(
    userIds: string[],
    input: Omit<NotificationRequest, 'userId'>,
  ): Promise<NotificationDto[]> {
    const recipients = [...new Set(userIds.map((id) => id.trim()).filter((id) => /^[1-9][0-9]*$/.test(id)))];
    const created: NotificationDto[] = [];
    for (const userId of recipients) {
      const row = await this.create({ ...input, userId });
      if (row) created.push(row);
    }
    return created;
  }

  /**
   * Stage 13 — deliver one notification by email, best-effort.
   *
   * Eligibility is decided here from the recipient's OWN account, never
   * from the event: only an ACTIVE provider-side account
   * (professional / business owner / business manager / technician) with
   * an email address is emailed. A customer recipient is not emailed and
   * records nothing — the channel does not apply to them, which is
   * different from an attempt that failed.
   */
  private async deliverEmail(
    notification: NotificationDto,
    userId: string,
    details: readonly EmailDetail[],
  ): Promise<void> {
    if (!this.mailer || !this.users || !this.mailer.delivers) return;
    try {
      // Role first: most notifications are addressed to a customer, and one
      // lookup is enough to prove the channel does not apply to them.
      const roles = await this.users.getRoles(userId);
      if (!isEmailRecipient(roles)) return;
      const user = await this.users.findById(userId);
      if (!user) return;
      if (user.status !== 'ACTIVE' || user.email.trim() === '') {
        await this.recordEmail(notification.id, 'SKIPPED', 'Recipient account is not deliverable.');
        return;
      }
      const rendered = renderNotificationEmail({
        notification,
        roles,
        webBaseUrl: this.webBaseUrl,
        details,
      });
      if (!rendered) {
        await this.recordEmail(notification.id, 'SKIPPED', 'No screen to link to for this recipient.');
        return;
      }
      await this.recordEmail(notification.id, 'PENDING', null);
      try {
        await this.mailer.send({
          to: user.email,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
        });
        await this.recordEmail(notification.id, 'SENT', null);
      } catch (error) {
        // Error NAME only: an SMTP failure must never copy a relay
        // response, a credential or customer text into the row or a log.
        const name = error instanceof Error ? error.name : 'Error';
        logError('notification.email_failed', error, { notificationId: notification.id, userId });
        await this.recordEmail(notification.id, 'FAILED', name);
      }
    } catch (error) {
      // Recipient lookup or rendering failed before an attempt was made.
      // The in-app row stands and no delivery status is claimed.
      logError('notification.email_error', error, { notificationId: notification.id, userId });
    }
  }

  /** Best-effort delivery-metadata write; never throws into the caller. */
  private async recordEmail(
    notificationId: string,
    status: EmailDeliveryStatus,
    error: string | null,
  ): Promise<void> {
    try {
      await this.notifications.markEmailDelivery(notificationId, { status, error });
      logInfo('notification.email', { notificationId, status });
    } catch (writeError) {
      logError('notification.email_record_failed', writeError, { notificationId, status });
    }
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
