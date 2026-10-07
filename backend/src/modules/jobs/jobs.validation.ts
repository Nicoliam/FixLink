/**
 * Fixlynk Stage 6B — customer job request validation.
 *
 * Server-side validation is authoritative; Angular validation is UX only.
 * Fields the frontend must never control (`customer_id`, `source`,
 * `status`, timestamps, ownership) are not accepted here at all — unknown
 * protected keys are ignored by the service, never honoured.
 */
import { parseProviderId, type ParsedProviderId } from '../marketplace/marketplace.store';
import type { CreateJobInput, UpdateJobInput } from './jobs.types';

const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 2000;
const LOCATION_MAX = 255;
const NOTES_MAX = 500;

export interface ValidatedCreateJob {
  input: (CreateJobInput & { notes: string | null }) | null;
  /** Malformed ids (shape) are 400; semantic failures map in the service. */
  error: { status: number; code: string; message: string } | null;
}

export interface ValidatedUpdateJob {
  input: UpdateJobInput | null;
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
 *
 * Step 14: `providerId` is OPTIONAL. Three outcomes are distinguished, and
 * conflating them would be a real bug:
 *
 *   absent, or present but blank  -> null/null -> an OPEN REQUEST
 *   present and well-formed       -> addressed to that provider
 *   present and malformed         -> 400
 *
 * A blank string is treated as absent rather than malformed because that is
 * what an HTML form sends for an untouched optional field. Anything else
 * non-empty is a client bug and must fail loudly rather than quietly posting
 * an open request the customer did not ask for.
 */
export function validateCreateJob(body: unknown): ValidatedCreateJob {
  const invalid = (status: number, message: string): ValidatedCreateJob => ({
    input: null,
    error: { status, code: 'VALIDATION_ERROR', message },
  });
  if (!isRecord(body)) return invalid(422, 'Invalid job request. Please check the form and try again.');

  // Provider: optional. Absent/blank -> open request. Present but malformed -> 400.
  const rawProvider = readString(body, ['providerId', 'provider_id']);
  const providerSupplied = rawProvider !== null && rawProvider.trim() !== '';
  const parsed: ParsedProviderId | null = providerSupplied ? parseProviderId(rawProvider) : null;
  if (providerSupplied && !parsed) {
    return invalid(400, 'Invalid provider selected. Please choose a provider and try again.');
  }

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
      providerType: parsed?.providerType ?? null,
      providerNumericId: parsed?.numericId ?? null,
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

/**
 * Step 15 - validate a customer edit.
 *
 * Deliberately partial: an omitted key means "leave this alone", which is what
 * makes a small correction safe on a long form. Only the four customer-supplied
 * fields are accepted; `serviceId` and `providerId` are rejected by omission
 * rather than by an ignore-list, so a client that sends them gets a clear
 * error instead of silently believing they changed something.
 *
 * `preferredDate` / `preferredTime` accept an explicit null to CLEAR the
 * preference. That is the only way to remove one, and it matters because
 * "no preference" and "never set" are the same thing to a customer who is
 * being asked to correct a form.
 */
export function validateUpdateJob(body: unknown): ValidatedUpdateJob {
  const invalid = (message: string): ValidatedUpdateJob => ({
    input: null,
    error: { status: 422, code: 'VALIDATION_ERROR', message },
  });
  if (!isRecord(body)) return invalid('Invalid changes. Please check the form and try again.');

  if ('serviceId' in body || 'providerId' in body) {
    return invalid('The service and the professional cannot be changed after a request is sent. Cancel and post a new request instead.');
  }
  if ('status' in body || 'source' in body || 'customerId' in body || 'customer_id' in body) {
    return invalid('Changes to a request cannot include its status or ownership.');
  }

  const input: UpdateJobInput = {};
  let supplied = 0;

  if ('description' in body) {
    const raw = body['description'];
    if (typeof raw !== 'string') return invalid('Please describe the work as text.');
    const description = raw.trim();
    if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
      return invalid(
        `Please describe the work (at least ${DESCRIPTION_MIN} characters, up to ${DESCRIPTION_MAX}).`,
      );
    }
    input.description = description;
    supplied += 1;
  }

  if ('location' in body) {
    const raw = body['location'];
    if (typeof raw !== 'string') return invalid('Please add the job location as text.');
    const location = raw.trim();
    if (location.length < 1 || location.length > LOCATION_MAX) {
      return invalid('Please add the job location (up to 255 characters).');
    }
    input.location = location;
    supplied += 1;
  }

  if ('preferredDate' in body || 'preferred_date' in body) {
    const raw = body['preferredDate'] ?? body['preferred_date'];
    if (raw === null || raw === undefined) {
      input.preferredDate = null;
      supplied += 1;
    } else {
      if (typeof raw !== 'string') return invalid('Preferred date must be a date.');
      const trimmed = raw.trim();
      if (trimmed === '') {
        input.preferredDate = null;
        supplied += 1;
      } else {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
        if (!match) return invalid('Preferred date must use the format YYYY-MM-DD.');
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        if (!isValidCalendarDate(year, month, day)) {
          return invalid('Preferred date is not a valid calendar date.');
        }
        input.preferredDate = `${match[1]}-${match[2]}-${match[3]}`;
        supplied += 1;
      }
    }
  }

  if ('preferredTime' in body || 'preferred_time' in body) {
    const raw = body['preferredTime'] ?? body['preferred_time'];
    if (raw === null || raw === undefined) {
      input.preferredTime = null;
      supplied += 1;
    } else {
      if (typeof raw !== 'string') return invalid('Preferred time must be a time.');
      const trimmed = raw.trim();
      if (trimmed === '') {
        input.preferredTime = null;
        supplied += 1;
      } else {
        const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(trimmed);
        if (!match) return invalid('Preferred time must use the 24-hour format HH:MM.');
        input.preferredTime = `${match[1]}:${match[2]}`;
        supplied += 1;
      }
    }
  }

  if (supplied === 0) return invalid('No changes were supplied. Please change at least one detail.');
  return { input, error: null };
}
