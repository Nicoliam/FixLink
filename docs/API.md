# Fixlynk — API Specification

## Current implementation note

This document contains the API contract and historical/planned route
notes from the project stages. For the current release, verify every
endpoint against the routers in `backend/src/` and the implemented route
lists in `docs/CLIENT-UAT.md` and `docs/HANDOVER.md`. The current API uses
`/api/v1`, standard success/error envelopes, server-side authorization and
business isolation. The `/admin/settings` surface is not implemented.

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
  "role": "CUSTOMER (optional, default)",
  "displayName": "Sipho Ndlovu (PROFESSIONAL only, required)",
  "businessName": "Mokoena Plumbing (BUSINESS_OWNER only, required)"
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
- `users` has a unique key on `phone` as well as on `email`. A duplicate
  phone number returns `409 CONFLICT` with a message naming the phone number
  — it is never reported as a duplicate email, because that would block a
  legitimate registration behind a message telling the user to log in with an
  account that does not exist. If the database driver rejects an insert
  without naming the violated key, the response is `409 CONFLICT` with
  "An account with this email or phone number already exists."
- Rate limited to 10 attempts per IP per 15 minutes; further attempts return
  `429 RATE_LIMITED`.
- **Verification is not a requirement.** A successful registration returns
  the same session as login — `user`, `accessToken` and `refreshToken` — and
  the account is created `ACTIVE`, so the new customer or provider can use
  the API immediately. There is no confirmation interstitial between
  registering and using the account.
- The account, its role and its provider profile are created in one
  transaction, so a failed registration never leaves a half-provisioned
  account or consumes the email address.
  - `CUSTOMER`: also creates `customer_profiles`, which every customer-scoped
    feature resolves ownership through (saved professionals, quotes, job
    detail, job history). Optional `firstName` / `lastName` may be supplied;
    both are required together or not at all. When absent the name is derived
    from the email local part (`naledi.dlamini@…` -> `Naledi` / `Dlamini`),
    which is a guess the customer can correct later. The names stay optional on
    the wire so an existing client is not broken.
  - `PROFESSIONAL`: also creates `professional_profiles` using the required
    `displayName` (`verification_status` `UNVERIFIED`).
  - `BUSINESS_OWNER`: also creates `business_profiles` using the required
    `businessName`, with a deterministic slug derived from the business name
    and the account email (`verification_status` `UNVERIFIED`).
  - A name sent for a role that has no profile is ignored rather than
    rejected; a missing name for `PROFESSIONAL` / `BUSINESS_OWNER` is
    `422 VALIDATION_ERROR`. Names are trimmed and capped at 255 characters.

Errors raised before a controller runs (malformed JSON, oversized body) are
answered by the global error handler with the same envelope rather than an
HTML error page: `400 VALIDATION_ERROR` for unparseable JSON and
`413 VALIDATION_ERROR` for a body over 100 kB. Unexpected server errors
return `500 INTERNAL_ERROR` and are logged server-side with the error name
only — never a stack trace, SQL text or request body.

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
- A successful login lands the user on the route for their highest-priority
  role (admin → business → technician → professional → customer, falling back
  to `/account`). This is a client-side routing decision only; the backend
  authorizes every request independently.

### Tokens

- Access token: signed JWT (Bearer), 15-minute expiry by default
  (`JWT_ACCESS_TTL_SECONDS`). Claims: `sub` (user id), `email`, `roles`.
- Refresh token: opaque random value (hex), 30-day expiry by default
  (`REFRESH_TOKEN_TTL_SECONDS`). Only its SHA-256 hash is stored
  server-side — never the raw token.
- Refresh sessions use the in-memory store in memory mode and the hashed
  MySQL `refresh_tokens` table in production mode. The presented token is
  consumed atomically before a replacement is issued, so concurrent replay
  cannot create multiple successor sessions. Production deployments should
  use MySQL mode so sessions survive restarts and are shared by instances.

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

### Indicative call-out price on a card

Every `ProviderCard` — search results and saved professionals alike —
carries the provider's own lowest stated starting price:

- `fromPrice` — the lowest `price_amount` across the provider's **live**
  (`is_active = 1`, not soft-deleted) offerings, or `null`.
- `fromPriceCurrency` — the currency of that figure (`ZAR` for the MVP),
  or `null` when there is no price.

Both are informational only. The MVP does not charge them, and they are
never an agreed amount — the quote is what binds (see §12 of `AGENTS.md`).

`null` means the provider has stated no price yet, which is a real state:
a professional picks their services during registration, before login, and
sets the figure later. An unpriced offering is **ignored**, not treated as
R0, so a provider who set one real price still shows that price. A client
receiving `fromPrice: null` must omit the figure entirely — rendering R0,
or a guess, would advertise a call-out the provider never agreed to. This is
why `service_offerings.price_amount` is nullable
(`database/migrations/019_offering_price_optional.sql`).

Retired offerings never contribute: only rows a profile would show can
produce the card's figure.

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


## 7.2 Customer saved professionals

Customer-owned bookmarks. A bookmark lets a customer request a job later
without searching again. It is **not** a capability: it grants no access to
a provider's data, and the saved list is rendered from the same public
marketplace projection as `GET /providers`, so verification badges and
private verification documents follow exactly the same rules there and here.

Requires an authenticated **CUSTOMER**. The owning customer is resolved from
the session, so the client never sends a customer or user id.

```
GET    /api/v1/customer/saved-providers
POST   /api/v1/customer/saved-providers
GET    /api/v1/customer/saved-providers/:providerId
DELETE /api/v1/customer/saved-providers/:providerId
```

- `GET /customer/saved-providers` → `200 { items, total }` — the caller's
  bookmarks, newest first. Each item is a provider card plus `savedAt`
  (no `bio`, no `offerings`; those are profile-only).
  A provider deactivated or deleted after being saved is omitted rather than
  surfaced, because it is no longer requestable.
- `POST /customer/saved-providers` with `{ "providerId": "professional-1" }`
  → `201` the saved provider card plus `savedAt`.
  - `422` `VALIDATION_ERROR` — missing/malformed `providerId`, or any
    unknown field. `providerId` must be the public marketplace form
    (`professional-<n>` / `business-<n>`); the provider type is derived from
    it rather than accepted separately.
  - `404` `NOT_FOUND` — unknown, deactivated or deleted provider.
  - `409` `CONFLICT` — already saved by this customer.
- `GET /customer/saved-providers/:providerId` → `200 { providerId, saved }`.
  Drives the save toggle on the public profile page.
- `DELETE /customer/saved-providers/:providerId` → `200` on success,
  `404` `NOT_FOUND` when it was not saved.

Authorization:

- `401` when unauthenticated.
- `403` `FORBIDDEN_ROLE` for PROFESSIONAL, BUSINESS_OWNER,
  BUSINESS_MANAGER, TECHNICIAN and ADMIN. A bookmark is part of the customer
  journey only.
- `404` `NOT_FOUND` when a CUSTOMER account has no `customer_profiles` row.
- One customer can never read or remove another customer's bookmarks; every
  query is scoped to the session customer's profile.


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
  Each request now also carries the Stage 7F decision fields
  (`reviewedBy` login id, `reviewedAt`, `reviewNotes`) and the
  decision history (`approvals: [{ id, jobId, partsRequestId,
  requestedBy, reviewedBy, status, comments, reviewedAt,
  createdAt }]`, oldest first).

