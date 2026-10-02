/**
 * Fixlynk Stage 8 — notifications data-access contract.
 *
 * The MySQL implementation serves production (the `notifications`
 * table from migration 008); the memory implementation serves
 * automated tests with the same recipient-isolation rules.
 * Recipient resolution (provider → user ids, customer → user id,
 * business → owner/manager ids) lives in the calling services —
 * this store only persists rows for explicit user ids.
 */
import type {
  CreateNotificationInput,
  EmailDeliveryResult,
  NotificationDto,
} from './notifications.types';

export interface NotificationListFilter {
  userId: string;
  unreadOnly: boolean;
  page: number;
  pageSize: number;
}

export interface NotificationStore {
  create(input: CreateNotificationInput): Promise<NotificationDto>;
  listForUser(filter: NotificationListFilter): Promise<{ items: NotificationDto[]; total: number }>;
  countUnread(userId: string): Promise<number>;
  /** One owned notification, or null when unknown (or owned by another user). */
  getById(userId: string, notificationId: string): Promise<NotificationDto | null>;
  /** Mark one owned notification read; null when unknown (or foreign). */
  markRead(userId: string, notificationId: string): Promise<NotificationDto | null>;
  /** Mark every unread owned notification read; resolves with the count marked. */
  markAllRead(userId: string): Promise<number>;
  /**
   * Stage 13 — record the email channel outcome for one notification row.
   *
   * Delivery metadata only: it never changes the notification's read state,
   * content or recipient, and it is not part of the API projection. A
   * failure here must not affect the notification itself, so callers treat
   * it as best-effort.
   */
  markEmailDelivery(notificationId: string, result: EmailDeliveryResult): Promise<void>;
}
