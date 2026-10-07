import { env } from '../../config/env';
import type { ProfileProvision, SafeUser, UserRepository } from '../users/user.repository';
import { hashPassword, verifyPassword } from '../../utils/password';
import { provisionCustomerNames } from '../../utils/customer-names';
import { generateRefreshToken, hashRefreshToken, signAccessToken } from '../../utils/tokens';
import {
  validateLogin,
  validateRefresh,
  validateRegister,
  type RegisterInput,
} from './auth.validation';
import type { RefreshStore } from './refresh.store';
import type { OpsAlertSender } from '../../services/ops-alert';

export const GENERIC_AUTH_ERROR = 'Invalid email or password.';

export interface ServiceResult<T> {
  status: number;
  code?: string;
  message?: string;
  data?: T;
}

/**
 * Which unique key an `ER_DUP_ENTRY` violated.
 *
 * `users` has two unique keys — `uq_users_email` and `uq_users_phone` — so a
 * plain `ER_DUP_ENTRY` is NOT proof of a duplicate email. Reporting a phone
 * collision as `EMAIL_EXISTS` blocks a legitimate registration behind a
 * message that tells the user to log in with an account that does not exist.
 *
 * The mysql2 driver exposes the key name on the error, so classify precisely
 * and fall back to `null` (unidentifiable) when the driver did not supply it.
 */
export type DuplicateKeyKind = 'email' | 'phone' | null;

export function duplicateKeyKind(err: unknown): DuplicateKeyKind {
  const e = err as { code?: unknown; sqlMessage?: unknown } | null;
  if (!e || e.code !== 'ER_DUP_ENTRY') return null;
  // "Duplicate entry 'x' for key 'users.uq_users_phone'"
  const message = typeof e.sqlMessage === 'string' ? e.sqlMessage : '';
  if (/uq_users_phone|users\.phone|\bphone\b/i.test(message)) return 'phone';
  if (/uq_users_email|users\.email|\bemail\b/i.test(message)) return 'email';
  return null;
}

/** True for any duplicate-entry violation, whether or not the key is known. */
function isDuplicateEntry(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'ER_DUP_ENTRY';
}

const SLUG_MAX = 240;

/**
 * URL slug for a newly registered business.
 *
 * `uq_business_profiles_slug` is UNIQUE, and the new user id is not known
 * before the insert, so uniqueness comes from the (unique) account email local
 * part. Deterministic for a given name + email, which keeps a retried
 * registration on the same slug.
 */
