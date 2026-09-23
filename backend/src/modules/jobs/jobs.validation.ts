/**
 * FixLink Stage 6B — customer job request validation.
 *
 * Server-side validation is authoritative; Angular validation is UX only.
 * Fields the frontend must never control (`customer_id`, `source`,
 * `status`, timestamps, ownership) are not accepted here at all — unknown
 * protected keys are ignored by the service, never honoured.
 */
import { parseProviderId, type ParsedProviderId } from '../marketplace/marketplace.store';
import type { CreateJobInput } from './jobs.types';

const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 2000;
const LOCATION_MAX = 255;
const NOTES_MAX = 500;

export interface ValidatedCreateJob {
  input: (CreateJobInput & { notes: string | null }) | null;
  /** Malformed ids (shape) are 400; semantic failures map in the service. */
  error: { status: number; code: string; message: string } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(body: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === 'string') return value;
  }
  return null;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Validate a POST /api/v1/jobs body.
 * Returns status 400 for malformed ids/shapes, 422 for content problems.
 */
export function validateCreateJob(body: unknown): ValidatedCreateJob {
  const invalid = (status: number, message: string): ValidatedCreateJob => ({
    input: null,
    error: { status, code: 'VALIDATION_ERROR', message },
  });
  if (!isRecord(body)) return invalid(422, 'Invalid job request. Please check the form and try again.');

  // Provider: malformed shape -> 400 (matches marketplace provider-id handling).
  const rawProvider = readString(body, ['providerId', 'provider_id']);
  const parsed: ParsedProviderId | null = rawProvider === null ? null : parseProviderId(rawProvider);
  if (!parsed) return invalid(400, 'Invalid provider selected. Please choose a provider and try again.');

  // Service: malformed shape -> 400; unknown service -> 404 in the service.
  const rawService = readString(body, ['serviceId', 'service_id']);
  const serviceId = rawService === null ? null : rawService.trim();
  if (!serviceId || !/^[1-9][0-9]*$/.test(serviceId)) {
    return invalid(400, 'Invalid service selected. Please choose a service and try again.');
  }

  const rawDescription = readString(body, ['description']);
  const description = rawDescription === null ? '' : rawDescription.trim();
  if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    return invalid(
      422,
      `Please describe the work (at least ${DESCRIPTION_MIN} characters, up to ${DESCRIPTION_MAX}).`,
    );
  }

  const rawLocation = readString(body, ['location', 'address']);
  const location = rawLocation === null ? '' : rawLocation.trim();
  if (location.length < 1 || location.length > LOCATION_MAX) {
    return invalid(422, 'Please add the job location (up to 255 characters).');
  }

  // Preferred date: optional `YYYY-MM-DD` calendar date.
  const rawDate = readString(body, ['preferredDate', 'preferred_date']);
  let preferredDate: string | null = null;
  if (rawDate !== null && rawDate.trim() !== '') {
    const trimmed = rawDate.trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (!match) return invalid(422, 'Preferred date must use the format YYYY-MM-DD.');
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!isValidCalendarDate(year, month, day)) {
      return invalid(422, 'Preferred date is not a valid calendar date.');
    }
    preferredDate = `${match[1]}-${match[2]}-${match[3]}`;
  }

  // Preferred time: optional `HH:MM` 24-hour clock.
  const rawTime = readString(body, ['preferredTime', 'preferred_time']);
  let preferredTime: string | null = null;
  if (rawTime !== null && rawTime.trim() !== '') {
    const trimmed = rawTime.trim();
    const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(trimmed);
    if (!match) return invalid(422, 'Preferred time must use the 24-hour format HH:MM.');
    preferredTime = `${match[1]}:${match[2]}`;
  }

  // Optional free-text notes (e.g. photo context). Accepted and validated
  // but not persisted: job attachments/file infrastructure arrives later.
  const rawNotes = readString(body, ['notes', 'photoNote', 'photo_note']);
  let notes: string | null = null;
  if (rawNotes !== null && rawNotes.trim() !== '') {
    const trimmed = rawNotes.trim();
    if (trimmed.length > NOTES_MAX) {
      return invalid(422, 'Additional notes must be 500 characters or fewer.');
    }
    notes = trimmed;
  }

  return {
    input: {
      providerType: parsed.providerType,
      providerNumericId: parsed.numericId,
      serviceId,
      description,
      location,
      preferredDate,
      preferredTime,
      notes,
    },
    error: null,
  };
}
