# FixLink — Database Architecture

## 1. Database

FixLink uses:

MySQL 8

The database is the source of truth for structured application data.


## 2. Database Principles

Use:

- Relational design
- Foreign keys
- Appropriate indexes
- Unique constraints
- NOT NULL constraints where appropriate
- Timestamps
- Migrations
- Seeders for development data

Do not:

- Store passwords in plaintext
- Store large binary files in MySQL
- Duplicate data unnecessarily
- Manually modify production schema


## 3. Migration Strategy

All schema changes must use migrations.

Example:

database/migrations/

Migrations must be:

- Versioned
- Reproducible
- Reversible where practical
- Tested


## 4. Core Identity Tables

### users

Stores authentication-level user information.

Typical fields:

- id
- email
- phone
- password_hash
- status
- email_verified_at
- phone_verified_at
- last_login_at
- created_at
- updated_at
- deleted_at

Passwords must never be stored in plaintext.


### roles

Stores platform roles.

Roles:

CUSTOMER
PROFESSIONAL
BUSINESS_OWNER
BUSINESS_MANAGER
TECHNICIAN
ADMIN


### user_roles

Associates users with roles.

A user may have one or more roles where explicitly supported.


## 5. Customer

### customer_profiles

Stores customer-specific information.

Examples:

- user_id
- first_name
- last_name
- profile_photo
- preferred contact information


## 6. Professionals

### professional_profiles

Stores individual provider information.

Examples:

- user_id
- display_name
- bio
- experience_years
- service_area
- verification_status
- rating summary


### professional_services

Associates professionals with services.


## 7. Businesses

### business_profiles

Stores business information.

Examples:

- owner
- business_name
- description
- logo
- contact information
- service area
- verification status


### business_members

Associates users with businesses.

Possible roles:

BUSINESS_OWNER
BUSINESS_MANAGER
TECHNICIAN


## 8. Technicians

Technicians are business team members.

Technician data should reference:

- User
- Business

Technicians must not automatically become marketplace professionals.


## 9. Services

### service_categories

Stores service categories.

### services

Stores individual services.

### professional_services

Associates professionals with services.

Business service associations may be stored separately where needed.


## 10. Service Areas

### service_areas

Stores provider/business operating areas.

Do not expose unnecessary precise private location data publicly.


## 11. Portfolio

### portfolio_projects

Stores public professional/business work.

Examples:

- provider
- title
- description
- service
- published status


### portfolio_images

Stores portfolio image metadata.

Actual image files are stored externally.


## 12. Certificates

### certificates

Stores certificate metadata.

Examples:

- provider
- title
- issuing organisation
- issue date
- expiry date
- verification status
- document reference


### certificate_verifications

Stores review information.

Private certificate documents must not be publicly accessible.


## 13. Verification

### verification_requests

Stores verification workflows.

Types:

IDENTITY
CERTIFICATE
BUSINESS


### identity_verifications

Stores identity verification metadata.

Sensitive documents must be stored securely outside the database or using
appropriate protected storage.


## 14. Jobs

### jobs

This is the central job table.

Jobs may originate from:

MARKETPLACE
INTERNAL

Core fields may include:

- id
- reference
- source
- customer_id
- professional_id
- business_id
- service_id
- description
- address/location reference
- scheduled_at
- status
- agreed_amount
- currency
- created_at
- updated_at
- completed_at
- closed_at


## 15. Job Assignments

### job_assignments

Stores assignment history.

Can represent:

- Professional assignment
- Business assignment
- Technician assignment

Important fields may include:

- job_id
- user_id
- assignment_type
- assigned_by
- assigned_at
- unassigned_at


## 16. Job Images

### job_images

Stores image metadata.

Fields may include:

- job_id
- uploader_id
- phase
- file_reference
- mime_type
- file_size
- created_at

Phases:

BEFORE
DURING
AFTER


## 17. Job Updates

### job_updates

