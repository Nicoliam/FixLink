# FixLink — Changelog

## Stage 6E — Scheduling & Job Execution Start (2026-09-23)

- Providers can now schedule accepted marketplace jobs and start
  scheduled ones: `POST /api/v1/jobs/:jobId/schedule`
  (`{ scheduledAt }` → `ACCEPTED → SCHEDULED`, `jobs.scheduled_at`
  recorded, `Provider scheduled job` history) and
  `POST /api/v1/jobs/:jobId/start` (`SCHEDULED → IN_PROGRESS`,
  `Provider started job` history). Both run atomically in a single
  transaction per store (memory and MySQL); failures leave the job
  and history untouched. No new tables or columns — the existing
  `jobs.status` ENUM, `jobs.scheduled_at` and `job_status_history`
  rows are reused; no payment, technician, completion or review
  functionality was added.
- Authorization: only the addressed `PROFESSIONAL` / `BUSINESS_OWNER`
  / `BUSINESS_MANAGER` may schedule or start; other providers'
  jobs read as `404`, customers/technicians/admins receive `403`.
  State is server-enforced (`REQUESTED`/`QUOTED` cannot be scheduled,
  `ACCEPTED` cannot be started, no jumps to `COMPLETED`); an accepted
  quote is required to schedule. `scheduledAt` must be a valid future
  ISO date/time (missing/malformed/past/impossible dates → `422`)
  and is normalized to UTC ISO so the provider's SAST wall time
  round-trips exactly.
- Provider inbox now covers `ACCEPTED`/`SCHEDULED`/`IN_PROGRESS`
  (filterable, default all actionable states). Angular: `/requests/:id`
  shows a Schedule section (date + time) on `ACCEPTED` jobs, the
  `Scheduled: 5 October 2026 at 10:00` state with a confirmed Start
  action on `SCHEDULED` jobs, and the active state on `IN_PROGRESS`
  jobs; `/my-jobs/:id` shows the read-only scheduled/in-progress
  states (slot in SAST, provider, agreed price, direct-payment
  wording) with no status-changing controls; both lists show the new
  badges with the SAST slot.
- Tests: `backend/tests/job-scheduling.test.ts` (31 cases:
  authorization incl. owner/manager, validation incl. timezone
  round-trip, transitions, history, rollback, customer visibility,
  quote integrity, envelopes, inbox) plus customer/provider frontend
  specs. Full suites green: backend 148/148, web 113/113;
  `tsc --noEmit` (backend, web app + spec) and the production Angular
  build pass.

- Customers can now accept marketplace quotes:
  `POST /api/v1/jobs/:jobId/quotes/:quoteId/accept` (owning
  `CUSTOMER` only, empty body) performs `QUOTED → ACCEPTED`
  atomically — quote `ACCEPTED`, competing quotes retired to
  `DECLINED` (never deleted), job `ACCEPTED` with `agreed_amount`/
  `currency` recorded, plus a `job_status_history` entry
  (`Customer accepted provider quote`). The frontend never sends a
  status. No new tables or columns — existing `quotes.status`,
  `jobs.agreed_amount`/`currency`, `job_status_history` and the
  creation-time `job_assignments` row are reused; no technician is
  assigned.
- Authorization: ownership derived from the session; other
  customers' jobs/quotes, unknown or mismatched quotes and
  `INTERNAL` jobs read as `404`; provider/technician/manager-only/
  admin actors receive `403`; repeat acceptance → `409`;
  ineligible quotes and non-`QUOTED` jobs → `422`.
- `GET /api/v1/jobs` / `:id` now expose `agreedAmount`/`currency`.
  Angular: `/my-jobs/:id` shows per-quote `Accept Quote` actions on
  `QUOTED` jobs with a confirmation step (agreed amount +
  direct-payment wording), a `Quote accepted` success state (status,
  provider, agreed price, payment wording), and retired-quote
  display; `/requests/:id` shows the provider-side `Accepted` state
  with the agreed amount. No payment processing (explicit: the
  accepted total is the agreed price; payment is arranged directly),
  no scheduling, no technician workflow, no decline/withdrawal.
- Tests: `backend/tests/quote-acceptance.test.ts` (22 cases:
  retrieval, acceptance, transitions, provider association,
  history, ownership, roles incl. dual-role owner-manager,
  conflicts, state guards, `INTERNAL`, rollback, multi-quote,
  envelopes, provider visibility) plus customer/provider frontend
  specs. Full suites green: backend 117/117, web 94/94;
  `tsc --noEmit` (app + spec) and both builds pass.

## Stage 6C — Provider Requests & Quotes (2026-09-23)

- Providers can now receive marketplace requests and submit quotes:
  `GET /api/v1/provider/requests` (addressed inbox, paginated,
  `status` filter over `REQUESTED`/`QUOTED`),
  `GET /api/v1/provider/requests/:id` (request detail with
  privacy-limited customer display name and quotes),
  `POST /api/v1/jobs/:id/quotes` (submit; job transitions
  `REQUESTED → QUOTED` atomically with a history entry),
  `GET /api/v1/jobs/:id/quotes` and `GET /api/v1/quotes/:id`
  (retrieval for the owning customer or addressed provider).
- Allowed quoting actors: `PROFESSIONAL` (own profile),
  `BUSINESS_OWNER`/`BUSINESS_MANAGER` (owned/member businesses).
  `CUSTOMER`, `TECHNICIAN` and unrelated providers/businesses are
  rejected; unaddressed jobs read as `404`. No new tables — the
  existing `quotes`, `quote_items`, `jobs` and `job_status_history`
  tables are reused (transactional creation; second active quote →
  `409 CONFLICT`, never a silent overwrite).
- `GET /api/v1/jobs/:id` now embeds the job's `quotes` for the owning
  customer. Angular: provider `/requests` list and `/requests/:id`
  detail with a ZAR quote form (amount, message, line items; loading,
  validation, server-error and submitted states), role-aware nav
  (My jobs / Requests), and read-only quote display on the customer
  job detail ("Quote received — review the details."). No quote
  acceptance, payment, scheduling, or technician marketplace access.
- Test-isolation fix: rate limiters are now created inside the route
  factories (one store per app instance); production behaviour is
  unchanged (one app per process).

## Stage 6B — Customer Job Request / Job Creation (2026-09-23)

- Customer marketplace job requests are now created for real:
  `POST /api/v1/jobs` (authenticated `CUSTOMER` only) writes to the ONE
  shared `jobs` table with `source = MARKETPLACE`, `status = REQUESTED`,
  plus the initial `job_status_history` entry and provider
  `job_assignments` row. No new or duplicate job tables were created.
- Customer ownership is derived server-side from the session; client
  `customer_id`/`status`/`source` values are ignored. Customer profiles
  are auto-provisioned on first request.
- Minimum retrieval for this stage: `GET /api/v1/jobs` (owned jobs,
  paginated) and `GET /api/v1/jobs/:id` (owned job; other customers'
  jobs read as `404`).
- Angular: `RequestJobComponent` submits through the new `JobService`,
  with loading, error and success states (success links to the new job
  and `My Jobs`); new `/my-jobs` list and `/my-jobs/:id` detail routes
  (lazy-loaded, `authGuard`). Photo attachments remain disabled pending
  file infrastructure. No quotes, payments, or technician workflows.
