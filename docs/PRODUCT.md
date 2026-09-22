# FixLink — Product Definition

## 1. Product Overview

FixLink is a South African home-services marketplace and job-management
platform.

Slogan:

**Connect. Quote. Fix.**

FixLink connects customers who need work done at their homes or properties
with individual service professionals and service businesses.

FixLink also gives service businesses a workspace to manage their existing
customers, jobs, technicians, work updates, parts requests and job history.

The product therefore has two connected sides:

1. Marketplace
2. Job Management


## 2. Core Product Idea

FixLink is designed around the following journey:

Find
↓
Trust
↓
Request
↓
Quote
↓
Hire
↓
Work
↓
Document
↓
Complete
↓
Review

For service businesses:

Create
↓
Assign
↓
Work
↓
Update
↓
Approve
↓
Complete
↓
Close


## 3. Target Customers

FixLink customers may include:

- Homeowners
- Tenants
- Landlords
- Property owners
- Property managers

A customer may use FixLink when they need a home or property service,
including planned maintenance, repairs, installations or improvements.


## 4. Service Professionals

FixLink supports individual service professionals such as:

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

The final service/category list is managed through the platform's service
configuration.


## 5. Service Businesses

A service business is a company that provides home services and may have
multiple employees or technicians.

A business can use FixLink in two ways:

### Marketplace

The business can be discovered by customers and receive marketplace job
requests.

### Internal Job Management

The business can manage customers it already has outside the marketplace.

For example:

Existing customer
↓
Business creates job
↓
Manager assigns technician
↓
Technician performs work
↓
Technician adds updates/photos
↓
Manager monitors progress
↓
Job completed
↓
Job closed


## 6. Technicians

Technicians are employees or team members of service businesses.

A technician is not automatically a marketplace professional.

A technician primarily works on jobs assigned by their business.

Technicians can:

- View assigned jobs
- View relevant job information
- Start jobs
- Add notes
- Add voice notes
- Capture Before/During/After photos
- Request parts
- Update job status
- Complete assigned work


## 7. Marketplace

The FixLink marketplace allows customers to discover service providers.

The marketplace experience should allow customers to:

1. Select a service.
2. Search available providers.
3. Review provider profiles.
4. Compare relevant information.
5. Review portfolio work.
6. View verification badges.
7. Review certificates where applicable.
8. Read customer reviews.
9. Request a job.
10. Receive a quote.
11. Accept a quote.
12. Complete the job.
13. Review the provider.


## 8. Provider Profiles

A public professional or business profile may include:

- Profile photo or business logo
- Name
- Business name where applicable
- Rating
- Review count
- Verification badges
- Services
- Service area
- Experience
- Portfolio
- Before/After work
- Certificates or approved qualifications
- Customer reviews
- Availability where supported
- Pricing information where supported

Private verification information must never be displayed publicly.


## 9. Trust and Verification

Trust is an important part of the FixLink marketplace.

FixLink uses progressive verification rather than requiring heavy
verification at basic registration.

Potential verification areas include:

- Email verification
- Phone verification
- Identity verification
- Certificate verification
- Business verification

Identity verification and qualification verification are separate.

Verification badges are only displayed when the corresponding verification
has been approved by the platform.


## 10. Job Management

FixLink uses one job architecture for both marketplace and internal jobs.

A job may originate from:

MARKETPLACE

or:

INTERNAL

Both job types use the same core concepts:

- Customer
- Provider/business
- Service
- Description
- Location
- Schedule
- Quote
- Assignment
- Status
- Photos
- Notes
- Voice notes
- Parts requests
- Timeline
- Completion
- Confirmation
- Review where applicable


## 11. Before / During / After

Before/During/After work documentation is a core FixLink capability.

### Before

The professional or technician can capture:

- Photos
- Initial condition
- Notes

### During

The professional or technician can capture:

- Progress photos
- Notes
- Voice notes where supported
- Parts requirements
- Work updates

### After

The professional or technician can capture:

- Final photos
- Completion notes
- Final work status

Completed work may optionally be added to a professional's public portfolio.


## 12. Job Timeline

A job should maintain a history of important events.

Example:

Job created
↓
Quote submitted
↓
Quote accepted
↓
Job scheduled
↓
Technician assigned
↓
Technician started
↓
Before photos
↓
Progress update
↓
Parts requested
↓
Parts approved
↓
Work completed
↓
After photos
↓
Customer confirmed
↓
Review
↓
Job closed


## 13. Quotes

Quotes allow a professional or business to provide the customer with an
agreed price for the requested work.

A quote may contain:

- Quote amount
- Quote items
- Description
- Notes
- Validity information where supported
- Proposed schedule
- Terms where appropriate

The customer can:

- View quote
- Accept quote
- Decline quote

