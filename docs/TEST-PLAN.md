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
