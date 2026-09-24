# FixLink — Permissions Matrix

## 1. Purpose

This document defines FixLink access control.

Frontend visibility is not security.

All permissions must be enforced by the backend.


## 2. Roles

CUSTOMER
PROFESSIONAL
BUSINESS_OWNER
BUSINESS_MANAGER
TECHNICIAN
ADMIN


# 3. Customer

## Can

- Manage own profile
- Search providers
- View public provider profiles
- View public businesses
- Create own job requests
- View own jobs
- View quotes for own jobs
- Accept own quotes
- Decline own quotes
- Message authorized providers
- View permitted job updates
- View job photos
- Confirm own completed jobs
- Review eligible completed jobs
- Save providers
- Manage own notifications

## Cannot

- View another customer's jobs
- View another customer's private information
- Manage provider profiles
- Manage business data
- Assign technicians
- Approve parts
- Access admin functions
- View private verification documents


# 4. Professional

## Can

- Manage own professional profile
- Manage own services
- Manage own service areas
- Manage own portfolio
- Submit certificates
- Submit identity verification
- View authorized marketplace requests
- Submit quotes
- Manage authorized jobs
- Add job updates
- Upload job media
- Add Before/During/After media
- Add voice notes where supported
- Complete authorized jobs
- View own reviews
- Respond to reviews where supported
- Message authorized customers

## Cannot

- Access another professional's private account
- Access another business's internal data
- View private customer data outside authorized jobs
- Assign business technicians
- Approve business parts requests
- Access platform administration


# 5. Business Owner

## Can

- Manage own business profile
- Manage own business members
- Manage customers belonging to own business
- Create internal jobs
- View own business jobs
- Receive marketplace requests
- Submit quotes
- Assign technicians
- Reassign technicians
- View technician updates
- View parts requests
- Approve/reject/request information for parts
- View job history
- View operational reports
- Manage business settings
- Manage permitted business team access

## Cannot

- Access another business's private data
- Access platform administration unless separately assigned ADMIN
- View unrelated private customer information


# 6. Business Manager

## Can

- View own business
- Manage operational jobs
- Manage customers within permitted business scope
- Assign technicians
- Reassign technicians
- View technician updates
- Manage parts requests
- Approve permitted requests
- View job history
- View reports where permitted
- Message business team members
- Message customers where authorized

## Cannot

- Manage platform users
- Access other businesses
- Change platform configuration
- Perform admin verification unless separately assigned ADMIN


# 7. Technician

## Can

- Manage own profile information
- View assigned jobs
- View required customer/job information
- Start assigned jobs
- Update assigned jobs
- Add notes
- Add photos
- Add Before/During/After media
- Add voice notes where supported
- Create parts requests
- View parts request status
- Respond to needs-info parts requests (Stage 7F)
- Resume jobs awaiting parts once the server allows (Stage 7F)
- Complete assigned jobs

## Cannot

- View all business jobs
- View unrelated business customers
- Assign themselves to arbitrary jobs
- Assign other technicians
- Approve their own parts requests
- Manage business settings
- Access platform administration


# 8. Admin

## Can

- Manage platform users
- View customers
- View professionals
- View businesses
- View technicians
- Manage services
- Manage service categories
- Review verification
- Review certificates
- View jobs
- Manage reported content
- Manage disputes
- View reports
- View audit logs
- Manage platform settings where authorized

Admin actions must be audited where appropriate.


# 9. Ownership Rules

Ownership must be evaluated server-side.

Examples:

Customer job:

job.customer_id == authenticated_user.customer_id

Professional job:

job.professional_id == authenticated_user.professional_id

Business job:

job.business_id belongs to authenticated user's business membership

Technician job:

job has an active assignment for authenticated technician


# 10. Business Isolation

A business member can only access records belonging to the businesses
they are authorized to access.

Never trust a business_id supplied by the client.

Determine business access from authenticated membership.


# 11. Job Permissions

### REQUESTED

Customer:
Can view own request.

Provider/business:
Can view authorized incoming request.

### QUOTED

Customer:
Can view quote.

Provider:
Can manage own quote.

### ACCEPTED

Customer:
Can view.

Provider/business:
Can manage job.

### SCHEDULED

Authorized provider/business/technician:
Can view and perform permitted actions.

### IN_PROGRESS

Assigned provider/technician:
Can update work.

Business manager:
Can monitor/manage permitted operational actions.

### AWAITING_PARTS

Technician:
Can create/update permitted request.

Manager:
Can approve/reject/request information.

### COMPLETED

Provider/technician:
Can submit completion.

Customer:
Can review and confirm.

### CONFIRMED

Customer:
Can confirm.

Provider/business:
Can view.

### CLOSED

Authorized users:
Can view history.

Modifications require appropriate permissions.


# 12. Verification Permissions

