# Fixlynk — User Flows

## Current implementation note

This document records the broader product flow history and planned user
journeys alongside stage implementation notes. The current UAT and
handover sources are `docs/CLIENT-UAT.md` and `docs/HANDOVER.md`.
Workflows not marked as implemented there are not treated as current UI
capabilities, including review submission, quote decline, messaging,
profile/certificate/portfolio management and admin settings.

Provider service offerings (section 2A) are implemented in the backend and the
web app.

## 1. Purpose

This document defines the main Fixlynk user journeys.

The flows describe expected product behaviour and provide a reference for
frontend, backend, database and testing implementation.


# 2. CUSTOMER FLOWS


## 2.1 Registration

Registration is a two-step process for a customer and a three-step process for
a professional or business owner at `/register`.

Step 2 — services offered (PROFESSIONAL / BUSINESS_OWNER only)

The provider picks what they offer BEFORE the account is created, so
"Create account" is the last thing they do.

Step 2: "Tick the services you offer"
↓
The public service catalogue loads (GET /api/v1/services), grouped by category
↓
Tick services, or tick a category heading to select all of them
↓
Continue | Skip for now
↓
Step 3 — account details, with the ticked services shown as a count
↓
Create account
↓
Account created and signed in
↓
Each ticked service is saved as a service offering
↓
Land on the provider dashboard

A customer skips the services step entirely and goes from step 1 to their
details, because they consume services rather than offer them.

**No price is asked for at this step.** A provider who has just registered has
not decided what to charge, and Fixlynk does not invent a figure (AGENTS.md
section 12). Each offering is therefore created without a price, which the
backend stores as `NULL` — meaning "offered, price not set yet" (migration
019, `docs/DATABASE.md` section 40.9a). Prices are entered afterwards on My
Services.

**How the services are saved.** Registration is unchanged as an API contract:
the account is created first and returns a live session, then each ticked
service is created with a plain authenticated `POST /api/v1/provider/offerings`.
Offerings cannot be written inside the account transaction, because the
offerings store resolves provider identity itself and the provider profile row
does not exist until the account is committed.

**Failure handling.** The account is never discarded because a service failed
to save. Services are saved independently, so a partial success reports
"Saved N of M services" and stays on step 3 with the session intact; the
submit button becomes "Finish setup", which retries only the services that
failed and never re-registers (the email is taken from that point on). The
provider can also finish from My Services. Losing the services is recoverable,
making a professional re-register is not.

### 2.1a Customer Registration (steps 1-2 only)

Step 1 — account type

Customer
↓
Open /register
↓
Step 1: "I am joining as"
↓
Select one account type
  - Customer
  - Professional
  - Business owner
↓
Continue

Step 1 shows only the account types. The email, phone and password fields are
not rendered until an account type has been selected. The selection maps to
the backend roles CUSTOMER, PROFESSIONAL and BUSINESS_OWNER. ADMIN,
BUSINESS_MANAGER and TECHNICIAN are never offered.

Step 2 — account details

Enter display name (Professional only)
Enter business name (Business owner only)
↓
Enter email
↓
Enter phone (optional)
↓
Enter password
↓
Confirm password
↓
Create account
↓
Account created and signed in
↓
For a provider: the ticked services are saved, then the role dashboard
(no verification step)

The selected account type is retained when moving between the steps, so Back
returns to the previous step with the chosen type still highlighted and allows
it to be changed. For a provider, Back from the details step returns to the
ticked services rather than to step 1, so the selection is never lost.
Step 2 values entered before pressing Back are also retained.

Professional and business owner accounts are asked for the name customers will
see, because the backend creates `professional_profiles` / `business_profiles`
in the same transaction as the account. Customers are asked for neither.

Registration establishes a session: the response carries the same access and
refresh tokens as login, so there is no separate login step and no
verification/approval wait. The user lands on the route for the account type
they registered as — `/my-jobs` for a customer, `/requests` for a
professional, `/business` for a business owner.


## 2.2 Customer Login

Customer
↓
Login
↓
Enter email/phone
↓
Enter password
↓
Authentication
↓
Customer dashboard

Login lands on the same role route as registration (`/my-jobs` for a
customer, `/requests` for a professional, `/business` for a business owner,
`/technician/jobs` for a technician, `/admin` for an admin, `/account` as the
fallback). An explicit `?returnUrl=` takes precedence.


## 2.3 Customer Searches for Service

Customer
↓
Marketplace
↓
Select service
↓
Enter search/location criteria
↓
View providers
↓
Apply filters
↓
Open provider profile


## 2.4 Customer Reviews Provider

Customer
↓
Provider profile
↓
View:
- Profile
- Services
- Service area
- Rating
- Reviews
- Portfolio
- Before/After
- Verification
- Certificates
↓
Decide whether to request service


## 2.5 Customer Creates Job Request

A job can be created **with or without** a professional. `POST /api/v1/jobs`
treats `providerId` as optional: when it is supplied the request is addressed
to that provider exactly as before, and when it is omitted the request becomes
an **open request** (`jobs.professional_id` and `jobs.business_id` both NULL)
that matching professionals find on their own portal.

The request is captured by a four-step wizard at `/request-job`, matching the
"four transparent steps" the marketing site promises. The order is
deliberate and is the reverse of the earlier single-page form: the customer
**describes the job before choosing a professional**, so the search in step 02
can be scoped to the service they just picked.

`/my-jobs` launches the wizard ("Start a request") and additionally lists the
professionals the customer has saved, each linking straight into the flow with
that professional already chosen. That saved-professional shortcut is not
rendered at all when the customer has no saved professionals — it is never
shown as an empty option.

```
01 Tell us what you need          service, description, photos of the
                                   problem (optional), location,
                                   preferred date and time
        ↓  (blocked until valid)
02 Find the right professional    saved professionals first (when any),
                                   then an inline search scoped to the
                                   chosen service; open a profile to check
                                   work, certificates and reviews
        ↓  (optional — "Skip and let a professional come to you")
03 Review and send                every answer shown, each editable
        ↓
04 What happens next              request reference and status, then:
                                   get a quote (ZAR, no hidden fees) and
                                   get the job done (pay the professional
                                   directly, then review)
REQUESTED
```

