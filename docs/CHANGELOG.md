# FixLink — Changelog

## Stage 12 — Client UAT and Handover Preparation (2026-09-25)

- Added client-facing UAT instructions, test accounts and a practical UAT
  test matrix covering the current marketplace, business, technician,
  admin, media, privacy and isolation surfaces.
- Added deployment, environment, production checklist, post-deployment
  smoke-test, technical handover, client acceptance and documentation
  index documents.
- Reconciled deployment, storage, migration/seed, permissions and current
  limitation notes with the implemented repository. No product feature,
  role, job engine, payment flow or admin settings capability was added.
- Documented the local filesystem MVP adapter, private media controls,
  production secret requirements, MySQL backup/restore flow and the
  requirement to back up database metadata together with files.
- The Angular automated test runner remains environment-limited in this
  development environment; frontend typecheck and production build are
  the available Stage 11 evidence. No commit or push is part of this
  documentation-only stage.

## Stage 11 — Full System Validation (2026-09-25)

- Recorded the Stage 11 full-system test report against the Stage 10
  security implementation. Result: **PASS WITH LIMITATIONS**.
- Database tests and backend tests passed; frontend typecheck and
  production build passed. Angular tests did not reach execution in the
  Stage 11 environment. `/admin/settings` remains an explicit limitation.
- No Stage 11 commit or push is represented by the historical report's
  working-tree note; current repository history is authoritative for Git
  state.

## Stage 10 — Security Hardening and QA (2026-09-25)

- Hardened authentication and platform boundaries, authoritative role
  loading, rotating hashed refresh sessions, production secret validation,
  rate limiting, private file responses, business isolation and safe API
  error handling.
- Security controls and known limitations are documented in
  `docs/SECURITY.md` and covered by the Stage 11 test report.

## Stage 9 — Admin / Platform Operations (2026-09-25)

- Completed the active-admin platform operations surface on the existing
  data model: dashboard aggregates; platform-wide user, customer,
  professional, business, technician, service, job, verification,
  certificate, review, report, dispute and audit-log visibility; enriched
  detail DTOs for user last-login metadata, customer history, professional
  catalogue/portfolio/certificate context, business membership/team/jobs,
  technician assignment history and job timeline/quotes/documentation;
  guarded user suspension/reactivation; service creation/editing/activation;
  verification and certificate review; report/dispute status operations;
  and read-only audit-log viewing.
- Backend: `backend/src/modules/admin/` now provides strict query/body
  validation, safe projections, authoritative `requireAuth` +
  active `ADMIN` enforcement, platform-wide store queries, bounded nested
  detail projections, protected verification/certificate document
  streaming, metadata-only job documentation, atomic audit writes and
  typed conflict/not-found/validation errors. The backend contract is
  documented in `docs/API.md`; operational boundaries are in
  `docs/ADMIN.md`.
- Frontend: lazy `/admin` shell, dashboard, resource lists/details,
  filters, pagination, loading/empty/error/retry states, enriched detail
  sections and nested job documentation metadata, confirmations, service
  editor, protected document opening, settings not-configured state and
  admin not-found state. Navigation/guard checks are UX-only; the backend
  remains the security boundary.
- Security/privacy: non-admin and inactive-admin requests are rejected;
  multi-role users are allowed only when active `ADMIN` is authoritative;
  self-status changes are rejected; private document references,
  storage keys, filesystem paths, credentials and binary content are not
  returned by JSON projections; document views are audited; audit entries
  are read-only; state transitions are guarded server-side.
- Documentation: added `docs/ADMIN.md`; updated `docs/API.md`,
  `docs/PERMISSIONS.md`, `docs/USER-FLOWS.md` and `docs/TEST-PLAN.md`
  with the exact implemented Stage 9 contracts and limitations.
- Tests confirmed: backend **404 passed** across **51 suites**;
  frontend **310 passed** across **35 test files**. The suites cover the
  admin role matrix, resource and enriched-detail contracts, bounded child
  collections, query validation, privacy, document access, atomic audit
  behavior, transitions, UI states, filters, pagination and confirmations.
- No migration was created because existing platform tables were reused;
  `docs/DATABASE.md` was intentionally not changed.