Professional:

- Submit verification
- View own status

Admin:

- Review verification
- Approve
- Reject
- Request information

Customer:

- Cannot access another user's verification information.


# 13. Certificate Permissions

Professional:

- Submit certificate
- View own certificate status

Admin:

- Review
- Approve
- Reject
- Request information

Public:

- Only approved certificate information


# 14. File Permissions

Public files:

- Approved public profile images
- Public portfolio images
- Approved public work images

Private files:

- Identity documents
- Verification documents
- Private business documents
- Private customer attachments
- Private internal attachments

Private files require authorization.


# 15. Messaging Permissions

A user may access a conversation if:

- They are a participant
- They have an explicitly authorized business role
- They have explicit administrative permission

A user may not access arbitrary conversations by changing an ID in the URL.


# 16. Review Permissions

Customer:

- Create eligible review
- View own review

Provider/business:

- View reviews associated with them
- Respond where supported

Admin:

- Moderate/manage reported reviews


# 17. Notification Permissions

Users can only access their own notifications.

Stage 8 rules (all enforced server-side; the frontend never
supplies ownership):

- The recipient of every notification endpoint (`GET
  /notifications`, `GET /notifications/unread-count`, `POST
  /notifications/:id/read`, `POST /notifications/read-all`) is
  always the authenticated session user.
- Listing, counting and read operations are scoped to `user_id`
  only. Another user's notification id reads as `404 NOT_FOUND`
  (never `403`), so notification ids cannot be probed across
  accounts — the same convention as customer jobs and provider
  requests.
- Event recipients resolve server-side from existing ownership:
  marketplace providers (professional owner / business owner +
  active owner/manager members), the customer-profile owner, the
  business owner + active owner/manager members, or the assigned
  technician. The acting user is excluded.
- Cross-business notifications are impossible: business events
  notify only the owning business's managers/technician.
  Customers never see internal (`INTERNAL_JOB`) notifications;
  technicians never see jobs outside their assignments.
- Notification messages carry only job/business display facts
  (service, reference, amount, status). Verification documents,
  private customer contact details, credentials and admin-only
  information are never included.

Admin access is only allowed where explicitly required.


# 18. Admin Security

Admin endpoints must use explicit admin authorization.

Do not rely on frontend navigation to protect admin routes.


# 19. Permission Enforcement

Authorization must be enforced at:

1. API route/middleware
2. Service/business logic
3. Resource ownership level

Where necessary, database queries should include ownership conditions.


# 20. Permission Testing

Tests must verify that:

- Customer A cannot access Customer B's jobs.
- Professional A cannot modify Professional B's jobs.
- Business A cannot access Business B's customers.
- Technician A cannot access Technician B's assigned jobs.
- Technician cannot approve their own parts request.
- Non-admin users cannot access admin endpoints.
- Private verification documents cannot be accessed publicly.
- Users cannot bypass permissions by changing resource IDs.


# 21. Principle

If a user should not be allowed to perform an action, the backend must
reject the request even if the frontend sends it manually.


# 22. Stage 6C Implementation Notes — Provider Requests & Quotes

Implemented 2026-09-23 (`backend/src/modules/quotes/`).

- Provider identity is resolved server-side per request from
  `professional_profiles.user_id` (individual professionals) and
  `business_profiles.owner_user_id` plus active `business_members`
  rows with role `BUSINESS_OWNER`/`BUSINESS_MANAGER` (businesses).
  `TECHNICIAN` members, `CUSTOMER`s and role-less accounts have no
  quoting identity and receive `403 FORBIDDEN_ROLE` on provider
  endpoints.
- A provider sees only marketplace jobs addressed to their own
  professional profile or business (`GET /api/v1/provider/requests`,
  `GET /api/v1/provider/requests/:id`). Another provider's request —
  or quoting an unaddressed job — reads as `404 NOT_FOUND`, never
  `403`, so request/job ids cannot be probed across providers.
- Quote submission is restricted to the addressed provider while the
  job is `REQUESTED`; the backend performs the `REQUESTED → QUOTED`
  transition. A second active quote from the same provider is rejected
  with `409 CONFLICT` — quotes are never silently overwritten.
- Customer quote visibility is limited to the owning customer
  (`GET /api/v1/jobs/:id` embeds `quotes`; `GET
  /api/v1/jobs/:id/quotes`, `GET /api/v1/quotes/:id`). Provider
  request detail exposes only a privacy-limited customer display name
  (first name + last initial); no email, phone, ID documents or
  admin-only information.
- Admin platform quote management belongs to the later admin surface
  (`/api/v1/admin/*`); ADMIN is not a quoting provider in this stage.

Permission tests added (`backend/tests/quotes.test.ts`): unrelated
providers/businesses isolated, technician/customer/admin rejection,
malformed/unknown ids, duplicate-quote conflict, and failure
atomicity (failed quote leaves the job `REQUESTED`).


