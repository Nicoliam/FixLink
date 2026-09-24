# FixLink — Test Plan

## Stage 6B — Customer Job Request / Job Creation

Backend (`backend/tests/jobs.test.ts`, in-memory stores, no MySQL
required — run with `npm test` from `backend/`):

- Authenticated customer creates a marketplace job → `201`, source
  `MARKETPLACE`, status `REQUESTED`, correct provider/service linkage
  and server-side ownership (individual professional and business).
- `401` unauthenticated; `403` non-customer role; `400` malformed
  provider/service ids; `404` unknown provider/service/job;
  `422` provider-service mismatch and invalid description, location,
  date or time.
- Spoofed `customer_id`/`status`/`source` in the body are ignored.
- `GET /api/v1/jobs` returns only owned jobs; `GET /api/v1/jobs/:id`
  returns `404` for another customer's job.

Frontend (`apps/web`, run with `npx ng test --watch=false`):

- `request-job.spec.ts`: route guard, provider summary, form validation,
  successful submit → success state with navigation, API error state,
  blocked submit without a provider.
- `job.service.spec.ts`: request body mapping, list pagination params,
  single-job fetch.
- `my-jobs.spec.ts` / `job-detail.spec.ts`: list, empty, error and
  not-found states.

## Stage 6C — Provider Requests & Quotes

Backend (`backend/tests/quotes.test.ts`, in-memory stores, no MySQL
required — run with `npm test` from `backend/`):

- Professional inbox returns only addressed marketplace requests
  (`200` + standard envelope); another provider's requests are
  invisible. Business owner and manager retrieve business requests.
- `403` for customer, technician and unauthenticated (`401`) inbox
  access; `status` filter supports `REQUESTED`/`QUOTED`, rejects other
  values with `422`.
- Request detail (`200`) carries quoting context with a
  privacy-limited customer display name and no contact details;
  another provider's request reads as `404`; malformed id → `400`.
- Valid quote submission → `201` (`SUBMITTED`, ZAR, message, items
  with derived totals); job transitions `REQUESTED → QUOTED` with a
  status-history entry.
- `422` for negative/non-numeric/oversize totals and invalid items
  (zero/negative quantity, negative price, empty description);
  `404` unknown job; `400` malformed job id; `404` unrelated job;
  `403` customer/technician submission; `409 CONFLICT` second quote
  (original preserved); failed creation leaves the job `REQUESTED`
  with no history entry.
- Quote retrieval: owning customer and submitting provider read quotes
  (`GET /api/v1/jobs/:id/quotes`, `GET /api/v1/quotes/:id`, embedded
  in `GET /api/v1/jobs/:id`); another customer reads `404`.
- All asserted responses preserve the standard success/error
  envelopes.

Frontend (`apps/web`, run with `npx ng test --watch=false`):

- `requests.spec.ts`: addressed list, empty and error states.
- `request-detail.spec.ts`: detail with quote form, blocked submit on
  invalid amount, successful submit → submitted state (`R1,250`,
  no duplicate form), QUOTED jobs show the existing quote, not-found
  state, server-error surface (e.g. `409`).
- `job.service.spec.ts`: provider inbox params, quote body mapping
  (trim + ZAR uppercase), job-quotes list and single-quote fetch.
- `job-detail.spec.ts`: received-quote display (amount, message,
  items). Customer acceptance arrived in Stage 6D (see below) —
  this 6C-era assertion covers the read-only display only.

Note: rate limiters are instantiated per app (inside the route
factories) so each test app has an isolated store; production runs
one app per process, so runtime behaviour is unchanged.

## Stage 6D — Customer Quote Acceptance

Backend (`backend/tests/quote-acceptance.test.ts`, in-memory stores,
no MySQL required — run with `npm test` from `backend/`):

- Customer retrieves own quotes, then accepts an eligible quote →
  `200` with `{ job, quote }`: quote `SUBMITTED → ACCEPTED`, job
  `QUOTED → ACCEPTED` with `agreedAmount`/`currency` recorded, the
  accepted provider still the addressed provider, and a `QUOTED →
  ACCEPTED` status-history entry.
- `404` for another customer's job, cross-job quote ids and unknown
  quotes; `403` for provider-only, technician-only, manager-only and
  admin-only actors (exact-role users are provisioned directly
  because `setRoles` is additive); a dual-role owner-manager accepts
  their own job.