export function businessSlug(businessName: string, email: string): string {
  const slugify = (value: string): string =>
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const local = slugify(email.split('@')[0] ?? '');
  const name = slugify(businessName).slice(0, 120) || 'business';
  return `${name}-${local || 'fixlynk'}`.slice(0, SLUG_MAX);
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshStore: RefreshStore,
    /**
     * Operations alert for a new signup. Optional so existing constructions
     * keep compiling; delivery is best-effort and never affects the response,
     * because a mail relay being down must not stop someone registering.
     */
    private readonly opsAlert?: OpsAlertSender,
  ) {}

  /**
   * Self-registration.
   *
   * Verification is NOT a prerequisite: the account is created ACTIVE and a
   * session is issued in the same response, so the new customer or provider
   * lands straight on their dashboard. Any provider profile is created in the
   * same transaction (see `createAccount`), so nothing has to be verified or
   * completed before the account can be used.
   */
  async register(
    body: unknown,
  ): Promise<ServiceResult<{ user: SafeUser; accessToken: string; refreshToken: string }>> {
    const { input, error } = validateRegister(body);
    if (!input || error) {
      const forbidden = error?.includes('cannot be self-registered') === true;
      return {
        status: forbidden ? 403 : 422,
        code: forbidden ? 'FORBIDDEN_ROLE' : 'VALIDATION_ERROR',
        message: error ?? 'Invalid registration data.',
      };
    }

    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      return { status: 409, code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' };
    }

    const passwordHash = await hashPassword(input.password);
    try {
      const created = await this.users.createAccount({
        email: input.email,
        phone: input.phone,
        passwordHash,
        role: input.role,
        profile: this.profileFor(input),
      });
      const roles = await this.users.getRoles(created.id);
      await this.users.touchLogin(created.id);
      const tokens = await this.issueSession(created.id, created.email, roles);
      // Alert only once the account is committed, and never let it change the
      // outcome: `send` resolves false rather than rejecting.
      await this.alertRegistration(created.id, created.email, created.phone, roles, input);
      return { status: 201, data: { user: this.users.toSafeUser(created, roles), ...tokens } };
    } catch (err) {

      // Race-safe: a unique constraint won the check-then-insert race.
      // Report the constraint that actually fired so the user is not told
      // their email is taken when it is their phone number.
      const key = duplicateKeyKind(err);
      if (key === 'phone') {
        return {
          status: 409,
          code: 'CONFLICT',
          message: 'This phone number is already registered to another account.',
        };
      }
      if (key === 'email') {
        return { status: 409, code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' };
      }
      if (isDuplicateEntry(err)) {
        // A unique constraint fired but the driver did not name the key.
        // Answer honestly rather than guessing (or surfacing a 500).
        return {
          status: 409,
          code: 'CONFLICT',
          message: 'An account with this email or phone number already exists.',
        };
      }
      throw err;
    }
  }

  /**
   * The role profile to create alongside the account, in the same transaction.
   *
   * A CUSTOMER provisions `customer_profiles` here too. That row is the
   * ownership anchor for every customer-scoped feature (saved professionals,
   * quotes, job detail, job history), so creating it lazily on the first job
   * request left a brand-new customer with 404s until they posted a job.
   */
  /**
   * Tell the operations inbox that an account was created.
   *
   * Carries contact details on purpose — this is the internal inbox, and
   * knowing who signed up is the entire purpose. It deliberately does NOT
   * carry the password: `input` is read field by field, so the plaintext
   * password in `RegisterInput.password` is never referenced.
   */
  private async alertRegistration(
    userId: string,
    email: string,
    phone: string | null,
    roles: string[],
    input: RegisterInput,
  ): Promise<void> {
    if (!this.opsAlert) return;
    const name =
      input.displayName ??
      input.businessName ??
      [input.firstName, input.lastName].filter((part) => part && part.trim() !== '').join(' ').trim();
    await this.opsAlert.send({
      kind: 'REGISTRATION',
      details: [
        { label: 'Email', value: email },
        { label: 'Phone', value: phone ?? 'Not provided' },
        { label: 'Role', value: roles.join(', ') || 'none' },
        { label: 'Name', value: name !== '' ? name : 'Not provided' },
        { label: 'Account ID', value: `#${userId}` },
      ],
    });
  }

  private profileFor(input: RegisterInput): ProfileProvision | null {
    if (input.role === 'CUSTOMER') {
      // The registration form asks for both names. They stay OPTIONAL on the
      // wire so an existing client cannot be broken by this change; when they
      // are absent the name is derived from the email instead, which is what
      // the lazy job-request path always did.
      const derived = provisionCustomerNames(input.email);
      return {
        kind: 'CUSTOMER',
        firstName: input.firstName ?? derived.firstName,
        lastName: input.lastName ?? derived.lastName,
        email: input.email,
        phone: input.phone,
      };
    }
    if (input.role === 'PROFESSIONAL' && input.displayName !== null) {
      return { kind: 'PROFESSIONAL', displayName: input.displayName };
    }
    if (input.role === 'BUSINESS_OWNER' && input.businessName !== null) {
      return {
        kind: 'BUSINESS_OWNER',
        businessName: input.businessName,
        slug: businessSlug(input.businessName, input.email),
        email: input.email,
        phone: input.phone,
      };
    }
    return null;
  }

  async login(body: unknown): Promise<ServiceResult<{ user: SafeUser; accessToken: string; refreshToken: string }>> {
    const { input, error } = validateLogin(body);
    if (!input || error) {
      return { status: 422, code: 'VALIDATION_ERROR', message: error ?? 'Invalid login data.' };
    }

    const user = await this.users.findByEmail(input.email);
    // Generic error for unknown emails AND wrong passwords (no account enumeration).
    if (!user) return { status: 401, code: 'INVALID_CREDENTIALS', message: GENERIC_AUTH_ERROR };
    if (user.status === 'SUSPENDED' || user.status === 'DELETED') {
      return { status: 401, code: 'INVALID_CREDENTIALS', message: GENERIC_AUTH_ERROR };
    }

    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) return { status: 401, code: 'INVALID_CREDENTIALS', message: GENERIC_AUTH_ERROR };

    const roles = await this.users.getRoles(user.id);
    await this.users.touchLogin(user.id);
    const tokens = await this.issueSession(user.id, user.email, roles);
    return {
      status: 200,
      data: { user: this.users.toSafeUser(user, roles), ...tokens },
    };
  }

  async refresh(body: unknown): Promise<ServiceResult<{ user: SafeUser; accessToken: string; refreshToken: string }>> {
    const { refreshToken, error } = validateRefresh(body);
    if (!refreshToken || error) {
      return { status: 401, code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid or expired.' };
    }

    const session = await this.refreshStore.consume(hashRefreshToken(refreshToken));
    if (!session) {
      return { status: 401, code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid or expired.' };
    }

    const user = await this.users.findById(session.userId);
    if (!user || user.status === 'SUSPENDED' || user.status === 'DELETED') {
      return { status: 401, code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid or expired.' };
    }

    const roles = await this.users.getRoles(user.id);
    const tokens = await this.issueSession(user.id, user.email, roles);
    return { status: 200, data: { user: this.users.toSafeUser(user, roles), ...tokens } };
  }

  /**
   * Logout revokes refresh sessions. Accepts either:
   *  - { refreshToken } in the body (revokes that single session), and/or
   *  - an authenticated user (revokes ALL sessions for that user).
   * Idempotent: unknown tokens still return success (no session oracle).
   */
  async logout(body: unknown, authUserId: string | null): Promise<ServiceResult<Record<string, never>>> {
    const parsed = validateRefresh(body);
    if (parsed.refreshToken) {
      await this.refreshStore.revokeByHash(hashRefreshToken(parsed.refreshToken));
    }
    if (authUserId) {
      await this.refreshStore.revokeAllForUser(authUserId);
    }
    if (!parsed.refreshToken && !authUserId) {
      return { status: 401, code: 'UNAUTHORIZED', message: 'Authentication required.' };
    }
    return { status: 200, data: {} };
  }

  async me(userId: string): Promise<ServiceResult<{ user: SafeUser }>> {
    const user = await this.users.findById(userId);
    if (!user || user.status === 'DELETED') {
      return { status: 401, code: 'UNAUTHORIZED', message: 'Authentication required.' };
    }
    const roles = await this.users.getRoles(user.id);
    return { status: 200, data: { user: this.users.toSafeUser(user, roles) } };
  }

  private async issueSession(
    userId: string,
    email: string,
    roles: string[],
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = signAccessToken({ sub: userId, email, roles });
    const refreshToken = generateRefreshToken();
    const now = Date.now();
    await this.refreshStore.save({
      tokenHash: hashRefreshToken(refreshToken),
      userId,
      createdAtMs: now,
      expiresAtMs: now + env.refresh.ttlSeconds * 1000,
    });
    return { accessToken, refreshToken };
  }
}
