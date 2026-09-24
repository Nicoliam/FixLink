# FixLink — Notifications

## Status (Stage 7F)

The `notifications` table exists (migration 008: `user_id`, `type`,
`title`, `message`, `reference_type`, `reference_id`, `read_at`,
`created_at`) but **no notification infrastructure is implemented
yet**: nothing writes to the table and no listing/read endpoints
exist (`GET /api/v1/notifications` in docs/API.md §10 is a planned
placeholder).

## Stage 7F event seam (implemented)

The parts-approval workflow emits one event per decision /
fulfilment / resume on the shared in-memory bus
(`backend/src/modules/business/parts-request-events.ts`,
`PartsRequestEventBus`, threaded through `createApp` deps so tests
can drain it):

- `PARTS_REQUEST_APPROVED` / `PARTS_REQUEST_REJECTED` /
  `PARTS_REQUEST_NEEDS_INFO` (manager decisions; recipient: the
  requesting technician's login)
- `PARTS_REQUEST_RESPONDED` (technician response; recipients: the
  business's active owners/managers)
- `PARTS_AVAILABLE` (fulfilment; recipient: the technician)
- `JOB_READY_TO_CONTINUE` (resume; recipient: the technician)

Each event carries `businessId`, `jobId`, `partsRequestId`,
`actorUserId`, `technicianUserId`, `title`, `message` and
`createdAt`. This is a collector only — Stage 7F writes nothing
to `notifications`, creating no second notification system.

## What remains for Stage 8

1. Persist one `notifications` row per recipient per event
   (`type` = event type, `reference_type = 'PARTS_REQUEST'`,
   `reference_id` = request id; resolve manager logins
   server-side from the business — ids are never trusted from
   the client).
2. Expose the listing/read surface (`GET /api/v1/notifications`,
   `PATCH /api/v1/notifications/:id/read`,
   `PATCH /api/v1/notifications/read-all`) scoped to the
   session user (`user_id` only — §PERMISSIONS: users access
   only their own notifications).
3. Drain (not peek) the bus at the persistence boundary so
   events are delivered exactly once; add idempotency if
   delivery retries are introduced.
4. Extend the seam with job-assignment, completion, review and
   dispute event types as those workflows land.
