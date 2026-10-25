export type VerificationDocumentType =
  | 'HURU_REPORT'
  | 'ID_COPY'
  | 'PROOF_OF_RESIDENCE'
  | 'QUALIFICATION'
  | 'PROFILE_PICTURE'
  | 'SELFIE';

export type VerificationDocumentStatus = 'uploaded' | 'approved' | 'rejected';

export interface VerificationDocument {
  id: string;
  provider_id: string;
  type: VerificationDocumentType;
  original_name: string;
  stored_name: string;
  mime: string;
  size: number;
  status: VerificationDocumentStatus;
  rejection_reason: string | null;
  document_date: string;
  created_at: string;
}

export interface NewVerificationDocument {
  providerId: string;
  type: VerificationDocumentType;
  originalName: string;
  storedName: string;
  mime: string;
  size: number;
  documentDate: string;
}

export interface VerificationDocumentStore {
  findProfessionalProfileByUserId(userId: string): Promise<string | null>;
  create(input: NewVerificationDocument): Promise<VerificationDocument>;
  listByProvider(providerId: string): Promise<VerificationDocument[]>;
  findOwnedDocument(userId: string, documentId: string): Promise<VerificationDocument | null>;
  /** Delete one document that belongs to the given professional profile. */
  delete(providerId: string, documentId: string): Promise<boolean>;
}
