# FixLink Deployment Guide

## 1. Scope and architecture

FixLink has three runtime components:

```text
Browser / Angular web application
              |
              | HTTPS REST /api/v1
              v
        Node.js TypeScript API
              |
              +--> MySQL 8
              +--> local file storage (MVP)
```

The web application is built as static files. The API serves JSON and protected file bytes. MySQL is the source of truth for structured data. Binary files are stored outside MySQL; the database stores metadata and opaque storage references.

The current repository Docker Compose file starts MySQL only. It does not start the API or web application, and it is configured for local development rather than production.

## 2. Supported production deployment model

Use a managed or separately operated MySQL 8 instance, a Node.js API process, and a static web server or reverse proxy. The Angular production environment uses the same-origin API path `/api/v1`, so the reverse proxy should route that path to the API.

A production topology should provide:

- HTTPS at the public edge;
- a non-development `NODE_ENV=production`;
- a private network path to MySQL;
- a durable `FILE_STORAGE_DIR` on protected storage;
- a process supervisor or container restart policy;
- a process manager for the API;
- centralized, access-controlled logs;
- backups for both MySQL and the file storage directory;
- a rollback procedure for application, migration and file-storage changes.

## 3. Frontend deployment

### Build

Use the repository's supported Node version:

```sh
nvm use
npm install --prefix apps/web
npm run build --prefix apps/web
```

Angular's default build configuration is production. The output is written under `apps/web/dist/` according to the Angular project configuration. Confirm the exact output directory from the build output before publishing.

Serve the static build with a web server or CDN that supports SPA fallback to `index.html` for client-side routes. Do not expose the source tree, `.env` files or `node_modules`.

The production Angular environment calls `/api/v1` on the same origin. Configure the reverse proxy to forward `/api/*` to the Node API and preserve the request path. Set an exact production `CORS_ORIGIN` on the API even when the proxy is same-origin.

After publishing, test a direct browser refresh on a client route such as `/my-jobs` and `/business/jobs`.

## 4. Backend deployment

### Build and run

From a clean release checkout:

```sh
npm install --prefix backend
npm run typecheck --prefix backend
npm run build --prefix backend
NODE_ENV=production npm run start --prefix backend
```

`npm run start` runs `node dist/server.js`. The API listens on `PORT`, defaulting to `3000`.

The API must run with the production environment loaded from the process environment or a secret-managed environment file. Do not commit `.env` files or place secrets in command history or source control.

The default `AUTH_STORE=mysql` uses the MySQL user, role, job, business, notification and admin stores. `AUTH_STORE=memory` is intended for isolated tests and memory-mode development; do not use it for production.

### Health and logs

`GET /health` is a liveness endpoint. It does not query MySQL, so pair it with a database connectivity check and a login smoke test before accepting a deployment.

The application uses Helmet, JSON body limits, CORS and process-local rate limiting. Capture stdout/stderr through the deployment platform. Do not log passwords, access tokens, refresh tokens, private documents, storage keys, SQL credentials or internal file paths.

## 5. MySQL deployment

The current schema is MySQL 8. The application expects a database, a least-privilege application user and a migration-capable database user or controlled migration step.

Do not use the development `docker-compose.yml` credentials in production. The Compose file contains local-only development values and a host port mapping for convenience.

Recommended production controls:

- private database network access only;
- TLS where the hosting platform supports it;
- a dedicated application user rather than the root account;
- a separate controlled migration identity where possible;
- automated backups and restore testing;
- connection limits appropriate for the API process count;
- no direct public database exposure.

## 6. Environment variables

The current implementation reads the variables below. Names are exact; do not substitute similarly named variables.

| Variable | Required in production | Current meaning |
|---|---:|---|
| `NODE_ENV` | Yes | Use `production`; enables production secret validation |
| `PORT` | Yes | API port; default `3000` |
| `AUTH_STORE` | Yes | Use `mysql`; `memory` is for tests/isolated development |
| `DB_HOST` | Yes | MySQL host |
| `DB_PORT` | Yes | MySQL port; local Compose exposes `3307` |
| `DB_NAME` | Yes | MySQL database name |
| `DB_USER` | Yes | MySQL application/migration user as appropriate |
| `DB_PASSWORD` | Yes | Secret; never commit or log it |
| `JWT_ACCESS_SECRET` | Yes | Strong random access-token signing secret; minimum 32 characters in production |
| `JWT_ACCESS_TTL_SECONDS` | No | Access-token lifetime; default `900` |
| `REFRESH_TOKEN_TTL_SECONDS` | No | Refresh-token lifetime; default `2592000` |
| `BCRYPT_COST` | No | Password hashing cost; default `12` |
| `CORS_ORIGIN` | Yes | Exact allowed web origin, without a trailing slash |
| `FILE_STORAGE_DIR` | Yes for file workflows | Durable directory for the local MVP file adapter |

`JWT_SECRET` is a legacy fallback read by the current configuration when `JWT_ACCESS_SECRET` is not set. New deployments should set `JWT_ACCESS_SECRET` explicitly and should not rely on the fallback.

The development templates contain placeholder values only. `dev-only-change-me` is explicitly rejected when `NODE_ENV` is `production` or `prod`.

## 7. Production secrets

Generate a unique `JWT_ACCESS_SECRET` using an approved secret generator. Store it in the deployment platform's secret manager or protected environment configuration. Do not reuse the development JWT secret, database password or Docker password.

