# FixLink Stage 11 — Full System Test Report

## 1. Test Environment

- Date: 2026-09-25
- Repository: FixLink repository (repository root)
- Repository commit under test: `f17b0b9 fix(security): harden authentication and platform boundaries`
- Platform: macOS on Darwin
- Node.js: `v24.16.0`
- npm: `11.13.0`
- Backend: Node.js/TypeScript modular monolith
- Frontend: Angular 21 standalone application
- Database: MySQL 8 in Docker, exposed on port `3307`
- Database name: `fixlink`
- Backend automated tests use isolated in-memory stores, as documented in `docs/TEST-PLAN.md`.
- Database and MySQL-backed smoke tests used the local Docker database.

### Stage 11 test plan based on the current implementation

1. Validate the current repository, route, guard, module, migration, seed, documentation, and test commands.
2. Run the complete MySQL migration, seed, schema, constraint, lifecycle, privacy, and money-integrity suite.
3. Run the complete backend API suite covering authentication, marketplace, business, technician, internal jobs, execution, parts, notifications, admin, privacy, and authorization.
4. Run MySQL-backed smoke checks for health, public marketplace, seeded role authentication, refresh rotation, logout, protected role routes, and DTO privacy.
5. Run frontend TypeScript checking and production build. Run the documented Angular test runner once; record an environment failure if it does not reach test execution.
6. Review Angular route configuration, guards, authentication services, token handling, lazy loading, and API interception.
7. Classify unresolved issues without adding product scope.

## 2. Repository Commit

The working tree was clean before testing at commit `f17b0b9`.

The following files were changed during Stage 11 to correct the seeded authentication integration defect:

- `database/seeders/002_users_profiles.sql`
- `database/seeders/005_marketplace_6a.sql`
- `database/tests/schema.test.js`

No commit, staging, push, product-scope change, payment change, role change, or job-table change was performed.

## 3. Database Status

Docker status:

- Container: `fixlink-mysql`
- Image: `mysql:8.0`
- Status: running
- Port mapping: `3307:3306`

Migration status:

- Applied migrations: 13
- Pending migrations: 0
- Applied versions: `001_identity` through `013_parts_review_notes_length`

Seed status:

- Applied seed files: 5
- Pending seed files: 0

The development database was rebuilt through the documented `npm run db:rebuild` command after the seed-hash fix, then migrations and seeds were reapplied successfully.

Database regression:

- Tests: 33
- Suites: 7
- Passed: 33
- Failed: 0
- Cancelled: 0
- Skipped: 0
- Todo: 0
- Duration: 241.540667 ms

Verified:

- All expected domain tables exist.
- No split `marketplace_jobs`, `business_jobs`, or `technician_jobs` tables exist.
- No payment, escrow, subscription, or other out-of-scope tables exist.
- Exactly one `jobs` table exists.
- `schema_migrations` count matches the migration files.
- Foreign keys and unique constraints reject invalid inserts.
- `MARKETPLACE` and `INTERNAL` sources are present.
- All documented lifecycle enum values are present.
- `refresh_tokens` stores hashed metadata and revocation state.
- `review_notes` is length 1000 as required by application validation.
- Job and assignment history is preserved in seed data.
- File metadata tables contain no binary columns.
- ZAR and server-derived quote item totals are present.
- Seeded users now have bcrypt-compatible password hashes.
- Seed data remains fictional development data.

## 4. Authentication

Backend authentication coverage passed in the full 409-test suite, including:

- Customer, professional, business-owner, and owner-managed technician registration/login paths.
- Duplicate registration rejection.
- Generic login failure responses.
- Missing, malformed, and expired access tokens.
- Authoritative suspended/deleted-user rejection.
- Refresh rotation.
- Old refresh-token replay rejection.
- Concurrent refresh replay protection.
- Logout invalidation.
- Password and hash non-disclosure.
- Self-registration restrictions for privileged roles.

MySQL-backed smoke test:

- Health endpoint: `200`.
- Public marketplace endpoint: `200`.
- Unauthenticated protected endpoint: `401`.
- Seeded customer login: `200`; `/api/v1/auth/me`: `200`; customer job list: `200`.
- Seeded professional login: `200`; `/api/v1/auth/me`: `200`; provider request inbox: `200`.
- Seeded business owner login: `200`; `/api/v1/auth/me`: `200`; business profile: `200`.
- Seeded technician login: `200`; `/api/v1/auth/me`: `200`; technician My Jobs: `200`.
- Seeded admin login: `200`; `/api/v1/auth/me`: `200`; admin dashboard: `200`.
- Refresh rotation: `200`.
- Replay of the old refresh token: `401`.
- Logout: `200`.
- Refresh after logout: `401`.

No credentials or token values are included in this report.

## 5. Customer Marketplace Journey

The backend suite exercised the complete API-level marketplace journey:

1. Public service and category retrieval.
2. Provider search and all documented filters.
3. Professional and business provider profiles.
4. Service areas.
5. Portfolio and Before/After metadata.
6. Approved certificates without document references.
7. Reviews with limited reviewer names.
8. Customer marketplace job creation with `MARKETPLACE` source and server ownership.
9. Provider request inbox and request detail.
10. Quote submission and `REQUESTED → QUOTED` transition.
11. Customer quote retrieval and acceptance.
12. `QUOTED → ACCEPTED` history and accepted price persistence.
13. Provider scheduling and `ACCEPTED → SCHEDULED` transition.
14. Provider start and `SCHEDULED → IN_PROGRESS` transition.
15. BEFORE, DURING, and AFTER documentation.
16. Completion and customer confirmation.
17. Final history, timeline, and `COMPLETED → CONFIRMED → CLOSED` transitions.
18. Notification events for request, quote, acceptance, schedule, start, completion, and confirmation.

Isolation and negative cases also passed:

- Customer cannot submit quotes, start work, upload provider work, complete jobs, or confirm another customer’s job.
- Internal jobs do not appear through customer marketplace job endpoints.
- Spoofed ownership, status, and source fields are ignored.
- Public provider responses do not expose private document or credential fields.

The frontend contains the corresponding customer, provider request, request detail, My Jobs, job detail, quote acceptance, and notification services and routes. No browser-level E2E runner is configured; backend API coverage and frontend unit/component coverage are the available evidence.

Direct-payment MVP wording remains in the implemented customer acceptance flow. No payment gateway, escrow, payment table, payment API, or payment invocation was found or exercised.

## 6. Business Marketplace Journey

The backend suite exercised:

- Business-provider marketplace requests.
- Business owner and manager request inbox access.
- Marketplace job request delivery to business owners/managers.
- Provider quote submission for business jobs.
- Customer quote acceptance.
- Business provider scheduling and start.
- Technician assignment/reassignment authorization.
- Business owner/manager visibility of execution documentation.
- Business isolation for requests, jobs, technicians, parts, timelines, and private media.
- Marketplace jobs being rejected by the internal parts-approval flow.
- Technician access to marketplace provider inbox being rejected.
- Manager and owner access to unrelated business data being rejected.
- Notification scoping and actor exclusion.

## 7. Internal Business Job Journey

The backend suite exercised:

- Owner/manager creation of an `INTERNAL` job.
- Business-managed customer ownership.
- `INTERNAL` source preservation.
- Internal job list and detail endpoints.
- Cross-business isolation.
- Marketplace job exclusion from internal job lists.
- Technician My Jobs access.
- Technician assignment and reassignment.
- Assignment history.
- Status history.
- Cancellation from an eligible state.
- Timeline ordering.
- Parts request and approval workflow.
- `IN_PROGRESS → AWAITING_PARTS → IN_PROGRESS` transitions.
- Internal completion and business history.

The database test confirmed seeded internal jobs link to a business and business-managed customer.

## 8. Technician

The backend suite verified that technicians can:

- Authenticate.
- Read their own technician record.
- List and open assigned jobs.
- Start eligible internal jobs.
- Upload BEFORE, DURING, and AFTER photos.
- Create progress updates.
- Upload voice notes.
- Create parts requests.
- View parts requests.
- Respond to more-information requests.
- Resume when approved parts are available.
- Complete assigned jobs.

The suite verified that technicians cannot:

- Manage technicians.
- Assign jobs.
- Access another technician’s job.
- Access another business.
- Quote marketplace jobs.
- Access the marketplace provider inbox.
- Approve parts.
- Access unrelated business data.
- Access private admin resources.

Cross-business and cross-technician identifiers are hidden as not found.

## 9. Business Owner

The backend suite verified owner access to:

