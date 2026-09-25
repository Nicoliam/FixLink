# FixLink — Development Workflow

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

## 4. Database changes

- Add an ordered migration with `-- +migrate Up` and `-- +migrate Down`.
- Test the migration against MySQL 8.
- Check `npm run db:migrate:status` and `npm test` in `database/`.
- Use fictional seed data for development/UAT only.
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