- Stage 9 limitations remain explicit: settings are not implemented;
  review moderation, job intervention, role management and technician
  assignment are not implemented; admin-specific notification contexts
  were not added.
- Next: **Stage 10**. No Stage 10 work is started by this change.

## Stage 8 — In-App Notifications (2026-09-24)

- MVP in-app system on the existing `notifications` table
  (migration 008 — no new migration): central
  `NotificationService`
  (`backend/src/modules/notifications/` — types, store
  contract, memory + MySQL stores, service, controller,
  routes) with `create` / `createForUsers` / `listForUser` /
  `getUnreadCount` / `markRead` / `markAllRead`. All 16
  types (`JOB_REQUEST` … `PARTS_AVAILABLE`); references
  `JOB` (marketplace) / `INTERNAL_JOB` (internal) so every
  row opens exactly one job detail.
- Endpoints: `GET /api/v1/notifications` (`unreadOnly`,
  `page`/`pageSize`), `GET
  /api/v1/notifications/unread-count`, `POST
  /api/v1/notifications/:id/read`, `POST
  /api/v1/notifications/read-all` — recipient always the
  session user, foreign ids `404`, malformed ids
  `400`/`422`.
- Events wired best-effort after commit (delivery never
  rolls back the operation; actor excluded; server-side
  recipients): marketplace job requests/quotes/accept/
  schedule/start/complete/confirm plus business
  assignment/reassignment, technician start/updates/
  photos/voice/completion, parts request/approve/reject/
  info/available (exactly one per fulfilment)/respond.
  The Stage 7F bus keeps emitting as a test seam and is
  never persisted — no double delivery.
- Recipient-resolution additions (memory + MySQL):
  `findUserIdByCustomerId` (jobs),
  `findUserIdsForProvider` (quotes),
  `findActiveManagerUserIds` (business). No verification,
  contact or admin-only data in messages; customers never
  see internal notifications; cross-business delivery
  impossible.
- Angular: Oceanic bell + unread badge + compact panel in
  the authenticated shell (60s badge polling, no
  WebSockets), full `/notifications` inbox (filter, mark
  read/all-read, pagination, loading/empty/error), and
  role-specific navigation (`notificationRouteFor`).
- Tests: `backend/tests/notifications.test.ts`
  (33 cases) — full backend suite green: 386/386;
  frontend suite green: 32 files, 268 tests;
  `tsc --noEmit` (backend + web app + specs) and both
  builds pass.
- Out of scope in Stage 8: admin contexts, email/SMS/WhatsApp/push,
  payments, GPS, messaging. Admin / Platform Operations is delivered in
  Stage 9 below; no Stage 10 work is started by this changelog.

## Stage 7G — Business Job Board + History (2026-09-24)

- Operational board on the existing shared jobs
  architecture — no new tables, no duplicate statuses, no
  second timeline: extended `GET /api/v1/business/jobs`
  (`backend/src/modules/business/` — same router,
  controller, service, memory + MySQL stores) with
  server-backed `board` (ALL/NEW/ASSIGNED/SCHEDULED/
  IN_PROGRESS/AWAITING_PARTS/COMPLETED/CANCELLED/HISTORY),
  `technicianId`, `priority`, `from`/`to` (inclusive
  creation-date bounds), `assigned`, `sort`
  (RECENT/SCHEDULED/PRIORITY) plus the Stage 7B
  `status`/`search`/pagination. Derivation, not new
  state: NEW is REQUESTED, ASSIGNED is the active
  TECHNICIAN assignment, SCHEDULED is the `scheduled_at`
  slot, HISTORY is COMPLETED/CLOSED/CONFIRMED.
  Rows carry `assignment` (technician + assignedAt),
  `partsOutstanding` (APPROVED not yet available) and
  `lastUpdateAt`; search covers reference/title/
  description/customer name/email/phone/service.
  New `GET /api/v1/business/jobs-board-summary`
  (`total/requested/assigned/scheduled/inProgress/
  awaitingParts/completed/cancelled/history`,
  business-scoped); legacy `jobs-summary` unchanged.
  Isolation throughout: owner/manager only (`403`/
  `401`), server-derived business, foreign jobs `404`,
  foreign technician filter → empty `200`, marketplace
  excluded.
