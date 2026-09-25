import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { RefreshSession, RefreshStore } from './refresh.store';

interface RefreshRow extends RowDataPacket {
  token_hash: string;
  user_id: number;
  expires_at: Date | string;
  created_at: Date | string;
}

function toMillis(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function mapRow(row: RefreshRow): RefreshSession {
  return {
    tokenHash: row.token_hash,
    userId: String(row.user_id),
    expiresAtMs: toMillis(row.expires_at),
    createdAtMs: toMillis(row.created_at),
  };
}

export class MysqlRefreshStore implements RefreshStore {
  constructor(private readonly pool: Pool) {}

  async save(session: RefreshSession): Promise<void> {
    await this.pool.query(
      `INSERT INTO \`refresh_tokens\`
        (\`token_hash\`, \`user_id\`, \`expires_at\`, \`created_at\`, \`revoked_at\`)
       VALUES (?, ?, FROM_UNIXTIME(? / 1000), FROM_UNIXTIME(? / 1000), NULL)`,
      [session.tokenHash, session.userId, session.expiresAtMs, session.createdAtMs],
    );
  }

  async findByHash(tokenHash: string): Promise<RefreshSession | null> {
    const [rows] = await this.pool.query<RefreshRow[]>(
      `SELECT \`token_hash\`, \`user_id\`, \`expires_at\`, \`created_at\`
         FROM \`refresh_tokens\`
        WHERE \`token_hash\` = ? AND \`revoked_at\` IS NULL AND \`expires_at\` > NOW()
        LIMIT 1`,
      [tokenHash],
    );
    return rows.length === 0 ? null : mapRow(rows[0] as RefreshRow);
  }

  async consume(tokenHash: string): Promise<RefreshSession | null> {
    const [result] = await this.pool.query<ResultSetHeader>(
      `UPDATE \`refresh_tokens\`
          SET \`revoked_at\` = NOW()
        WHERE \`token_hash\` = ? AND \`revoked_at\` IS NULL AND \`expires_at\` > NOW()`,
      [tokenHash],
    );
    if (result.affectedRows !== 1) return null;
    const [rows] = await this.pool.query<RefreshRow[]>(
      `SELECT \`token_hash\`, \`user_id\`, \`expires_at\`, \`created_at\`
         FROM \`refresh_tokens\` WHERE \`token_hash\` = ? LIMIT 1`,
      [tokenHash],
    );
    return rows.length === 0 ? null : mapRow(rows[0] as RefreshRow);
  }

  async revokeByHash(tokenHash: string): Promise<void> {
    await this.pool.query(
      'UPDATE `refresh_tokens` SET `revoked_at` = NOW() WHERE `token_hash` = ? AND `revoked_at` IS NULL',
      [tokenHash],
    );
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.pool.query(
      'UPDATE `refresh_tokens` SET `revoked_at` = NOW() WHERE `user_id` = ? AND `revoked_at` IS NULL',
      [userId],
    );
  }
}
