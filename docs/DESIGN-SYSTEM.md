# FixLink Design System

## 1. Purpose

This document defines the approved visual system for FixLink.

Approved visual direction:

**Oceanic Modern Marketplace**

The Stitch design export is the visual source of truth for the FixLink interface. Production Angular components should implement this system rather than introducing unrelated visual patterns.

---

## 2. Brand

### Product

FixLink

### Slogan

Connect. Quote. Fix.

### Logo

Official logo:

`design/stitch/assets/brand/fixlink-logo.svg`

Do not recreate, distort, stretch, recolor, or modify the logo without an approved design change.

---

## 3. Visual Direction

FixLink uses the Oceanic Modern Marketplace direction.

The visual language is:

- Modern
- Clean
- Trustworthy
- Consumer-friendly
- Mobile-first
- Professional
- High-trust
- Light and spacious
- Rounded rather than industrial

The design intentionally avoids heavy construction-industry visual tropes such as caution tape, rugged hardware textures, and harsh industrial styling.

---

## 4. Color System

### Primary

- Primary: `#0284C7`
- Primary Hover: `#0369A1`

Used for:

- Primary buttons
- Search actions
- Active navigation
- Links
- Selected states
- Important interface actions

### Secondary / Trust

- Secondary: `#0F766E`

Used for:

- Trust actions
- Safety states
- Identity verification
- Security-related actions
- Guarantee markers

### Tertiary / Accent

- Accent: `#E05A12`

Used selectively for:

- Promotional highlights
- Urgency states
- Local feature callouts
- Important secondary emphasis

### Neutral

- Deep Slate: `#0F172A`

Used for:

- Primary text
- Headings
- Icons
- Structural elements

### Surfaces

- Canvas: `#F8FAFC`
- Surface: `#FFFFFF`
- Muted Surface: `#F1F5F9`
- Border: `#E2E8F0`
- Input Border: `#CBD5E1`

### Status

- Verified: `#059669`
- Verified Background: `#ECFDF5`
- Alert: `#DC2626`
- Alert Background: `#FEF2F2`

---

## 5. Typography

Primary font:

**Plus Jakarta Sans**

### Display

- Headline XL: 48px / 56px / 800
- Headline XL Mobile: 32px / 40px / 800

### Headings

- Headline LG: 36px / 44px / 700
- Headline LG Mobile: 26px / 34px / 700
- Headline MD: 24px / 32px / 700
- Headline SM: 20px / 28px / 600

### Body

- Body LG: 18px / 28px / 400
- Body MD: 16px / 24px / 400
- Body SM: 14px / 20px / 400

### Labels

- Label LG: 16px / 20px / 600
- Label MD: 14px / 18px / 600
- Label SM: 12px / 16px / 700

### Pricing

- Price Display: 22px / 28px / 800
- Use tabular numerical figures where appropriate.

---

## 6. Responsive Layout

### Desktop

- Breakpoint: >= 1024px
- Grid: 12 columns
- Maximum width: 1280px
- Gutter: 1.25rem
- Outer margin: 2rem

### Tablet

- Breakpoint: 768px - 1023px
- Grid: 8 columns
- Margins: 1.5rem - 2rem

### Mobile

- Breakpoint: < 768px
- Grid: 4 columns
- Outer margin: 1rem
- Internal gutter: 0.75rem

The interface must remain fully usable on mobile.

---

## 7. Spacing

- `space-xs`: 4px
- `space-sm`: 8px
- `space-md`: 16px
- `space-lg`: 24px
- `space-xl`: 40px

Use spacing consistently rather than introducing arbitrary values.

---

## 8. Border Radius

- Small: 4px
- Default: 8px
- Interactive: 12px
- Cards: 16px
- Large surfaces: 24px
- Pills: 9999px

Standard usage:

- Inputs / Buttons: 12px
- Cards / Modules: 16px
- Dialogs / Bottom Sheets: 24px
- Badges / Status Chips: 9999px

---

## 9. Elevation

### Tier 0 — Canvas

`#F8FAFC`

