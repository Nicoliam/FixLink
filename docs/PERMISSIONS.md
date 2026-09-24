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
