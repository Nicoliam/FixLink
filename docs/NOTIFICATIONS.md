# Fixlynk — Notifications

## Status (Stage 8 — implemented; Stage 13 adds the email channel)

In-app notifications are live (no SMS/WhatsApp/push, no WebSockets —
the frontend polls `unread-count` every 60s). Stage 13 adds email
delivery for provider-side recipients on top of the same in-app
rows — see "Stage 13 — Email delivery" below:

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

## Stage 13 — Email delivery (provider-side recipients)

### Why

A provider who was not signed in to the web app had no way to learn that
a customer had requested work: the only signal was an in-app row behind a
login. Stage 13 emails provider-side recipients the same event, with the
job details and a deep link they can act on directly.

### Where it lives

Email is a **second delivery channel inside the central
`NotificationService`**, not a parallel notification system. Every
feature service already emits through `create` / `createForUsers`, so
the channel applies to all existing provider-facing events (job request,
quote received/accepted, scheduled, started, completed, confirmed,
technician assigned/reassigned, job updates, work documented, all parts
outcomes) with no new call sites.

- `backend/src/services/mailer.ts` — the transport seam, mirroring the
  file-storage adapter pattern: `Mailer` contract, `SmtpMailer`
  (nodemailer), `LogMailer` (the default when SMTP is not configured —
  renders the message to the application log and sends nothing), and
  `MemoryMailer` (tests). `resolveMailer()` picks the adapter from
  configuration.
- `backend/src/services/notification-email.ts` — renders the subject,
  plain-text body and a table-based HTML body for one notification.
  HTML output is escaped: notification text and customer-supplied
  descriptions are untrusted input.
- The mailer is resolved in `app.ts` and passed to the shared
  `NotificationService`. Tests inject a `MemoryMailer` through the same
  `AppDeps` seam used by file storage.

### Who is emailed

Eligibility is decided **per recipient, server-side**, from the
recipient's own account — never from the client:

- The account must hold at least one provider-side role:
  `PROFESSIONAL`, `BUSINESS_OWNER`, `BUSINESS_MANAGER` or `TECHNICIAN`.
- The account status must be `ACTIVE` (suspended or deleted accounts are
  never emailed).
- The account must have an email address on file.

A `CUSTOMER`-only recipient is never emailed, so quote acceptances,
customer confirmations and parts decisions addressed to a customer stay
in-app. The same event can therefore be in-app for one party and email
for another — the in-app row is always written first, and email is an
addition, never a replacement.

### What the email contains

- Subject and heading: the notification title.
- The notification message.
- An optional details block supplied by the emitting service. `JOB_REQUEST`
  supplies service, job reference, location, preferred date/time and the
  customer's description (truncated), so a provider can decide whether to
  quote from the inbox alone. Other events fall back to title + message.
- One call to action: a deep link to the exact screen for that
  notification and recipient role — `/requests/:id` for marketplace
  providers, `/business/jobs/:id` for business owners/managers,
  `/technician/jobs/:id` for technicians. This mirrors the frontend's
  `notificationRouteFor` (`apps/web/src/app/core/models/notification.model.ts`).
- A closing privacy note: customer contact details are not included and
  the reply is handled on Fixlynk.

**The email never contains customer contact details** (no email address,
no phone number) and no verification documents, private notes or
admin-only information. Reply happens on the platform, which keeps the
conversation, the audit trail and the privacy rules intact. This matches
the existing API rule that a provider sees only `customer.displayName`
(e.g. `Thandi K.`) on a request.

The deep link is an authenticated app route, not a signed public link.
An unauthenticated recipient is redirected to `/login?returnUrl=…` by
the existing `authGuard` and lands on the job after signing in, so one
link serves both "reply now" and "reply after login".

### Configuration

Email is off until it is configured — an unconfigured deployment behaves
exactly as Stage 8 did (in-app only, nothing sent).

| Variable | Purpose |
| --- | --- |
| `MAIL_ENABLED` | Master switch. `true` enables delivery; `false` renders to the log only. |
| `MAIL_HOST` | SMTP host. Required when `MAIL_ENABLED=true`. |
| `MAIL_PORT` | SMTP port (default `587`). |
| `MAIL_SECURE` | `true` for implicit TLS (port 465). Default `false`. |
| `MAIL_USER` / `MAIL_PASSWORD` | SMTP credentials. Optional (some relays need none). |
| `MAIL_FROM` / `MAIL_FROM_NAME` | Envelope and header sender. Default `no-reply@fixlynk.local` / `Fixlynk`. |
| `WEB_BASE_URL` | Public base URL of the Angular app, used to build deep links. Default `http://localhost:4200`. |

