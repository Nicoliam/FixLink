# FixLink — MVP Scope

## 1. Purpose

This document defines what is included in the FixLink MVP.

The purpose of this document is to prevent feature creep and give
development agents a clear boundary.

A feature not defined here should not be treated as part of the MVP unless
the scope is explicitly updated.


## 2. MVP Users

The MVP supports:

- Customer
- Professional
- Business Owner
- Business Manager
- Technician
- Admin


## 3. Customer MVP

### Account

- Registration
- Login
- Logout
- Email verification
- Phone verification where supported
- Forgot password
- Reset password
- Profile management

### Marketplace

- Browse services
- Search providers
- Filter providers
- View professional profile
- View business profile
- View services
- View service area
- View portfolio
- View Before/After work
- View verification badges
- View approved certificates
- View reviews
- Save providers

### Job Requests

Customer can:

- Create job request
- Select service
- Add description
- Add location
- Add preferred date/time
- Upload photos
- Submit request
- View request status

### Quotes

Customer can:

- View received quotes
- View quote details
- Accept quote
- Decline quote

### Jobs

Customer can:

- View jobs
- View job details
- View job status
- View job timeline
- View job updates
- View job photos
- View Before/During/After
- View agreed quote
- Confirm completed work

### Messaging

Customer can:

- View conversations
- Send messages
- Receive messages
- View permitted attachments

### Reviews

Customer can:

- Leave review after eligible job
- Provide rating
- Provide written feedback
- View submitted review


## 4. Professional MVP

### Account

- Registration
- Login
- Logout
- Email verification
- Phone verification where supported
- Password reset
- Profile management

### Professional Profile

- Profile photo
- Name
- Description
- Experience
- Service area
- Services
- Availability where supported
- Public profile

### Portfolio

- Create portfolio project
- Add description
- Upload images
- Add Before/After images
- Publish eligible work
- Edit portfolio
- Remove portfolio project

### Certificates

- Add certificate
- Upload certificate document
- Submit for verification
- View verification status

### Identity Verification

- Submit identity verification
- Upload required verification material
- View verification status
- Respond to requests for more information

Verification documents remain private.


### Marketplace Requests

Professional can:

- View job requests
- Open request
- Review customer-provided information
- Submit quote
- Withdraw quote where allowed

### Jobs

Professional can:

- View jobs
- View job details
- View customer information required for the job
- Update job status
- Add notes
- Add photos
- Add Before/During/After media
- Add voice notes where supported
- Complete job

### Reviews

Professional can:

- View reviews
- Respond to reviews where supported


## 5. Business MVP

### Business Profile

- Business registration
- Business name
- Business description
- Logo
- Contact details
- Service areas
- Services
- Public profile

### Customers

Business can:

- Create customer
- View customer
- Edit customer
- View customer job history
- Search customers

### Jobs

Business can:

- Create internal job
- Receive marketplace requests
- View jobs
- Filter jobs
- View job details
- Assign technician
- Reassign technician
- Schedule job
- Update status
- View job timeline
- View job photos
- View notes
- Close jobs

### Technicians

Business can:

- View team
- Invite technician
- Activate technician
- Deactivate technician
- View technician
- View technician job information
- Assign jobs
- Reassign jobs

### Quotes

Business can:

- Create quote
- Add quote items
- Submit quote
- View quote
- Withdraw quote where allowed

### Parts

Business can:

- View parts requests
- Approve parts requests
- Reject parts requests
- Request more information

### Approvals

Business managers can:

- View approval requests
- Approve
- Reject
- Request more information

### Reports

MVP reports should provide basic operational visibility.

Examples:

- Job counts
- Job status counts
- Completed jobs
- Open jobs
- Technician job counts


## 6. Technician MVP

### Account

- Login
- Logout
- Password reset
- Profile

### My Jobs

Technician can:

- View assigned jobs
- View job details
- View customer information required for work
- Start job
- Update job
- Add notes
- Add photos
- Add Before/During/After photos
- Add voice note where supported
- Request parts
- Mark work completed

### Parts

Technician can:

- Create parts request
- Add part
- Add quantity
- Add reason
- Add photo
- View request status

Technician cannot:

- View all business jobs
- View unrelated business customers
- Access business administration
- Change business settings


## 7. Admin MVP

Admin can:

### Users

- View users
- Search users
- View user details
- Manage account status where approved

### Professionals