# 23. Stage 6D Implementation Notes — Customer Quote Acceptance

Implemented 2026-09-23 (`backend/src/modules/quotes/`,
`POST /api/v1/jobs/:jobId/quotes/:quoteId/accept`).

- Only the `CUSTOMER` who owns the `MARKETPLACE` job may accept, and
  ownership is derived server-side from the session user id (no
  `customer_id` is read from the request). A user holding
  `BUSINESS_MANAGER` (or any other role) alongside `CUSTOMER` may
  accept only their own customer-owned job — role alone never grants
  acceptance.
- `PROFESSIONAL` / `BUSINESS_OWNER` / `BUSINESS_MANAGER`-only,
  `TECHNICIAN`-only and `ADMIN`-only actors receive `403
  FORBIDDEN_ROLE` — a provider can never accept their own quote.
- Another customer's job, an `INTERNAL` job, an unknown quote, or a
  quote belonging to another job all read as `404 NOT_FOUND`, never
  `403`, so job/quote ids cannot be probed across accounts.
- State is enforced server-side: only a `SUBMITTED` quote on a
  `QUOTED` job is accepted (already-accepted → `409 CONFLICT`;
  withdrawn/declined or wrong job state → `422`). The frontend never
  sends a status.

Permission tests added (`backend/tests/quote-acceptance.test.ts`):
cross-customer and cross-job rejection, provider/technician/
manager-only/admin rejection, dual-role owner-manager acceptance,
already-accepted conflict, ineligible and wrong-state rejection,
`INTERNAL` rejection, rollback atomicity, and multi-quote
retirement.


# 24. Stage 6E Implementation Notes — Scheduling & Start

Implemented 2026-09-23 (`backend/src/modules/quotes/`,
`POST /api/v1/jobs/:jobId/schedule`,
`POST /api/v1/jobs/:jobId/start`).

- Only the addressed provider may schedule or start: the
  `PROFESSIONAL` owning the job's professional profile, or a
  `BUSINESS_OWNER` / `BUSINESS_MANAGER` of the job's business
  (ownership derived server-side from `professional_profiles.user_id`,
  `business_profiles.owner_user_id` and active `business_members`
  rows — never from the request). Another provider's job reads as
  `404 NOT_FOUND`, never `403`, so job ids cannot be probed across
  providers.
- `CUSTOMER` actors (schedule/start would be a status change the
  customer must never make), `TECHNICIAN`-only actors and `ADMIN`
  actors receive `403 FORBIDDEN_ROLE` — technicians cannot perform
  these marketplace transitions in Stage 6E.
- State is enforced server-side: scheduling requires an `ACCEPTED`
  job with an `ACCEPTED` quote; starting requires a `SCHEDULED` job.
  Every other transition (`REQUESTED`/`QUOTED` → `SCHEDULED`,
  `ACCEPTED` → `IN_PROGRESS`, re-start, …) returns `422
  VALIDATION_ERROR`. `scheduledAt` is required, must be a valid
  calendar date/time and must be in the future (`422` otherwise).
- Scheduling writes `jobs.scheduled_at` and transitions
  `ACCEPTED → SCHEDULED` (`Provider scheduled job`); starting
  transitions `SCHEDULED → IN_PROGRESS` (`Provider started job`) —
  both atomically with their `job_status_history` entries.

Role summary for marketplace schedule/start in Stage 6E:

PROFESSIONAL:
- schedule own accepted marketplace jobs
- start own scheduled marketplace jobs

BUSINESS_OWNER:
- schedule applicable business marketplace jobs
- start applicable scheduled marketplace jobs

BUSINESS_MANAGER:
- schedule applicable business marketplace jobs
- start applicable scheduled marketplace jobs

CUSTOMER:
- view schedule/status (read-only)
- cannot schedule
- cannot start

TECHNICIAN:
- cannot perform these marketplace status transitions in Stage 6E

Permission tests added (`backend/tests/job-scheduling.test.ts`):
own/other-provider scheduling and start, customer/technician
rejection, business owner/manager scheduling, missing/malformed/past
`scheduledAt`, no-accepted-quote rejection, state guards, history,
rollback atomicity, customer visibility of `SCHEDULED`/`IN_PROGRESS`,
accepted-quote integrity, and envelope consistency.


# 25. Stage 6F Implementation Notes — Job Execution & Work Documentation

