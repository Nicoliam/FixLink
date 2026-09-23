export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DELETED';

/** Internal user record — includes the password hash (never sent to clients). */
export interface UserRecord {
  id: string;
  email: string;
  phone: string | null;
  passwordHash: string;
  status: UserStatus;
  emailVerifiedAt: string | null;
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
  touchLogin(userId: string): Promise<void>;
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
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
