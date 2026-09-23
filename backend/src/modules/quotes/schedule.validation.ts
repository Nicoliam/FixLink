/**
 * FixLink Stage 6E — provider job scheduling validation.
 *
 * Server-side validation is authoritative; Angular validation is UX only.
 * The frontend must never control the job status — only the requested
 * `scheduledAt` instant, which the backend normalizes to a UTC ISO string
 * so the instant the provider picked is the instant every consumer reads
 * (no silent local-time shifts).
 */

export interface ValidatedSchedule {
  /** Normalized future instant (UTC ISO, e.g. `2026-10-05T08:00:00.000Z`). */
  scheduledAtIso: string | null;
  error: { status: number; code: string; message: string } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Validate a POST /api/v1/jobs/:jobId/schedule body.
 * All failures are 422 (the job id shape itself is checked by the service
 * and returns 400 when malformed).
 */
export function validateSchedule(body: unknown): ValidatedSchedule {
  const invalid = (message: string): ValidatedSchedule => ({
    scheduledAtIso: null,
    error: { status: 422, code: 'VALIDATION_ERROR', message },
  });
  if (!isRecord(body)) return invalid('Scheduled date and time are required.');

  const raw = body['scheduledAt'] ?? body['scheduled_at'];
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return invalid('Scheduled date and time are required.');
  }
  if (typeof raw !== 'string') return invalid('Scheduled date and time must be a valid date and time.');
  const trimmed = raw.trim();

  // Reject impossible calendar dates (e.g. 2026-02-30, 2026-13-40) that the
  // Date constructor would otherwise roll over into a different real date.
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (dateMatch) {
    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);
    if (!isValidCalendarDate(year, month, day)) {
      return invalid('Scheduled date and time must be a valid date and time.');
    }
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return invalid('Scheduled date and time must be a valid date and time.');
  }
  if (parsed.getTime() <= Date.now()) {
    return invalid('Scheduled time must be in the future.');
  }
  return { scheduledAtIso: parsed.toISOString(), error: null };
}