A misconfigured production deployment fails fast: `MAIL_ENABLED=true`
without `MAIL_HOST` throws at startup rather than silently dropping
provider emails.

### Delivery tracking

Migration `014_notification_email_delivery.sql` adds three columns to
`notifications`:

- `email_status` — `PENDING`, `SENT`, `FAILED` or `SKIPPED`
- `emailed_at` — when the send was attempted successfully
- `email_error` — a truncated, non-sensitive failure reason

`SKIPPED` records a deliberate non-delivery (recipient not eligible, no
email address, no addressable screen), so a support admin can tell
"we chose not to email" apart from "the send failed". Every attempt is
also written to the application log as `notification.email` with the
notification id, recipient user id and status.

### Failure policy

Email is best-effort in the same way in-app delivery is:

- The in-app row is always written first. An email failure never rolls
  back a committed job, quote, assignment or approval.
- A send failure is recorded as `FAILED` and logged; it does not throw
  into the feature service.
- There is no queue and no retry. Retrying a provider email is left to
  the manual resend path (future scope) so a broken mail relay can
  never stall a job request.

## Operations alerts (platform signup and new job request)

A second, separate email channel tells the operations inbox that something
happened on the platform: a new account registered, or a new job request was
posted.

### Why it is not part of the notification system

- It does not create an in-app row. That system persists one row per
  recipient *user*; `OPS_ALERT_EMAIL` is an address, not an account, and
  must not be given one just to receive mail.
- It does not reuse `renderNotificationEmail`. That renderer is written for a
  professional and deliberately withholds contact details to protect the
  customer. An operations alert inverts that: the contact details *are* the
  payload, because the point is for a human to know who got on the platform
  and what they are asking for.

### Where it lives

`backend/src/services/ops-alert.ts` renders and sends; the same `Mailer`
transport used by Stage 13 carries it, so there is still one mail seam in the
backend. It is invoked from `AuthService.register` and
`JobsService.createMarketplaceJob`, after the account or job is committed.

### What the alerts contain

- **Registration** — email, phone, role, the name on the profile, account id.
- **Job posted** — reference, service, request type (chosen professional vs
  open request), provider, location, preferred date, the customer's email and
  the full description.

### Rules enforced by the module, not by convention

- **No credential is ever rendered.** The input types do not accept a
  password, hash or token, so no call site can leak one by passing the wrong
  object. `tests/ops-alerts.test.ts` asserts the plaintext password, any
  bcrypt hash and any JWT are absent from both the text and HTML parts.
- **Customer-supplied text is escaped and header-safe.** Descriptions and
  locations are free text; they cannot inject markup into the HTML body or
  add a header via a newline in the subject.
- **Delivery is best-effort and never throws.** A mail relay outage must not
  stop someone registering or posting a job; the sender resolves `false`
  instead. Tests assert a rejected mailer still yields `201`.
- **Alerts are off unless configured twice.** `OPS_ALERT_EMAIL` must be set
  *and* `MAIL_ENABLED=true`. With mail disabled the sender is a no-op, so a
  deployment cannot accumulate send failures by setting the address alone.

Because an operations alert contains personal data, `OPS_ALERT_EMAIL` must be
an address the business controls. It is an internal operational signal, not a
marketing send, and there is no unsubscribe.

## What remains after Stage 13

1. Admin/platform notification contexts were not added by the current
   Stage 9 admin implementation. They remain future scope if approved.
2. An admin surface for reading `email_status` (a support view of which
   providers were actually emailed) — the data is stored and logged, but
   no endpoint exposes it yet.
3. Further delivery channels (SMS/WhatsApp/push) and idempotent retry /
   a background queue if delivery retries are introduced — the central
   service remains the single place to add them.
4. A customer-facing email channel, a per-user email preference and an
   unsubscribe mechanism. Email is currently sent to every eligible
   provider-side account because provider email is operationally
   required; a preference model must be designed and documented before
   it is added.
5. Extend the seam with review and dispute event types as those workflows
   land.

Stage 12 is documentation and handover preparation only; it does not add
notification channels or admin notification contexts.
