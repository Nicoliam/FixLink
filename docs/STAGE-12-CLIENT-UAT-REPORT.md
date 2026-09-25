# FixLink Client UAT Report

## 1. Test Environment

- Date: 2026-09-25
- Platform: macOS on Darwin
- Node.js: v24.16.0; npm: 11.13.0
- Documented prerequisite: Node.js 22.12.0
- Repository: FixLink
- API: `http://localhost:3000`
- Web: `http://localhost:4200`
- Database: MySQL 8 in Docker, `fixlink-mysql`, host port `3307`, database `fixlink`
- Backend authentication store: `AUTH_STORE=mysql`
- Database state: existing development/UAT database retained; no destructive reset performed
- Migrations: 13 applied, 0 pending
- Seed files: 5 applied, 0 pending
- Test data: additional fictional UAT registrations, customers, marketplace jobs, internal jobs, parts requests, media and notifications were created and retained for evidence
- Browser automation: no configured browser E2E runner; API and Angular route HTTP checks were executed

## 2. Build / Commit Tested

- Baseline commit: `6f66711 docs: prepare client UAT and deployment handover`
- Working tree was clean before UAT execution.
- No commit, push or staging was performed.
- A UAT defect fix is currently uncommitted in the working tree:
  - `backend/src/modules/business/mysql-business.store.ts`
  - `backend/tests/business-mysql-search.test.ts`
- Documentation change:
  - `docs/STAGE-12-CLIENT-UAT-REPORT.md`

## 3. Test Accounts

The following documented fictional development accounts were used. Passwords and tokens are intentionally omitted.

| Role | Account |
|---|---|
| Customer | `naledi.dlamini@example.co.za` |
| Isolated customer | `pieter.vdm@example.co.za` |
| Individual professional | `sipho.ndlovu@example.co.za` |
| Isolated professional/provider data | `kabelo.mahlangu@example.co.za` was available in seed data but was not required for the live lifecycle |
| Business owner | `thabo.maseko@example.co.za` |
| Business manager | `lerato.khumalo@example.co.za` |
| Technician | `bongani.zulu@example.co.za` |
| Isolated technician | `karin.meyer@example.co.za` |
| Second business owner | `thandi.khumalo@example.co.za` |
| Admin | `admin@fixlink.example.co.za` |

All documented seeded roles authenticated successfully. Additional time-stamped fictional customer and professional registrations were created for registration testing.

## 4. Test Summary

The live execution used API requests, authenticated role sessions, media uploads/downloads, notification operations, and Angular route HTTP checks. Counts group related assertions from the UAT test plan.

| Area | Tests | Passed | Failed | Blocked |
|---|---:|---:|---:|---:|
| Environment and authentication | 16 | 16 | 0 | 0 |
| Marketplace and customer journey | 31 | 31 | 0 | 0 |
| Individual professional | 7 | 7 | 0 | 0 |
| Business owner and manager | 11 | 11 | 0 | 0 |
| Technician and parts workflow | 12 | 12 | 0 | 0 |
| Admin | 13 | 13 | 0 | 0 |
| Security and privacy | 9 | 9 | 0 | 0 |
| Media | 8 | 7 | 0 | 1 |
| Notifications | 5 | 5 | 0 | 0 |
| Job lifecycle and invalid transitions | 6 | 6 | 0 | 0 |
| Angular route HTTP smoke | 13 | 13 | 0 | 0 |
| **Total** | **131** | **130** | **0** | **1** |

The one blocked media observation was a live 10 MB upload connection reset during the environment follow-up. The backend regression suite passed the documented 10 MB audio rejection.

## 5. Customer UAT

- Customer login with the seeded account passed.
- Invalid login returned a safe generic failure.
- Customer and professional registration passed; privileged-role self-registration was rejected.
- Public marketplace loaded without authentication.
- Service, location, provider-type and verified-state searches passed.
- Provider profile, services, service areas, public portfolio metadata, approved certificate metadata and public reviews loaded.
- Public profile responses did not expose passwords, tokens, private document references, storage keys or filesystem paths.
- Customer created a `MARKETPLACE` job in `REQUESTED` state.
- Invalid short description was rejected without creating a job.
- Provider quote became visible to the customer with a server-derived ZAR total.
- Incorrect client quote total was rejected.
- Customer accepted the quote; the job became `ACCEPTED` and the agreed amount was recorded.
- Provider scheduling and start progressed to `SCHEDULED` and `IN_PROGRESS`.
- BEFORE image, DURING note and AFTER image were stored and visible in the authorized execution record.
- Customer retrieved an authorized private image with `Cache-Control: no-store, no-cache, must-revalidate, private`.
- Cross-customer private image retrieval was rejected.
- Provider completion moved the job to `COMPLETED`.
- Customer confirmation recorded `COMPLETED -> CONFIRMED -> CLOSED`.
- Closed job history remained visible.
- Direct-payment wording is present in the current Angular customer templates and no payment API/table/invocation was used.
- Customer review submission is not implemented in the current frontend and is recorded as a known limitation, not a failure of the current documented UAT scope.

