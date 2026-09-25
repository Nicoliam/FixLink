# FixLink Client UAT Test Plan

## 1. How to use this plan

Run tests in a dedicated UAT environment using fictional data. Mark `Pass`, `Fail`, or `Blocked/Known limitation` in the Pass/Fail column and record evidence in Comments. The first row of each role group establishes the role context.

Use the test accounts in [`CLIENT-UAT.md`](CLIENT-UAT.md). Never record passwords or tokens in this document.

## 2. Authentication and registration

| # | Test | Expected Result | Pass | Fail | Comments |
|---|---|---|---|---|---|
| 1 | Open the login page | Login form is reachable and guest-only |  |  |  |
| 2 | Log in with a valid seeded customer | Customer session is created and account page is shown |  |  |  |
| 3 | Log in with an invalid password | Safe generic error is shown and no session is created |  |  |  |
| 4 | Register a customer | Customer account is created and the user can log in |  |  |  |
| 5 | Register a professional | Professional registration succeeds without privileged-role self-assignment |  |  |  |
| 6 | Attempt to self-register as ADMIN, TECHNICIAN, or BUSINESS_MANAGER | Registration is rejected |  |  |  |
| 7 | Refresh a protected page while logged in | Session is restored where the token remains valid |  |  |  |
| 8 | Log out | Local session is cleared and protected pages are no longer accessible |  |  |  |
| 9 | Use a suspended account | Account is rejected by the backend |  |  |  |
| 10 | Request a protected API page without a token | HTTP 401 is returned and private data is not shown |  |  |  |

## 3. Marketplace discovery and provider profiles

| # | Test | Expected Result | Pass | Fail | Comments |
|---|---|---|---|---|---|
| 11 | Open `/marketplace` without logging in | Public marketplace is available |  |  |  |
| 12 | Search by service | Matching providers are returned and the result count is shown |  |  |  |
| 13 | Search by location or suburb | Location filtering narrows the provider results |  |  |  |
| 14 | Filter by provider type | Professional and business results match the selected type |  |  |  |
| 15 | Filter by verified state | Verification filter behaves as selected |  |  |  |
| 16 | Open a provider profile | Name, services, areas, rating, portfolio metadata, approved certificates and reviews are shown where public |  |  |  |
| 17 | Open a second provider profile | Provider-specific data is not mixed with the first profile |  |  |  |
| 18 | Inspect public profile responses | No private verification document references, passwords, tokens, customer contact data or filesystem paths are exposed |  |  |  |

## 4. Customer marketplace job lifecycle

| # | Test | Expected Result | Pass | Fail | Comments |
|---|---|---|---|---|---|
| 19 | Open Request a job as a customer | Authenticated request form is available |  |  |  |
| 20 | Submit a valid marketplace job | Job is created with `MARKETPLACE` source and `REQUESTED` status |  |  |  |
| 21 | Submit an invalid short description | Validation error is shown and no job is created |  |  |  |
| 22 | Open My Jobs as the customer | Only the customer's own marketplace jobs are shown |  |  |  |
| 23 | Open another customer's job URL | Job is not found and private details are not shown |  |  |  |
| 24 | Professional opens the provider request inbox | Only requests addressed to that professional are shown |  |  |  |
| 25 | Professional opens a request | Customer display information appropriate for the job is shown |  |  |  |
| 26 | Submit a quote with a ZAR amount | Quote is saved and job becomes `QUOTED` |  |  |  |
| 27 | Submit quote line items with an incorrect total | Server rejects the quote and does not trust the client total |  |  |  |
| 28 | Customer accepts a submitted quote | Job becomes `ACCEPTED`; other active quotes are declined |  |  |  |
| 29 | Provider schedules an accepted job | Job becomes `SCHEDULED` and the schedule is visible to the customer |  |  |  |
| 30 | Provider starts a scheduled job | Job becomes `IN_PROGRESS` |  |  |  |
| 31 | Provider uploads a BEFORE JPEG, PNG, or WebP image within 5 MB | Image metadata is saved and the customer can view it |  |  |  |
| 32 | Provider adds a DURING note | Update is visible in the job timeline and execution record |  |  |  |
| 33 | Provider uploads an AFTER image | AFTER image is stored and visible in the work record |  |  |  |
| 34 | Provider completes the job with a note | Job becomes `COMPLETED` and history remains intact |  |  |  |
| 35 | Customer views execution documentation | Customer sees the authorised photos, notes and timeline |  |  |  |
| 36 | Customer confirms completion | Confirmation records `CONFIRMED` then `CLOSED` history |  |  |  |
| 37 | Customer views the closed job | Job history and completion timestamps remain visible |  |  |  |
| 38 | Customer views provider reviews | Existing public reviews are shown; the current frontend has no review-submission form |  |  |  |
| 39 | Attempt a marketplace job action as a technician | Action is rejected; technicians cannot act as marketplace providers |  |  |  |