- `409 CONFLICT` for repeat acceptance (single history entry);
  `422` for withdrawn/declined quotes and `REQUESTED`/`COMPLETED`/
  `CANCELLED`/`DISPUTED` jobs; `404` for `INTERNAL` jobs; `400` for
  malformed ids; `401` unauthenticated.
- Failed acceptance leaves job `QUOTED`, quote untouched,
  `agreedAmount` null and no `ACCEPTED` history (rollback).
- Multiple quotes: one acceptance wins, the other retires to
  `DECLINED` (never deleted) and can no longer be accepted; provider
  request detail reflects `ACCEPTED`.
- All asserted responses preserve the standard success/error
  envelopes.

Frontend (`apps/web`, run with `npx ng test --watch=false`):

- `job.service.spec.ts`: accept call posts `{}` to
  `/jobs/:id/quotes/:quoteId/accept` and resolves `{ job, quote }`.
- `job-detail.spec.ts`: QUOTED job shows per-quote `Accept Quote`
  actions; hidden for `REQUESTED`/`ACCEPTED` and ineligible quotes;
  confirmation step with the quoted amount and direct-payment
  wording; in-flight `Accepting…` disabled state; success → `Quote
  accepted` banner with agreed price and payment wording, no further
  actions; server errors surfaced with the quote intact;
  multi-quote selection and retired (`No longer available`) display.
- `request-detail.spec.ts`: `ACCEPTED` jobs show the provider-side
  `Accepted` state with the agreed amount and no quote form.

No database migration was required in Stage 6D (existing
`quotes.status`, `jobs.agreed_amount`/`currency`,
`job_status_history` and `job_assignments` reused); the
`database/tests/schema.test.js` suite still requires a live MySQL
instance and is unchanged.

## Stage 6E — Scheduling & Job Execution Start

Backend (`backend/tests/job-scheduling.test.ts`, in-memory stores, no
MySQL required — run with `npm test` from `backend/`):

- Scheduling authorization: addressed provider/owner/manager schedule
  an `ACCEPTED` job → `200` with the `SCHEDULED` job (agreed amount
  preserved); another provider's job → `404`; customer/technician →
  `403`; unauthenticated → `401`; business owner and manager schedule
  applicable business-owned marketplace jobs.
- Scheduling validation: missing, malformed (`not-a-date`,
  `2026-13-40`, impossible `2026-02-30`, non-string) and past
  `scheduledAt` → `422`; scheduling without an accepted quote → `422`.
- Scheduling state transition: `REQUESTED`/`QUOTED` jobs cannot be
  scheduled (`422`); success writes `jobs.scheduled_at` plus an
  `ACCEPTED → SCHEDULED` history entry; failure leaves the job
  `ACCEPTED` with no history entry.
- Start authorization and transition: `SCHEDULED → IN_PROGRESS`
  (`200`) for the addressed provider; `ACCEPTED`/`REQUESTED`/`QUOTED`
  jobs cannot be started (`422`); repeat start → `422` (single
  history entry); another provider → `404`; customer/technician →
  `403`; failure leaves the job `SCHEDULED`.
- Status display and date/time: customer retrieves `SCHEDULED` and
  `IN_PROGRESS` jobs with the exact scheduled instant; the `+02:00`
  SAST slot round-trips to the same instant (no timezone shift);
  accepted quote stays `ACCEPTED` and cannot be replaced (a second
  submission after scheduling → `422`).
- Provider inbox surfaces `ACCEPTED`/`SCHEDULED`/`IN_PROGRESS`
  (filterable; terminal states still → `422`); malformed ids → `400`.
- All asserted responses preserve the standard success/error
  envelopes.

Frontend (`apps/web`, run with `npx ng test --watch=false`):

- `job.service.spec.ts`: schedule posts `{ scheduledAt }` to
  `/jobs/:id/schedule` and resolves the job; start posts `{}` to
  `/jobs/:id/start` and resolves the job.
- `request-detail.spec.ts`: schedule form visible only for `ACCEPTED`
  jobs with an accepted quote; invalid date/time blocked; success →
  `Scheduled: 5 October 2026 at 10:00` with a Start action;
  `Scheduling…` disabled state; server errors surfaced with the
  `ACCEPTED` state intact; Start visible only when `SCHEDULED`;
  `Start this job?` confirmation with the in-progress wording;
  `Starting…` disabled state; success → active `In progress` state;
  start errors surfaced with the `SCHEDULED` state intact.
