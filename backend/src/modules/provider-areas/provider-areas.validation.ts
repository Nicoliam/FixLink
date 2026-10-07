/**
 * Fixlynk Step 14 — service-area input validation.
 *
 * Server-side validation is authoritative; Angular validation is UX only.
 *
 * `areas` is validated as a whole because the endpoint REPLACES the caller's
 * list. A partially-valid list must be rejected outright rather than partially
 * applied, or a typo in the third area would silently drop the first two.
 */
import {
  AREA_CITY_MAX,
  AREA_NAME_MAX,
  AREA_PROVINCE_MAX,
  MAX_PROVIDER_AREAS,
  type ProviderAreaInput,
} from './provider-areas.types';

export interface ValidatedProviderAreas {
  areas: ProviderAreaInput[] | null;
  error: { status: number; code: string; message: string } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Optional free-text field: absent, null or an all-whitespace string all mean
 * "not supplied" and yield null rather than an empty string. An empty string
 * in a NOT NULL column would otherwise round-trip to the API as `""` and then
 * match every location.
 */
function optionalText(value: unknown, max: number, label: string): { ok: true; value: string | null } | { ok: false; message: string } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, message: `${label} must be text.` };
  const trimmed = value.trim();
  if (trimmed === '') return { ok: true, value: null };
  if (trimmed.length > max) return { ok: false, message: `${label} must be ${max} characters or fewer.` };
  return { ok: true, value: trimmed };
}

export function validateProviderAreas(body: unknown): ValidatedProviderAreas {
  const invalid = (message: string): ValidatedProviderAreas => ({
    areas: null,
    error: { status: 422, code: 'VALIDATION_ERROR', message },
  });
  if (!isRecord(body)) return invalid('Invalid service areas. Please check the form and try again.');

  const raw = body['areas'];
  if (!Array.isArray(raw)) {
    return invalid('Please supply the areas you service as a list.');
  }
  if (raw.length < 1) {
    // An empty list is not a valid "publish nothing": it is how a caller
    // would accidentally wipe a working provider's coverage. There is no
    // unpublish path, and there does not need to be one in the MVP.
    return invalid(`Please add at least one area you service.`);
  }
  if (raw.length > MAX_PROVIDER_AREAS) {
    return invalid(`Please list at most ${MAX_PROVIDER_AREAS} areas.`);
  }

  const areas: ProviderAreaInput[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!isRecord(entry)) return invalid('Each area must be an object with an area name.');
    const rawName = entry['areaName'] ?? entry['area_name'];
    if (typeof rawName !== 'string') return invalid('Please name each area you service.');
    const areaName = rawName.trim();
    if (areaName.length < 1 || areaName.length > AREA_NAME_MAX) {
      return invalid(`Area name must be 1-${AREA_NAME_MAX} characters.`);
    }

    const city = optionalText(entry['city'], AREA_CITY_MAX, 'City');
    if (!city.ok) return invalid(city.message);
    const province = optionalText(entry['province'], AREA_PROVINCE_MAX, 'Province');
    if (!province.ok) return invalid(province.message);

    // Duplicate areas are a data-quality problem, not a matching one: they
    // would widen nothing and make the profile look padded. Case-insensitive
    // so "Randburg" and "randburg" count as one.
    const key = areaName.toLowerCase();
    if (seen.has(key)) return invalid(`"${areaName}" is listed more than once.`);
    seen.add(key);

    areas.push({ areaName, city: city.value, province: province.value });
  }

  return { areas, error: null };
}