import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function numberOr(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid numeric environment variable: ${name}=${raw}`);
  }
  return Math.floor(parsed);
}

const productionEnvironments = new Set(['production', 'prod']);
const devDefaultCorsOrigins = ['http://localhost:4200', 'http://127.0.0.1:4200'];

/**
 * Stage 13 — provider notification email.
 *
 * Email is OFF unless `MAIL_ENABLED=true`, so an unconfigured deployment
 * behaves exactly as it did before: notifications are in-app only and
 * the rendered message is written to the log. Enabling mail without a
 * host is a deployment mistake that would silently drop every provider
 * email, so it fails fast here instead of at the first send.
 */
function mailEnabled(): boolean {
  const raw = process.env['MAIL_ENABLED'];
  if (raw === undefined || raw.trim() === '') return false;
  const normalised = raw.trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalised)) return true;
  if (['false', '0', 'no'].includes(normalised)) return false;
  throw new Error(`Invalid MAIL_ENABLED: "${raw}". Use true or false.`);
}

/** Resolved SMTP settings. Enabling mail without a host fails fast. */
function mailConfig(): {
  enabled: boolean;
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
  from: string;
  fromName: string;
} {
  const enabled = mailEnabled();
  const host = (process.env['MAIL_HOST'] ?? '').trim() || null;
  if (enabled && host === null) {
    throw new Error('MAIL_ENABLED=true requires MAIL_HOST. Set an SMTP host or disable mail explicitly.');
  }
  return {
    enabled,
    host,
    port: numberOr('MAIL_PORT', 587),
    secure: (process.env['MAIL_SECURE'] ?? '').trim().toLowerCase() === 'true',
    user: (process.env['MAIL_USER'] ?? '').trim() || null,
    password: process.env['MAIL_PASSWORD'] ?? null,
    from: mailSender(),
    fromName: (process.env['MAIL_FROM_NAME'] ?? '').trim() || 'Fixlynk',
  };
}

function mailSender(): string {
  const value = (process.env['MAIL_FROM'] ?? '').trim() || 'no-reply@fixlynk.local';
  // Nodemailer would accept a header-breaking value; reject anything that
  // is not a single plain address before it can reach a mail header.
  if (!/^[^\s@<>",]+@[^\s@<>",]+$/.test(value)) {
    throw new Error(`Invalid MAIL_FROM: "${value}". Use a single email address.`);
  }
  return value;
}

/**
 * Operations inbox for platform-signup and new-job alerts.
 *
 * Configurable rather than hard-coded: the recipient is an operational
 * decision per deployment, and baking an address into the source would make
 * staging and production mail the same place. Unset (the default) disables
 * these alerts entirely, so no deployment starts sending them by accident.
 */
function opsAlertEmail(): string | null {
  const value = (process.env['OPS_ALERT_EMAIL'] ?? '').trim();
  if (value === '') return null;
  if (!/^[^\s@<>",]+@[^\s@<>",]+$/.test(value)) {
    throw new Error(`Invalid OPS_ALERT_EMAIL: "${value}". Use a single email address.`);
  }
  return value;
}

/**
 * Public base URL of the Angular app. Notification emails link back into
 * the authenticated app, so the link is only correct when this matches the
 * deployed web origin.
 */
function webBaseUrl(): string {
  const raw = (process.env['WEB_BASE_URL'] ?? '').trim() || 'http://localhost:4200';
  if (!/^https?:\/\/[^\s/]+/.test(raw)) {
    throw new Error(`Invalid WEB_BASE_URL: "${raw}". Use an absolute http(s) URL such as https://app.example.co.za.`);
  }
  return raw.replace(/\/+$/, '');
}

/**
 * CORS_ORIGIN accepts a comma-separated allowlist so a single API process can
 * serve more than one exact origin (e.g. `localhost` and `127.0.0.1`, which are
 * distinct origins to a browser). A mismatched allowlist is rejected outright
 * rather than silently echoing a single configured value, which would tell the
 * browser the wrong origin and block the request.
 */
function corsOrigins(): string[] {
  const raw = process.env['CORS_ORIGIN'];
  if (raw === undefined || raw.trim() === '') return devDefaultCorsOrigins;
  const parsed = raw
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin !== '');
  if (parsed.length === 0) {
    throw new Error(`Invalid CORS_ORIGIN: no origins listed in "${raw}".`);
  }
  return parsed;
}

export function isAllowedCorsOrigin(origin: string, allowed: readonly string[] = env.corsOrigins): boolean {
  return allowed.includes(origin.replace(/\/+$/, ''));
}
const knownExampleSecrets = new Set([
  'dev-only-change-me',
  'fixlynk-test-secret',
  'change-me',
  'secret',
  'password',
]);

export const env = {
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  port: numberOr('PORT', 3000),
  corsOrigins: corsOrigins(),
  authStore: (process.env['AUTH_STORE'] ?? 'mysql').toLowerCase(),
  db: {
    host: process.env['DB_HOST'] ?? '127.0.0.1',
    port: numberOr('DB_PORT', 3307),
    user: process.env['DB_USER'] ?? 'fixlynk',
    password: process.env['DB_PASSWORD'] ?? 'fixlynk_dev_password',
    database: process.env['DB_NAME'] ?? 'fixlynk',
  },
  jwt: {
    // Tests may override via env; production must set a strong secret.
    // Falls back to the repo-root .env.example JWT_SECRET naming.
    accessSecret: process.env['JWT_ACCESS_SECRET'] ?? process.env['JWT_SECRET'] ?? 'dev-only-change-me',
    accessTtlSeconds: numberOr('JWT_ACCESS_TTL_SECONDS', 900),
  },
  refresh: {
    ttlSeconds: numberOr('REFRESH_TOKEN_TTL_SECONDS', 30 * 24 * 3600),
  },
  bcryptCost: numberOr('BCRYPT_COST', 12),
  webBaseUrl: webBaseUrl(),
  mail: mailConfig(),
  /** Operations inbox for signup / new-job alerts; null disables them. */
  opsAlertEmail: opsAlertEmail(),
};

export function isStrongProductionSecret(secret: string): boolean {
  return secret.length >= 32 && !knownExampleSecrets.has(secret);
}

/**
 * Mail is deliberately absent from this check: a deployment may legitimately
 * run with email disabled (in-app notifications only). The one mail
 * misconfiguration that must not pass silently — enabled without a host —
 * is rejected when `env` is built.
 */
export function assertProdSecrets(): void {
  if (!productionEnvironments.has(env.nodeEnv)) return;
  if (!isStrongProductionSecret(env.jwt.accessSecret)) {
    throw new Error('JWT_ACCESS_SECRET must be a strong random value of at least 32 characters in production.');
  }
}

// Re-exported for tests that need a per-test secret without touching process.env first.
export { required };
