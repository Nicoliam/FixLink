# FixLink — User Flows

## 1. Purpose

This document defines the main FixLink user journeys.

The flows describe expected product behaviour and provide a reference for
frontend, backend, database and testing implementation.


# 2. CUSTOMER FLOWS


## 2.1 Customer Registration

Customer
↓
Register
↓
Enter name
↓
Enter phone
↓
Enter email
↓
Create password
↓
Submit registration
↓
Verify email/phone where required
↓
Account created
↓
Customer dashboard


## 2.2 Customer Login

Customer
↓
Login
↓
Enter email/phone
↓
Enter password
↓
Authentication
↓
Customer dashboard


## 2.3 Customer Searches for Service

Customer
↓
Marketplace
↓
Select service
↓
Enter search/location criteria
↓
View providers
↓
Apply filters
↓
Open provider profile


## 2.4 Customer Reviews Provider

Customer
↓
Provider profile
↓
View:
- Profile
- Services
- Service area
- Rating
- Reviews
- Portfolio
- Before/After
- Verification
- Certificates
↓
Decide whether to request service


## 2.5 Customer Creates Job Request

Customer
↓
Select provider
↓
Request service
↓
Select service
↓
Describe work
↓
Add location
↓
Select preferred date/time
↓
Upload photos if needed
↓
Submit request
↓
REQUESTED


## 2.6 Professional Receives Request

Professional
↓
New request
↓
Open request
↓
Review:
- Customer
- Service
- Description
- Photos
- Location
- Preferred schedule
↓
Prepare quote
↓
Submit quote
↓
Customer notified


## 2.7 Customer Receives Quote

Customer
↓
Notification
↓
Open job
↓
View quote
↓
Review price/items/details
↓
Accept or decline


## 2.8 Customer Accepts Quote

Customer
↓
Accept quote
↓
Backend validates quote
↓
Job becomes ACCEPTED
↓
Provider notified
↓
Schedule job
↓
Job becomes SCHEDULED


## 2.9 Customer Declines Quote

Customer
↓
Open quote
↓
Decline
↓
Optional reason
↓
Quote becomes declined
↓
Provider notified


# 3. PROFESSIONAL JOB FLOW


## 3.1 Professional Starts Job

Professional
↓
Jobs
↓
Open scheduled job
↓
Review job
↓
Start work
↓
IN_PROGRESS


## 3.2 Before Work

Professional
↓
Job
↓
BEFORE
↓
Capture photos
↓
Add initial notes
↓
Save


## 3.3 During Work

Professional
↓
Job
↓
DURING
↓
Capture progress photos
↓
Add notes
↓
Add voice note where supported
↓
Update job


## 3.4 Parts Required

Professional/business/technician
↓
Job
↓
Parts required
↓
Create parts request
↓
Add part
↓
Add quantity
↓
Add reason
↓
Add photo if required
↓
Submit


## 3.5 Work Completed

Professional
↓
Job
↓
AFTER
↓
Capture final photos
↓
Add completion note
↓
Mark work complete
↓
COMPLETED
↓
Customer notified


## 3.6 Customer Confirms Completion

Customer
↓
Job completed
↓
Review final work
↓
View final photos
↓
Confirm completion
↓
CONFIRMED
↓
Review prompt


## 3.7 Customer Reviews Professional

Customer
↓
Completed job
↓
Leave review
↓
Rating
↓
Written feedback
↓
Submit
↓
Review associated with provider/job


# 4. BUSINESS FLOWS


## 4.1 Business Registration

Business owner
↓
Register
↓
Create user account
↓
Create business profile
↓
Add business information
↓
Select services
↓
Define service areas
↓
Submit
↓
Business dashboard


## 4.2 Business Creates Existing Customer

Business
↓
Customers
↓
Add customer
↓
Enter customer information
↓
Save
↓
Customer available for internal jobs


## 4.3 Business Creates Internal Job

Business
↓
Jobs
↓
Create job
↓
Select existing customer
↓
Select service
↓
Add description
↓
Add address
↓
Set priority
↓
Set schedule
↓
Add photos/notes
↓
Create job
↓
INTERNAL job created


## 4.4 Business Assigns Technician

Business
↓
Open job
↓
Assign technician
↓
Select technician
↓
Confirm
↓
Job assignment created
↓
Technician notified


## 4.5 Business Reassigns Technician

Business
↓
Open job
↓
Reassign
↓
Select new technician
↓
Confirm
↓
Assignment updated
↓
New technician notified


# 5. TECHNICIAN FLOW


## 5.1 Technician Receives Job

Technician
↓
Notification
↓
My Jobs
↓
Open job
↓
View job details


## 5.2 Technician Starts Work

Technician
↓
My Jobs
↓
Open job
↓
Start
↓
IN_PROGRESS


## 5.3 Technician Documents Before Condition

Technician
↓
Job
↓
Before
↓
Take photos
↓
Add note
↓
Save


## 5.4 Technician Updates Job

Technician
↓
Job
↓
Add update
↓
Add note
↓
Optional photo
↓
Optional voice note
↓
Save
↓
Business receives update


