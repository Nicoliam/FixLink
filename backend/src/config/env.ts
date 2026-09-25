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
  'fixlink-test-secret',
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
    user: process.env['DB_USER'] ?? 'fixlink',
    password: process.env['DB_PASSWORD'] ?? 'fixlink_dev_password',
    database: process.env['DB_NAME'] ?? 'fixlink',
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
};

export function isStrongProductionSecret(secret: string): boolean {
  return secret.length >= 32 && !knownExampleSecrets.has(secret);
}

export function assertProdSecrets(): void {
  if (!productionEnvironments.has(env.nodeEnv)) return;
  if (!isStrongProductionSecret(env.jwt.accessSecret)) {
    throw new Error('JWT_ACCESS_SECRET must be a strong random value of at least 32 characters in production.');
  }
}

// Re-exported for tests that need a per-test secret without touching process.env first.
export { required };