Notes:

- **Step 02 is optional.** A customer who has no saved professional, or who
  wants the first quote that arrives, skips it with "Skip and let a
  professional come to you". The wizard then sends `POST /api/v1/jobs` with no
  `providerId` and the request is posted as an open request. The customer is
  told, in step 04, that matching professionals in the area have been alerted
  and that up to 3 quotes will be accepted.
- Only filters the providers endpoint supports are sent (`q`, `service`,
  `page`, `pageSize`). `GET /providers` rejects unknown parameters with 422.
- A failed saved-professional load never blocks the flow: step 02 falls back
  to search, which is always available.
- Arriving with `?provider=<id>` — from a marketplace card or a profile CTA —
  pre-selects that professional and opens on step 02, so those links stay a
  single tap. An unknown or deactivated provider falls back to searching
  rather than stranding the customer.
- **Photos of the problem** are optional in step 01: up to 6, 5MB each, JPEG /
  PNG / WebP. They are validated in the browser for an instant answer, then
  uploaded to `POST /api/v1/jobs/:jobId/request-images` immediately after the
  job is created, because a photo cannot be stored before its job exists. The
  customer keeps picking them from `/my-jobs`, searching the marketplace or
  opening a profile — a photo never replaces choosing a professional.
- A photo that fails to upload never loses the request: the job is already
  created, and the customer is told which photos did not attach so they can add
  them again from the job page.
- Request photos are the customer's evidence, kept separate from the
  professional's Before/During/After work record. They can still be added while
  the request is `REQUESTED` or `QUOTED`, so a missing photo can be supplied
  before a quote is accepted.
- A voice note is not offered at request time. It needs its own discriminator
  in `job_voice_notes` so it is not confused with a technician's work voice
  note.

## 2.6 Professional Receives Request

A request reaches a professional in one of two ways: it was **addressed** to
them by the customer in step 02, or it is an **open request** that matches the
categories and service areas they publish.

```
Professional
↓
New request
↓
Open request
↓
Review:
- Customer
- Service
- Description
- Photos
- Location
- Preferred schedule
↓
Prepare quote
↓
Submit quote
↓
Customer notified
```

## 2.6.1 Professional Publishes Service Areas

Before a professional can receive open requests, they must publish the areas
they service. Areas are managed on their own screen at `/my-areas`, written
through `PATCH /api/v1/provider/me/service-areas`. The call replaces the whole
list, so the screen is a single editable list with one Save rather than an
add/remove pair — there is no state in which some areas are new and some are
old.

```
Professional
↓
/my-areas
↓
Add area (name, city, province)   1–10 areas
↓
Save areas                        replaces the whole list
```

Rules:

- Only `PROFESSIONAL`, `BUSINESS_OWNER` and `BUSINESS_MANAGER` may call the
  endpoint; any other role is `403 FORBIDDEN_ROLE`.
- Each area needs `areaName` (1–128 chars). `city` and `province` are
  optional and each at most 128 chars.
- A profile with **no** areas receives **no** open requests. Matching is area
  AND category, so an empty area list means an empty board — this is not an
  error state, it is the answer to "why am I seeing nothing".
- Service areas stay free-text. The MVP deliberately holds no latitude,
  longitude or radius: see `docs/DATABASE.md` section 10.

## 2.6.2 Open Request Matching

When a customer posts an open request, the backend resolves the set of
professionals and businesses that may quote it. A provider matches when
**both** conditions hold:

1. **Category** — the provider has an active `service_offerings` row in the
   same platform `service_categories` bucket as the job's service, or a
   `professional_services` / `business_services` link to a service in that
   category. A job for "Leak Repair & Pipe Fixes" reaches every plumber, not
   only the one provider who happens to list that exact leaf service.
2. **Area** — at least one of the provider's service areas matches the job's
   customer-supplied location.

Matching is computed by the backend at the moment the request is posted, and
every matched recipient receives a `JOB_REQUEST_OPEN` notification. A request
that matches nobody still succeeds: it simply waits for the customer to choose
a professional from the marketplace instead.

Matching is **not** a radius calculation. `service_areas` has no coordinates
and `jobs` has no geocoded columns written by this flow, so the area test is a
case-insensitive whole-word comparison of the location tokens against each
area's `area_name`, `city` and `province`. "Fourways, Johannesburg" therefore
matches an area named "Fourways & surrounds" and an area in city
"Johannesburg". This is stated as a known limitation, not a claim of distance
routing.

## 2.6.3 Professional Quotes an Open Request

```
Professional
↓
GET /provider/open-requests          matching open requests, newest first
↓
Open a request
↓
Submit quote  (or ask a question in the quote message)
    ↓
First quote moves the job REQUESTED → QUOTED
    ↓
Quotes 2 and 3 are accepted while the job stays QUOTED
    ↓
A 4th quote is rejected: 409 CONFLICT
```

- **At most 3 quotes per open request.** The limit is counted and enforced
  inside the same locked transaction that writes the quote, so two
  simultaneous submissions cannot both slip past it. The fourth submitter
  receives `409 CONFLICT` with a message telling them the customer already has
  three quotes. They are **not** notified, because they did not quote.
- A provider's own second quote on the same request is still
  `409 CONFLICT` — the existing one-quote-per-provider rule is unchanged.
- A professional who has already quoted keeps access to that request from
  `/requests` for the rest of its life, even though the job is not addressed
  to them. Quoting is the access grant.
- An **addressed** request is unchanged by this flow: only the one chosen
  provider may quote it, and the 3-quote cap does not apply because there is
  only one eligible provider.

## 2.6.4 What Acceptance Does to an Open Request

Acceptance is the moment the customer picks a professional, so the backend
writes the winner onto the job:

```
Customer
↓
Open request with up to 3 quotes
↓
Accept one quote
↓
Backend writes the winning professional onto the job
(jobs.professional_id / business_id + the job_assignments row
 an open request has no row for)
↓
Job becomes ACCEPTED — an ordinary addressed request
↓
That professional schedules and starts it as usual
```

