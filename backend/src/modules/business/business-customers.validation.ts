/**
 * FixLink Stage 7B — business-managed customer validation.
 *
 * Server-side validation is authoritative; Angular validation is UX only.
 * Fields the frontend must never control (`business_id`, `user_id`,
 * timestamps) are not accepted here at all — the service derives the
 * owning business from the authenticated membership. Unknown fields are
 * ignored (whitelisted reads); only the accepted fields are validated.
 * Column limits mirror migration 003 (`first_name`/`last_name` 128,
 * `email` 255, `phone` 32).
 */

import type {
  BusinessCustomerContact,
  CreateBusinessCustomerInput,
  UpdateBusinessCustomerInput,
} from './business.types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+]?[0-9][0-9\s\-()]{5,18}[0-9]$/;

const FIRST_NAME_MAX = 128;
const LAST_NAME_MAX = 128;
const EMAIL_MAX = 255;
const PHONE_MAX = 32;

const CONTACTS: readonly BusinessCustomerContact[] = ['EMAIL', 'PHONE', 'WHATSAPP'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(body: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = body[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

function fail<T>(message: string): { input: T | null; error: { status: number; code: string; message: string } } {
  return { input: null, error: { status: 422, code: 'VALIDATION_ERROR', message } };
}

function parseName(value: unknown, label: string, max: number): { value?: string; error?: string } {
  if (typeof value !== 'string' || value.trim() === '') {
    return { error: `${label} is required.` };
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    return { error: `${label} must be ${max} characters or fewer.` };
  }
  return { value: trimmed };
}

/** Split a free-text `name` into first/last parts (first token + remainder). */
function splitName(raw: string): { firstName: string; lastName: string } {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0] as string, lastName: parts[0] as string };
  return { firstName: parts[0] as string, lastName: parts.slice(1).join(' ') };
}

function parseOptionalEmail(value: unknown): { present: boolean; value: string | null; error?: string } {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    return { present: false, value: null };
  }
  if (typeof value !== 'string') return { present: true, value: null, error: 'Email format is invalid.' };
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length > EMAIL_MAX || !EMAIL_RE.test(trimmed)) {
    return { present: true, value: null, error: 'Email format is invalid.' };
  }
  return { present: true, value: trimmed };
}

function parseOptionalPhone(value: unknown): { present: boolean; value: string | null; error?: string } {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    return { present: false, value: null };
  }
  if (typeof value !== 'string') return { present: true, value: null, error: 'Phone format is invalid.' };
  const trimmed = value.trim();
  if (trimmed.length > PHONE_MAX || !PHONE_RE.test(trimmed)) {
    return { present: true, value: null, error: 'Phone format is invalid.' };
  }
  return { present: true, value: trimmed };
}

function parseOptionalContact(value: unknown): {
  present: boolean;
  value: BusinessCustomerContact | null;
  error?: string;
} {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    return { present: false, value: null };
  }
  if (typeof value !== 'string') {
    return { present: true, value: null, error: 'Preferred contact must be EMAIL, PHONE or WHATSAPP.' };
  }
  const upper = value.trim().toUpperCase();
  if (!CONTACTS.includes(upper as BusinessCustomerContact)) {
    return { present: true, value: null, error: 'Preferred contact must be EMAIL, PHONE or WHATSAPP.' };
  }
  return { present: true, value: upper as BusinessCustomerContact };
}

export interface ValidatedBusinessCustomerCreate {
  input: CreateBusinessCustomerInput | null;
  error: { status: number; code: string; message: string } | null;
}

