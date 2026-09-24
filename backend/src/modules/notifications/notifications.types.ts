/**
 * FixLink Stage 8 — notification types.
 *
 * MVP delivery is IN-APP ONLY (no email/SMS/WhatsApp/push, no
 * WebSockets — the frontend polls the unread count modestly).
 * Every notification belongs to exactly one recipient user
 * (`user_id`), resolved server-side — the frontend never supplies
 * ownership. Messages carry only job/business display facts (service
 * name, reference, status); verification documents, private customer
 * contact details and admin-only information are never included.
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