## 8.2 Parts approvals + awaiting parts (Stage 7F)

Manager review reuses the existing `job_approvals` table
(`request_type = PARTS`, status PENDING/APPROVED/REJECTED/
NEEDS_INFO) — no new tables; migration `011_parts_available.sql`
only extends `parts_requests.status` with `PARTS_AVAILABLE`.
Every decision is atomic: request update + `job_approvals` row +
optional job move + `job_status_history` entry succeed together or
roll back together.

- `POST /api/v1/business/jobs/:jobId/parts/:requestId/approve`
  (owner/manager, `{ comment? }` ≤1000 chars) moves PENDING (or
  NEEDS_INFO) → APPROVED, records the `job_approvals` row
  (requested_by = technician login, reviewed_by = manager) and
  moves the job IN_PROGRESS → AWAITING_PARTS (an already-waiting
  job stays AWAITING_PARTS) with history reason `Parts request
  approved — awaiting parts`. Returns `200` `{ request, approval,
  job }`. The job must be INTERNAL, owned, assigned and
  IN_PROGRESS/AWAITING_PARTS.
- `POST .../parts/:requestId/reject` (`{ comment|reason }`
  required) moves → REJECTED and records the decision; the job
  stays IN_PROGRESS (no AWAITING_PARTS move, but the decision is a
  timeline event). Returns `200` `{ request, approval, job }`.
- `POST .../parts/:requestId/request-info` (`{ comment }`
  required) moves → NEEDS_INFO and records the decision; the job
  stays IN_PROGRESS. The technician sees the status plus the
  manager comment and responds via the technician surface.
- `POST .../parts/:requestId/available` (owner/manager, `{
  comment? }`) moves APPROVED → PARTS_AVAILABLE. Multiple-request
  rule: the job resumes (AWAITING_PARTS → IN_PROGRESS, history
  reason `Parts available — job ready to continue`) only when no
  APPROVED request remains outstanding for the job; otherwise it
  stays AWAITING_PARTS. Returns `200` `{ request, job,
  jobResumed }`.
- `POST /api/v1/technician/jobs/:jobId/parts/:requestId/respond`
  (assigned technician, `{ note? }` ≤1000 chars) moves NEEDS_INFO
  → PENDING and records the note as a PENDING `job_approvals`
  row for the manager's next review. Returns `200` (the request).
- `POST /api/v1/technician/jobs/:jobId/resume` (assigned
  technician) moves AWAITING_PARTS → IN_PROGRESS, allowed only
  when no APPROVED request remains outstanding (history reason
  `Technician resumed job — parts available`). Returns `200` (the
  job).
- Parts state machine (server-enforced, invalid actions →
  `422 VALIDATION_ERROR`, never silent): PENDING → APPROVED →
  PARTS_AVAILABLE; PENDING → REJECTED | NEEDS_INFO; NEEDS_INFO →
  PENDING (technician responds) or → APPROVED / REJECTED /
  NEEDS_INFO (manager acts again); REJECTED / CANCELLED /
  PARTS_AVAILABLE are terminal. Self-review (reviewer ==
  requester) is rejected. Malformed ids → `400`; foreign jobs →
  `404`; technicians/customers/professionals on the business
  decision routes (and owners/managers on the technician
  respond/resume routes) → `403 FORBIDDEN_ROLE`.
- Both execution timelines now include one `parts` event per
  recorded decision/response in addition to the read-time request
  event (`partsStatus` = the decision status, `reason` = the
  manager/technician comment, `actor` = business for manager
  decisions, technician for responses), plus the `IN_PROGRESS →
  AWAITING_PARTS → IN_PROGRESS` status events. No second timeline
  system exists.
- Status vocabulary: `parts_requests` is now PENDING, APPROVED,
  REJECTED, NEEDS_INFO, CANCELLED, PARTS_AVAILABLE (migration
  011); `job_approvals` keeps PENDING/APPROVED/REJECTED/
  NEEDS_INFO.
- Notification seam: each decision/fulfilment/resume emits one
  event (`PARTS_REQUEST_APPROVED/REJECTED/NEEDS_INFO/RESPONDED`,
  `PARTS_AVAILABLE`, `JOB_READY_TO_CONTINUE`) on the in-memory
  `parts-request-events` bus — nothing is written to the
  `notifications` table in this stage. Stage 8 persists these
  (type/title/message → notification row, reference
  PARTS_REQUEST) and exposes the listing endpoints.
- Role matrix: managers/owners/customers/professionals →
  `403 FORBIDDEN_ROLE` on the technician submission surface (and
  vice versa on the business surface); unauthenticated → `401`.

MVP payment position (unchanged): internal jobs never charge


## 8.6 Businesses — Stage 7G Implementation Notes (Business Job Board + History)

Stage 7G gives owners/managers the operational board for their
INTERNAL jobs on the ONE shared `jobs` table — no
`business_jobs` table, no duplicate statuses, no second
timeline. It reuses `jobs`, `job_assignments`,
`job_status_history`, `job_updates`, `job_images`,
`job_voice_notes`, `parts_requests` and `job_approvals`.

- `GET /api/v1/business/jobs` accepts the Stage 7B filters
  (`status`, `search`, `page`/`pageSize`) plus the board
  filters: `board` (ALL | NEW | ASSIGNED | SCHEDULED |
  IN_PROGRESS | AWAITING_PARTS | COMPLETED | CANCELLED |
  HISTORY), `technicianId` (active assignment to that roster
  row), `priority` (LOW/NORMAL/HIGH/URGENT), `from`/`to`
  (inclusive creation-date bounds, `YYYY-MM-DD` or ISO —
  a bare date covers the whole UTC day), `assigned`
  (`true` = has an active assignment, `false` = unassigned)
  and `sort` (RECENT = newest first (default) | SCHEDULED =
  next visit first, unscheduled last | PRIORITY = URGENT
  first). `board` cannot be combined with `status` or
  `assigned` (`422`); unknown board/priority/sort values,
  `from` after `to` and malformed filters → `422`.
- Board derivation (no new statuses): NEW is REQUESTED;
  ASSIGNED means an active TECHNICIAN assignment exists
  (`unassigned_at IS NULL`); SCHEDULED is derived from the
  `scheduled_at` visit slot (REQUESTED/SCHEDULED with a slot
  set — no promotion endpoint moves internal jobs to a
  SCHEDULED status); HISTORY is the terminal set COMPLETED /
  CLOSED / CONFIRMED; every other category maps to its
  lifecycle status.
- Rows are enriched for operations: each item carries the
  shared INTERNAL projection plus `assignment` (active
  assignment with technician + `assignedAt`, null when
  unassigned), `partsOutstanding` (APPROVED requests not yet
  PARTS_AVAILABLE) and `lastUpdateAt` (latest job_updates /
  job_images / job_voice_notes timestamp, null when none).
- `search` matches reference, title, description, customer
  name, customer email/phone and service name — always scoped
  to the caller's business (searching another business's
  customer name returns zero rows, never their jobs).
- `GET /api/v1/business/jobs-board-summary` returns the
  operational counts for the dashboard tabs and the board:
  `{ total, requested, assigned, scheduled, inProgress,
  awaitingParts, completed, cancelled, history }` (zero when
  empty, business-scoped). The legacy `jobs-summary` shape
  (`{ total, requested, scheduled, inProgress, completed,
  cancelled }`) is unchanged.
