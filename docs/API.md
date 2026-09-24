# FixLink — API Specification

## 1. API Base

All API routes use:

/api/v1


## 2. Response Format

Success:

{
  "success": true,
  "data": {},
  "message": "Success"
}

Error:

{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}


## 3. HTTP Status Codes

200 OK
201 Created
204 No Content
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
429 Too Many Requests
500 Internal Server Error


# 4. Authentication

POST /api/v1/auth/register

POST /api/v1/auth/login

POST /api/v1/auth/logout

POST /api/v1/auth/refresh

POST /api/v1/auth/forgot-password

POST /api/v1/auth/reset-password

POST /api/v1/auth/verify-email

POST /api/v1/auth/verify-phone

GET /api/v1/auth/me


## 4.1 Authentication — Stage 5A Implementation Notes

Stage 5A implements the authentication foundation only
(`backend/src/modules/auth/`). Behaviour below is implemented and tested;
`forgot-password`, `reset-password`, `verify-email` and `verify-phone` remain
specified but not yet implemented.

### Registration

POST /api/v1/auth/register

Request:

{
  "email": "user@example.co.za",
  "password": "at least 8 characters",
  "phone": "+27825550101 (optional)",
  "role": "CUSTOMER (optional, default)"
}

Rules:

- Email is required, validated for format and normalised with trim +
  lowercase before storage and uniqueness checks.
- Password is required (8–128 characters) and stored only as a bcrypt hash
  (cost 12). Plaintext passwords are never stored or returned.
- Self-registration is allowed for `CUSTOMER`, `PROFESSIONAL` and
  `BUSINESS_OWNER` only. `BUSINESS_MANAGER` and `TECHNICIAN` are provisioned
  through the business invite flow (later stage); `ADMIN` is granted
  explicitly by the platform. Other roles return `403 FORBIDDEN_ROLE`.
- Duplicate email returns `409 EMAIL_EXISTS`. Validation failures return
  `422 VALIDATION_ERROR`. Success returns `201` with the safe user
  (no password or hash fields).
- Registration creates the `users` row and the `user_roles` assignment only.
  Customer/professional/business profile creation belongs to a later stage.

### Login

POST /api/v1/auth/login

Request:

{
  "email": "user@example.co.za",
  "password": "..."
}

- Credentials are verified against the stored bcrypt hash.
- Unknown emails and wrong passwords return the same generic
  `401 INVALID_CREDENTIALS` (`"Invalid email or password."`) so accounts
  cannot be enumerated. Suspended/deleted accounts receive the same response.
- Success returns `200` with `{ user, accessToken, refreshToken }`.
  `last_login_at` is updated.

### Tokens

- Access token: signed JWT (Bearer), 15-minute expiry by default
  (`JWT_ACCESS_TTL_SECONDS`). Claims: `sub` (user id), `email`, `roles`.
- Refresh token: opaque random value (hex), 30-day expiry by default
  (`REFRESH_TOKEN_TTL_SECONDS`). Only its SHA-256 hash is stored
  server-side — never the raw token.
- Refresh sessions are kept in a server-side in-memory store in Stage 5A,
  so no database schema change was required. Known limitation: sessions do
  not survive restarts and are per-process. A persistent `refresh_tokens`
  table is the planned hardening for multi-instance production use.

### Refresh

POST /api/v1/auth/refresh

Request:

{
  "refreshToken": "..."
}

- Valid tokens are rotated: the presented token is revoked and a new token
  pair is returned (`200`). Replaying an old token returns
  `401 INVALID_REFRESH_TOKEN`.

### Logout

POST /api/v1/auth/logout

Request:

{
  "refreshToken": "... (optional if an access token is supplied)"
}

- Revokes the supplied refresh session; when called with a valid Bearer
  access token it additionally revokes all sessions for that user.
- Idempotent for unknown tokens (still `200`); with neither credential it
  returns `401 UNAUTHORIZED`. A logged-out refresh token can no longer be
  used (`401 INVALID_REFRESH_TOKEN`).

### Current user

GET /api/v1/auth/me (requires `Authorization: Bearer <accessToken>`)

- Returns `200` with the safe user (`id`, `email`, `phone`, `status`,
  `roles`, timestamps). Missing, invalid or expired tokens return
  `401 UNAUTHORIZED`. Suspended/deleted accounts are rejected.


# 5. Users

GET /api/v1/users/me

PATCH /api/v1/users/me

PATCH /api/v1/users/me/password

POST /api/v1/users/me/profile-photo


# 6. Services

GET /api/v1/services

GET /api/v1/services/:id

GET /api/v1/categories

GET /api/v1/categories/:id


## 6.1 Services — Stage 6A Implementation Notes

Stage 6A implements the public catalogue read endpoints
(`backend/src/modules/marketplace/`). All are public (no authentication)
and return active catalogue rows only.

- `GET /api/v1/services` → `200 { items: Service[], total }`. Each service
  carries its category (`categoryId`, `categoryName`, `categorySlug`).
- `GET /api/v1/services/:id` → `200` service, `400 VALIDATION_ERROR` for a
  malformed id, `404 NOT_FOUND` for an unknown id.
- `GET /api/v1/categories` → `200 { items: Category[], total }`.
- `GET /api/v1/categories/:id` → `200` / `400` / `404` as above.
- Compatibility alias: `GET /api/v1/services/categories` serves the same
  category list as `GET /api/v1/categories`.


# 7. Professionals

GET /api/v1/providers

GET /api/v1/providers/:id

GET /api/v1/providers/:id/portfolio

GET /api/v1/providers/:id/reviews

GET /api/v1/providers/:id/certificates

GET /api/v1/providers/me

PATCH /api/v1/providers/me

GET /api/v1/providers/me/jobs

GET /api/v1/providers/me/requests


## 7.1 Marketplace discovery — Stage 6A Implementation Notes

Stage 6A implements the public discovery endpoints only
(`backend/src/modules/marketplace/`). Authenticated `providers/me` routes
belong to a later stage. All discovery endpoints are public (no
authentication) and enforce visibility server-side.

### Provider ids

Marketplace ids are opaque strings: `professional-<id>` or
`business-<id>` (e.g. `professional-1`, `business-3`). Technicians never
appear as marketplace providers. Malformed ids return
`400 VALIDATION_ERROR`; unknown providers return `404 NOT_FOUND`.

