# FixLink — Notifications

## Status (Stage 8 — implemented)

In-app notifications are live (MVP: no email/SMS/WhatsApp/push,
no WebSockets — the frontend polls `unread-count` every 60s):

- Central `NotificationService`
  (`backend/src/modules/notifications/notifications.service.ts` —
  `create` / `createForUsers` / `listForUser` / `getUnreadCount` /
  `markRead` / `markAllRead`) over the existing `notifications`
  table (migration 008 — no new migration). Stores (memory + MySQL)
  scope every operation to `user_id`; foreign ids read as null
  (404 upstream), never as forbidden signals.
- Endpoints (`backend/src/modules/notifications/`): `GET
  /api/v1/notifications` (`unreadOnly`, `page`, `pageSize`), `GET
  /api/v1/notifications/unread-count`, `POST
  /api/v1/notifications/:id/read`, `POST
  /api/v1/notifications/read-all`. The recipient is always the
  session user.
- Feature services resolve recipients server-side and emit AFTER
  the state change commits, best-effort (a delivery failure never
  rolls back the job/quote/assignment/approval): jobs
  (JOB_REQUEST), quotes (QUOTE_RECEIVED/ACCEPTED/SCHEDULED/
  STARTED), execution (JOB_COMPLETED/CONFIRMED), business
  (TECHNICIAN_ASSIGNED/REASSIGNED, JOB_STARTED/UPDATE/COMPLETED,
  WORK_DOCUMENTED, PARTS_REQUESTED/APPROVED/REJECTED/MORE_INFO/
  AVAILABLE + technician respond).
- Reference vocabulary: `JOB` (marketplace job id) and
  `INTERNAL_JOB` (internal job id) — every notification navigates
  to exactly one job detail with no read-time joins and identical
  behaviour on both stores. The parts request id is named in the
  message; a fulfilment that resumes the job folds the resume into
  the single PARTS_AVAILABLE message (no double delivery).
- Frontend: Oceanic bell + badge + compact panel in the
  authenticated shell (`app.ts`/`app.html`), full `/notifications`
  inbox (filter, mark read/all-read, pagination, loading/empty/
  error states), role-specific navigation
  (`notificationRouteFor`).

## Stage 7F event seam (retained)

The parts-approval workflow still emits one event per decision /
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
`createdAt`. The bus is now a test-observable seam only: Stage 8
persists notifications directly in `BusinessService` (same data),
so events are delivered exactly once and the bus is never drained
for delivery. The header mapping note in `parts-request-events.ts`
records the final reference decision (job-navigable rows).

## What remains after Stage 8 and Stage 9

1. Admin/platform notification contexts were not added by the current
   Stage 9 admin implementation. They remain future scope if approved.
2. Future delivery channels (email/SMS/WhatsApp/push) and idempotent retry
   if delivery retries are introduced — the central service is the single
   place to add them.
3. Extend the seam with review and dispute event types as those workflows
   land.

Stage 12 is documentation and handover preparation only; it does not add
notification channels or admin notification contexts.