This is why schedule, start, photos, progress notes and completion need no
open-request special case anywhere else in the system: from `ACCEPTED` onward
the job looks exactly like one that was addressed from the start. The two
competing quotes become `DECLINED`, never deleted.

## 2.6.5 Screens

| Screen | Route | Shows |
|---|---|---|
| Request wizard | `/request-job` | the customer choosing, or skipping, a professional |
| Open-request board | `/open-requests` | unaddressed requests matching the professional |
| Open-request detail | `/open-requests/:id` | one such request, with the quote form |
| Inbox | `/requests` | requests addressed to the professional, plus any they quoted |
| Inbox detail | `/requests/:id` | one of those |
| Service areas | `/my-areas` | the areas matching keys on |

`/open-requests/:id` and `/requests/:id` render the SAME detail component; only
the source endpoint and the "back" destination differ, and both are read from
the route.

## 2.6.6 Customer Corrects or Withdraws a Request

While a request has not been accepted, the customer can fix a mistake or call
the whole thing off. This is deliberately narrow: once a quote is accepted,
work has been agreed and the request is a record, not a draft.

```
Customer
↓  job is REQUESTED or QUOTED (nothing accepted yet)
↓
/my-jobs/:id
├─ Edit      change description, location, preferred date or time
├─ Cancel    keep the record, close the request as CANCELLED
└─ Delete    remove it from view entirely (soft delete)
```

Rules the customer sees in the UI, enforced server-side:

- All three disappear once the status is `ACCEPTED` or later, and the page
  explains why rather than showing a dead button.
- **Editing a request that already has quotes is allowed, but warned.** The
  quotes are the professional's to withdraw, not the customer's to retract, so
  they stay exactly as they were - priced on what the professional read. The
  customer is told this plainly before saving. Anyone who quoted is not
  re-notified; they already have the request in their inbox.
- **Editing the location of an open request can reach new professionals.** An
  open request has no chosen professional, so who it matches is decided by
  category plus area. Move it and the backend re-runs that match, alerting
  professionals newly in range. That is the point of moving it.
- **Cancel and delete are different.** Cancel closes the request and leaves it
  visible with its history - the right choice for "I found someone cheaper".
  Delete takes it out of the customer's list entirely - the right choice for
  "that was a mistake". Both notify the professional, so nobody is left
  believing live work still exists.
- The **service and the professional are not editable.** Picking the wrong
  trade or the wrong person is fixed by cancelling and reposting, because
  both are decisions about who does the work rather than corrections to it.
  Reposting is now cheap: step 02 can be skipped entirely.

## 2.7 Customer Receives Quote

Customer
↓
Notification
↓
Open job
↓
View quote
↓Up to 3 quotes on an open request, 1 on an addressed request
Review price/items/details
↓
Accept or decline


## 2.8 Customer Accepts Quote

Customer
↓
Accept quote
↓
Backend validates quote
↓
Job becomes ACCEPTED
↓
Provider notified
↓
Schedule job
↓
Job becomes SCHEDULED


## 2.9 Customer Declines Quote

Customer
↓
Open quote
↓
Decline
↓
Optional reason
↓
Quote becomes declined
↓
Provider notified


# 2A. PROVIDER SERVICE OFFERINGS

A provider describes the services they offer. Available to PROFESSIONAL,
BUSINESS_OWNER and BUSINESS_MANAGER at `/my-services`. No administrator
approval step.


## 2A.1 Provider Adds a Service

Provider
↓
My services
↓
Add a service
↓
Enter name, pick a platform service category, add an optional description
↓
Enter an indicative starting price in ZAR
↓
Save
↓
Service appears on the provider's public marketplace profile

The price is a "from R850" guide only. Fixlynk does not process payments:
the customer and provider agree the final amount directly, and Fixlynk
records the agreed quote on the job.


## 2A.2 Provider Edits a Service

Provider
↓
My services
↓
Edit
↓
Change name, category, description or price
↓
Save
↓

A service can never be moved to a different professional profile or
business once created.


## 2A.3 Provider Removes a Service

Provider
↓
My services
↓
Remove
↓
Confirm
↓
Service removed from the public profile

Removal is refused while any non-terminal job still references the service
(REQUESTED, QUOTED, ACCEPTED, SCHEDULED, IN_PROGRESS, AWAITING_PARTS or
DISPUTED). The provider must finish or cancel that work first, so a live job
never points at a service the provider no longer offers.

Removal is a soft delete, so completed job history keeps showing the service
the job was booked against.

The same flow applies to a business owner or manager managing their
business's offerings.


# 3. PROFESSIONAL JOB FLOW



## 3.1 Professional Starts Job

Professional
↓
Jobs
↓
Open scheduled job
↓
Review job
↓
Start work
↓
IN_PROGRESS


## 3.2 Before Work

Professional
↓
Job
↓
BEFORE
↓
Capture photos
↓
Add initial notes
↓
Save


## 3.3 During Work

Professional
↓
Job
↓
DURING
↓
Capture progress photos
↓
Add notes
↓
Add voice note where supported
↓
Update job


## 3.4 Parts Required

Professional/business/technician
↓
Job
↓
Parts required
↓
Create parts request
↓
Add part
↓
Add quantity
↓
Add reason
↓
Add photo if required
↓
Submit


## 3.5 Work Completed

Professional
↓
Job
↓
AFTER
↓
Capture final photos
↓
Add completion note
↓
Mark work complete
↓
COMPLETED
↓
Customer notified


## 3.6 Customer Confirms Completion

Customer
↓
Job completed
↓
Review final work
↓
View final photos
↓
Confirm completion
↓
CONFIRMED
↓
Review prompt


## 3.7 Customer Reviews Professional

Customer
↓
Completed job
↓
Leave review
↓
Rating
↓
Written feedback
↓
Submit
↓
Review associated with provider/job


# 4. BUSINESS FLOWS


## 4.1 Business Registration

Business owner
↓
Register
↓
Create user account
↓
Create business profile
↓
Add business information
↓
Select services
↓
Define service areas
↓
Submit
↓
Business dashboard


## 4.2 Business Creates Existing Customer

Business
↓
Customers
↓
Add customer
↓
Enter customer information
↓
Save
↓
Customer available for internal jobs


