# FixLink — System Architecture

## 1. Purpose

This document defines the technical architecture of FixLink.

## Current implementation note

The implemented MVP uses an Angular web application, a Node.js/TypeScript
REST API, MySQL 8 and a protected local filesystem adapter. The file and
notification concepts below include the intended platform architecture;
cloud/object storage, external notification channels and several product
features remain future scope. For release-specific facts, use
`docs/HANDOVER.md` and `docs/DEPLOYMENT.md`.

The architecture must support:

- Customer marketplace
- Individual professionals
- Service businesses
- Business technicians
- Internal business jobs
- Marketplace jobs
- Quotes
- Job management
- Before/During/After documentation
- Messaging
- Reviews
- Verification
- Administration

The architecture must remain modular, secure, maintainable and suitable
for future expansion.


## 2. High-Level Architecture

FixLink consists of:

1. Angular Web Application
2. Node.js REST API
3. MySQL Database
4. File/Object Storage
5. Notification infrastructure
6. Docker-based local development environment

Architecture:

Customer / Professional / Business / Technician / Admin
                         |
                         v
                 Angular Web App
                         |
                         | HTTPS / REST
                         v
                  Node.js API
                         |
              +----------+----------+
              |                     |
              v                     v
           MySQL              File Storage
              |
              v
        Structured Data


## 3. Frontend

Frontend technology:

- Angular
- TypeScript
- SCSS

Location:

apps/web/

The frontend is responsible for:

- User interface
- Navigation
- Forms
- Client-side validation
- API communication
- Displaying data
- Loading states
- Empty states
- Error states
- Responsive behaviour

The frontend is NOT responsible for:

- Database access
- Authorization enforcement
- Trusting client-provided prices
- Trusting client-provided roles
- Trusting client-provided ownership
- Arbitrary job status transitions


## 4. Backend

Backend technology:

- Node.js
- TypeScript
- REST API

Location:

backend/

The backend is responsible for:

- Authentication
- Authorization
- Business logic
- Validation
- Database access
- File access
- Job lifecycle
- Quote lifecycle
- Permissions
- Notifications
- Audit logging
- Security


## 5. API Versioning

All application API endpoints use:

/api/v1

Example:

/api/v1/auth/login

/api/v1/jobs

/api/v1/providers


## 6. Backend Request Flow

Requests should generally follow:

ROUTE
  ↓
CONTROLLER
  ↓
VALIDATION
  ↓
AUTHENTICATION
  ↓
AUTHORIZATION
  ↓
SERVICE
  ↓
DATABASE / STORAGE
  ↓
RESPONSE

Controllers should remain thin.

Business rules belong in services/domain logic.


## 7. Database

Database:

MySQL 8

The database stores structured application data.

Examples:

- Users
- Roles
- Businesses
- Customers
- Professionals
- Technicians
- Services
- Jobs
- Quotes
- Reviews
- Notifications
- Verification metadata
- Audit logs

Binary files should not be stored directly in MySQL.


## 8. File Storage

Files should be stored in external/object storage.

Examples:

- Profile images
- Portfolio images
- Job images
- Certificates
- Verification documents
- Voice notes
- Message attachments

MySQL stores metadata and references.

Example:

file_id
storage_key
file_name
mime_type
file_size
owner_id
entity_type
entity_id
created_at


## 9. Application Modules

The backend should use modular architecture.

Core modules:

AUTH
USERS
CUSTOMERS
PROVIDERS
BUSINESSES
TECHNICIANS
SERVICES
PORTFOLIO
CERTIFICATES
VERIFICATION
JOBS
QUOTES
PARTS
MESSAGING
REVIEWS
NOTIFICATIONS
REPORTS
DISPUTES
ADMIN


## 10. Authentication

Authentication is responsible for:

- Registration
- Login
- Logout
- Session/token handling
- Password reset
- Email verification
- Phone verification where supported

Authentication must not determine authorization by itself.

Authentication answers:

"Who is this user?"

Authorization answers:

"What is this user allowed to do?"


## 11. Authorization

Authorization is enforced by the backend.

Roles:

CUSTOMER
PROFESSIONAL
BUSINESS_OWNER
BUSINESS_MANAGER
TECHNICIAN
ADMIN

Authorization must consider:

- User role
- Resource ownership
- Business membership
- Job assignment
- Resource state


## 12. Business Isolation

Business data must be isolated.

Every business-related query must ensure the authenticated user has access
to that business.

Example:

Business A cannot access Business B's:

- Customers
- Jobs
- Technicians
- Reports
- Parts requests
- Internal notes


## 13. Job Architecture

FixLink uses one job system.

Do NOT create separate:

marketplace_jobs

business_jobs

tables.

Use:

jobs

with a source/type:

MARKETPLACE
INTERNAL

This allows common functionality across both job types.


## 14. Job Lifecycle

Primary lifecycle:

REQUESTED
↓
QUOTED
↓
ACCEPTED
↓
SCHEDULED
↓
IN_PROGRESS
↓
COMPLETED
↓
CONFIRMED
↓
CLOSED

Optional:

IN_PROGRESS
↓
AWAITING_PARTS
↓
IN_PROGRESS

Cancellation:

REQUESTED / QUOTED / ACCEPTED / SCHEDULED
↓
CANCELLED

Dispute:

COMPLETED / CONFIRMED / CLOSED
↓
DISPUTED

Transitions must be controlled by backend business rules.


## 15. Job Source

A job must identify its source.

Possible values:

MARKETPLACE
INTERNAL

