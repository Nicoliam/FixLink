# Fixlynk — Development Workflow

## 1. Before starting work

1. Read the relevant product, architecture, API, permissions, security and design documentation.
2. Inspect the current implementation and related tests.
3. Confirm the change is inside the approved MVP and does not redesign the Stitch/Oceanic UI.
4. Use one issue or task with clear acceptance criteria.

## 2. Implementation order

- Keep the shared job engine for `MARKETPLACE` and `INTERNAL` jobs.
- Add or update migrations for schema changes; never manually edit production schema.
- Keep controllers thin and enforce authorization and validation in the backend.
- Keep file bytes outside MySQL and use the storage abstraction.
- Reuse the established Angular standalone patterns and existing UI components.
- Include loading, empty, error, unauthorized and not-found states.
- Update relevant documentation when behaviour or operational requirements change.

## 3. Validation

Run the narrowest relevant checks while developing, then the release checks:

```sh
npm test --prefix backend
npm run test:mysql --prefix backend
npm run typecheck --prefix backend
npm run build --prefix backend
npm test --prefix database
npm run db:migrate:status --prefix database
npx tsc -p apps/web/tsconfig.json --noEmit
npm run build --prefix apps/web
```

Use `git diff --check` before review. The root `npm test` script is a
placeholder and exits with an error; it is not a project test command.

The Angular test runner may be environment-limited. Record the exact
command, timeout and whether execution began; never report an incomplete
run as a pass.

### 3.1 Two backend test tiers

`npm test` (backend) runs every suite against the in-memory stores. It is fast
and it is the right default while developing, but it proves nothing about the
SQL in `MysqlJobsStore` / `MysqlQuotesStore`, which is what actually runs in
development and production. Several real defects have lived in exactly that
gap — a missing `deleted_at IS NULL` filter, write paths that acted on
withdrawn jobs — and none were reachable from an in-memory test.

`npm run test:mysql --prefix backend` is the tier that covers the real stores.
It creates a throwaway `fixlynk_test_*` database, applies every migration's Up
section, runs the suite, and drops the database afterwards; the development
database is never touched.

- With no MySQL reachable it **skips** with an explanatory message, so
  `npm test` still works on a machine without a database.
- `npm run test:mysql` sets `FIXLYNK_REQUIRE_MYSQL=1`, which turns that skip
  into a hard failure. Use it in CI: a silent skip of the only MySQL coverage
  is worse than a red build.
- It needs an account that may create and drop schemas. It uses the
  container's `root` by default; override with `FIXLYNK_MYSQL_ADMIN_USER` /
  `FIXLYNK_MYSQL_ADMIN_PASSWORD`. The least-privilege application user cannot
  do this, and that is deliberate.

**Before release, run both tiers.**

## 4. Database changes

- Add an ordered migration with `-- +migrate Up` and `-- +migrate Down`.
- Test the migration against MySQL 8.
- Apply migrations with `npm run db:migrate --prefix database`, never by
  piping the file into `mysql`. A migration file contains **both** sections,
  so sending the whole file applies Up and then Down: it reports success and
  leaves an empty schema. Any tooling that reads these files must take the Up
  section only — see `backend/tests/mysql-customer-job-mutations.test.ts`.
- Check `npm run db:migrate:status` and `npm test` in `database/`.
- Use fictional seed data for development/UAT only.
- Seeded accounts share the fictional password `Fixlynk-dev-001`, recorded in
  the comment at the top of `database/seeders/002_users_profiles.sql`. It is a
  development credential and must never be used in production.
- `backend/tests/seed-integrity.test.ts` asserts every seeded hash really
  opens with that password. An earlier seeder shipped a hash nobody could log
  in with, and nothing failed loudly — the seeders looked right and the schema
  was fine. Keep that test passing when editing seed data.
- The seeders are **not** idempotent (plain `INSERT`s), so re-running them
  against a populated database fails on duplicate keys. Use
  `npm run db:rebuild --prefix database`, or re-seed an empty schema.
- Never use development seeds, passwords or reset commands in production.

## 5. Git and review rules

- Do not commit or push unless explicitly requested.
- Do not use `git add .` or `git add -A`.
- Keep intentional changes separate from unrelated working-tree changes.
- Review `git status --short`, `git diff --stat` and `git diff --check`.
- Do not commit `.env` files, secrets, private documents or local data.

## 6. Handover and release

Update the relevant API, permissions, user-flow, database, security and
deployment documentation. For UAT, use `docs/CLIENT-UAT.md` and
`docs/CLIENT-UAT-TEST-PLAN.md`. Before a production deployment, complete
`docs/PRODUCTION-CHECKLIST.md` and run `docs/SMOKE-TEST.md`.