## 4.3 Business Creates Internal Job

Business
↓
Jobs
↓
Create job
↓
Select existing customer
↓
Select service
↓
Add description
↓
Add address
↓
Set priority
↓
Set schedule
↓
Add photos/notes
↓
Create job
↓
INTERNAL job created


## 4.4 Business Assigns Technician

Business
↓
Open job
↓
Assign technician
↓
Select technician
↓
Confirm
↓
Job assignment created
↓
Technician notified


## 4.5 Business Reassigns Technician

Business
↓
Open job
↓
Reassign
↓
Select new technician
↓
Confirm
↓
Assignment updated
↓
New technician notified


## 4.6 Business Job Board + History (Stage 7G)

Business owner / manager
↓
Open job board (`/business/jobs`)
↓
Category tabs with live counts (All, New, Assigned,
Scheduled, In Progress, Awaiting Parts, Completed,
Cancelled, History)
↓
Filter (technician, priority, creation-date range, sort,
search over reference/customer/phone/service)
↓
Job card (reference, customer, service, technician +
assignment date, status, priority, scheduled/created
dates, awaiting-parts badge, last work update)
↓
Open job → existing job detail (customer, service,
assignment, schedule, Before/During/After, notes, voice
notes, parts, approvals, timeline)
↓
History tab for completed/closed work
↓
Dashboard operations card (assigned, awaiting parts,
history)

Technician flow unchanged: My Jobs still shows only
assigned jobs. Marketplace flow unchanged: marketplace
jobs never appear on the internal board.


# 5. TECHNICIAN FLOW


## 5.1 Technician Receives Job

Technician
↓
Notification
↓
My Jobs
↓
Open job
↓
View job details


## 5.2 Technician Starts Work

Technician
↓
My Jobs
↓
Open job
↓
Start
↓
IN_PROGRESS


## 5.3 Technician Documents Before Condition

Technician
↓
Job
↓
Before
↓
Take photos
↓
Add note
↓
Save


## 5.4 Technician Updates Job

Technician
↓
Job
↓
Add update
↓
Add note
↓
Optional photo
↓
Optional voice note
↓
Save
↓
Business receives update


## 5.5 Technician Requests Parts

Technician
↓
Job
↓
Parts
↓
Create request
↓
Part
↓
Quantity
↓
Reason
↓
Photo
↓
Submit
↓
AWAITING_PARTS where appropriate

Stage 7E implementation note (2026-09-24): submission is
implemented for assigned IN_PROGRESS jobs (AWAITING_PARTS is
accepted by the same endpoint once reachable) — part name,
quantity 1–10000, reason 10–1000 chars, optional photo
evidence — and the request is stored PENDING with the
technician-visible status. The job stays IN_PROGRESS; the
"AWAITING_PARTS where appropriate" move above happens in
Stage 7F when the manager approves (see 5.6). Owners/
managers can already view the request (part, quantity,
reason, technician, date, status, photo) on the business
job detail; approve/reject/request-info controls arrive in
Stage 7F.


## 5.6 Manager Approves Parts

Business Manager
↓
Parts Requests
↓
Open request
↓
Review details
↓
Approve (optional comment)
↓
Request becomes APPROVED, job moves IN_PROGRESS → AWAITING_PARTS
↓
Mark parts available when they arrive (APPROVED → PARTS_AVAILABLE)
↓
Job resumes automatically once nothing approved is outstanding
(AWAITING_PARTS → IN_PROGRESS), otherwise it keeps waiting
↓
Technician continues work

Stage 7F implementation note (2026-09-24): approve / reject /
request-info / mark-available are implemented for owner/manager on
their own INTERNAL jobs (atomic with the `job_approvals` row and
history). "Technician notified" above is currently the
`parts-request-events` seam (`PARTS_REQUEST_APPROVED`, …) — no
`notifications` rows are written until Stage 8 (see
docs/NOTIFICATIONS.md).


## 5.7 Manager Rejects Parts

Business Manager
↓
Parts Requests
↓
Open request
↓
Reject
↓
Add reason (required)
↓
Request becomes REJECTED, job stays IN_PROGRESS
↓
Technician sees the decision and reason, continues work


## 5.7a Manager Requests More Information

Business Manager
↓
Parts Requests
↓
Open request
↓
Request more info (comment required)
↓
Request becomes NEEDS_INFO, job stays IN_PROGRESS
↓
Technician responds with the missing information (→ PENDING)
↓
Manager approves / rejects / asks again


## 5.7b Technician Resumes After Parts

Technician
↓
Job awaiting parts
↓
Parts available — job ready to continue
↓
Continue job (AWAITING_PARTS → IN_PROGRESS, only when no
approved request is outstanding)
↓
Work continues


## 5.8 Technician Completes Job

Technician
↓
Job
↓
After
↓
Final photos
↓
Completion note
↓
Mark complete
↓
COMPLETED
↓
Business notified


# 6. BUSINESS MARKETPLACE FLOW


## 6.1 Business Receives Marketplace Request

Business
↓
Marketplace request
↓
Review customer request
↓
Review service
↓
Review photos
↓
Review location
↓
Prepare quote
↓
Submit quote


## 6.2 Business Marketplace Job After Acceptance

Business
↓
Customer accepts quote
↓
Job becomes ACCEPTED
↓
Schedule
↓
Assign technician
↓
Technician notified
↓
Work begins
↓
Updates/photos
↓
Completion
↓
Customer confirmation


# 7. PORTFOLIO FLOW


## 7.1 Professional Creates Portfolio Project

Professional
↓
Portfolio
↓
Add project
↓
Project title
↓
Description
↓
Service
↓
Before images
↓
After images
↓
Additional images
↓
Save
↓
Publish where appropriate


## 7.2 Add Completed Job to Portfolio

Professional
↓
Completed job
↓
Add to portfolio
↓
Select project details
↓
Select permitted images
↓
Create portfolio project
↓
Public portfolio


# 8. CERTIFICATE FLOW


## 8.1 Professional Submits Certificate

Professional
↓
Certificates
↓
Add certificate
↓
Enter certificate information
↓
Upload document
↓
Submit
↓
PENDING


## 8.2 Admin Reviews Certificate

