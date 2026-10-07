/**
 * Fixlynk — provider service offering validation.
 *
 * Hand-rolled validators returning a Result, matching the convention in
 * admin.validation.ts. Unknown fields are rejected outright so a client can
 * never smuggle server-owned values (ownership, is_active, currency) into a
 * write.
 */
import type { OfferingMutationInput, OfferingProviderType } from './offerings.types';

type Result<T> = { value: T; error: string | null };

const NAME_MAX = 128;
const DESCRIPTION_MAX = 500;
/** DECIMAL(10,2) in migration 015. */
const PRICE_MAX = 99_999_999.99;
const PROVIDER_TYPES: readonly OfferingProviderType[] = ['PROFESSIONAL', 'BUSINESS'];

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(
  value: unknown,
  label: string,
  max: number,
  required = false,
): Result<string | null> {
  if (value === undefined || value === null) {
    return required ? { value: null, error: `${label} is required.` } : { value: null, error: null };
  }
  if (typeof value !== 'string') return { value: null, error: `${label} must be text.` };
  const trimmed = value.trim();
  if (required && trimmed === '') return { value: null, error: `${label} is required.` };
  if (trimmed.length > max) return { value: null, error: `${label} must be ${max} characters or fewer.` };
  return { value: trimmed === '' ? null : trimmed, error: null };
}

/** Positive integer primary key, supplied as a number or numeric string. */
function id(value: unknown, label: string): Result<string | null> {
  if (value === undefined || value === null || value === '') {
    return { value: null, error: `${label} is required.` };
  }
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^[1-9][0-9]*$/.test(raw)) return { value: null, error: `${label} is invalid.` };
  return { value: raw, error: null };
}

/**
 * Indicative price. Accepts a number or numeric string, rejects negatives,
 * non-finite values and more than two decimal places so the DECIMAL(10,2)
 * column can never silently round a provider's figure.
 */
function money(value: unknown, label: string): Result<number | null> {
  if (value === undefined || value === null || value === '') {
    return { value: null, error: `${label} is required.` };
  }
  const raw = typeof value === 'number' ? value : typeof value === 'string' ? value.trim() : Number.NaN;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return { value: null, error: `${label} must be a number.` };
  }
  if (raw < 0) return { value: null, error: `${label} cannot be negative.` };
  if (raw > PRICE_MAX) return { value: null, error: `${label} is too large.` };
  if (Math.round(raw * 100) !== raw * 100) {
    return { value: null, error: `${label} cannot have more than 2 decimal places.` };
  }
  return { value: raw, error: null };
}

function providerType(value: unknown): Result<OfferingProviderType | null> {
  if (value === undefined || value === null || value === '') return { value: null, error: null };
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!PROVIDER_TYPES.includes(raw as OfferingProviderType)) {
    return { value: null, error: 'providerType must be PROFESSIONAL or BUSINESS.' };
  }
  return { value: raw as OfferingProviderType, error: null };
}

function strictBody(body: unknown, allowed: string[]): Result<Record<string, unknown>> {
  if (!record(body)) return { value: null as never, error: 'Request body must be an object.' };
  const unknown = Object.keys(body).find((key) => !allowed.includes(key));
  return unknown
    ? { value: null as never, error: `Unsupported field: "${unknown}".` }
    : { value: body, error: null };
}

export interface ValidatedOfferingInput extends Partial<OfferingMutationInput> {
  providerType?: OfferingProviderType;
}

/**
 * Validate a create (`partial = false`) or update (`partial = true`) body.
 * On update at least one writable field must be present.
 */
export function validateOffering(
  body: unknown,
  partial = false,
): Result<ValidatedOfferingInput | null> {
  const parsed = strictBody(body, [
    'categoryId',
    'name',
    'description',
    'priceAmount',
    'providerType',
  ]);
  if (parsed.error) return { value: null as never, error: parsed.error };
  const b = parsed.value;

  // An offering is never moved between providers, so providerType is a
  // create-only field rather than a silently ignored one.
  if (partial && b['providerType'] !== undefined) {
    return { value: null as never, error: 'providerType cannot be changed.' };
  }

  const type = providerType(b['providerType']);
  if (type.error) return { value: null as never, error: type.error };
  const result: ValidatedOfferingInput = {};
  if (type.value !== null) result.providerType = type.value;

  if (!partial || b['categoryId'] !== undefined) {
    const v = id(b['categoryId'], 'categoryId');
    if (v.error) return { value: null as never, error: v.error };
    result.categoryId = v.value as string;
  }
  if (!partial || b['name'] !== undefined) {
    const v = text(b['name'], 'name', NAME_MAX, true);
    if (v.error) return { value: null as never, error: v.error };
    result.name = v.value as string;
  }
  if (b['description'] !== undefined) {
    const v = text(b['description'], 'description', DESCRIPTION_MAX);
    if (v.error) return { value: null as never, error: v.error };
    result.description = v.value;
  }
  // Price is OPTIONAL on create: a new professional or business picks their
  // services during registration, before they have decided what to charge, and
  // sets a price later on My Services. On update it stays optional too, since
  // omitting it must leave the stored price alone. Either way, a value that IS
  // supplied is validated exactly as before.
  if (b['priceAmount'] !== undefined) {
    if (b['priceAmount'] === null) {
      result.priceAmount = null;
    } else {
      const v = money(b['priceAmount'], 'priceAmount');
      if (v.error) return { value: null as never, error: v.error };
      result.priceAmount = v.value as number;
    }
  }

  const writable = (['categoryId', 'name', 'description', 'priceAmount'] as const).filter(
    (key) => result[key] !== undefined,
  );
  if (partial && writable.length === 0) {
    return { value: null as never, error: 'No offering changes supplied.' };
  }
  return { value: result, error: null };
}

/** Path parameter validation, reusing the same positive-integer rule. */
export function validateOfferingId(value: unknown): Result<string | null> {
  return id(value, 'id');
}