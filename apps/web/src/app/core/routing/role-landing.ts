import type { UserRole } from '../models/auth.model';

/**
 * Where a freshly authenticated user belongs.
 *
 * Login and registration both land here, so a new customer or provider is
 * dropped straight onto the surface they registered for instead of a generic
 * account page. Nothing about this is verification-gated: an account can use
 * its surface the moment the session exists.
 */
const ROLE_LANDING: Readonly<Record<UserRole, string>> = {
  ADMIN: '/admin',
  BUSINESS_OWNER: '/business',
  BUSINESS_MANAGER: '/business',
  TECHNICIAN: '/technician/jobs',
  PROFESSIONAL: '/requests',
  CUSTOMER: '/my-jobs',
};

/**
 * Precedence for multi-role accounts. A user who both requests work and
 * offers services is working as a provider, so provider roles win over
 * CUSTOMER; platform and business administration win over both.
 */
const ROLE_PRIORITY: readonly UserRole[] = [
  'ADMIN',
  'BUSINESS_OWNER',
  'BUSINESS_MANAGER',
  'TECHNICIAN',
  'PROFESSIONAL',
  'CUSTOMER',
];

/**
 * Fallback when the session has no recognised role (e.g. a seeded test user).
 *
 * The account page, not the marketing home page: a signed-in user with no
 * recognised role still has an account, and /account is where they can see and
 * fix it. Matches docs/USER-FLOWS.md section 2.2.
 */
export const DEFAULT_LANDING = '/account';

/** The highest-priority landing route for the given roles. */
export function roleLandingRoute(roles: readonly UserRole[] | null | undefined): string {
  for (const role of ROLE_PRIORITY) {
    if (roles?.includes(role)) return ROLE_LANDING[role];
  }
  return DEFAULT_LANDING;
}
