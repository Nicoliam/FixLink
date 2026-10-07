import type { AdminList, AdminUserFilters, AdminUserDto } from '../admin/admin.types';

export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DELETED';

/** Internal user record — includes the password hash (never sent to clients). */
export interface UserRecord {
  id: string;
  email: string;
  phone: string | null;
  passwordHash: string;
  status: UserStatus;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Safe public projection — the only user shape the API returns. */
export interface SafeUser {
  id: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  roles: string[];
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  email: string;
  phone: string | null;
  passwordHash: string;
}

/**
 * Role profile created in the same transaction as the account.
 *
 * A provider cannot function without one: `professional_profiles.display_name`
 * and `business_profiles.business_name` are NOT NULL, and both provider
 * resolvers (marketplace requests, business management) read these rows.
 * Provisioning at registration is what makes a self-registering provider
 * usable immediately without any verification step.
 *
 * A customer gets one for the same reason. `customer_profiles.first_name` and
 * `last_name` are NOT NULL, and customer-scoped features read that row for
 * ownership: saved professionals, quotes, job detail and job history all
 * resolve the caller through it. Provisioning it lazily on the first job
 * request meant a brand-new customer received 404 on those endpoints until
 * they happened to post a job, which is both wrong and order-dependent.
 */
export type ProfileProvision =
  | { kind: 'CUSTOMER'; firstName: string; lastName: string; email: string; phone: string | null }
  | { kind: 'PROFESSIONAL'; displayName: string }
  | { kind: 'BUSINESS_OWNER'; businessName: string; slug: string; email: string; phone: string | null };

export interface CreateAccountInput extends CreateUserInput {
  /** Single self-registered role, e.g. CUSTOMER / PROFESSIONAL / BUSINESS_OWNER. */
  role: string;
  /** The role profile created in the same transaction, or null when none applies. */
  profile: ProfileProvision | null;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(input: CreateUserInput): Promise<UserRecord>;
  /**
   * Create an ACTIVE self-registered account with its role and provider
   * profile atomically. Any failure rolls the whole unit back, so a failed
   * registration never consumes the email address.
   */
  createAccount(input: CreateAccountInput): Promise<UserRecord>;
  setRoles(userId: string, roles: string[]): Promise<void>;
  getRoles(userId: string): Promise<string[]>;
  listAdminUsers(filters: AdminUserFilters): Promise<AdminList<AdminUserDto>>;
  touchLogin(userId: string): Promise<void>;
  /**
   * Change an account status (e.g. admin suspend / reactivate). Registration
   * and the technician invite flow both land ACTIVE.
   */
  setStatus(userId: string, status: UserStatus): Promise<void>;
  toSafeUser(user: UserRecord, roles: string[]): SafeUser;
}

export function toSafeUser(user: UserRecord, roles: string[]): SafeUser {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    status: user.status,
    roles: [...roles].sort(),
    emailVerifiedAt: user.emailVerifiedAt,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
