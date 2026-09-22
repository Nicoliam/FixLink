# FixLink — Master AI Agent Instructions

## 1. PROJECT IDENTITY

Project name: FixLink

Slogan:

Connect. Quote. Fix.

FixLink is a South African home-services marketplace and job-management
platform.

FixLink connects customers with individual service professionals and
service businesses while also providing businesses with tools to manage
their existing customers, jobs, technicians, work updates and job history.

The core product has two connected purposes:

1. Marketplace
   Customers can discover service professionals, request work, receive
   quotes, hire providers, track jobs, communicate and review completed work.

2. Job Management
   Service businesses can manage their own customers, create internal jobs,
   assign technicians, track work, capture photos and notes, request parts,
   manage approvals and maintain job history.


## 2. CORE PRODUCT PRINCIPLES

FixLink is built around:

Find → Trust → Hire → Work → Document → Complete → Review

For businesses:

Create → Assign → Work → Update → Approve → Complete → Close


## 3. TARGET USERS

FixLink supports the following primary roles:

### CUSTOMER

Customers include:

- Homeowners
- Tenants
- Landlords
- Property owners
- Property managers

Customers can:

- Register
- Search for services
- Discover professionals
- View professional profiles
- View portfolios
- View certificates and verification badges
- Request jobs
- Receive quotes
- Accept or decline quotes
- Communicate with providers
- Track jobs
- View job photos and updates
- Confirm completed work
- Leave reviews
- Save providers


### PROFESSIONAL

A Professional is an independent service provider.

Examples include:

- Plumbers
- Electricians
- Painters
- Builders
- Handymen
- Appliance technicians
- Air-conditioning technicians
- Gardeners
- Cleaners
- Other approved home-service providers

Professionals can:

- Create a profile
- Select services
- Define service areas
- Receive marketplace job requests
- Submit quotes
- Manage jobs
- Capture Before/During/After work
- Add notes
- Upload portfolio work
- Add certificates
- Complete verification
- Communicate with customers
- Receive reviews


### BUSINESS OWNER

A Business Owner represents a service company.

A business can:

- Create a business profile
- Manage customers
- Create internal jobs
- Receive marketplace jobs
- Manage technicians
- Assign jobs
- Reassign jobs
- Manage quotes
- Manage parts requests
- Approve work-related requests
- Monitor job progress
- Review completed jobs
- View reports
- Manage business settings


### BUSINESS MANAGER

A Business Manager operates within a service business.

A Business Manager can:

- View business jobs
- Manage customers
- Assign technicians
- Monitor job progress
- Review technician updates
- Manage parts requests
- Approve or reject requests
- View job history
- View reports

Access must be restricted to the business they belong to.


### TECHNICIAN

A Technician is an employee or team member of a service business.

Technicians are NOT automatically marketplace professionals.

Technicians can:

- View assigned jobs
- View required customer/job information
- Start jobs
- Add job updates
- Add notes
- Add voice notes
- Capture Before/During/After photos
- Request parts
- Complete assigned work
- View completed jobs

Technicians must only access jobs assigned to them or explicitly made
available to them by authorized business users.


### ADMIN

Admin is a platform-level role.

Admins can:

- Manage users
- Manage customers
- Manage professionals
- Manage businesses
- Manage technicians
- Manage services
- Manage jobs
- Review verification requests
- Review certificates
- Manage reviews
- Manage disputes
- View reports
- View audit logs
- Configure platform settings

Admin access must be explicitly authorized by the backend.


## 4. TECHNOLOGY STACK

The current planned stack is:

Frontend:
- Angular
- TypeScript
- SCSS

Backend:
- Node.js
- TypeScript
- REST API

Database:
- MySQL 8

Infrastructure:
- Docker
- Docker Compose

Repository:
- Git
- GitHub

Currency:
- South African Rand (ZAR)

API versioning:

/api/v1


## 5. HIGH-LEVEL ARCHITECTURE

The frontend must NEVER communicate directly with MySQL.

Correct architecture:

Angular Web Application
        |
        | HTTPS / REST API
        v
Node.js Backend
        |
        | Database connection
        v
MySQL

File architecture:

User
  |
  v
Node.js Backend
  |
  v
File/Object Storage
  |
  +--> Database stores metadata/reference only