- `job-detail.spec.ts`: `ACCEPTED` shows the schedule-next-step text;
  `SCHEDULED` shows the SAST slot, provider and agreed price;
  `IN_PROGRESS` shows the active state with schedule and price; no
  Schedule/Start/Accept controls in any of these states (read-only).
- `my-jobs.spec.ts` / `requests.spec.ts`: `Scheduled` / `In
  progress` badges with the SAST slot.
- `formatScheduledAt` (SAST rendering of the stored instant) is
  covered through the component assertions above.

No database migration was required in Stage 6E (existing
`jobs.status` ENUM, `jobs.scheduled_at` and `job_status_history`
reused); the `database/tests/schema.test.js` suite still requires a
live MySQL instance and is unchanged.

## Stage 6F — Job Execution & Work Documentation

Backend (`backend/tests/job-execution.test.ts`, in-memory stores plus
isolated local-storage tmp dirs, no MySQL required — run with
`npm test` from `backend/`):

- Work documentation: addressed provider uploads `BEFORE`/`DURING`/
  `AFTER` photos (`201`, metadata only — no binary, path or storage
  key) and creates `BEFORE`/`DURING`/`AFTER` notes (`201`); uploads
  and notes on `SCHEDULED` jobs → `422`.
- Media authorization: customer upload and provider update → `403`;
  unrelated provider upload/update → `404`; technician update →
  `403`; another customer's photo list/bytes → `404`;
  unauthenticated → `401`; owner customer and addressed provider
  retrieve metadata and bytes (`200`, correct MIME).
- Media validation: invalid phase, `text/plain` upload, spoofed PNG
  content (sniffed) and oversized files → `422`.
- Photo deletion: uploader deletes own photo while `IN_PROGRESS`
  (`200`, list shrinks); customer delete → `403`; deletion after
  completion → `422`.
- Progress updates: empty and overlong notes → `422`; customer and
  foreign-provider creation rejected.
- Completion: `IN_PROGRESS` job with a note → `200` (`COMPLETED` +
  AFTER record); `SCHEDULED`/`ACCEPTED` jobs → `422`; missing/blank
  and overlong notes → `422`; `IN_PROGRESS → COMPLETED` history
  recorded; failure leaves the job `IN_PROGRESS`; customer completion
  → `403`.
- Confirmation: owning customer confirms `COMPLETED` → `200` with
  the `CLOSED` job; `IN_PROGRESS` → `422`; another customer's job →
  `404`; provider → `403`; `COMPLETED → CONFIRMED` and
  `CONFIRMED → CLOSED` history recorded; failure leaves the job
  `COMPLETED`; repeat confirm → `422`.
- Guards: `CLOSED` jobs reject updates/uploads/completion/
  confirmation; `SCHEDULED → COMPLETED`, `IN_PROGRESS → CONFIRMED`
  (via confirm) and `COMPLETED → IN_PROGRESS` (via start) are all
  rejected; timeline contains `REQUESTED`…`CLOSED` plus update and
  image events for both viewers; malformed/unknown ids and
  unauthenticated calls keep the standard envelopes.

Frontend (`apps/web`, run with `npx ng test --watch=false`):

- `job.service.spec.ts`: multipart photo upload (phase + file),
  photo list and authorized file URL, photo delete, update create
  (trimmed) and list, timeline fetch, complete (trimmed note) and
  confirm calls.
- `job-detail.spec.ts`: `IN_PROGRESS` Before/During/After sections
  with notes, photo rendering via blob object URLs, work loading and
  error/retry states, `COMPLETED` completion record with Confirm
  Completion / Not Yet actions, confirming state, error surface,
  Not-Yet guidance without state change, `CLOSED` read-only state
  with timeline, and absence of provider-only controls.
- `request-detail.spec.ts`: `IN_PROGRESS` Before/During/After
  sections, per-phase photo upload (call args, uploading state,
  error surface), note validation and save, Complete Job disabled
  until the completion note exists, completion confirmation and
  success (`COMPLETED`, no further actions), completing state,
  error surface with `IN_PROGRESS` intact, `COMPLETED` record
  without customer actions, and `CLOSED` read-only state.

One additive migration in Stage 6F (`009_job_execution.sql`:
nullable `job_updates.phase` + `job_images.original_filename`);
the `database/tests/schema.test.js` suite still requires a live
MySQL instance and is unchanged.

