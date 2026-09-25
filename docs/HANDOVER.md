# FixLink Handover

## 1. Project overview

FixLink is a South African home-services marketplace and job-management platform. Customers discover independent professionals and service businesses, request work, receive quotes, accept an agreed price, track work, review documentation and confirm completion. Businesses manage private customers, internal jobs and technicians through the same job engine.

**Connect. Quote. Fix.**

Current repository milestone: Stage 11 validation passed with limitations, followed by Stage 12 client UAT and deployment handover preparation.

## 2. Technology stack

- Frontend: Angular 21 standalone application, TypeScript and SCSS
- Backend: Node.js, TypeScript, Express and REST API under `/api/v1`
- Database: MySQL 8 with versioned SQL migrations
- Authentication: bcrypt password hashes, short-lived JWT access tokens, opaque rotating refresh tokens
- File storage: local filesystem MVP adapter; MySQL stores metadata and opaque references
- Local infrastructure: Docker Compose for MySQL only
- Tests: Node test runner, `tsx`, Supertest, Angular/Vitest-based test configuration
- Currency: South African Rand (`ZAR`)

## 3. Repository structure

```text
apps/web/                 Angular frontend
backend/                  Node.js TypeScript API
backend/src/modules/      Feature modules
backend/src/services/     File-storage adapter and shared services
backend/tests/            Backend API and unit tests
database/migrations/      Ordered SQL migrations
database/seeders/         Fictional development/UAT seed files
database/schema/          Reference schema snapshot
database/tests/           Database schema tests
docs/                     Product, architecture, QA and handover documents
design/stitch/            Approved visual design source of truth
tests/                    Reserved cross-project test areas
docker-compose.yml        Local MySQL 8 service
```

The Angular application is the client only. It must never connect directly to MySQL.

## 4. Current architecture

```text
Angular web app
      |
      | HTTPS / REST /api/v1
      v
Node.js API
      |
      +--> MySQL structured data
      +--> local file storage
```

The API uses one `jobs` table for marketplace and internal jobs. `jobs.source` distinguishes `MARKETPLACE` and `INTERNAL`. Files are stored outside MySQL; metadata tables contain no binary content.

The local Compose file starts MySQL on host port `3307`. It does not start the frontend or backend and is not a production topology.

## 5. Frontend

The Angular application uses lazy standalone routes and an authenticated shell. Development API URL is `http://localhost:3000/api/v1`; production uses same-origin `/api/v1`.

Implemented surfaces include:

- public home, marketplace and provider profiles;
- authentication and account/session page;
- customer job request and job detail;
- professional request inbox and marketplace execution;
- business dashboard, customers, technicians, internal job board and job detail;
- technician My Jobs, execution, voice notes and parts requests;
- in-app notifications;
- admin dashboard, resource lists/details and supported operations.

Only the admin area has a role-specific Angular guard. Other role visibility is a UX control; the API is the authorization boundary.

## 6. Backend

The backend is a modular Express API. Important modules include authentication, users, marketplace, jobs, quotes, execution, business/technician, parts, notifications and admin.

The main API groups are:

- `/api/v1/auth`
- public services, categories and providers
- customer jobs
- provider requests, quotes and marketplace execution
- business and technician resources
- notifications
- admin operations

`GET /health` is a liveness endpoint. It does not query the database.

## 7. Database

The migration runner is `database/migrate.js`. Migration files are applied in filename order and tracked in `schema_migrations`. Seeds are fictional development data tracked in `schema_seeds`.

Key job sources:

- `MARKETPLACE`
- `INTERNAL`

Key job statuses:

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

The backend enforces the currently available workflows. Marketplace confirmation records `COMPLETED -> CONFIRMED -> CLOSED` in one transaction. Internal jobs currently complete at `IN_PROGRESS -> COMPLETED`; no internal customer confirmation/closure route is implemented.

`database/schema/schema.sql` is a reference snapshot. Migrations are the source of truth. The checked-in snapshot does not include every later migration, including current voice-note filename metadata, `PARTS_AVAILABLE`, the 1000-character review-note limit and `refresh_tokens`; regenerate the snapshot before relying on it as a current schema export.

## 8. Authentication and sessions

- Email/password login and supported self-registration;
- bcrypt password hashing;
- `PENDING`, `ACTIVE`, `SUSPENDED` and `DELETED` user states;
- short-lived signed JWT access tokens;
- opaque refresh tokens stored as SHA-256 hashes;
- refresh rotation and replay rejection;
- logout revocation;
- authoritative user and role loading on protected requests;
- process-local rate limits for auth, marketplace and admin routes.

