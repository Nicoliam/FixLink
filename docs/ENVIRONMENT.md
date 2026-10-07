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

Symptom: `ng version` / `ng serve` / `npm ls` hangs with zero output,
never exits and never opens a port. An already-open browser tab keeps
working, so the app looks healthy while no dev server is running; the
UI then reports a connection/network error rather than the real cause.

Cause: corrupt / partial `node_modules` in `apps/web`, or the wrong
Node major (e.g. system Node 24.16.0). On Node 24 the native addon
loaded by the Angular build cache (`lmdb`) hangs indefinitely, so the
CLI stalls before printing anything.

### Step 1 — check the Node version FIRST

```sh
node -v        # must print v22.12.0
nvm use        # picks up .nvmrc -> 22.12.0
```

A silent, hanging, port-less command is a Node version mismatch until
proven otherwise. Check this before investigating application code,
CORS, configuration or the network.

If the version was already correct, continue to Step 2.

### Step 2 — reinstall dependencies

```sh
nvm use 22.12.0
cd apps/web
rm -rf node_modules .angular
npm install
node ./node_modules/@angular/cli/bin/ng.js version  # should print CLI table
npm start
```

To stop recurring, pin the shell default:

```sh
nvm alias default 22.12.0
```

Note: `./node_modules/@angular/cli/lib/cli/index.js` is a library
module, not the executable. Invoking it exits 0 with no output. Always
use `./node_modules/@angular/cli/bin/ng.js`.

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
`MAIL_PASSWORD`, `MAIL_FROM`, `MAIL_FROM_NAME` and `OPS_ALERT_EMAIL`.

Provider notification email is off until it is configured: with
`MAIL_ENABLED` unset or `false` the rendered message is only written to
the log and nothing is sent, so local development and tests never need a
mail server. Set `MAIL_ENABLED=true` with `MAIL_HOST` (plus
`MAIL_USER`/`MAIL_PASSWORD` when the relay needs them) and `WEB_BASE_URL`
(the Angular dev origin, `http://localhost:4200`, is the default) to
send provider emails with working in-app links. Use a fictional sender
such as `no-reply@example.co.za` locally; never a real address.

### OPS_ALERT_EMAIL — platform alerts inbox

`OPS_ALERT_EMAIL` is the single operations address that receives an email
when a new account registers and when a new job request is posted. It is
configurable rather than hard-coded, because the recipient is an operational
decision per deployment; leaving it empty disables these alerts entirely, so no
deployment starts sending them by accident.

These alerts share the SMTP transport, so they are **also** subject to
`MAIL_ENABLED`: with mail disabled — the default, and the state of a fresh
`.env` — the sender resolves to a no-op and nothing is delivered. Setting
`OPS_ALERT_EMAIL` alone is therefore not enough to start receiving them.

Unlike provider notification email, an operations alert deliberately carries
contact details (the registering email and phone, the requesting customer's
email and the job description). That is the purpose of the alert, so
`OPS_ALERT_EMAIL` must be an address controlled by the business. Credentials
are never included: no password, hash or token is rendered, in either the
subject or the body. See `docs/NOTIFICATIONS.md`.

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
