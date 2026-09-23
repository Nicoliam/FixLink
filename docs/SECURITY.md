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
