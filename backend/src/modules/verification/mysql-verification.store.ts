import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  NewVerificationDocument,
  VerificationDocument,
  VerificationDocumentStore,
} from './verification.store';

interface VerificationDocumentDbRow extends RowDataPacket {
  id: number | string;
  provider_id: number | string;
  type: VerificationDocument['type'];
  original_name: string;
  stored_name: string;
  mime: string;
  size: number | string;
  status: VerificationDocument['status'];
  rejection_reason: string | null;
  document_date: Date | string;
  created_at: Date | string;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDateString(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function toNumericId(value: string): number | null {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 1 ? numeric : null;
}

function mapRow(row: VerificationDocumentDbRow): VerificationDocument {
  return {
    id: String(row.id),
    provider_id: String(row.provider_id),
    type: row.type,
    original_name: row.original_name,
    stored_name: row.stored_name,
    mime: row.mime,
    size: Number(row.size),
    status: row.status,
    rejection_reason: row.rejection_reason,
    document_date: toDateString(row.document_date),
    created_at: toIso(row.created_at),
  };
}

const SELECT_COLUMNS = `
  id, provider_id, type, original_name, stored_name, mime, size,
  status, rejection_reason, document_date, created_at
`;

export class MysqlVerificationDocumentStore implements VerificationDocumentStore {
  constructor(private readonly pool: Pool) {}

  async findProfessionalProfileByUserId(userId: string): Promise<string | null> {
    const numericUserId = toNumericId(userId);
    if (numericUserId === null) return null;

    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id
       FROM professional_profiles
       WHERE user_id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [numericUserId],
    );

    return rows.length > 0 ? String(rows[0]['id']) : null;
  }

  async create(input: NewVerificationDocument): Promise<VerificationDocument> {
    const providerId = toNumericId(input.providerId);
    if (providerId === null) throw new Error('Invalid professional profile ID.');

    const [result] = await this.pool.query<ResultSetHeader>(
      `INSERT INTO verification_documents
       (provider_id, type, original_name, stored_name, mime, size, document_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        providerId,
        input.type,
        input.originalName,
        input.storedName,
        input.mime,
        input.size,
        input.documentDate,
      ],
    );

    const [rows] = await this.pool.query<VerificationDocumentDbRow[]>(
      `SELECT ${SELECT_COLUMNS}
       FROM verification_documents
       WHERE id = ?
       LIMIT 1`,
      [result.insertId],
    );

    if (rows.length === 0) {
      throw new Error('The uploaded document record could not be retrieved.');
    }

    return mapRow(rows[0]);
  }

  async listByProvider(providerId: string): Promise<VerificationDocument[]> {
    const numericProviderId = toNumericId(providerId);
    if (numericProviderId === null) return [];

    const [rows] = await this.pool.query<VerificationDocumentDbRow[]>(
      `SELECT ${SELECT_COLUMNS}
       FROM verification_documents
       WHERE provider_id = ?
       ORDER BY created_at DESC, id DESC`,
      [numericProviderId],
    );

    return rows.map(mapRow);
  }

  async findOwnedDocument(
    userId: string,
    documentId: string,
  ): Promise<VerificationDocument | null> {
    const numericUserId = toNumericId(userId);
    const numericDocumentId = toNumericId(documentId);
    if (numericUserId === null || numericDocumentId === null) return null;

    const [rows] = await this.pool.query<VerificationDocumentDbRow[]>(
      `SELECT d.id, d.provider_id, d.type, d.original_name, d.stored_name, d.mime, d.size,
              d.status, d.rejection_reason, d.document_date, d.created_at
       FROM verification_documents d
       INNER JOIN professional_profiles p ON p.id = d.provider_id
       WHERE p.user_id = ?
         AND p.deleted_at IS NULL
         AND d.id = ?
       LIMIT 1`,
      [numericUserId, numericDocumentId],
    );

    return rows.length > 0 ? mapRow(rows[0]) : null;
  }

  async delete(providerId: string, documentId: string): Promise<boolean> {
    const numericProviderId = toNumericId(providerId);
    const numericDocumentId = toNumericId(documentId);
    if (numericProviderId === null || numericDocumentId === null) return false;
    const [result] = await this.pool.query<ResultSetHeader>(
      'DELETE FROM verification_documents WHERE id = ? AND provider_id = ?',
      [numericDocumentId, numericProviderId],
    );
    return result.affectedRows > 0;
  }
}
