/**
 * Stage 5A registration rules (from MVP-SCOPE.md + AGENTS.md + PERMISSIONS.md):
 *
 * Self-registration is open for marketplace / business-founder roles only:
 *   CUSTOMER (default), PROFESSIONAL, BUSINESS_OWNER
 *
 * These roles must NOT be self-assigned:
 *   BUSINESS_MANAGER, TECHNICIAN — provisioned by a business (invite flow, later stage)
 *   ADMIN — granted explicitly by the backend/platform (never via public registration)
 *
 * Registration is not gated on verification: a new CUSTOMER, PROFESSIONAL or
 * BUSINESS_OWNER is immediately ACTIVE and receives a session. Every role must
 * supply the name that its profile row requires, so the profile is created in
 * the same transaction:
 *
 *   CUSTOMER       firstName + lastName  -> customer_profiles
 *   PROFESSIONAL   displayName           -> professional_profiles
 *   BUSINESS_OWNER businessName          -> business_profiles
 *
 * The customer profile is created up front rather than lazily on the first job
 * request, because customer-scoped features resolve ownership through that row
 * and a new customer would otherwise get 404s until they posted a job. The
 * customer names are optional on the wire (older clients send none) and fall
 * back to derivation from the email; the registration form always sends them.
 */

export const SELF_REGISTER_ROLES = ['CUSTOMER', 'PROFESSIONAL', 'BUSINESS_OWNER'] as const;
export type SelfRegisterRole = (typeof SELF_REGISTER_ROLES)[number];

export const ALL_KNOWN_ROLES = [
  'CUSTOMER',
  'PROFESSIONAL',
  'BUSINESS_OWNER',
  'BUSINESS_MANAGER',
  'TECHNICIAN',
  'ADMIN',
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^0\d{9}$/;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Matches `professional_profiles.display_name` / `business_profiles.business_name`. */
export const PROFILE_NAME_MAX = 255;

/** Matches `customer_profiles.first_name` / `customer_profiles.last_name`. */
export const CUSTOMER_NAME_MAX = 128;

/**
 * A self-registering provider needs the name their customers see. Registration
 * therefore collects it up front so the provider profile is complete and
 * usable immediately — no verification step is required to use Fixlynk.
 */
export interface RegisterInput {
  email: string;
  password: string;
  phone: string | null;
  role: SelfRegisterRole;
  /** CUSTOMER only — `customer_profiles.first_name`. */
  firstName: string | null;
  /** CUSTOMER only — `customer_profiles.last_name`. */
  lastName: string | null;
  /** PROFESSIONAL only — the public display name on the provider profile. */
  displayName: string | null;
  /** BUSINESS_OWNER only — the business name on the business profile. */
  businessName: string | null;
}

export interface LoginInput {
  email: string;
  password: string;
}

/** Email normalisation: trim + lowercase (MVP rule — no provider-specific canonicalisation). */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Trimmed profile name from the body, or an error message. */
function readProfileName(
  raw: unknown,
  field: string,
  { required, max = PROFILE_NAME_MAX }: { required: boolean; max?: number },
): { value: string | null } | { error: string } {
  if (raw === undefined || raw === null || raw === '') {
    return required ? { error: `${field} is required.` } : { value: null };
  }
  if (typeof raw !== 'string') return { error: `${field} must be text.` };
  const trimmed = raw.trim();
  if (trimmed === '') return required ? { error: `${field} is required.` } : { value: null };
  if (trimmed.length > max) {
    return { error: `${field} must be at most ${max} characters.` };
  }
  return { value: trimmed };
}

export function validateRegister(body: unknown): { input?: RegisterInput; error?: string } {
  if (!isRecord(body)) return { error: 'Request body must be a JSON object.' };
  const { email, password, phone, role, firstName, lastName, displayName, businessName } = body;

  if (typeof email !== 'string' || email.trim() === '') return { error: 'Email is required.' };
  const normalised = normalizeEmail(email);
  if (normalised.length > 255) return { error: 'Email must be at most 255 characters.' };
  if (!EMAIL_RE.test(normalised)) return { error: 'Email format is invalid.' };

  if (typeof password !== 'string' || password === '') return { error: 'Password is required.' };
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { error: `Password must be at most ${PASSWORD_MAX_LENGTH} characters.` };
  }

  let normalisedPhone: string | null = null;
  if (phone !== undefined && phone !== null && phone !== '') {
    if (typeof phone !== 'string') return { error: 'Phone must be a string.' };
    const trimmed = phone.trim();
    if (!PHONE_RE.test(trimmed)) return { error: 'Enter a valid South African cell number (10 digits starting with 0).' };
    normalisedPhone = trimmed;
  }

  let requestedRole: SelfRegisterRole = 'CUSTOMER';
  if (role !== undefined && role !== null && role !== '') {
    if (typeof role !== 'string') return { error: 'Role must be a string.' };
    const upper = role.trim().toUpperCase();
    if ((SELF_REGISTER_ROLES as readonly string[]).includes(upper)) {
      requestedRole = upper as SelfRegisterRole;
    } else if ((ALL_KNOWN_ROLES as readonly string[]).includes(upper)) {
      return { error: `Role '${upper}' cannot be self-registered.` };
    } else {
      return { error: `Role '${role}' is not recognised.` };
    }
  }

  // Names are role-scoped: a name sent for another role is ignored rather than
  // rejected, so the same client form can post one body for any role card.
  // Optional on the wire so an existing client cannot be broken. A half-given
  // name is still an error: silently dropping one half would leave the other
  // applied, which is worse than asking for both.
  const first = readProfileName(firstName, 'First name', { required: false, max: CUSTOMER_NAME_MAX });
  if ('error' in first) return { error: first.error };
  const last = readProfileName(lastName, 'Last name', { required: false, max: CUSTOMER_NAME_MAX });
  if ('error' in last) return { error: last.error };
  if ((first.value === null) !== (last.value === null)) {
    return { error: 'Provide both a first name and a last name, or neither.' };
  }
  const display = readProfileName(displayName, 'Display name', { required: requestedRole === 'PROFESSIONAL' });
  if ('error' in display) return { error: display.error };
  const business = readProfileName(businessName, 'Business name', { required: requestedRole === 'BUSINESS_OWNER' });
  if ('error' in business) return { error: business.error };

  return {
    input: {
      email: normalised,
      password,
      phone: normalisedPhone,
      role: requestedRole,
      firstName: requestedRole === 'CUSTOMER' ? first.value : null,
      lastName: requestedRole === 'CUSTOMER' ? last.value : null,
      displayName: requestedRole === 'PROFESSIONAL' ? display.value : null,
      businessName: requestedRole === 'BUSINESS_OWNER' ? business.value : null,
    },
  };
}
export function validateLogin(body: unknown): { input?: LoginInput; error?: string } {
  if (!isRecord(body)) return { error: 'Request body must be a JSON object.' };
  const { email, password } = body;
  if (typeof email !== 'string' || email.trim() === '') return { error: 'Email is required.' };
  if (typeof password !== 'string' || password === '') return { error: 'Password is required.' };
  const normalised = normalizeEmail(email);
  if (!EMAIL_RE.test(normalised)) return { error: 'Email format is invalid.' };
  return { input: { email: normalised, password } };
}

export function validateRefresh(body: unknown): { refreshToken?: string; error?: string } {
  if (!isRecord(body)) return { error: 'Request body must be a JSON object.' };
  const { refreshToken } = body;
  if (typeof refreshToken !== 'string' || refreshToken.trim() === '') {
    return { error: 'Refresh token is required.' };
  }
  return { refreshToken: refreshToken.trim() };
}
