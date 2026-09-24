/**
 * FixLink Stage 7A — business + technician validation.
 *
 * Server-side validation is authoritative; Angular validation is UX only.
 * Fields the frontend must never control (business_id, owner_id,
 * technician business association, role, verification state, rating,
 * timestamps) are not accepted here at all — the service derives them
 * from the authenticated membership. Like the quote validators, unknown
 * fields are ignored (whitelisted reads); only the accepted fields are
 * validated.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+]?[0-9][0-9\s\-()]{5,18}[0-9]$/;

export const TECHNICIAN_NAME_MAX = 255;
export const BUSINESS_NAME_MAX = 255;
export const BUSINESS_DESCRIPTION_MAX = 2000;
export const BUSINESS_ADDRESS_MAX = 255;
export const BUSINESS_CITY_MAX = 128;
export const BUSINESS_POSTAL_MAX = 16;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalText(
  value: unknown,
  max: number,
): { present: boolean; value: string | null; error?: string } {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    return { present: false, value: null };
  }
  if (typeof value !== 'string') return { present: true, value: null, error: 'Invalid value.' };
  const trimmed = value.trim();
  if (trimmed.length > max) {
    return { present: true, value: null, error: `Must be ${max} characters or fewer.` };
  }
  return { present: true, value: trimmed };
}

function optionalEmail(value: unknown): { present: boolean; value: string | null; error?: string } {
  const parsed = optionalText(value, 255);
  if (!parsed.present || parsed.error || parsed.value === null) return parsed;
  if (!EMAIL_RE.test(parsed.value.toLowerCase())) {
    return { present: true, value: null, error: 'Email format is invalid.' };
  }
  return { present: true, value: parsed.value.toLowerCase() };
}

function optionalPhone(value: unknown): { present: boolean; value: string | null; error?: string } {
  const parsed = optionalText(value, 32);
  if (!parsed.present || parsed.error || parsed.value === null) return parsed;
  if (!PHONE_RE.test(parsed.value)) {
    return { present: true, value: null, error: 'Phone format is invalid.' };
  }
  return { present: true, value: parsed.value };
}

export interface ValidatedBusinessPatch {
  input: import('./business.types').UpdateBusinessInput | null;
  error: { status: number; code: string; message: string } | null;
}

/** Validate a PATCH /api/v1/business/me body (all fields optional, ≥1 required). */
export function validateBusinessPatch(body: unknown): ValidatedBusinessPatch {
  const invalid = (message: string): ValidatedBusinessPatch => ({
    input: null,
    error: { status: 422, code: 'VALIDATION_ERROR', message },
  });
  if (!isRecord(body)) return invalid('Invalid business profile. Please check the form and try again.');

  const input: import('./business.types').UpdateBusinessInput = {};

  const rawName = body['businessName'] ?? body['business_name'];
  if (rawName !== undefined && rawName !== null && String(rawName).trim() !== '') {
    if (typeof rawName !== 'string') return invalid('Business name must be text.');
    const trimmed = rawName.trim();
    if (trimmed.length < 1 || trimmed.length > BUSINESS_NAME_MAX) {
      return invalid(`Business name must be 1–${BUSINESS_NAME_MAX} characters.`);
    }
    input.businessName = trimmed;
  }

  const description = optionalText(body['description'], BUSINESS_DESCRIPTION_MAX);
  if (description.error) return invalid(`Description: ${description.error}`);
  if (description.present) input.description = description.value;

  const email = optionalEmail(body['email']);
  if (email.error) return invalid(email.error ?? 'Email format is invalid.');
  if (email.present) input.email = email.value;

  const phone = optionalPhone(body['phone']);
  if (phone.error) return invalid(phone.error ?? 'Phone format is invalid.');
  if (phone.present) input.phone = phone.value;

  const addressLine1 = optionalText(body['addressLine1'] ?? body['address_line1'], BUSINESS_ADDRESS_MAX);
  if (addressLine1.error) return invalid(`Address: ${addressLine1.error}`);
  if (addressLine1.present) input.addressLine1 = addressLine1.value;

  const city = optionalText(body['city'], BUSINESS_CITY_MAX);
  if (city.error) return invalid(`City: ${city.error}`);
  if (city.present) input.city = city.value;

  const province = optionalText(body['province'], BUSINESS_CITY_MAX);
  if (province.error) return invalid(`Province: ${province.error}`);
  if (province.present) input.province = province.value;

  const postalCode = optionalText(body['postalCode'] ?? body['postal_code'], BUSINESS_POSTAL_MAX);
  if (postalCode.error) return invalid(`Postal code: ${postalCode.error}`);
  if (postalCode.present) input.postalCode = postalCode.value;

  if (Object.keys(input).length === 0) {
    return invalid('No business profile changes supplied.');
  }
  return { input, error: null };
}

