import { env } from '../../config/env';
import type { SafeUser, UserRepository } from '../users/user.repository';
import { hashPassword, verifyPassword } from '../../utils/password';
import { generateRefreshToken, hashRefreshToken, signAccessToken } from '../../utils/tokens';
import { validateLogin, validateRefresh, validateRegister } from './auth.validation';
import type { RefreshStore } from './refresh.store';

export const GENERIC_AUTH_ERROR = 'Invalid email or password.';

export interface ServiceResult<T> {
  status: number;
  code?: string;
  message?: string;
  data?: T;
}

function isDuplicateEmail(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 'ER_DUP_ENTRY';
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshStore: RefreshStore,
  ) {}

  async register(body: unknown): Promise<ServiceResult<{ user: SafeUser }>> {
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
      const created = await this.users.create({
        email: input.email,
        phone: input.phone,
        passwordHash,
      });
      await this.users.setRoles(created.id, [input.role]);
      const roles = await this.users.getRoles(created.id);
      return { status: 201, data: { user: this.users.toSafeUser(created, roles) } };
    } catch (err) {
      if (isDuplicateEmail(err)) {
        // Race-safe: unique constraint won the check-then-insert race.
        return { status: 409, code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' };
      }
      throw err;
    }
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
