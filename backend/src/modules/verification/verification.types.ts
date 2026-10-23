export interface VerificationDocument {
  id: string;
  provider_id: string;
  type: 'HURU_REPORT' | 'ID_COPY' | 'PROOF_OF_RESIDENCE' | 'QUALIFICATION' | 'PROFILE_PICTURE' | 'SELFIE';
  original_name: string;
  stored_name: string;
  mime: string;
  size: number;
  status: 'uploaded' | 'approved' | 'rejected';
  rejection_reason: string | null;
  document_date: string; // YYYY-MM-DD
  created_at: string;
}

export interface ProviderVerificationStatus {
  status: 'unverified' | 'pending' | 'verified' | 'rejected';
  huru_report: {
    status: 'missing' | 'uploaded' | 'approved' | 'rejected';
    document_date: string | null;
  };
  certified_id: {
    status: 'missing' | 'uploaded' | 'approved' | 'rejected';
  };
  proof_of_residence: {
    status: 'missing' | 'uploaded' | 'approved' | 'rejected';
  };
  qualifications: {
    status: 'missing' | 'uploaded' | 'approved' | 'rejected';
    count: number;
  };
  profile_picture: {
    status: 'missing' | 'uploaded' | 'approved' | 'rejected';
  };
  selfie: {
    status: 'missing' | 'uploaded' | 'approved' | 'rejected';
  };
  phone_verified: boolean;
  email_verified: boolean;
  pending_since: string | null;
}

export interface OTPResult {
  code: string;
  expiresAt: string;
}

export interface PhoneCodeVerification {
  phone: string;
  code: string;
  attempts: number;
  lockedUntil: string | null;
}

export interface EmailVerification {
  email: string;
  link: string;
  expiresAt: string;
}