- Angular: `/business/jobs` is the board (counted
  category tabs, technician/priority/date/sort/search
  filters, operational cards with awaiting-parts badge,
  pagination, loading/empty/error states, detail links)
  and the dashboard gains the operations card; design
  system extended with wrapping `.fl-board-tabs`.
  Technician My Jobs untouched.
- Tests: `backend/tests/business-job-board.test.ts`
  (22 cases: auth, isolation, all nine boards,
  derivation, enrichment, counts, filters, search,
  dates, pagination, sorting, invalid `422`s) plus
  rewritten/extended frontend board, dashboard and
  service specs. Full backend suite green: 353/353;
  frontend suite green: 29 files, 243 tests;
  `tsc --noEmit` (backend + web app + specs) and both
  builds pass.
- Out of scope (next: Stage 8 — Notifications):
  notification persistence/delivery, payments, admin,
  GPS, messaging.

## Stage 7F — Manager Approvals + Awaiting Parts (2026-09-24)

- Manager approval workflow on the existing tables — no new
  tables, no duplicate job architecture: `job_approvals`
  (`request_type = PARTS`) reused for every decision;
  migration `011_parts_available.sql` only extends
  `parts_requests.status` with `PARTS_AVAILABLE`.
  Owner/manager decisions
  (`backend/src/modules/business/` — same router, new
  `business-approvals.validation.ts`, everything derived
  server-side, atomic request + approval + job + history
  writes): `POST
  /api/v1/business/jobs/:jobId/parts/:requestId/approve`
  (PENDING/NEEDS_INFO → APPROVED, IN_PROGRESS →
  AWAITING_PARTS) returns `200 { request, approval, job }`;
  `.../reject` (comment required, → REJECTED, job stays
  IN_PROGRESS); `.../request-info` (comment required, →
  NEEDS_INFO); `.../available` (APPROVED → PARTS_AVAILABLE,
  resumes AWAITING_PARTS → IN_PROGRESS only when no
  APPROVED request remains — the documented multiple-request
  rule — returns `200 { request, job, jobResumed }`).
  Technician surface: `POST
  .../technician/jobs/:jobId/parts/:requestId/respond`
  (NEEDS_INFO → PENDING, note kept as a PENDING approval
  row) and `POST .../technician/jobs/:jobId/resume`
  (guarded by the same outstanding-approved rule).
- State machine enforced server-side (duplicates/terminal/
  self-review/out-of-state → `422`, foreign → `404`,
  wrong roles → `403`/`401`); decisions carry reviewer,
  comment and timestamp on the request plus full history,
  and every action appears in the existing execution
  timeline (one `parts` event per decision/response plus
  status moves). Notification seam only: decisions emit
  `PARTS_REQUEST_*` / `PARTS_AVAILABLE` /
  `JOB_READY_TO_CONTINUE` events on the shared
  `parts-request-events` bus (threaded through app deps
  for tests) — nothing is written to `notifications`
  until Stage 8.
- Angular: `/business/jobs/:id` gains Approve / Reject /
  Request More Info (comment required for reject/info) for
  PENDING/NEEDS_INFO plus Mark Parts Available for
  APPROVED, with decision/comment/timestamp per request
  and no actions on terminal states; `/technician/jobs/:id`
  gains the decision display, NEEDS_INFO response form,
  Awaiting Parts banner, Parts Available notice and
  Continue Job (only when the server allows) — no approval
  controls on the technician surface.
- Tests: `backend/tests/parts-approvals.test.ts` (17
  cases: approve/reject/info/respond/available/resume,
  two-request rule, idempotency, isolation, rollback,
  seam events, timelines, guards) plus new/updated
  frontend specs. Full backend suite green: 331/331;
  frontend suite green: 29 files, 231 tests; `tsc
  --noEmit` (backend + web app + specs) and both builds
  pass.
- Out of scope (next: Stage 7G — Business Job Board +
  History): notification persistence/delivery (Stage 8),
  payments, admin, GPS, messaging.