Privileged roles `ADMIN`, `TECHNICIAN` and `BUSINESS_MANAGER` cannot be self-assigned during registration.

Current limitation: the Angular client stores bearer tokens in local storage. A multi-instance production deployment must also provide a shared rate-limit strategy at the gateway or replace the process-local limiter.

## 9. Roles and permissions

The implemented role names are:

- `CUSTOMER`
- `PROFESSIONAL`
- `BUSINESS_OWNER`
- `BUSINESS_MANAGER`
- `TECHNICIAN`
- `ADMIN`

Key boundaries:

- customers access only their own marketplace jobs;
- marketplace providers act only on jobs addressed to their provider/business identity;
- business identity is derived from authenticated membership, never request ownership;
- business users access only their own company's customers, jobs, technicians, parts and media;
- technicians access only actively assigned internal jobs;
- only active administrators access admin routes;
- cross-account and cross-business resources generally appear not found to avoid disclosing their existence.

## 10. Marketplace workflow

The current marketplace supports:

1. customer request;
2. provider quote in ZAR;
3. customer acceptance;
4. provider scheduling;
5. provider start;
6. BEFORE photos and notes;
7. DURING updates and photos;
8. AFTER photos;
9. provider completion;
10. customer confirmation and closure;
11. in-app notifications and history.

The marketplace does not process payment. The platform records the agreed quote amount and the customer arranges payment directly with the provider.

## 11. Business job management

Business owners and managers can:

- view the business dashboard and job board;
- manage business-owned customers;
- create, edit and cancel eligible requested internal jobs;
- assign and reassign active technicians;
- view assignment and job history;
- view technician photos, notes, voice notes and timeline;
- review parts requests;
- approve, reject, request information and mark parts available.

Business data is isolated by authoritative membership. A marketplace job is not available through the internal business surface.

## 12. Technician workflow

Technicians can:

- view My Jobs;
- open an actively assigned job;
- start a requested or scheduled internal job;
- add BEFORE photos and DURING notes;
- record/upload voice notes;
- request parts and attach evidence;
- respond to requests for more information;
- resume when approved parts are available;
- add AFTER photos and complete the job.

Technicians are business employees/team members, not automatically marketplace professionals.

## 13. Media and verification

The local MVP storage adapter writes under `backend/uploads` by default. `FILE_STORAGE_DIR` overrides the directory.

Current rules:

- images: JPEG, PNG, WebP; maximum 5 MB;
- voice notes: WebM, MP4/M4A, MP3, WAV, Ogg; maximum 10 MB;
- MIME and magic-byte validation;
- server-generated opaque keys;
- database metadata only;
- authorized backend download routes;
- private no-store/no-cache response headers;
- active-admin-only verification/certificate document access with audit entries.

The current frontend does not provide profile-photo, portfolio, certificate or identity-document upload forms. Public provider profiles show portfolio metadata but do not load public portfolio image bytes.

Verification documents are private and must never appear on public profiles or in public API DTOs.

## 14. Notifications

Notifications are in-app database records. The authenticated shell polls the unread count and provides a notification inbox with read/all-read controls.

Implemented events cover marketplace requests, quotes, acceptance, scheduling, start, completion and confirmation, plus technician assignment/reassignment, work updates, parts requests and parts decisions.

There is no email, SMS, WhatsApp, push notification, WebSocket or external notification worker.

## 15. Admin

The current admin area can view users, customers, professionals, businesses, technicians, services, jobs, verification, certificates, reviews, reports, disputes and audit logs. Supported actions include user suspension/reactivation, service management, verification/certificate review, report status and dispute updates.

Private document access requires an active admin and is audited.

**Known limitation:** `/admin/settings` exists in navigation and routing, but the page is a not-configured placeholder and there is no settings API. Platform settings management is not implemented.

## 16. Reviews and verification

The current API and public provider profile can display seeded public review and certificate metadata. Admin can review verification/certificate records. The current frontend does not implement customer review submission, professional review responses, certificate submission or identity-verification submission.

These are current implementation limitations, not claims that the database or product architecture cannot support them in future.

## 17. Security

Implemented controls include:

- server-side role and ownership enforcement;
- business and technician isolation;
- private media authorization;
- protected verification/certificate documents;
- validation and parameterized SQL;
- structured safe errors;
- Helmet, CORS, body limits and rate limits;
- JWT/refresh session controls;
- audit records for sensitive admin actions.