- Isolation (unchanged rules, extended surface):
  owner/manager only (`TECHNICIAN`/`CUSTOMER`/`PROFESSIONAL`/
  `ADMIN` → `403 FORBIDDEN_ROLE`, unauthenticated → `401`);
  business derived server-side, never from the request; a
  foreign job reads as `404`; a foreign `technicianId` filter
  yields an empty page (`200`, never foreign rows);
  marketplace jobs never appear (`source = INTERNAL`
  always). Detail (`GET /business/jobs/:id`) is unchanged —
  the board links into it.
- Angular: `/business/jobs` is the board (category tabs with
  counts, technician/priority/date/sort/search filters, job
  cards with customer, service, technician, status,
  priority, scheduled/created dates, awaiting-parts badge
  and last update, pagination, loading/empty/error states);
  the dashboard adds the operations card (assigned,
  awaiting parts, history). `/technician/jobs` is
  untouched — technicians still see only assigned jobs.
- No migration was required — `jobs.business_id`/`source`/
  `status`/`priority`/`scheduled_at`/`created_at`,
  `job_assignments`, the execution tables and
  `parts_requests.status` already support this stage.
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

DELETE /api/v1/jobs/:id

POST /api/v1/jobs/:id/confirm

PATCH /api/v1/jobs/:id/status

POST /api/v1/jobs/:id/updates

POST /api/v1/jobs/:id/complete

POST /api/v1/jobs/:id/request-images


## 10.1 Jobs — Stage 6B Implementation Notes

Stage 6B implements customer job-request creation and retrieval only
(`backend/src/modules/jobs/`). Status changes, quotes, assignment,
execution, messaging, reviews and payment belong to later stages.

- `POST /api/v1/jobs` (requires `Authorization: Bearer <accessToken>`,
  `CUSTOMER` role) creates a job in the ONE shared `jobs` table with
  `source = MARKETPLACE` and `status = REQUESTED` → `201` with the job.
  Request: `{ providerId?, serviceId, description, location,
  preferredDate? (YYYY-MM-DD), preferredTime? (HH:MM 24h), notes? }`.
  `providerId` is **optional**. When present the request is *addressed*: the
  job is created with `jobs.professional_id` / `jobs.business_id` set and a
  provider `job_assignments` row is written in the same operation. When
  absent the request is an **open request**: both provider columns stay
  `NULL`, no assignment row is written, and `data.provider` is `null`.
  The customer is derived from the session — any `customer_id`,
  `status`, `source` or timestamp in the body is ignored. The initial
  `job_status_history` entry (`NULL → REQUESTED`) is always written. The
  free-text `location` is stored in `jobs.address_line1` (no separate
  suburb column exists); `preferredDate`/`preferredTime` combine into
  `jobs.scheduled_at` (09:00 default when no time is given). Optional
  `notes` are validated but not persisted — file/photo infrastructure
  arrives in a later stage.
- Customer profiles are auto-provisioned on first request (Stage 5A
  registration creates `users` + `user_roles` only).
- **Open-request matching (Step 14).** After an open request commits, the
  backend resolves every provider that matches it on **both** category and
  service area, and sends each a `JOB_REQUEST_OPEN` notification linking to
  `GET /api/v1/provider/open-requests/:id`. Matching is described in
  `docs/USER-FLOWS.md` §2.6.2 and is deliberately **not** a radius
  calculation: `service_areas` carries no coordinates and this flow writes
  none, so the area test is a case-insensitive whole-word comparison of the
  request's location tokens against each area's `area_name`, `city` and
  `province`. A request that matches nobody still returns `201`. Matching and
  notification are best-effort and never change the `201`.
- Stage 13: after an addressed job commits, the selected provider is notified
  in-app (`JOB_REQUEST`) and — when the provider's account is an
  `ACTIVE` provider-side account with an email address — by email
  carrying the service, reference, location, preferred date/time, the
  customer's description and a deep link to `GET /api/v1/provider/requests/:id`.
  No customer contact details are included. The email is best-effort: a
  mail failure never changes the `201` response or the created job
  (see §22).
- Validation: malformed provider/service ids → `400 VALIDATION_ERROR`; an
  **omitted** `providerId` is not malformed and is accepted; an unknown
  provider or service → `404 NOT_FOUND`; an addressed provider that does not
  offer the service → `422 VALIDATION_ERROR`; description/location/date/time
  problems → `422 VALIDATION_ERROR`. Non-customer roles → `403
  FORBIDDEN_ROLE`; missing/invalid tokens → `401 UNAUTHORIZED`.
- `GET /api/v1/jobs?page=&pageSize=` → `200` paginated owned jobs
  (newest first). `GET /api/v1/jobs/:id` → `200` owned job, `400` for a
  malformed id. Another customer's job reads as `404 NOT_FOUND` (no
  cross-account probing). Non-customer roles → `403`.
- `data.provider` is `null` on an open request. Consumers must handle it —
  the customer job list and job detail render "Matching professionals" in
  place of a professional name while `provider` is `null`.

### 10.1.1 Step 15 — Customer Edit, Cancel and Delete

A customer can correct or withdraw their own marketplace request. All three are
gated on the request **not yet being accepted**, which is exactly
`status IN ('REQUESTED','QUOTED')`:

| State | Edit | Cancel | Delete |
|---|---|---|---|
| `REQUESTED` (no quote yet) | yes | yes | yes |
| `QUOTED` (quotes received, none accepted) | yes | yes | yes |
| `ACCEPTED` and later | `409` | `409` | `409` |

`ACCEPTED` is the cut-off and not an arbitrary one: from that moment work has
been agreed, `jobs.agreed_amount` is recorded, and a `job_assignments` row
exists. The business internal-job equivalents (`PATCH /business/jobs/:jobId`,
`POST /business/jobs/:jobId/cancel`) are gated on `REQUESTED` only, because a
business owns its jobs directly with no quote round-trip in between.

Ownership is derived from the session, never from the body. Another
customer's job reads as `404 NOT_FOUND`, never `403`, so job ids cannot be
probed across accounts. Non-customer roles get `403 FORBIDDEN_ROLE`.

**Editable fields** are the ones the customer supplied as free text or a
preference: `description`, `location`, `preferredDate`, `preferredTime`.
Each is optional; omitted keys are left untouched, so a partial edit is safe.

Two things are deliberately **not** editable after creation:

- `serviceId` — it decides the platform category, and on an open request that
  decides which professionals the request matches. Changing it would silently
  repoint the request at a different trade.
- `providerId` — choosing or changing the professional is assignment, not
  correction.

For either mistake the customer cancels and reposts. Since Step 14 made
`providerId` optional that costs one extra step, not a dead end.

- `PATCH /api/v1/jobs/:id` → `200` with the updated job. Each supplied field
  is validated exactly as on create: `description` 20–2000 characters,
  `location` 1–255, `preferredDate` a real `YYYY-MM-DD` calendar date,
  `preferredTime` `HH:MM` 24-hour. A blank `preferredDate`/`preferredTime`
  clears the preference (sent as `null`), which is the only way to remove one.
  An empty body → `422 VALIDATION_ERROR`.