Quote status must be controlled by the backend.


## 14. MVP Payment Model

FixLink does not process customer payments in the MVP.

The MVP flow is:

Customer requests work
↓
Professional/business submits quote
↓
Customer accepts
↓
Work is performed
↓
Customer pays professional directly
↓
Job is completed
↓
Customer confirms
↓
Review

FixLink records the agreed quote amount but does not process the transaction.


## 15. Business Job Management

Businesses can create jobs for existing customers.

An internal job may include:

- Customer
- Customer contact details
- Property address
- Service
- Description
- Priority
- Scheduled date
- Photos
- Notes
- Assigned technician

The business can then:

- Assign a technician
- Reassign a technician
- Monitor progress
- Review updates
- Review photos
- Manage parts requests
- Approve requests
- Review completion
- Close the job


## 16. Parts Requests

Technicians may request parts when required to complete a job.

A parts request may include:

- Part name
- Quantity
- Reason
- Photo
- Notes

Business managers may:

- Approve
- Reject
- Request more information

The parts request becomes part of the job history.


## 17. Messaging

FixLink supports communication around jobs.

Messaging may be used between:

- Customer and professional
- Customer and business
- Business and technician
- Business team members where appropriate

Messages may support attachments where permitted.

Access to conversations must follow job and business permissions.


## 18. Reviews

Customers may review completed marketplace work.

Reviews may contain:

- Rating
- Written review
- Job reference
- Date

Professionals/businesses may respond where supported.

Reviews should be associated with the relevant job.


## 19. Notifications

FixLink may notify users about important events.

Examples:

Customer:

- New quote
- Quote accepted
- Job scheduled
- Job update
- Job completed
- Review reminder

Professional:

- New job request
- Quote accepted
- Job reminder
- Customer update
- Job confirmation

Business:

- New marketplace request
- Technician update
- Parts request
- Approval request
- Job completion

Technician:

- Job assignment
- Job reassignment
- Parts decision
- Job update


## 20. Business Data Isolation

Businesses must operate within isolated data boundaries.

Example:

ABC Plumbing

- Customers
- Jobs
- Technicians
- Parts requests
- Reports

must not be accessible to:

XYZ Electrical

unless an explicitly supported relationship exists.


## 21. Customer Experience Principles

The customer experience should be:

- Simple
- Trustworthy
- Clear
- Fast
- Mobile-friendly

Customers should quickly understand:

- Who the provider is
- What they offer
- Where they operate
- Whether they are verified
- What other customers say
- What work they have completed
- What the job will cost
- What happens next


## 22. Professional Experience Principles

Professionals should be able to:

- Create a credible profile
- Receive relevant work
- Quote quickly
- Manage jobs
- Document work
- Build a portfolio
- Build trust
- Maintain job history

The workflow should not require unnecessary administrative steps.


## 23. Business Experience Principles

Businesses should be able to:

- Manage existing customers
- Manage marketplace opportunities
- Assign technicians
- See job progress
- Capture work evidence
- Manage parts
- Maintain job history
- Improve operational visibility


## 24. Mobile-First Operational Areas

Technicians may use FixLink while physically working at a property.

Technician workflows should therefore prioritize:

- Large touch targets
- Clear actions
- Minimal navigation
- Fast photo capture
- Fast notes
- Clear status changes
- Easy parts requests


## 25. Public vs Private Information

Public information may include:

- Provider name
- Business name
- Profile image/logo
- Services
- General service area
- Experience
- Portfolio
- Approved certificates
- Verification badges
- Reviews

Private information includes:

- Identity documents
- Verification documents
- Internal notes
- Private customer information
- Technician private information
- Admin notes
- Audit logs


## 26. Future Direction

The architecture should allow FixLink to expand later into:

- Platform payment processing
- Subscription plans
- Lead credits
- Advanced reporting
- Additional business tools
- Additional mobile capabilities
- Additional communication channels
- Advanced automation

These are not part of the current MVP unless explicitly added to scope.


## 27. Product Success

The MVP should demonstrate that FixLink can successfully support the
complete operational loop:

Customer needs a service
↓
Customer discovers provider
↓
Customer requests work
↓
Provider quotes
↓
Customer accepts
↓
Provider/business performs work
↓
Work is documented
↓
Job is completed
↓
Customer confirms
↓
Customer reviews

And for businesses:

Existing customer
↓
Business creates job
↓
Technician assigned
↓
Technician works
↓
Updates/photos/parts
↓
Manager visibility
↓
Work completed
↓
Job closed


## 28. Product Principle

FixLink should make it easier for people to:

Find the right service.

Trust the person doing the work.

Understand what will happen.

Keep everyone informed.

Document the work.

Complete the job.

Build a track record.

Connect. Quote. Fix.