Refer to [`SECURITY.md`](SECURITY.md), [`PERMISSIONS.md`](PERMISSIONS.md) and [`PRODUCTION-CHECKLIST.md`](PRODUCTION-CHECKLIST.md).

## 18. Development setup

Prerequisites:

- Node.js `22.12.0`;
- npm;
- Docker Desktop.

From the repository root:

```sh
nvm use
npm install --prefix backend
npm install --prefix database
npm install --prefix apps/web
cp .env.example .env
cp backend/.env.example backend/.env
docker compose up -d
npm run db:migrate --prefix database
npm run db:seed --prefix database
```

Start the API:

```sh
npm run dev --prefix backend
```

Start the web application in another terminal:

```sh
npm start --prefix apps/web
```

Open `http://localhost:4200`. The API health endpoint is `http://localhost:3000/health`.

The root `npm test` script is only a placeholder and intentionally exits with an error. Run component-specific commands instead.

## 19. Tests and builds

Backend:

```sh
npm test --prefix backend
npm run typecheck --prefix backend
npm run build --prefix backend
```

Database:

```sh
npm test --prefix database
npm run db:migrate:status --prefix database
```

Frontend:

```sh
npx tsc -p apps/web/tsconfig.json --noEmit
npm run build --prefix apps/web
npm test --prefix apps/web -- --watch=false
```

There is no frontend `typecheck` package script, so the `npx tsc` command is the current static typecheck.

The Angular test runner has environment/runtime limitations in the current development environment. Stage 11 recorded a frontend TypeScript pass and production build pass, but the Angular tests did not reach execution. Do not claim Angular automated tests passed unless they are actually run successfully in the target environment.

The Stage 11 report is point-in-time evidence for the tested implementation before the Stage 11 documentation commit. Re-run validation for the release used at handover.

## 20. Deployment and backups

Follow [`DEPLOYMENT.md`](DEPLOYMENT.md), [`PRODUCTION-CHECKLIST.md`](PRODUCTION-CHECKLIST.md) and [`SMOKE-TEST.md`](SMOKE-TEST.md).

Production must use strong environment-specific secrets, HTTPS, restricted CORS, MySQL migrations, durable local file storage, protected logs, database/file backups and a rollback plan. Development Compose passwords and seed accounts are never production credentials.

## 21. Current MVP

The current implementation includes:

- public service/provider discovery;
- customer registration/login and marketplace requests;
- professional/business provider requests and quotes;
- quote acceptance, scheduling, job start and execution documentation;
- marketplace completion and customer confirmation;
- business customers, internal jobs, assignment/reassignment and job board/history;
- technician My Jobs, photos, notes, voice notes, parts and completion;
- parts approval, information requests, rejection and availability;
- in-app notifications;
- active-admin operations and audit visibility;
- backend authorization, business isolation and private file controls;
- versioned MySQL migrations and fictional development seeds.

## 22. Future / out of scope

The following are not current MVP capabilities:

- payment gateway, escrow, settlement or customer transaction processing;
- live GPS tracking or route optimization;
- AI matching or voice transcription;
- WhatsApp, SMS, email, push or WebSocket notifications;
- advanced accounting, payroll, inventory or enterprise features;
- subscription billing;
- automated identity-verification provider integration;
- cloud/object storage adapter;
- HttpOnly-cookie authentication migration;
- admin settings;
- admin job intervention, review moderation or role management;
- customer review submission, quote decline, messaging or saved-provider UI;
- professional profile, service-area, portfolio, certificate, verification-submission or review-response management UI;
- request-photo upload during marketplace job creation;
- public portfolio image-byte rendering;
- internal customer confirmation/closure route;
- browser E2E and recorded mobile acceptance automation.

## 23. Known limitations and handover risks

- Admin settings is a visible placeholder, not implemented functionality.
- The Angular test runner did not complete in the Stage 11 environment.
- No browser E2E or mobile acceptance run is recorded.
- Local file storage has no cloud redundancy and is not a public static directory.
- Seeded file references do not create matching files; private seeded document downloads may therefore be unavailable after a fresh seed.
- The checked-in schema snapshot lags migrations; migrations are authoritative.
- The checked-in Compose file is development-only and starts MySQL only.
- Local bearer-token storage and process-local rate limits are known security/deployment limitations.
- Stage 11 status is **PASS WITH LIMITATIONS**, not unrestricted production-readiness certification.