Stores written progress updates.

Examples:

- job_id
- author_id
- message
- created_at


## 18. Job Voice Notes

### job_voice_notes

Stores metadata/reference to voice notes.

Actual audio files are external.


## 19. Job Status History

### job_status_history

Stores status transitions.

Examples:

- job_id
- previous_status
- new_status
- changed_by
- reason
- created_at

History should not be overwritten.


## 20. Quotes

### quotes

Stores provider/business quotes.

Fields may include:

- job_id
- provider/business
- total
- currency
- description
- status
- submitted_at
- accepted_at
- declined_at


### quote_items

Stores individual quote items.

Examples:

- description
- quantity
- unit_price
- total


## 21. Parts

### parts_requests

Stores technician/provider requests for parts.

Fields may include:

- job_id
- requester_id
- status
- reason
- created_at
- reviewed_at


### parts_request_items

Stores requested parts.

Examples:

- part_name
- quantity
- notes
- photo_reference


## 22. Job Approvals

### job_approvals

Stores manager approval workflows.

Examples:

- job_id
- request_type
- requested_by
- reviewed_by
- status
- comments
- timestamps


## 23. Messaging

### conversations

Stores conversations.

### conversation_participants

Associates users with conversations.

### messages

Stores messages.

### message_attachments

Stores attachment metadata.


## 24. Reviews

### reviews

Stores customer reviews.

Examples:

- job_id
- customer_id
- provider/business
- rating
- comment
- created_at


### review_responses

Stores provider/business responses.


## 25. Notifications

### notifications

Stores user notifications.

Examples:

- user_id
- type
- title
- message
- reference_type
- reference_id
- read_at
- created_at


## 26. Saved Providers

### saved_professionals

Associates customers with saved professionals/businesses where supported.


## 27. Reports

### reports

Stores user/platform reports.

Potential report types:

- Provider report
- Review report
- Job report
- User report
- Content report


## 28. Disputes

### disputes

Stores job-related disputes.

Examples:

- job_id
- opened_by
- reason
- description
- status
- resolution
- resolved_by


## 29. Audit Logs

### audit_logs

Stores important administrative/security actions.

Examples:

- actor
- action
- entity_type
- entity_id
- metadata
- timestamp


## 30. File Metadata

Where needed, a file metadata table may be introduced.

It should store:

- file identifier
- storage key
- original filename
- MIME type
- size
- owner
- entity
- created_at

Actual file content remains external.


## 31. Future Subscription Architecture

The MVP does not implement subscription billing.

The architecture may later introduce:

plans
subscriptions
subscription_features
subscription_limits

Do not create these unless required by the approved MVP.


## 32. Payment Data

The MVP does not process payments.

Do not create a payment transaction system unless the scope is explicitly
changed.

The job/quote architecture may retain fields that allow future payment
support.


## 33. Relationships

High-level:

User
 |
 +-- Customer Profile
 |
 +-- Professional Profile
 |
 +-- Business Membership
 |
 +-- Roles

Business
 |
 +-- Members
 +-- Technicians
 +-- Customers
 +-- Jobs

Customer
 |
 +-- Jobs
 +-- Reviews
 +-- Saved Providers

Professional
 |
 +-- Services
 +-- Portfolio
 +-- Certificates
 +-- Jobs
 +-- Reviews

Job
 |
 +-- Quote
 +-- Assignments
 +-- Images
 +-- Updates
 +-- Voice Notes
 +-- Parts Requests
 +-- Status History
 +-- Messages
 +-- Review


## 34. Indexing

Indexes should be created for common lookup paths.

Examples:

- user email
- user phone
- job status
- job customer
- job business
- job professional
- job technician assignment
- job created date
- quote job
- notifications user/read state
- reviews provider
- service/category
- business membership


## 35. Data Integrity

Use foreign keys where appropriate.

Important relationships must not leave orphaned records.

Deletion behaviour must be explicitly defined.

