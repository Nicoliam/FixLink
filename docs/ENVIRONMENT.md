# Environment

## Node.js (verified)

Fixlynk web (`apps/web`, Angular 21) is verified with:

- Node: `22.12.0` (see `.nvmrc` at repo root and in `apps/web`)
- npm: `>=10` (`10.9.0` ships with Node 22.12.0; `11.13.0` also works)

Angular 21 requires `^20.19.0 || ^22.12.0 || >=24.0.0`.
Use Node 22.12.0 unless there is a documented reason to change it.

## Start the web dev server

```sh
nvm use        # picks up .nvmrc -> 22.12.0
cd apps/web
npm install    # required after clean checkout
npm start      # ng serve -> http://localhost:4200/
```

`npm start` runs `ng serve` (default port 4200, config in `apps/web/angular.json`).

## Troubleshooting: `ng` hangs with no output

Symptom (seen 2026-09-23): `ng version` / `ng serve` hangs for 50s+
with zero output, stuck requiring `@angular-devkit/core`
(`src/logger` -> `rxjs`, `src/utils`, `src/virtual-fs`) and slow
`ajv` loads.

Cause: corrupt / partial `node_modules` in `apps/web`
(installed Sep 22), not a code bug. Wrong Node major (e.g. system
Node 24.16.0) also triggers it.

Fix (verified):

```sh
nvm use 22.12.0
cd apps/web
rm -rf node_modules .angular
npm install
node ./node_modules/@angular/cli/bin/ng.js version  # should print CLI table
npm start
```

Do not run `npm cache clean --force` unless cache corruption is
suspected; it was not needed for this fix. If `~/.npm` permission
errors appear, fix ownership first (`chown -R $(id -u):$(id -g) ~/.npm`)
rather than using sudo npm.

## Current runtime variables

The backend reads the exact variables documented in `docs/DEPLOYMENT.md`:
`NODE_ENV`, `PORT`, `AUTH_STORE`, `DB_HOST`, `DB_PORT`, `DB_USER`,
`DB_PASSWORD`, `DB_NAME`, `JWT_ACCESS_SECRET`,
`JWT_ACCESS_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS`, `BCRYPT_COST`,
`CORS_ORIGIN`, `FILE_STORAGE_DIR`, `WEB_BASE_URL`, `MAIL_ENABLED`,
`MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`,
`MAIL_PASSWORD`, `MAIL_FROM` and `MAIL_FROM_NAME`.

Provider notification email is off until it is configured: with
`MAIL_ENABLED` unset or `false` the rendered message is only written to
the log and nothing is sent, so local development and tests never need a
mail server. Set `MAIL_ENABLED=true` with `MAIL_HOST` (plus
`MAIL_USER`/`MAIL_PASSWORD` when the relay needs them) and `WEB_BASE_URL`
(the Angular dev origin, `http://localhost:4200`, is the default) to
send provider emails with working in-app links. Use a fictional sender
such as `no-reply@example.co.za` locally; never a real address.

For local development, use the fictional values in `.env.example` and
`backend/.env.example`. `AUTH_STORE=mysql` is the normal application
mode; `AUTH_STORE=memory` is reserved for isolated tests or memory-mode
development. Production must set `NODE_ENV=production`, a strong random
`JWT_ACCESS_SECRET` of at least 32 characters, and a production database
password. The example Docker Compose values are not production secrets.

The Angular production build uses same-origin `/api/v1`; the Angular
development build uses `http://localhost:3000/api/v1`. No additional
frontend runtime secret is defined by the current implementation.

## Notes

- `.angular/` cache is gitignored; safe to delete when the dev server
  behaves strangely.
- `node_modules/` is gitignored; always reinstall after Node major changes.
