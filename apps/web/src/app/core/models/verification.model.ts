export type VerificationOverallStatus = 'unverified' | 'pending' | 'verified' | 'rejected';
export type VerificationItemStatus = 'missing' | 'uploaded' | 'approved' | 'rejected';

export type VerificationDocumentType =
  | 'HURU_REPORT'
  | 'ID_COPY'
  | 'PROOF_OF_RESIDENCE'
  | 'QUALIFICATION'
  | 'PROFILE_PICTURE'
  | 'SELFIE';

export interface VerificationStatus {
  status: VerificationOverallStatus;
  huru_report: { status: VerificationItemStatus; document_date: string | null };
  certified_id: { status: VerificationItemStatus };
  proof_of_residence: { status: VerificationItemStatus };
  qualifications: { status: VerificationItemStatus; count: number };
  profile_picture: { status: VerificationItemStatus };
  selfie: { status: VerificationItemStatus };
  phone_verified: boolean;
  email_verified: boolean;
  pending_since: string | null;
}

/** Upload type sent to the server -> key in the status response. */
export const DOCUMENT_STATUS_KEY = {
  HURU_REPORT: 'huru_report',
  ID_COPY: 'certified_id',
  PROOF_OF_RESIDENCE: 'proof_of_residence',
  QUALIFICATION: 'qualifications',
  PROFILE_PICTURE: 'profile_picture',
  SELFIE: 'selfie',
} as const satisfies Record<VerificationDocumentType, keyof VerificationStatus>;