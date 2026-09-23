/**
 * Authentication contracts for Stage 5B.
 *
 * These mirror the Stage 5A backend behaviour documented in docs/API.md
 * section 4.1. Roles follow docs/PERMISSIONS.md.
 */

export type UserRole =
  | 'CUSTOMER'
  | 'PROFESSIONAL'
  | 'BUSINESS_OWNER'
  | 'BUSINESS_MANAGER'
  | 'TECHNICIAN'
  | 'ADMIN';

/**
 * Roles that may self-register via POST /api/v1/auth/register.
 * BUSINESS_MANAGER and TECHNICIAN are provisioned through the business
 * invite flow; ADMIN is granted explicitly by the platform. These must
 * never be selectable in the registration UI.
 */
export type SelfRegisterRole = 'CUSTOMER' | 'PROFESSIONAL' | 'BUSINESS_OWNER';

export interface SelfRegisterRoleOption {
  value: SelfRegisterRole;
  label: string;
  description: string;
}

export const SELF_REGISTER_ROLE_OPTIONS: readonly SelfRegisterRoleOption[] = [
  {
    value: 'CUSTOMER',
    label: 'Customer',
    description: 'Request home services, receive quotes and review completed work.',
  },
  {
    value: 'PROFESSIONAL',
    label: 'Professional',
    description: 'Offer services, submit quotes and manage your jobs.',
  },
  {
    value: 'BUSINESS_OWNER',
    label: 'Business owner',
    description: 'Register a service business and manage your team and jobs.',
  },
];

/** Safe user object returned by the backend (never contains password data). */
export interface AuthUser {
  id: string;
  email: string;
  phone: string | null;
  status: string;
  roles: UserRole[];
  createdAt: string;
  updatedAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  phone?: string;
  role?: SelfRegisterRole;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponseData {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export interface RegisterResponseData {
  user: AuthUser;
}

export interface RefreshResponseData {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export interface MeResponseData {
  user: AuthUser;
}

/** Lifecycle of the client-side authentication state. */
export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';
