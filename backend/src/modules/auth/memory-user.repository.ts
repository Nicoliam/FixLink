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
      lastLoginAt: null,
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

  async listAdminUsers(filters: import('../admin/admin.types').AdminUserFilters) {
    const needle = filters.search?.toLowerCase() ?? null;
    const rows = [...this.byId.values()]
      .filter((user) => filters.status === null || user.status === filters.status)
      .filter((user) => {
        const roles = this.roles.get(user.id) ?? new Set<string>();
        return filters.role === null || roles.has(filters.role);
      })
      .filter((user) => !needle || `${user.email} ${user.phone ?? ''}`.toLowerCase().includes(needle))
      .sort((a, b) => a.createdAt < b.createdAt ? 1 : -1);
    const start = (filters.page - 1) * filters.pageSize;
    return {
      items: rows.slice(start, start + filters.pageSize).map((user) => this.toSafeUser(user, [...(this.roles.get(user.id) ?? [])])),
      total: rows.length,
      page: filters.page,
      pageSize: filters.pageSize,
    } as import('../admin/admin.types').AdminList<import('../admin/admin.types').AdminUserDto>;
  }

  async touchLogin(userId: string): Promise<void> {
    const user = this.byId.get(userId);
    if (user) this.byId.set(userId, { ...user, lastLoginAt: nowIso() });
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