## 6. PROJECT STRUCTURE

The project uses the following major areas:

apps/
    web/
    mobile/

backend/

database/
    migrations/
    seeders/
    schema/

shared/
    types/
    constants/
    validation/

design/
    stitch/

docs/

tests/
    unit/
    integration/
    api/
    e2e/
    security/


## 7. STITCH DESIGN IS THE VISUAL SOURCE OF TRUTH

The approved Stitch design is the primary visual reference for FixLink.

Location:

design/stitch/

Agents must:

- Inspect the approved Stitch design before implementing UI
- Preserve approved layouts
- Preserve the visual hierarchy
- Preserve major component structure
- Reuse design patterns
- Build reusable production components from approved designs
- Keep responsive behaviour consistent with the approved design

Agents must NOT redesign approved screens simply because they prefer
another layout.

If a design limitation requires a change:

1. Document the issue.
2. Explain the proposed change.
3. Update the relevant design documentation.
4. Implement only after the change is understood and approved.

Do not turn FixLink into a generic admin dashboard or generic Bootstrap
template if the Stitch design specifies a different visual direction.


## 8. PRODUCT DESIGN PRINCIPLES

FixLink should feel:

- Modern
- Trustworthy
- Professional
- Approachable
- Local
- Clean
- Practical
- Mobile-friendly

Use:

- Clear typography
- Strong visual hierarchy
- Rounded cards where appropriate
- Subtle borders
- Subtle shadows
- Generous spacing
- Clear status indicators
- Touch-friendly controls
- Realistic service imagery
- Clear calls to action

Avoid:

- Excessive gradients
- Excessive animation
- Cluttered dashboards
- Unnecessary decorative elements
- Generic template appearance
- Unapproved redesigns


## 9. ONE JOB ENGINE

Marketplace jobs and internal business jobs must use the same core job architecture.

DO NOT create separate:

marketplace_jobs

and:

business_jobs

tables.

Use one:

jobs

table.

Jobs must have a source/type that distinguishes:

MARKETPLACE

INTERNAL

This allows the same job engine to support:

- Marketplace requests
- Existing business customers
- Technician assignments
- Job updates
- Photos
- Notes
- Parts requests
- Approvals
- Completion
- Reviews
- Job history


## 10. JOB LIFECYCLE

The standard job lifecycle is:

REQUESTED
QUOTED
ACCEPTED
SCHEDULED
IN_PROGRESS
AWAITING_PARTS
COMPLETED
CONFIRMED
CLOSED

Additional states:

CANCELLED
DISPUTED

Status transitions must be validated by the backend.

The frontend must never be trusted to arbitrarily change a job status.


## 11. BEFORE / DURING / AFTER

Before/During/After documentation is a core FixLink feature.

All professional tiers support:

BEFORE
- Photos
- Note

DURING
- Progress photos
- Notes
- Optional voice notes depending on role/tier

AFTER
- Final photos
- Completion note

Completed work may optionally be added to a professional's public portfolio.

Job media must be associated with the correct job and phase.


## 12. PAYMENT — MVP

FixLink does NOT process customer payments in the MVP.

The MVP payment flow is:

Customer requests job
    ↓
Professional/business submits quote
    ↓
Customer accepts quote
    ↓
Job scheduled
    ↓
Professional performs work
    ↓
Customer pays professional directly
    ↓
Job completed
    ↓
Customer confirms
    ↓
Review

The platform may record the agreed quote amount.

The platform must clearly communicate that payment is arranged directly
with the professional.

Do not add a payment gateway, escrow or transaction processing unless
explicitly approved as a future feature.


## 13. VERIFICATION

Verification is progressive.

Customer registration must remain simple.

Professional verification may include:

- Identity verification
- Selfie/liveness verification where supported
- Certificate verification
- Business verification where applicable

Identity verification and qualification/certificate verification are
different concepts.

Verification documents are PRIVATE.

Never expose:

- ID documents
- Identity verification images
- Private verification documents
- Internal verification notes
- Admin-only information

Public profiles may display appropriate verification badges such as:

- Identity Verified
- Certificate Verified
- Business Verified
- Trusted Professional

A verification badge must never be displayed unless the backend confirms
the corresponding verification state.


## 14. PERMISSIONS AND AUTHORIZATION