- **Known gap: `preferredTime` cannot be edited from the UI.** The write path
  accepts it, but `JobDto` returns only `preferredDate` and the derived
  `scheduledAt` — not `preferredTime`. A time input therefore cannot be
  prefilled with the current value, and submitting a blank would erase a
  preference the customer cannot see. The customer edit form omits the field
  entirely rather than risk silent data loss; omitting the key leaves the
  stored time untouched. Exposing `preferredTime` on `JobDto` is the fix, and
  is deliberately NOT bundled into this change because it widens the response
  contract for every job consumer.
- **Quoted requests warn, they do not block.** When the request already holds
  active quotes, the response carries
  `data.quotedRequestsChanged: true`. The existing quotes are **kept** — they
  were submitted against the earlier description and are not the customer's to
  retract — but the customer is told, in the UI and in that flag, that those
  quotes were priced on what they read before. A professional who quoted is
  NOT re-notified: they have already quoted, and re-opening their request in
  their inbox would be noise. A professional whose **quote was declined** is
  likewise left alone.
- Editing an **open** request whose `location` changed re-runs category and
  area matching, because the move may bring new professionals into range. Every
  newly matched professional receives a fresh `JOB_REQUEST_OPEN`, capped by the
  same `MAX_OPEN_REQUEST_MATCHES` fan-out as creation. An edit that leaves the
  location untouched sends nothing.
- `POST /api/v1/jobs/:id/cancel` → `200` with the job at `status = CANCELLED`.
  Written to `job_status_history` as `REQUESTED|QUOTED → CANCELLED`, reason
  `Customer cancelled request`, so the state change is never silent
  (AGENTS.md §37). The provider is notified (`JOB_REQUEST` is not reused; a
  cancellation uses `JOB_CANCELLED`).
- `DELETE /api/v1/jobs/:id` → `200` with `{ deleted: true }`, matching the
  shape `DELETE /api/v1/jobs/:id/images/:imageId` already uses in this API.
  This is a **soft delete**:
  it sets `jobs.deleted_at` and nothing else. Quotes, `job_status_history`,
  `job_assignments` and job images are all left in place, because a withdrawn
  request that a professional already quoted must remain auditable. Every
  customer read filters on `deleted_at IS NULL`, so the job disappears from
  `/my-jobs`, `GET /jobs/:id` returns `404`, and the provider's inbox and
  open-request board stop listing it. It does **not** write a
  `job_status_history` row: the job's status is unchanged, and that table
  records status transitions only. Cancel and delete are different operations
  and the distinction is deliberate.
- A provider whose request was cancelled or deleted is notified once
  (`JOB_CANCELLED`), so nobody is left believing live work still exists.
- Errors: malformed id → `400 VALIDATION_ERROR`; unknown job, another
  customer's job, or an internal (`INTERNAL`) job → `404 NOT_FOUND`; an
  accepted-or-later job → `409 CONFLICT`; invalid field values → `422
  VALIDATION_ERROR`; non-customer role → `403 FORBIDDEN_ROLE`; unauthenticated
  → `401 UNAUTHORIZED`.


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


## 10.6 Jobs — Request Photos (Customer Evidence)

Implemented in `backend/src/modules/jobs/jobs.service.ts`
(`uploadRequestImage`), the store methods `createRequestImage`, migration
`017_job_image_request_context`, and the lazy job-request wizard step 01.

`POST /api/v1/jobs/:jobId/request-images` attaches a photo of the problem to
a request, so a professional can assess scope before quoting. This is the
customer's evidence, NOT the professional's work record.

- `multipart/form-data` with a single `image` field. Bytes are held in memory
  (5MB cap) and written to the MVP storage dir; MySQL stores metadata only.
  The response is the image record, never a storage key or path.
- Requires an authenticated `CUSTOMER` who owns the job. Ownership comes from
  the session: another customer's job is `404 NOT_FOUND`, never `403`, so job
  ids cannot be probed.
- **State gate: `REQUESTED` or `QUOTED` only.** The customer may add a missing
  photo before deciding on the quote. From `ACCEPTED` onward the professional
  owns the Before/During/After record and the customer may not write into it →
  `409`.
- **Cap: 6 photos per job** → `422`. Both the gate and the cap are enforced
  inside the insert transaction (`SELECT ... FOR UPDATE`), so concurrent
  uploads cannot slip past either check.
- Validation: 5MB max; JPEG, PNG or WebP only, verified against the file's magic
  bytes rather than the client-declared MIME. A renamed `.png` that is not a
  PNG is rejected.
- A refused insert deletes the just-written file, so a failed upload leaves no
  orphan in storage.
- The upload is a **second** request after `POST /jobs`, because
  `job_images.job_id` is NOT NULL and a photo cannot exist before its job does.

`context` (migration 017) discriminates the two populations sharing
`job_images`:

| context  | uploader | when | meaning |
| --- | --- | --- | --- |
| `REQUEST` | the owning customer | `REQUESTED`/`QUOTED` | evidence of the problem |
| `WORK` | addressed provider / assigned technician | `IN_PROGRESS` | the Before/During/After record |

Reusing `phase = 'BEFORE'` was rejected: `phase` describes where the
professional was in the work, so merging the two would let a customer write
into the provider's work record and make the timeline claim work that was never
done. Read visibility is unchanged — `GET /jobs/:jobId/images` already admits
the owning customer and the addressed provider, which is exactly the audience
for request photos.

No voice note is accepted at request time: `job_voice_notes` has no
context column, so a customer voice note would be indistinguishable from a
technician's work voice note. Adding it needs its own discriminator.

Tests: `backend/tests/job-request-images.test.ts` (18) cover authentication,
role gating, cross-customer `404`, the state gate at each status, the cap,
MIME/size/magic-byte rejection, filename sanitisation, storage rollback, and
that the row is `context: 'REQUEST'` with no key or path exposed.


# 11. Job Requests

GET /api/v1/jobs/requests

POST /api/v1/jobs/:id/request


# 12. Business Jobs

POST /api/v1/business/jobs

GET /api/v1/business/jobs

GET /api/v1/business/jobs-board-summary

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
- **Step 14 addition.** The inbox also returns an open request once the
  authenticated provider has **quoted** it, even though the job is not
  addressed to them. So the inbox contains two things: requests addressed to
  this provider, and open requests this provider has a live quote on. Every
  request the provider can see — either kind — is one they may act on. An
  open request that matches them but that they have not quoted is **not** in
  the inbox; it is on `/provider/open-requests` (§13.4).
- Provider identity is derived server-side: the professional profile
  owned via `professional_profiles.user_id`, or businesses owned via
  `business_profiles.owner_user_id` / active `business_members` rows
  (`BUSINESS_OWNER`/`BUSINESS_MANAGER`; `TECHNICIAN` members are never
  marketplace providers). A provider-role user with no linked profile
  sees an empty inbox (`200`, not an error).

Open requests (matching board):

- `GET /api/v1/provider/open-requests?page=&pageSize=` (same provider
  roles as the inbox) returns `MARKETPLACE` jobs that are **unaddressed**
  (`professional_id IS NULL AND business_id IS NULL`), are still `REQUESTED`
  or `QUOTED`, have **fewer than 3** active quotes, and match the caller on
  **both** category and service area. Newest first. Requests the caller has
  already quoted are excluded — they live in the inbox instead.
  `CUSTOMER`, `TECHNICIAN` and role-less accounts → `403 FORBIDDEN_ROLE`. A
  provider with no service areas or no offerings in a category sees `200`
  with an empty list, which is a normal answer and not an error.