## Stage 7E — Technician Parts Requests (2026-09-24)

- Technician parts-request foundation on the existing
  `parts_requests` / `parts_request_items` tables (migration
  006) — no migration, no new tables, no duplicate job
  tables. Technician submission surface
  (`backend/src/modules/business/` — same router, new
  `business-parts.validation.ts`, identity/ownership/state
  derived server-side): `POST
  /api/v1/technician/jobs/:jobId/parts` (JSON or multipart
  with optional `photo`; part name ≤255, quantity 1–10000,
  reason 10–1000 chars; IN_PROGRESS/AWAITING_PARTS only)
  returns `201` PENDING with items and never changes job
  status; `GET .../parts` / `GET .../parts/:requestId` /
  `GET .../parts/:requestId/photo/file` (authorized bytes,
  `404` when photo-less). Read-only business visibility:
  `GET /api/v1/business/jobs/:jobId/parts` (+ single +
  photo file). Both timelines gain read-time `parts` events
  (no history-row write). Status ENUM reused (PENDING only
  in this stage); no estimated-cost field (not in schema).
- Authorization: unauthenticated → `401`; wrong roles →
  `403` on both surfaces; unassigned/cross-business/
  cross-technician/marketplace access → `404` (no probing);
  wrong state → `422`; malformed ids → `400`. Photo
  reuses the shared FileStorage image pipeline (sniffed
  JPEG/PNG/WebP, 5MB, opaque key, metadata only in
  responses).
- Angular: `/technician/jobs/:id` gains the Request Parts
  form (part, quantity, reason, optional photo) plus the
  Parts Required list with status, gated to eligible
  states; `/business/jobs/:id` gains the read-only parts
  section (part, quantity, reason, technician, date,
  status, photo); both timelines render `parts` events.
  No approval controls anywhere (Stage 7F).
- Tests: `backend/tests/parts-requests.test.ts` (16 cases:
  submission, isolation, states, validation, list/get,
  owner/manager reads, roles, timelines, photo auth) plus
  updated/new frontend specs. Full backend suite green:
  313/313; frontend suite green: 29 files, 222 tests;
  `tsc --noEmit` (backend + web) and both builds pass.
- Out of scope (Stage 7F next): approve/reject/needs-info
  endpoints, `job_approvals` workflow, IN_PROGRESS →
  AWAITING_PARTS transition, notifications, payments.

- Technician execution on the shared architecture — no second
  job-execution system: `jobs` (`source = INTERNAL`), `job_images`
  (phase BEFORE/DURING/AFTER), `job_updates` (phase + message),
  `job_voice_notes` (file reference + metadata) and
  `job_status_history`. New technician surface
  (`backend/src/modules/business/` — same router, technician
  identity derived server-side, active-assignment scoping, foreign
  jobs read as `404`): `POST
  /api/v1/technician/jobs/:jobId/start` (REQUESTED/SCHEDULED →
  IN_PROGRESS, atomic), `POST|GET
  /api/v1/technician/jobs/:jobId/images` (+
  `GET .../images/:imageId/file`, `DELETE .../images/:imageId`
  uploader-only), `POST|GET .../updates`, `POST|GET
  .../voice-notes` (+ `GET .../voice-notes/:voiceNoteId/file`),
  `GET .../timeline` (status + assignment + update + image +
  voice events, chronological) and `POST .../complete`
  (IN_PROGRESS → COMPLETED, note required as the AFTER record).
  Read-only business visibility for owner/manager on owned jobs:
  `GET /api/v1/business/jobs/:jobId/images|updates|voice-notes|
  timeline` (+ file bytes). Voice notes: `audio/webm|mp4|mpeg|
  wav|ogg`, 10MB max, container-signature sniffing, optional
  duration 0–36000s, opaque `job-voice-notes/<jobId>/<hex>.<ext>`
  keys through the shared `FileStorage` adapter (new
  `saveVoiceNote`), bytes served only via authorized endpoints.
- Authorization: unauthenticated → `401`; wrong roles → `403`;
  unassigned/cross-business/cross-technician access → `404` (no
  probing); pre-start docs, double start, note-less completion →
  `422`; malformed ids → `400`. Marketplace execution untouched
  (provider/customer rules, endpoints and stores unchanged).
