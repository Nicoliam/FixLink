# FixLink — Test Plan

## Stage 6B — Customer Job Request / Job Creation

Backend (`backend/tests/jobs.test.ts`, in-memory stores, no MySQL
required — run with `npm test` from `backend/`):

- Authenticated customer creates a marketplace job → `201`, source
  `MARKETPLACE`, status `REQUESTED`, correct provider/service linkage
  and server-side ownership (individual professional and business).
- `401` unauthenticated; `403` non-customer role; `400` malformed
  provider/service ids; `404` unknown provider/service/job;
  `422` provider-service mismatch and invalid description, location,
  date or time.
- Spoofed `customer_id`/`status`/`source` in the body are ignored.
- `GET /api/v1/jobs` returns only owned jobs; `GET /api/v1/jobs/:id`
  returns `404` for another customer's job.

Frontend (`apps/web`, run with `npx ng test --watch=false`):

- `request-job.spec.ts`: route guard, provider summary, form validation,
  successful submit → success state with navigation, API error state,
  blocked submit without a provider.
- `job.service.spec.ts`: request body mapping, list pagination params,
  single-job fetch.
- `my-jobs.spec.ts` / `job-detail.spec.ts`: list, empty, error and
  not-found states.

## Stage 6C — Provider Requests & Quotes

Backend (`backend/tests/quotes.test.ts`, in-memory stores, no MySQL
required — run with `npm test` from `backend/`):

- Professional inbox returns only addressed marketplace requests
  (`200` + standard envelope); another provider's requests are
  invisible. Business owner and manager retrieve business requests.
- `403` for customer, technician and unauthenticated (`401`) inbox
  access; `status` filter supports `REQUESTED`/`QUOTED`, rejects other
  values with `422`.
- Request detail (`200`) carries quoting context with a
  privacy-limited customer display name and no contact details;
  another provider's request reads as `404`; malformed id → `400`.
- Valid quote submission → `201` (`SUBMITTED`, ZAR, message, items
  with derived totals); job transitions `REQUESTED → QUOTED` with a
  status-history entry.
- `422` for negative/non-numeric/oversize totals and invalid items
  (zero/negative quantity, negative price, empty description);
  `404` unknown job; `400` malformed job id; `404` unrelated job;
  `403` customer/technician submission; `409 CONFLICT` second quote
  (original preserved); failed creation leaves the job `REQUESTED`
  with no history entry.
- Quote retrieval: owning customer and submitting provider read quotes
  (`GET /api/v1/jobs/:id/quotes`, `GET /api/v1/quotes/:id`, embedded
  in `GET /api/v1/jobs/:id`); another customer reads `404`.
- All asserted responses preserve the standard success/error
  envelopes.

Frontend (`apps/web`, run with `npx ng test --watch=false`):

- `requests.spec.ts`: addressed list, empty and error states.
- `request-detail.spec.ts`: detail with quote form, blocked submit on
  invalid amount, successful submit → submitted state (`R1,250`,
  no duplicate form), QUOTED jobs show the existing quote, not-found
  state, server-error surface (e.g. `409`).
- `job.service.spec.ts`: provider inbox params, quote body mapping
  (trim + ZAR uppercase), job-quotes list and single-quote fetch.
- `job-detail.spec.ts`: received-quote display (amount, message,
  items). Customer acceptance arrived in Stage 6D (see below) —
  this 6C-era assertion covers the read-only display only.

Note: rate limiters are instantiated per app (inside the route
factories) so each test app has an isolated store; production runs
one app per process, so runtime behaviour is unchanged.

## Stage 6D — Customer Quote Acceptance

Backend (`backend/tests/quote-acceptance.test.ts`, in-memory stores,
no MySQL required — run with `npm test` from `backend/`):

- Customer retrieves own quotes, then accepts an eligible quote →
  `200` with `{ job, quote }`: quote `SUBMITTED → ACCEPTED`, job
  `QUOTED → ACCEPTED` with `agreedAmount`/`currency` recorded, the
  accepted provider still the addressed provider, and a `QUOTED →
  ACCEPTED` status-history entry.
- `404` for another customer's job, cross-job quote ids and unknown
  quotes; `403` for provider-only, technician-only, manager-only and
  admin-only actors (exact-role users are provisioned directly
  because `setRoles` is additive); a dual-role owner-manager accepts
  their own job.
- `409 CONFLICT` for repeat acceptance (single history entry);
  `422` for withdrawn/declined quotes and `REQUESTED`/`COMPLETED`/
  `CANCELLED`/`DISPUTED` jobs; `404` for `INTERNAL` jobs; `400` for
  malformed ids; `401` unauthenticated.
- Failed acceptance leaves job `QUOTED`, quote untouched,
  `agreedAmount` null and no `ACCEPTED` history (rollback).
- Multiple quotes: one acceptance wins, the other retires to
  `DECLINED` (never deleted) and can no longer be accepted; provider
  request detail reflects `ACCEPTED`.
- All asserted responses preserve the standard success/error
  envelopes.

Frontend (`apps/web`, run with `npx ng test --watch=false`):

- `job.service.spec.ts`: accept call posts `{}` to
  `/jobs/:id/quotes/:quoteId/accept` and resolves `{ job, quote }`.
- `job-detail.spec.ts`: QUOTED job shows per-quote `Accept Quote`
  actions; hidden for `REQUESTED`/`ACCEPTED` and ineligible quotes;
  confirmation step with the quoted amount and direct-payment
  wording; in-flight `Accepting…` disabled state; success → `Quote
  accepted` banner with agreed price and payment wording, no further
  actions; server errors surfaced with the quote intact;
  multi-quote selection and retired (`No longer available`) display.
- `request-detail.spec.ts`: `ACCEPTED` jobs show the provider-side
  `Accepted` state with the agreed amount and no quote form.

No database migration was required in Stage 6D (existing
`quotes.status`, `jobs.agreed_amount`/`currency`,
`job_status_history` and `job_assignments` reused); the
`database/tests/schema.test.js` suite still requires a live MySQL
instance and is unchanged.