Admin
↓
Certificate verification
↓
Open certificate
↓
Review information
↓
Approve
or
Reject
or
Request information
↓
Professional notified


# 9. IDENTITY VERIFICATION FLOW


## 9.1 Professional Starts Verification

Professional
↓
Verification
↓
Start identity verification
↓
Provide required information
↓
Upload required documents
↓
Submit
↓
PENDING


## 9.2 Admin Reviews Identity Verification

Admin
↓
Verification queue
↓
Open request
↓
Review submitted information
↓
Approve
or
Reject
or
Request information
↓
Professional notified


# 10. MESSAGING FLOW


## 10.1 Customer and Provider Messaging

Customer
↓
Job
↓
Messages
↓
Open conversation
↓
Send message
↓
Provider receives notification
↓
Provider responds
↓
Customer receives notification


## 10.2 Business and Technician Messaging

Business
↓
Job
↓
Technician conversation
↓
Send message
↓
Technician receives notification
↓
Technician responds


# 11. ADMIN FLOWS (Stage 9)

Admin access is a lazy `/admin` area. The frontend shows the Admin link
only when the authenticated user has `ADMIN`; the backend independently
requires a valid session and an active authoritative `ADMIN` role. The
area is available to multi-role users who also hold `ADMIN`.

## 11.1 Admin Navigation

The admin shell navigation is:

- Dashboard — `/admin`
- Users — `/admin/users`
- Customers — `/admin/customers`
- Professionals — `/admin/professionals`
- Businesses — `/admin/businesses`
- Technicians — `/admin/technicians`
- Services — `/admin/services`
- Jobs — `/admin/jobs`
- Verification — `/admin/verification`
- Certificates — `/admin/certificates`
- Reviews — `/admin/reviews`
- Reports — `/admin/reports`
- Disputes — `/admin/disputes`
- Audit Logs — `/admin/audit-logs`
- Settings — `/admin/settings`

Each list route has a corresponding `:id` detail route where applicable.
Service creation and editing use `/admin/services/new` and
`/admin/services/:id/edit`. An unknown admin child route shows the
admin page-not-found state with a dashboard link.

## 11.2 Dashboard

Admin
↓
Open `/admin`
↓
Load `/api/v1/admin/dashboard`
↓
View:
- Users: total, active and pending
- Jobs: total, open and in progress
- Professionals: total, verified and pending
- Businesses: total, verified and pending
- Customers
- Active / total technicians
- Active / inactive services
- Completed jobs
- Verification requests pending or needing information
- Certificates pending or needing information
- Reports open or in review
- Disputes open or in review

Dashboard links open the matching resource list, including queue links
with `status` query parameters. The dashboard has loading, error and
retry states. A successful response with zero values is a valid empty
platform state.

## 11.3 Browse and Filter Resource Lists

Admin
↓
Open a resource list
↓
Enter search text where supported
↓
Select resource-specific filters
↓
Apply or reset filters
↓
View paginated records
↓
Open a record detail

Implemented list filters include:

- Users: search, status and role
- Customers: search
- Professionals and businesses: search and verification status
- Technicians: search and active state
- Services: search, service status and category id
- Jobs: search, source, job status, customer/professional/business id
  and creation-date range
- Verification: search, type, status and user id
- Certificates: search, status, professional id and business id
- Reviews: search, exact/minimum/maximum rating; the visibility control
  filters the current page only
- Reports: search, report type and status
- Disputes: search and status
- Audit logs: search, actor id, action, entity type/id and date range

Lists show the current page, total and page size, with Previous and Next
controls. Loading, empty and error states are present; errors can be
retried. Applying a filter resets to page 1. An older response cannot
overwrite a newer list request.

## 11.4 Enriched Detail Views

Admin
↓
Open a customer, professional, business, technician or job detail
↓
Review the bounded operational context
↓
Open a linked job or technician where the detail provides one
↓
Return to the source list

Customer detail shows the customer summary, newest 50 jobs and newest 50
reviews, plus job/review counts and average rating. Job entries link to the
admin job detail and include provider/service names.

Professional detail shows the verification/activity summary, newest 50
services, service areas, portfolio projects, certificates, identity
verification state and reviews. Portfolio entries show project metadata,
publication state and image count; image references and binaries are not
shown.

Business detail shows the safe owner summary, including last login, the
bounded member list, bounded technician roster and newest 50 business jobs
with customer names. Technician detail shows the business context, assigned
job count, newest 50 assigned jobs and newest 50 assignment records.

Job detail shows the safe job record, newest 100 status timeline entries,
newest 50 quotes with their items, newest 100 assignment records and
bounded documentation metadata. Documentation sections cover execution
images, updates, voice notes and parts requests. Image and voice metadata
may include safe filename/MIME/size/duration fields, but no raw storage
reference, file key, filesystem path or binary is exposed. Parts items
show `hasPhoto` rather than a photo reference.

All nested child collections are bounded detail views, not a full database
export. They show an empty state when no child records are returned. The
admin list pagination remains separate from these detail limits.

## 11.5 User Suspend and Reactivate

Admin
↓
Users
↓
Open user detail
↓
Review safe user fields, roles and last login
↓
Select Suspend user or Reactivate user
↓
Confirm the status change
↓
Backend validates actor, current state and audit persistence
↓
Updated user and success message
↓
Action appears in Audit Logs

Suspend is available for users that are not already suspended or deleted.
Reactivate is available for suspended users. The backend rejects
self-actions, invalid state changes and unsafe repeated actions. The
detail screen shows action errors and does not treat a frontend
confirmation dialog as authorization.

## 11.6 Service Management

Admin
↓
Services
↓
Open a service detail or Add service
↓
Review/enter category, name, slug, description, sort order and active state
↓
Save
↓
Backend validates fields, category and uniqueness
↓
Service list/detail updates
↓
Audit entry recorded

Existing services can be edited from `/admin/services/:id/edit` and
activated or deactivated from the detail screen. Category listing is
read-only. Duplicate slugs or duplicate names within a category are
rejected by the backend.

## 11.7 Verification Review