- Angular: `/technician/jobs/:id` gains Start Work (confirm),
  the BEFORE/DURING/AFTER execution workspace (photo upload +
  delete, notes, MediaRecorder voice recording with playback,
  remove, upload, mic-denied message and audio-file fallback,
  completion with required note, execution timeline) and a
  read-only completed state; `/business/jobs/:id` gains a
  read-only work-documentation section (photos, notes, voice
  playback, execution timeline); `.fl-photo` style added.
- Tests: `backend/tests/technician-execution.test.ts` (32
  brief-mapped cases: start, photos, updates, voice upload/list/
  stream, auth isolation, completion, timeline, business
  visibility, audio/size/key validation) plus updated/new
  frontend specs. Full backend suite green: 297/297; frontend
  suite green: 29 files, 217 tests; `tsc --noEmit` (backend, web
  app + spec) and both builds pass. Migration 010 adds
  `job_voice_notes.original_filename` (nullable) — no new tables.
- Out of scope (later stages): parts requests, manager
  approvals/awaiting-parts, business job board/history redesign,
  notifications, admin, payments, full system test, client UAT.

## Stage 7C — Technician Assignment + My Jobs (2026-09-24)

- Technician assignment on the existing `job_assignments` table
  (`assignment_type = TECHNICIAN`, active = `unassigned_at IS
  NULL`, reassignment closes + inserts atomically — no
  `technician_jobs` table, no ASSIGNED status, job status
  untouched): `POST /api/v1/business/jobs/:jobId/assign` and
  `PATCH /api/v1/business/jobs/:jobId/assignment`
  (owner/manager; `{ technicianId }` only; active same-business
  technician required) plus `GET
  /api/v1/business/jobs/:jobId/assignment` (`{ assignment,
  history }`). Technician My Jobs derived server-side from the
  session user: `GET /api/v1/technician/jobs` (own assigned jobs,
  status filter, pagination) and `GET
  /api/v1/technician/jobs/:jobId` (`{ job, timeline }`).
- Authorization: unauthenticated → `401`; wrong roles → `403`
  on both surfaces; cross-business job/technician ids and
  marketplace ids on internal surfaces → `404` (no probing);
  inactive technician → `422`; malformed ids → `400`.
- Angular: `/business/jobs/:id` gains the assignment card
  (current technician + history count) with Assign/Reassign
  controls; new `/technician/jobs` (filter, pagination,
  loading/empty/error states) and `/technician/jobs/:id`
  (service/customer/contact/address/priority/schedule/timeline,
  no assign/parts/manage controls); technician "My jobs" nav
  (business nav unchanged).
- Tests: `backend/tests/business-technician-assignment.test.ts`
  (20 brief-mapped cases: assign roles, cross-business/inactive/
  non-technician guards, marketplace exclusion, persistence,
  reassignment + history, technician list/detail isolation, 7B +
  marketplace regressions) and four new/updated frontend spec
  files. Full backend suite green: 265/265; frontend suite
  green: 29 files, 209 tests; `tsc --noEmit` (backend, web app +
  spec) and both builds pass. No migration — `job_assignments`
  already supports this stage.
- Out of scope (later stages): technician execution updates,
  voice notes, parts requests and approvals, notifications,
  admin dashboard, payments, marketplace changes.

## Stage 7B — Internal Business Jobs (2026-09-24)

- Business-managed customers on the existing `customer_profiles`
  table (`user_id = NULL`, `business_id` from the authenticated
  membership — never the frontend): `GET /api/v1/business/customers`
  (own customers, creation order, `search`/`page`/`pageSize`),
  `POST /api/v1/business/customers` (first/last name with a
  free-text `name` fallback, optional email/phone/contact),
  `GET /api/v1/business/customers/:customerId` and `PATCH`
  (≥1 field; explicit null clears contact fields). Customers are
  private: cross-business reads/patches → `404` (no probing).