### Search

`GET /api/v1/providers` supports (all optional, combined with AND):

- `service` — service id, slug or name fragment (e.g. `leak-repair`)
- `category` — category id, slug or name fragment (e.g. `electrical`)
- `location` — suburb/city/province fragment matched against service
  areas and business city (e.g. `Fourways`)
- `providerType` — `professional` (alias `individual`) or `business`
- `verified` — `true` restricts to backend-confirmed VERIFIED providers
- `q` — free-text match across provider name, bio and service names
- `page` (1–1000, default 1), `pageSize` (1–50, default 20)

Response: `200 { items: ProviderCard[], total, page, pageSize }`,
sorted by rating then review count. Unknown query parameters and
out-of-range values return `422 VALIDATION_ERROR`. LIKE wildcards in
input are escaped so they match literally.

### Profiles and sub-resources

- `GET /api/v1/providers/:id` → `200` public profile (trust info,
  services, service areas, counts).
- `GET /api/v1/providers/:id/portfolio` → `200 { items, total }` —
  published projects only, with Before/After/General image metadata
  (file references only, never binaries).
- `GET /api/v1/providers/:id/certificates` → `200 { items, total }` —
  APPROVED certificates only (title, organisation, dates). Certificate
  `document_reference` values are never selected or returned.
- `GET /api/v1/providers/:id/reviews?page=&pageSize=` → `200` paginated
  visible reviews with reviewer display names only (first name + last
  initial, e.g. `Aisha P.`); no customer contact details.

Only active, non-deleted providers are ever returned. No passwords,
tokens, ID documents, verification files, customer contact details,
internal notes or audit data are exposed by any marketplace endpoint.


# 8. Businesses

GET /api/v1/businesses/:id

GET /api/v1/businesses/me

PATCH /api/v1/businesses/me

GET /api/v1/businesses/me/jobs

GET /api/v1/businesses/me/customers

GET /api/v1/businesses/me/team

POST /api/v1/businesses/me/team/invite

PATCH /api/v1/businesses/me/team/:id

DELETE /api/v1/businesses/me/team/:id


## 8.1 Businesses — Stage 7A Implementation Notes

Stage 7A implements the business foundation and technician roster
(`backend/src/modules/business/`). The implemented paths are:

- `GET /api/v1/business/me` → `200` own business profile
- `PATCH /api/v1/business/me` → `200` updated profile (owner only)
- `GET /api/v1/business/technicians` → `200 { items, total }` roster
- `POST /api/v1/business/technicians` → `201` invited technician
- `GET /api/v1/business/technicians/:technicianId` → `200` roster row
- `PATCH /api/v1/business/technicians/:technicianId` → `200` updated row

(The `/businesses/me…` paths sketched in §8 pre-date implementation
and are reconciled in a later stage; Stage 7A owns `/business/…`.)

- The business is derived server-side from the authenticated user's
  membership (`business_profiles.owner_user_id` / active
  `business_members` rows). No `business_id`, `owner_id`, `role` or
  business association is read from the request — spoofed fields are
  ignored.
- `GET /business/me` (requires `BUSINESS_OWNER` / `BUSINESS_MANAGER`)
  returns the profile with the caller's membership `role`
  (`OWNER`/`MANAGER`) and the real `technicianCount`. Only public/
  business fields are exposed (name, slug, description, logo
  reference metadata, email, phone, address/city/province/postal,
  verification status, rating, active flag, timestamps) — never
  `owner_user_id`, verification documents, internal notes or audit
  data. No `BUSINESS_OWNER`/`BUSINESS_MANAGER` business → `404
  NOT_FOUND`; `CUSTOMER` / `PROFESSIONAL` / `TECHNICIAN`-only /
  `ADMIN` actors → `403 FORBIDDEN_ROLE`; unauthenticated → `401`.
- `PATCH /business/me` accepts `businessName` (1–255),
  `description` (≤2000), `email`, `phone`, `addressLine1`, `city`,
  `province`, `postalCode` (snake_case aliases accepted); unknown
  fields are ignored per existing validation conventions and an
  empty patch → `422`. Only `OWNER` may edit (`MANAGER` → `403`).
- `POST /business/technicians` (`BUSINESS_OWNER`/`BUSINESS_MANAGER`)
  accepts `{ displayName (1–255, `name` alias), email,
  phone? (optional), password? }`. A new email creates an `ACTIVE`
  `TECHNICIAN` login (bcrypt hash — never plaintext) plus the
  `business_members` (`TECHNICIAN`) and `technicians` rows; an
  existing account is linked (gaining the `TECHNICIAN` role) without
  touching its password — a `password` alongside an existing email
  is rejected (`422`), and a missing password for a new email is
  rejected (`422`). An account already actively linked to the
  business (owner, manager or technician) → `409 CONFLICT` — rows
  are never double-linked. Technicians never gain a marketplace
  provider profile here.
- `GET /business/technicians/:technicianId` returns the row with
  contact info (email/phone from `users` — never credentials) for
  the owner's/manager's own business; another business's id reads
  as `404 NOT_FOUND`, never `403`. A `TECHNICIAN` caller reads only
  their own row (via the user association); any other id reads as
  `404`. Malformed ids → `400 VALIDATION_ERROR`.
- `PATCH /business/technicians/:technicianId` (`OWNER`/`MANAGER`
  only — technicians receive `403`, including for their own row)
  accepts `{ displayName?, isActive? }` (≥1 required). The active
  flag is kept in sync across `technicians.is_active` and
  `business_members.is_active`, so deactivation immediately revokes
  business access. Another business's id → `404`.
- No new tables or columns were created — the existing
  `business_profiles`, `business_members`, `technicians` and
  `users` tables already support this stage. Business
  creation/onboarding (a `BUSINESS_OWNER` with no business reads
  `404`) belongs to a later stage.

MVP payment position (unchanged): business and technician
management never charge anyone; agreed quote amounts remain
recorded prices paid directly outside the platform.


## 8.2 Businesses — Stage 7B Implementation Notes (Business Customers + Internal Jobs)