- View professionals
- View professional details
- Review professional verification

### Businesses

- View businesses
- View business details
- Review business verification where applicable

### Technicians

- View technicians
- View business association
- Manage account status where appropriate

### Services

- Create service
- Edit service
- Activate/deactivate service
- Manage categories

### Verification

- View verification requests
- Approve
- Reject
- Request more information

### Certificates

- Review certificate submissions
- Approve
- Reject
- Request more information

### Jobs

- View jobs
- Search jobs
- View job details
- Intervene where platform administration requires it

### Reviews

- View reviews
- Manage reports related to reviews

### Disputes

- View disputes
- Manage dispute workflow

### Audit Logs

- View important platform actions


## 8. Job MVP

Every job supports:

- Customer
- Provider/business
- Service
- Description
- Location
- Source
- Status
- Quote
- Schedule
- Assignment
- Photos
- Updates
- Voice notes where supported
- Parts requests where applicable
- Timeline
- Completion
- Customer confirmation where applicable
- Review where applicable

Job source:

MARKETPLACE

or:

INTERNAL


## 9. Job Statuses

MVP statuses:

REQUESTED
QUOTED
ACCEPTED
SCHEDULED
IN_PROGRESS
AWAITING_PARTS
COMPLETED
CONFIRMED
CLOSED
CANCELLED
DISPUTED


## 10. Before / During / After

All professional tiers support:

BEFORE
- Photos
- Notes

DURING
- Progress photos
- Notes

AFTER
- Final photos
- Completion note

Voice notes are supported for applicable professional/business workflows.


## 11. MVP Messaging

Messaging supports:

- Conversations
- Participants
- Messages
- Attachments where permitted
- Read state
- Notifications

Messaging must respect permissions.


## 12. MVP Notifications

Notifications should support important events including:

- New job request
- New quote
- Quote accepted
- Job assignment
- Job update
- Parts request
- Parts decision
- Job completion
- Customer confirmation
- Review request


## 13. MVP Verification

Customer:

- Email/phone verification as supported

Professional:

- Identity verification
- Certificate verification

Business:

- Business verification where required

Verification documents remain private.


## 14. MVP Payment Scope

Payment processing is OUT OF MVP.

The platform does not:

- Process customer payments
- Hold customer funds
- Operate escrow
- Process card payments
- Process EFT payments
- Calculate payment settlement

The platform may record the agreed quote amount.


## 15. MVP File Storage

Supported files include:

- Profile images
- Portfolio images
- Job photos
- Certificates
- Verification documents
- Voice notes
- Message attachments
- Parts request photos

Files must be stored outside the MySQL database.


## 16. MVP Security

MVP security includes:

- Secure authentication
- Password hashing
- Authorization
- Role-based access
- Business data isolation
- Input validation
- File validation
- Rate limiting where appropriate
- Secure error handling
- Protected verification documents
- Audit logging for important administrative actions


## 17. MVP Responsive Requirements

The web application must support:

- Desktop
- Tablet
- Mobile

Technician workflows must be especially mobile-friendly.


## 18. MVP Testing

Major workflows must have automated and/or structured tests.

Required areas include:

- Authentication
- Permissions
- Customer job creation
- Provider quote
- Quote acceptance
- Business job creation
- Technician assignment
- Technician updates
- Parts requests
- Parts approval
- Before/During/After
- Job completion
- Customer confirmation
- Reviews
- Admin permissions


## 19. Out of Scope

The following are outside the current MVP:

- Native iOS application
- Native Android application
- Payment gateway
- Escrow
- Live GPS
- Route optimization
- AI provider matching
- AI voice transcription
- WhatsApp integration
- SMS infrastructure
- Automated identity verification provider
- Advanced accounting
- Payroll
- Inventory management
- Full CRM
- Multi-branch enterprise management
- Advanced enterprise features
- Subscription billing
- Advanced financial reporting


## 20. Future Architecture Considerations

The architecture should not prevent future:

- Subscription plans
- Usage limits
- Lead credits
- Platform commissions
- Payment processing
- Advanced reporting
- Additional mobile applications
- Additional communication channels


## 21. Scope Change Rule

If a new feature is requested:

1. Define the feature.
2. Determine whether it belongs in MVP.
3. Identify affected modules.
4. Update this document.
5. Update related architecture documentation.
6. Update tests.
7. Only then implement.

No major feature should be added silently.
