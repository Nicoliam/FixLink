import type { Pool } from 'mysql2/promise';
import {
  toSafeUser,
  type CreateUserInput,
  type UserRecord,
  type UserRepository,
  type UserStatus,
} from '../users/user.repository';

interface UserRow {
  id: number | string;
  email: string;
  phone: string | null;
  password_hash: string;
  status: UserStatus;
  email_verified_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function toIso(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapRow(row: UserRow): UserRecord {
  return {
    id: String(row.id),
    email: row.email,
    phone: row.phone,
    passwordHash: row.password_hash,
    status: row.status,
    emailVerifiedAt: toIso(row.email_verified_at),
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

/**
 * MySQL-backed user repository (users + roles + user_roles).
 * All values are bound parameters — no string-interpolated SQL.
 */
export class MysqlUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const [rows] = await this.pool.query('SELECT * FROM `users` WHERE `email` = ? LIMIT 1', [email]);
    const list = rows as UserRow[];
    return list.length === 0 ? null : mapRow(list[0] as UserRow);
  }

  async findById(id: string): Promise<UserRecord | null> {
    const [rows] = await this.pool.query('SELECT * FROM `users` WHERE `id` = ? LIMIT 1', [id]);
    const list = rows as UserRow[];
    return list.length === 0 ? null : mapRow(list[0] as UserRow);
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    await this.pool.query('INSERT INTO `users` (`email`, `phone`, `password_hash`, `status`) VALUES (?, ?, ?, \'PENDING\')', [
      input.email,
      input.phone,
      input.passwordHash,
    ]);
    const created = await this.findByEmail(input.email);
    if (!created) throw new Error('User creation failed: row not found after insert.');
    return created;
  }

  async setRoles(userId: string, roles: string[]): Promise<void> {
    for (const role of roles) {
      await this.pool.query(
        'INSERT INTO `user_roles` (`user_id`, `role_id`) SELECT ?, `id` FROM `roles` WHERE `name` = ? ON DUPLICATE KEY UPDATE `user_id` = VALUES(`user_id`)',
        [userId, role],
      );
    }
  }

  async getRoles(userId: string): Promise<string[]> {
    const [rows] = await this.pool.query(
      'SELECT r.`name` AS `name` FROM `roles` r INNER JOIN `user_roles` ur ON ur.`role_id` = r.`id` WHERE ur.`user_id` = ? ORDER BY r.`name`',
      [userId],
    );
    return (rows as Array<{ name: string }>).map((r) => r.name);
  }

  async touchLogin(userId: string): Promise<void> {
    await this.pool.query('UPDATE `users` SET `last_login_at` = NOW() WHERE `id` = ?', [userId]);
  }

  async setStatus(userId: string, status: UserStatus): Promise<void> {
    await this.pool.query('UPDATE `users` SET `status` = ? WHERE `id` = ?', [status, userId]);
  }

  toSafeUser(user: UserRecord, roles: string[]): ReturnType<UserRepository['toSafeUser']> {
    return toSafeUser(user, roles);
  }
}
