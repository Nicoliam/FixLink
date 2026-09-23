import bcrypt from 'bcryptjs';
import { env } from '../config/env';

/** bcrypt cost factor — 12 per production standard (DATABASE.md §40.8). */
export function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, env.bcryptCost);
}

export function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  // bcrypt.compare is timing-safe; invalid hash shapes return false via catch.
  return bcrypt.compare(plaintext, hash).catch(() => false);
}