Production requirements:

- unique secret per environment;
- at least 32 characters for `JWT_ACCESS_SECRET`;
- no secrets in Git, images, logs, screenshots, tickets or client UAT records;
- controlled rotation procedure with a planned session invalidation window;
- separate database credentials for each environment;
- rotated credentials after suspected exposure.

## 8. CORS, HTTPS and headers

Set `CORS_ORIGIN` to the exact deployed web origin, for example `https://app.example.co.za`. Do not use `*` for a credentialed production deployment.

Terminate TLS at the public edge or trusted reverse proxy. Redirect HTTP to HTTPS. Preserve security headers from the API where applicable, and configure the static web server with a restrictive Content Security Policy, HSTS, frame protection, MIME sniffing protection and referrer policy appropriate to the deployment.

The Angular client currently stores bearer tokens in browser local storage. That is a known security limitation. A restrictive CSP and secure deployment are required, but migrating to HttpOnly cookies with CSRF protection is future work.

## 9. Database migrations and seed policy

The actual migration tooling is in `database/`. Run these commands from the `database/` directory:

```sh
npm install
npm run db:migrate
npm run db:migrate:status
```

The runner applies files in `database/migrations/` in filename order and records them in `schema_migrations`. It supports `up`, `status`, `down [n]` and `reset`; the npm scripts expose `db:migrate`, `db:migrate:status`, `db:migrate:down` and `db:migrate:reset`.

The seed tooling is separate:

```sh
npm run db:seed
npm run db:seed:status
```

Production policy:

1. Back up the production database before any migration.
2. Verify the migration user can connect and has the required privileges.
3. Run `npm run db:migrate`.
4. Run `npm run db:migrate:status` and confirm no migration is pending.
5. Verify the schema and application health/login.
6. Do not run `npm run db:seed` against production. Seeds are fictional development/UAT data.
7. If a new environment is intentionally used for testing, run migrations first and seed only after confirming it is isolated.
8. Never use `db:migrate:reset` or `db:rebuild` on production; both are destructive workflows.

The migration runner has no checksum or automatic all-migration transaction. Review each migration and keep a database backup available before applying changes.

## 10. File storage and uploads

The current MVP uses a local filesystem adapter, not cloud/object storage.

- Default directory: `backend/uploads/`
- Override: `FILE_STORAGE_DIR`
- MySQL stores opaque references, MIME, size and ownership metadata.
- Stored keys are server-generated and path traversal is rejected.
- Files must never be served as a public static directory.

Current file rules:

| Content | Maximum | Allowed types |
|---|---:|---|
| Job images and parts photos | 5 MB service limit | JPEG, PNG, WebP |
| Technician voice notes | 10 MB | WebM, MP4/M4A, MP3, WAV, Ogg |

The API checks claimed MIME and magic bytes. The business multipart route has a 10 MB request cap, but image service validation still limits images to 5 MB. Private downloads use authorized backend routes, `inline` or attachment disposition as appropriate, and no-store/no-cache private response headers.

Verification and certificate documents are private. Only an active admin can access the protected document routes; successful document views are audited. The current frontend has no upload form for profile images, portfolio images, certificates or identity documents, and seeded file references do not automatically have matching bytes in a fresh local install.

Production storage must therefore:

- use a durable mounted volume or equivalent persistent disk;
- restrict filesystem permissions to the API service account;
- prevent direct public web access;
- back up the directory together with database metadata;
- test download authorization after restore;
- monitor disk capacity and permissions;
- set reverse-proxy upload limits consistently with the API limits.

Cloud/object storage is future infrastructure and is not implemented by the current repository.

## 11. Backups

Back up both:

1. MySQL structured data and migration/seed metadata; and
2. the complete `FILE_STORAGE_DIR`.

The database and file backup must be restored to the same release point. A database row without its private file, or a file without its metadata, is an incomplete backup.

Recommended controls include encrypted backups, restricted access, retention policy, off-site copies and a scheduled restore test. Never place backup archives containing private documents in a public location.

## 12. Smoke testing and restart

After every deployment, follow [`SMOKE-TEST.md`](SMOKE-TEST.md). At minimum check API health, database-backed login, marketplace search, one marketplace job path, one internal job path, media access, notifications and admin access.

For a controlled restart, stop and start the API through the supervisor/platform after confirming migrations and backups. Do not delete or reinitialize the file directory during a restart. Inspect logs for startup, database, file permission and CORS errors.

## 13. Rollback considerations

Before a release:

- record the application version and database migration status;
- take a database backup;
- copy or snapshot the current frontend build and API artifact;
- confirm the previous API can run against the current schema;
- identify whether the release changed the file format or storage keys.

For a failed application deployment, restore the previous frontend/API artifact and restart. For a migration failure, stop deployment, preserve logs, restore the database backup if the migration partially applied, and run migration status before retrying. Do not run a destructive reset as a rollback shortcut. Coordinate data rollback with the project representative and take a fresh backup before any recovery action.

## 14. Current limitations

- Docker Compose is a local MySQL convenience only.
- Local file storage has no cloud redundancy.
- The health endpoint is liveness-only, not a database readiness check.
- Angular automated tests did not reach execution in the Stage 11 environment; typecheck and production build did pass there.
- No browser E2E or manual mobile acceptance evidence is recorded.
- `/admin/settings` is a placeholder; platform settings management is not implemented.
- Customer payment processing is outside the MVP.
