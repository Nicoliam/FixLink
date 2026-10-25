export type VerificationOverallStatus = 'unverified' | 'pending' | 'verified' | 'rejected';
export type VerificationItemStatus = 'missing' | 'uploaded' | 'approved' | 'rejected';

export type VerificationDocumentType =
  | 'HURU_REPORT'
  | 'ID_COPY'
  | 'PROOF_OF_RESIDENCE'
  | 'QUALIFICATION'
  | 'PROFILE_PICTURE'
  | 'SELFIE';

/** One checklist row as returned by the status endpoint. */
export interface VerificationItem {
  status: VerificationItemStatus;
  document_id: string | null;
  file_name: string | null;
}

export interface VerificationStatus {
  status: VerificationOverallStatus;
  huru_report: VerificationItem & { document_date: string | null };
  certified_id: VerificationItem;
  proof_of_residence: VerificationItem;
  qualifications: VerificationItem & { count: number };
  profile_picture: VerificationItem;
  selfie: VerificationItem;
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