export interface ValidatedTechnicianCreate {
  input: import('./business.types').CreateTechnicianInput | null;
  error: { status: number; code: string; message: string } | null;
}

/** Validate a POST /api/v1/business/technicians body. */
export function validateTechnicianCreate(body: unknown): ValidatedTechnicianCreate {
  const invalid = (message: string): ValidatedTechnicianCreate => ({
    input: null,
    error: { status: 422, code: 'VALIDATION_ERROR', message },
  });
  if (!isRecord(body)) return invalid('Invalid technician. Please check the form and try again.');

  const rawName = body['displayName'] ?? body['name'] ?? body['display_name'];
  if (typeof rawName !== 'string' || rawName.trim() === '') {
    return invalid('Technician name is required.');
  }
  const displayName = rawName.trim();
  if (displayName.length > TECHNICIAN_NAME_MAX) {
    return invalid(`Technician name must be ${TECHNICIAN_NAME_MAX} characters or fewer.`);
  }

  const rawEmail = body['email'];
  if (typeof rawEmail !== 'string' || rawEmail.trim() === '') {
    return invalid('Technician email is required.');
  }
  const email = rawEmail.trim().toLowerCase();
  if (email.length > 255 || !EMAIL_RE.test(email)) {
    return invalid('Technician email format is invalid.');
  }

  const phone = optionalPhone(body['phone']);
  if (phone.error) return invalid(phone.error ?? 'Phone format is invalid.');

  // The password seeds the login for a brand-new account only; the
  // service requires it for new emails and rejects it for existing ones.
  const rawPassword = body['password'];
  let password: string | null = null;
  if (rawPassword !== undefined && rawPassword !== null && String(rawPassword) !== '') {
    if (typeof rawPassword !== 'string') return invalid('Password must be a string.');
    if (rawPassword.length < PASSWORD_MIN_LENGTH) {
      return invalid(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
    }
    if (rawPassword.length > PASSWORD_MAX_LENGTH) {
      return invalid(`Password must be at most ${PASSWORD_MAX_LENGTH} characters.`);
    }
    password = rawPassword;
  }

  return { input: { displayName, email, phone: phone.present ? phone.value : null, password }, error: null };
}

export interface ValidatedTechnicianPatch {
  input: import('./business.types').UpdateTechnicianInput | null;
  error: { status: number; code: string; message: string } | null;
}

/** Validate a PATCH /api/v1/business/technicians/:id body (≥1 field required). */
export function validateTechnicianPatch(body: unknown): ValidatedTechnicianPatch {
  const invalid = (message: string): ValidatedTechnicianPatch => ({
    input: null,
    error: { status: 422, code: 'VALIDATION_ERROR', message },
  });
  if (!isRecord(body)) return invalid('Invalid technician update. Please check the form and try again.');

  const input: import('./business.types').UpdateTechnicianInput = {};

  const rawName = body['displayName'] ?? body['name'] ?? body['display_name'];
  if (rawName !== undefined && rawName !== null && String(rawName).trim() !== '') {
    if (typeof rawName !== 'string') return invalid('Technician name must be text.');
    const trimmed = rawName.trim();
    if (trimmed.length > TECHNICIAN_NAME_MAX) {
      return invalid(`Technician name must be ${TECHNICIAN_NAME_MAX} characters or fewer.`);
    }
    input.displayName = trimmed;
  }

  const rawActive = body['isActive'] ?? body['active'] ?? body['is_active'];
  if (rawActive !== undefined && rawActive !== null) {
    if (typeof rawActive !== 'boolean') {
      return invalid('Technician status must be true or false.');
    }
    input.isActive = rawActive;
  }

  if (Object.keys(input).length === 0) {
    return invalid('No technician changes supplied.');
  }
  return { input, error: null };
}
