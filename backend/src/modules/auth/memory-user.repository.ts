import {
  toSafeUser,
  type CreateUserInput,
  type UserRecord,
  type UserRepository,
} from '../users/user.repository';

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * In-memory user repository — used by automated tests (AUTH_STORE=memory)
 * so Stage 5A auth logic is verified without requiring MySQL.
 * Enforces the same email-uniqueness rule as the `uq_users_email` constraint.
 */
export class MemoryUserRepository implements UserRepository {
  private seq = 0;
  private readonly byId = new Map<string, UserRecord>();
  private readonly idByEmail = new Map<string, string>();
  private readonly roles = new Map<string, Set<string>>();

  async findByEmail(email: string): Promise<UserRecord | null> {
    const id = this.idByEmail.get(email);
    return id === undefined ? null : (this.byId.get(id) ?? null);
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.byId.get(id) ?? null;
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    if (this.idByEmail.has(input.email)) {
      const err = new Error('Duplicate email');
      (err as NodeJS.ErrnoException).code = 'ER_DUP_ENTRY';
      throw err;
    }
    this.seq += 1;
    const user: UserRecord = {
      id: String(this.seq),
      email: input.email,
      phone: input.phone,
      passwordHash: input.passwordHash,
      status: 'PENDING',
      emailVerifiedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.byId.set(user.id, user);
    this.idByEmail.set(user.email, user.id);
    this.roles.set(user.id, new Set());
    return user;
  }

  async setRoles(userId: string, roles: string[]): Promise<void> {
    const set = this.roles.get(userId) ?? new Set<string>();
    for (const role of roles) set.add(role);
    this.roles.set(userId, set);
  }

  async getRoles(userId: string): Promise<string[]> {
    return [...(this.roles.get(userId) ?? new Set<string>())].sort();
  }

  async touchLogin(_userId: string): Promise<void> {
    // No-op for the ephemeral test store.
  }

  async setStatus(userId: string, status: UserRecord['status']): Promise<void> {
    const user = this.byId.get(userId);
    if (user) {
      this.byId.set(userId, { ...user, status, updatedAt: nowIso() });
    }
  }

  toSafeUser(user: UserRecord, roles: string[]): ReturnType<UserRepository['toSafeUser']> {
    return toSafeUser(user, roles);
  }

  /** Test helper — exposes the stored hash to prove it is not plaintext. */
  async debugHashFor(email: string): Promise<string | null> {
    return (await this.findByEmail(email))?.passwordHash ?? null;
  }
}
