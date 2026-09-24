# Environment

## Node.js (verified)

FixLink web (`apps/web`, Angular 21) is verified with:

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

## Notes

- `.angular/` cache is gitignored; safe to delete when the dev server
  behaves strangely.
- `node_modules/` is gitignored; always reinstall after Node major changes.