Frontend permission checks are for user experience only.

They are NOT security.

Every protected action must be authorized by the backend.

Examples:

A customer can only access their own jobs.

A professional can only manage their own professional profile and jobs
they are authorized to access.

A business user can only access data belonging to their business.

A technician can only access jobs assigned or explicitly made available
to them.

An admin has platform-level permissions.

Business data must be isolated between companies.

Example:

ABC Plumbing must never access XYZ Electrical's private business data.


## 15. SECURITY RULES

Never:

- Store passwords in plaintext
- Commit secrets
- Commit .env files
- Log passwords
- Log authentication tokens
- Trust frontend authorization
- Expose private verification documents
- Expose internal business data
- Store unnecessary sensitive information
- Store uploaded binary files directly in MySQL

Always:

- Hash passwords securely
- Validate input
- Validate uploaded files
- Enforce authorization server-side
- Protect private files
- Use parameterized database queries/ORM protections
- Apply rate limiting where appropriate
- Use secure authentication practices
- Validate job status transitions
- Record important security-sensitive actions
- Keep secrets in environment configuration


## 16. DATABASE RULES

MySQL is the source of truth for structured application data.

Use migrations for schema changes.

DO NOT manually modify the production database schema.

Database changes must be:

1. Documented.
2. Implemented as a migration.
3. Tested.
4. Reviewed.
5. Applied through the migration process.

Use foreign keys and appropriate indexes.

Use timestamps consistently.

Use soft deletion where appropriate.

Do not duplicate data unnecessarily.

Do not create duplicate tables for the same business concept without
documenting the architectural reason.


## 17. FILE STORAGE RULES

Files include:

- Profile photos
- Portfolio images
- Before photos
- During photos
- After photos
- Certificates
- Verification documents
- Voice notes
- Message attachments
- Parts request photos

Files should be stored outside MySQL.

The database stores:

- File identifier
- Storage reference
- File type
- File size
- Metadata
- Ownership
- Associated entity
- Created timestamp

Private files must use protected access.


## 18. API ARCHITECTURE

Use:

/api/v1/

Standard response:

{
  "success": true,
  "data": {},
  "message": "Success"
}

Standard error:

{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}

Expected HTTP statuses include:

200
201
204
400
401
403
404
409
422
429
500

Backend request flow:

ROUTE
  ↓
CONTROLLER
  ↓
VALIDATION
  ↓
AUTHORIZATION
  ↓
SERVICE
  ↓
DATABASE

Controllers should remain thin.

Business logic belongs in services/domain modules.


## 19. API RULES

Never:

- Trust client-provided ownership
- Trust client-provided permissions
- Trust client-provided role
- Trust client-provided price
- Trust client-provided status transitions
- Return private data unnecessarily

The backend must determine:

- Current authenticated user
- User role
- Resource ownership
- Business ownership
- Allowed actions
- Valid state transitions


## 20. CORE BACKEND MODULES

The backend is expected to use modular architecture.

Core modules include:

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

Do not create modules without a clear business reason.


## 21. SHARED CODE

Shared application contracts should live in:

shared/

Examples:

shared/types/
shared/constants/
shared/validation/

Shared types should represent stable contracts used across application
boundaries.

Do not place backend-specific database implementation inside shared code.


## 22. TESTING REQUIREMENTS

Every major feature must have tests.

Testing layers may include:

- Unit tests
- Integration tests
- API tests
- End-to-end tests
- Security/permission tests

Important workflows must be tested end-to-end.

Examples:

Customer registration

Customer creates job

Professional receives request

Professional submits quote

Customer accepts quote

Business creates internal job

Business assigns technician

Technician updates job

Technician requests parts

Manager approves parts request

Professional completes job

Customer confirms job

Customer leaves review


## 23. UI STATE REQUIREMENTS

Every major screen should consider:

LOADING

EMPTY

SUCCESS

ERROR

PARTIAL DATA

UNAUTHORIZED

NOT FOUND

Do not build only the successful state.


## 24. RESPONSIVE DESIGN

FixLink must work on:

- Desktop
- Tablet
- Mobile

Do not build desktop-only interfaces.

Important customer and technician workflows must be touch-friendly.


## 25. DOCUMENTATION RULE

Documentation is part of development.

If a major architectural decision changes:

1. Update the relevant documentation.
2. Then implement the change.

Do not allow code and documentation to intentionally drift apart.

Important documents include:

docs/PRODUCT.md
docs/MVP-SCOPE.md
docs/ARCHITECTURE.md
docs/DATABASE.md
docs/API.md
docs/USER-FLOWS.md
docs/PERMISSIONS.md
docs/DESIGN-SYSTEM.md
docs/SECURITY.md
docs/FILE-STORAGE.md
docs/NOTIFICATIONS.md
docs/TEST-PLAN.md
docs/DEPLOYMENT.md
docs/ENVIRONMENT.md
docs/DEVELOPMENT-WORKFLOW.md
docs/DEFINITION-OF-DONE.md


## 26. FEATURE DEVELOPMENT PROCESS

Do not immediately code a large feature.

Follow:

UNDERSTAND
    ↓
CHECK DOCUMENTATION
    ↓
PLAN
    ↓
UPDATE DOCUMENTATION IF REQUIRED
    ↓
IMPLEMENT
    ↓
TEST
    ↓
REVIEW
    ↓
UPDATE DOCUMENTATION
    ↓
COMPLETE

If requirements are ambiguous, inspect the existing documentation and
approved design before making assumptions.


## 27. MVP BOUNDARY

Do not add major functionality outside the approved MVP.

Current known future/out-of-scope areas include:

- Payment gateway
- Escrow
- Live GPS tracking
- Route optimization
- AI matching
- AI voice transcription
- WhatsApp integration
- SMS infrastructure
- Automated identity verification provider
- Advanced accounting
- Payroll
- Inventory management
- Full CRM
- Multi-branch enterprise management
- Advanced enterprise functionality
- Subscription billing

The architecture may allow future expansion, but future functionality
must not be silently implemented as part of the MVP.


## 28. PRICING AND BUSINESS MODEL

Do not hard-code a business pricing model unless explicitly approved.

The MVP should support recording agreed job quote amounts.

Future architecture may support:

- Plans
- Subscriptions
- Subscription features
- Usage limits
- Lead credits
- Platform fees
- Payment processing

These are future considerations unless explicitly added to the MVP scope.


## 29. SEED DATA

Development seed data must be fictional.

Do not use real people's:

- Identity documents
- Phone numbers
- Email addresses
- Addresses
- Bank information
- Private customer information

Use realistic fictional South African examples when seed data is required.


## 30. GIT RULES

Use clear commit messages.

Examples:

feat: add customer registration
feat: add job request workflow
fix: prevent unauthorized job access
docs: update job lifecycle
test: add quote acceptance tests
refactor: simplify job service

Do not commit:

- .env
- secrets
- passwords
- API keys
- private verification documents
- unnecessary generated files
- local database data


## 31. DO NOT BREAK EXISTING FUNCTIONALITY

Before modifying existing functionality:

1. Understand the current implementation.
2. Check related tests.
3. Check related documentation.
4. Make the smallest appropriate change.
5. Run relevant tests.

Do not rewrite large parts of the application simply to implement a small
feature.


## 32. NO UNDOCUMENTED ARCHITECTURAL CHANGES

An AI agent must not independently introduce:

- A new framework
- A new database
- A new authentication architecture
- A new payment architecture
- A new storage system
- A new major dependency
- A new application architecture

without first documenting the reason and updating the relevant architecture
documentation.


## 33. DEPENDENCY RULES

Do not install packages simply because they are convenient.

Before introducing a significant dependency:

1. Confirm it solves a real requirement.
2. Check whether the existing stack already provides the capability.
3. Consider maintenance and security.
4. Document significant architectural dependencies.


## 34. ERROR HANDLING

Errors must be:

- Predictable
- Structured
- Useful to developers
- Safe for users

Do not expose:

- Stack traces
- SQL queries
- Secrets
- Internal file paths
- Authentication details
- Sensitive infrastructure information

to end users.


## 35. LOGGING

Logs should help diagnose problems without exposing sensitive information.

Never log:

- Passwords
- Authentication tokens
- Private identity documents
- Sensitive verification information
- Payment credentials


## 36. ADMINISTRATIVE ACTIONS

Important administrative actions should be auditable.

Examples:

- User verification approval
- Verification rejection
- Certificate approval
- Certificate rejection
- User suspension
- Job intervention
- Dispute action
- Platform configuration changes

Use audit logs where appropriate.


## 37. JOB MANAGEMENT PRINCIPLES

A job should maintain a clear history.

Important events include:

- Job created
- Quote submitted
- Quote accepted
- Job assigned
- Job scheduled
- Job started
- Before photos
- Progress updates
- Voice notes
- Parts request
- Parts approval
- Work completed
- Customer confirmation
- Review
- Job closed

Job history should not be silently overwritten.


## 38. BUSINESS DATA ISOLATION

Every business-related query must consider business ownership.

For example:

Business A
  ├── Customers
  ├── Jobs
  ├── Technicians
  └── Parts Requests

must never overlap with:

Business B
  ├── Customers
  ├── Jobs
  ├── Technicians
  └── Parts Requests

unless an explicitly supported relationship exists.


## 39. FRONTEND RULES

Angular components should remain focused.

Prefer:

- Reusable components
- Services for API communication
- Typed models
- Route guards where appropriate
- Centralized API handling
- Consistent error handling
- Reusable UI components
- Responsive layouts

Do not put large amounts of business logic directly into templates.


## 40. MOBILE CONSIDERATIONS

The product must be designed with mobile use in mind.

Technicians may use FixLink while physically working at a customer's property.

Important technician actions should therefore be:

- Fast
- Clear
- Touch-friendly
- Low-friction

Do not require unnecessary navigation for common job actions.


## 41. PERFORMANCE

Avoid unnecessary:

- API calls
- Database queries
- Large payloads
- Image downloads
- Component re-renders
- Duplicate requests

Images should be appropriately optimized.

Pagination should be used for large datasets.


## 42. ACCESSIBILITY

Use semantic HTML where appropriate.

Interactive elements must be accessible.

Forms must have clear labels.

Do not rely solely on colour to communicate status.

Keyboard navigation should be supported where practical.


## 43. DEFINITION OF DONE

A feature is not complete simply because the page appears to work.

A major feature is considered complete when appropriate:

- UI is implemented
- Stitch design is respected
- Responsive behaviour works
- API is implemented
- Database changes are implemented
- Validation exists
- Authorization exists
- Error handling exists
- Loading state exists
- Empty state exists
- Tests exist
- Security considerations are addressed
- Documentation is updated


## 44. SOURCE OF TRUTH

When information conflicts, use this order:

1. Explicit approved product requirements
2. Approved Stitch design
3. docs/ documentation
4. AGENTS.md
5. Existing implementation
6. Agent assumptions

If implementation conflicts with approved requirements, do not assume the
implementation is correct.

Investigate and document the discrepancy.


## 45. AGENT BEHAVIOUR

AI agents working on FixLink must:

- Read relevant documentation before making significant changes.
- Inspect existing code before modifying it.
- Respect the approved Stitch design.
- Avoid unnecessary rewrites.
- Avoid feature creep.
- Keep security in mind.
- Write tests for major functionality.
- Update documentation when architecture or behaviour changes.
- Explain significant architectural decisions.
- Prefer simple maintainable solutions.
- Preserve backwards compatibility where practical.

AI agents must NOT:

- Invent requirements.
- Invent permissions.
- Invent payment flows.
- Invent business rules.
- Remove existing functionality without justification.
- Change the architecture silently.
- Add major dependencies without justification.
- expose private customer/provider information.


## 46. CURRENT DEVELOPMENT STAGE

FixLink is currently in the project foundation stage.

The repository has:

- Git repository
- GitHub repository
- Angular web application
- Initial backend package
- Documentation structure
- Database structure
- Docker Compose configuration
- Stitch design baseline

The immediate objective is to establish and verify the technical foundation
before implementing production features.

Do not skip directly to feature development without completing the
architecture and database planning.


## 47. FINAL PRINCIPLE

Build FixLink deliberately.

Prefer:

Clear architecture
over
quick hacks.

Prefer:

Documented decisions
over
assumptions.

Prefer:

Reusable components
over
duplicated code.

Prefer:

Secure backend enforcement
over
frontend-only restrictions.

Prefer:

Tested workflows
over
screens that merely look complete.

Prefer:

The approved FixLink product
over
generic generated application patterns.
