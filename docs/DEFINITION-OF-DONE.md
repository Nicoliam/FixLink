# FixLink — Definition of Done

A FixLink feature is complete only when the relevant implementation and
release evidence are present. This checklist is scoped to the current
MVP and does not require future features.

## Product and design

- [ ] Requirement is documented and inside the approved MVP.
- [ ] Approved Stitch/Oceanic visual hierarchy and responsive behaviour are preserved.
- [ ] No unapproved product, payment, role or admin-settings scope was added.
- [ ] Loading, empty, success, error, unauthorized and not-found states are handled where relevant.
- [ ] Accessibility labels, focus behaviour and keyboard operation are reviewed.

## Frontend and backend

- [ ] Angular feature is focused, typed and backed by the REST API.
- [ ] API validation and server-side authorization are implemented.
- [ ] Controllers remain thin and business rules remain in services/domain logic.
- [ ] Responses use the standard success/error envelope and safe messages.
- [ ] No sensitive fields, private storage references or file paths are exposed.

## Data and files

- [ ] Schema changes are implemented as ordered migrations with Down behavior.
- [ ] Foreign keys, indexes, constraints and lifecycle values are tested.
- [ ] Job transitions are validated by the backend.
- [ ] File type, size, path, storage and access controls are tested.
- [ ] Binary files remain outside MySQL.
- [ ] Business and marketplace/internal isolation is tested.

## Quality and documentation

- [ ] Relevant unit, integration, API, security and UI tests pass or limitations are recorded.
- [ ] Backend typecheck and build pass.
- [ ] Frontend production typecheck and build pass.
- [ ] Angular test result is recorded accurately, including environment limitations.
- [ ] Relevant product, API, permissions, user-flow, database, security and deployment docs are updated.
- [ ] `git diff --check` passes.

## Handover and UAT

- [ ] Client instructions and UAT matrix cover the feature.
- [ ] Development accounts are documented only where safely available and clearly marked non-production.
- [ ] Deployment, environment, backup, restore, rollback and smoke-test guidance is current.
- [ ] Production checklist and client acceptance record are prepared.
- [ ] Known limitations remain explicit.
