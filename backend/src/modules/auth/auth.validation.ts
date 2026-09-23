/**
 * Stage 5A registration rules (from MVP-SCOPE.md + AGENTS.md + PERMISSIONS.md):
 *
 * Self-registration is open for marketplace / business-founder roles only:
 *   CUSTOMER (default), PROFESSIONAL, BUSINESS_OWNER
 *
 * These roles must NOT be self-assigned:
 *   BUSINESS_MANAGER, TECHNICIAN — provisioned by a business (invite flow, later stage)
 *   ADMIN — granted explicitly by the backend/platform (never via public registration)
 */

export const SELF_REGISTER_ROLES = ['CUSTOMER', 'PROFESSIONAL', 'BUSINESS_OWNER'] as const;
export type SelfRegisterRole = (typeof SELF_REGISTER_ROLES)[number];

export const ALL_KNOWN_ROLES = [
  'CUSTOMER',
  'PROFESSIONAL',
  'BUSINESS_OWNER',
  'BUSINESS_MANAGER',
  'TECHNICIAN',
  'ADMIN',
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+]?[0-9][0-9\s\-()]{5,18}[0-9]$/;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export interface RegisterInput {
  email: string;
  password: string;
  phone: string | null;
  role: SelfRegisterRole;
}

export interface LoginInput {
  email: string;
  password: string;
}

/** Email normalisation: trim + lowercase (MVP rule — no provider-specific canonicalisation). */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function validateRegister(body: unknown): { input?: RegisterInput; error?: string } {
  if (!isRecord(body)) return { error: 'Request body must be a JSON object.' };
  const { email, password, phone, role } = body;

  if (typeof email !== 'string' || email.trim() === '') return { error: 'Email is required.' };
  const normalised = normalizeEmail(email);
  if (normalised.length > 255) return { error: 'Email must be at most 255 characters.' };
  if (!EMAIL_RE.test(normalised)) return { error: 'Email format is invalid.' };

  if (typeof password !== 'string' || password === '') return { error: 'Password is required.' };
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { error: `Password must be at most ${PASSWORD_MAX_LENGTH} characters.` };
  }

  let normalisedPhone: string | null = null;
  if (phone !== undefined && phone !== null && phone !== '') {
    if (typeof phone !== 'string') return { error: 'Phone must be a string.' };
    const trimmed = phone.trim();
    if (!PHONE_RE.test(trimmed)) return { error: 'Phone format is invalid.' };
    normalisedPhone = trimmed;
  }

  let requestedRole: SelfRegisterRole = 'CUSTOMER';
  if (role !== undefined && role !== null && role !== '') {
    if (typeof role !== 'string') return { error: 'Role must be a string.' };
    const upper = role.trim().toUpperCase();
    if ((SELF_REGISTER_ROLES as readonly string[]).includes(upper)) {
      requestedRole = upper as SelfRegisterRole;
    } else if ((ALL_KNOWN_ROLES as readonly string[]).includes(upper)) {
      return { error: `Role '${upper}' cannot be self-registered.` };
    } else {
      return { error: `Role '${role}' is not recognised.` };
    }
  }

  return { input: { email: normalised, password, phone: normalisedPhone, role: requestedRole } };
}

export function validateLogin(body: unknown): { input?: LoginInput; error?: string } {
  if (!isRecord(body)) return { error: 'Request body must be a JSON object.' };
  const { email, password } = body;
  if (typeof email !== 'string' || email.trim() === '') return { error: 'Email is required.' };
  if (typeof password !== 'string' || password === '') return { error: 'Password is required.' };
  const normalised = normalizeEmail(email);
  if (!EMAIL_RE.test(normalised)) return { error: 'Email format is invalid.' };
  return { input: { email: normalised, password } };
}

export function validateRefresh(body: unknown): { refreshToken?: string; error?: string } {
  if (!isRecord(body)) return { error: 'Request body must be a JSON object.' };
  const { refreshToken } = body;
  if (typeof refreshToken !== 'string' || refreshToken.trim() === '') {
    return { error: 'Refresh token is required.' };
  }
  return { refreshToken: refreshToken.trim() };
}