/** Validate a POST /api/v1/business/customers body. */
export function validateBusinessCustomerCreate(body: unknown): ValidatedBusinessCustomerCreate {
  if (!isRecord(body)) return fail('Invalid customer. Please check the form and try again.');

  let rawFirst = readString(body, ['firstName', 'first_name']);
  let rawLast = readString(body, ['lastName', 'last_name']);
  if ((rawFirst === undefined || rawLast === undefined) && readString(body, ['name', 'displayName', 'display_name']) !== undefined) {
    const rawName = readString(body, ['name', 'displayName', 'display_name']);
    if (typeof rawName === 'string' && rawName.trim() !== '') {
      const split = splitName(rawName);
      if (rawFirst === undefined) rawFirst = split.firstName;
      if (rawLast === undefined) rawLast = split.lastName;
    }
  }

  const first = parseName(rawFirst, 'First name', FIRST_NAME_MAX);
  if (first.error || !first.value) return fail(first.error ?? 'First name is required.');
  const last = parseName(rawLast, 'Last name', LAST_NAME_MAX);
  if (last.error || !last.value) return fail(last.error ?? 'Last name is required.');

  const email = parseOptionalEmail(readString(body, ['email']));
  if (email.error) return fail(email.error);
  const phone = parseOptionalPhone(readString(body, ['phone']));
  if (phone.error) return fail(phone.error);
  const contact = parseOptionalContact(readString(body, ['preferredContact', 'preferred_contact']));
  if (contact.error) return fail(contact.error);

  return {
    input: {
      firstName: first.value,
      lastName: last.value,
      email: email.present ? email.value : null,
      phone: phone.present ? phone.value : null,
      preferredContact: contact.present ? contact.value : null,
    },
    error: null,
  };
}

export interface ValidatedBusinessCustomerPatch {
  input: UpdateBusinessCustomerInput | null;
  error: { status: number; code: string; message: string } | null;
}

/** Validate a PATCH /api/v1/business/customers/:customerId body (≥1 field required). */
export function validateBusinessCustomerPatch(body: unknown): ValidatedBusinessCustomerPatch {
  if (!isRecord(body)) return fail('Invalid customer update. Please check the form and try again.');
  const input: UpdateBusinessCustomerInput = {};

  const rawFirst = readString(body, ['firstName', 'first_name']);
  if (rawFirst !== undefined && !(typeof rawFirst === 'string' && rawFirst.trim() === '')) {
    const parsed = parseName(rawFirst, 'First name', FIRST_NAME_MAX);
    if (parsed.error || !parsed.value) return fail(parsed.error ?? 'First name is required.');
    input.firstName = parsed.value;
  }

  const rawLast = readString(body, ['lastName', 'last_name']);
  if (rawLast !== undefined && !(typeof rawLast === 'string' && rawLast.trim() === '')) {
    const parsed = parseName(rawLast, 'Last name', LAST_NAME_MAX);
    if (parsed.error || !parsed.value) return fail(parsed.error ?? 'Last name is required.');
    input.lastName = parsed.value;
  }

  const rawEmail = readString(body, ['email']);
  if (rawEmail !== undefined) {
    if (rawEmail === null || (typeof rawEmail === 'string' && rawEmail.trim() === '')) {
      input.email = null;
    } else {
      const parsed = parseOptionalEmail(rawEmail);
      if (parsed.error || !parsed.present) return fail(parsed.error ?? 'Email format is invalid.');
      input.email = parsed.value;
    }
  }

  const rawPhone = readString(body, ['phone']);
  if (rawPhone !== undefined) {
    if (rawPhone === null || (typeof rawPhone === 'string' && rawPhone.trim() === '')) {
      input.phone = null;
    } else {
      const parsed = parseOptionalPhone(rawPhone);
      if (parsed.error || !parsed.present) return fail(parsed.error ?? 'Phone format is invalid.');
      input.phone = parsed.value;
    }
  }

  const rawContact = readString(body, ['preferredContact', 'preferred_contact']);
  if (rawContact !== undefined) {
    if (rawContact === null || (typeof rawContact === 'string' && rawContact.trim() === '')) {
      input.preferredContact = null;
    } else {
      const parsed = parseOptionalContact(rawContact);
      if (parsed.error || !parsed.present) {
        return fail(parsed.error ?? 'Preferred contact must be EMAIL, PHONE or WHATSAPP.');
      }
      input.preferredContact = parsed.value;
    }
  }

  if (Object.keys(input).length === 0) {
    return fail('No customer changes supplied.');
  }
  return { input, error: null };
}
