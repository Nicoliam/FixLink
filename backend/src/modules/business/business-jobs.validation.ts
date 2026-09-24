/**
 * FixLink Stage 7B — internal business job validation.
 *
 * Server-side validation is authoritative; Angular validation is UX only.
 * Fields the frontend must never control (`business_id`, `customer
 * business association`, `job business association`, `source`,
 * `reference`, timestamps) are not accepted here at all — the service
 * derives ownership from the authenticated membership and sets
 * `source = INTERNAL` / `status = REQUESTED` itself. Status transitions
 * stay server-controlled: a `status` key on PATCH is rejected outright
 * (422), never honoured.
 */

import type {
  CreateInternalJobInput,
  InternalJobBoardCategory,
  InternalJobBoardSort,
  InternalJobPriority,
  InternalJobStatus,
  UpdateInternalJobInput,
} from './business.types';

const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 2000;
const TITLE_MAX = 255;
const ADDRESS_MAX = 255;
const CITY_MAX = 128;
const POSTAL_MAX = 16;
const SEARCH_MAX = 128;
const REASON_MAX = 500;

const PRIORITIES: readonly InternalJobPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

export const INTERNAL_JOB_STATUSES: readonly InternalJobStatus[] = [
  'REQUESTED',
  'QUOTED',
  'ACCEPTED',
  'SCHEDULED',
  'IN_PROGRESS',
  'AWAITING_PARTS',
  'COMPLETED',
  'CONFIRMED',
  'CLOSED',
  'CANCELLED',
  'DISPUTED',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readValue(body: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = body[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

function fail<T>(status: number, message: string): { input: T | null; error: { status: number; code: string; message: string } } {
  return { input: null, error: { status, code: 'VALIDATION_ERROR', message } };
}

function toDbDateTime(value: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ` +
    `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`
  );
}

function parseScheduledAt(body: Record<string, unknown>): { value?: string | null; error?: string } {
  const rawDirect = readValue(body, ['scheduledAt', 'scheduled_at']);
  if (typeof rawDirect === 'string' && rawDirect.trim() !== '') {
    const parsed = new Date(rawDirect.trim());
    if (Number.isNaN(parsed.getTime())) {
      return { error: 'Scheduled date/time is not a valid date.' };
    }
    return { value: toDbDateTime(parsed) };
  }
  if (rawDirect !== undefined && rawDirect !== null && !(typeof rawDirect === 'string' && rawDirect.trim() === '')) {
    return { error: 'Scheduled date/time is not a valid date.' };
  }
  const rawDate = readValue(body, ['preferredDate', 'preferred_date']);
  const rawTime = readValue(body, ['preferredTime', 'preferred_time']);
  const hasDate = typeof rawDate === 'string' && rawDate.trim() !== '';
  const hasTime = typeof rawTime === 'string' && rawTime.trim() !== '';
  if (!hasDate && !hasTime) return { value: null };
  if (hasDate) {
    const trimmed = (rawDate as string).trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (!match) return { error: 'Preferred date must use the format YYYY-MM-DD.' };
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (month < 1 || month > 12 || probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
      return { error: 'Preferred date is not a valid calendar date.' };
    }
    // Default site-visit hour when the business picks a date without a time.
    const time = hasTime ? (rawTime as string).trim() : '09:00';
    if (!/^([01][0-9]|2[0-3]):([0-5][0-9])$/.test(time)) {
      return { error: 'Preferred time must use the 24-hour format HH:MM.' };
    }
    return { value: `${trimmed} ${time}:00` };
  }
  return { error: 'Preferred time requires a preferred date.' };
}

function parsePriority(value: unknown): { value?: InternalJobPriority; error?: string } {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    return { value: 'NORMAL' };
  }
  if (typeof value !== 'string') return { error: 'Priority must be LOW, NORMAL, HIGH or URGENT.' };
  const upper = value.trim().toUpperCase();
  if (!PRIORITIES.includes(upper as InternalJobPriority)) {
    return { error: 'Priority must be LOW, NORMAL, HIGH or URGENT.' };
  }
  return { value: upper as InternalJobPriority };
}

function parseOptionalText(value: unknown, max: number): { present: boolean; value: string | null; error?: string } {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    return { present: false, value: null };
  }
  if (typeof value !== 'string') return { present: true, value: null, error: 'Invalid value.' };
  const trimmed = value.trim();
  if (trimmed.length > max) return { present: true, value: null, error: `Must be ${max} characters or fewer.` };
  return { present: true, value: trimmed };
}

export interface ValidatedInternalJobCreate {
  input: CreateInternalJobInput | null;
  error: { status: number; code: string; message: string } | null;
}

/** Validate a POST /api/v1/business/jobs body. */
export function validateInternalJobCreate(body: unknown): ValidatedInternalJobCreate {
  if (!isRecord(body)) return fail(422, 'Invalid job. Please check the form and try again.');

  const rawCustomer = readValue(body, ['customerId', 'customer_id']);
  const customerId = typeof rawCustomer === 'string' ? rawCustomer.trim() : '';
  if (!customerId || !/^[1-9][0-9]*$/.test(customerId)) {
    return fail(400, 'Invalid customer selected. Please choose a customer and try again.');
  }

  const rawService = readValue(body, ['serviceId', 'service_id']);
  const serviceId = typeof rawService === 'string' ? rawService.trim() : '';
  if (!serviceId || !/^[1-9][0-9]*$/.test(serviceId)) {
    return fail(400, 'Invalid service selected. Please choose a service and try again.');
  }

  const titleParsed = parseOptionalText(readValue(body, ['title']), TITLE_MAX);
  if (titleParsed.error) return fail(422, `Title: ${titleParsed.error}`);

  const rawDescription = readValue(body, ['description']);
  const description = typeof rawDescription === 'string' ? rawDescription.trim() : '';
  if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    return fail(
      422,
      `Please describe the work (at least ${DESCRIPTION_MIN} characters, up to ${DESCRIPTION_MAX}).`,
    );
  }

  const rawAddress = readValue(body, ['addressLine1', 'address_line1', 'address', 'location']);
  const addressLine1 = typeof rawAddress === 'string' ? rawAddress.trim() : '';
  if (addressLine1.length < 1 || addressLine1.length > ADDRESS_MAX) {
    return fail(422, 'Please add the job address (up to 255 characters).');
  }

  const city = parseOptionalText(readValue(body, ['city']), CITY_MAX);
  if (city.error) return fail(422, `City: ${city.error}`);
  const province = parseOptionalText(readValue(body, ['province']), CITY_MAX);
  if (province.error) return fail(422, `Province: ${province.error}`);
  const postalCode = parseOptionalText(readValue(body, ['postalCode', 'postal_code']), POSTAL_MAX);
  if (postalCode.error) return fail(422, `Postal code: ${postalCode.error}`);

  const priority = parsePriority(readValue(body, ['priority']));
  if (priority.error || !priority.value) return fail(422, priority.error ?? 'Invalid priority.');

  const scheduled = parseScheduledAt(body);
  if (scheduled.error) return fail(422, scheduled.error);

  return {
    input: {
      customerId,
      serviceId,
      title: titleParsed.present ? titleParsed.value : null,
      description,
      addressLine1,
      city: city.present ? city.value : null,
      province: province.present ? province.value : null,
      postalCode: postalCode.present ? postalCode.value : null,
      priority: priority.value,
      scheduledAt: scheduled.value ?? null,
    },
    error: null,
  };
}

export interface ValidatedInternalJobPatch {
  input: UpdateInternalJobInput | null;
  error: { status: number; code: string; message: string } | null;
}

/**
 * Validate a PATCH /api/v1/business/jobs/:jobId body.
 * A `status` key of any kind is rejected: status transitions are
 * server-controlled and never set directly by the business.
 */
export function validateInternalJobPatch(body: unknown): ValidatedInternalJobPatch {
  if (!isRecord(body)) return fail(422, 'Invalid job update. Please check the form and try again.');
  if ('status' in body) {
    return fail(422, 'Job status is controlled by the server and cannot be set directly.');
  }
  const input: UpdateInternalJobInput = {};

  if (readValue(body, ['title']) !== undefined) {
    const parsed = parseOptionalText(readValue(body, ['title']), TITLE_MAX);
    if (parsed.error) return fail(422, `Title: ${parsed.error}`);
    input.title = parsed.present ? parsed.value : null;
  }

  if (readValue(body, ['description']) !== undefined) {
    const raw = readValue(body, ['description']);
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (trimmed.length < DESCRIPTION_MIN || trimmed.length > DESCRIPTION_MAX) {
      return fail(
        422,
        `Please describe the work (at least ${DESCRIPTION_MIN} characters, up to ${DESCRIPTION_MAX}).`,
      );
    }
    input.description = trimmed;
  }

  const addressKeys = ['addressLine1', 'address_line1', 'address', 'location'];
  if (readValue(body, addressKeys) !== undefined) {
    const raw = readValue(body, addressKeys);
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (trimmed.length < 1 || trimmed.length > ADDRESS_MAX) {
      return fail(422, 'Please add the job address (up to 255 characters).');
    }
    input.addressLine1 = trimmed;
  }

  if (readValue(body, ['city']) !== undefined) {
    const parsed = parseOptionalText(readValue(body, ['city']), CITY_MAX);
    if (parsed.error) return fail(422, `City: ${parsed.error}`);
    input.city = parsed.present ? parsed.value : null;
  }
  if (readValue(body, ['province']) !== undefined) {
    const parsed = parseOptionalText(readValue(body, ['province']), CITY_MAX);
    if (parsed.error) return fail(422, `Province: ${parsed.error}`);
    input.province = parsed.present ? parsed.value : null;
  }
  if (readValue(body, ['postalCode', 'postal_code']) !== undefined) {
    const parsed = parseOptionalText(readValue(body, ['postalCode', 'postal_code']), POSTAL_MAX);
    if (parsed.error) return fail(422, `Postal code: ${parsed.error}`);
    input.postalCode = parsed.present ? parsed.value : null;
  }

  if (readValue(body, ['priority']) !== undefined) {
    const parsed = parsePriority(readValue(body, ['priority']));
    if (parsed.error || !parsed.value) return fail(422, parsed.error ?? 'Invalid priority.');
    input.priority = parsed.value;
  }

  if (
    readValue(body, ['scheduledAt', 'scheduled_at', 'preferredDate', 'preferred_date', 'preferredTime', 'preferred_time']) !== undefined
  ) {
    const parsed = parseScheduledAt(body);
    if (parsed.error) return fail(422, parsed.error);
    input.scheduledAt = parsed.value ?? null;
  }

  if (Object.keys(input).length === 0) {
    return fail(422, 'No job changes supplied.');
  }
  return { input, error: null };
}

export interface ValidatedInternalJobCancel {
  reason: string | null;
  error: { status: number; code: string; message: string } | null;
}

/** Validate a POST /api/v1/business/jobs/:jobId/cancel body (empty body accepted). */
export function validateInternalJobCancel(body: unknown): ValidatedInternalJobCancel {
  if (body === undefined || body === null || body === '') return { reason: null, error: null };
  if (!isRecord(body)) return { reason: null, error: { status: 422, code: 'VALIDATION_ERROR', message: 'Invalid cancellation.' } };
  if ('status' in body) {
    return {
      reason: null,
      error: { status: 422, code: 'VALIDATION_ERROR', message: 'Job status is controlled by the server and cannot be set directly.' },
    };
  }
  const raw = readValue(body, ['reason', 'cancelReason', 'cancel_reason']);
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return { reason: null, error: null };
  }
  if (typeof raw !== 'string') {
    return { reason: null, error: { status: 422, code: 'VALIDATION_ERROR', message: 'Cancellation reason must be text.' } };
  }
  const trimmed = raw.trim();
  if (trimmed.length > REASON_MAX) {
    return {
      reason: null,
      error: { status: 422, code: 'VALIDATION_ERROR', message: `Cancellation reason must be ${REASON_MAX} characters or fewer.` },
    };
  }
  return { reason: trimmed, error: null };
}

export interface ValidatedInternalJobListQuery {
  status: InternalJobStatus | null;
  /** Stage 7G — operational board category (never combined with `status` or `assigned`). */
  board: InternalJobBoardCategory | null;
  /** Stage 7G — active-assignment technician filter (roster id, server-scoped). */
  technicianId: string | null;
  /** Stage 7G — priority filter. */
  priority: InternalJobPriority | null;
  /** Stage 7G — creation-date range (ISO instants, inclusive). */
  from: string | null;
  to: string | null;
  /** Stage 7G — assigned (active assignment exists) vs unassigned. */
  assigned: boolean | null;
  /** Stage 7G — result ordering. */
  sort: InternalJobBoardSort;
  search: string | null;
  page: number;
  pageSize: number;
  error: { status: number; code: string; message: string } | null;
}

/** Stage 7G board categories for GET /api/v1/business/jobs. */
export const INTERNAL_JOB_BOARDS: readonly InternalJobBoardCategory[] = [
  'ALL',
  'NEW',
  'ASSIGNED',
  'SCHEDULED',
  'IN_PROGRESS',
  'AWAITING_PARTS',
  'COMPLETED',
  'CANCELLED',
  'HISTORY',
];

const BOARD_SORTS: readonly InternalJobBoardSort[] = ['RECENT', 'SCHEDULED', 'PRIORITY'];

/** Parse an inclusive creation-date bound (YYYY-MM-DD or ISO datetime). */
function parseBoardDate(raw: unknown, endOfDay: boolean): { value: string | null; error: string | null } {
  if (raw === undefined || raw === null || String(raw).trim() === '') return { value: null, error: null };
  const trimmed = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    // A bare date covers the whole calendar day in UTC: the `from`
    // bound starts at midnight, the `to` bound ends at 23:59:59.
    const candidate = endOfDay ? `${trimmed}T23:59:59.999Z` : `${trimmed}T00:00:00.000Z`;
    const parsed = new Date(candidate);
    if (Number.isNaN(parsed.getTime())) return { value: null, error: 'Date filters must be valid dates (YYYY-MM-DD or ISO date/time).' };
    return { value: parsed.toISOString(), error: null };
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return { value: null, error: 'Date filters must be valid dates (YYYY-MM-DD or ISO date/time).' };
  return { value: parsed.toISOString(), error: null };
}

/**
 * Parse and validate the GET /api/v1/business/jobs query string.
 *
 * Stage 7B filters (`status`, `search`, pagination) are unchanged.
 * Stage 7G adds the operational board category plus technician,
 * priority, creation-date-range, assigned and sort filters. Derived
 * board categories (ASSIGNED from the assignment relationship,
 * HISTORY from terminal statuses) never create new job statuses.
 */
export function validateInternalJobListQuery(query: Record<string, unknown>): ValidatedInternalJobListQuery {
  const fallback = (page: number, pageSize: number): ValidatedInternalJobListQuery => ({
    status: null,
    board: null,
    technicianId: null,
    priority: null,
    from: null,
    to: null,
    assigned: null,
    sort: 'RECENT',
    search: null,
    page,
    pageSize,
    error: null,
  });
  const invalid = (message: string): ValidatedInternalJobListQuery => ({
    status: null,
    board: null,
    technicianId: null,
    priority: null,
    from: null,
    to: null,
    assigned: null,
    sort: 'RECENT',
    search: null,
    page: 1,
    pageSize: 20,
    error: { status: 422, code: 'VALIDATION_ERROR', message },
  });

  const rawPage = query['page'];
  const rawPageSize = query['pageSize'] ?? query['page_size'];
  const page = rawPage === undefined || rawPage === null || String(rawPage).trim() === '' ? 1 : Number(String(rawPage).trim());
  const pageSize =
    rawPageSize === undefined || rawPageSize === null || String(rawPageSize).trim() === '' ? 20 : Number(String(rawPageSize).trim());
  if (!Number.isInteger(page) || page < 1 || page > 1000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    return invalid('Invalid pagination. Use page 1–1000 and pageSize 1–50.');
  }

  let status: InternalJobStatus | null = null;
  const rawStatus = query['status'];
  if (rawStatus !== undefined && rawStatus !== null && String(rawStatus).trim() !== '') {
    const upper = String(rawStatus).trim().toUpperCase();
    if (!INTERNAL_JOB_STATUSES.includes(upper as InternalJobStatus)) {
      return invalid('Invalid status filter.');
    }
    status = upper as InternalJobStatus;
  }

  let board: InternalJobBoardCategory | null = null;
  const rawBoard = query['board'];
  if (rawBoard !== undefined && rawBoard !== null && String(rawBoard).trim() !== '') {
    const upper = String(rawBoard).trim().toUpperCase();
    if (!INTERNAL_JOB_BOARDS.includes(upper as InternalJobBoardCategory)) {
      return invalid('Invalid board filter. Use all, new, assigned, scheduled, in_progress, awaiting_parts, completed, cancelled or history.');
    }
    board = upper as InternalJobBoardCategory;
  }
  if (board !== null && status !== null) {
    return invalid('Board and status filters cannot be combined. Use one of them.');
  }

  let assigned: boolean | null = null;
  const rawAssigned = query['assigned'];
  if (rawAssigned !== undefined && rawAssigned !== null && String(rawAssigned).trim() !== '') {
    const lowered = String(rawAssigned).trim().toLowerCase();
    if (lowered !== 'true' && lowered !== 'false') {
      return invalid('Invalid assigned filter. Use true or false.');
    }
    assigned = lowered === 'true';
  }
  if (board !== null && assigned !== null) {
    return invalid('Board and assigned filters cannot be combined. Use one of them.');
  }

  let technicianId: string | null = null;
  const rawTechnician = query['technicianId'] ?? query['technician_id'];
  if (rawTechnician !== undefined && rawTechnician !== null && String(rawTechnician).trim() !== '') {
    const trimmed = String(rawTechnician).trim();
    if (!/^[1-9][0-9]*$/.test(trimmed)) {
      return invalid('Invalid technician filter.');
    }
    technicianId = trimmed;
  }

  let priority: InternalJobPriority | null = null;
  const rawPriority = query['priority'];
  if (rawPriority !== undefined && rawPriority !== null && String(rawPriority).trim() !== '') {
    const upper = String(rawPriority).trim().toUpperCase();
    if (!PRIORITIES.includes(upper as InternalJobPriority)) {
      return invalid('Invalid priority filter. Use LOW, NORMAL, HIGH or URGENT.');
    }
    priority = upper as InternalJobPriority;
  }

  const from = parseBoardDate(query['from'], false);
  if (from.error) return invalid(from.error);
  const to = parseBoardDate(query['to'] ?? query['until'], true);
  if (to.error) return invalid(to.error);
  if (from.value !== null && to.value !== null && from.value > to.value) {
    return invalid('The from date must not be after the to date.');
  }

  let sort: InternalJobBoardSort = 'RECENT';
  const rawSort = query['sort'] ?? query['order'];
  if (rawSort !== undefined && rawSort !== null && String(rawSort).trim() !== '') {
    const upper = String(rawSort).trim().toUpperCase();
    if (!BOARD_SORTS.includes(upper as InternalJobBoardSort)) {
      return invalid('Invalid sort. Use recent, scheduled or priority.');
    }
    sort = upper as InternalJobBoardSort;
  }

  let search: string | null = null;
  const rawSearch = query['search'] ?? query['q'];
  if (rawSearch !== undefined && rawSearch !== null && String(rawSearch).trim() !== '') {
    const trimmed = String(rawSearch).trim();
    if (trimmed.length > SEARCH_MAX) return invalid(`Search must be ${SEARCH_MAX} characters or fewer.`);
    search = trimmed;
  }

  return { ...fallback(page, pageSize), status, board, technicianId, priority, from: from.value, to: to.value, assigned, sort, search };
}