## Stage 7A — Business Foundation & Technician Management

Backend (`backend/tests/business.test.ts`, in-memory stores, no MySQL
required — run with `npm test` from `backend/`; in sandboxes where
the `tsx --test` wrapper stalls, the equivalent
`node .test-dist/tests/business.test.js` against a `tsc` build
runs the same file):

- `401` unauthenticated on all six business endpoints; `403` for
  customer, professional, technician (management surface) and admin
  actors; `404` for an owner-role account with no business.
- Owner reads their own business (`200` + standard envelope,
  `role: OWNER`, real `technicianCount`, no private fields);
  manager reads the same business with `role: MANAGER`.
- Owner profile update (`200`, spoofed `business_id`/`owner_id`/
  `role` ignored); manager update → `403`; empty/unknown-only and
  malformed-email patches → `422`.
- Owner and manager invites (`201`): brand-new email creates an
  `ACTIVE` `TECHNICIAN` login that authenticates with `TECHNICIAN`
  role; existing accounts link without a password (`password`
  alongside an existing email → `422`; missing password for a new
  email → `422`); roster scoping per business; owner/manager detail
  reads; cross-business reads/patches → `404` (no probing).
- Technician actors: list/create/patch own-business → `403`,
  business profile → `403`, own row → `200`, any other id (same or
  other business) → `404`; deactivation revokes business access
  (own row → `404`); manager reactivation → `200`.
- Malformed ids → `400`; unknown ids → `404`; invalid payloads
  (missing name/email, bad email/phone, short password, empty
  patch, non-boolean status) → `422`; double-link (same email,
  owner-as-technician) → `409 CONFLICT`; role assertions for every
  actor incl. technicians staying out of the provider inbox.
- All asserted responses preserve the standard success/error
  envelopes.

Frontend (`apps/web`, run with `npx ng test --watch=false`):

- `business.service.spec.ts`: business fetch without a business id,
  profile patch body mapping (trimmed, empties omitted),
  technician list, single-technician fetch with URL encoding,
  invite body mapping (phone omitted when empty), technician
  update with the active flag.
- `business-dashboard.spec.ts`: business name/role/verification/
  technician count, jobs placeholder without fake counts, error
  state, owner edit flow (save call args), manager without edit.
- `technician-list.spec.ts`: roster with status/contact, empty and
  error states, invite form for managers (hidden for customers),
  invite submit appending to the roster.
- `technician-detail.spec.ts`: detail with contact info, error
  state, owner deactivate call args with status change,
  hidden management for technicians.
- `app.spec.ts` unchanged (header entry points); role-aware
  Business/Technicians navigation follows the `showBusiness`
  rule (owner/manager only).

No migration in Stage 7A — the existing `business_profiles`,
`business_members`, `technicians` and `users` tables already
support it; no database doc change was required.


## Stage 7B — Internal Business Jobs

Backend (`backend/tests/business-internal-jobs.test.ts`,
in-memory business + jobs stores, no MySQL required — run with
`npm test` from `backend/`):

- Authentication: unauthenticated customer endpoints (list,
  create, read, patch) → `401`; unauthenticated job endpoints
  (list, create, read, patch, cancel, summary) → `401`.
- Roles: customer and professional cannot manage business
  customers (`403`); technician cannot create/list/cancel
  internal jobs or manage customers (`403`); admin has no
  business identity (`403`); customers/professionals cannot
  reach internal jobs (`403`).
