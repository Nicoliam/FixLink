/**
 * FixLink Stage 7E — parts-request validation.
 *
 * Server-side validation is authoritative; Angular validation is UX only.
 * Only the requested part fields are accepted — the job, business,
 * technician identity and status are derived server-side (status is
 * always PENDING on creation; approval/rejection arrives in Stage 7F).
 *
 * Multipart uploads send every field as a string, so numeric coercion
 * accepts digit strings as well as numbers.
 */
import type { CreatePartsRequestInput } from './business.types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface ValidatedPartsRequest {
  input: CreatePartsRequestInput | null;
  error: { status: number; code: string; message: string } | null;
}

/** Validate a POST …/parts body (JSON or multipart fields). */
export function validatePartsRequestCreate(body: unknown): ValidatedPartsRequest {
  if (!isRecord(body)) {
    return {
      input: null,
      error: { status: 422, code: 'VALIDATION_ERROR', message: 'Invalid parts request. Please provide the part details.' },
    };
  }
  const partNameRaw = body['partName'] ?? body['part_name'] ?? body['name'];
  const partName = typeof partNameRaw === 'string' ? partNameRaw.trim() : '';
  if (!partName) {
    return {
      input: null,
      error: { status: 422, code: 'VALIDATION_ERROR', message: 'Part name is required.' },
    };
  }
  if (partName.length > 255) {
    return {
      input: null,
      error: { status: 422, code: 'VALIDATION_ERROR', message: 'Part name must be 255 characters or fewer.' },
    };
  }
  const quantityRaw = body['quantity'];
  const quantityText =
    typeof quantityRaw === 'number' ? String(quantityRaw) : typeof quantityRaw === 'string' ? quantityRaw.trim() : '';
  if (!/^[1-9][0-9]*$/.test(quantityText)) {
    return {
      input: null,
      error: { status: 422, code: 'VALIDATION_ERROR', message: 'Quantity must be a whole number of 1 or more.' },
    };
  }
  const quantity = Number(quantityText);
  if (!Number.isSafeInteger(quantity) || quantity > 10000) {
    return {
      input: null,
      error: { status: 422, code: 'VALIDATION_ERROR', message: 'Quantity must be between 1 and 10000.' },
    };
  }
  const reasonRaw = body['reason'] ?? body['description'];
  const reason = typeof reasonRaw === 'string' ? reasonRaw.trim() : '';
  if (!reason) {
    return {
      input: null,
      error: { status: 422, code: 'VALIDATION_ERROR', message: 'A reason is required so the business knows why the part is needed.' },
    };
  }
  if (reason.length < 10) {
    return {
      input: null,
      error: { status: 422, code: 'VALIDATION_ERROR', message: 'Reason must be at least 10 characters.' },
    };
  }
  if (reason.length > 1000) {
    return {
      input: null,
      error: { status: 422, code: 'VALIDATION_ERROR', message: 'Reason must be 1000 characters or fewer.' },
    };
  }
  const notesRaw = body['notes'];
  const notes = typeof notesRaw === 'string' ? notesRaw.trim() : '';
  if (notes.length > 500) {
    return {
      input: null,
      error: { status: 422, code: 'VALIDATION_ERROR', message: 'Notes must be 500 characters or fewer.' },
    };
  }
  return { input: { partName, quantity, reason, notes: notes === '' ? null : notes }, error: null };
}
