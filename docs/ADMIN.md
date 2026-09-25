# FixLink — Admin / Platform Operations

## 1. Purpose

Stage 9 provides the implemented FixLink platform-operations surface for
active `ADMIN` users. It is a platform-level view, not a second business,
marketplace or technician workflow.

The backend is authoritative. Angular navigation and the admin guard are
user-experience controls only.

## 2. Responsibilities

An active administrator can:

- View the platform dashboard and aggregate operational counts.
- View safe platform-wide user records and filter the user directory.
- Suspend eligible users and reactivate suspended users.
- View platform-wide customer, professional, business and technician
  records, including bounded detail projections:
  - customer job history and reviews;
  - professional services, service areas, portfolio metadata,
    certificates, identity-verification state and reviews;
  - business owner, members, team, technicians and jobs;
  - technician business context, assigned-job count, assigned jobs and
    assignment history.
- View and manage services. Service categories are read-only.
- View platform-wide jobs, including bounded timeline, quotes and quote
  items, assignment history and metadata-only execution/parts information.
- Review identity and business verification requests.
- Review certificates.
- View reviews, reports and disputes.
- Move reports and disputes only through their guarded status workflows.
- View audit logs and audit-log details.
- Open protected verification and certificate documents through the
  dedicated admin document endpoints.

An administrator cannot:

- Change their own account status.
- Change user roles or create/delete platform users.
- Moderate, hide, delete or respond to reviews.
- Change job status, quotes, media, messages or timelines.
- Assign or reassign technicians.
- Manage platform settings.
- Use admin access to bypass the separate customer, provider, business or
  technician ownership checks on those other surfaces.

There are no fine-grained admin permissions, delegated scopes or
per-resource admin roles in Stage 9.

## 3. Authentication and authorization

Every `/api/v1/admin` request requires:

1. A valid Bearer access token.
2. An authoritative user record loaded by the backend.
3. `status = ACTIVE`.
4. `ADMIN` in the authoritative role list.

The backend reloads the user status and roles instead of trusting role
claims in the access token. Missing or invalid authentication, including a
`SUSPENDED` or `DELETED` account, returns `401 UNAUTHORIZED`. An
authenticated `PENDING` account or a valid non-admin returns
`403 FORBIDDEN_ROLE`.

Roles are additive. A user with `ADMIN` and another role can use the
admin area while active, but the other role-specific surfaces still apply
their own rules. `ADMIN` does not grant a business membership, provider
identity, customer identity or technician assignment.

## 4. Navigation and screens

The Angular admin area is lazy loaded at `/admin` and protected on both
route activation and child activation. The sidebar contains:

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

Resource lists have detail routes at `/:id` where the API supports a
detail. Service creation and editing use `/admin/services/new` and
`/admin/services/:id/edit`.

The Settings route deliberately displays that settings are not configured.
It does not call a settings API. Unknown admin child routes display the
admin page-not-found state.

## 5. Dashboard

`GET /api/v1/admin/dashboard` returns counts for:

- Users: total, active, pending and suspended.
- Customers.
- Professionals: total, verified and pending.
- Businesses: total, verified and pending.
- Technicians: total and active.
- Services: total, active and inactive.
- Jobs: total, open, in progress and completed.
- Verification: pending and needing information.
- Certificates: pending and needing information.
- Reports: open and in review.
- Disputes: open and in review.

The dashboard links to resource lists and review queues. It has loading,
error and retry states. Zero counts are valid platform states.

## 6. Resource visibility

Admin list queries are platform-wide. They are not scoped to a business
membership and do not expose marketplace-only or business-only ownership
surfaces as alternate admin capabilities.

Supported read resources are:

- Users and safe user details, including `lastLoginAt`.
- Customer profiles and bounded job/review history.
- Professional profiles and bounded services, areas, portfolio metadata,
  certificates, verification state and reviews.