- `GET /api/v1/provider/open-requests/:id` returns one such request with the
  same projection and privacy limits as the inbox detail. An open request the
  caller does not match reads as `404 NOT_FOUND` — matching is the access
  grant, and non-matching ids cannot be probed. Malformed ids → `400`.

Service areas (Step 14):

- `GET /api/v1/provider/me/service-areas` → `200 { items }` for the
  authenticated `PROFESSIONAL` / `BUSINESS_OWNER` / `BUSINESS_MANAGER`. A
  provider with no linked profile gets `200 { items: [] }`.
- `PATCH /api/v1/provider/me/service-areas` with
  `{ areas: [{ areaName (1–128), city? (≤128), province? (≤128) }] }`
  **replaces** the caller's whole list in one transaction: at least 1 and at
  most 10 areas. There is no add/remove endpoint, so the client can never put
  the list into a half-updated state. `{"areas": []}` → `422`; a profile with
  no areas is represented by never calling the endpoint. Other roles → `403
  FORBIDDEN_ROLE`.
- Ownership is the existing exactly-one-owner rule on `service_areas`
  (nullable `professional_id` / `business_id`), so a business owner's list
  and a professional's list are always separate.

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
- **Step 14 — open requests.** An unaddressed job may be quoted by any
  provider that matches it on category and service area. The **first** quote
  performs the `REQUESTED → QUOTED` transition; the second and third are
  accepted while the job is already `QUOTED` and leave the status alone, so
  they write no further `job_status_history` entry. Once 3 active
  (`DRAFT`/`SUBMITTED`) quotes exist, further quotes on that job are rejected
  with `409 CONFLICT` and a message telling the submitter the customer already
  has three quotes. The count is taken while the job row is locked
  (`SELECT … FOR UPDATE`), so concurrent submissions cannot both pass the
  check. A provider who has already quoted still gets `409` on their own
  second attempt, unchanged.
- **Step 14 — answered questions.** A professional who is unsure of scope
  sends a normal quote whose `message` is a question. It is stored as a
  `SUBMITTED` quote and counts toward the 3-quote cap; there is no separate
  message thread for marketplace requests in the MVP (see
  `docs/MVP-SCOPE.md`).
- Errors: malformed job id → `400`; unknown job, or a job the caller neither
  is addressed to nor matches → `404`; invalid amounts/items/message → `422`;
  second active quote from the same provider → `409 CONFLICT` (existing
  quotes are never silently overwritten); an open request that already has 3
  active quotes → `409 CONFLICT`; wrong role → `403`.
- Success → `201` with the quote. The frontend must never send
  `status = QUOTED` — the backend performs the transition.

Quote retrieval:

- `GET /api/v1/jobs/:id/quotes` → `200 { items, total }` for the
  owning customer or the addressed provider (others → `404`).
- `GET /api/v1/quotes/:id` → `200` quote under the same authorization.

MVP payment position (unchanged): Fixlynk does not process customer
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
- **Step 14 — open requests.** On an open request there is no
  `professional_id` / `business_id` and no `job_assignments` row, so acceptance
  WRITES the winner: the same `UPDATE` that moves the job to `ACCEPTED` also
  sets `professional_id` / `business_id` from the accepted quote, and a
  provider `job_assignments` row is inserted in the same transaction.
  Acceptance is the moment the customer chooses a professional, so from that
  point the job is an ordinary addressed request and `POST
  /jobs/:id/schedule`, `POST /jobs/:id/start` and the execution endpoints all
  work with no open-request branch. The customer sees up to 3 quotes side by
  side and picks one; the losers are retired to `DECLINED` exactly as before.
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

MVP payment position (unchanged and explicit): Fixlynk does NOT
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


# 22. Notifications (Stage 8 — in-app; Stage 13 adds email for providers)

In-app delivery is the base channel: no SMS, WhatsApp, push or
WebSockets. The frontend polls `unread-count` modestly (60s) for
badge freshness. The recipient is always the session user —
ownership is never accepted from the request, and another user's
notification id reads as `404` (never `403`), so ids cannot be
probed across accounts.

