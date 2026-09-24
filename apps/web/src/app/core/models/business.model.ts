/**
 * Business foundation contracts for Stage 7A.
 *
 * These mirror the backend behaviour documented in docs/API.md
 * section 8.1. The business is derived server-side from the
 * authenticated membership — the client never sends a business_id.
 */

export type BusinessMembershipRole = 'OWNER' | 'MANAGER';

/** Business profile returned by GET/PATCH /api/v1/business/me. */
export interface Business {
  id: string;
  businessName: string;
  slug: string;
  description: string | null;
  logoReference: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  verificationStatus: string;
  ratingAvg: number;
  ratingCount: number;
  isActive: boolean;
  /** The caller's own membership role (server-derived). */
  role: BusinessMembershipRole;
  technicianCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Technician roster row returned by the /business/technicians endpoints. */
export interface Technician {
  id: string;
  businessId: string;
  userId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TechnicianList {
  items: Technician[];
  total: number;
}

export interface CreateTechnicianRequest {
  displayName: string;
  email: string;
  phone?: string;
  password?: string;
}

export interface UpdateTechnicianRequest {
  displayName?: string;
  isActive?: boolean;
}

export interface UpdateBusinessRequest {
  businessName?: string;
  description?: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  city?: string;
  province?: string;
  postalCode?: string;
}

/** Human-readable membership role for the dashboard. */
export function businessRoleLabel(role: BusinessMembershipRole): string {
  return role === 'OWNER' ? 'Owner' : 'Manager';
}

/** Human-readable verification state (badge text only — never a document). */
export function verificationLabel(status: string): string {
  switch (status) {
    case 'VERIFIED':
      return 'Verified';
    case 'PENDING':
      return 'Verification pending';
    case 'REJECTED':
      return 'Verification rejected';
    default:
      return 'Unverified';
  }
}