Implemented 2026-09-23 (`backend/src/modules/execution/`,

Implemented 2026-09-23 (`backend/src/modules/execution/`,
`backend/src/services/file-storage.ts`,
`POST /api/v1/jobs/:jobId/images|updates|complete|confirm`,
`GET /api/v1/jobs/:jobId/images|images/:imageId/file|updates|timeline`,
`DELETE /api/v1/jobs/:jobId/images/:imageId`).

- Only the addressed provider may document work or complete: the
  `PROFESSIONAL` owning the job's professional profile, or a
  `BUSINESS_OWNER` / `BUSINESS_MANAGER` of the job's business
  (ownership derived server-side — never from the request). Another
  provider's job reads as `404 NOT_FOUND`, never `403`, so job and
  image ids cannot be probed across providers.
- `CUSTOMER` actors on provider endpoints, `TECHNICIAN`-only actors
  on marketplace execution and providers on confirmation receive
  `403 FORBIDDEN_ROLE` — technicians cannot perform marketplace
  execution in Stage 6F, customers cannot upload/complete, and
  providers cannot confirm.
- Only the owning `CUSTOMER` may confirm (ownership derived from the
  session); another customer's job reads as `404`.
- Read access (photos, bytes, updates, timeline) is limited to the
  owning customer and the addressed provider; media stays private
  (no public URLs, paths or storage keys in responses) and is never
  auto-published to portfolios.
- Photo deletion additionally requires the caller to be the uploader
  and the job to still be `IN_PROGRESS` (same-job foreign delete →
  `403`; completed/closed job → `422`).
- State is enforced server-side: work documentation requires
  `IN_PROGRESS`; completion requires `IN_PROGRESS` plus a 1–2000
  char note; confirmation requires `COMPLETED`; `CLOSED` jobs reject
  every modification (`422`).

Role summary for marketplace execution in Stage 6F:

PROFESSIONAL:
- add BEFORE/DURING/AFTER photos and notes on own IN_PROGRESS jobs
- delete own photos while IN_PROGRESS
- complete own IN_PROGRESS jobs (note required)
- view own job work and timeline

BUSINESS_OWNER:
- same for applicable business marketplace jobs

BUSINESS_MANAGER:
- same for applicable business marketplace jobs

CUSTOMER:
- view own job work and timeline (read-only)
- confirm own COMPLETED marketplace job (closes it server-side)
- cannot upload, note, complete, start, schedule or close arbitrarily

TECHNICIAN:
- cannot perform marketplace execution in Stage 6F

Permission tests added (`backend/tests/job-execution.test.ts`):
own/other-provider uploads and updates, customer/technician/provider
rejection paths, phase/MIME/size/content validation, private
retrieval (owner/provider vs foreign/unauthenticated, metadata and
bytes), uploader-only deletion, completion guards and note
requirement, confirmation ownership and atomic closure, closed-job
immutability, bypass attempts, timeline contents, rollback atomicity,
and envelope consistency.


# 26. Stage 7A Implementation Notes — Business Foundation & Technician Management

Implemented 2026-09-23 (`backend/src/modules/business/`,
`GET|PATCH /api/v1/business/me`,
`GET|POST /api/v1/business/technicians`,
`GET|PATCH /api/v1/business/technicians/:technicianId`).

- The business is derived server-side per request from
  `business_profiles.owner_user_id` and active `business_members`
  rows — never from request parameters. `TECHNICIAN` members,
  `CUSTOMER`s, `PROFESSIONAL`s and `ADMIN`s have no business
  management identity and receive `403 FORBIDDEN_ROLE` on
  business/technician endpoints (a `BUSINESS_OWNER`-role account
  with no business row reads `404 NOT_FOUND`, not `403`).
- `BUSINESS_OWNER` has full access to their business, including
  profile edits. `BUSINESS_MANAGER` is scoped to the business they
  belong to: view the profile and manage (invite, view, rename,
  activate/deactivate) its technicians — profile edits are
  owner-only (`403`).
- Technicians authenticate (`TECHNICIAN` role) and read only their
  own roster row (self-access via the `technicians.user_id`
  association). They cannot list, invite, rename or
  activate/deactivate — not even themselves (`403` on the
  collection and mutation endpoints, `404` on other technicians'
  rows) — and cannot access business administration, create
  marketplace provider profiles, submit quotes or accept customer
  quotes (the quotes module already excludes `TECHNICIAN` members
  from provider identity).
- Business isolation: every technician row is re-scoped to the
  caller's business before it is returned. Business A's owner or
  manager reading business B's technician id gets `404 NOT_FOUND`,
  never `403`, so technician ids cannot be probed across
  businesses. Deactivation flips both `technicians.is_active` and
  `business_members.is_active` in one transaction, immediately
  revoking business access (a deactivated technician's own row
  reads as `404`).
- Linking is never duplicated: an account holding any active
  membership (owner, manager or technician) in the business cannot
  be re-linked (`409 CONFLICT`); linking an existing account never
  resets its password (a supplied `password` is rejected with
  `422`).

Permission tests added (`backend/tests/business.test.ts`):
unauthenticated rejection, customer/professional/admin rejection,
owner/manager read, owner-only update, new/existing-account
invites with technician login, roster scoping, cross-business
`404` isolation (read and patch), technician management/self-access
rejection, activation sync and access revocation, malformed/unknown
ids, invalid payloads, duplicate handling, and role assertions
(including technicians staying out of the provider inbox).


# 27. Stage 7B Implementation Notes — Business Customers & Internal Jobs

Implemented 2026-09-24 (`backend/src/modules/business/`,
`GET|POST /api/v1/business/customers`,
`GET|PATCH /api/v1/business/customers/:customerId`,
`GET|POST /api/v1/business/jobs`,
`GET|PATCH /api/v1/business/jobs/:jobId`,
`POST /api/v1/business/jobs/:jobId/cancel`,
`GET /api/v1/business/jobs-summary`).

- The owning business is derived server-side per request from
  `business_profiles.owner_user_id` and active `business_members`
  rows — never from request parameters. No `business_id`,
  customer-job association or job-business association is read
  from the request; spoofed fields are ignored.
- `BUSINESS_OWNER` and `BUSINESS_MANAGER` share the full Stage 7B
  surface: manage own business customers (create, list, read,
  update), create internal jobs, view own internal jobs, update
  permitted fields on `REQUESTED` jobs, and cancel eligible
  (`REQUESTED`) own internal jobs. Profile edits remain
  owner-only (Stage 7A rule, unchanged).
- `TECHNICIAN` members cannot create internal jobs, manage
  business customers, list business jobs or cancel them (`403`
  on every Stage 7B endpoint) — there is no assignment
  functionality yet, so technicians have no job surface at all.
- `CUSTOMER`s and `PROFESSIONAL`s cannot access business
  internal jobs or business-managed customers (`403`); `ADMIN`
  has no business identity in this stage (`403`, unchanged).
- Business isolation: every customer and job row is re-scoped to
  the caller's business before it is returned. Business A reading
  Business B's customer or job (read, patch or cancel) gets `404
  NOT_FOUND`, never `403`, so ids cannot be probed across
  businesses. The internal job list/detail additionally filter
  `source = INTERNAL`, so marketplace rows never leak into the
  business surface (a marketplace id reads as `404` there).
- Status is server-controlled: the client never sends a status.
  `PATCH` with a `status` key is rejected (`422`), field edits
  require `REQUESTED`, and only `REQUESTED` jobs may cancel
  (`REQUESTED → CANCELLED` with a history entry; anything else →
  `422`). Cancellation and job creation are atomic with their
  `job_status_history` entries.

Role summary for Stage 7B:

BUSINESS_OWNER:
- manage own business customers
- create internal jobs
- view own internal jobs (+ timeline)
- update permitted fields on REQUESTED jobs
- cancel eligible own internal jobs

BUSINESS_MANAGER:
- same operational permissions as the owner in this stage
  (business profile edits remain owner-only)

TECHNICIAN:
- cannot create internal jobs
- cannot manage business customers
- cannot access business jobs
- no assignment functionality yet

CUSTOMER:
- cannot access business internal jobs or business customers

PROFESSIONAL:
- cannot access business internal jobs or business customers

Permission tests added
(`backend/tests/business-internal-jobs.test.ts`): unauthenticated
rejection, customer/professional/technician/admin rejection,
owner/manager customer CRUD, roster-style customer isolation,
invalid payloads, malformed/unknown ids, owner/manager job
creation (`INTERNAL`/`REQUESTED`/correct business),
customer-ownership and service validation, cross-business job
isolation (read/patch/cancel), marketplace exclusion from the
internal list and detail, detail contents (customer/service/
business/timeline), creation history, status-mutation rejection,
eligible/ineligible cancellation, pagination, filtering, and
the business-scoped summary.

# 28. Stage 7C Implementation Notes — Technician Assignment + My Jobs

Implemented 2026-09-24 (`backend/src/modules/business/` — same
router, `POST /api/v1/business/jobs/:jobId/assign`,
`PATCH /api/v1/business/jobs/:jobId/assignment`,
`GET /api/v1/business/jobs/:jobId/assignment`,
`GET /api/v1/technician/jobs`,
`GET /api/v1/technician/jobs/:jobId`).

- Only `BUSINESS_OWNER` and `BUSINESS_MANAGER` may assign (via the
  existing management resolution — business derived server-side,
  never from the request). `TECHNICIAN`, `CUSTOMER`,
  `PROFESSIONAL` and `ADMIN` receive `403 FORBIDDEN_ROLE` on the
  assignment surface; unauthenticated → `401`.
- Assignment is restricted to `source = INTERNAL` jobs owned by the
  caller's business and to active technicians in the same business.
  A foreign/cross-business job id, a foreign technician id or any
  marketplace id reads as `404 NOT_FOUND` (never `403`), so ids
  cannot be probed. Inactive technicians → `422`; non-technician
  ids → `404`; malformed ids → `400`.
- Assignment never changes job status (no ASSIGNED value exists);
  it is recorded in `job_assignments`
  (`assignment_type = TECHNICIAN`, active = `unassigned_at IS
  NULL`) with full history. No `job_status_history` entry is
  written for assignment.
- Technician My Jobs: the technician identity is derived
  server-side from the session user (membership + active
  technician row). Only jobs with an active assignment to the
  caller are listed or readable; everything else reads as `404`.
  Managers, customers, professionals and admins receive `403` on
  the technician surface; unauthenticated → `401`.

Role summary for Stage 7C (additions to §27):

BUSINESS_OWNER / BUSINESS_MANAGER:
- assign/reassign technicians on own INTERNAL jobs
- view active assignment + history on own INTERNAL jobs

TECHNICIAN:
- list own assigned INTERNAL jobs (with status filter)
- open own assigned jobs (+ timeline)
- still cannot manage the business surface (403, unchanged)

Permission tests added
(`backend/tests/business-technician-assignment.test.ts`, 20
cases): owner/manager assign, technician/customer/professional
rejection, cross-business technician, inactive technician,
non-technician id, foreign job, marketplace exclusion,
persistence, reassignment + history, technician list-own,
technician isolation (list/detail), unrelated business job,
role/anonymous rejection on the technician surface, 7B
regression, marketplace regression.

# 29. Stage 7D Implementation Notes — Technician Execution + Voice Notes

Implemented 2026-09-24 (`backend/src/modules/business/` —
technician execution on the same router, voice support in
`backend/src/services/file-storage.ts`, migration 010 for
`job_voice_notes.original_filename`).

- Only the actively assigned TECHNICIAN may start, document or
  complete an internal job (identity derived server-side from
  the session user — membership + active technician row — never
  from the request). `CUSTOMER`, `PROFESSIONAL`,
  `BUSINESS_OWNER`, `BUSINESS_MANAGER` and `ADMIN` receive `403
  FORBIDDEN_ROLE` on the technician execution surface;
  unauthenticated → `401`.
- Execution is restricted to INTERNAL jobs with an active
  TECHNICIAN assignment to the caller. Another technician's job
  (same business or not), another business's job, or any
  marketplace id reads as `404 NOT_FOUND` (never `403`), so job,
  image and voice-note ids cannot be probed across technicians
  or businesses. Malformed ids → `400`.
- State rules are server-side and atomic: start only from
  REQUESTED/SCHEDULED (else `422`); photos, notes and voice
  notes only while IN_PROGRESS (else `422`); completion only
  from IN_PROGRESS with a required note (else `422`); image
  deletion is uploader-only while IN_PROGRESS (foreign uploader
  → `403`). The frontend never controls status, ownership or
  timestamps.
- File rules mirror marketplace execution: claimed MIME and
  extension are never trusted — images are sniffed by magic
  bytes (JPEG/PNG/WebP, 5MB), voice notes by container
  signatures (WebM/MP4/MP3/WAV/Ogg, 10MB); filenames are
  sanitized; storage keys are server-generated opaque values
  (`job-images/…`, `job-voice-notes/…`) and malformed keys are
  rejected; bytes leave only through authorized endpoints
  (`inline`, `private` cache) — never public URLs, paths or
  storage keys in metadata responses.
- Business visibility is read-only: `BUSINESS_OWNER` /
  `BUSINESS_MANAGER` may read (not write) photos, notes, voice
  notes and the timeline of their own INTERNAL jobs; another
  business's job reads as `404`. Technicians receive `403` on
  the business visibility surface. Customer visibility is
  unchanged (marketplace owners keep their existing access;
  internal business records never leak to customers).
- Marketplace permissions are unchanged: provider/customer
  guards, endpoints and stores were not modified for this
  stage.

Role summary for Stage 7D (additions to §27–28):

BUSINESS_OWNER / BUSINESS_MANAGER:
- read execution documentation (photos, notes, voice notes,
  timeline + bytes) on own INTERNAL jobs
- still cannot perform technician execution (no start, upload,
  voice-note or complete capability)

TECHNICIAN:
- start own assigned jobs (REQUESTED/SCHEDULED → IN_PROGRESS)
- upload BEFORE/DURING/AFTER photos on own IN_PROGRESS jobs
- save BEFORE/DURING/AFTER notes on own IN_PROGRESS jobs
- upload voice notes on own IN_PROGRESS jobs
- complete own IN_PROGRESS jobs (note required)
- read own execution timeline
- still cannot manage the business surface (403, unchanged)

Permission tests added
(`backend/tests/technician-execution.test.ts`, 32 cases):
assigned start, unassigned start (`404`), cross-business
access (`404`), BEFORE/DURING/AFTER photos, text updates,
voice-note upload, unauthorized voice/image/update/complete
(`404`), voice metadata persistence, storage-abstraction
delivery, voice-file authorization (`401`/`404`),
cross-business voice access (`404`), completion history,
timeline events, audio validation (`422`), size validation
 (`422`), unsafe storage-key rejection; business visibility
 (owner/manager reads, foreign business `404`, technician
 `403`). Stages 7C/6F/marketplace remain covered by their
 untouched suites in the same `npm test` run.

# 30. Stage 7E Implementation Notes — Technician Parts Requests

Implemented 2026-09-24 (`backend/src/modules/business/` — same
router, new `business-parts.validation.ts`, no migration:
`parts_requests` / `parts_request_items` from migration 006).

- Only the actively assigned TECHNICIAN may submit a parts
  request, and only for an INTERNAL job in IN_PROGRESS or
  AWAITING_PARTS (identity, business, job ownership and state
  derived server-side — never from the request). `CUSTOMER`,
  `PROFESSIONAL`, `BUSINESS_OWNER`, `BUSINESS_MANAGER` and
  `ADMIN` receive `403 FORBIDDEN_ROLE` on the technician
  submission surface; unauthenticated → `401`.
- Another technician's job (same business or not), another
  business's job, or any marketplace id reads as `404
  NOT_FOUND` (never `403`), so job and request ids cannot be
  probed across technicians or businesses. Malformed ids →
  `400`. Wrong execution state (REQUESTED, CANCELLED,
  COMPLETED, …) → `422`.
- Submission never changes job status and never trusts
  client-provided ownership, price or status: new rows are
  always `PENDING` with the single submitted item, and the job
  stays IN_PROGRESS until the Stage 7F approval workflow moves
  it. The optional photo reuses the FileStorage image pipeline
  (magic-byte sniffed JPEG/PNG/WebP, 5MB, opaque key, bytes
  only through authorized endpoints).
- Business visibility is read-only: `BUSINESS_OWNER` /
  `BUSINESS_MANAGER` may read (not approve/reject) requests,
  items and evidence photos of their own INTERNAL jobs;
  another business's job reads as `404`. Technicians receive
  `403` on the business visibility surface. No approve,
  reject, needs-info or AWAITING_PARTS transition exists in
  this stage (Stage 7F).

Role summary for Stage 7E (additions to §27–29):

BUSINESS_OWNER / BUSINESS_MANAGER:
- view parts requests (part, quantity, reason, technician,
  date, status, photo) on own INTERNAL jobs
- still cannot approve/reject/request-info (Stage 7F)

TECHNICIAN:
- submit parts requests (part, quantity, reason, optional
  photo) on own IN_PROGRESS/AWAITING_PARTS jobs
- list/read own job parts requests + evidence photos
- still cannot approve their own parts requests (see §29
  line 163 — unchanged) and cannot reach other jobs

Permission tests added
(`backend/tests/parts-requests.test.ts`, 16 cases):
assigned submission (`201`, PENDING, correct business/
technician, job stays IN_PROGRESS), unassigned/another-
technician/cross-business/marketplace `404`, pre-start/
cancelled/completed `422`, part-name/quantity/reason
validation (`422`), technician list/get, owner + manager
reads, cross-business owner `404`, role/anonymous rejection
(`401`/`403` both surfaces), timeline inclusion (technician
+ business), photo upload + authorized delivery (`404`
for foreign/no-photo), invalid file + invalid ids.

# 31. Stage 7F Implementation Notes — Manager Approvals + Awaiting Parts

Implemented 2026-09-24 (`backend/src/modules/business/` — same
router, new `business-approvals.validation.ts` + shared
`parts-request-events.ts` seam, one migration:
`011_parts_available.sql` extends `parts_requests.status` with
`PARTS_AVAILABLE`; `job_approvals` reused unchanged).

- Only `BUSINESS_OWNER` / `BUSINESS_MANAGER` may review or
  fulfil, and only for their own business's INTERNAL jobs
  (business, job, request and reviewer identity derived
  server-side). `TECHNICIAN`, `CUSTOMER`, `PROFESSIONAL` (incl.
  marketplace professionals — the internal approval workflow is
  never exposed to them) receive `403 FORBIDDEN_ROLE` on the
  decision routes; owners/managers receive `403` on the
  technician respond/resume routes; unauthenticated → `401`.
- Another business's job reads as `404 NOT_FOUND` (never `403`),
  so request and job ids cannot be probed across businesses.
  Marketplace ids read as `404`. Malformed ids → `400`.
- Reviewers can never approve their own requests (reviewer ==
  requester → `422`). Only PENDING / NEEDS_INFO requests are
  reviewable; APPROVED → PARTS_AVAILABLE only; REJECTED /
  CANCELLED / PARTS_AVAILABLE are terminal — every duplicate or
  out-of-state action is rejected with `422
  VALIDATION_ERROR`, never silently applied.
- Approve moves IN_PROGRESS → AWAITING_PARTS (an already-waiting
  job stays AWAITING_PARTS); reject / request-info leave the job
  IN_PROGRESS. Reject and request-info require a comment/reason
  (stored on the request and the `job_approvals` row); approve
  accepts an optional comment.
- Multiple-request rule: the job stays AWAITING_PARTS while ANY
  request is APPROVED. Marking a request PARTS_AVAILABLE resumes
  the job (AWAITING_PARTS → IN_PROGRESS) only when no APPROVED
  request remains; PENDING / NEEDS_INFO / REJECTED / CANCELLED
  never block. The technician resume endpoint enforces the same
  rule, so a technician can continue only when the server allows.
- Technicians may only view decisions (status + manager comment +
  timestamp) for their assigned jobs, respond to NEEDS_INFO
  (→ PENDING, note kept as a PENDING approval row) and resume
  when allowed. Customers never see the internal workflow.
- Every decision/fulfilment/resume is atomic (request +
  `job_approvals` row + job move + history in one transaction)
  and appears in the existing execution timeline (one `parts`
  event per decision/response plus the status-move events). No
  second timeline or notification system was created: decisions
  emit events on the `parts-request-events` bus (Stage 8 persists
  them into `notifications`).

Permission tests added
(`backend/tests/parts-approvals.test.ts`, 17 cases):
owner/manager approve (APPROVED + AWAITING_PARTS + approval
record + history), reject (reason required/stored, job stays
IN_PROGRESS), request-info (comment required, NEEDS_INFO,
technician visibility), technician respond (→ PENDING, second
review), parts-available resume (+ history), the two-request
outstanding rule (+ technician resume blocked/allowed),
idempotency/terminal rejections, role isolation
(technician/customer/professional/anonymous `403`/`401`,
owner/manager on technician routes `403`), cross-business
`404`, marketplace `404`, invalid ids (`400`/`404`),
rollback behaviour (failed actions write nothing),
notification-seam event order + payloads, timeline inclusion
(both surfaces), technician respond/resume guards.

# 32. Stage 7G Implementation Notes — Business Job Board + History

Implemented 2026-09-24 (`backend/src/modules/business/` — same
router, extended `GET /api/v1/business/jobs` filters plus `GET
/api/v1/business/jobs-board-summary`; no migration, no new
tables, no duplicate statuses).

- Only `BUSINESS_OWNER` and `BUSINESS_MANAGER` may use the board
  and the board summary. `TECHNICIAN` (business-wide board —
  technicians keep My Jobs only), `CUSTOMER`, `PROFESSIONAL` and
  `ADMIN` receive `403 FORBIDDEN_ROLE`; unauthenticated → `401`.
- Business isolation is derived server-side per request and
  applies to every filter: the board lists `source = INTERNAL`
  jobs of the caller's business only. Cross-business job detail
  reads as `404 NOT_FOUND` (never `403`); a `technicianId`
  filter for a foreign roster row yields an empty page (`200`,
  never foreign rows); search terms matching another
  business's customers return zero rows. Marketplace jobs never
  appear on the board (`source = INTERNAL` on every read).
- Board categories derive from existing state and grant no new
  capability: ASSIGNED is the active `job_assignments` row
  (assignment itself stays owner/manager-only), HISTORY is the
  terminal set, SCHEDULED is the `scheduled_at` slot. The
  enriched row fields (assignment contact info, outstanding
  parts count, last work timestamp) expose only data the
  manager could already read per-job.
- Enriched detail access is unchanged: clicking a board row
  opens the existing job detail (customer, service,
  assignment, schedule, Before/During/After, notes, voice
  notes, parts, approvals, timeline) under the same
  owner/manager business scoping.

Permission tests added
(`backend/tests/business-job-board.test.ts`, 22 cases):
unauthenticated/board-summary `401`, technician/customer
`403`, owner/manager own-business listing, cross-business
list/detail `404` (no probing), marketplace exclusion,
search isolation, all nine board categories against the
lifecycle (no duplicate statuses), manager parity,
assigned=true/false derivation, exact status filtering,
enriched rows (technician + assignedAt, partsOutstanding,
lastUpdateAt null/completed), business-scoped board
summary (all nine buckets + zero-business zeros), unchanged
legacy summary shape, detail reachability, roster-scoped
technician filter (foreign tech → empty `200`), priority,
search (reference/name/phone/service), creation-date range,
pagination (`page`/`pageSize`/`total`), priority/scheduled
sorting, and invalid-filter `422`s (bad board, board+status,
board+assigned, bad priority/sort/assigned/technician/date,
from-after-to).