## 6. Individual Professional UAT

- Professional login passed.
- Provider request inbox showed only the addressed professional's requests.
- Request detail showed privacy-limited customer information.
- Request detail and quote creation passed.
- ZAR validation passed.
- Incorrect line-item total was rejected by the server.
- Accepted job, scheduling and start actions passed.
- BEFORE and AFTER image upload, DURING update, completion note and completion passed.
- Job timeline/history remained available.
- Provider notification inbox and read controls were available.
- Another professional's job access and marketplace action boundaries were covered by negative tests and regression coverage.
- Professional profile, service-area, portfolio-management, certificate-management and voice-note UI are not current frontend capabilities and are known limitations.

## 7. Business Owner UAT

- Business owner login and business profile passed.
- Business customer creation and editing passed.
- Cross-business customer access returned not found.
- Internal job creation passed with `INTERNAL` source and `REQUESTED` status.
- Requested-job edit passed; terminal-state edit was rejected.
- Internal job board and summary loaded.
- Search, priority and combined board filters passed after the UAT defect fix.
- Marketplace jobs were not exposed through the internal business surface.
- Technician assignment and reassignment passed.
- Assignment history was preserved.
- Owner/manager visibility of technician execution documentation passed.
- Parts request, more-information request, technician response, approval, awaiting parts, parts available and resume passed.
- Internal job completion passed.
- Owner-only business profile edit was rejected for a manager.
- Notifications were scoped to the business roles.

## 8. Business Manager UAT

- Manager login and business operations dashboard passed.
- Manager could view and manage the same business-scoped operational customer, job, technician, assignment and parts surfaces as documented.
- Manager could create and edit eligible internal jobs.
- Manager could assign and reassign technicians.
- Manager could review, request information, approve, reject and mark parts available.
- Manager could view job history, execution documentation and reports where exposed.
- Manager owner-only business profile edit returned `403`.
- Cross-business access remained isolated.

## 9. Technician UAT

- Technician login passed.
- My Jobs showed only actively assigned jobs.
- Reassigned technician received the newly assigned job.
- Prior technician lost access after reassignment.
- Technician could not access another business or unrelated job.
- Technician could not access the business-wide job board.
- Technician could not access the marketplace provider inbox.
- Technician started the assigned internal job.
- BEFORE image and DURING update passed.
- Voice note upload and metadata passed.
- Parts request and parts evidence workflow passed.
- More-information response passed.
- Approval, `AWAITING_PARTS`, `PARTS_AVAILABLE` and resume progression passed.
- AFTER image and completion note passed.
- Internal job completed successfully.

## 10. Admin UAT

- Admin login and dashboard passed.
- Users, customers, professionals, businesses and technicians lists passed.
- Services and categories passed.
- Jobs list showed both `MARKETPLACE` and `INTERNAL` records.
- Verification, certificates, reviews, reports, disputes and audit logs loaded.
- Non-admin access to the admin dashboard returned `403`.
- Admin JSON projections contained no detected password, token, storage-key, filesystem-path or private-document-reference fields.
- Private document routes are protected and audited by implementation and regression tests.
- Seeded private document bytes may be unavailable after a fresh seed; this is a documented storage limitation.
- `/admin/settings` returned the Angular placeholder page and no settings API exists. This is recorded as a documented known limitation.

## 11. Security / Authorization UAT

- Unauthenticated protected API request returned `401`.
- Customer A could not read Customer B's job.
- Customer could not read an internal business job.
- Professional could not read or act on another professional's job.
- Technician could not read another technician's job after reassignment.
- Technician could not access another business's job.
- Business A could not read Business B's customer or internal job.
- Marketplace endpoints did not expose internal jobs.
- Internal business endpoints did not expose marketplace jobs.
- Technician could not use provider inbox or provider administration.
- Non-admin could not use admin endpoints.
- Unauthorized private image retrieval returned no file bytes.
- Notification recipient selection remained session-scoped.
- Client-supplied source, status, ownership, role and business identifiers were ignored or rejected by the backend.

## 12. Media UAT

- Marketplace BEFORE and AFTER image uploads passed.
- Technician BEFORE and AFTER image uploads passed.
- Image metadata contained no binary, storage key or filesystem path.
- Authorized image retrieval passed.
- Unauthorized image retrieval was rejected.
- Image deletion while work was in progress passed; subsequent retrieval was not found.
- Invalid image content and MIME/content mismatch were rejected.
- Oversized image upload was rejected by the live API and regression suite.
- Valid technician voice note upload passed.
- Authorized voice-note retrieval passed with private no-cache response headers.
- Cross-technician voice-note retrieval was rejected.
- Invalid voice content was rejected in the live execution.
- A live 10 MB voice upload caused the environment connection to reset before a structured HTTP response. This is recorded as Blocked, not as a confirmed product defect. Backend regression coverage passed the documented 10 MB rejection.