## 5.5 Technician Requests Parts

Technician
↓
Job
↓
Parts
↓
Create request
↓
Part
↓
Quantity
↓
Reason
↓
Photo
↓
Submit
↓
AWAITING_PARTS where appropriate


## 5.6 Manager Approves Parts

Business Manager
↓
Parts Requests
↓
Open request
↓
Review details
↓
Approve
↓
Technician notified
↓
Work continues


## 5.7 Manager Rejects Parts

Business Manager
↓
Parts Requests
↓
Open request
↓
Reject
↓
Add reason
↓
Technician notified


## 5.8 Technician Completes Job

Technician
↓
Job
↓
After
↓
Final photos
↓
Completion note
↓
Mark complete
↓
COMPLETED
↓
Business notified


# 6. BUSINESS MARKETPLACE FLOW


## 6.1 Business Receives Marketplace Request

Business
↓
Marketplace request
↓
Review customer request
↓
Review service
↓
Review photos
↓
Review location
↓
Prepare quote
↓
Submit quote


## 6.2 Business Marketplace Job After Acceptance

Business
↓
Customer accepts quote
↓
Job becomes ACCEPTED
↓
Schedule
↓
Assign technician
↓
Technician notified
↓
Work begins
↓
Updates/photos
↓
Completion
↓
Customer confirmation


# 7. PORTFOLIO FLOW


## 7.1 Professional Creates Portfolio Project

Professional
↓
Portfolio
↓
Add project
↓
Project title
↓
Description
↓
Service
↓
Before images
↓
After images
↓
Additional images
↓
Save
↓
Publish where appropriate


## 7.2 Add Completed Job to Portfolio

Professional
↓
Completed job
↓
Add to portfolio
↓
Select project details
↓
Select permitted images
↓
Create portfolio project
↓
Public portfolio


# 8. CERTIFICATE FLOW


## 8.1 Professional Submits Certificate

Professional
↓
Certificates
↓
Add certificate
↓
Enter certificate information
↓
Upload document
↓
Submit
↓
PENDING


## 8.2 Admin Reviews Certificate

Admin
↓
Certificate verification
↓
Open certificate
↓
Review information
↓
Approve
or
Reject
or
Request information
↓
Professional notified


# 9. IDENTITY VERIFICATION FLOW


## 9.1 Professional Starts Verification

Professional
↓
Verification
↓
Start identity verification
↓
Provide required information
↓
Upload required documents
↓
Submit
↓
PENDING


## 9.2 Admin Reviews Identity Verification

Admin
↓
Verification queue
↓
Open request
↓
Review submitted information
↓
Approve
or
Reject
or
Request information
↓
Professional notified


# 10. MESSAGING FLOW


## 10.1 Customer and Provider Messaging

Customer
↓
Job
↓
Messages
↓
Open conversation
↓
Send message
↓
Provider receives notification
↓
Provider responds
↓
Customer receives notification


## 10.2 Business and Technician Messaging

Business
↓
Job
↓
Technician conversation
↓
Send message
↓
Technician receives notification
↓
Technician responds


# 11. ADMIN FLOWS


## 11.1 Admin User Management

Admin
↓
Users
↓
Search user
↓
Open user
↓
View details
↓
Take permitted administrative action
↓
Audit action where required


## 11.2 Admin Provider Verification

Admin
↓
Verification
↓
Open request
↓
Review
↓
Approve
or
Reject
or
Request information
↓
Status updated
↓
Provider notified


## 11.3 Admin Job Review

Admin
↓
Jobs
↓
Search job
↓
Open job
↓
Review:
- Customer
- Provider/business
- Quote
- Status
- Timeline
- Media
- Messages where permitted
↓
Take permitted administrative action


# 12. JOB STATUS FLOW

Standard flow:

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

Optional branch:

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

Exact allowed transitions must be enforced by the backend.


# 13. NOTIFICATION FLOW

Important events generate notifications.

Example:

Quote submitted
↓
Customer notification

Quote accepted
↓
Provider/business notification

Technician assigned
↓
Technician notification

Parts requested
↓
Manager notification

Parts approved/rejected
↓
Technician notification

Job completed
↓
Customer/business notification

Customer confirms
↓
Provider/business notification

Review requested
↓
Customer notification


# 14. ERROR AND EDGE FLOWS

The system must handle:

- Invalid login
- Expired session
- Unauthorized access
- Resource not found
- Invalid job transition
- Invalid quote
- Duplicate request
- Upload failure
- Unsupported file type
- File too large
- Network failure
- Server error
- Missing required information
- Verification rejection
- Verification information request
- Cancelled job
- Disputed job


# 15. PERMISSION PRINCIPLE

Every flow must be checked against the authenticated user's role and
resource ownership.

Frontend navigation must never be treated as the security boundary.

Backend authorization is mandatory.


# 16. FLOW COMPLETION PRINCIPLE

A flow is not considered complete until:

- UI exists
- API exists
- Database behaviour exists
- Authorization exists
- Validation exists
- Error handling exists
- Loading state exists
- Empty state exists
- Tests exist
- Documentation matches implementation
