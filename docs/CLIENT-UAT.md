# FixLink Client User Acceptance Testing (UAT)

## 1. What is FixLink?

FixLink is a South African home-services marketplace and job-management platform. It helps customers find and hire service professionals or service businesses. It also gives businesses a private place to manage their customers, technicians and internal jobs.

The main marketplace journey is:

**Find → Trust → Hire → Work → Document → Complete → Review**

The current MVP records quotes and job history. It does **not** process customer payments. Payment is arranged directly between the customer and the professional or business.

## 2. Before you start

Use only a UAT or development database. Do not enter real customer, identity, payment or other sensitive information.

You need:

- Node.js `22.12.0` (the repository `.nvmrc` is the source of truth)
- npm
- Docker Desktop
- A modern browser
- The repository checked out locally

## 3. Start FixLink locally

Run these commands from the repository root.

### Install dependencies

```sh
nvm use
npm install --prefix backend
npm install --prefix database
npm install --prefix apps/web
```

### Start MySQL

```sh
docker compose up -d
```

The development database is exposed on `localhost:3307` by the repository Docker Compose file.

### Configure local environment

Copy the example files when they are not already present:

```sh
cp .env.example .env
cp backend/.env.example backend/.env
```

The example values are development values only. Never use them in production.

### Apply migrations and development data

From the `database` directory:

```sh
npm run db:migrate
npm run db:migrate:status
npm run db:seed
```

The seed command adds fictional development data. It is safe only for a new development or isolated UAT database. Never overwrite a production database with these seeds.

### Start the API

In a second terminal:

```sh
cd backend
npm run dev
```

The API is available at `http://localhost:3000`. Check `http://localhost:3000/health` before opening the web application.

### Start the web application

In a third terminal:

```sh
cd apps/web
npm start
```

Open `http://localhost:4200` in the browser.

## 4. Development test accounts

These accounts are created by the fictional repository seed data. The shared password is `FixLink-dev-001`; it is a development credential and must never be used in production.

| Role | Email | Purpose | Important restrictions |
|---|---|---|---|
| Customer | `naledi.dlamini@example.co.za` | Marketplace request, quote acceptance, completion confirmation and review viewing | Can access only this customer's marketplace jobs |
| Customer | `pieter.vdm@example.co.za` | Additional marketplace customer and isolation testing | Cannot see Naledi's private jobs |
| Individual professional | `sipho.ndlovu@example.co.za` | Provider requests, quotes, scheduling and marketplace execution | Can access only requests addressed to this provider |
| Individual professional | `kabelo.mahlangu@example.co.za` | Additional verified provider and public profile testing | Profile data is public only as approved by the API |
| Business owner | `thabo.maseko@example.co.za` | Ubuntu Plumbing business dashboard, customers, internal jobs and technician assignment | Limited to Ubuntu Plumbing Co. |
| Business manager | `lerato.khumalo@example.co.za` | Ubuntu Plumbing operational management and parts review | Same business data as the owner; cannot edit the owner-only profile |
| Technician | `bongani.zulu@example.co.za` | Assigned My Jobs, photos, notes, voice notes and parts requests | Only actively assigned Ubuntu Plumbing jobs are visible |
| Technician | `karin.meyer@example.co.za` | Technician isolation and reassignment testing | Cannot see jobs assigned to another technician or another business |
| Second business owner | `thandi.khumalo@example.co.za` | Business isolation testing | Limited to Randburg Volt & Solar; must not see Ubuntu Plumbing data |
| Admin | `admin@fixlink.example.co.za` | Platform dashboard, users, verification, certificates, reports, disputes and audit logs | Platform-wide access; use only for authorised testing |

If a seeded account cannot log in, recreate the development data according to the repository procedure rather than changing production credentials.

## 5. What each role can test

### Customer

A customer can:

- register or log in;
- search services and browse providers;
- open a provider profile and see approved public information;
- request a marketplace job;
- view their own requests and quotes;
- accept a quote;
- view the scheduled job and its work documentation;
- confirm completion;
- view existing reviews on a provider profile.

The current frontend does not provide a customer review-submission form, quote-decline action, messaging, or provider-saving workflow. Do not report those as a failed UAT test when the limitation is recorded here; record them as a scope limitation if the client needs them.

### Individual professional

An individual professional can:

- log in;
- view requests addressed to them;
- open a request;
- submit a ZAR quote;
- view the accepted job;
- schedule and start it;
- upload BEFORE photos, add DURING updates and upload AFTER photos;
- complete the job;
- view the resulting job history.

The current professional UI does not include profile, service-area, portfolio or certificate management, voice notes, messaging, or review responses.

### Business owner and manager

A business owner or manager can:

- view the business dashboard;
- manage business customers;
- create internal jobs;
- view the internal job board;
- assign and reassign technicians;
- track job status and technician updates;
- view technician photos, notes and voice-note playback;
- review parts requests;
- approve, reject or request more information;
- mark approved parts available;
- track Awaiting Parts and resume work when allowed;
- view history and notifications.

The active assigned technician completes an internal job. The owner/manager surface reviews and manages the job but does not replace the technician's completion action.

### Technician

A technician can:

- view My Jobs;
- open an actively assigned job;
- start a requested or scheduled job;
- add BEFORE photos and DURING notes;
- record or upload a voice note;
- request parts, including an optional evidence photo;
- respond when more information is requested;
- continue after parts are available;
- add AFTER photos;
- complete the job.

Technicians are business team members. They are **not automatically marketplace professionals** and cannot access marketplace provider requests or other technicians' jobs.

### Admin

An admin can view and, where the current implementation allows, manage:

- dashboard metrics;
- users and account suspension/reactivation;
- customers, professionals, businesses and technicians;
- services and categories;
- jobs;
- verification and certificate review;
- reviews as read-only records;
- reports and report status;
- disputes and resolution/status updates;
- audit logs.

`/admin/settings` is present in the navigation and route configuration, but platform settings management is not implemented. It must not be treated as a functioning feature in this release.

## 6. Major UAT workflows

### Customer marketplace workflow

1. Register or log in as a customer.
2. Search the marketplace for a service and location.
3. Browse the results and open a provider profile.
4. Confirm that the profile shows only appropriate public information.
5. Request a job with a service, description, location and preferred date/time.
6. Open the job and receive or view a provider quote.
7. Accept the quote.
8. View the scheduled date and status.
9. Open the job again and view the execution documentation.
10. Confirm completion.
11. Review the provider's existing public reviews.

The current flow confirms a completed marketplace job through `COMPLETED`, then records `CONFIRMED` and `CLOSED`. The platform records the agreed quote but does not collect payment.

### Individual professional workflow

1. Log in.
2. View Requests.
3. Open a request.
4. Submit a quote.
5. After customer acceptance, open the accepted job.
6. Schedule it.
7. Start the job.
8. Upload a BEFORE photo.
9. Add a DURING update.
10. Upload an AFTER photo.
11. Complete the job with a completion note.
12. View the job history.

### Business owner or manager workflow

1. Log in.
2. View the business dashboard.
3. Manage business customers.
4. Create an internal job.
5. Assign a technician.
6. Reassign the technician when needed and confirm assignment history.
7. Track the job on the internal job board.
8. View the technician's updates and photos.
9. Review the optional parts photo.
10. Approve, reject or request information for a parts request.
11. Track the `AWAITING_PARTS` state.
12. Mark parts available.
13. Confirm the assigned technician can resume the job.
14. Confirm the assigned technician completes the job.
15. Review the history.

### Technician workflow

1. Log in.
2. View My Jobs.
3. Open an assigned job.
4. Start the job.
5. Upload BEFORE photos.
6. Add DURING updates.
7. Add a voice note.
8. Request parts.
9. Continue after approval and availability.
10. Add AFTER photos.
11. Complete the job.

### Admin workflow

Log in and inspect the dashboard, users, customers, professionals, businesses, technicians, services, jobs, verification, certificates, reviews, reports, disputes and audit logs. Test only the actions currently exposed; settings, review moderation and job intervention are not implemented.

## 7. What counts as a successful test

A test passes when the expected result is visible and the workflow completes without an unexpected error. Check:

- the correct role is shown;
- the correct data is visible;
- another user's or another business's private data is not visible;
- status changes are made by the permitted role;
- messages are understandable;
- private files cannot be opened by an unauthorised user;
- a browser refresh does not lose a valid session;
- logout removes access to protected pages;
- loading, empty and error states remain understandable.

A page that displays an error, shows another person's data, permits an invalid action, or loses a valid workflow is not successful.

## 8. Reporting a problem

Send the project representative:

- the date and time of the test;
- your role;
- the account email used (never the password);
- the test number and a short title;
- the page or URL;
- the expected result;
- the actual result;
- exact error text or a screenshot, with secrets removed;
- browser and device or screen size;
- whether the problem can be reproduced;
- any data or job reference that helps locate it, such as a fictional UAT job reference.

Do not send passwords, access tokens, database passwords, API keys, identity documents, certificate documents or private verification files.

## 9. Important MVP boundaries

- FixLink does not process customer payments, hold funds, operate escrow, or settle transactions.
- The customer pays the professional or business directly.
- Verification documents are private and must only be opened by authorised administrators.
- Technicians are not automatically marketplace professionals.
- The `/admin/settings` placeholder is a known limitation.
- Local file storage is an MVP deployment choice; cloud/object storage is future infrastructure.