- Business profiles and bounded owner, member, technician and job context.
- Technician roster records and bounded assigned-job/assignment history.
- Service categories and services.
- Jobs and bounded safe job details.
- Verification requests.
- Certificates.
- Reviews.
- Reports.
- Disputes.
- Audit logs.

Nested detail collections are bounded server-side. Customer,
professional, business and technician child collections are capped at 50
records. Job timeline, assignments and documentation are capped at 100;
job quotes are capped at 50. These limits apply to the detail projection,
not just the paginated list endpoint.

The safe job projection is limited to the implemented administrative
fields: reference, source, status, customer/provider/business/service
context, title, description, location, schedule, agreed amount, currency
and timestamps. Job details add bounded timeline, quotes/items, assignment
history and documentation metadata. Documentation includes image, update,
voice-note and parts-request metadata, but never raw storage references,
file keys, paths or binary content. The Stage 9 admin surface does not
expose job mutation or quote, media, message or timeline intervention
operations.

## 7. Supported operations

### User status

`POST /api/v1/admin/users/:id/suspend` and
`POST /api/v1/admin/users/:id/reactivate` accept only an empty object
body. A user can be suspended from `PENDING` or `ACTIVE` and reactivated
from `SUSPENDED`. The backend rejects self-actions, invalid state changes
and unsafe repeated actions.

### Services

The service editor and detail screen support:

- Creating a service with category, name, slug, description, sort order
  and active state.
- Editing those fields through a partial update.
- Activating and deactivating services through their dedicated endpoints.

Service categories are read-only. Duplicate service names within a
category and duplicate slugs are rejected by the backend.

### Verification

The verification list supports type, status, user and search filters. A
verification detail can open the protected identity document and can
approve, reject or request more information.

`PENDING` and `NEEDS_INFO` are reviewable. `APPROVED` and `REJECTED`
are terminal. Reject and request-info require notes. Certificate
verification requests must use the certificate workflow.

### Certificates

The certificate list supports status, professional, business and search
filters. A certificate detail can open its protected document and can be
approved, rejected or returned for more information. Certificate
decisions have the same terminal-state and note rules. There is no admin
certificate upload or edit operation.

### Reports

A report can move:

- `OPEN` → `IN_REVIEW`, `RESOLVED` or `DISMISSED`
- `IN_REVIEW` → `RESOLVED` or `DISMISSED`

`IN_REVIEW` cannot return to `OPEN`. `RESOLVED` and `DISMISSED` are
terminal. The UI submits only the report status and confirms before the
backend applies the transition.

### Disputes

The current backend guard rejects a same-status update, any update to
`CLOSED`, and `IN_REVIEW` → `OPEN`. It otherwise accepts another valid
status combination when the body rules pass; the current implementation
does not reject `RESOLVED` → `OPEN` or `RESOLVED` → `IN_REVIEW`. A
resolution is required for `RESOLVED` and `CLOSED`. The UI submits only
the status and resolution and confirms before the backend applies the
transition.

### Reviews

Reviews are visible in the admin list and detail. There is no review
moderation, visibility mutation, deletion or response operation in Stage
9. The review list's visibility filter operates on the current page only;
it is not a backend moderation capability.

## 8. API overview

All admin JSON routes use `/api/v1/admin` and the standard success/error
envelopes in `docs/API.md`.

Implemented route groups are:

- `GET /dashboard`
- `GET /users`, `GET /users/:id`,
  `POST /users/:id/suspend`, `POST /users/:id/reactivate`
- `GET /customers`, `GET /customers/:id`
- `GET /professionals`, `GET /professionals/:id`
- `GET /businesses`, `GET /businesses/:id`
- `GET /technicians`, `GET /technicians/:id`
- `GET /services/categories`, `GET /services`, `GET /services/:id`,
  `POST /services`, `PATCH /services/:id`,
  `POST /services/:id/activate`, `POST /services/:id/deactivate`
- `GET /jobs`, `GET /jobs/:id`
- `GET /verifications`, `GET /verifications/:id`,
  `GET /verifications/:id/document`, and the three decision endpoints
