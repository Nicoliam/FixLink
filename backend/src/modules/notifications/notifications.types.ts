/**
 * Fixlynk Stage 8 — notification types.
 *
 * MVP delivery is IN-APP (the frontend polls the unread count modestly).
 * Stage 13 adds an email channel for provider-side recipients on top of
 * the same rows — see `docs/NOTIFICATIONS.md`; customers are not emailed.
 * No SMS/WhatsApp/push and no WebSockets.
 * Every notification belongs to exactly one recipient user
 * (`user_id`), resolved server-side — the frontend never supplies
 * ownership. Messages carry only job/business display facts (service
 * name, reference, status); verification documents, private customer
 * contact details and admin-only information are never included — this
 * includes the Stage 13 email body, which links back into the app
 * instead of exposing a way to contact the customer off-platform.
 *
 * Reference vocabulary (existing `notifications.reference_type` /
 * `reference_id` columns — no schema change):
 * - 'JOB' — a MARKETPLACE job; reference_id is the `jobs` row id.
 * - 'INTERNAL_JOB' — an INTERNAL business job; reference_id is the
 *   `jobs` row id. A distinct tag (rather than a second table or a
 *   status-derived guess) so role-specific navigation is exact:
 *   customers/providers open marketplace detail, business roles open
 *   business detail, technicians open technician detail.
 * - 'PARTS_REQUEST' — reserved for future request-level deep links;
 *   Stage 8 keeps parts notifications job-navigable (INTERNAL_JOB
 *   reference, the request id is named in the message) so every
 *   notification resolves to exactly one job detail screen with no
 *   read-time joins and identical behaviour on both stores.
 */

export type NotificationType =
  | 'JOB_REQUEST'
  /**
   * Step 14 — an OPEN request (posted without a chosen professional) matches
   * this provider's categories and service areas. Distinct from JOB_REQUEST,
   * which means "this request was addressed to you": the recipient has not
   * been chosen and is one of several who may quote.
   */
  | 'JOB_REQUEST_OPEN'
  /**
   * Step 15 - the customer cancelled or deleted a request this provider was
   * relying on. Distinct from a generic update because the meaning is
   * unambiguous: the work is not happening.
   */
  | 'JOB_CANCELLED'
  | 'QUOTE_RECEIVED'
  | 'QUOTE_ACCEPTED'
  | 'JOB_SCHEDULED'
  | 'JOB_STARTED'
  | 'JOB_COMPLETED'
  | 'JOB_CONFIRMED'
  | 'TECHNICIAN_ASSIGNED'
  | 'TECHNICIAN_REASSIGNED'
  | 'JOB_UPDATE'
  | 'WORK_DOCUMENTED'
  | 'PARTS_REQUESTED'
  | 'PARTS_APPROVED'
  | 'PARTS_REJECTED'
  | 'PARTS_MORE_INFO'
  | 'PARTS_AVAILABLE';

/** Reference tags stored in `notifications.reference_type`. */
export type NotificationReferenceType = 'JOB' | 'INTERNAL_JOB' | 'PARTS_REQUEST';

export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  'JOB_REQUEST',
  'JOB_REQUEST_OPEN',
  'JOB_CANCELLED',
  'QUOTE_RECEIVED',
  'QUOTE_ACCEPTED',
  'JOB_SCHEDULED',
  'JOB_STARTED',
  'JOB_COMPLETED',
  'JOB_CONFIRMED',
  'TECHNICIAN_ASSIGNED',
  'TECHNICIAN_REASSIGNED',
  'JOB_UPDATE',
  'WORK_DOCUMENTED',
  'PARTS_REQUESTED',
  'PARTS_APPROVED',
  'PARTS_REJECTED',
  'PARTS_MORE_INFO',
  'PARTS_AVAILABLE',
] as const;

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export function isNotificationReferenceType(value: unknown): value is NotificationReferenceType {
  return value === 'JOB' || value === 'INTERNAL_JOB' || value === 'PARTS_REQUEST';
}

/** Public projection — the only notification shape the API returns. */
export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  /** Job this notification navigates to (all Stage 8 events are job-scoped). */
  relatedJobId: string | null;
  relatedEntityType: NotificationReferenceType | null;
  relatedEntityId: string | null;
  read: boolean;
  createdAt: string;
  readAt: string | null;
}

/** Server-side creation input — the recipient is always a user id. */
export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string | null;
  referenceType: NotificationReferenceType | null;
  referenceId: string | null;
}

/**
 * Stage 13 — one label/value pair in the email body. Supplied by the
 * emitting service so a provider can judge a job request from the email
 * itself. Values are untrusted (a job description is customer text), so
 * the renderer escapes and truncates them; nothing here is persisted.
 */
export interface NotificationEmailDetail {
  label: string;
  value: string;
}

/** Creation input accepted by the notification service (adds the email channel). */
export interface NotificationRequest extends CreateNotificationInput {
  email?: {
    details: NotificationEmailDetail[];
  };
}

/**
 * Stage 13 — recorded outcome of the email channel for one notification
 * row (migration 014). `SKIPPED` is a deliberate non-delivery (recipient
 * not deliverable, or the notification has no addressable screen), which
 * is deliberately distinct from `FAILED`.
 */
export type EmailDeliveryStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';

export interface EmailDeliveryResult {
  status: EmailDeliveryStatus;
  /** Non-sensitive failure reason; truncated before it is stored. */
  error?: string | null;
}
