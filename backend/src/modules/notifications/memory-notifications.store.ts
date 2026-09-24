/**
 * FixLink Stage 8 — in-memory notifications store for automated tests.
 *
 * Mirrors the MySQL implementation's rules (recipient isolation,
 * unread filtering, newest-first paging, read/read-all scoped to the
 * owner) without requiring a database. Ownership is part of
 * existence: another user's notification reads as null (404
 * upstream), never as a forbidden signal, so notification ids cannot
 * be probed across accounts.
 */
import type { CreateNotificationInput, NotificationDto } from './notifications.types';
import type { NotificationListFilter, NotificationStore } from './notifications.store';

function nowIso(): string {
  return new Date().toISOString();
}

interface NotificationRow extends NotificationDto {
  userId: string;
}

export class MemoryNotificationsStore implements NotificationStore {
  private seq = 0;
  private readonly rows = new Map<string, NotificationRow>();

  /** Test helper: how many rows exist across all recipients. */
  debugCount(): number {
    return this.rows.size;
  }

  /** Test helper: rows for one recipient, newest first. */
  debugForUser(userId: string): NotificationDto[] {
    return [...this.rows.values()]
      .filter((row) => row.userId === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.id < b.id ? 1 : -1))
      .map(toDto);
  }

  async create(input: CreateNotificationInput): Promise<NotificationDto> {
    this.seq += 1;
    const now = nowIso();
    const row: NotificationRow = {
      id: String(this.seq),
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      relatedJobId:
        input.referenceType === 'JOB' || input.referenceType === 'INTERNAL_JOB' ? input.referenceId : null,
      relatedEntityType: input.referenceType,
      relatedEntityId: input.referenceId,
      read: false,
      createdAt: now,
      readAt: null,
    };
    this.rows.set(row.id, row);
    return toDto(row);
  }

  async listForUser(filter: NotificationListFilter): Promise<{ items: NotificationDto[]; total: number }> {
    const owned = [...this.rows.values()]
      .filter((row) => row.userId === filter.userId)
      .filter((row) => !filter.unreadOnly || !row.read)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.id < b.id ? 1 : -1));
    const start = (filter.page - 1) * filter.pageSize;
    return { items: owned.slice(start, start + filter.pageSize).map(toDto), total: owned.length };
  }

  async countUnread(userId: string): Promise<number> {
    return [...this.rows.values()].filter((row) => row.userId === userId && !row.read).length;
  }

  async getById(userId: string, notificationId: string): Promise<NotificationDto | null> {
    const row = this.rows.get(notificationId) ?? null;
    if (!row || row.userId !== userId) return null;
    return toDto(row);
  }

  async markRead(userId: string, notificationId: string): Promise<NotificationDto | null> {
    const row = this.rows.get(notificationId) ?? null;
    if (!row || row.userId !== userId) return null;
    if (!row.read) {
      row.read = true;
      row.readAt = nowIso();
    }
    return toDto(row);
  }

  async markAllRead(userId: string): Promise<number> {
    let marked = 0;
    for (const row of this.rows.values()) {
      if (row.userId === userId && !row.read) {
        row.read = true;
        row.readAt = nowIso();
        marked += 1;
      }
    }
    return marked;
  }
}

function toDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    relatedJobId: row.relatedJobId,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    read: row.read,
    createdAt: row.createdAt,
    readAt: row.readAt,
  };
}