## 13. Notification UAT

- Marketplace request notification reached the addressed provider.
- Quote, acceptance, schedule, start, completion and confirmation notifications were generated and scoped to the intended recipients.
- Business assignment, reassignment, technician update, work documentation and parts events were generated for the correct business roles/technician.
- Provider, customer, owner, manager and technician inboxes loaded independently.
- Mark-one-read succeeded on a direct rerun after an initial test-harness assertion mistake.
- Mark-all-read succeeded.
- Actor exclusion and cross-account notification isolation passed in backend regression coverage.
- Notifications are in-app only; no email, SMS, WhatsApp, push or WebSocket channel is implemented.

## 14. Job Lifecycle UAT

### Marketplace

`REQUESTED -> QUOTED -> ACCEPTED -> SCHEDULED -> IN_PROGRESS -> COMPLETED -> CONFIRMED -> CLOSED`

All transitions were executed against the running MySQL-backed API. Invalid restart, terminal modification and cross-role actions were rejected.

### Business

`REQUESTED -> assigned active technician -> IN_PROGRESS -> AWAITING_PARTS -> PARTS_AVAILABLE -> IN_PROGRESS -> COMPLETED`

The parts request itself remains `PENDING`; approval moves the job to `AWAITING_PARTS`; marking parts available resumes the job only when no approved request remains outstanding. Reassignment preserves assignment history. Internal customer confirmation/closure is not implemented and is a documented limitation.

## 15. Defects

| ID | Severity | Area | Description | Reproduction | Expected | Actual | Status |
|---|---|---|---|---|---|---|---|
| UAT-001 | P2 | Business job board | MySQL search with a combined priority filter generated invalid `LIKE ... ESCAPE` SQL and returned HTTP 500. | As Ubuntu Plumbing owner, request `/api/v1/business/jobs?priority=URGENT&search=UAT&pageSize=50`. | HTTP 200 with matching business-scoped results. | HTTP 500 `INTERNAL_ERROR`; the same malformed escape also affected business-customer search. | Resolved in working tree; regression test added. |

## 16. Blocked Tests

- Browser click-through and mobile acceptance for customer, professional, owner, manager, technician and admin screens: blocked because no browser E2E runner or browser interaction harness is configured. Angular route HTTP responses returned 200 for the tested routes.
- Angular automated tests: `npm test --prefix apps/web -- --watch=false` did not reach test results within 120 seconds. The command was not repeatedly rerun, as required.
- Live 10 MB voice upload: the environment connection reset before a structured HTTP response. The backend regression suite passed the size-limit rejection.

## 17. Known Limitations

- `/admin/settings` is a visible placeholder; settings management is not implemented.
- Customer review submission, quote decline, messaging and saved-provider UI are not current frontend capabilities.
- Professional profile, service-area, portfolio-management, certificate-management and review-response UI are not current frontend capabilities.
- Public portfolio metadata is available, but public portfolio image bytes are not rendered.
- Internal jobs currently complete at `COMPLETED`; no internal customer confirmation/closure route is implemented.
- Verification and certificate documents are private; seeded references may not have matching binary files in a fresh local install.
- Local protected file storage is the MVP adapter; cloud/object storage is future infrastructure.
- The Angular client stores bearer tokens in browser local storage; production requires restrictive security headers/CSP and a documented multi-instance rate-limit strategy.
- No browser E2E or recorded mobile acceptance evidence is attached.
- This is developer-executed UAT preparation/execution, not client acceptance.

## 18. UAT Result

**Developer UAT result: PASS WITH LIMITATIONS.**

The core marketplace, business, technician, parts, lifecycle, notification, media, privacy and authorization workflows passed against the running MySQL-backed implementation. One genuine P2 MySQL search defect was found, fixed, regression-tested and verified live. No P0, P1 or open P2 product defect remains from this execution.

The system is ready for controlled real client UAT on the critical workflows, subject to the listed browser/mobile and Angular-runner limitations. The client must still perform browser-based acceptance for the customer and technician flows, review the direct-payment wording, validate responsive/mobile behaviour, and confirm the documented out-of-scope limitations.

Before production, the project still requires environment-specific secrets and HTTPS/CORS configuration, production migration and backup verification, durable protected file-storage setup, shared rate-limit/session strategy for multi-instance deployment, successful browser/mobile acceptance, and resolution or formal acceptance of the remaining operational limitations.

This report does not claim client acceptance.

---

STAGE 12 CLIENT UAT EXECUTION COMPLETE
