/**
 * Fixlynk Stage 13 — notification email rendering.
 *
 * Turns one persisted notification into a message a provider can act on
 * from their inbox: what happened, the job details, and one link to the
 * exact screen for their role. Kept separate from the transport
 * (`mailer.ts`) so the content can be reviewed and tested without a mail
 * server, and so a different channel can reuse the same content.
 *
 * Two rules are enforced here rather than trusted to callers:
 *
 * 1. Everything interpolated is escaped. Notification messages and job
 *    descriptions contain customer-supplied text, and a customer must not
 *    be able to inject markup into a provider's email (or a header).
 *    Headers additionally reject CR/LF so a crafted field cannot add
 *    headers.
 * 2. Customer contact details are never rendered. The email gives the
 *    provider the job and a link; the reply happens on the platform, which
 *    is what keeps the conversation, the audit trail and customer privacy
 *    intact. The closing note tells the provider this explicitly.
 */
import type { NotificationDto, NotificationEmailDetail } from '../modules/notifications/notifications.types';

/** Roles that receive notification email. Customers are never emailed. */
export const EMAIL_RECIPIENT_ROLES: readonly string[] = [
  'PROFESSIONAL',
  'BUSINESS_OWNER',
  'BUSINESS_MANAGER',
  'TECHNICIAN',
];

/** Re-exported so callers can describe a details block without importing two modules. */
export type EmailDetail = NotificationEmailDetail;

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface RenderNotificationEmailInput {
  notification: NotificationDto;
  /** Recipient's authoritative roles (server-side). */
  roles: readonly string[];
  /** Public base URL of the Angular app. */
  webBaseUrl: string;
  /** Optional details block supplied by the emitting service. */
  details?: readonly EmailDetail[];
}

const MAX_SUBJECT = 150;
const MAX_DETAIL_VALUE = 600;

export function isEmailRecipient(roles: readonly string[]): boolean {
  return roles.some((role) => EMAIL_RECIPIENT_ROLES.includes(role));
}

/** Collapse to a single line and bound the length: safe for a mail header. */
function headerSafe(value: string, max: number): string {
  // eslint-disable-next-line no-control-regex -- stripping CR/LF is the point.
  const single = value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return single.length > max ? `${single.slice(0, max - 1)}…` : single;
}

/** Escape text for interpolation into the HTML body. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Deep link to the screen that answers this notification for this
 * recipient. Mirrors the frontend's `notificationRouteFor`
 * (`apps/web/src/app/core/models/notification.model.ts`) so the email and
 * the in-app inbox always land on the same place.
 *
 * Returns null when the notification has no job to open — an email
 * without a call to action is just a notification the provider must log
 * into the app to read, which is the gap this channel exists to close.
 */
export function notificationDeepLink(
  notification: NotificationDto,
  roles: readonly string[],
  webBaseUrl: string,
): string | null {
  const jobId = notification.relatedJobId;
  if (!jobId || !/^[1-9][0-9]*$/.test(jobId)) return null;
  const base = webBaseUrl.replace(/\/+$/, '');
  if (roles.includes('TECHNICIAN')) return `${base}/technician/jobs/${jobId}`;
  if (roles.includes('CUSTOMER')) return `${base}/my-jobs/${jobId}`;
  if (notification.relatedEntityType === 'INTERNAL_JOB') return `${base}/business/jobs/${jobId}`;
  return `${base}/requests/${jobId}`;
}

const CLOSING_NOTE =
  'Customer contact details are not included in this email. Sign in to Fixlynk to reply with a quote or a question — everything stays on the platform.';

export function renderNotificationEmail(input: RenderNotificationEmailInput): RenderedEmail | null {
  const { notification, roles, webBaseUrl, details } = input;
  const actionUrl = notificationDeepLink(notification, roles, webBaseUrl);
  if (!actionUrl) return null;

  const subject = headerSafe(`Fixlynk: ${notification.title}`, MAX_SUBJECT);
  const rows = (details ?? [])
    .map((detail) => ({
      label: headerSafe(detail.label, 60),
      value: detail.value.trim().slice(0, MAX_DETAIL_VALUE),
    }))
    .filter((detail) => detail.label !== '' && detail.value !== '');

  const textLines = [
    notification.title,
    '',
    ...(notification.message ? [notification.message, ''] : []),
    ...rows.map((row) => `${row.label}: ${row.value}`),
    ...(rows.length > 0 ? [''] : []),
    `View and reply on Fixlynk: ${actionUrl}`,
    '',
    CLOSING_NOTE,
    'You are receiving this because you offer services on Fixlynk. This is an operational notification, not marketing.',
  ];

  const detailRows = rows
    .map(
      (row) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#5b6472;font-size:14px;vertical-align:top;white-space:nowrap;">${escapeHtml(
          row.label,
        )}</td><td style="padding:4px 0;color:#1f2733;font-size:14px;">${escapeHtml(row.value)}</td></tr>`,
    )
    .join('');

  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;">',
    `<h1 style="font-size:20px;margin:0 0 12px;color:#1f2733;">${escapeHtml(notification.title)}</h1>`,
    notification.message
      ? `<p style="font-size:15px;line-height:1.5;margin:0 0 16px;color:#1f2733;">${escapeHtml(notification.message)}</p>`
      : '',
    detailRows ? `<table role="presentation" style="border-collapse:collapse;margin:0 0 20px;">${detailRows}</table>` : '',
    `<p style="margin:0 0 20px;"><a href="${escapeHtml(actionUrl)}" style="background:#1f6f5c;color:#ffffff;padding:11px 18px;border-radius:6px;text-decoration:none;font-size:15px;display:inline-block;">View and reply on Fixlynk</a></p>`,
    `<p style="font-size:13px;line-height:1.5;color:#5b6472;margin:0 0 8px;">${escapeHtml(CLOSING_NOTE)}</p>`,
    `<p style="font-size:12px;line-height:1.5;color:#7b8494;margin:0;">You are receiving this because you offer services on Fixlynk. This is an operational notification, not marketing.</p>`,
    '</div>',
  ].join('');

  return { subject, text: textLines.join('\n'), html };
}
