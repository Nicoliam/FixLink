/**
 * Fixlynk — operations alerts (platform signups and new job requests).
 *
 * A single, fixed inbox that tells the operator that something happened on
 * the platform: a new account registered, or a new job request was posted.
 * This is an internal operational signal, NOT a customer notification, and
 * the two are deliberately kept apart:
 *
 * - It does NOT go through the in-app notification system. That system
 *   persists a row per recipient user; `info@fixlynk.co.za` is not an account
 *   and must not be given one just to receive mail.
 * - It does NOT reuse `renderNotificationEmail`. That renderer is written for
 *   a professional and deliberately withholds contact details; here the
 *   contact details ARE the payload, because the whole point is for a human
 *   to know who got on the platform and what they asked for.
 *
 * Two rules this module enforces rather than trusting callers:
 *
 * 1. No credential ever appears in a message. Passwords, password hashes and
 *    tokens are not accepted by the input types at all, so no call site can
 *    leak one by passing the wrong object.
 * 2. Everything interpolated is escaped and header-safe. Job descriptions and
 *    locations are customer-supplied free text, and must not be able to inject
 *    markup into the HTML body or add a header via a newline in the subject.
 *
 * Delivery is best-effort and never throws: a broken mail relay must not stop
 * someone registering or posting a job.
 */
import { logError, logInfo } from '../utils/logger';
import type { Mailer, OutboundEmail } from './mailer';
import { escapeHtml } from './notification-email';

export type OpsAlertKind = 'REGISTRATION' | 'JOB_POSTED';

/** One label/value pair. Values are customer- or user-supplied free text. */
export interface OpsAlertDetail {
  label: string;
  value: string;
}

export interface OpsAlertInput {
  kind: OpsAlertKind;
  /** Rows rendered as a details table, in order. */
  details: readonly OpsAlertDetail[];
}

const MAX_SUBJECT = 150;
const MAX_LABEL = 60;
const MAX_VALUE = 2000;

const SUBJECTS: Record<OpsAlertKind, string> = {
  REGISTRATION: 'New Fixlynk registration',
  JOB_POSTED: 'New Fixlynk job request',
};

const INTRO: Record<OpsAlertKind, string> = {
  REGISTRATION: 'A new account was created on Fixlynk.',
  JOB_POSTED: 'A new job request was posted on Fixlynk.',
};

const CLOSING =
  'This is an automated platform alert sent to the Fixlynk operations inbox.';

/** Collapse to one line and bound the length, so it is safe in a header. */
function headerSafe(value: string, max: number): string {
  const single = value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return single.length > max ? `${single.slice(0, max - 1)}…` : single;
}

function normalise(input: OpsAlertInput): OpsAlertDetail[] {
  return input.details
    .map((detail) => ({
      label: headerSafe(detail.label, MAX_LABEL),
      value: detail.value.trim().slice(0, MAX_VALUE),
    }))
    .filter((detail) => detail.label !== '' && detail.value !== '');
}

/** Build the message. Exported so the content is testable without a mailer. */
export function renderOpsAlert(input: OpsAlertInput): { subject: string; text: string; html: string } {
  const rows = normalise(input);
  const reference = rows[0]?.value;
  const subject = headerSafe(
    reference ? `${SUBJECTS[input.kind]}: ${reference}` : SUBJECTS[input.kind],
    MAX_SUBJECT,
  );

  const textLines = [
    INTRO[input.kind],
    '',
    ...rows.map((row) => `${row.label}: ${row.value}`),
    ...(rows.length > 0 ? [''] : []),
    CLOSING,
  ];

  const detailRows = rows
    .map(
      (row) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#5b6472;font-size:14px;vertical-align:top;white-space:nowrap;">${escapeHtml(
          row.label,
        )}</td><td style="padding:4px 0;color:#1f2733;font-size:14px;white-space:pre-wrap;">${escapeHtml(
          row.value,
        )}</td></tr>`,
    )
    .join('');

  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;">',
    `<h1 style="font-size:20px;margin:0 0 12px;color:#1f2733;">${escapeHtml(SUBJECTS[input.kind])}</h1>`,
    `<p style="font-size:15px;line-height:1.5;margin:0 0 16px;color:#1f2733;">${escapeHtml(INTRO[input.kind])}</p>`,
    detailRows
      ? `<table role="presentation" style="border-collapse:collapse;margin:0 0 20px;">${detailRows}</table>`
      : '',
    `<p style="font-size:12px;line-height:1.5;color:#7b8494;margin:0;">${escapeHtml(CLOSING)}</p>`,
    '</div>',
  ].join('');

  return { subject, text: textLines.join('\n'), html };
}

export interface OpsAlertSender {
  /**
   * Send one alert. Resolves with whether a message was actually handed to
   * the transport; never rejects.
   */
  send(input: OpsAlertInput): Promise<boolean>;
}

/**
 * Builds the alert sender.
 *
 * Disabled (always resolves false, sends nothing) when no operations inbox is
 * configured or when the transport cannot deliver — the same log-only
 * behaviour a deployment without SMTP already gets elsewhere, so enabling these
 * alerts never turns into a stream of send failures.
 */
export function createOpsAlertSender(options: {
  mailer: Mailer | undefined;
  to: string | null;
}): OpsAlertSender {
  const { mailer, to } = options;

  return {
    async send(input: OpsAlertInput): Promise<boolean> {
      if (!mailer || !to || !mailer.delivers) return false;
      const rendered = renderOpsAlert(input);
      const message: OutboundEmail = {
        to,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      };
      try {
        await mailer.send(message);
        logInfo('ops_alert.sent', { kind: input.kind });
        return true;
      } catch (error) {
        // Error NAME only. The recipient address and the body both carry
        // personal data, so neither belongs in a log line.
        logError('ops_alert.failed', error, { kind: input.kind });
        return false;
      }
    },
  };
}
