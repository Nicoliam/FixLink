/**
 * FixLink Stage 7C — technician assignment validation.
 *
 * Server-side validation is authoritative; Angular validation is UX only.
 * Only the technician id is accepted — the business, job ownership and
 * assignment history are derived server-side. Status is never accepted
 * or changed by assignment.
 */
import type { AssignTechnicianInput } from './business.types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface ValidatedAssignment {
  input: AssignTechnicianInput | null;
  error: { status: number; code: string; message: string } | null;
}

/** Validate a POST /api/v1/business/jobs/:jobId/assign body. */
export function validateAssignmentCreate(body: unknown): ValidatedAssignment {
  if (!isRecord(body)) {
    return {
      input: null,
      error: { status: 422, code: 'VALIDATION_ERROR', message: 'Invalid assignment. Please choose a technician.' },
    };
  }
  const raw = body['technicianId'] ?? body['technician_id'];
  const technicianId = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : '';
  if (!technicianId || !/^[1-9][0-9]*$/.test(technicianId)) {
    return {
      input: null,
      error: { status: 400, code: 'VALIDATION_ERROR', message: 'Invalid technician selected. Please choose a technician.' },
    };
  }
  return { input: { technicianId }, error: null };
}