No elevation.

### Tier 1 — Cards

- Background: `#FFFFFF`
- Border: `#E2E8F0`

Subtle ambient shadow:

`0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.04)`

### Tier 2 — Floating Controls

Used for search bars, filter controls and floating menus.

`0 10px 25px -5px rgba(2, 132, 199, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04)`

### Tier 3 — Modals

Used for modals, bottom sheets and booking dialogs.

`0 20px 30px -10px rgba(15, 23, 42, 0.14)`

---

## 10. Buttons

### Primary

- Background: `#0284C7`
- Text: `#FFFFFF`
- Radius: 12px

Hover:

`#0369A1`

Active:

`scale(0.98)`

### Secondary

- Background: `#F1F5F9`
- Text: `#0F172A`
- Border: `#E2E8F0`
- Radius: 12px

### Trust / Safety

- Background: `#0F766E`
- Text: `#FFFFFF`
- Radius: 12px

Used for identity checks and security-related actions.

---

## 11. Search

The FixLink marketplace uses a dual-input search pattern:

**Service + Location / Suburb + Search**

Example:

`Plumbing, Electrical, Handyman + Fourways, Johannesburg + Search`

Search container:

- Background: `#FFFFFF`
- Radius: 16px
- Border: `#E2E8F0`
- Tier 2 elevation

The search button uses the primary color.

This should be implemented as a reusable Angular component.

---

## 12. Provider / Service Cards

Provider cards use:

- Background: `#FFFFFF`
- Radius: 16px
- Tier 1 elevation

Typical information:

- Provider image
- Provider name
- Location
- Verification badge
- Rating
- Review count
- Completed jobs
- Starting price where available
- Primary action

Example:

`Thabo Mokoena — Fourways, Johannesburg — Verified Professional — 4.96 (124 reviews) — 340+ completed jobs — From R450`

Cards should use subtle hover elevation on desktop.

---

## 13. Verification Badges

### Verified Professional

- Background: `#ECFDF5`
- Text: `#059669`
- Shape: Pill

### Trade Certified

- Background: `#F0F9FF`
- Text: `#0284C7`
- Shape: Pill

Verification badges must represent actual backend verification state.

The frontend must never create a verified badge based solely on user-provided data.

---

## 14. Forms

Inputs:

- Background: `#FFFFFF`
- Border: `#CBD5E1`
- Radius: 12px

Focus:

`0 0 0 3px rgba(2, 132, 199, 0.25)`

Checkbox:

- Radius: 6px

Radio:

- Radius: 9999px

Checked controls use:

`#0284C7`

---

## 15. Interaction

Interactive cards may use:

`transform: translateY(-2px)`

with a subtle shadow increase.

Transitions should be short and purposeful.

Avoid excessive animation.

---

## 16. Photography

FixLink should use authentic, professional home-service imagery where imagery is required.

Photography should communicate:

- Real people
- Real homes
- Professional service
- South African context where appropriate
- Trust
- Quality workmanship

Avoid overly generic industrial imagery.

---

## 17. Accessibility

The UI must provide:

- Sufficient text/background contrast
- Visible keyboard focus states
- Accessible form labels
- Touch-friendly controls
- Meaningful button labels
- Alternative text for meaningful images
- Status information that is not communicated by color alone

---

## 18. Component Principles

Angular components should be:

- Reusable
- Responsive
- Data-driven
- Accessible
- Independently testable
- Consistent with this design system

Do not create one-off visual patterns when an existing design-system component can be reused.

---

## 19. Source of Truth

Design source:

`design/stitch/`

Approved visual direction:

**Oceanic Modern Marketplace**

Official logo:

`design/stitch/assets/brand/fixlink-logo.svg`

When the Stitch design and implementation differ, review the implementation against the approved Stitch design before introducing a new visual pattern.

---

## 20. Implementation Rule

The design system defines the visual language.

The application architecture, permissions, backend rules, job lifecycle, verification rules and MVP scope remain governed by their corresponding project documentation.

Visual design must not override product or security requirements.