Stage 13 adds an **email** channel for provider-side recipients. It is
an addition to the same notification row, not a separate API: no request
or response shape changed, and no new endpoint exists. Eligibility is
resolved per recipient from the recipient's own account (an
`ACTIVE` account holding `PROFESSIONAL`, `BUSINESS_OWNER`,
`BUSINESS_MANAGER` or `TECHNICIAN` with an email address on file);
`CUSTOMER`-only recipients are not emailed. The email carries the
notification title/message, an optional details block (job request
supplies service, reference, location, preferred date/time and the
customer's description) and a role-specific deep link into the app.
Customer contact details, verification documents and admin-only
information are never included — the reply happens on the platform.
Attempts are recorded in `notifications.email_status` / `emailed_at` /
`email_error` (not exposed by the API yet) and logged. Email failures
never roll back the committed operation, exactly like in-app delivery.
See `docs/NOTIFICATIONS.md` for the full design and configuration.

GET /api/v1/notifications

Query parameters: `unreadOnly` (true/false), `page` (1–1000),
`pageSize` (1–50). Response items expose `id`, `type`, `title`,
`message`, `relatedJobId` (job detail target), `relatedEntityType`
(`JOB` = marketplace, `INTERNAL_JOB` = internal business),
`relatedEntityId`, `read`, `createdAt`, `readAt`.

GET /api/v1/notifications/unread-count

Resolves `{ "unreadCount": number }` for the badge.

POST /api/v1/notifications/:id/read

Marks one owned notification read (idempotent). Unknown or
foreign ids read as `404 NOT_FOUND`; malformed ids as `400`.

POST /api/v1/notifications/read-all

Marks every owned notification read. Resolves
`{ "markedRead": number }` (0 when already clear).

Notification types: `JOB_REQUEST`, `JOB_REQUEST_OPEN`,
`QUOTE_RECEIVED`, `QUOTE_ACCEPTED`,
`JOB_SCHEDULED`, `JOB_STARTED`, `JOB_COMPLETED`,
`JOB_CONFIRMED`, `TECHNICIAN_ASSIGNED`, `TECHNICIAN_REASSIGNED`,
`JOB_UPDATE`, `WORK_DOCUMENTED`, `PARTS_REQUESTED`,
`PARTS_APPROVED`, `PARTS_REJECTED`, `PARTS_MORE_INFO`,
`PARTS_AVAILABLE`. Recipients resolve server-side (provider
directory, customer-profile owner, business owner + active
owner/manager members, assigned technician); the actor is
excluded. Delivery is best-effort — a notification failure never
rolls back the committed job/quote/assignment operation.

`JOB_REQUEST` means "this request was addressed to you". Step 14 adds
`JOB_REQUEST_OPEN` for "an unaddressed request matches your categories
and service areas" — it links to
`GET /api/v1/provider/open-requests/:id`, not the inbox. A provider who
later quotes that request also receives `QUOTE_RECEIVED` as usual when the
customer accepts, and sees the job in their inbox from then on.


# 23. Admin — Stage 9 implementation

All admin routes are under:

/api/v1/admin/

Every route in this section requires `Authorization: Bearer <accessToken>`
and an authoritative `ADMIN` role loaded from the user repository. The
account must also be `ACTIVE`. A stale token claim is not trusted. Missing
or invalid authentication, including `SUSPENDED` or `DELETED` users, returns
`401 UNAUTHORIZED`; an authenticated `PENDING` account or a non-admin
account returns `403 FORBIDDEN_ROLE`. Self-registration now creates `ACTIVE`
accounts, so in practice only a platform-created or explicitly deactivated
admin account can be non-`ACTIVE` here.

Admin responses use the standard envelope defined in §2. List responses use:

{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 20
}

Every list accepts `search` (or `q`), `page` and `pageSize` unless noted
otherwise. `page` is 1–1000, `pageSize` is 1–50, the default page is 1 and
the default page size is 20. Text values are trimmed and limited to 128
characters. Resource ids are positive integers. Dates accept `YYYY-MM-DD`
or a valid ISO date-time; a date-only `to` bound includes the whole UTC
day. Unknown query parameters, invalid values and `from` after `to` return
`422 VALIDATION_ERROR`. Boolean filters accept `true`/`1`/`yes` and
`false`/`0`/`no` (case-insensitive).

## 23.1 Dashboard and users

GET /api/v1/admin/dashboard

Returns `200` with aggregate counts for users, customers, professionals,
businesses, technicians, services, jobs, verification requests,
certificates, reports and disputes.

GET /api/v1/admin/users

Query:

- `search` or `q`
- `status`: `PENDING`, `ACTIVE`, `SUSPENDED` or `DELETED`
- `role`: `CUSTOMER`, `PROFESSIONAL`, `BUSINESS_OWNER`,
  `BUSINESS_MANAGER`, `TECHNICIAN` or `ADMIN`
- `page`, `pageSize` (and the `page_size` alias)

GET /api/v1/admin/users/:id

Returns the safe user projection:

`id`, `email`, `phone`, `status`, `roles`, `emailVerifiedAt`, `createdAt`,
`updatedAt` and `lastLoginAt`. The list and detail use the same safe user
projection; `lastLoginAt` is null until a successful login is recorded.

POST /api/v1/admin/users/:id/suspend

POST /api/v1/admin/users/:id/reactivate

Both requests use an empty object body (`{}`); any body field is rejected
with `422 VALIDATION_ERROR`. They return the updated safe user with
`200`. A user can move from `PENDING` or `ACTIVE` to `SUSPENDED`, and from
`SUSPENDED` to `ACTIVE`. Reactivating a user that is not suspended,
suspending a user that is already suspended or deleted, and changing the
acting administrator's own account status return `409 CONFLICT`. Unknown
ids return `404 NOT_FOUND`; malformed ids return `422`.

## 23.2 Customers, professionals, businesses and technicians

GET /api/v1/admin/customers

GET /api/v1/admin/customers/:id

The customer list supports `search`/`q`, `page`, `pageSize` (or
`page_size`). Customer projections contain profile identity and contact
fields: `id`, `userId`, `businessId`, `firstName`, `lastName`,
`displayName`, `email`, `phone`, `preferredContact`, `createdAt` and
`updatedAt`.

The customer detail adds `jobs`, `reviews` and `summary`. Jobs are the
customer's newest 50 non-deleted jobs and include the safe provider and
service names. Reviews are the newest 50 reviews for the customer and use
the admin review projection. `summary` contains `jobCount`, `activeJobCount`, `reviewCount` and
`ratingAvg` for the detail context. The returned child arrays are bounded;
the summary is not a replacement for a separate paginated history query.

GET /api/v1/admin/professionals

GET /api/v1/admin/professionals/:id

The professional list supports `search`/`q`, `page`, `pageSize` (or
`page_size`) and `status` (or the `verificationStatus` alias): `UNVERIFIED`,
`PENDING`, `VERIFIED` or `REJECTED`. The projection contains profile
summary, verification state, activity, rating, location, service/portfolio/
certificate counts and timestamps; it does not contain private identity
verification data.

The professional detail adds `services`, `serviceAreas`, `portfolio`,
`certificates`, `identityVerification`, `reviews` and `summary`. Services,
areas, portfolio metadata, certificates and reviews are each bounded to
50 newest/relevant records. Service entries contain id, name, slug,
category id and category name; areas contain area name, city and province.
Portfolio entries contain project metadata and `imageCount`, not portfolio
image binaries or file references. `identityVerification` is a single safe
state object containing id, status and reviewed time, or null. Certificates
use the certificate projection and reviews use the review projection.
`summary` contains service, portfolio, certificate and review counts plus
rating average. Private identity document references and portfolio image
references are not included.

GET /api/v1/admin/businesses

GET /api/v1/admin/businesses/:id

The business list supports the same search and pagination parameters and
`status`/`verificationStatus` with the four verification values above. The
projection contains business identity, public/business contact and address
fields, verification state, activity, ratings, technician/service counts
and timestamps. It does not contain private verification documents or
internal audit data.

The business detail adds `owner`, `members`, `technicians`, `jobs` and
`summary`. `owner` is a safe user summary with id, email, phone, status,
roles and `lastLoginAt`; it does not include credentials or password
fields. `members` is bounded to 50 rows and contains user id, role,
active state, invited time and joined time. `technicians` is bounded to
50 roster rows and `jobs` to 50 newest business-owned jobs with a
customer name. `summary` contains member, technician, job and active-job
counts for the returned business detail. The detail is platform-wide for
an active ADMIN and does not require membership in the displayed business.

GET /api/v1/admin/technicians

GET /api/v1/admin/technicians/:id

The technician list supports `search`/`q`, `page`, `pageSize` (or
`page_size`), `businessId` (or `business_id`) and `isActive` (or
`active`). The projection contains roster identity, business/user ids,
display name, email, phone, active state and timestamps. There is no
admin technician assignment mutation in Stage 9.

The technician detail adds `business`, `assignedJobCount`, `jobs` and
`assignments`. `business` contains only id, name, city and province. The
newest 50 assigned jobs contain safe job fields plus customer and business
names. The newest 50 assignment records contain assignment type, linked
professional/business/technician ids, technician name, assigned-by id,
assigned/unassigned timestamps and active state. `assignedJobCount` is the
count represented by the returned job collection. The detail is an
administrative view; it does not create, change or revoke an assignment.

## 23.3 Services

GET /api/v1/admin/services/categories

Returns `200` with the unpaginated service-category array. The projection
contains `id`, `name`, `slug`, `description`, `isActive` and `sortOrder`.
There is no category mutation route.

GET /api/v1/admin/services

GET /api/v1/admin/services/:id

The service list supports `search`/`q`, `page`, `pageSize` (or
`page_size`), `categoryId` (or `category_id`), `status` (`ACTIVE` or
`INACTIVE`) and `isActive` (or `active`). When `isActive`/`active` and
`status` are both supplied, the explicit boolean filter takes precedence.
The service projection contains category identity/name/slug, name, slug,
description, active state, sort order and timestamps.

POST /api/v1/admin/services

Creates a service and returns `201` with the service projection.

Request fields:

- `categoryId` — required positive integer id
- `name` — required text, 1–128 characters
- `slug` — required text, 1–128 characters
- `description` — optional text, up to 128 characters, or null
- `sortOrder` — integer from 0 through 100000
- `isActive` — boolean

Unknown body fields are rejected. Duplicate service names within a
category or duplicate slugs return `409 CONFLICT`; an unknown category
returns `404 NOT_FOUND`; invalid body values return `422`.

PATCH /api/v1/admin/services/:id

Updates one or more of the same service fields and returns `200`. The
body must contain at least one service change and may not contain unknown
fields. The same category, duplicate and validation rules apply.

POST /api/v1/admin/services/:id/activate

POST /api/v1/admin/services/:id/deactivate

Use an empty object body. These return the updated service with `200`.
Activating an active service or deactivating an inactive service returns
`409 CONFLICT`.

## 23.4 Jobs

GET /api/v1/admin/jobs

GET /api/v1/admin/jobs/:id

The job list supports:

- `search`/`q`
- `page`, `pageSize` (or `page_size`)
- `source`: `MARKETPLACE` or `INTERNAL`
- `status`: `REQUESTED`, `QUOTED`, `ACCEPTED`, `SCHEDULED`,
  `IN_PROGRESS`, `AWAITING_PARTS`, `COMPLETED`, `CONFIRMED`, `CLOSED`,
  `CANCELLED` or `DISPUTED`
- `from`, `to` creation-date bounds
- `customerId`/`customer_id`, `professionalId`/`professional_id` and
  `businessId`/`business_id`

The job projection contains `id`, `reference`, `source`, `status`,
customer/professional/business/service ids, title, description, city,
province, `scheduledAt`, `agreedAmount`, `currency` and timestamps. The
job detail adds `timeline`, `quotes`, `assignments` and `documentation`.
Timeline entries contain previous status, status, reason and timestamp,
bounded to 100. Quotes are bounded to 50 and include provider/business
context, amount, currency, status, message, timestamps and quote items
(description, quantity, unit price, total and sort order). Assignment
history is bounded to 100 and uses the assignment projection. Documentation
contains images, updates, voice notes and parts-request metadata, each
bounded to 100; images include phase, original filename, MIME type, size,
uploader and timestamp, voice notes include author, original filename,
MIME type, size, duration and timestamp, and parts items include part name,
quantity, notes, `hasPhoto` and timestamp. The documentation projection
contains no image, voice-note or parts-photo storage references, file
keys, filesystem paths or binary content. The Stage 9 admin job surface
is read-only; it does not expose a job status mutation or a quote, media,
message or timeline intervention endpoint.

## 23.5 Verification and certificates

GET /api/v1/admin/verifications

GET /api/v1/admin/verifications/:id

The verification list supports `search`/`q`, `page`, `pageSize` (or
`page_size`), `type` (`IDENTITY`, `CERTIFICATE` or `BUSINESS`), `status`
(`PENDING`, `APPROVED`, `REJECTED` or `NEEDS_INFO`) and `userId` (or
`user_id`). The projection contains request id, user id/email, type,
status, reviewer/time/notes and timestamps. The document itself is not
part of the JSON response.

POST /api/v1/admin/verifications/:id/approve

POST /api/v1/admin/verifications/:id/reject

POST /api/v1/admin/verifications/:id/request-info

The approve request may use `{ "notes": null }`, or an optional 1–1000
character note. Reject and request-info require `notes` with 1–1000
characters. Unknown fields and missing required notes return `422`.

`PENDING` and `NEEDS_INFO` may be approved, rejected or returned for more
information. `APPROVED` and `REJECTED` are terminal and return `409
CONFLICT` for another decision. A `CERTIFICATE` verification request must
use the separate certificate workflow below. Identity and business
verification update the related verification state where applicable;
the professional and business verification projections remain separate.

GET /api/v1/admin/verifications/:id/document

Returns the protected identity-verification document as bytes with its
recorded safe MIME type, an attachment disposition and a sanitized
filename. Only `application/pdf`, `image/jpeg`, `image/png` and
`image/webp` are served. The response is not the standard JSON envelope.
The storage key, database document reference, filesystem path and internal
metadata are never returned. The endpoint requires an active ADMIN and
records `VERIFICATION_DOCUMENT_VIEWED` in the audit log after the file
is read successfully. Missing, unsupported or unreadable documents return
`404 NOT_FOUND`; malformed ids return `422`.

## 23.6 Certificates

GET /api/v1/admin/certificates

GET /api/v1/admin/certificates/:id

The certificate list supports `search`/`q`, `page`, `pageSize` (or
`page_size`), `status` (`PENDING`, `APPROVED`, `REJECTED` or
`NEEDS_INFO`), `professionalId` (or `professional_id`) and `businessId`
(or `business_id`). The projection contains owner ids/type, title,
issuer, issue/expiry dates, verification status, reviewer/time/notes and
timestamps. It does not contain the document reference or bytes.

POST /api/v1/admin/certificates/:id/approve

POST /api/v1/admin/certificates/:id/reject

POST /api/v1/admin/certificates/:id/request-info

These use the same `{ "notes": ... }` contract and note rules as
verification decisions. `PENDING` and `NEEDS_INFO` can receive a decision;
`APPROVED` and `REJECTED` are terminal. Unsafe, duplicate or out-of-state
decisions return `409 CONFLICT`.

GET /api/v1/admin/certificates/:id/document

Returns the protected certificate bytes with the same safe MIME,
attachment-disposition, sanitized-filename and audit-viewing rules as the
identity document endpoint. Storage references and paths are never
returned.

## 23.7 Reviews, reports and disputes

GET /api/v1/admin/reviews

GET /api/v1/admin/reviews/:id

The review list supports `search`/`q`, `page`, `pageSize` (or
`page_size`), `rating`, `minRating` (or `min_rating`) and `maxRating` (or
`max_rating`), each rating value being 1–5. The projection includes job,
customer, provider/business ids, display names, rating, comment, visibility
state and timestamps. Reviews are read-only in Stage 9; there is no
review moderation, visibility mutation or response route.

GET /api/v1/admin/reports

GET /api/v1/admin/reports/:id

The report list supports `search`/`q`, `page`, `pageSize` (or
`page_size`), `type` (or `reportType`/`report_type`: `PROVIDER`, `REVIEW`,
`JOB`, `USER` or `CONTENT`) and `status` (`OPEN`, `IN_REVIEW`, `RESOLVED`
or `DISMISSED`).

PATCH /api/v1/admin/reports/:id/status

Request:

{ "status": "OPEN | IN_REVIEW | RESOLVED | DISMISSED" }

`OPEN` may move to `IN_REVIEW`, `RESOLVED` or `DISMISSED`. `IN_REVIEW`
may move to `RESOLVED` or `DISMISSED`, but not back to `OPEN`. `RESOLVED`
and `DISMISSED` are terminal. Repeated, stale, terminal and backwards
transitions return `409 CONFLICT`; an invalid status/body returns `422`.
The updated report is returned with `200`.

GET /api/v1/admin/disputes

GET /api/v1/admin/disputes/:id

The dispute list supports `search`/`q`, `page`, `pageSize` (or
`page_size`) and `status` (`OPEN`, `IN_REVIEW`, `RESOLVED` or `CLOSED`).
The projection contains job id, opener, reason, description, status,
resolution, resolver/time and timestamps.

PATCH /api/v1/admin/disputes/:id

Request fields:

- `status` — required: `OPEN`, `IN_REVIEW`, `RESOLVED` or `CLOSED`
- `resolution` — required 1–1000 characters for `RESOLVED` or `CLOSED`;
  optional or null for `OPEN` and `IN_REVIEW`

The backend rejects same-status updates, terminal `RESOLVED` or `CLOSED`
updates, and `IN_REVIEW` → `OPEN`. `RESOLVED` and `CLOSED` are terminal;
invalid transition bodies return `409`, while invalid status/body values or
missing resolutions return `422`. The updated dispute is returned with
`200`.

## 23.8 Audit logs

GET /api/v1/admin/audit-logs

GET /api/v1/admin/audit-logs/:id

The audit list supports `search`/`q`, `page`, `pageSize` (or `page_size`),
`actorId` (or `actor_id`), `action`, `entityType` (or `entity_type`),
`entityId` (or `entity_id`) and `from`/`to`. The projection contains
`id`, actor id/email, action, entity type/id, `metadata`, IP address and
timestamp. Audit entries are read-only: no admin create, update or delete
route exists. Administrative state changes and document views are written
through the same audit mechanism; mutation and audit persistence are
atomic in the MySQL store and the memory store test double.

## 23.9 Admin response and safety rules

- Successful JSON operations return `200`, except service creation which
  returns `201`; the standard success envelope is used.
- Validation failures, unknown query parameters, unsupported body fields
  and malformed resource ids return `422 VALIDATION_ERROR`.
- Missing resources return `404 NOT_FOUND`; invalid state changes,
  duplicate service values and unsafe transitions return `409 CONFLICT`.
- Unexpected storage or persistence failures return the safe `500
  INTERNAL_ERROR` envelope without SQL, paths or stack traces.
- Nested detail collections are bounded server-side: customer, professional,
  business and technician child collections use a maximum of 50 records;
  job timeline, assignments and documentation collections use a maximum
  of 100 records, and job quotes use a maximum of 50. These are detail
  projections, not an unpaginated export of the underlying tables.
- Admin JSON projections intentionally exclude password hashes, plaintext
  passwords, access/refresh tokens, private verification/certificate
  document references, document MIME/storage metadata, storage keys,
  filesystem paths and file bytes. Nested job documentation returns safe
  metadata only; it never returns raw image, voice-note or parts-photo
  storage references or binary content. Binary documents are available only
  through the two protected document endpoints above.
- There is no admin settings endpoint, review moderation endpoint, job
  intervention endpoint, role-assignment endpoint or technician-assignment
  endpoint in Stage 9.
- No migration was created for Stage 9 because the existing users,
  profiles, services, jobs, verification, certificate, report, dispute and
  audit tables already support these operations. See `docs/ADMIN.md` for
  the operational boundary.


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


# 35. Provider Service Offerings

A provider describes their own services, with an indicative price, without
administrator approval. These routes are self-service and always scoped to
the caller's own provider identity.

    GET    /api/v1/provider/offerings
    GET    /api/v1/provider/offerings/:id
    POST   /api/v1/provider/offerings
    PATCH  /api/v1/provider/offerings/:id
    DELETE /api/v1/provider/offerings/:id

Implemented in `backend/src/modules/offerings/`.

## 35.1 Authorization

Requires `PROFESSIONAL`, `BUSINESS_OWNER` or `BUSINESS_MANAGER`.

- `CUSTOMER`, `TECHNICIAN` and `ADMIN` receive 403 `FORBIDDEN_ROLE`.
  Technicians are employees, never marketplace providers. Administrators
  manage the platform catalogue through `/admin/services`, not this surface.
- A provider role with no professional profile and no business membership
  receives 404 `NOT_FOUND`.
- Ownership is derived from the session, never from the request: the caller's
  `professional_profiles.user_id` row and the businesses they own or manage.
- An offering belonging to another provider reads as 404, so offering ids
  cannot be probed across providers.

## 35.2 Request bodies

`POST /api/v1/provider/offerings`:

    {
      "categoryId": "1",
      "name": "Burst Pipe Emergency Call-Out",
      "description": "Same-day call-out for burst pipes.",
      "priceAmount": 850.00,
      "providerType": "PROFESSIONAL"
    }

`PATCH /api/v1/provider/offerings/:id` accepts any subset of `categoryId`,
`name`, `description` and `priceAmount`.

Rules:

- `categoryId` must be an active platform `service_categories` row.
- `name` is required, at most 128 characters, unique per provider
  (409 `CONFLICT` on a duplicate).
- `description` is optional, at most 500 characters.
- `priceAmount` is **optional**, must be non-negative when supplied, and must
  have at most 2 decimal places so the DECIMAL(10,2) column cannot silently
  round it. Omitting it (or sending `null`) stores `NULL`: the provider offers
  the service but has not stated a starting price yet, which is what
  registration produces. Consumers must render `null` as "not set" and must
  NOT substitute a figure — see `docs/DATABASE.md` section 40.9a.
- `providerType` is create-only and optional. It is required only when the
  caller manages more than one provider, so the backend never guesses which
  identity to write under. Sending it on `PATCH` is rejected with 422.
- Unknown fields are rejected with 422, so a client cannot set
  server-owned values such as `professionalId`, `businessId`, `isActive` or
  `currency`.

## 35.3 Responses

`GET /api/v1/provider/offerings` returns the standard list envelope:

    {
      "success": true,
      "data": {
        "items": [ { "id": "1", "providerType": "PROFESSIONAL", "providerId": "1",
                     "categoryId": "1", "categoryName": "Plumbing",
                     "categorySlug": "plumbing", "name": "...",
                     "description": null, "priceAmount": 850,
                     "currency": "ZAR", "isActive": true,
                     "createdAt": "...", "updatedAt": "..." } ],
        "total": 1
      },
      "message": "Services retrieved."
    }

## 35.4 Removal

`DELETE` is refused with 409 `CONFLICT` while any non-terminal job still
references the offering:

    REQUESTED, QUOTED, ACCEPTED, SCHEDULED, IN_PROGRESS, AWAITING_PARTS, DISPUTED

Once only terminal jobs reference it (`COMPLETED`, `CONFIRMED`, `CLOSED`,
`CANCELLED`) removal succeeds and is idempotent. Removal is a soft delete, so
closed job history keeps resolving the service it was booked against.

## 35.5 Indicative pricing

`priceAmount` is an indicative starting price in ZAR. The MVP does not
process payments: the customer and provider arrange payment directly and the
platform records the agreed quote. This figure is displayed as a
starting-from price and is never charged, never enforced against a submitted
quote, and never treated as an agreed amount.

`priceAmount` is **nullable**. `null` means the provider has not stated a
price yet — services are chosen at registration, before login, so the figure
is filled in later on My Services. `null` must be rendered as "no price
stated", never as R0. A provider card's `fromPrice` is the lowest stated
price across live offerings (§7.1), skipping unpriced ones rather than
counting them as free.

## 35.6 Public visibility

A live offering appears on the provider's public marketplace profile at
`GET /api/v1/providers/:id` under `offerings`, alongside the platform
catalogue services in `services`. Removed offerings are never returned
publicly.

Provider-authored services are stored in `service_offerings`
(migration 015), not as rows in the admin-owned `services` table, because
`services` enforces `UNIQUE(slug)` and `UNIQUE(category_id, name)` globally
and therefore cannot hold two providers offering the same service name. See
docs/DATABASE.md section 9.
