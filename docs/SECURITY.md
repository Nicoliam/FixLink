# FixLink — Security

## 1. Purpose

This document records the security controls enforced by the FixLink
backend. Frontend checks are user experience only — every control below
is enforced server-side.

## 2. Stage 6F — Job Execution Security (Implemented 2026-09-23)

### 2.1 Private job photos

- Job media is private by default: only the owning customer and the
  addressed provider/business can list, download, note or timeline a
  job's work record.
- Cross-account access reads as `404 NOT_FOUND` (never `403`), so job
  and image ids cannot be probed across customers/providers.
- No API response contains filesystem paths, storage keys or file
  bytes except the authorized single-file download (correct MIME,
  `inline` disposition, private cache).

### 2.2 Secure upload handling

- Multipart uploads use in-memory buffering with a 5MB cap
  (`LIMIT_FILE_SIZE` maps to `422`, never `500`).
- MIME allowlist: `image/jpeg`, `image/png`, `image/webp`.
- Content sniffing: magic bytes must match the claimed MIME —
  spoofed extensions and renamed executables are rejected.
- Filenames are generated server-side
  (`job-images/<jobId>/<randomHex>.<ext>`); originals are sanitized
  (`basename`, control-character strip, 255-char cap) and never used
  for paths — no path traversal is possible.
- Storage keys are validated against a strict pattern before any
  filesystem access, and resolved paths must stay inside the storage
  base directory.

### 2.3 State and authorization enforcement

- Job transitions (`IN_PROGRESS → COMPLETED → CONFIRMED → CLOSED`)
  are validated against the live row under lock, with guarded status
  updates — concurrent calls cannot double-transition.
- `TECHNICIAN` actors are rejected from marketplace execution
  (`403`); customers can never perform provider actions and providers
  can never confirm jobs.
- `CLOSED` jobs reject every modification (`422`).

### 2.4 Logging

- Logs and error responses never include image contents, storage
  credentials, passwords, tokens, ID documents or verification
  material.
- Client errors return the standard `{ success: false, error: { code,
  message } }` envelope with no stack traces, SQL or internal paths.

## 3. Stage 10 — Security hardening controls

### 3.1 Authentication and session controls

- Access tokens are short-lived signed tokens. Protected routes reload the
  user record and authoritative roles from the server on every request.
- Self-registration accepts only `CUSTOMER`, `PROFESSIONAL`, and
  `BUSINESS_OWNER`; `ADMIN`, `TECHNICIAN`, and `BUSINESS_MANAGER` cannot be
  self-assigned.
- Refresh tokens are opaque, stored only as SHA-256 hashes, rotated on use,
  revoked on logout, and consumed atomically so concurrent replay succeeds
  at most once.
- MySQL production deployments persist refresh sessions in
  `refresh_tokens`; memory sessions remain available for tests and local
  memory-mode development.
- Production startup rejects missing, example, or short JWT secrets.
- Login, registration, refresh, and admin routes have bounded process-local
  rate limits. Production deployments requiring multiple API instances must
  provide an equivalent shared limiter at the gateway or replace the
  process-local store.

### 3.2 Authorization and isolation

- Authorization is server-side. Angular guards and navigation are only UX
  controls and are not security boundaries.
- Customer job reads require both customer ownership and
  `source = MARKETPLACE`.
- Business identity is resolved from authenticated membership. Business
  customers, jobs, technicians, assignments, parts, approvals, timelines,
  and private files are scoped to that business and cross-business ids are
  hidden as not found.
- Admin routes require an authoritative active `ADMIN` role. Admin document
  downloads are audited and private.

### 3.3 File and response privacy

- Uploaded bytes are stored outside MySQL; database rows contain metadata
  and opaque storage references.
- Uploaded images and audio are checked against MIME allowlists, magic
  bytes, size limits, and storage-key path rules.
- Authorized private file responses use `Cache-Control: no-store` and
  `Pragma: no-cache` so shared devices do not retain sensitive media.
- Public marketplace DTOs do not return profile, portfolio, or certificate
  storage references. Private verification and certificate document
  references are never returned by public routes.

### 3.4 Input and error handling

- Request values are validated server-side, SQL values are parameterized,
  search wildcards are escaped, and API errors use safe structured messages.
- Quote currency is restricted to `ZAR`; when quote line items are supplied,
  the header total must equal the server-calculated item sum.
- Rate limiting, Helmet headers, JSON body limits, and multipart limits are
  intentional abuse controls, not replacements for authorization.

## 4. Known limitations

- The default local refresh-session and rate-limit implementations are
  process-local. A multi-instance deployment must use the MySQL refresh
  store and a shared gateway or rate-limit store.
- Bearer tokens are currently held by the Angular client for the existing
  authentication flow. Deployment must use a restrictive CSP and secure
  headers; moving to HttpOnly cookies with CSRF protection remains future
  work.
- Registration currently returns a duplicate-email response for user-facing
  validation. Account enumeration is therefore a known limitation.
- Uploads and downloads are buffered in memory in the current local storage
  adapter. Streaming storage and a reverse-proxy upload limit are deferred
  for the storage deployment stage.
- Stage 10 does not claim certification or compliance with an external
  security standard.
