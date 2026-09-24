/**
 * FixLink Stage 8 — MySQL notifications store (production implementation).
 *
 * Reuses the existing `notifications` table (migration 008) — no
 * migration was required. Every value is a bound parameter. All reads
 * and writes are scoped to `user_id`: another user's notification is
 * invisible (null → 404 upstream), never a forbidden signal.
 */
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  CreateNotificationInput,
  NotificationDto,
  NotificationReferenceType,
  NotificationType,
} from './notifications.types';
import { isNotificationReferenceType, isNotificationType } from './notifications.types';
import type { NotificationListFilter, NotificationStore } from './notifications.store';

interface NotificationRow extends RowDataPacket {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string | null;
  reference_type: string | null;
  reference_id: number | string | null;
  read_at: Date | string | null;
  created_at: Date | string;
}

function toIso(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDto(row: NotificationRow): NotificationDto {
  const type: NotificationType = isNotificationType(row.type) ? row.type : 'JOB_UPDATE';
  const referenceType: NotificationReferenceType | null = isNotificationReferenceType(row.reference_type)
    ? row.reference_type
    : null;
  const referenceId = row.reference_id === null || row.reference_id === undefined ? null : String(row.reference_id);
  return {
    id: String(row.id),
    type,
    title: row.title,
    message: row.message,
    relatedJobId: referenceType === 'JOB' || referenceType === 'INTERNAL_JOB' ? referenceId : null,
    relatedEntityType: referenceType,
    relatedEntityId: referenceId,
    read: row.read_at !== null && row.read_at !== undefined,
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    readAt: toIso(row.read_at),
  };
}

const SELECT_COLUMNS =
  '`id`, `user_id`, `type`, `title`, `message`, `reference_type`, `reference_id`, `read_at`, `created_at`';

export class MysqlNotificationsStore implements NotificationStore {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateNotificationInput): Promise<NotificationDto> {
    const [result] = await this.pool.query<ResultSetHeader>(
      'INSERT INTO `notifications` (`user_id`, `type`, `title`, `message`, `reference_type`, `reference_id`) VALUES (?, ?, ?, ?, ?, ?)',
      [input.userId, input.type, input.title, input.message, input.referenceType, input.referenceId],
    );
    const [rows] = await this.pool.query<NotificationRow[]>(
      `SELECT ${SELECT_COLUMNS} FROM \`notifications\` WHERE \`id\` = ? LIMIT 1`,
      [result.insertId],
    );
    const row = rows[0];
    if (!row) throw new Error('Notification creation failed: row not found after insert.');
    return toDto(row);
  }

  async listForUser(filter: NotificationListFilter): Promise<{ items: NotificationDto[]; total: number }> {
    const params: Array<string | number> = [filter.userId];
    let readClause = '';
    if (filter.unreadOnly) {
      readClause = ' AND `read_at` IS NULL';
    }
    const [countRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS \`total\` FROM \`notifications\` WHERE \`user_id\` = ?${readClause}`,
      params,
    );
    const total = Number((countRows[0] as RowDataPacket)['total'] ?? 0);
    const offset = (filter.page - 1) * filter.pageSize;
    const [rows] = await this.pool.query<NotificationRow[]>(
      `SELECT ${SELECT_COLUMNS} FROM \`notifications\` WHERE \`user_id\` = ?${readClause} ORDER BY \`created_at\` DESC, \`id\` DESC LIMIT ? OFFSET ?`,
      [...params, filter.pageSize, offset],
    );
    return { items: rows.map(toDto), total };
  }

  async countUnread(userId: string): Promise<number> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS `total` FROM `notifications` WHERE `user_id` = ? AND `read_at` IS NULL',
      [userId],
    );
    return Number((rows[0] as RowDataPacket)['total'] ?? 0);
  }

  async getById(userId: string, notificationId: string): Promise<NotificationDto | null> {
    const [rows] = await this.pool.query<NotificationRow[]>(
      `SELECT ${SELECT_COLUMNS} FROM \`notifications\` WHERE \`id\` = ? AND \`user_id\` = ? LIMIT 1`,
      [notificationId, userId],
    );
    const row = rows[0];
    return row ? toDto(row) : null;
  }

  async markRead(userId: string, notificationId: string): Promise<NotificationDto | null> {
    await this.pool.query(
      'UPDATE `notifications` SET `read_at` = COALESCE(`read_at`, NOW()) WHERE `id` = ? AND `user_id` = ?',
      [notificationId, userId],
    );
    return this.getById(userId, notificationId);
  }

  async markAllRead(userId: string): Promise<number> {
    const [result] = await this.pool.query<ResultSetHeader>(
      'UPDATE `notifications` SET `read_at` = NOW() WHERE `user_id` = ? AND `read_at` IS NULL',
      [userId],
    );
    return result.affectedRows;
  }
}
