/**
 * FixLink Stage 7A — business foundation + technician management types.
 *
 * Businesses and technicians reuse the existing tables
 * (`business_profiles`, `business_members`, `technicians`, `users`) —
 * no new tables were created for this stage. The DTOs below expose only
 * appropriate public/business fields: verification documents, internal
 * notes, audit data and private member information are never selected
 * or returned.
 */

/** Effective business role of the caller, derived server-side from membership. */
export type BusinessAccessRole = 'OWNER' | 'MANAGER' | 'TECHNICIAN';

/** Businesses the user may act for (owner row or active membership). */
export interface BusinessIdentity {
  businessId: string;
  role: BusinessAccessRole;
}

/** Business profile projection returned by the API (no private data). */
export interface BusinessDto {
  id: string;
  businessName: string;
  slug: string;
  description: string | null;
  /** Logo storage reference (metadata only — never bytes or private paths). */
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
  /** The caller's own membership role in this business (server-derived). */
  role: 'OWNER' | 'MANAGER';
  /** Technicians currently on the roster (active + inactive rows). */
  technicianCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Technician roster projection (contact info only — never credentials). */
export interface TechnicianDto {
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

/** Validated business profile patch (all fields optional, at least one required). */
export interface UpdateBusinessInput {
  businessName?: string;
  description?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
}

/** Validated technician creation body. */
export interface CreateTechnicianInput {
  displayName: string;
  email: string;
  phone: string | null;
  /** Initial password — required only when the email has no account yet. */
  password: string | null;
}

/** Validated technician patch (at least one field required). */
export interface UpdateTechnicianInput {
  displayName?: string;
  isActive?: boolean;
}