Stage 7B implements business-managed customers and internal jobs
(`backend/src/modules/business/`, `GET|POST /api/v1/business/customers`,
`GET|PATCH /api/v1/business/customers/:customerId`,
`GET|POST /api/v1/business/jobs`,
`GET|PATCH /api/v1/business/jobs/:jobId`,
`POST /api/v1/business/jobs/:jobId/cancel`,
`GET /api/v1/business/jobs-summary`).

- Business customers reuse `customer_profiles` with `user_id = NULL`
  and `business_id` set (migration 003) — no `business_customers`
  table was created. `POST /business/customers`
  (`BUSINESS_OWNER`/`BUSINESS_MANAGER`) accepts `{ firstName (1–128,
  `first_name` alias), lastName (1–128, `last_name` alias), email?,
  phone?, preferredContact? (EMAIL/PHONE/WHATSAPP) }`; a free-text
  `name` is split server-side when first/last names are omitted.
  `PATCH /business/customers/:customerId` accepts the same fields
  (≥1 required; explicit `null`/empty clears email/phone/contact).
  Customers are private: listing is scoped to the caller's business
  (creation order, `page`/`pageSize`, optional `search` over
  name/email/phone) and another business's customer reads as `404
  NOT_FOUND`, never `403`. Malformed ids → `400`.
- Internal jobs reuse the ONE shared `jobs` table with
  `source = INTERNAL` — no `business_jobs` / `internal_jobs` /
  `business_job_assignments` tables were created. `POST
  /business/jobs` (`BUSINESS_OWNER`/`BUSINESS_MANAGER`) accepts
  `{ customerId, serviceId, title?, description (20–2000), address
  (`addressLine1`/`address`/`location` aliases, 1–255), city?,
  province?, postalCode?, priority? (LOW/NORMAL/HIGH/URGENT,
  default NORMAL), scheduledAt? (ISO) or preferredDate
  (`YYYY-MM-DD`) + preferredTime (`HH:MM`) }` and always creates
  `source = INTERNAL`, `status = REQUESTED` with the initial
  `job_status_history` entry (`NULL → REQUESTED`, reason `Internal
  job created by business`). The customer must belong to the
  caller's business (foreign/unknown → `404`); the service must be
  an active catalogue service (unknown → `404`); malformed
  customer/service ids → `400`. `business_id`, `source`, `status`
  and `reference` in the body are never honoured.
- `GET /business/jobs?status=&search=&page=&pageSize=` returns the
  caller's INTERNAL jobs only (newest first) — marketplace rows
  never appear here. `status` must be a valid lifecycle value
  (`422` otherwise); `search` matches reference/description/title/
  customer name/service name. `GET /business/jobs/:jobId` returns
  `{ job (with embedded customer/service/business summaries),
  timeline }` (status history, oldest first). Another business's
  job — or any marketplace job — reads as `404`.
- Status stays server-controlled: `PATCH /business/jobs/:jobId`
  accepts only field edits (title/description/address/city/
  province/postalCode/priority/scheduledAt, ≥1 required) on
  `REQUESTED` jobs — a `status` key of any kind returns `422
  VALIDATION_ERROR`, as do edits to non-REQUESTED jobs. `POST
  /business/jobs/:jobId/cancel` (optional `{ reason }` ≤500)
  performs the guarded `REQUESTED → CANCELLED` transition with its
  history entry (`200`); cancelling a non-REQUESTED job returns
  `422`. No technician assignment, execution, parts or approval
  transitions exist in this stage.
- `GET /api/v1/business/jobs-summary` returns real INTERNAL counts
  for the dashboard: `{ total, requested, scheduled, inProgress,
  completed, cancelled }` (zero when there is no data).
- Roles: `BUSINESS_OWNER` and `BUSINESS_MANAGER` share the full
  Stage 7B surface. `TECHNICIAN`-only, `CUSTOMER`, `PROFESSIONAL`
  and `ADMIN` actors receive `403 FORBIDDEN_ROLE`;
  unauthenticated → `401 UNAUTHORIZED`.
- No migration was required — `customer_profiles.business_id`,
  `jobs.business_id`/`source`/`status`/`priority`/`scheduled_at`
  and `job_status_history` already support this stage.

## 8.3 Businesses — Stage 7C Implementation Notes (Technician Assignment + My Jobs)

Stage 7C connects internal jobs to technicians
(`backend/src/modules/business/` — same router,
`POST /api/v1/business/jobs/:jobId/assign`,
`PATCH /api/v1/business/jobs/:jobId/assignment` (alias),
`GET /api/v1/business/jobs/:jobId/assignment`,
`GET /api/v1/technician/jobs`,
`GET /api/v1/technician/jobs/:jobId`).

- Assignments reuse the existing `job_assignments` table with
  `assignment_type = TECHNICIAN` (migration 004) — no
  `technician_jobs` table was created. The active assignment is the
  row with `unassigned_at IS NULL`; reassignment closes the previous
  row and inserts a new one atomically, preserving full history.
  Assignment never changes job `status` — there is no ASSIGNED
  lifecycle value, and no `job_status_history` entry is written for
  assignment.
- `POST /business/jobs/:jobId/assign`
  (`BUSINESS_OWNER`/`BUSINESS_MANAGER`) accepts `{ technicianId }`
  (also `technician_id`) and returns the active assignment `200`
  with the embedded technician summary (id/displayName/email/phone/
  isActive). The job must be INTERNAL and owned by the caller's
  business (foreign/unknown/marketplace → `404`); the technician
  must be an active roster row in the same business (foreign →
  `404`, inactive → `422 VALIDATION_ERROR`); malformed ids → `400`.
  `business_id` and `status` are never honoured. `PATCH
  /business/jobs/:jobId/assignment` behaves identically (reassign).
- `GET /business/jobs/:jobId/assignment` returns
  `{ jobId, assignment (active or null), history (newest first) }`
  for the caller's INTERNAL jobs (`404` for foreign/marketplace).
- `GET /api/v1/technician/jobs?status=&page=&pageSize=` (TECHNICIAN
  only) returns INTERNAL jobs with an active assignment to the
  caller (newest first, `status` must be a lifecycle value).
  `GET /api/v1/technician/jobs/:jobId` returns
  `{ job, timeline }` for assigned jobs only (`404` otherwise —
  URL probing cannot reach other technicians' or other businesses'
  jobs). The technician identity is derived server-side from the
  session user; a technician id is never accepted. Managers,
  customers, professionals and admins receive `403 FORBIDDEN_ROLE`
  on the technician surface (and vice versa on the assignment
  surface); unauthenticated → `401`.
- No migration was required — `job_assignments` (TECHNICIAN type,
  `unassigned_at` history) already supports this stage.

## 8.4 Businesses — Stage 7D Implementation Notes (Technician Execution + Voice Notes)

Stage 7D lets the assigned technician execute and document an
internal job (`backend/src/modules/business/` — same router, plus
`backend/src/services/file-storage.ts` voice support and migration
010). It reuses the ONE shared architecture — `jobs`
(`source = INTERNAL`), `job_images` (phase BEFORE/DURING/AFTER),
`job_updates` (phase + message), `job_voice_notes` (file reference
+ metadata) and `job_status_history` — so no technician-specific
copies of job tables exist. The technician identity is derived
server-side from the session user (membership + active technician
row); a technician id is never accepted.

- `POST /api/v1/technician/jobs/:jobId/start` (TECHNICIAN only)
  moves an assigned job REQUESTED/SCHEDULED → IN_PROGRESS
  atomically with a `Technician started job` history entry.
  Unassigned, cross-business or marketplace jobs → `404`; a job
  in any other state → `422`; managers, customers,
  professionals and admins → `403`; unauthenticated → `401`.
- `POST /api/v1/technician/jobs/:jobId/images` (multipart field
  `image` + `phase`, IN_PROGRESS only) stores JPEG/PNG/WebP
  (5MB max, magic-byte sniffed, sanitized name, opaque
  `job-images/<jobId>/<hex>.<ext>` key) and returns metadata
  only. `GET .../images` lists metadata; `GET
  .../images/:imageId/file` streams bytes (`Content-Type` from
  storage, `inline`, `private` cache); `DELETE
  .../images/:imageId` is uploader-only while IN_PROGRESS
  (foreign uploader → `403`, otherwise `404`/`422`).
- `POST /api/v1/technician/jobs/:jobId/updates` saves a
  BEFORE/DURING/AFTER note (required, ≤2000 chars, IN_PROGRESS
  only); `GET .../updates` lists them.
- `POST /api/v1/technician/jobs/:jobId/voice-notes`
  (multipart field `audio` + optional `duration` seconds,
  IN_PROGRESS only) stores WebM/MP4/MP3/WAV/Ogg (10MB max,
  container-signature sniffed, duration 0–36000s, opaque
  `job-voice-notes/<jobId>/<hex>.<ext>` key via
  `FileStorage.saveVoiceNote`) and returns `{ id, jobId,
  authorId, originalFilename, mimeType, size, durationSeconds,
  createdAt }`. `GET .../voice-notes` lists metadata; `GET
  .../voice-notes/:voiceNoteId/file` streams bytes (same cache/
  disposition rules as photos). Voice binaries never sit in
  MySQL and are never served from a public URL.
- `GET /api/v1/technician/jobs/:jobId/timeline` returns
  `{ job, events }` (status + assignment + update + image +
  voice, oldest first). `POST
  /api/v1/technician/jobs/:jobId/complete` requires a completion
  note (≤2000 chars) stored as the AFTER update and moves
  IN_PROGRESS → COMPLETED atomically (`Technician completed
  job` history entry); afterwards the job is read-only for the
  technician. Every unassigned/cross-business access on this
  surface reads as `404 NOT_FOUND` (never `403`), so job ids
  cannot be probed.
- Read-only business visibility (BUSINESS_OWNER/
  BUSINESS_MANAGER, owned INTERNAL jobs only, foreign → `404`):
  `GET /api/v1/business/jobs/:jobId/images` (+
  `.../images/:imageId/file`), `GET .../updates`, `GET
  .../voice-notes` (+ `.../voice-notes/:voiceNoteId/file`),
  `GET .../timeline`. No technician-only capability is exposed
  here (no start/upload/complete for managers).
- Marketplace execution is untouched: the provider/customer
  endpoints, guards and stores are unchanged, and internal jobs
  never appear on the marketplace surface (and vice versa).
- Migration 010 adds the nullable
  `job_voice_notes.original_filename` column (mirroring
  migration 009 for images) — no new tables.

## 8.5 Businesses — Stage 7E Implementation Notes (Technician Parts Requests)

Stage 7E lets the assigned technician request parts/materials for an
internal job (`backend/src/modules/business/` — same router, new
`business-parts.validation.ts`, extended `business.store.ts` /
memory + MySQL implementations). It reuses the existing
`parts_requests` / `parts_request_items` tables (migration 006) on
the ONE shared job engine — no new tables, no migration. A request
is a header (`reason`, always `PENDING` on creation) with exactly
one item in this stage (`part_name`, `quantity`, optional `notes`,
optional photo evidence); multi-item requests are a documented
future extension the schema already supports. The
`parts_requests` table carries no business column — business
scoping joins `jobs.business_id` server-side — and the requesting
technician resolves from `requester_id` via the business roster.

- `POST /api/v1/technician/jobs/:jobId/parts` (TECHNICIAN only)
  accepts JSON (`{ partName, quantity, reason, notes? }`) or
  multipart FormData (same fields + optional `photo` evidence
  file). Validation: part name required (≤255 chars), quantity a
  whole number 1–10000, reason required (10–1000 chars), notes
  optional (≤500 chars). The job must be INTERNAL, assigned to the
  caller and IN_PROGRESS or AWAITING_PARTS (REQUESTED/SCHEDULED/
  CANCELLED/COMPLETED/… → `422 VALIDATION_ERROR`); unassigned,
  cross-business or marketplace jobs → `404`. The photo reuses the
  shared FileStorage image pipeline (JPEG/PNG/WebP, 5MB max,
  magic-byte sniffed, opaque key in
  `parts_request_items.photo_reference` with `photo_mime` /
  `photo_size` metadata, bytes never in MySQL). Returns `201`
  `{ id, jobId, businessId, requestedBy { technicianId,
  displayName }, status: 'PENDING', reason, createdAt, updatedAt,
  items: [{ id, partName, quantity, notes, hasPhoto, photoMime,
  createdAt }] }` — storage keys are never exposed. Creating a
  request never changes job `status` (no AWAITING_PARTS move and no
  `job_status_history` write); that transition waits for the Stage
  7F manager-approval workflow.
- `GET /api/v1/technician/jobs/:jobId/parts` lists the caller's
  requests for the assigned job (oldest first, `{ items, total
  }`); `GET .../parts/:requestId` reads one (off-job → `404`);
  `GET .../parts/:requestId/photo/file` streams the evidence
  photo (`Content-Type` from storage, `inline`, `private` cache;
  `404` when the request carries no photo). Malformed ids →
  `400`.
- Read-only business visibility (BUSINESS_OWNER/
  BUSINESS_MANAGER, owned INTERNAL jobs only, foreign → `404`):
  `GET /api/v1/business/jobs/:jobId/parts` (+
  `.../parts/:requestId`, `.../parts/:requestId/photo/file`).
  No approve/reject/needs-info capability is exposed here — that
  arrives in Stage 7F (`job_approvals` table and the
  IN_PROGRESS → AWAITING_PARTS transition are intentionally
  untouched).
- Both execution timelines (`GET .../technician/jobs/:jobId/
  timeline`, `GET .../business/jobs/:jobId/timeline`) now include
  `parts` events (`{ kind: 'parts', partsRequestId, partName,
  quantity, partsStatus, reason }`, oldest first). Inclusion is
  read-time — no history row is written when a request is created.
- Status vocabulary reuses the table ENUM (PENDING, APPROVED,
  REJECTED, NEEDS_INFO, CANCELLED). Stage 7E only ever creates
  PENDING rows; there is deliberately no estimated-cost field
  (migration 006 has no cost column — cost is a Stage 7F+
  consideration).
- Role matrix: managers/owners/customers/professionals →
  `403 FORBIDDEN_ROLE` on the technician submission surface (and
  vice versa on the business surface); unauthenticated → `401`.

MVP payment position (unchanged): internal jobs never charge
anyone; agreed amounts remain recorded prices paid directly
outside the platform.


# 9. Technicians

GET /api/v1/technicians/me

GET /api/v1/technicians/me/jobs

GET /api/v1/technicians/me/jobs/:id

PATCH /api/v1/technicians/me/jobs/:id/status

POST /api/v1/technicians/me/jobs/:id/parts

GET /api/v1/technicians/me/parts


# 10. Jobs

POST /api/v1/jobs

GET /api/v1/jobs

GET /api/v1/jobs/:id

PATCH /api/v1/jobs/:id

POST /api/v1/jobs/:id/cancel

POST /api/v1/jobs/:id/confirm

PATCH /api/v1/jobs/:id/status

POST /api/v1/jobs/:id/updates

POST /api/v1/jobs/:id/complete


## 10.1 Jobs — Stage 6B Implementation Notes

Stage 6B implements customer job-request creation and retrieval only
(`backend/src/modules/jobs/`). Status changes, quotes, assignment,
execution, messaging, reviews and payment belong to later stages.

- `POST /api/v1/jobs` (requires `Authorization: Bearer <accessToken>`,
  `CUSTOMER` role) creates a job in the ONE shared `jobs` table with
  `source = MARKETPLACE` and `status = REQUESTED` → `201` with the job.
  Request: `{ providerId, serviceId, description, location,
  preferredDate? (YYYY-MM-DD), preferredTime? (HH:MM 24h), notes? }`.
  The customer is derived from the session — any `customer_id`,
  `status`, `source` or timestamp in the body is ignored. The initial
  `job_status_history` entry (`NULL → REQUESTED`) and the provider
  `job_assignments` row are written in the same operation. The free-text
  `location` is stored in `jobs.address_line1` (no separate suburb
  column exists); `preferredDate`/`preferredTime` combine into
  `jobs.scheduled_at` (09:00 default when no time is given). Optional
  `notes` are validated but not persisted — file/photo infrastructure
  arrives in a later stage.
- Customer profiles are auto-provisioned on first request (Stage 5A
  registration creates `users` + `user_roles` only).
- Validation: malformed provider/service ids → `400 VALIDATION_ERROR`;
  unknown provider or service → `404 NOT_FOUND`; provider does not offer
  the service → `422 VALIDATION_ERROR`; description/location/date/time
  problems → `422 VALIDATION_ERROR`. Non-customer roles → `403
  FORBIDDEN_ROLE`; missing/invalid tokens → `401 UNAUTHORIZED`.
- `GET /api/v1/jobs?page=&pageSize=` → `200` paginated owned jobs
  (newest first). `GET /api/v1/jobs/:id` → `200` owned job, `400` for a
  malformed id. Another customer's job reads as `404 NOT_FOUND` (no
  cross-account probing). Non-customer roles → `403`.


## 10.2 Jobs — Stage 6C Implementation Notes

Stage 6C embeds the job's quotes in the owning customer's detail
response: `GET /api/v1/jobs/:id` returns the job with a `quotes` array
(`[]` when none). Quote submission itself lives in the quotes module
(§13.1). No new job tables were created.


## 10.3 Jobs — Stage 6D Implementation Notes

Stage 6D surfaces the recorded agreed price on the job: `GET
/api/v1/jobs` / `GET /api/v1/jobs/:id` now include `agreedAmount`
(`jobs.agreed_amount`, `null` until acceptance) and `currency`
(`jobs.currency`, MVP: `ZAR`). Both are written by the acceptance
transaction (§13.2) — never by the client. No new job tables or
columns were created.


## 10.4 Jobs — Stage 6E Implementation Notes (Scheduling & Start)
Stage 6E implements provider scheduling and start
(`backend/src/modules/quotes/` — the provider-identity service, plus
`schedule.validation.ts`): the transitions

ACCEPTED → SCHEDULED → IN_PROGRESS

performed entirely server-side. The frontend never sends a status.

- `POST /api/v1/jobs/:jobId/schedule` (requires
  `Authorization: Bearer <accessToken>`, `PROFESSIONAL` /
  `BUSINESS_OWNER` / `BUSINESS_MANAGER` roles) schedules an `ACCEPTED`
  `MARKETPLACE` job addressed to the authenticated provider/business.
  Request: `{ "scheduledAt": "2026-10-05T10:00:00+02:00" }` (ISO
  date/time; the `scheduled_at`/`scheduledAt` alias is also read).
  `scheduledAt` is required, must parse to a valid calendar date/time
  (impossible dates such as `2026-02-30` are rejected) and must be in
  the future — missing, malformed or past values return `422
  VALIDATION_ERROR`. The instant is normalized to UTC ISO and stored
  in `jobs.scheduled_at`, so the wall time the provider picked
  (e.g. 10:00 SAST) is the instant every consumer reads — no silent
  timezone shift.
- On success (`200` with `{ job }`, message `Job scheduled
  successfully`): the job becomes `SCHEDULED` and a
  `job_status_history` entry (`ACCEPTED → SCHEDULED`, reason
  `Provider scheduled job`) is written — atomically, in a single
  transaction (a failure leaves the job `ACCEPTED` with no history
  entry). The accepted quote is required: scheduling without an
  `ACCEPTED` quote returns `422`.
- `POST /api/v1/jobs/:jobId/start` (same provider roles, empty body)
  starts a `SCHEDULED` job addressed to the authenticated
  provider/business. On success (`200` with `{ job }`, message `Job
  started successfully`): the job becomes `IN_PROGRESS` with a
  `job_status_history` entry (`SCHEDULED → IN_PROGRESS`, reason
  `Provider started job`), atomically.
- State is enforced server-side: scheduling a `REQUESTED`/`QUOTED`
  job, starting an `ACCEPTED` job, re-starting an `IN_PROGRESS` job,
  or jumping straight to `COMPLETED` all return `422
  VALIDATION_ERROR`. The frontend never sends a status.
- Errors: malformed job ids → `400 VALIDATION_ERROR`; unknown jobs,
  another provider's jobs and `INTERNAL` jobs → `404 NOT_FOUND` (no
  cross-provider probing); `CUSTOMER`, `TECHNICIAN`-only and `ADMIN`
  actors → `403 FORBIDDEN_ROLE`; unauthenticated → `401
  UNAUTHORIZED`.
- No new tables or columns were created — the existing `jobs.status`
  ENUM, `jobs.scheduled_at` and `job_status_history` rows are reused.

MVP payment position (unchanged): scheduling and starting never
charge the customer; the agreed quote remains the recorded price the
customer pays the professional directly outside the platform.


## 10.5 Jobs — Stage 6F Implementation Notes (Execution & Completion)

Stage 6F implements work documentation, completion and confirmation
(`backend/src/modules/execution/` + `backend/src/services/file-storage.ts`):
the transitions

IN_PROGRESS → COMPLETED → CONFIRMED → CLOSED

performed entirely server-side. The frontend never sends a status.

- `POST /api/v1/jobs/:jobId/images` (requires
  `Authorization: Bearer <accessToken>`, `PROFESSIONAL` /
  `BUSINESS_OWNER` / `BUSINESS_MANAGER` roles) uploads one
  BEFORE/DURING/AFTER photo for an `IN_PROGRESS` `MARKETPLACE` job
  addressed to the authenticated provider/business. Multipart body:
  `image` file field + `phase` text field (`BEFORE` | `DURING` |
  `AFTER`). Only `image/jpeg`, `image/png` and `image/webp` are
  accepted (5MB max); the stored type is sniffed from magic bytes, so
  spoofed extensions/MIMEs are rejected. Filenames are generated
  server-side (`job-images/<jobId>/<randomHex>.<ext>`); the original
  name is stored sanitized in `job_images.original_filename` and never
  used for paths. Success → `201` with the image metadata (no binary,
  no path, no storage key).
- `GET /api/v1/jobs/:jobId/images` → `200 { items, total }` for the
  owning customer or the addressed provider (others → `404`; file
  bytes are never embedded).
- `GET /api/v1/jobs/:jobId/images/:imageId/file` streams the stored
  bytes with the recorded MIME type under the same authorization
  (foreign/unknown jobs → `404`, unauthenticated → `401`).
- `DELETE /api/v1/jobs/:jobId/images/:imageId` → `200
  { deleted: true }`: the uploader may delete their own photo while
  the job is `IN_PROGRESS` (another user's photo → `403`, completed
  or closed job → `422`).
- `POST /api/v1/jobs/:jobId/updates` (same provider roles) saves a
  progress note: `{ "phase": "BEFORE" | "DURING" | "AFTER",
  "note": "1–2000 chars" }` → `201` with the update (stored in
  `job_updates` with `phase`). Only `IN_PROGRESS` jobs accept notes.
- `GET /api/v1/jobs/:jobId/updates` → `200 { items, total }` for the
  owning customer or the addressed provider.
- `GET /api/v1/jobs/:jobId/timeline` → `200 { job, events }` for the
  owning customer or the addressed provider: status transitions from
  `job_status_history` plus updates and photo events, oldest first.
  Actors are role labels (`customer`/`provider`) only — no contact
  details.
- `POST /api/v1/jobs/:jobId/complete` (same provider roles, body
  `{ "note": "required completion note, 1–2000 chars" }`) completes an
  `IN_PROGRESS` job. On success (`200` with `{ job, update }`,
  message `Job completed successfully`): the note is stored as the
  AFTER record, the job becomes `COMPLETED` (`jobs.completed_at`
  recorded) and a `job_status_history` entry (`IN_PROGRESS →
  COMPLETED`, reason `Provider completed job`) is written —
  atomically (a failure leaves the job `IN_PROGRESS`).
- `POST /api/v1/jobs/:jobId/confirm` (requires `CUSTOMER` role, empty
  body) confirms a `COMPLETED` job owned by the authenticated
  customer. On success (`200` with `{ job }`, message `Job confirmed
  successfully`): the backend records `COMPLETED → CONFIRMED`
  (`Customer confirmed job`) and `CONFIRMED → CLOSED` (`Job closed
  after customer confirmation`) in one transaction
  (`jobs.confirmed_at`/`closed_at` recorded) and returns the final
  `CLOSED` job — the customer confirms once, never twice.
- State is enforced server-side: `SCHEDULED`/`ACCEPTED` jobs cannot
  be completed, `IN_PROGRESS` jobs cannot be confirmed, `COMPLETED`
  jobs cannot be restarted, and `CLOSED` jobs reject every
  modification (`422 VALIDATION_ERROR`). The frontend never sends a
  status.
- Errors: malformed job/image ids → `400 VALIDATION_ERROR`; unknown
  jobs, another provider's or another customer's jobs and `INTERNAL`
  jobs → `404 NOT_FOUND` (no cross-account probing); `CUSTOMER`
  actors on provider endpoints, `TECHNICIAN`-only actors on
  marketplace execution and providers on confirmation → `403
  FORBIDDEN_ROLE`; unauthenticated → `401 UNAUTHORIZED`.
- No new tables were created — the existing `jobs.status` ENUM,
  `jobs.completed_at`/`confirmed_at`/`closed_at`, `job_images`,
  `job_updates` (plus migration 009's nullable `phase` /
  `original_filename` columns) and `job_status_history` rows are
  reused. File bytes live in the local MVP storage dir
  (`backend/uploads`, overridable via `FILE_STORAGE_DIR`); MySQL
  stores metadata only.

MVP payment position (unchanged): completion and confirmation never
charge the customer; the agreed quote remains the recorded price the
customer pays the professional directly outside the platform.


# 11. Job Requests

GET /api/v1/jobs/requests

POST /api/v1/jobs/:id/request


# 12. Business Jobs

POST /api/v1/business/jobs

GET /api/v1/business/jobs

GET /api/v1/business/jobs/:id

POST /api/v1/business/jobs/:id/assign

POST /api/v1/business/jobs/:id/reassign

PATCH /api/v1/business/jobs/:id/status

POST /api/v1/business/jobs/:id/close


# 13. Quotes

POST /api/v1/jobs/:id/quotes

GET /api/v1/jobs/:id/quotes

GET /api/v1/quotes/:id

PATCH /api/v1/quotes/:id

POST /api/v1/quotes/:id/accept

POST /api/v1/quotes/:id/decline

POST /api/v1/quotes/:id/withdraw


## 13.1 Quotes — Stage 6C Implementation Notes

Stage 6C implements provider quote submission and retrieval only
(`backend/src/modules/quotes/`). Acceptance, decline, withdrawal and
quote editing belong to a later stage.

Provider requests (inbox):

- `GET /api/v1/provider/requests?page=&pageSize=&status=` (requires
  `Authorization: Bearer <accessToken>`, `PROFESSIONAL` /
  `BUSINESS_OWNER` / `BUSINESS_MANAGER` roles) returns marketplace jobs
  addressed to the authenticated provider/business, newest first.
  `status` optionally filters to `REQUESTED`, `QUOTED`, `ACCEPTED`,
  `SCHEDULED` and/or `IN_PROGRESS` (comma separated; default all five
  — Stages 6C–6E; terminal states such as `COMPLETED` are never inbox
  states); anything else → `422 VALIDATION_ERROR`.
  `CUSTOMER`, `TECHNICIAN` and role-less accounts → `403
  FORBIDDEN_ROLE`.
- `GET /api/v1/provider/requests/:id` returns one addressed request
  with privacy-limited customer display info (`customer.displayName`,
  e.g. `Thandi K.` — no email/phone) plus its quotes. Another
  provider's request reads as `404 NOT_FOUND` (no cross-provider
  probing); malformed ids → `400`.
- Provider identity is derived server-side: the professional profile
  owned via `professional_profiles.user_id`, or businesses owned via
  `business_profiles.owner_user_id` / active `business_members` rows
  (`BUSINESS_OWNER`/`BUSINESS_MANAGER`; `TECHNICIAN` members are never
  marketplace providers). A provider-role user with no linked profile
  sees an empty inbox (`200`, not an error).

Quote submission:

- `POST /api/v1/jobs/:id/quotes` (same provider roles) accepts
  `{ total (≥ 0), currency? (default ZAR), message?, items? }` where
  each item carries `{ description (1–255), quantity (> 0), unitPrice
  (≥ 0) }`. Item totals are derived by the database, never trusted
  from the client.
- On success the quote is stored with `status = SUBMITTED` and the job
  transitions `REQUESTED → QUOTED` with a `job_status_history` entry,
  atomically (single transaction; the status update is guarded so a
  failed creation can never leave the job `QUOTED`).
- Errors: malformed job id → `400`; unknown/unaddressed job → `404`;
  invalid amounts/items/message → `422`; second active quote from the
  same provider → `409 CONFLICT` (existing quotes are never silently
  overwritten); wrong role → `403`.
- Success → `201` with the quote. The frontend must never send
  `status = QUOTED` — the backend performs the transition.

Quote retrieval:

- `GET /api/v1/jobs/:id/quotes` → `200 { items, total }` for the
  owning customer or the addressed provider (others → `404`).
- `GET /api/v1/quotes/:id` → `200` quote under the same authorization.

MVP payment position (unchanged): FixLink does not process customer
payment. Quote submission does not charge the customer; the customer
pays the professional directly outside the platform. Quote acceptance
is NOT part of Stage 6C.


## 13.2 Quotes — Stage 6D Implementation Notes (Customer Acceptance)

Stage 6D implements customer quote acceptance
(`backend/src/modules/quotes/`): the transition

REQUESTED → QUOTED → ACCEPTED

with the acceptance performed entirely server-side. The frontend never
sends `status = ACCEPTED`.

- `POST /api/v1/jobs/:jobId/quotes/:quoteId/accept` (requires
  `Authorization: Bearer <accessToken>`, `CUSTOMER` role) accepts one
  eligible quote on an owned `MARKETPLACE` job. The request body is
  empty (`{}`); customer ownership, role, quote↔job match and state
  are all derived/validated by the backend.
- On success (`200` with `{ job, quote }`): the quote becomes
  `ACCEPTED`, any competing active quotes become `DECLINED` (retired,
  never deleted), the job becomes `ACCEPTED` with `agreed_amount` /
  `currency` recorded from the accepted quote, and a
  `job_status_history` entry (`QUOTED → ACCEPTED`, reason
  `Customer accepted provider quote`) is written — atomically, in a
  single transaction (a failure leaves every row untouched). The
  accepted provider needs no extra row: the job's `professional_id` /
  `business_id` and the creation-time `job_assignments` entry already
  identify it. No technician is assigned (later business workflow).
- Errors: malformed job/quote ids → `400 VALIDATION_ERROR`; unknown
  job, another customer's job, internal (`INTERNAL`) job, unknown
  quote or quote↔job mismatch → `404 NOT_FOUND` (no cross-account
  probing); non-customer roles (provider, technician, manager-only,
  admin) → `403 FORBIDDEN_ROLE`; already-accepted quote → `409
  CONFLICT`; withdrawn/declined quote or a job that is not `QUOTED`
  (`REQUESTED`, `ACCEPTED`, `COMPLETED`, `CANCELLED`, `DISPUTED`, …)
  → `422 VALIDATION_ERROR`. Unauthenticated → `401 UNAUTHORIZED`.
- `GET /api/v1/jobs/:jobId/quotes`, `GET /api/v1/quotes/:id` and the
  embedded `GET /api/v1/jobs/:id` quotes now surface `ACCEPTED` /
  `DECLINED` states so both sides see the outcome; providers see the
  accepted quote and `ACCEPTED` status on
  `GET /api/v1/provider/requests/:id` but cannot change it.

MVP payment position (unchanged and explicit): FixLink does NOT
process customer payment in Stage 6D. The accepted quote represents
the agreed price only; payment is arranged directly between customer
and professional. No payment gateway, escrow, transaction id or
receipt exists — the UI must never imply otherwise. No new tables
were created.


# 14. Job Media (Stage 6F — Implemented)

POST /api/v1/jobs/:jobId/images (multipart: `image` + `phase`)

GET /api/v1/jobs/:jobId/images

GET /api/v1/jobs/:jobId/images/:imageId/file (authorized bytes)

DELETE /api/v1/jobs/:jobId/images/:imageId

See §10.5 for authentication, authorization, upload rules, responses
and status-transition behaviour.


# 15. Job Updates (Stage 6F — Implemented)

POST /api/v1/jobs/:jobId/updates (`{ phase, note }`)

GET /api/v1/jobs/:jobId/updates

GET /api/v1/jobs/:jobId/timeline (`{ job, events }`)

See §10.5 for authentication, authorization, request bodies, responses
and error cases.


# 16. Voice Notes

POST /api/v1/jobs/:id/voice-notes

GET /api/v1/jobs/:id/voice-notes


# 17. Parts

POST /api/v1/jobs/:id/parts

GET /api/v1/jobs/:id/parts

POST /api/v1/parts/:id/approve

POST /api/v1/parts/:id/reject

POST /api/v1/parts/:id/request-information


# 18. Messaging

GET /api/v1/conversations

POST /api/v1/conversations

GET /api/v1/conversations/:id

GET /api/v1/conversations/:id/messages

POST /api/v1/conversations/:id/messages

POST /api/v1/messages/:id/attachments


# 19. Reviews

POST /api/v1/jobs/:id/review

GET /api/v1/jobs/:id/review

POST /api/v1/reviews/:id/response


# 20. Portfolio

GET /api/v1/providers/me/portfolio

POST /api/v1/providers/me/portfolio

GET /api/v1/providers/me/portfolio/:id

PATCH /api/v1/providers/me/portfolio/:id

DELETE /api/v1/providers/me/portfolio/:id

POST /api/v1/providers/me/portfolio/:id/images


# 21. Verification

POST /api/v1/verification/identity

GET /api/v1/verification/identity

POST /api/v1/verification/certificates

GET /api/v1/verification/certificates


# 22. Notifications

GET /api/v1/notifications

PATCH /api/v1/notifications/:id/read

PATCH /api/v1/notifications/read-all


# 23. Admin

Admin routes use:

/api/v1/admin/

Examples:

GET /api/v1/admin/users

GET /api/v1/admin/users/:id

GET /api/v1/admin/providers

GET /api/v1/admin/businesses

GET /api/v1/admin/technicians

GET /api/v1/admin/jobs

GET /api/v1/admin/services

GET /api/v1/admin/categories

GET /api/v1/admin/verification

GET /api/v1/admin/verification/:id

POST /api/v1/admin/verification/:id/approve

POST /api/v1/admin/verification/:id/reject

POST /api/v1/admin/verification/:id/request-information

GET /api/v1/admin/certificates

GET /api/v1/admin/reviews

GET /api/v1/admin/reports

GET /api/v1/admin/disputes

GET /api/v1/admin/audit-logs


# 24. Authentication Requirements

Protected endpoints require authentication.

The backend must determine the authenticated user.

Never trust:

- user_id supplied by frontend
- role supplied by frontend
- business_id supplied by frontend
- ownership supplied by frontend


# 25. Authorization Requirements

Every protected resource must verify authorization.

Examples:

Customer:
Only own jobs.

Professional:
Own profile and authorized jobs.

Business:
Only own business data.

Technician:
Only assigned/authorized jobs.

Admin:
Platform-level access.


# 26. Pagination

Large collections should support pagination.

Example:

?page=1&pageSize=20


# 27. Filtering

Collections may support query parameters.

Example:

/api/v1/jobs?status=IN_PROGRESS


# 28. Sorting

Where supported:

?sort=created_at
?direction=desc


# 29. Validation

All API input must be validated server-side.

Invalid data should return:

400 or 422

depending on the type of validation failure.


# 30. File Uploads

File uploads must validate:

- MIME type
- Extension
- File size
- Ownership
- Destination
- Access permissions

Private files must not be returned through public URLs without appropriate
authorization.


# 31. Job Status Transitions

The backend must validate job transitions.

Example:

REQUESTED
→ QUOTED
→ ACCEPTED
→ SCHEDULED
→ IN_PROGRESS
→ COMPLETED
→ CONFIRMED
→ CLOSED

Invalid transitions must be rejected.


# 32. API Security

API security includes:

- Authentication
- Authorization
- Rate limiting
- Input validation
- Secure headers
- CORS
- Safe error responses
- Audit logging where appropriate


# 33. API Documentation Rule

When an endpoint changes:

1. Update this document.
2. Update backend implementation.
3. Update frontend API service.
4. Update tests.


# 34. API Principle

The API is the security and business-rule boundary.

The frontend is a client.

The backend is authoritative.
