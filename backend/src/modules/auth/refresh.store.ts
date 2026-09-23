export interface RefreshSession {
  tokenHash: string;
  userId: string;
  expiresAtMs: number;
  createdAtMs: number;
}

export interface RefreshStore {
  save(session: RefreshSession): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshSession | null>;
  revokeByHash(tokenHash: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}

/**
 * In-memory refresh-session store (Stage 5A).
 *
 * Only SHA-256 hashes of opaque refresh tokens are kept — never the raw
 * token. Sessions rotate on every refresh and are revoked on logout.
 *
 * Known limitation (documented in docs/API.md): this store is per-process
 * and ephemeral. A persistent `refresh_tokens` table is the planned
 * hardening for multi-instance production use; no schema change is made
 * in Stage 5A because the existing schema already supports secure auth.
 */
export class MemoryRefreshStore implements RefreshStore {
  private readonly sessions = new Map<string, RefreshSession>();

  async save(session: RefreshSession): Promise<void> {
    this.pruneExpired();
    this.sessions.set(session.tokenHash, session);
  }

  async findByHash(tokenHash: string): Promise<RefreshSession | null> {
    const session = this.sessions.get(tokenHash) ?? null;
    if (!session) return null;
    if (session.expiresAtMs <= Date.now()) {
      this.sessions.delete(tokenHash);
      return null;
    }
    return session;
  }

  async revokeByHash(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    for (const [hash, session] of this.sessions) {
      if (session.userId === userId) this.sessions.delete(hash);
    }
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [hash, session] of this.sessions) {
      if (session.expiresAtMs <= now) this.sessions.delete(hash);
    }
  }
}
