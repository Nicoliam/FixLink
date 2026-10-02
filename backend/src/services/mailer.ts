/**
 * Fixlynk Stage 13 — outbound email transport.
 *
 * One narrow adapter so the rest of the backend never depends on a mail
 * library. It follows the same seam pattern as file storage
 * (`file-storage.ts`): a small contract, one production adapter and
 * explicit test/local adapters chosen by configuration, so a different
 * transport (or a transactional-email HTTP API) can replace SMTP without
 * touching feature code.
 *
 * Delivery rules that belong to the adapter, not the caller:
 * - `send` REJECTS on failure. The notification service decides what a
 *   failure means for the business operation (here: nothing — it records
 *   the failure and the in-app row stands).
 * - Message content is plain text plus optional HTML. The renderer
 *   escapes untrusted values; nothing here composes bodies.
 * - No secret ever appears in a log line or in a thrown message.
 */
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logError, logInfo } from '../utils/logger';

export interface OutboundEmail {
  /** Recipient address. Resolved server-side from the account record. */
  to: string;
  subject: string;
  text: string;
  /** Pre-escaped, table-based HTML. Omitted when there is no HTML part. */
  html?: string;
}

export interface Mailer {
  /** Resolves when the message was accepted for delivery; rejects otherwise. */
  send(message: OutboundEmail): Promise<void>;
  /** True when this adapter can actually deliver (false = log-only). */
  readonly delivers: boolean;
}

/**
 * Local/unconfigured adapter: renders the message to the application log
 * and sends nothing. This is what a developer with no SMTP relay and a
 * deployment that has not enabled mail get, so notification behaviour is
 * observable without a mail server.
 */
export class LogMailer implements Mailer {
  readonly delivers = false;

  async send(message: OutboundEmail): Promise<void> {
    // Only the subject is logged — never the recipient address (personal
    // data) and never the body (which carries customer-supplied text).
    // The caller logs which notification and which user this was for.
    logInfo('mail.logged', { path: message.subject });
  }
}

/** Test adapter: records what would have been sent, sends nothing. */
export class MemoryMailer implements Mailer {
  readonly delivers = true;
  readonly sent: OutboundEmail[] = [];
  /** Set by a test to make the next send reject, proving failure isolation. */
  failWith: Error | null = null;

  async send(message: OutboundEmail): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.sent.push({ ...message });
  }

  /** Test helper: the single message sent to an address. */
  sentTo(address: string): OutboundEmail | undefined {
    const needle = address.trim().toLowerCase();
    return this.sent.find((message) => message.to.trim().toLowerCase() === needle);
  }

  clear(): void {
    this.sent.length = 0;
  }
}

/**
 * Production SMTP adapter.
 *
 * The transport is created once and reused so connections are pooled
 * rather than re-negotiated per notification. `disableFileAccess` and
 * `disableUrlAccess` stay on: a notification email only ever contains
 * text this backend rendered, and neither option should ever be able to
 * fetch a local path or a remote URL on our behalf.
 */
export class SmtpMailer implements Mailer {
  readonly delivers = true;
  private readonly transporter: Transporter;

  constructor(
    options: {
      host: string;
      port: number;
      secure: boolean;
      user: string | null;
      password: string | null;
    },
    private readonly from: { address: string; name: string },
  ) {
    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      auth: options.user ? { user: options.user, pass: options.password ?? '' } : undefined,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }

  async send(message: OutboundEmail): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: { name: this.from.name, address: this.from.address },
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    } catch (error) {
      // Rethrow so the caller records the failure; the log carries the
      // error NAME only, never the SMTP conversation, the recipient
      // address or the credentials.
      logError('mail.send_failed', error, {});
      throw error instanceof Error ? error : new Error('Email delivery failed.');
    }
  }
}

/**
 * Choose the transport from configuration. Email is opt-in: without
 * `MAIL_ENABLED=true` (and a host) nothing is sent and messages are
 * logged instead.
 */
export function resolveMailer(): Mailer {
  if (!env.mail.enabled || env.mail.host === null) return new LogMailer();
  return new SmtpMailer(
    {
      host: env.mail.host,
      port: env.mail.port,
      secure: env.mail.secure,
      user: env.mail.user,
      password: env.mail.password,
    },
    { address: env.mail.from, name: env.mail.fromName },
  );
}
