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
