/**
 * Fixlynk — customer saved professional validation.
 *
 * Hand-rolled validators returning a Result, matching the convention in
 * offerings.validation.ts. Unknown fields are rejected outright so a client
 * can never smuggle server-owned values (the owning user id, the provider
 * type, timestamps) into a write.
 */
import { parseProviderId } from '../marketplace/marketplace.store';
import type { SavedProviderType } from './saved-providers.types';

type Result<T> = { value: T; error: string | null };

/** ISO-8601 timestamp as persisted. */
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strictBody(body: unknown, allowed: string[]): Result<Record<string, unknown> | null> {
  if (!record(body)) return { value: null, error: 'Request body must be an object.' };
  const unknown = Object.keys(body).find((key) => !allowed.includes(key));
  return unknown ? { value: null, error: `Unsupported field: "${unknown}".` } : { value: body, error: null };
}

/**
 * Validate a save request. Only `providerId` is accepted, and only in the
 * public marketplace form (`professional-<n>` / `business-<n>`). The
 * provider type is derived from that id rather than trusted separately, so a
 * client cannot claim to save a professional while naming a business.
 */
export function validateSaveProvider(body: unknown): Result<SavedProviderType | null> {
  const parsed = strictBody(body, ['providerId']);
  if (parsed.error) return { value: null, error: parsed.error };
  const providerId = parseProviderId(parsed.value?.['providerId']);
  if (!providerId) {
    return { value: null, error: 'providerId is invalid. Use "professional-<id>" or "business-<id>".' };
  }
  return { value: providerId.providerType === 'business' ? 'BUSINESS' : 'PROFESSIONAL', error: null };
}

/** Path parameter validation for the provider being saved or removed. */
export function validateProviderPathId(value: unknown): Result<SavedProviderType | null> {
  return validateSaveProvider({ providerId: value });
}

/** Reject anything that is not a stored timestamp, guarding row mapping. */
export function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && ISO_TIMESTAMP.test(value);
}
