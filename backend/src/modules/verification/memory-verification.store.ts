import type {
  NewVerificationDocument,
  VerificationDocument,
  VerificationDocumentStore,
} from './verification.store';

export class MemoryVerificationDocumentStore
  implements VerificationDocumentStore
{
  private readonly documents: VerificationDocument[] = [];
  private readonly profileIds = new Map<string, string>();
  private nextProfileId = 1;
  private nextDocumentId = 1;

  async findProfessionalProfileByUserId(
    userId: string,
  ): Promise<string | null> {
    const existing = this.profileIds.get(userId);
    if (existing) return existing;

    const id = String(this.nextProfileId++);
    this.profileIds.set(userId, id);
    return id;
  }

  async create(
    input: NewVerificationDocument,
  ): Promise<VerificationDocument> {
    const document: VerificationDocument = {
      id: String(this.nextDocumentId++),
      provider_id: input.providerId,
      type: input.type,
      original_name: input.originalName,
      stored_name: input.storedName,
      mime: input.mime,
      size: input.size,
      status: 'uploaded',
      rejection_reason: null,
      document_date: input.documentDate,
      created_at: new Date().toISOString(),
    };

    this.documents.push(document);
    return { ...document };
  }

  async listByProvider(
    providerId: string,
  ): Promise<VerificationDocument[]> {
    return this.documents
      .filter((document) => document.provider_id === providerId)
      .slice()
      .sort(
        (a, b) =>
          b.created_at.localeCompare(a.created_at) ||
          Number(b.id) - Number(a.id),
      );
  }

  async findOwnedDocument(
    userId: string,
    documentId: string,
  ): Promise<VerificationDocument | null> {
    const providerId = this.profileIds.get(userId);
    if (!providerId) return null;

    const document = this.documents.find(
      (item) => item.id === documentId && item.provider_id === providerId,
    );

    return document ? { ...document } : null;
  }

  async delete(providerId: string, documentId: string): Promise<boolean> {
    const index = this.documents.findIndex((d) => d.id === documentId && d.provider_id === providerId);
    if (index === -1) return false;
    this.documents.splice(index, 1);
    return true;
  }
}