- Customers: owner and manager create (`201`, owned by the
  caller's business, no auth internals leaked); owner/manager
  list only their own customers; update works with spoofed
  `business_id` ignored; empty/broken payloads (missing names,
  bad email/phone/contact, empty patch) → `422`;
  cross-business reads/patches → `404` (no probing); unknown →
  `404`, malformed → `400`.
- Jobs: owner and manager create (`201`, `source = INTERNAL`,
  `status = REQUESTED`, correct `businessId`, spoofed
  `business_id`/`status`/`source` ignored); unknown customer →
  `404`, foreign-business customer → `404`, malformed customer
  id → `400`; unknown/malformed service → `404`/`400`; short
  description, missing address, bad priority/date → `422`;
  owner/manager lists (INTERNAL only, business-scoped);
  marketplace jobs never appear in the internal list and are
  never served by the internal detail endpoint (marketplace
  regression guard creates a real `MARKETPLACE` job first);
  business A cannot read/patch/cancel business B jobs (`404`);
  detail returns the correct customer/service/business plus the
  timeline; creation writes the `NULL → REQUESTED` history
  entry; `PATCH { status }` and cancel-with-status → `422`
  with the job untouched; eligible cancel → `200 CANCELLED`
  with a second history entry; repeat cancel → `422`;
  REQUESTED-only field updates (post-cancel edits → `422`);
  pagination (`total`/`page`/`pageSize`, invalid → `422`);
  filtering (`status`, `search` over reference/description/
  customer/service, invalid status → `422`); summary reports
  real counts (zeros when empty, business-scoped); malformed →
  `400`, unknown → `404`.
- All asserted responses preserve the standard success/error
  envelopes. Existing marketplace suites run unchanged
  (regression: customer job creation still yields
  `MARKETPLACE`/`REQUESTED` with provider assignment).

Frontend (`apps/web`, run with `npx ng test --watch=false`):

- `business-internal.service.spec.ts`: customer list params,
  customer create/update body mapping (trimmed, no business
  id), job list params (status/search/pagination), single-job
  fetch, job create body mapping (no `source`/`status`/
  `businessId`), job update without status control, cancel
  through the dedicated endpoint, summary fetch.
- `business-jobs-list.spec.ts`: loading/empty/error states,
  job cards with status/customer/service/date/priority/source,
  and no assignment/technician/parts controls.
- `business-job-new.spec.ts`: customer/service options,
  create-first prompt when empty, error state, creation showing
  the reference with REQUESTED status, no assignment controls.
- `business-job-detail.spec.ts`: customer/service/description/
  address/priority/schedule/status/timeline/business display,
  error state, REQUESTED cancellation, hidden management after
  cancellation, no assignment/parts controls.
- `business-customers.spec.ts`: list, empty and error states,
  creation appending to the list.
- `business-profile.spec.ts`: profile with role/verification,
  error state, owner-only edit gating.
- `business-dashboard.spec.ts` (updated): real internal-job
  counts from the summary endpoint (zero-count case), replacing
  the Stage 7A "Coming soon" placeholder test.
- Environment note (2026-09-24): `npx ng test --watch=false`
  cannot execute in this sandbox — vitest fork workers fail to
  start (`[vitest-pool]: Failed to start forks worker … Timeout
  waiting for worker to respond`, then `Worker exited
  unexpectedly`), identically for untouched pre-existing specs
  (verified with `src/app/app.spec.ts`). `node_modules` was
  left alone per scope rules. Specs are verified by
  `tsc --noEmit -p tsconfig.app.json`,
  `tsc --noEmit -p tsconfig.spec.json` (both pass) and a
  successful `npx ng build` (all new lazy chunks emitted).

No migration in Stage 7B — `customer_profiles.business_id`,
`jobs.business_id`/`source`/`status`/`priority`/`scheduled_at`
and `job_status_history` already support it; no database doc
change was required.

## Stage 7C — Technician Assignment + My Jobs

Backend (`backend/tests/business-technician-assignment.test.ts`,
20 cases, in-memory stores — run with `npm test` from
`backend/`; full suite 265/265 green):

- Owner can assign (1); manager can assign (2); technician
  cannot assign (3, `403`); customer cannot assign (4, `403`);
  professional cannot assign internal jobs (5, `403`).
- Cross-business technician → `404` (6); inactive technician →
  `422` (7); non-technician id → `404` (8); foreign-business job
  → `404` (9); marketplace job via internal assignment → `404`
  (10).
- Assignment persisted + history recorded, job status untouched
  at `REQUESTED` (11+18); reassignment via the PATCH alias with
  two-entry history (active + closed) (12+18).
- Technician lists own assigned jobs (13); cannot list another
  technician's jobs (14); opens own assigned job + timeline (15);
  another technician's job → `404` (16); unrelated business job
  → `404` with empty list (17); other roles `403` + anonymous
  `401` on the technician surface.
- Stage 7B regression (19): list/detail/summary/cancel intact.
  Marketplace regression (20): creation still yields
  `MARKETPLACE`/`REQUESTED`; internal list stays empty.

Frontend (`apps/web`, `npx ng test --watch=false` — 29 files,
209 tests, all green):

- `technician-assignment.service.spec.ts` (new): assign posts
  only `{ technicianId }` (no business id/status), assignment
  fetch with history, technician list/detail fetches.
- `business-job-detail.spec.ts` (updated): unassigned state +
  Assign control, current technician + Reassign control,
  selector submit calls `assignTechnician(jobId,
  { technicianId })`; the old "no assignment controls" test was
  replaced (assignment is now expected); parts still absent.
- `technician-jobs.spec.ts` (new): loading/empty/error states,
  assigned cards (service/customer/address/status), status
  filter dispatch, no marketplace/parts/approval controls.
- `technician-job-detail.spec.ts` (new): full job display,
  error state for unauthorized jobs, no assign/parts/manage
  controls.
- The sandbox vitest worker crash noted for Stage 7B did not
  recur for the final run (one genuine assertion failure in a
  new spec — the `AWAITING_PARTS` label containing "parts" —
  was found and fixed first).

No migration in Stage 7C — `job_assignments`
(`assignment_type = TECHNICIAN`, `unassigned_at` history)
already supports it; no database doc change was required.

## Stage 7D — Technician Execution + Voice Notes

Backend (`backend/tests/technician-execution.test.ts`, 32
cases, in-memory business store + isolated storage tmp dir —
run with `npm test` from `backend/`; full suite 297/297
green):

- Assigned technician starts REQUESTED → IN_PROGRESS with
  history (1); unassigned technician cannot start (2, `404`);
  cross-business technician cannot access (3, `404`); double
  start → `422` with the job left IN_PROGRESS;
  customer/manager on the technician start endpoint → `403`.
- BEFORE (4), DURING (5) and AFTER (6) photos (`201`, phase +
  metadata, no storage-key leak); photos before start → `422`
  (7c variant); unauthorized image upload → `404` (10);
  uploader delete works and bytes disappear; photo bytes need
  auth (`401` anonymous, `404` stranger, `200` with
  `image/*` + `inline` for the owner).
- BEFORE/DURING text updates (7, `201`); unauthorized update →
  `404` (11); updates before start → `422`.
- Voice-note upload (8, `201`, no key leak); metadata
  persisted — mime, size, duration (13); WAV/Ogg/MP4 accepted;
  stored bytes stream back with `audio/*` + `inline` +
  `private` (14); unauthorized upload → `404` (9); file
  endpoint auth (`401`/`404`) (15); cross-business voice
  access → `404` (16).
- Completion needs a note from IN_PROGRESS (note-less/early →
  `422`); unauthorized complete → `404` (12); completion
  stores the AFTER note, writes COMPLETED history, closes
  further docs and rejects repeats (17); timeline carries
  status + assignment + update + image + voice in
  chronological order (18).
- Audio validation rejects text uploads, MIME/content
  mismatches and bad durations (22, `422`); size validation
  rejects >10MB voice and >5MB images (23, `422`); malformed
  and unsafe storage keys are rejected by the adapter with
  round-trip reads intact (24).
- Business visibility: owner and manager read images/updates/
  voice/timeline + bytes (read-only); foreign business →
  `404`; technician on the business surface → `403`.
- Stages 7C/6F/marketplace remain covered by their untouched
  suites in the same run (brief items 19–21).

Frontend (`apps/web`, `npx ng test --watch=false` — 29 files,
217 tests, all green; Chrome required via `CHROME_BIN` —
plain `vitest run` hangs on the Angular TestBed setup and is
not the supported path):

- `technician-job-detail.spec.ts` (updated): existing
  detail/error/no-management tests intact (Business card
  restored); Start Work confirm flow calls `startMyJob`;
  BEFORE/DURING/AFTER workspace with notes, voice and
  Complete Job; DURING note save dispatches
  `createMyJobUpdate`; voice-unavailable fallback message with
  the audio-file picker; Complete Job disabled without a note;
  read-only completed record.
- `business-job-detail.spec.ts` (updated): read-only work
  documentation (notes, photos, voice, timeline) for
  IN_PROGRESS jobs with no technician capabilities; hidden
  for REQUESTED jobs; all earlier tests intact.
- Full suite green with no pre-existing test removed or
  weakened.

Migration 010 adds nullable
`job_voice_notes.original_filename` (mirroring 009); the
shared `jobs` / `job_images` / `job_updates` /
`job_voice_notes` / `job_status_history` tables are otherwise
unchanged.
