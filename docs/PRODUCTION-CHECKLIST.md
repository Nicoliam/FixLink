# FixLink Production Deployment Checklist

Use this checklist for every production environment. Record the release version, operator, date and evidence location. Do not mark an item complete from assumption.

## Runtime and secrets

- [ ] Production `NODE_ENV` configured
- [ ] `AUTH_STORE=mysql` configured
- [ ] Strong JWT access secret configured
- [ ] Strong production secrets configured
- [ ] Database credentials configured securely
- [ ] Development JWT secret is not used
- [ ] Development database passwords are not used
- [ ] No secrets are present in Git, images, logs or client documentation
- [ ] Admin credentials secured and rotated under the access policy
- [ ] Secret rotation and session invalidation procedure recorded

## Web, API and network

- [ ] HTTPS enabled and HTTP redirected to HTTPS
- [ ] CORS restricted to the exact production web origin
- [ ] Reverse proxy routes `/api/*` to the API
- [ ] SPA fallback is configured for Angular client routes
- [ ] Security headers and restrictive CSP are configured
- [ ] API process has a restart/supervisor policy
- [ ] API logs are collected without secrets or private media
- [ ] Rate limiting is enabled and reviewed
- [ ] Request/upload limits are aligned at the proxy and API

## Database and migrations

- [ ] Database connectivity verified from the API host
- [ ] Database backup completed before deployment
- [ ] Migration status verified before and after release
- [ ] Schema verification completed
- [ ] Production seed data was not applied
- [ ] No destructive migration/reset command was run against production
- [ ] Database user privileges are least-privilege and documented

## File storage and privacy

- [ ] File storage configured with a durable `FILE_STORAGE_DIR`
- [ ] Upload permissions verified
- [ ] Storage directory is not publicly served
- [ ] Private media access tested for authorised users
- [ ] Private media access denied for unauthorised users
- [ ] No-store/no-cache headers verified
- [ ] Verification and certificate document access tested
- [ ] File storage backup and restore procedure verified

## Functional and security acceptance

- [ ] Smoke tests completed
- [ ] Login and logout completed for each deployed role
- [ ] Marketplace search and provider profile checked
- [ ] Marketplace job lifecycle checked through closure
- [ ] Direct-payment wording confirmed
- [ ] Business isolation tested
- [ ] Marketplace/internal job isolation tested
- [ ] Technician assignment and My Jobs isolation tested
- [ ] Parts request and approval/resume flow tested
- [ ] Notifications checked
- [ ] Admin routes and protected document access tested
- [ ] `/admin/settings` limitation acknowledged; no production settings are assumed
- [ ] Review, certificate and verification privacy checked
- [ ] Logs checked for errors and sensitive data

## Release readiness

- [ ] Rollback plan available
- [ ] Previous frontend/API artifact available
- [ ] Database restore point recorded
- [ ] Release version/build recorded
- [ ] UAT evidence and known limitations attached
- [ ] Client acceptance status recorded
- [ ] No unresolved blocker remains before go-live