- Internal jobs on the ONE shared `jobs` table (`source = INTERNAL`,
  `status = REQUESTED`, no parallel job tables):
  `POST /api/v1/business/jobs` (validates customer ownership and
  the active catalogue service; writes the job plus the initial
  `NULL → REQUESTED` history entry),
  `GET /api/v1/business/jobs` (INTERNAL only — marketplace rows
  never appear; `status`/`search` filters, pagination),
  `GET /api/v1/business/jobs/:jobId` (`{ job, timeline }` with
  embedded customer/service/business summaries),
  `PATCH /api/v1/business/jobs/:jobId` (field edits on REQUESTED
  jobs only — any `status` key → `422`),
  `POST /api/v1/business/jobs/:jobId/cancel` (guarded
  `REQUESTED → CANCELLED` with history; otherwise `422`), and
  `GET /api/v1/business/jobs-summary` (real `{ total, requested,
  scheduled, inProgress, completed, cancelled }` counts).
- Authorization: unauthenticated → `401`; customer/professional/
  technician/admin actors → `403`; cross-business customer/job
  access and marketplace ids on the internal surface → `404`;
  malformed ids → `400`; invalid payloads → `422`. Owner and
  manager share the full Stage 7B surface (profile edits stay
  owner-only).
- Angular: `/business/jobs` (filters, pagination, loading/empty/
  error states), `/business/jobs/new` (existing-customer select
  with create-first link, service select, reference + REQUESTED
  confirmation), `/business/jobs/:id` (detail + timeline, edit
  and cancel while REQUESTED, no assignment/parts controls),
  `/business/customers` (list, create, inline edit),
  `/business/profile` (profile + owner editor), dashboard with
  real job counts, and Dashboard/Jobs/Customers/Technicians/
  Profile/Settings navigation for owner/manager only.
- Tests: `backend/tests/business-internal-jobs.test.ts` (34
  brief-mapped cases: gating, customer CRUD + isolation,
  creation rules, listing/marketplace exclusion, detail +
  history, status control, cancellation, pagination/filtering,
  summary, plus a marketplace regression guard) and seven new/
  updated frontend spec files (service mapping, list/new/detail/
  customers/profile/dashboard states). Full backend suite green:
  245/245; `tsc --noEmit` (backend, web app + spec) and both
  builds pass. Web unit-test execution is blocked by the sandbox
  worker-spawn limitation (pre-existing — untouched specs fail
  identically); specs are typechecked and structurally verified.
  No migration — all Stage 7B data reuses `customer_profiles`,
  `jobs`, `services` and `job_status_history`.
- Out of scope (later stages): technician assignment, technician
  My Jobs/execution, voice notes, parts requests and approvals,
  notifications, admin dashboard, payments, marketplace changes.

## Stage 7A — Business Foundation + Technician Management (2026-09-23)

- Authenticated business surface for `BUSINESS_OWNER` /
  `BUSINESS_MANAGER`, derived server-side from membership (never a
  frontend `business_id`): `GET /api/v1/business/me` (profile with
  membership `role` and real `technicianCount`),
  `PATCH /api/v1/business/me` (owner-only: name, description,
  contact, address fields), `GET /api/v1/business/technicians`
  (roster), `POST /api/v1/business/technicians` (invite: new email
  creates an `ACTIVE` `TECHNICIAN` login with bcrypt hash;
  existing accounts link without password changes),
  `GET /api/v1/business/technicians/:technicianId` (owner/manager
  roster read, technician self-read) and `PATCH
  /api/v1/business/technicians/:technicianId` (rename,
  activate/deactivate with `technicians` + `business_members`
  flags synced in one transaction, so deactivation immediately
  revokes access).
- Authorization: unauthenticated → `401`; customer/professional/
  technician-management/admin actors → `403`; owner-less accounts
  → `404`; cross-business technician reads/patches → `404` (no
  probing); technicians never gain marketplace provider profiles
  and stay out of the provider inbox. Malformed ids → `400`,
  invalid payloads → `422`, double-links → `409 CONFLICT`.
- Angular: `/business` dashboard (name, verification, role,
  technician count, owner-only profile editor, explicit jobs
  "Coming soon" state with no fake counts),
  `/business/technicians` (roster with status/contact, empty and
  error states, manager invite form) and
  `/business/technicians/:id` (detail with rename and
  activate/deactivate for managers); role-aware Business/
  Technicians navigation for owner/manager only (technicians,
  customers and professionals get no business navigation).