- Business profile.
- Business customer records.
- Technician roster and records.
- Internal jobs and job board.
- Marketplace business requests.
- Job assignment and reassignment.
- Parts requests.
- Approval, rejection, more-info, and availability operations.
- Execution documentation and timelines.
- Job history and operational reports.

Owner-only profile modification and owner-only business boundary behavior passed. Cross-business access returned not found.

## 10. Business Manager

The backend suite verified manager access to permitted:

- Business profile read.
- Customer management.
- Technician management.
- Internal jobs and job board.
- Marketplace business requests.
- Assignment and reassignment.
- Parts requests.
- Approval, rejection, more-info, and availability operations.
- Execution visibility.
- Job history and permitted reports.

The suite verified that managers cannot update protected business profile fields and cannot cross business boundaries.

## 11. Admin

The backend suite verified:

- Active `ADMIN` authorization.
- Non-admin rejection.
- Dashboard.
- Users and safe user details.
- Customer, professional, business, and technician projections.
- Services and categories.
- Jobs and source/status filters.
- Verification and certificate workflows.
- Reviews, reports, disputes, and audit logs.
- Guarded report and dispute transitions.
- Private document streaming authorization.
- Audit creation for document access and administrative actions.
- Absence of passwords, hashes, tokens, private storage references, and internal paths from admin JSON projections.

MySQL-backed smoke checks returned `200` for the current admin list endpoints:

- Users
- Customers
- Professionals
- Businesses
- Technicians
- Jobs
- Verifications
- Certificates
- Reviews
- Reports
- Disputes
- Audit logs

The frontend `/admin/settings` surface is explicitly not configured, and no backend `/api/v1/admin/settings` endpoint exists. This is recorded as a P2 limitation below.

## 12. File and Media Security

Automated backend coverage passed for:

- JPEG, PNG, and WebP image handling contract.
- Invalid MIME/content mismatch rejection.
- Spoofed image content rejection.
- Oversized image rejection.
- Server-generated storage keys.
- Unsafe storage-key rejection.
- Path traversal protection.
- Private metadata-only responses.
- Authorized image download.
- Unauthorized image retrieval rejection.
- Cross-customer and cross-provider image isolation.
- Uploader deletion while work is in progress.
- Post-completion deletion rejection.
- Voice note metadata and streaming.
- Supported voice containers including WAV, OGG, and MP4.
- Unsupported audio and MIME/content mismatch rejection.
- Voice notes over 10 MB rejection.
- Cross-business voice-note isolation.
- Parts-request photo evidence authorization.
- Private no-cache file responses as covered by the execution/admin tests.
- Binary files remain outside MySQL; the database test found no binary columns in file-metadata tables.

Actual binary upload/download browser testing was not performed in this environment; the available evidence is the complete backend automated suite and local-storage adapter tests.

## 13. Quotes and Money

The backend suite verified:

- Valid ZAR quotes.
- Non-ZAR currency rejection.
- Invalid and over-limit amounts.
- Invalid line-item descriptions, quantities, and prices.
- Server-derived line-item totals.
- Header-total/line-item mismatch rejection.
- Duplicate quote rejection.
- Competing quote handling.
- Accepted quote state and price persistence.
- Customer/provider quote retrieval permissions.
- Rejection of marketplace acceptance for internal jobs.
- No payment gateway, payment transaction, escrow, or payment processing flow.

The database test verified that seeded job currency is ZAR and quote item totals equal quantity multiplied by unit price.

## 14. Job Lifecycle

The database and backend suites verified all documented states:

- `REQUESTED`
- `QUOTED`
- `ACCEPTED`
- `SCHEDULED`
- `IN_PROGRESS`
- `AWAITING_PARTS`
- `COMPLETED`
- `CONFIRMED`
- `CLOSED`
- `CANCELLED`
- `DISPUTED`

Verified behavior includes:

- Valid transitions.
- Invalid transition rejection.
- Terminal-state protection.
- Status history preservation.
- Assignment history preservation.
- Timeline ordering.
- Rollback on failed state-changing operations.
- Notification side effects after successful changes.
- Customer/provider/technician/business role restrictions.

No new lifecycle state was introduced.

## 15. Notifications

The backend suite verified creation, recipient scoping, isolation, and inbox behavior for:

- Marketplace job requests.
- Quote received, accepted, scheduled, started, completed, and confirmed events.
- Technician assigned and reassigned events.
- Technician start, update, work-documentation, and completion events.
- Parts requested, approved, rejected, more-info, available, and technician response events.

Inbox behavior verified:

- Unread count.
- Unread-only filtering.
- Pagination.
- Mark one read.
- Mark all read.
- Foreign notification IDs read as not found.
- Client-supplied user IDs do not select another inbox.
- Actor exclusion.
- Cross-business and customer/internal separation.
- Notification delivery failure does not roll back the business operation.

## 16. Privacy / DTO Review

Actual MySQL-backed public and admin response inspection returned no keys matching password, password hash, refresh token, access token, document reference, file reference, storage key, file path, identity document, or private note patterns.

The following public endpoints returned `200` with no detected forbidden projection keys:

- Provider search.
- Professional provider profile.
- Portfolio.
- Certificates.
- Reviews.

The following admin list endpoints returned `200` with no detected forbidden projection keys:

- Users.
- Customers.
- Professionals.
- Businesses.
- Technicians.
- Jobs.
- Verifications.
- Certificates.
- Reviews.
- Reports.
- Disputes.
- Audit logs.

Backend automated tests additionally verified that private document downloads are authorized, audited, and do not expose storage references or paths.

## 17. Frontend Integration

Static review covered:

- Angular standalone route configuration.
- Lazy-loaded route components.
- Authentication guard and guest guard.
- Admin guard and admin child guard.
- Customer job routes.
- Marketplace and provider routes.
- Business and technician routes.
- Admin route tree.
- Authentication state restoration.
- Access-token attachment.
- Single-flight refresh and one retry protection.
- Local token persistence and clearing.
- API service mapping and error handling.

Verification:

- Frontend TypeScript check: passed with `npx tsc -p tsconfig.json --noEmit`.
- Angular production build: passed with `npx ng build --configuration production`.
- Build duration reported by Angular: 9.955 seconds.
- Production output: `apps/web/dist/web`.

Frontend test runner:

- Command attempted once: `npx ng test --watch=false`.
- The runner did not reach test execution and exceeded the 120-second environment limit.
- It was not repeatedly rerun, as required.
- Current test count is therefore not available from this run.
- The repository’s last documented result is 310 passing tests across 35 test files in `docs/CHANGELOG.md`; this is prior evidence, not a claim about the current run.

## 18. Regression Results

| Suite | Tests | Passed | Failed | Cancelled | Skipped | Duration |
|---|---:|---:|---:|---:|---:|---:|
| Database | 33 | 33 | 0 | 0 | 0 | 241.540667 ms |
| Backend | 409 | 409 | 0 | 0 | 0 | 12476.751917 ms |
| Frontend Angular tests | Not reached | Not available | Not available | Not available | Not available | Runner exceeded 120 s |
| Frontend TypeScript | N/A | Passed | 0 | 0 | 0 | Completed |
| Frontend production build | N/A | Passed | 0 | 0 | 0 | 9.955 s reported |
| MySQL integration smoke | 5 role logins plus public/auth/refresh/privacy checks | Passed | 0 | 0 | 0 | Completed |

Additional environment limitation:

- Backend `npm run typecheck` and `npm run build` were attempted at 120 seconds and again at 300 seconds without compiler completion or diagnostics. A bounded 60-second `tsc --listFilesOnly` attempt also timed out. The backend functional suite using `tsx` completed successfully; this is recorded as a tooling/environment limitation, not a compile pass.

## 19. Defects

### D-001 — Seeded authentication hashes incompatible with current bcrypt authentication

- Severity: P1
- Status: Resolved
- Affected roles: All seeded roles using MySQL authentication
- Affected flow: Registration/login and any protected route using seeded accounts
- Endpoint/component: `POST /api/v1/auth/login`, database seed files
- Reproduction: Before the fix, a MySQL-backed seeded account returned `401 INVALID_CREDENTIALS` when using the documented development seed credential.
- Expected: Seeded account login succeeds and returns the safe user/session response.
- Actual: Login failed because seed hashes were scrypt while `verifyPassword()` uses bcrypt.
- Likely cause: Seed data was created before the Stage 5 bcrypt authentication implementation and was not migrated to the current hash format.
- Recommended action: Replace development seed hashes with bcrypt-compatible hashes, update seed documentation, and add a regression assertion. This was implemented in Stage 11 by updating both user seeder files and adding a bcrypt-format seed test.
- Verification: Database rebuild, 33/33 database tests, 409/409 backend tests, and MySQL-backed role/login smoke checks passed after the fix.