MARKETPLACE:

Created from a customer request for a marketplace provider/business.

INTERNAL:

Created by a service business for an existing customer.


## 16. Job Assignment

Assignments should be represented separately from the core job.

This allows:

- Professional assignment
- Business assignment
- Technician assignment
- Reassignment
- Assignment history

Assignment history should not be silently overwritten.


## 17. Job Timeline

Important job events should be recorded.

Examples:

- Created
- Quote submitted
- Quote accepted
- Scheduled
- Assigned
- Started
- Before photos
- Progress update
- Parts requested
- Parts approved
- Parts rejected
- Completed
- Confirmed
- Closed
- Cancelled
- Disputed

Use a status/event history mechanism rather than overwriting historical data.


## 18. Before/During/After

Job media is associated with a phase:

BEFORE
DURING
AFTER

Each media item should identify:

- Job
- Uploader
- Phase
- File
- Timestamp


## 19. Quote Architecture

Quotes belong to jobs.

A quote may contain:

- Provider/business
- Job
- Amount
- Currency
- Description
- Quote items
- Status
- Created date
- Updated date

Currency:

ZAR


## 20. Payment Architecture

MVP does not process payments.

The architecture may record:

- Agreed quote amount
- Currency
- Payment status where required for future compatibility

Actual payment processing is out of MVP.

Do not add payment gateway dependencies unless approved.


## 21. Messaging Architecture

Messaging consists of:

Conversation
Conversation participants
Messages
Message attachments

Conversations must have access rules.

A user must not access a conversation unless they are an authorized
participant or have an explicit administrative permission.


## 22. Notification Architecture

Notifications are generated from important events.

Examples:

- New job request
- New quote
- Quote accepted
- Job assigned
- Job update
- Parts request
- Parts decision
- Job completed
- Customer confirmation
- Review request

Notification delivery can initially use in-app notifications.

Additional channels may be added later.


## 23. Verification Architecture

Verification is separated into:

Identity verification
Certificate verification
Business verification

Verification records must contain:

- Subject
- Type
- Status
- Submitted information
- Reviewer
- Review date
- Reason/request for additional information where applicable

Private verification files must never be public.


## 24. Portfolio Architecture

Portfolio belongs to the professional/business public profile.

A portfolio project may contain:

- Title
- Description
- Service
- Images
- Before images
- After images
- Publication status

Completed jobs may optionally be converted into portfolio work.


## 25. Review Architecture

Reviews belong to completed eligible jobs.

A review contains:

- Job
- Customer
- Provider/business
- Rating
- Comment
- Created date

Provider/business responses may be supported.


## 26. Admin Architecture

Admin endpoints must be separated logically from normal user endpoints.

Use:

/api/v1/admin/

Admin actions should be audited where appropriate.


## 27. Shared Code

Shared application contracts live under:

shared/

Potential areas:

shared/types/
shared/constants/
shared/validation/

Shared code should not contain database implementation details.


## 28. Error Architecture

API errors must use consistent structured responses.

Example:

{
  "success": false,
  "error": {
    "code": "JOB_NOT_FOUND",
    "message": "Job could not be found."
  }
}

Do not expose internal implementation details.


## 29. Validation

Validation occurs at multiple levels.

Frontend:

- User experience
- Immediate feedback

Backend:

- Security
- Business rules
- Data integrity

Database:

- Constraints
- Foreign keys
- Uniqueness
- Required fields


## 30. Security Architecture

Security must include:

- Secure password hashing
- Authentication
- Authorization
- Input validation
- File validation
- Rate limiting
- CORS configuration
- Secure headers
- SQL injection protection
- XSS protection
- Secure error handling
- Private file access
- Audit logs


## 31. Docker

Docker is used for local infrastructure.

Initial service:

MySQL

Additional containers may be introduced where justified.

Docker configuration must remain documented.


## 32. Environments

The project should support:

development
testing
production

Environment-specific configuration must not be hard-coded.

Secrets must be supplied through environment configuration.


## 33. Development Environment

Expected local architecture:

Angular
localhost:4200

Node API
localhost:3000

MySQL
host port configured through Docker Compose


## 34. Deployment

Production deployment architecture should be documented separately in:

docs/DEPLOYMENT.md

Do not assume development configuration is suitable for production.


## 35. Scalability Principles

The MVP should remain simple.

Do not introduce:

- Microservices
- Elasticsearch
- Kubernetes
- Event streaming infrastructure
- Complex caching systems

unless a demonstrated requirement justifies them.

Start with a modular monolith.

The architecture should allow future extraction of modules if scale requires
it.


## 36. Modular Monolith

The backend should initially be a modular monolith.

Example:

backend/
  modules/
    auth/
    users/
    jobs/
    quotes/
    providers/
    businesses/

Modules should have clear boundaries.

Avoid unnecessary coupling between modules.


## 37. API Documentation

API behaviour must be documented in:

docs/API.md

Any significant API change must update the API documentation.


## 38. Database Documentation

Database structure must be documented in:

docs/DATABASE.md

Every structural database change requires a migration and documentation.


## 39. Architecture Change Rule

Major architecture changes require:

1. Explanation
2. Documentation update
3. Impact assessment
4. Implementation
5. Testing

Do not silently change the architecture.


## 40. Architecture Principle

Build the simplest architecture that satisfies the approved FixLink MVP.

Do not build infrastructure for hypothetical requirements.

Keep the system:

- Modular
- Secure
- Testable
- Maintainable
- Observable
- Documented
- Ready for future expansion
