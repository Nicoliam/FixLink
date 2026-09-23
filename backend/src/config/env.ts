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

export const env = {
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  port: numberOr('PORT', 3000),
  corsOrigin: process.env['CORS_ORIGIN'] ?? 'http://localhost:4200',
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

export function assertProdSecrets(): void {
  if (env.nodeEnv === 'production' && env.jwt.accessSecret === 'dev-only-change-me') {
    throw new Error('JWT_ACCESS_SECRET must be set to a strong random value in production.');
  }
}

// Re-exported for tests that need a per-test secret without touching process.env first.
export { required };
