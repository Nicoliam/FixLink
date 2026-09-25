# FixLink Stitch Screen Mapping

## 1. Purpose

This document maps the approved Stitch designs to the FixLink application.

The Stitch export is the visual reference for the production Angular interface.

The Stitch designs should be implemented as reusable Angular components rather than copied as isolated HTML pages.

---

## 2. Approved Design Direction

**Oceanic Modern Marketplace**

Design source:

`design/stitch/`

Design system:

`docs/DESIGN-SYSTEM.md`

Official logo:

`design/stitch/assets/brand/fixlink-logo.svg`

---

## 3. Homepage

### Stitch References

`design/stitch/handylink_homepage_1/`

`design/stitch/handylink_homepage_2/`

### Purpose

Introduce FixLink and provide the primary entry point into the marketplace.

### Primary User

Customer.

### Angular Route

`/`

### Reusable Components

- Header
- Navigation
- Marketplace search
- Service category cards
- Provider cards
- Trust and verification badges
- Buttons
- Footer

---

## 4. Marketplace Search

### Stitch References

`design/stitch/handylink_search_marketplace_1/`

`design/stitch/handylink_search_marketplace_2/`

### Purpose

Allow customers to discover professionals and businesses based on service and location.

### Primary User

Customer.

### Angular Route

`/marketplace`

### Related Backend Functionality

`GET /api/v1/providers`

`GET /api/v1/services`

---

## 5. Professional Profile

### Stitch References

`design/stitch/handylink_professional_profile_thabo_mokoena_1/`

`design/stitch/handylink_professional_profile_thabo_mokoena_2/`

### Purpose

Give customers the information they need to evaluate a professional before requesting a job.

### Primary User

Customer.

### Angular Route

`/marketplace/providers/:id`

### Reusable Components

- Provider profile header
- Verification badges
- Rating summary
- Service tags
- Portfolio gallery
- Before and After gallery
- Certificate list
- Reviews list
- Request a Job button

### Related Backend Functionality

`GET /api/v1/providers/:id`

`GET /api/v1/providers/:id/portfolio`

`GET /api/v1/providers/:id/reviews`

`GET /api/v1/providers/:id/certificates`

---

## 6. Request a Job

### Stitch References

`design/stitch/handylink_request_a_job_flow_1/`

`design/stitch/handylink_request_a_job_flow_2/`

### Purpose

Allow a customer to submit a service request to a selected professional or business.

### Primary User

Customer.

### Angular Route

`/request-job`

### Reusable Components

- Provider summary
- Service selector
- Job description field
- Address or location field
- Image upload
- Form validation
- Submission button
- Success state
- Error state

### Related Backend Functionality

`POST /api/v1/jobs`

---

## 7. Screen Variants

The Stitch export contains multiple numbered references for several screens.

The numbered folders must remain available as design references.

Implementation should not automatically create duplicate Angular pages for each numbered reference.

Before implementation, review the relevant Stitch HTML and screenshots to determine whether each reference represents a responsive variation, visual variation, page state, continuation of a flow, or another approved design variation.

---

## 8. Shared Components

- App header
- Navigation
- Footer
- Page container
- Search bar
- Provider card
- Provider profile header
- Service category card
- Service tag
- Rating display
- Verification badge
- Portfolio gallery
- Before and After gallery
- Review card
- Form controls
- File upload
- Loading state
- Empty state
- Error state
- Success state
- Confirmation dialog
- Toast or notification

Do not create one-off visual patterns when an existing design-system component can be reused.

---

## 9. Angular Route Mapping

Initial marketplace routes:

- `/`
- `/marketplace`
- `/marketplace/providers/:id`
- `/request-job`

Authenticated application routes will be added according to the role-specific dashboard architecture defined in the project documentation.

---

## 10. API Dependencies

The Stitch marketplace screens depend on backend capabilities defined by the API documentation.

Initial endpoints:

- `GET /api/v1/services`
- `GET /api/v1/providers`
- `GET /api/v1/providers/:id`
- `GET /api/v1/providers/:id/portfolio`
- `GET /api/v1/providers/:id/reviews`
- `GET /api/v1/providers/:id/certificates`
- `POST /api/v1/jobs`

These represent the intended application contract. They do not imply that the endpoints are already implemented.

Frontend implementation must not bypass the API layer or access MySQL directly.

---

## 11. Responsive Behaviour

The implementation must follow the approved Oceanic Modern responsive system.

- Desktop: >= 1024px, 12-column layout, maximum content width 1280px
- Tablet: 768px–1023px, 8-column layout
- Mobile: < 768px, 4-column layout

Marketplace cards, forms, navigation and galleries must adapt to smaller screens without creating separate mobile-only visual systems unless the Stitch design specifically requires it.

---

## 12. Stitch Implementation Rules

1. Stitch is the visual reference.
2. Oceanic Modern Marketplace is the approved design direction.
3. Use the official FixLink logo.
4. Reuse design-system components.
5. Do not create unnecessary one-off patterns.
6. Keep spacing, typography, colours, radii and interaction patterns aligned with `docs/DESIGN-SYSTEM.md`.
7. Preserve responsive behaviour.
8. Preserve loading, empty, success and error states.
9. Do not expose private verification information.
10. Do not bypass backend authorization.
11. Do not connect the Angular frontend directly to MySQL.
12. Do not introduce payment processing into the MVP.
13. Do not create separate job architectures for marketplace and internal business jobs.

---

## 13. Relationship to Other Documentation

This document works together with:

- `docs/PRODUCT.md`
- `docs/MVP-SCOPE.md`
- `docs/USER-FLOWS.md`
- `docs/ARCHITECTURE.md`
- `docs/DATABASE.md`
- `docs/API.md`
- `docs/PERMISSIONS.md`
- `docs/DESIGN-SYSTEM.md`
- `docs/SECURITY.md`
- `docs/FILE-STORAGE.md`
- `docs/TEST-PLAN.md`
- `docs/DEFINITION-OF-DONE.md`

If a visual implementation decision conflicts with security, permissions, architecture or MVP scope, the corresponding technical or product documentation takes precedence.

---

## 14. Current Stage

**Stage 12 — Client UAT and handover preparation**

This mapping originally documented the Stage 3 marketplace UI foundation.
The current implementation has since progressed through the marketplace,
provider, business, technician, notification and admin surfaces. The
approved Stitch/Oceanic design remains the visual source of truth; Stage
12 changes documentation and deployment preparation only.

No additional product functionality should be introduced solely because it appears visually useful in the Stitch design. Current functionality and known limitations are recorded in `docs/HANDOVER.md`, `docs/CLIENT-UAT.md` and `docs/PRODUCTION-CHECKLIST.md`.

---

## Source of Truth

Design source:

`design/stitch/`

Approved visual direction:

**Oceanic Modern Marketplace**

Official logo:

`design/stitch/assets/brand/fixlink-logo.svg`

When the Stitch design and implementation differ, review the implementation against the approved Stitch design before introducing a new visual pattern.

---

## Implementation Rule

The design system defines the visual language.

The application architecture, permissions, backend rules, job lifecycle, verification rules and MVP scope remain governed by their corresponding project documentation.

Visual design must not override product or security requirements.