Admin
↓
Verification
↓
Filter PENDING or NEEDS_INFO
↓
Open verification detail
↓
View request metadata and review fields
↓
Optionally open the protected identity document
↓
Enter notes when required
↓
Choose Approve, Reject or Request info
↓
Confirm
↓
Backend updates the request and related profile verification state
↓
Audit entry recorded

Identity and business verification are reviewed through the verification
workflow. A certificate verification request cannot be decided through
this route; it belongs to the certificate workflow. Approved and rejected
records are terminal. Document viewing is protected and audited.

## 11.8 Certificate Review

Admin
↓
Certificates
↓
Filter by status, professional or business
↓
Open certificate detail
↓
View certificate metadata and review fields
↓
Optionally open the protected certificate document
↓
Enter notes when required
↓
Choose Approve, Reject or Request info
↓
Confirm
↓
Backend updates the certificate
↓
Audit entry recorded

Certificate decisions are separate from verification decisions and have
the same terminal-state and note requirements. The UI does not expose a
certificate upload or edit form.

## 11.9 Jobs, Reviews, Reports and Disputes

Admin
↓
Jobs, Reviews, Reports or Disputes
↓
Search/filter records
↓
Open detail

Jobs are platform-wide read-only records in Stage 9. The detail displays
reference, source, status, customer/provider/business/service context,
description, location, schedule and agreed amount. There is no admin job
status, quote, media, message, timeline or assignment action.

Reviews are read-only. The list can filter rating and the detail shows
review context and visibility state. There is no review moderation,
visibility, deletion or response action.

Reports support the guarded status update form. The admin may move a
report from `OPEN` to `IN_REVIEW`, `RESOLVED` or `DISMISSED`, or from
`IN_REVIEW` to `RESOLVED` or `DISMISSED`. `RESOLVED` and `DISMISSED`
are terminal. The form confirms before submitting and displays backend
transition errors.

Disputes support the guarded status/resolution form. The current backend
rejects same-status updates, updates to `CLOSED`, and `IN_REVIEW` → `OPEN`.
It otherwise accepts another valid status combination when the body rules
pass; the current implementation does not reject `RESOLVED` → `OPEN` or
`RESOLVED` → `IN_REVIEW`. `RESOLVED` and `CLOSED` require a resolution.
The form confirms before submitting and displays backend transition
errors.

## 11.10 Audit Log Viewing

Admin
↓
Audit Logs
↓
Filter by search, actor, action, entity, id and date range
↓
View paginated entries
↓
Open an entry
↓
Review action, actor, entity, metadata, IP address and timestamp

Audit logs are read-only. There is no create, edit or delete action. The
list and detail show loading, empty and error states, and pagination.
The backend records the covered administrative mutations and successful
document views.

## 11.11 Admin States and Limitations

All admin list and detail screens provide loading, error/retry and empty
states where the record set is empty. Detail actions have saving/disabled
states and use confirmation dialogs for user status, service status,
verification/certificate decisions and report/dispute updates. The
Settings route is intentionally an explicit “Settings are not yet
configured” state. Admin-specific notification contexts/types were not
added; the existing authenticated notification inbox remains unchanged.

No migration was created because the existing platform tables support
the Stage 9 operations.

Standard flow:

REQUESTED
↓
QUOTED
↓
ACCEPTED
↓
SCHEDULED
↓
IN_PROGRESS
↓
COMPLETED
↓
CONFIRMED
↓
CLOSED

Optional branch:

IN_PROGRESS
↓
AWAITING_PARTS
↓
IN_PROGRESS

Cancellation:

REQUESTED / QUOTED / ACCEPTED / SCHEDULED
↓
CANCELLED

Dispute:

COMPLETED / CONFIRMED / CLOSED
↓
DISPUTED

Exact allowed transitions must be enforced by the backend.


# 13. NOTIFICATION FLOW (Stage 8 — in-app only)

Important events generate in-app notifications (bell + `/notifications`
inbox; `unread-count` polled every 60s — no email/SMS/push/WebSockets).
Every notification references its job (`relatedJobId`) and opens the
role-specific detail: customers → `/my-jobs/:id`, providers →
`/requests/:id`, business roles → `/business/jobs/:id` for internal
jobs, technicians → `/technician/jobs/:id`.

Marketplace:

Job request submitted
↓
Selected professional/business notification (JOB_REQUEST)

Quote submitted
↓
Customer notification (QUOTE_RECEIVED)

Quote accepted
↓
Provider/business notification (QUOTE_ACCEPTED)

Job scheduled
↓
Customer notification (JOB_SCHEDULED; other provider-side managers included, actor excluded)

Job started
↓
Customer notification (JOB_STARTED)

Provider completes job
↓
Customer notification (JOB_COMPLETED)

Customer confirms
↓
Provider/business notification (JOB_CONFIRMED)

Business workflow:

Technician assigned / reassigned
↓
Newly assigned technician notification (TECHNICIAN_ASSIGNED / TECHNICIAN_REASSIGNED)

Technician starts job
↓
Owner/manager notification (JOB_STARTED)

Technician adds update
↓
Owner/manager notification (JOB_UPDATE)

Technician documents work (photos, voice note)
↓
Owner/manager notification (WORK_DOCUMENTED)

Parts requested
↓
Owner/manager notification (PARTS_REQUESTED)

Parts approved / rejected / more-info requested
↓
Technician notification (PARTS_APPROVED / PARTS_REJECTED / PARTS_MORE_INFO)

Parts available
↓
Technician notification (PARTS_AVAILABLE — exactly one per
fulfilment; the resume message is folded in, no double delivery)

Technician responds to a parts request
↓
Owner/manager notification (PARTS_REQUESTED)

Internal job completed
↓
Owner/manager notification (JOB_COMPLETED)

Delivery is best-effort: a notification failure never rolls back
the committed job, quote, assignment or approval. The Stage 7F
parts-request event bus keeps emitting as a test-observable seam;
persistence goes through the central notification service directly,
so no event is delivered twice.

Example (legacy sketch retained):

Quote submitted
↓
Customer notification

Quote accepted
↓
Provider/business notification

Technician assigned
↓
Technician notification

Parts requested
↓
Manager notification

Parts approved/rejected
↓
Technician notification