## 5. Business customers and internal jobs

| # | Test | Expected Result | Pass | Fail | Comments |
|---|---|---|---|---|---|
| 40 | Owner opens the business dashboard | Business-scoped dashboard metrics are shown |  |  |  |
| 41 | Manager opens the business dashboard | Manager sees the business operations surface |  |  |  |
| 42 | Create a business-managed customer | Customer is stored only in the authenticated business |  |  |  |
| 43 | Edit a business-managed customer | Change is reflected in the owning business only |  |  |  |
| 44 | Open a second business's customer URL | Customer is not found and no private data is shown |  |  |  |
| 45 | Create an internal job | Job is created with `INTERNAL` source and `REQUESTED` status |  |  |  |
| 46 | Edit a requested internal job | Edit is accepted while the job is `REQUESTED` |  |  |  |
| 47 | Cancel a requested internal job | Job becomes `CANCELLED` and remains in history |  |  |  |
| 48 | Open the internal job board | Only jobs belonging to the authenticated business are shown |  |  |  |
| 49 | Filter the job board by status, technician, priority, date and search | Results match the selected business-scoped filters |  |  |  |
| 50 | Open an internal job | Customer, service, address, status, assignment and history are shown |  |  |  |
| 51 | Attempt to edit an internal job after it leaves `REQUESTED` | Server rejects the invalid transition |  |  |  |

## 6. Technician assignment and execution

| # | Test | Expected Result | Pass | Fail | Comments |
|---|---|---|---|---|---|
| 52 | Owner assigns an active technician | Assignment is recorded without creating a new job status |  |  |  |
| 53 | Reassign the technician | Previous assignment is closed and new assignment history is preserved |  |  |  |
| 54 | Technician opens My Jobs | Only actively assigned jobs are listed |  |  |  |
| 55 | Technician opens an unassigned job | Job is not found |  |  |  |
| 56 | Technician opens another technician's job | Job is not found |  |  |  |
| 57 | Technician opens another business's job | Job is not found |  |  |  |
| 58 | Start a requested or scheduled internal job | Job becomes `IN_PROGRESS` |  |  |  |
| 59 | Add a BEFORE note and photo | Note and image are attached to the correct job and visible to authorised business users |  |  |  |
| 60 | Add a DURING update | Timeline is updated for the technician, owner and manager |  |  |  |
| 61 | Record or upload a voice note within 10 MB | Audio is stored with private metadata and can be played by authorised users |  |  |  |
| 62 | Upload a voice note with an unsupported or spoofed type | Upload is rejected |  |  |  |
| 63 | Add an AFTER photo and completion note | Technician can complete the job and the history is preserved |  |  |  |
| 64 | Owner or manager views technician execution | Photos, notes, voice-note metadata/playback and timeline are readable |  |  |  |

## 7. Parts and approvals

| # | Test | Expected Result | Pass | Fail | Comments |
|---|---|---|---|---|---|
| 65 | Technician requests parts with items and reason | Parts request is stored for the assigned internal job |  |  |  |
| 66 | Add an optional parts evidence photo | Photo is private and visible to the technician and owning business reviewers |  |  |  |
| 67 | Manager opens the parts request | Request and review history are visible |  |  |  |
| 68 | Manager requests more information | Request becomes `NEEDS_INFO` and the technician receives a notification |  |  |  |
| 69 | Technician responds to the information request | Request returns to `PENDING` and the response is visible |  |  |  |
| 70 | Manager approves parts | Request becomes `APPROVED` and the job becomes `AWAITING_PARTS` when required |  |  |  |
| 71 | Manager rejects parts with a reason | Request becomes `REJECTED` and the technician sees the reason |  |  |  |
| 72 | Manager marks approved parts available | Parts request becomes `PARTS_AVAILABLE` |  |  |  |
| 73 | Technician resumes the job | Job returns from `AWAITING_PARTS` to `IN_PROGRESS` when no approved request is outstanding |  |  |  |
| 74 | Try to approve your own parts request | Action is rejected |  |  |  |

