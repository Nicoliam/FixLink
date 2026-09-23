import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AccessTokenClaims {
  sub: string;
  email: string;
  roles: string[];
}

export function signAccessToken(claims: AccessTokenClaims, ttlSeconds = env.jwt.accessTtlSeconds): string {
  return jwt.sign(
    { email: claims.email, roles: claims.roles },
    env.jwt.accessSecret,
    { subject: claims.sub, expiresIn: ttlSeconds },
  );
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const decoded = jwt.verify(token, env.jwt.accessSecret);
  if (typeof decoded !== 'object' || decoded === null) {
    throw new Error('Invalid token payload');
  }
  const sub = (decoded as Record<string, unknown>)['sub'];
  if (typeof sub !== 'string' || sub === '') throw new Error('Invalid token subject');
  const payload = decoded as { email?: unknown; roles?: unknown };
  return {
    sub,
    email: typeof payload.email === 'string' ? payload.email : '',
    roles: Array.isArray(payload.roles) ? (payload.roles as unknown[]).filter((r): r is string => typeof r === 'string') : [],
  };
}

/** Opaque refresh token (returned to the client once, never stored raw). */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('hex');
}

/** SHA-256 hash of an opaque refresh token — what the server stores. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
