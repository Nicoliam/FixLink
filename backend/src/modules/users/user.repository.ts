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

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(input: CreateUserInput): Promise<UserRecord>;
  setRoles(userId: string, roles: string[]): Promise<void>;
  getRoles(userId: string): Promise<string[]>;
  listAdminUsers(filters: AdminUserFilters): Promise<AdminList<AdminUserDto>>;
  touchLogin(userId: string): Promise<void>;
  /**
   * Stage 7A — activate an invited technician login. Invited accounts
   * land ACTIVE (registration still lands PENDING); suspension and
   * deletion remain the caller's responsibility.
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
