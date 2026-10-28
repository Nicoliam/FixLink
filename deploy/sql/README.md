# Database for Fixlynk on Afrihost

> **IMPORTANT — Choose the correct procedure**
>
> - **Fresh database:** import migrations 001–020 in numeric order only after confirming the database is empty.
> - **Existing production database:** do NOT import migrations 001–015 again or run the full sequence. Back up the database, inspect its migration history and live schema, and apply only reviewed pending migrations. Record each version in `schema_migrations` only after its SQL succeeds.
>


For a fresh database only, import these files **in numeric order** through phpMyAdmin (cPanel > phpMyAdmin >
select the Fixlynk database > Import). Each file depends on the ones before it.

| Order | File | What it creates |
|-------|------|-----------------|
| 01 | `001_identity.sql` | users, roles, refresh sessions foundations |
| 02 | `002_services.sql` | service categories and the public service catalogue |
| 03 | `003_profiles_businesses.sql` | customer, professional and business profiles |
| 04 | `004_jobs_core.sql` | the single `jobs` table (marketplace and internal) |
| 05 | `005_jobs_activity.sql` | job status history, updates and photos |
| 06 | `006_quotes_parts_approvals.sql` | quotes, parts requests, approvals |
| 07 | `007_portfolio_certificates_verification.sql` | portfolio, certificates, verification |
| 08 | `008_messaging_reviews_platform.sql` | messaging, reviews, disputes, audit |
| 09 | `009_job_execution.sql` | execution events, scheduling |
| 10 | `010_technician_voice_notes.sql` | technician voice notes |
| 11 | `011_parts_available.sql` | parts availability |
| 12 | `012_refresh_sessions.sql` | refresh session storage |
| 13 | `013_parts_review_notes_length.sql` | column length fix |
| 14 | `014_notification_email_delivery.sql` | email delivery tracking |
| 15 | `015_provider_service_offerings.sql` | a professional's own service catalogue |
| 16 | `016_saved_professionals_uniqueness.sql` | customers saving a professional |
| 17 | `017_job_image_request_context.sql` | request context on job images |
| 18 | `018_open_job_requests.sql` | open job requests (no professional yet) |
| 19 | `019_offering_price_optional.sql` | offering price may be NULL (not priced yet) |
| 20 | `020_verification_documents.sql` | professional verification documents and their review status |

## Notes

- **No seeders.** A fresh database should start empty. Demo data
  (`database/seeders/*.sql`) is fictional and must not be loaded into production.
- phpMyAdmin's import limit can stop a large file. If that happens, use the
  cPanel **Terminal** instead:
  `mysql -u USER -p DBNAME < 001_identity.sql`
- After importing, the API must be able to connect. Test with
  `GET /health` (liveness) and then a real login.
- If a migration fails, stop. Do not edit the SQL to force it through — fix the
  cause and re-import into a fresh database (AGENTS.md section 16).
