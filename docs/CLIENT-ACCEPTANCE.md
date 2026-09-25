# FixLink Client Acceptance and Sign-off

## 1. Acceptance details

| Item | Value |
|---|---|
| Client name | `[Client legal or trading name]` |
| Project | FixLink |
| UAT period | `[Start date] to [End date]` |
| Version/build | `[Version, commit or build identifier]` |
| Test environment | `[UAT URL / deployment reference]` |
| Project representative | `[Name and role]` |
| Client representative | `[Name and role]` |

## 2. Acceptance statement

The parties acknowledge that this document records the result of the agreed FixLink user acceptance testing and deployment-readiness review for the version identified above.

Client acceptance is based on the documented current MVP scope, the agreed UAT test plan and the recorded outstanding issues and known limitations. Signing indicates that the client has reviewed the supplied UAT evidence and accepts the release at the stated level, subject to the limitations recorded below.

This acceptance does not add payment processing, escrow, messaging, GPS tracking, admin settings, cloud storage or any other unapproved functionality to the MVP.

## 3. Acceptance decision

Select one:

- [ ] Accepted for handover
- [ ] Accepted with listed outstanding issues
- [ ] Not accepted; remediation required
- [ ] Deferred pending a new acceptance review

Decision notes:

`[Add decision context.]`

## 4. Outstanding issues

Use `None` only when there are no outstanding issues. Classify issues consistently and link the issue reference rather than attaching sensitive data to this document.

| ID | Severity | Summary | UAT test(s) | Owner | Target date | Status | Release/build | Evidence/reference |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

Severity guidance:

- **Blocker**: prevents a core workflow from completing or exposes protected data.
- **High**: major role or business workflow cannot be used.
- **Medium**: material usability or deployment issue with a workaround.
- **Low**: cosmetic or minor non-blocking issue.
- **Known limitation**: accepted item outside the current implementation or approved MVP.

## 5. Known limitations

The following limitations are part of the current release context unless the client agrees otherwise in writing:

1. `/admin/settings` exists in the Angular navigation/route, but platform settings management is not implemented.
2. The MVP does not process customer payments. Payment is arranged directly with the professional or business; FixLink records the agreed quote but does not process the money.
3. Verification documents are private and are not exposed on public profiles.
4. Technicians are business team members and are not automatically marketplace professionals.
5. The Angular automated test runner has environment/runtime limitations in the current development environment. Stage 11 did not reach Angular test execution; frontend typecheck and production build passed in that report.
6. No browser E2E or recorded manual mobile acceptance evidence is currently attached.
7. The MVP uses local protected file storage. Cloud/object storage is future infrastructure.
8. Seeded file references may not have matching binary files in a fresh local install; uploaded files created through the application are stored normally.
9. The checked-in schema snapshot is a reference artifact; versioned migrations are authoritative.
10. Customer review submission, quote decline, messaging, provider management uploads and several other listed product ideas are not current frontend capabilities.

## 6. Client approval

By signing, the client confirms that they have reviewed this document, the UAT results and the outstanding issues/limitations. This signature does not waive rights under any separately agreed contract.

| | |
|---|---|
| Client name | |
| Client representative | |
| Position | |
| Signature | |
| Date | |

## 7. Developer/project representative approval

| | |
|---|---|
| Project representative | |
| Position | |
| Organisation | |
| Signature | |
| Date | |

## 8. Handover record

| Item | Reference |
|---|---|
| Approved UAT test plan | [`CLIENT-UAT-TEST-PLAN.md`](CLIENT-UAT-TEST-PLAN.md) |
| Client UAT instructions | [`CLIENT-UAT.md`](CLIENT-UAT.md) |
| Technical handover | [`HANDOVER.md`](HANDOVER.md) |
| Deployment procedure | [`DEPLOYMENT.md`](DEPLOYMENT.md) |
| Production checklist | [`PRODUCTION-CHECKLIST.md`](PRODUCTION-CHECKLIST.md) |
| Smoke test | [`SMOKE-TEST.md`](SMOKE-TEST.md) |
| Security evidence | [`SECURITY.md`](SECURITY.md) |
| Stage 11 validation report | [`STAGE-11-FULL-SYSTEM-TEST-REPORT.md`](STAGE-11-FULL-SYSTEM-TEST-REPORT.md) |
