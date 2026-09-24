# FixLink — User Flows

## 1. Purpose

This document defines the main FixLink user journeys.

The flows describe expected product behaviour and provide a reference for
frontend, backend, database and testing implementation.


# 2. CUSTOMER FLOWS


## 2.1 Customer Registration

Customer
↓
Register
↓
Enter name
↓
Enter phone
↓
Enter email
↓
Create password
↓
Submit registration
↓
Verify email/phone where required
↓
Account created
↓
Customer dashboard


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

Customer
↓
Select provider
↓
Request service
↓
Select service
↓
Describe work
↓
Add location
↓
Select preferred date/time
↓
Upload photos if needed
↓
Submit request
↓
REQUESTED


## 2.6 Professional Receives Request

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


## 2.7 Customer Receives Quote

Customer
↓
Notification
↓
Open job
↓
View quote
↓
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


## 5.6 Manager Approves Parts

Business Manager
↓
Parts Requests
↓
Open request
↓
Review details
↓
Approve
↓
Technician notified
↓
Work continues


## 5.7 Manager Rejects Parts

Business Manager
↓
Parts Requests
↓
Open request
↓
Reject
↓
Add reason
↓
Technician notified


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


# 11. ADMIN FLOWS


## 11.1 Admin User Management

Admin
↓
Users
↓
Search user
↓
Open user
↓
View details
↓
Take permitted administrative action
↓
Audit action where required


## 11.2 Admin Provider Verification

Admin
↓
Verification
↓
Open request
↓
Review
↓
Approve
or
Reject
or
Request information
↓
Status updated
↓
Provider notified


## 11.3 Admin Job Review

Admin
↓
Jobs
↓
Search job
↓
Open job
↓
Review:
- Customer
- Provider/business
- Quote
- Status
- Timeline
- Media
- Messages where permitted
↓
Take permitted administrative action


# 12. JOB STATUS FLOW

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


# 13. NOTIFICATION FLOW

Important events generate notifications.

Example:

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
FixLink accounts are linked without a password change) →
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
