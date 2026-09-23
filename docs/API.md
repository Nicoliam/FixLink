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


# 14. Job Media

POST /api/v1/jobs/:id/images

GET /api/v1/jobs/:id/images

DELETE /api/v1/jobs/:id/images/:imageId


# 15. Job Updates

POST /api/v1/jobs/:id/updates

GET /api/v1/jobs/:id/updates


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
