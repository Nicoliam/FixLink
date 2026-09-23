# FixLink — File Storage

## 1. Purpose

This document defines how FixLink stores user-uploaded files.

Rule:

User → Backend → File Storage → Metadata → MySQL.

The frontend never communicates with MySQL. Binary file content is
never stored in MySQL — the database keeps metadata and references
only.

## 2. Stage 6F Implementation — Job Photos (Implemented 2026-09-23)

### 2.1 Job image flow

Provider (multipart `image` + `phase`)
↓
`POST /api/v1/jobs/:jobId/images` (authenticated, provider-authorized,
job must be `IN_PROGRESS`)
↓
Server-side validation (phase, MIME, size, magic bytes — §2.2)
↓
`LocalFileStorage.save` → `backend/uploads/job-images/<jobId>/<randomHex>.<ext>`
↓
Metadata row in `job_images`
(`job_id`, `uploader_id`, `phase`, `file_reference` = opaque storage
key, `original_filename` sanitized, `mime_type`, `file_size`)
↓
`201` with the metadata (no binary, no path, no storage key)

Retrieval:

Owning customer or addressed provider
↓
`GET /api/v1/jobs/:jobId/images` (metadata list)
↓
`GET /api/v1/jobs/:jobId/images/:imageId/file` (bytes with the
recorded MIME type, `Content-Disposition: inline`)

Deletion removes the metadata row and the stored bytes (best effort);
`job_status_history` and timeline records are never rewritten.

### 2.2 Supported image types

Allowed:

- `image/jpeg` (`.jpg`)
- `image/png` (`.png`)
- `image/webp` (`.webp`)

Limits:

- 5MB maximum per file (`JOB_IMAGE_MAX_BYTES`)
- One file per request
- Non-empty content required

The stored type is detected from magic bytes (JPEG `FF D8 FF`, PNG
`89 50 4E 47 …`, WebP `RIFF…WEBP`); a mismatch with the claimed MIME
is rejected. Client-provided extensions are never trusted.

Rejected:

- Executable files
- Arbitrary binary files
- Invalid/spoofed MIME types
- Oversized files
- Path-traversal filenames (originals are sanitized with `basename`
  and never used for storage paths)

### 2.3 Private job media

Job photos are private job records by default:

- The owning customer can see photos for their own job.
- The addressed provider/business can see photos for that job.
- Every other user (including other customers/providers) receives
  `404 NOT_FOUND`; unauthenticated callers receive `401`.
- File bytes are only served through the authorized backend route —
  there are no public URLs, no raw filesystem paths and no storage
  keys in any API response.
- Job photos are never published to the provider's public portfolio
  automatically; portfolio publishing is a separate explicit action
  (later stage).

### 2.4 Authorization

Enforced server-side on every media route:

- Upload / note / delete / complete: addressed `PROFESSIONAL` /
  `BUSINESS_OWNER` / `BUSINESS_MANAGER` on an `IN_PROGRESS`
  `MARKETPLACE` job. `CUSTOMER`, `TECHNICIAN` and unrelated
  providers are rejected (`403` / `404`).
- Retrieval (list, bytes, updates, timeline): owning customer or
  addressed provider only.
- Deletion additionally requires the caller to be the uploader and
  the job to still be `IN_PROGRESS` — completed/closed jobs keep
  their media immutable.

### 2.5 Metadata storage

`job_images` (migration 005, extended by 009):

- `id`, `job_id`, `uploader_id`, `phase` (`BEFORE`/`DURING`/`AFTER`)
- `file_reference` — opaque storage key (never a filesystem path)
- `original_filename` (009, nullable, sanitized display name)
- `mime_type`, `file_size`, `created_at`

`job_updates` (migration 005, extended by 009):

- `id`, `job_id`, `author_id`, `phase` (009, nullable;
  pre-009 rows read as `DURING`), `message`, timestamps

No `BLOB`/`BINARY` columns exist in any file-metadata table (verified
by `database/tests/schema.test.js`).

### 2.6 Local development storage

The MVP adapter (`backend/src/services/file-storage.ts`,
`LocalFileStorage`) writes under `backend/uploads/` (gitignored via
the repo-root `uploads/` rule). Override with the `FILE_STORAGE_DIR`
environment variable (tests use isolated tmp dirs).

### 2.7 Future object-storage compatibility

`FileStorage` (`save`/`read`/`remove` over opaque storage keys) is the
single seam for a future S3-compatible implementation: routes,
services and the database schema do not change when the adapter is
swapped. Cloud/object storage is NOT implemented in Stage 6F — no S3
dependency, credentials or buckets exist.