## 8. Notifications and history

| # | Test | Expected Result | Pass | Fail | Comments |
|---|---|---|---|---|---|
| 75 | Trigger a marketplace request, quote, acceptance, schedule, start, completion or confirmation | The intended recipient receives an in-app notification without exposing another account's data |  |  |  |
| 76 | Trigger assignment, technician update, parts request and parts decision | Intended owner, manager or technician receives the appropriate notification |  |  |  |
| 77 | Open Notifications | Notifications are scoped to the logged-in user |  |  |  |
| 78 | Mark one notification read | Unread count decreases and the notification remains in history |  |  |  |
| 79 | Mark all notifications read | Unread count becomes zero for the current user |  |  |  |
| 80 | Open job history | Status changes, assignments, parts decisions and work records remain traceable |  |  |  |

## 9. Admin operations

| # | Test | Expected Result | Pass | Fail | Comments |
|---|---|---|---|---|---|
| 81 | Admin opens dashboard | Platform aggregates and operational queues are shown |  |  |  |
| 82 | View users, customers, professionals, businesses and technicians | Scoped admin lists and detail views load |  |  |  |
| 83 | View services and categories | Service catalogue is visible and filters work |  |  |  |
| 84 | Create, edit, activate or deactivate a service where allowed | Change is validated and appears in the catalogue/admin list |  |  |  |
| 85 | View jobs | Marketplace and internal job records are visible as platform-admin records |  |  |  |
| 86 | Review verification and certificates | Authorised admin can view records and make supported review decisions |  |  |  |
| 87 | Open a verification or certificate document as admin | Protected document is delivered and the access is audited |  |  |  |
| 88 | View reviews, reports, disputes and audit logs | Read/detail views load and sensitive document references remain hidden |  |  |  |
| 89 | Update report or dispute status where supported | Guarded update succeeds and the change is auditable where the current implementation records it |  |  |  |
| 90 | Open `/admin/settings` | Placeholder explains that settings are not configured; no settings change is available |  |  |  |

## 10. Privacy, isolation and files

| # | Test | Expected Result | Pass | Fail | Comments |
|---|---|---|---|---|---|
| 91 | Customer tries to read another customer's job | Access is rejected/not found and no private data is returned |  |  |  |
| 92 | Business A tries to read Business B's customer, job or technician | Access is rejected/not found |  |  |  |
| 93 | Technician tries to read a job outside the active assignment | Access is rejected/not found |  |  |  |
| 94 | Business user tries to use the marketplace customer surface for an internal job | Marketplace/internal isolation is preserved |  |  |  |
| 95 | Non-admin tries to open an admin route | Access is rejected |  |  |  |
| 96 | Request a private image or voice note without authorisation | No file bytes are returned |  |  |  |
| 97 | Inspect private file response headers | `no-store`/no-cache private caching controls are present |  |  |  |
| 98 | Upload a file over the image or audio limit | Upload is rejected with a safe validation error |  |  |  |
| 99 | Upload a renamed executable or unsupported file | Content validation rejects it |  |  |  |
| 100 | Verify database does not contain file bytes | File metadata is stored separately from binary content |  |  |  |

## 11. Deployment smoke tests

| # | Test | Expected Result | Pass | Fail | Comments |
|---|---|---|---|---|---|
| 101 | Call `/health` after deployment | HTTP 200 with `{ "data": { "status": "ok" } }` |  |  |  |
| 102 | Complete the short deployment smoke sequence in `SMOKE-TEST.md` | Health, login, marketplace, job, media, business, technician and admin checks pass |  |  |  |
| 103 | Confirm known admin settings limitation | No attempt is made to configure settings because the feature is not implemented |  |  |  |
| 104 | Confirm payment wording | User interface explains direct payment and does not claim payment processing |  |  |  |
