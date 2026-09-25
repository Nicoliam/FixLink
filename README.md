# FixLink

**Connect. Quote. Fix.**

FixLink is a South African home-services marketplace and job-management platform. Customers can discover and hire service professionals or businesses, while businesses can manage private customers, internal jobs, technicians, work updates, parts requests and history.

The MVP does not process customer payments. It records the agreed quote, and payment is arranged directly between the customer and the professional or business.

## Current status

The current implementation reached Stage 11 **PASS WITH LIMITATIONS** and is in Stage 12 client UAT/deployment handover preparation. The `/admin/settings` route is a visible placeholder; platform settings management is not implemented. See [client UAT](docs/CLIENT-UAT.md) and [handover](docs/HANDOVER.md) for the exact current scope and limitations.

## Architecture

```text
Angular web app
      |
      | HTTPS / REST /api/v1
      v
Node.js / TypeScript API
      |
      +--> MySQL 8
      +--> protected local file storage (MVP)
```

- One `jobs` table supports `MARKETPLACE` and `INTERNAL` jobs.
- The frontend never connects directly to MySQL.
- MySQL stores structured data and file metadata; binary file bytes are stored outside MySQL.
- The local Docker Compose file starts MySQL only.

## Repository structure

```text
apps/web/       Angular frontend
backend/        Express/TypeScript REST API
database/       Migrations, fictional seeds and schema tests
design/stitch/  Approved visual design source of truth
docs/           Product, architecture, UAT and deployment documents
```

## Prerequisites

- Node.js `22.12.0` (`.nvmrc`)
- npm
- Docker Desktop for local MySQL

## Local setup

From the repository root:

```sh
nvm use
npm install --prefix backend
npm install --prefix database
npm install --prefix apps/web
cp .env.example .env
cp backend/.env.example backend/.env
docker compose up -d
```

Apply the schema and fictional development seed data:

```sh
npm run db:migrate --prefix database
npm run db:migrate:status --prefix database
npm run db:seed --prefix database
```

Start the API:

```sh
npm run dev --prefix backend
```

Start the frontend in another terminal:

```sh
npm start --prefix apps/web
```

Open `http://localhost:4200`. Check `http://localhost:3000/health` for API liveness. Development accounts and the shared development password are documented only in [Client UAT](docs/CLIENT-UAT.md); never use them in production.

## Tests and builds

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

The root `npm test` command is a failing placeholder; use the component commands above. The Angular test runner has known environment/runtime limitations. Do not claim its tests passed unless a run reaches completion.

## Deployment and acceptance

- [Documentation index](docs/README.md)
- [Client UAT](docs/CLIENT-UAT.md)
- [UAT test plan](docs/CLIENT-UAT-TEST-PLAN.md)
- [Deployment guide](docs/DEPLOYMENT.md)
- [Production checklist](docs/PRODUCTION-CHECKLIST.md)
- [Smoke test](docs/SMOKE-TEST.md)
- [Technical handover](docs/HANDOVER.md)
- [Client acceptance](docs/CLIENT-ACCEPTANCE.md)
- [Security](docs/SECURITY.md)
- [Stage 11 test report](docs/STAGE-11-FULL-SYSTEM-TEST-REPORT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [Permissions](docs/PERMISSIONS.md)
- [Design system](docs/DESIGN-SYSTEM.md)