- `GET /certificates`, `GET /certificates/:id`,
  `GET /certificates/:id/document`, and the three decision endpoints
- `GET /reviews`, `GET /reviews/:id`
- `GET /reports`, `GET /reports/:id`,
  `PATCH /reports/:id/status`
- `GET /disputes`, `GET /disputes/:id`, `PATCH /disputes/:id`
- `GET /audit-logs`, `GET /audit-logs/:id`

List routes support the implemented search, resource-specific filters and
pagination. Unknown parameters and invalid values are rejected by the
backend with `422 VALIDATION_ERROR`.

## 9. Security and privacy

### Safe JSON projections

Admin JSON responses do not intentionally expose:

- Passwords or password hashes.
- Access or refresh tokens.
- Document references or document MIME metadata.
- Storage keys.
- Filesystem paths.
- Binary file content.
- Internal file paths or sensitive credential fields.

User responses use the safe user projection, including `lastLoginAt`.
Nested job documentation returns safe metadata only; raw image,
voice-note and parts-photo storage references, file keys, paths and bytes
are excluded. Portfolio details expose project metadata and image counts
rather than image references or binaries. Verification and certificate
responses expose review metadata but not the private document reference or
bytes.

### Protected documents

Only these two implemented document routes return binary content:

- `GET /api/v1/admin/verifications/:id/document`
- `GET /api/v1/admin/certificates/:id/document`

They require an active ADMIN and serve only the allowlisted document
MIME types with an attachment disposition and sanitized filename. The
storage key and database document reference are never returned. A
successful document read appends a document-view audit entry.

## 10. Audit behavior

The audit log is read-only through the Stage 9 API. There is no route to
create, edit or delete an audit record.

The backend records the covered administrative mutations, including user
status changes, service changes, verification decisions, certificate
decisions, report updates and dispute updates. It also records successful
verification and certificate document views.

For the covered mutation paths, the state change and audit write are
atomic. If audit persistence fails, the state change is rolled back and
the request returns the safe internal-error response. Audit log entries
therefore cannot be silently omitted for a successful covered mutation.

## 11. UI state requirements

The implemented admin screens provide:

- Loading state while a dashboard, list or detail request is in flight.
- Empty state when a resource list has no matching records.
- Error state with the server message and a retry action where the screen
  supports reload.
- Pagination with current page, total and page size.
- Filter apply and reset behavior.
- Stale-response protection for changing list requests.
- Disabled/saving states for supported actions.
- Confirmation dialogs for user status, service status, verification,
  certificate, report and dispute changes.
- Document loading and document error states.
- A terminal-state message when no further decision is available.
- A not-configured Settings state and an admin page-not-found state.

## 12. Deployment and operations notes

- Production admin access requires the normal FixLink authentication
  configuration and an explicitly granted `ADMIN` role in the
  authoritative user data.
- Suspended or deleted ADMIN accounts must not be left as operational
  accounts; the backend rejects them regardless of token claims.
- The default document storage adapter is the local MVP storage adapter.
  The configured `FILE_STORAGE_DIR` must be protected by deployment
  filesystem permissions and included in the normal backup/retention
  process for private documents.
- Do not expose the storage directory as a public web path. Admin
  documents must be delivered only through the protected backend routes.
- Monitor admin audit activity and backend errors for unauthorized access,
  document failures and audit persistence failures.
- The admin service has no migration in Stage 9 because the existing
  tables already support the implementation. Do not create duplicate admin
  tables or document tables for this surface.
- No platform settings, review moderation, job intervention, role
  management or technician-assignment deployment is included.

## 13. Stage 10 boundary

Stage 9 is complete for the documented admin/platform-operations scope.
Stage 10 is next and has not been started by this documentation update.
Any Stage 10 scope must be specified and approved before implementation;
this document does not claim settings, review moderation, job
intervention, role management, technician assignment, payment processing
or new notification contexts.