Job completed
↓
Customer/business notification

Customer confirms
↓
Provider/business notification

Review requested
↓
Customer notification


# 14. ERROR AND EDGE FLOWS

The system must handle:

- Invalid login
- Expired session
- Unauthorized access
- Resource not found
- Invalid job transition
- Invalid quote
- Duplicate request
- Upload failure
- Unsupported file type
- File too large
- Network failure
- Server error
- Missing required information
- Verification rejection
- Verification information request
- Cancelled job
- Disputed job


# 15. PERMISSION PRINCIPLE

Every flow must be checked against the authenticated user's role and
resource ownership.

Frontend navigation must never be treated as the security boundary.

Backend authorization is mandatory.


# 16. FLOW COMPLETION PRINCIPLE

A flow is not considered complete until:

- UI exists
- API exists
- Database behaviour exists
- Authorization exists
- Validation exists
- Error handling exists
- Loading state exists
- Empty state exists
- Tests exist
- Documentation matches implementation


# 17. STAGE 6C IMPLEMENTATION NOTES — PROVIDER REQUESTS & QUOTES

Implemented 2026-09-23. Covers flows §2.6 (Professional Receives
Request, up to quote submission) and the read side of §2.7 (Customer
Receives Quote, view only).

Customer:

REQUESTED → Quote received → QUOTED (read-only; the detail page shows
"Quote received — review the details." No accept/decline actions yet —
§2.8 and §2.9 belong to a later stage).

Provider:

View request (`/requests`) → Review job (`/requests/:id`) → Submit
quote (ZAR amount, optional message, optional line items) → QUOTED.
After submission the provider sees the submitted quote and the QUOTED
status; the form is replaced so accidental duplicate submission is
impossible (a repeated POST is rejected with `409 CONFLICT` anyway).

Explicitly out of scope for Stage 6C: quote acceptance/decline/
withdrawal, payment processing (the customer pays the professional
directly outside the platform in MVP), scheduling beyond the existing
preferred date/time, technician assignment, and notifications.

# 18. STAGE 6D IMPLEMENTATION NOTES — CUSTOMER QUOTE ACCEPTANCE

Implemented 2026-09-23. Covers flow §2.8 up to acceptance (scheduling
itself remains a later stage) and the provider side of §6.2 up to
"Job becomes ACCEPTED".

Customer:

Request job → Receive quote → Review quote (`/my-jobs/:id` shows
each quote with provider, amount, currency, message and line items;
no auto-selection, ranking or recommendation — the customer picks) →
Accept Quote (per-quote button, only on `QUOTED` jobs for `SUBMITTED`
quotes) → confirmation ("Accept this quote? By accepting, you agree
to the quoted amount of R…. Payment is arranged directly with the
professional." — Cancel / Accept Quote) → Job accepted (banner:
Quote accepted, status `ACCEPTED`, provider, agreed price, and the
direct-payment wording).

Provider:

Receive request → Submit quote → Quote accepted (the request detail
shows the `Accepted` state with the agreed amount and `ACCEPTED`
status; the quote form is gone and the provider cannot accept,
change or re-open the acceptance) → Await next job step.

Explicitly out of scope for Stage 6D: payment processing of any kind
(no gateway, escrow, transaction or receipt — the accepted total is
the agreed price only), technician assignment, the full scheduling
workflow, Before/During/After execution, quote decline/withdrawal,
and notifications.

# 19. STAGE 6E IMPLEMENTATION NOTES — SCHEDULING & JOB EXECUTION START

Implemented 2026-09-23. Covers the ACCEPTED → SCHEDULED → IN_PROGRESS
segment of flow §12 (the standard job lifecycle) for marketplace jobs:
the provider side of §6.2 ("Schedule") and §3.1 (Professional Starts
Job), and the matching customer visibility.

Customer:

Accept Quote (ACCEPTED — "Next step: the provider will schedule the
job") → Provider Schedules → Customer sees Scheduled (date/time in
SAST, provider, agreed price, direct-payment wording) → Provider
Starts → Customer sees In Progress (provider, scheduled date/time,
agreed price). The customer has no controls that change the job
status — every customer view in this segment is read-only.

Provider:

Accepted Job → Schedule Job (date + time inputs, SAST wall time sent
with its UTC+2 offset) → Job Scheduled ("Scheduled: 5 October 2026
at 10:00") → Start Job (confirmation: "Starting the job will mark it
as In Progress") → Job In Progress (active state).

Explicitly out of scope for Stage 6E: payment processing of any kind,
technician marketplace transitions, Before/During/After execution
media, completion/confirmation/reviews, and notifications.

# 20. STAGE 6F IMPLEMENTATION NOTES — JOB EXECUTION & WORK DOCUMENTATION

Implemented 2026-09-23. Covers the IN_PROGRESS → COMPLETED →
CONFIRMED → CLOSED segment of flow §12 for marketplace jobs: the
provider side of §3.2 (Before Work), §3.3 (During Work, minus voice
notes), §3.5 (Work Completed, minus notifications) and the customer
side of §3.6 (Customer Confirms Completion, minus the review prompt).

Provider:

Start Job (IN_PROGRESS) → Before Work (photos + note) → During Work
(multiple progress updates + photos) → After Work (final photos +
completion note) → Complete Job (completion note required →
COMPLETED) → Await customer confirmation (read-only; the provider
never sees a confirmation action).

Customer:

View Work (IN_PROGRESS — read-only Job Progress with BEFORE/DURING/
AFTER photos and notes) → See Completion (COMPLETED — completion
note, after photos, timestamp) → Confirm Completion (single action;
backend records CONFIRMED then CLOSED and returns the closed job) →
Job Closed (read-only history + timeline). Choosing "Not Yet" changes
nothing — the customer is guided to contact the provider instead of
an invented dispute/new status.

Explicitly out of scope for Stage 6F: payment processing of any kind,
technician marketplace execution, parts requests, manager approvals,
portfolio publishing (photos stay private), voice notes, the review
flow, and notifications.

# 21. STAGE 7A IMPLEMENTATION NOTES — BUSINESS FOUNDATION & TECHNICIAN MANAGEMENT

Implemented 2026-09-23. Covers the business side of the
Create → Assign foundation: an authenticated owner/manager opens
their business dashboard, keeps the business profile current, and
builds the technician roster. No jobs are assigned yet.

Business owner:

Login → Business (dashboard: business name, verification state,
membership role, real technician count; jobs shown as an explicit
"Coming soon" state, never fake counts) → Edit profile (owner-only;
name, description, contact, city/province) → Technicians (roster
with status and contact info) → Invite a technician (name, email,
optional phone, initial password for brand-new accounts; existing
Fixlynk accounts are linked without a password change) →
Technician detail (rename, activate/deactivate; deactivation
immediately revokes that technician's business access).

Business manager:

Login → Business (read-only profile; no Edit action is offered) →
Technicians (same roster) → Invite / rename / activate /
deactivate technicians in their own business only.

Technician:

Login → No business navigation is offered (minimal surface until
Stage 7C). Technicians authenticate with their own login and the
backend exposes only their own roster row.

Customers and professionals see no business navigation at all.

Explicitly out of scope for Stage 7A: business creation/
onboarding (an owner with no business sees "No business found"),
internal jobs, technician job assignment, technician My Jobs,
parts requests, manager approvals, voice notes, notifications,
the admin dashboard, payment processing, and new marketplace
functionality.


# 22. STAGE 7B IMPLEMENTATION NOTES — INTERNAL BUSINESS JOBS

Implemented 2026-09-24. Covers the business side of
Create (before Assign): an authenticated owner/manager manages
the customers the business serves directly and creates internal
jobs for them on the shared jobs table. No technician is
assigned yet.

Business owner / manager:

Login → Dashboard (business name, verification state,
membership role, real technician count, plus REAL internal-job
counts — total, requested, scheduled, in progress, completed —
zero when there is no data, never fake numbers) → Customers
(private roster: first/last name, optional email/phone; add a
customer; edit contact details inline) → Jobs (INTERNAL list
with status/customer/service/date/priority/source, status and
search filters, pagination) → Create internal job (select an
existing customer — or create the customer first — select a
catalogue service, description, address, priority, optional
preferred date/time; success shows the job reference and
REQUESTED status) → Job detail (customer, service, description,
address, priority, schedule, status, status-history timeline,
business information; field editor and Cancel while REQUESTED)
→ Profile (business identity with the owner-only editor) →
Settings (account page, reused in this stage).

Navigation for owner/manager roles now reads Dashboard, Jobs,
Customers, Technicians, Profile, Settings. Technician navigation
is unchanged (no business-management links); customers and
marketplace professionals see no business navigation at all.

Technician:

Login → Still no business job surface (no assignment yet).
Technicians cannot create internal jobs, manage business
customers, list business jobs or cancel them.

Explicitly out of scope for Stage 7B (later stages):
technician assignment, technician My Jobs, technician
execution, voice notes, parts requests, manager parts
approval, notifications, the admin dashboard, payment
processing, and marketplace quote/job changes.

# 23. STAGE 7C IMPLEMENTATION NOTES — TECHNICIAN ASSIGNMENT + MY JOBS

Implemented 2026-09-24. Connects internal jobs to technicians:
Business creates internal job → REQUESTED → owner/manager
assigns technician → technician sees the job in My Jobs → opens
the assigned job. Assignment never changes job status.

Business owner / manager:

Jobs → Job detail now shows the current technician (name,
contact where appropriate, assigned date) plus an Assign /
Reassign control (active-technician selector). Assignment and
reassignment are immediate; the previous assignment stays on
record in the assignment history. Edit/cancel behaviour from
Stage 7B is unchanged.

Technician:

Login → My Jobs (`/technician/jobs`: service, customer,
address, scheduled date, priority, status; status filter and
pagination) → Job detail (`/technician/jobs/:id`: service,
customer + job contact details, description, address, priority,
schedule, status, timeline). Only assigned jobs are visible;
opening another job by URL reads as not found. Technician
navigation reads My Jobs (Messages, Parts, Completed Jobs and
Profile remain placeholders for later stages).

Explicitly out of scope for Stage 7C (later stages):
technician execution updates, voice notes, parts requests,
manager approvals, notifications, the admin dashboard, payment
processing, and marketplace quote/job changes.

# 24. STAGE 7D IMPLEMENTATION NOTES — TECHNICIAN EXECUTION + VOICE NOTES

Implemented 2026-09-24. The assigned technician executes and
documents the job; the business watches read-only:

Technician My Jobs → open assigned job → Start Work (confirm;
REQUESTED/SCHEDULED → IN_PROGRESS) → BEFORE (photos + note) →
DURING (progress photos + updates + voice notes) → AFTER
(final photos + completion note) → Complete Job (confirm;
IN_PROGRESS → COMPLETED) → business sees the execution
history. Assignment itself still never changes job status.

Technician:

Login → My Jobs (unchanged list) → Job detail
(`/technician/jobs/:id`): service, customer + job contact
details, description, address, priority, schedule, job status
with a Start Work action while REQUESTED/SCHEDULED (confirm
dialog; starting state; error state) → once IN_PROGRESS the
execution workspace appears with BEFORE (photo picker +
note form), DURING (progress photo picker, update form, voice
recorder with Record/Recording/Stop/playback/Remove/Upload
states plus an audio-file fallback, upload and error states)
and AFTER (final photo picker, completion-note field) sections
→ Complete Job (enabled only with a completion note; confirm
dialog) → COMPLETED shows the read-only work record with the
completion note → execution timeline (assignment, status,
notes, photos, voice notes, oldest first) below the workspace.
Microphone denial shows a clear message and leaves photos and
notes fully usable. Only assigned jobs are visible; opening
another job by URL reads as not found. Technician navigation
is unchanged.

Business owner / manager:

Job detail (`/business/jobs/:id`) gains a read-only work
documentation section once work has started: technician notes
(by phase), photos, voice notes with playback, and the
execution timeline. No start/upload/complete controls appear
for managers — approvals arrive in a later stage.

Explicitly out of scope for Stage 7D (later stages): parts
requests, manager approvals / awaiting-parts workflow,
business job board redesign, notifications, admin, payments,
full system test, and client UAT.
