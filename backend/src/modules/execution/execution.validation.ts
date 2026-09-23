/**
 * FixLink Stage 6F — execution input validation.
 *
 * Server-side validation is authoritative; Angular validation is UX only.
 * The frontend never controls job status, ownership or timestamps — only
 * the work content (phase, note) which the backend re-validates.
 */
import { WORK_PHASES, type WorkPhase } from './execution.types';

export const WORK_NOTE_MAX = 2000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseWorkPhase(value: unknown): WorkPhase | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return (WORK_PHASES as readonly string[]).includes(normalized) ? (normalized as WorkPhase) : null;
}

export interface ValidatedWorkUpdate {
  phase: WorkPhase | null;
  note: string | null;
  error: { status: number; code: string; message: string } | null;
}

/** Validate a POST /api/v1/jobs/:jobId/updates body. */
export function validateWorkUpdate(body: unknown): ValidatedWorkUpdate {
  const invalid = (message: string): ValidatedWorkUpdate => ({
    phase: null,
    note: null,
    error: { status: 422, code: 'VALIDATION_ERROR', message },
  });
  if (!isRecord(body)) return invalid('Phase and note are required.');
  const phase = parseWorkPhase(body['phase']);
  if (!phase) return invalid('Phase must be BEFORE, DURING or AFTER.');
  const rawNote = body['note'] ?? body['message'] ?? body['completionNote'] ?? body['completion_note'];
  if (typeof rawNote !== 'string' || rawNote.trim() === '') {
    return invalid('Note is required.');
  }
  const note = rawNote.trim();
  if (note.length > WORK_NOTE_MAX) {
    return invalid(`Note must be ${WORK_NOTE_MAX} characters or fewer.`);
  }
  return { phase, note, error: null };
}

export interface ValidatedCompletionNote {
  note: string | null;
  error: { status: number; code: string; message: string } | null;
}

/** Validate a POST /api/v1/jobs/:jobId/complete body (note required). */
export function validateCompletionNote(body: unknown): ValidatedCompletionNote {
  const invalid = (message: string): ValidatedCompletionNote => ({
    note: null,
    error: { status: 422, code: 'VALIDATION_ERROR', message },
  });
  if (!isRecord(body)) return invalid('A completion note is required to complete the job.');
  const raw = body['note'] ?? body['completionNote'] ?? body['completion_note'] ?? body['message'];
  if (typeof raw !== 'string' || raw.trim() === '') {
    return invalid('A completion note is required to complete the job.');
  }
  const note = raw.trim();
  if (note.length > WORK_NOTE_MAX) {
    return invalid(`Completion note must be ${WORK_NOTE_MAX} characters or fewer.`);
  }
  return { note, error: null };
}
