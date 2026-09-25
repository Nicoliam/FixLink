# FixLink Post-Deployment Smoke Test

This is the short smoke test to run after every deployment. Use a dedicated smoke account and fictional UAT data. Record the release version, date, operator and result.

## Preparation

Confirm the API, web origin and database are reachable. Use:

- API health URL: `/health`
- public marketplace: `/marketplace`
- test accounts from [`CLIENT-UAT.md`](CLIENT-UAT.md)
- one active customer job and one active internal job in the UAT environment

## Tests

| # | Check | Expected result | Result |
|---:|---|---|---|
| 1 | API startup and health | `GET /health` returns HTTP 200 with `data.status = ok` |  |
| 2 | Database connectivity | Login and `/auth/me` succeed using `AUTH_STORE=mysql`; this confirms the API can query the database |  |
| 3 | Customer login | Customer can log in, open My Jobs and log out |  |
| 4 | Marketplace search | Public marketplace loads and returns provider results |  |
| 5 | Provider profile | A provider profile loads with public, non-private data only |  |
| 6 | Customer job request | Customer creates a `MARKETPLACE` `REQUESTED` job |  |
| 7 | Quote | Addressed provider submits a valid ZAR quote and the job becomes `QUOTED` |  |
| 8 | Quote acceptance | Customer accepts the quote and the job becomes `ACCEPTED` |  |
| 9 | Job status progression | Provider schedules and starts the job; permitted transitions are visible as `SCHEDULED` and `IN_PROGRESS` |  |
| 10 | Media upload | Provider uploads a valid BEFORE image and an authorised customer can view the private file |  |
| 11 | Business job | Owner or manager creates an `INTERNAL` job and it appears on the business job board |  |
| 12 | Technician assignment | Owner or manager assigns the active technician; the job appears in the technician's My Jobs |  |
| 13 | Technician update | Technician starts the job, adds a DURING note or AFTER image, and the owner/manager can view it |  |
| 14 | Notification | A relevant recipient sees the expected in-app notification and can mark it read |  |
| 15 | Admin login | Admin can log in, open the dashboard and view an admin list without exposing private document references |  |

## Failure handling

For any failure:

1. Record the exact test, account role, request/response status, safe error message and time.
2. Check API and web logs without recording credentials or file contents.
3. Check database connectivity, migration status, CORS, upload permissions and storage capacity.
4. Stop the release if authentication, authorization, private media, data isolation or payment wording is wrong.
5. Use the rollback procedure in [`DEPLOYMENT.md`](DEPLOYMENT.md) when the release cannot be made safe.
6. Do not claim the smoke test passed when a check was only partially executed.
