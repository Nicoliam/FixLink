/**
 * FixLink Stage 7F — manager approval + technician response validation.
 *
 * Server-side validation is authoritative; Angular validation is UX only.
 * Only the manager's comment (and the technician's response note) are
 * accepted — the job, business, request, decision and reviewer identity
 * are derived server-side. Status transitions themselves are enforced
 * by the store state machine, never by these payloads.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface ValidatedDecisionComment {
  comment: string | null;
  error: { status: number; code: string; message: string } | null;
}

function readComment(body: unknown): { comment: string | null; raw: boolean } {
  if (!isRecord(body)) return { comment: null, raw: false };
  const raw = body['comment'] ?? body['reason'] ?? body['notes'];
  if (raw === undefined || raw === null) return { comment: null, raw: false };
  if (typeof raw !== 'string') return { comment: null, raw: true };
  const trimmed = raw.trim();
  return { comment: trimmed === '' ? null : trimmed, raw: true };
}

function checkLength(comment: string | null): { status: number; code: string; message: string } | null {
  if (comment !== null && comment.length > 1000) {
    return { status: 422, code: 'VALIDATION_ERROR', message: 'Comment must be 1000 characters or fewer.' };
  }
  return null;
}

/**
 * Validate a manager decision body. Reject and request-info require a
 * comment/reason (stored on the request and the approval record);
 * approve and mark-available accept an optional comment.
 */
export function validateApprovalDecision(
  body: unknown,
  decision: 'APPROVE' | 'REJECT' | 'REQUEST_INFO' | 'AVAILABLE',
): ValidatedDecisionComment {
  if (body !== undefined && body !== null && !isRecord(body)) {
    return {
      comment: null,
      error: { status: 422, code: 'VALIDATION_ERROR', message: 'Invalid decision. Please provide a comment.' },
    };
  }
  const { comment } = readComment(body ?? {});
  const tooLong = checkLength(comment);
  if (tooLong) return { comment: null, error: tooLong };
  if ((decision === 'REJECT' || decision === 'REQUEST_INFO') && comment === null) {
    return {
      comment: null,
      error: {
        status: 422,
        code: 'VALIDATION_ERROR',
        message:
          decision === 'REJECT'
            ? 'A rejection reason is required so the technician knows what to do next.'
            : 'Please explain what information the technician should provide.',
      },
    };
  }
  return { comment, error: null };
}

export interface ValidatedResponseNote {
  note: string | null;
  error: { status: number; code: string; message: string } | null;
}

/** Validate a technician NEEDS_INFO response (optional note, length-capped). */
export function validatePartsResponse(body: unknown): ValidatedResponseNote {
  if (body !== undefined && body !== null && !isRecord(body)) {
    return {
      note: null,
      error: { status: 422, code: 'VALIDATION_ERROR', message: 'Invalid response. Please provide the missing information.' },
    };
  }
  const raw = isRecord(body) ? (body['note'] ?? body['comment'] ?? body['message']) : undefined;
  if (raw === undefined || raw === null) return { note: null, error: null };
  if (typeof raw !== 'string') {
    return {
      note: null,
      error: { status: 422, code: 'VALIDATION_ERROR', message: 'Invalid response. Please provide the missing information.' },
    };
  }
  const note = raw.trim() === '' ? null : raw.trim();
  if (note !== null && note.length > 1000) {
    return {
      note: null,
      error: { status: 422, code: 'VALIDATION_ERROR', message: 'Response must be 1000 characters or fewer.' },
    };
  }
  return { note, error: null };
}
