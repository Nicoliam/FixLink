/**
 * FixLink notification models — Stage 8 (in-app only).
 *
 * The recipient is always the authenticated user (resolved server-side);
 * the frontend never sends ownership. Notifications referencing a job
 * navigate to a role-specific job detail screen (see
 * `notificationRouteFor`).
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

export type NotificationReferenceType = 'JOB' | 'INTERNAL_JOB' | 'PARTS_REQUEST';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  /** Job detail this notification opens (null only when not job-scoped). */
  relatedJobId: string | null;
  relatedEntityType: NotificationReferenceType | null;
  relatedEntityId: string | null;
  read: boolean;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationList {
  items: NotificationItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** Short human label for a notification type (badge/pill text). */export function notificationTypeLabel(type: NotificationType): string {
  switch (type) {
    case 'JOB_REQUEST':
      return 'Job request';
    case 'QUOTE_RECEIVED':
      return 'Quote received';
    case 'QUOTE_ACCEPTED':
      return 'Quote accepted';
    case 'JOB_SCHEDULED':
      return 'Scheduled';
    case 'JOB_STARTED':
      return 'Started';
    case 'JOB_COMPLETED':
      return 'Completed';
    case 'JOB_CONFIRMED':
      return 'Confirmed';
    case 'TECHNICIAN_ASSIGNED':
      return 'Assigned';
    case 'TECHNICIAN_REASSIGNED':
      return 'Reassigned';
    case 'JOB_UPDATE':
      return 'Update';
    case 'WORK_DOCUMENTED':
      return 'Documented';
    case 'PARTS_REQUESTED':
      return 'Parts requested';
    case 'PARTS_APPROVED':
      return 'Parts approved';
    case 'PARTS_REJECTED':
      return 'Parts rejected';
    case 'PARTS_MORE_INFO':
      return 'Parts info needed';
    case 'PARTS_AVAILABLE':
      return 'Parts available';
  }
}

/**
 * Role-specific destination for a notification (UX-only — the backend
 * enforces the real authorization). Internal business jobs never route
 * to customer screens and marketplace jobs never route to business
 * screens: the backend's `relatedEntityType` tag keeps them apart.
 */export function notificationRouteFor(item: NotificationItem, roles: string[]): string[] {
  if (!item.relatedJobId) return ['/'];
  if (roles.includes('CUSTOMER')) return ['/my-jobs', item.relatedJobId];
  if (roles.includes('TECHNICIAN')) return ['/technician/jobs', item.relatedJobId];
  if (item.relatedEntityType === 'INTERNAL_JOB') return ['/business/jobs', item.relatedJobId];
  if (
    roles.includes('PROFESSIONAL') ||
    roles.includes('BUSINESS_OWNER') ||
    roles.includes('BUSINESS_MANAGER')
  ) {
    return ['/requests', item.relatedJobId];
  }
  return ['/'];
}

/**
 * Compact relative timestamp for the inbox ("Just now", "5m ago",
 * "3h ago", "2d ago", older dates as a short date). The `nowMs`
 * parameter keeps the helper deterministic in tests.
 */
export function formatNotificationTime(iso: string, nowMs: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const minutes = Math.floor(Math.max(0, nowMs - then) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}