- Tests: `backend/tests/business.test.ts` (23 cases: gating,
  profile, invites incl. technician login, scoping, A-vs-B
  isolation, technician self/management rules, activation sync,
  ids, validation, duplicates, roles, envelopes) plus business
  service/component frontend specs. Full suites green: backend
  213/213 (auth 19, marketplace 28, jobs 20, quotes 27,
  quote-acceptance 23, job-scheduling 31, job-execution 42,
  business 23); `tsc --noEmit` (backend, web app + spec)
  passes. No migration — existing `business_profiles`,
  `business_members`, `technicians`, `users` tables reused; no new
  tables, no duplicate job tables. Out of scope (later stages):
  business onboarding, internal jobs, assignment, technician My
  Jobs, parts, approvals, voice notes, notifications, admin,
  payments, new marketplace work.

## Stage 6F — Job Execution & Work Documentation (2026-09-23)

- Providers can now document work on in-progress marketplace jobs and
  complete them: `POST /api/v1/jobs/:jobId/images` (multipart `image`
  + `phase` → `201` metadata; JPEG/PNG/WebP, 5MB max, magic-byte
  sniffed, server-generated storage keys),
  `GET /api/v1/jobs/:jobId/images` and
  `GET /api/v1/jobs/:jobId/images/:imageId/file` (private retrieval
  for the owning customer or addressed provider only),
  `DELETE /api/v1/jobs/:jobId/images/:imageId` (uploader, while
  `IN_PROGRESS`), `POST /api/v1/jobs/:jobId/updates`
  (`{ phase, note }` → `201`), `GET /api/v1/jobs/:jobId/updates`,
  `GET /api/v1/jobs/:jobId/timeline` (`{ job, events }` oldest
  first), `POST /api/v1/jobs/:jobId/complete` (`{ note }` required →
  `IN_PROGRESS → COMPLETED` with the AFTER record, `Provider
  completed job` history) and `POST /api/v1/jobs/:jobId/confirm`
  (owning customer → `COMPLETED → CONFIRMED → CLOSED` in one
  transaction, both history entries, final `CLOSED` job returned).
  Every transition runs atomically with guarded status updates;
  failures leave the job untouched. File bytes live in the local MVP
  storage dir (`backend/uploads`, `FILE_STORAGE_DIR`-overridable,
  `FileStorage` seam for future object storage); MySQL stores
  metadata only. No payment, technician, parts, approval or
  notification functionality was added.
- Authorization: only the addressed `PROFESSIONAL` / `BUSINESS_OWNER`
  / `BUSINESS_MANAGER` may document or complete (others' jobs read as
  `404`; customers/technicians receive `403`); only the owning
  `CUSTOMER` may confirm (others → `404`, providers → `403`).
  State is server-enforced (work requires `IN_PROGRESS`, completion
  requires `IN_PROGRESS` + note, confirmation requires `COMPLETED`,
  `CLOSED` rejects everything); photo deletion additionally requires
  the uploader. One additive migration (`009_job_execution.sql`:
  nullable `job_updates.phase` + `job_images.original_filename`) —
  no new tables, no duplicate job tables.
- Angular: `/requests/:id` shows Job Progress (Before/During/After
  photo uploads with progress and error states, notes, completion
  note gating the Complete Job action with confirmation, then the
  read-only completed/closed states); `/my-jobs/:id` shows the
  read-only progress, the completion record with a single Confirm
  Completion action (plus a state-safe Not Yet path), the closed
  history and the timeline; both lists badge the new statuses with
  existing pill styles.
- Tests: `backend/tests/job-execution.test.ts` (42 cases:
  uploads incl. content sniffing, private retrieval incl. bytes,
  deletion, updates, completion, confirmation incl. atomic closure,
  guards, timeline, rollback, envelopes) plus customer/provider/
  service frontend specs. Full suites green: backend 190/190, web
  141/141; `tsc --noEmit` (backend, web app + spec) and the
  production Angular build pass.

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
