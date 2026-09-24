/**
 * FixLink Stage 7F — parts-request notification event seam.
 *
 * The `notifications` table (migration 008) exists, but no notification
 * delivery infrastructure is implemented yet (no service writes to it,
 * no listing endpoints — see docs/NOTIFICATIONS.md). This module is the
 * single seam between the parts-approval workflow and future
 * notification delivery:
 *
 * - The business service emits one PartsRequestEvent per decision /
 *   fulfilment / resume (approved, rejected, needs-info, available,
 *   ready-to-continue, technician-responded).
 * - Stage 7F collects the events in memory (exposed for tests via
 *   `drainEvents`) and does NOT write to any table — so no second
 *   notification system is created.
 * - Stage 8 (notifications) consumes these events: persist one
 *   `notifications` row per recipient (type/title/message/reference
 *   mapping is documented below) and expose the listing endpoints.
 *
 * Event → future `notifications` row mapping (Stage 8):
 * - type: the event `type` (e.g. PARTS_REQUEST_APPROVED).
 * - title/message: the event `title` / `message` (already phrased).
 * - reference_type: 'PARTS_REQUEST'; reference_id: the request id.
 * - Recipients: `technicianUserId` (the requesting technician's login)
 *   for manager decisions; all active owner/manager logins of the
 *   business for technician responses. User-id resolution stays
 *   server-side in Stage 8 — this seam only carries the ids the
 *   stores already hold.
 */

export type PartsRequestEventType =
  | 'PARTS_REQUEST_APPROVED'
  | 'PARTS_REQUEST_REJECTED'
  | 'PARTS_REQUEST_NEEDS_INFO'
  | 'PARTS_REQUEST_RESPONDED'
  | 'PARTS_AVAILABLE'
  | 'JOB_READY_TO_CONTINUE';

export interface PartsRequestEvent {
  type: PartsRequestEventType;
  /** Owning business (recipient scope for manager → technician is derived from it in Stage 8). */
  businessId: string;
  jobId: string;
  partsRequestId: string;
  /** Authenticated user id that caused the event (manager or technician). */
  actorUserId: string;
  /** Login user id of the requesting technician (recipient of manager decisions). */
  technicianUserId: string;
  title: string;
  message: string;
  createdAt: string;
}

/** In-memory collector: the service emits, tests drain, Stage 8 persists. */
export class PartsRequestEventBus {
  private readonly queue: PartsRequestEvent[] = [];

  emit(event: PartsRequestEvent): void {
    this.queue.push(event);
  }

  /** Test/Stage 8 handoff: take every queued event, leaving the bus empty. */
  drain(): PartsRequestEvent[] {
    return this.queue.splice(0, this.queue.length);
  }

  /** Read-only peek (debugging only — prefer `drain`). */
  peek(): readonly PartsRequestEvent[] {
    return this.queue;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function partLabel(partName: string | null): string {
  return partName ?? 'Requested part';
}

export function approvalEvent(
  type: Extract<PartsRequestEventType, 'PARTS_REQUEST_APPROVED' | 'PARTS_REQUEST_REJECTED' | 'PARTS_REQUEST_NEEDS_INFO'>,
  input: {
    businessId: string;
    jobId: string;
    partsRequestId: string;
    actorUserId: string;
    technicianUserId: string;
    partName: string | null;
  },
): PartsRequestEvent {
  const titles = {
    PARTS_REQUEST_APPROVED: 'Parts request approved',
    PARTS_REQUEST_REJECTED: 'Parts request rejected',
    PARTS_REQUEST_NEEDS_INFO: 'More information requested for a parts request',
  } as const;
  const messages = {
    PARTS_REQUEST_APPROVED: `${partLabel(input.partName)} was approved. The job is awaiting parts.`,
    PARTS_REQUEST_REJECTED: `${partLabel(input.partName)} was not approved. The job stays in progress — see the manager's reason.`,
    PARTS_REQUEST_NEEDS_INFO: `The manager needs more information about ${partLabel(input.partName).toLowerCase()}. Please respond to the request.`,
  } as const;
  return {
    type,
    businessId: input.businessId,
    jobId: input.jobId,
    partsRequestId: input.partsRequestId,
    actorUserId: input.actorUserId,
    technicianUserId: input.technicianUserId,
    title: titles[type],
    message: messages[type],
    createdAt: nowIso(),
  };
}

export function partsAvailableEvent(input: {
  businessId: string;
  jobId: string;
  partsRequestId: string;
  actorUserId: string;
  technicianUserId: string;
  partName: string | null;
  jobResumed: boolean;
}): PartsRequestEvent {
  return {
    type: 'PARTS_AVAILABLE',
    businessId: input.businessId,
    jobId: input.jobId,
    partsRequestId: input.partsRequestId,
    actorUserId: input.actorUserId,
    technicianUserId: input.technicianUserId,
    title: 'Parts available',
    message: input.jobResumed
      ? `${partLabel(input.partName)} is available. The job is ready to continue.`
      : `${partLabel(input.partName)} is available. Other approved parts are still outstanding.`,
    createdAt: nowIso(),
  };
}

export function jobReadyEvent(input: {
  businessId: string;
  jobId: string;
  partsRequestId: string;
  actorUserId: string;
  technicianUserId: string;
}): PartsRequestEvent {
  return {
    type: 'JOB_READY_TO_CONTINUE',
    businessId: input.businessId,
    jobId: input.jobId,
    partsRequestId: input.partsRequestId,
    actorUserId: input.actorUserId,
    technicianUserId: input.technicianUserId,
    title: 'Job ready to continue',
    message: 'All approved parts are available. The job is back in progress.',
    createdAt: nowIso(),
  };
}

export function technicianRespondedEvent(input: {
  businessId: string;
  jobId: string;
  partsRequestId: string;
  actorUserId: string;
  technicianUserId: string;
  partName: string | null;
}): PartsRequestEvent {
  return {
    type: 'PARTS_REQUEST_RESPONDED',
    businessId: input.businessId,
    jobId: input.jobId,
    partsRequestId: input.partsRequestId,
    actorUserId: input.actorUserId,
    technicianUserId: input.technicianUserId,
    title: 'Technician responded to a parts request',
    message: `Additional information was provided for ${partLabel(input.partName).toLowerCase()}. Please review the request.`,
    createdAt: nowIso(),
  };
}