Use soft deletion for records where historical preservation is required.


## 36. Privacy

Sensitive information must be minimized.

Private information includes:

- Identity documents
- Verification information
- Private customer information
- Internal business information
- Admin notes
- Audit data

Public profile data must be deliberately selected.


## 37. Seed Data

Seeders should contain fictional South African data.

Examples:

- Fictional names
- Fictional businesses
- Fictional phone numbers
- Fictional email addresses
- Fictional addresses

Never use real customer information.


## 38. Database Change Rule

Any structural database change must:

1. Update this document.
2. Create a migration.
3. Update seeders where necessary.
4. Update related API documentation.
5. Add/update tests.
6. Run migration verification.


## 39. Database Principle

The database should support the approved FixLink product without unnecessary
complexity.

Prefer a clear relational model over premature optimization.


## 40. Stage 4 Implementation Notes

Decisions taken while implementing the database foundation (2026-09-22).
No product functionality was added or changed; these clarify the approved
model above.

### 40.1 Business service associations

`business_services` (`business_id`, `service_id`) stores which catalogue
services a business offers, mirroring `professional_services`. This uses the
"stored separately where needed" option from sections 9 and 13.

### 40.2 Business-managed customers

`customer_profiles.user_id` is NULLABLE and a `business_id` column references
`business_profiles`. Marketplace customers have `user_id` set;
business-created customers without a login have `user_id` NULL and
`business_id` set. Backend services must enforce that at least one is set
(see 40.5).

### 40.3 Exactly-one-owner rules live in backend services

Portfolio projects, certificates, quotes, reviews and saved-provider rows
each belong to exactly one owner (professional XOR business). These rules
are enforced by backend validation, NOT database CHECK constraints, because
MySQL 8 rejects CHECK constraints on columns governed by foreign-key
referential actions (ERROR 3822 class). The migration files record this per
table.

### 40.4 `users.status` values

`PENDING` (registered, not yet verified), `ACTIVE`, `SUSPENDED`, `DELETED`
(soft-deleted; row retained with `deleted_at` for history preservation).

### 40.5 `jobs.confirmed_at`

Added alongside the documented `completed_at`/`closed_at`: CONFIRMED is a
distinct lifecycle state (customer confirmation after COMPLETED), so it gets
its own timestamp like the other terminal states.

### 40.6 Quote item totals are generated columns

`quote_items.total` is a STORED GENERATED column (`quantity * unit_price`).
The backend must still compute and return totals, but the database never
stores client-supplied line math.

### 40.7 Messaging read model (MVP)

`messages.read_at` records first read. Per-participant read receipts are a
future addition that must not break this column (additive table, e.g.
`message_reads`).

### 40.8 Seed password hashes are placeholders

Development seeds use scrypt hashes of the fictional password
`FixLink-dev-001`. They exist only to prove "no plaintext" handling.
Production authentication (later stage) standardises on bcrypt and its own
hashing/verification service.

### 40.9 Migration and seed conventions

- Migrations: `database/migrations/NNN_name.sql`, each with
  `-- +migrate Up` / `-- +migrate Down` sections. Runners:
  `node database/migrate.js up|status|down [n]|reset`
  (from `database/`: `npm run db:migrate`, `db:migrate:status`,
  `db:migrate:down`, `db:migrate:reset`, `db:rebuild`).
- Applied versions tracked in `schema_migrations`; applied seed files in
  `schema_seeds` (`migrate reset` clears seed tracking because data tables
  are empty again).
- Reference snapshot: `database/schema/schema.sql` (mysqldump --no-data).
  Migrations remain the source of truth; the snapshot is regenerated, never
  hand-edited.
- Tests: `database/tests/schema.test.js` (`npm test` from `database/`),
  Node built-in test runner, no extra framework.

### 40.10 `audit_logs` is immutable by design

No `updated_at` column; rows are insert-only. Corrections are new rows.