### D-002 — Admin settings surface is not implemented

- Severity: P2
- Status: Open; not fixed in Stage 11
- Affected role: `ADMIN`
- Affected flow: Platform settings
- Endpoint/component: Angular `/admin/settings`; no backend `/api/v1/admin/settings` route
- Reproduction: Admin navigation exposes the settings area, while the current implementation returns its not-configured state and no settings API exists.
- Expected: The documented admin settings capability is available if retained in the approved scope.
- Actual: Settings management is not implemented.
- Likely cause: Explicit Stage 9 implementation limitation recorded in `docs/CHANGELOG.md`.
- Recommended action: Confirm whether settings belong in the MVP scope, then implement or remove the surface in a separately approved change. No settings feature was added during Stage 11.

### Environment limitations — Not product defects

- Current Angular test runner did not reach test execution before the environment timeout.
- Backend TypeScript build/typecheck did not complete within bounded attempts and emitted no diagnostic.
- Browser-level E2E and manual mobile testing were not available in the current environment.

## 20. Known Limitations

- Automated backend journey coverage uses isolated in-memory stores; MySQL-backed smoke coverage was limited to health, public marketplace, authentication, protected role access, refresh/logout, and DTO privacy.
- No browser E2E runner is configured.
- Current Angular test execution is environment-limited; prior repository documentation records 310 passing tests across 35 files.
- Backend TypeScript typecheck/build completion is environment-limited in this run, although the full backend runtime test suite passed.
- Admin settings are not implemented.
- Local refresh sessions and rate-limit stores are process-local by default; multi-instance deployment requires the documented shared-store/gateway approach.
- Angular currently stores bearer tokens in browser local storage; deployment requires restrictive security headers/CSP. HttpOnly cookies and CSRF protection remain future work.
- Local file storage is the MVP adapter and buffers uploads in memory; object storage and streaming deployment controls are deferred.
- The MVP remains direct customer payment to the professional/business; no payment processing is implemented.

## 21. UAT Readiness

Status: **PASS WITH LIMITATIONS**

Core marketplace, business, internal-job, technician, quote, lifecycle, notification, media, privacy, authorization, and database workflows are covered by passing automated suites and the MySQL smoke checks. The resolved P1 seed authentication defect no longer blocks seeded-role testing.

UAT should not be treated as fully complete until:

1. The Angular test suite is run successfully in a supported test environment.
2. The admin settings scope is confirmed and either implemented in an approved change or formally excluded from this stage’s UAT criteria.
3. Browser/mobile acceptance testing is performed for the critical customer and technician flows.
4. The backend typecheck/build limitation is resolved or verified in CI.

## 22. Recommended Next Step

Review this report and the three intended source changes. Do not commit or push until review is complete. The next technical action should be to run the Angular tests in a supported environment and decide the approved handling of the existing admin settings limitation.

---

STAGE 11 STATUS:
PASS WITH LIMITATIONS

Tests:
- Database: 33 passed, 0 failed, 0 cancelled, 0 skipped
- Backend: 409 passed, 0 failed, 0 cancelled, 0 skipped
- Frontend: TypeScript passed; production build passed; current Angular test run did not reach results
- Integration: MySQL role/auth/refresh/public/privacy smoke checks passed
- Security: Backend authorization, isolation, file privacy, DTO, admin, and quote-integrity suites passed

Defects:
- P0: 0
- P1: 1 resolved, 0 open
- P2: 1 open
- P3: 0 product defects; environment limitations recorded

Known limitations:
- Angular test runner did not reach test execution within the environment limit
- Backend typecheck/build did not complete within bounded attempts
- No browser E2E runner or manual mobile acceptance run
- Admin settings is an existing not-implemented surface

Files changed:
- `database/seeders/002_users_profiles.sql`
- `database/seeders/005_marketplace_6a.sql`
- `database/tests/schema.test.js`
- `docs/STAGE-11-FULL-SYSTEM-TEST-REPORT.md`

Git status:
- Modified intended files only
- No files staged
- No commit performed
- No push performed
