import { describe, it, beforeEach } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { MemoryAdminStore } from '../src/modules/admin/memory-admin.store';
import { MemoryUserRepository } from '../src/modules/auth/memory-user.repository';
import { MemoryRefreshStore } from '../src/modules/auth/refresh.store';
import { signAccessToken } from '../src/utils/tokens';
import { LocalFileStorage } from '../src/services/file-storage';

function appWithUsers() {
  const users = new MemoryUserRepository();
  const admin = new MemoryAdminStore(users);
  const app = createApp({ users, refreshStore: new MemoryRefreshStore(), admin });
  return { app, users, admin };
}
async function createUser(users: MemoryUserRepository, email: string, roles: string[], status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DELETED' = 'ACTIVE') {
  const user = await users.create({ email, phone: null, passwordHash: 'not-a-real-hash' });
  await users.setRoles(user.id, roles);
  await users.setStatus(user.id, status);
  return { id: user.id, token: signAccessToken({ sub: user.id, email: user.email, roles }) };
}
function auth(token: string) { return { Authorization: `Bearer ${token}` }; }
function sensitive(value: unknown, path = 'body'): string[] {
  const banned = new Set(['password', 'password_hash', 'passwordHash', 'refreshToken', 'documentReference', 'document_reference', 'identityDocument', 'identity_document', 'fileReference', 'file_reference', 'storageKey', 'internalPath']);
  if (Array.isArray(value)) return value.flatMap((v, i) => sensitive(v, `${path}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => [...(banned.has(k) ? [`${path}.${k}`] : []), ...sensitive(v, `${path}.${k}`)]);
  return [];
}

describe('admin authorization and resources', () => {
  let app: Express;
  let users: MemoryUserRepository;
  let admin: Awaited<ReturnType<typeof createUser>>;
  let customer: Awaited<ReturnType<typeof createUser>>;
  let adminStore: MemoryAdminStore;
  beforeEach(async () => {
    ({ app, users, admin: adminStore } = appWithUsers());
    admin = await createUser(users, 'admin@example.co.za', ['ADMIN']);
    customer = await createUser(users, 'customer@example.co.za', ['CUSTOMER']);
  });

  it('requires authentication and an authoritative ADMIN role', async () => {
    assert.equal((await request(app).get('/api/v1/admin/dashboard')).status, 401);
    assert.equal((await request(app).get('/api/v1/admin/dashboard').set(auth(customer.token))).status, 403);
    for (const role of ['PROFESSIONAL', 'BUSINESS_OWNER', 'BUSINESS_MANAGER', 'TECHNICIAN']) {
      const user = await createUser(users, `${role.toLowerCase()}@example.co.za`, [role]);
      assert.equal((await request(app).get('/api/v1/admin/users').set(auth(user.token))).status, 403, role);
    }
    assert.equal((await request(app).get('/api/v1/admin/dashboard').set(auth(admin.token))).status, 200);
    const pendingAdmin = await createUser(users, 'pending-admin@example.co.za', ['ADMIN'], 'PENDING');
    assert.equal((await request(app).get('/api/v1/admin/dashboard').set(auth(pendingAdmin.token))).status, 403);
    const staleRole = await createUser(users, 'stale-role@example.co.za', []);
    staleRole.token = signAccessToken({ sub: staleRole.id, email: 'stale-role@example.co.za', roles: ['ADMIN'] });
    assert.equal((await request(app).get('/api/v1/admin/dashboard').set(auth(staleRole.token))).status, 403);
  });

  it('returns a dashboard and sanitized user detail with last login metadata', async () => {
    await users.touchLogin(customer.id);
    const dashboard = await request(app).get('/api/v1/admin/dashboard').set(auth(admin.token));
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.body.success, true);
    assert.ok(dashboard.body.data.users.total >= 2);
    const detail = await request(app).get(`/api/v1/admin/users/${customer.id}`).set(auth(admin.token));
    assert.equal(detail.status, 200);
    assert.deepEqual(sensitive(detail.body), []);
    assert.equal(detail.body.data.passwordHash, undefined);
    assert.equal(typeof detail.body.data.lastLoginAt, 'string');
    const userList = await request(app).get('/api/v1/admin/users?search=customer').set(auth(admin.token));
    assert.equal(typeof userList.body.data.items[0].lastLoginAt, 'string');
  });

  it('lists, filters and paginates users and suspends/reactivate safely', async () => {
    const list = await request(app).get('/api/v1/admin/users?role=CUSTOMER&page=1&pageSize=1').set(auth(admin.token));
    assert.equal(list.status, 200);
    assert.equal(list.body.data.pageSize, 1);
    assert.equal(list.body.data.items.length, 1);
    const suspend = await request(app).post(`/api/v1/admin/users/${customer.id}/suspend`).set(auth(admin.token)).send({});
    assert.equal(suspend.status, 200);
    assert.equal(suspend.body.data.status, 'SUSPENDED');
    const reactivated = await request(app).post(`/api/v1/admin/users/${customer.id}/reactivate`).set(auth(admin.token)).send({});
    assert.equal(reactivated.status, 200);
    assert.equal(reactivated.body.data.status, 'ACTIVE');
    assert.equal((await request(app).post(`/api/v1/admin/users/${admin.id}/suspend`).set(auth(admin.token)).send({})).status, 409);
    assert.equal((await request(app).post(`/api/v1/admin/users/${customer.id}/reactivate`).set(auth(admin.token)).send({})).status, 409);
    assert.equal((await request(app).get(`/api/v1/admin/users/999999`).set(auth(admin.token))).status, 404);
    const pending = await createUser(users, 'pending-customer@example.co.za', ['CUSTOMER'], 'PENDING');
    assert.equal((await request(app).post(`/api/v1/admin/users/${pending.id}/reactivate`).set(auth(admin.token)).send({})).status, 409);
    const deleted = await createUser(users, 'deleted-customer@example.co.za', ['CUSTOMER'], 'DELETED');
    assert.equal((await request(app).post(`/api/v1/admin/users/${deleted.id}/reactivate`).set(auth(admin.token)).send({})).status, 409);
  });

  it('exposes customers, professionals, businesses and technicians with relevant detail', async () => {
    for (const path of ['customers', 'professionals', 'businesses', 'technicians']) {
      const response = await request(app).get(`/api/v1/admin/${path}`).set(auth(admin.token));
      assert.equal(response.status, 200, path);
      assert.ok(response.body.data.items.length > 0, path);
      const detail = await request(app).get(`/api/v1/admin/${path}/1`).set(auth(admin.token));
      assert.equal(detail.status, 200, path);
    }
  });

  it('returns bounded nested customer, professional, business, technician and job details', async () => {
    const customer = await request(app).get('/api/v1/admin/customers/1').set(auth(admin.token));
    assert.equal(customer.status, 200);
    assert.equal(customer.body.data.jobs.length, 1);
    assert.equal(customer.body.data.jobs[0].providerName, 'Sipho Ndlovu');
    assert.equal(customer.body.data.reviews.length, 1);
    assert.equal(customer.body.data.summary.reviewCount, 1);

    const professional = await request(app).get('/api/v1/admin/professionals/1').set(auth(admin.token));
    assert.equal(professional.status, 200);
    assert.ok(professional.body.data.services.length > 0);
    assert.ok(professional.body.data.serviceAreas.length > 0);
    assert.ok(professional.body.data.portfolio.length > 0);
    assert.equal(professional.body.data.portfolio[0].imageCount, 2);
    assert.equal(professional.body.data.certificates.length, 1);
    assert.ok(professional.body.data.reviews.length > 0);
    assert.equal((await request(app).get('/api/v1/admin/professionals/2').set(auth(admin.token))).body.data.identityVerification.status, 'PENDING');

    const business = await request(app).get('/api/v1/admin/businesses/1').set(auth(admin.token));
    assert.equal(business.status, 200);
    assert.equal(business.body.data.owner.id, '301');
    assert.equal(business.body.data.members[0].role, 'BUSINESS_OWNER');
    assert.equal(business.body.data.technicians.length, 1);
    assert.equal(business.body.data.jobs.length, 1);

    const technician = await request(app).get('/api/v1/admin/technicians/1').set(auth(admin.token));
    assert.equal(technician.status, 200);
    assert.equal(technician.body.data.business.id, '1');
    assert.equal(technician.body.data.assignedJobCount, 1);
    assert.equal(technician.body.data.assignments.length, 1);

    for (const path of ['jobs/1', 'jobs/2']) {
      const detail = await request(app).get(`/api/v1/admin/${path}`).set(auth(admin.token));
      assert.equal(detail.status, 200, path);
      assert.ok(detail.body.data.timeline.length > 0, path);
      assert.ok(Array.isArray(detail.body.data.quotes), path);
      assert.ok(Array.isArray(detail.body.data.assignments), path);
      assert.ok(detail.body.data.documentation, path);
      assert.deepEqual(sensitive(detail.body), []);
    }
    const internal = await request(app).get('/api/v1/admin/jobs/2').set(auth(admin.token));
    assert.equal(internal.body.data.source, 'INTERNAL');
    assert.ok(internal.body.data.documentation.partsRequests.length > 0);
    assert.ok(internal.body.data.documentation.images.length > 0);
  });

  it('returns 404 for unknown detail resources', async () => {
    for (const path of ['customers/999', 'professionals/999', 'businesses/999', 'technicians/999', 'jobs/999']) {
      assert.equal((await request(app).get(`/api/v1/admin/${path}`).set(auth(admin.token))).status, 404, path);
    }
  });

  it('manages services with category data and status', async () => {
    const categories = await request(app).get('/api/v1/admin/services/categories').set(auth(admin.token));
    assert.equal(categories.status, 200);
    const created = await request(app).post('/api/v1/admin/services').set(auth(admin.token)).send({ categoryId: '1', name: 'New Plumbing Service', slug: 'new-plumbing-service', description: null, sortOrder: 4, isActive: true });
    assert.equal(created.status, 201);
    const serviceId = created.body.data.id;
    const updated = await request(app).patch(`/api/v1/admin/services/${serviceId}`).set(auth(admin.token)).send({ name: 'Updated Plumbing Service' });
    assert.equal(updated.status, 200);
    assert.equal((await request(app).post(`/api/v1/admin/services/${serviceId}/deactivate`).set(auth(admin.token)).send({})).status, 200);
    assert.equal((await request(app).post(`/api/v1/admin/services/${serviceId}/activate`).set(auth(admin.token)).send({})).status, 200);
    const activationAudit = await request(app).get('/api/v1/admin/audit-logs?action=SERVICE_ACTIVATED').set(auth(admin.token));
    assert.equal(activationAudit.body.data.total, 1);
  });

  it('returns typed mutation errors and rolls back state when audit persistence fails', async () => {
    assert.equal((await request(app).post('/api/v1/admin/services').set(auth(admin.token)).send({ categoryId: '999', name: 'Unknown category', slug: 'unknown-category', description: null, sortOrder: 1, isActive: true })).status, 404);
    assert.equal((await request(app).post('/api/v1/admin/services').set(auth(admin.token)).send({ categoryId: '1', name: 'Another name', slug: 'leak-repair', description: null, sortOrder: 1, isActive: true })).status, 409);
    adminStore.failNextAuditOnce();
    const failed = await request(app).post('/api/v1/admin/services').set(auth(admin.token)).send({ categoryId: '1', name: 'Rollback service', slug: 'rollback-service', description: null, sortOrder: 1, isActive: true });
    assert.equal(failed.status, 500);
    assert.equal((await request(app).get('/api/v1/admin/services?search=rollback-service').set(auth(admin.token))).body.data.total, 0);
    assert.equal((await request(app).get('/api/v1/admin/audit-logs?action=SERVICE_CREATED').set(auth(admin.token))).body.data.total, 0);
    adminStore.failNextAuditOnce();
    const failedUser = await request(app).post(`/api/v1/admin/users/${customer.id}/suspend`).set(auth(admin.token)).send({});
    assert.equal(failedUser.status, 500);
    assert.equal((await request(app).get(`/api/v1/admin/users/${customer.id}`).set(auth(admin.token))).body.data.status, 'ACTIVE');
    adminStore.failNextAuditOnce();
    const failedVerification = await request(app).post('/api/v1/admin/verifications/1/approve').set(auth(admin.token)).send({});
    assert.equal(failedVerification.status, 500);
    assert.equal((await request(app).get('/api/v1/admin/verifications/1').set(auth(admin.token))).body.data.status, 'PENDING');
    adminStore.failNextAuditOnce();
    const report = await request(app).patch('/api/v1/admin/reports/1/status').set(auth(admin.token)).send({ status: 'IN_REVIEW' });
    assert.equal(report.status, 500);
    assert.equal((await request(app).get('/api/v1/admin/reports/1').set(auth(admin.token))).body.data.status, 'OPEN');
  });

  it('rejects rollover dates and keeps date-only upper bounds inclusive', async () => {
    assert.equal((await request(app).get('/api/v1/admin/jobs?from=2026-02-30').set(auth(admin.token))).status, 422);
    const jobs = await request(app).get('/api/v1/admin/jobs?from=2026-09-20&to=2026-09-20').set(auth(admin.token));
    assert.equal(jobs.status, 200);
    assert.equal(jobs.body.data.items.length, 1);
  });

  it('rejects invalid reactivation states and self-actions', async () => {
    const pending = await createUser(users, 'reactivate-pending@example.co.za', ['CUSTOMER'], 'PENDING');
    const deleted = await createUser(users, 'reactivate-deleted@example.co.za', ['CUSTOMER'], 'DELETED');
    assert.equal((await request(app).post(`/api/v1/admin/users/${pending.id}/reactivate`).set(auth(admin.token)).send({})).status, 409);
    assert.equal((await request(app).post(`/api/v1/admin/users/${deleted.id}/reactivate`).set(auth(admin.token)).send({})).status, 409);
    assert.equal((await request(app).post(`/api/v1/admin/users/${admin.id}/suspend`).set(auth(admin.token)).send({})).status, 409);
  });

  it('filters jobs by source, status, date and ownership', async () => {
    const marketplace = await request(app).get('/api/v1/admin/jobs?source=MARKETPLACE&status=REQUESTED&customerId=1').set(auth(admin.token));
    assert.equal(marketplace.status, 200);
    assert.equal(marketplace.body.data.items.length, 1);
    assert.equal(marketplace.body.data.items[0].source, 'MARKETPLACE');
    const internal = await request(app).get('/api/v1/admin/jobs?source=INTERNAL&from=2026-09-01&to=2026-09-30').set(auth(admin.token));
    assert.equal(internal.body.data.items.length, 1);
    const detail = await request(app).get('/api/v1/admin/jobs/1').set(auth(admin.token));
    assert.equal(detail.status, 200);
  });

  it('handles identity and certificate decisions separately with audit records', async () => {
    const verification = await request(app).post('/api/v1/admin/verifications/1/approve').set(auth(admin.token)).send({});
    assert.equal(verification.status, 200);
    assert.equal(verification.body.data.status, 'APPROVED');
    const certificate = await request(app).post('/api/v1/admin/certificates/1/reject').set(auth(admin.token)).send({ notes: 'Document needs a clearer issuer name.' });
    assert.equal(certificate.status, 200);
    assert.equal(certificate.body.data.verificationStatus, 'REJECTED');
    const audits = await request(app).get('/api/v1/admin/audit-logs?action=VERIFICATION_APPROVED').set(auth(admin.token));
    assert.equal(audits.status, 200);
    assert.equal(audits.body.data.items[0].action, 'VERIFICATION_APPROVED');
    assert.deepEqual(sensitive(audits.body), []);
  });

  it('keeps identity, business and certificate verification workflows isolated', async () => {
    const professionalsBefore = await request(app).get('/api/v1/admin/professionals/2').set(auth(admin.token));
    const businessesBefore = await request(app).get('/api/v1/admin/businesses/2').set(auth(admin.token));
    assert.equal((await request(app).post('/api/v1/admin/verifications/3/approve').set(auth(admin.token)).send({})).status, 409);
    assert.equal((await request(app).post('/api/v1/admin/verifications/2/approve').set(auth(admin.token)).send({})).status, 200);
    const professionalsAfter = await request(app).get('/api/v1/admin/professionals/2').set(auth(admin.token));
    const businessesAfter = await request(app).get('/api/v1/admin/businesses/2').set(auth(admin.token));
    assert.equal(professionalsAfter.body.data.verificationStatus, professionalsBefore.body.data.verificationStatus);
    assert.equal(businessesAfter.body.data.verificationStatus, 'VERIFIED');
    assert.equal((await request(app).post('/api/v1/admin/verifications/3/approve').set(auth(admin.token)).send({})).status, 409);
  });
  it('lists reviews, reports and disputes and applies safe status transitions', async () => {

    const reviews = await request(app).get('/api/v1/admin/reviews?minRating=5&search=Excellent').set(auth(admin.token));
    assert.equal(reviews.status, 200);
    assert.equal(reviews.body.data.items.length, 1);
    const report = await request(app).patch('/api/v1/admin/reports/1/status').set(auth(admin.token)).send({ status: 'IN_REVIEW' });
    assert.equal(report.status, 200);
    const dispute = await request(app).patch('/api/v1/admin/disputes/1').set(auth(admin.token)).send({ status: 'RESOLVED', resolution: 'Refund agreed directly with the parties.' });
    assert.equal(dispute.status, 200);
     assert.equal(dispute.body.data.status, 'RESOLVED');
     const reverse = await request(app).patch('/api/v1/admin/disputes/1').set(auth(admin.token)).send({ status: 'OPEN' });
     assert.equal(reverse.status, 409);
  });

  it('rejects stale and terminal report/dispute transitions consistently', async () => {
    assert.equal((await request(app).patch('/api/v1/admin/reports/1/status').set(auth(admin.token)).send({ status: 'IN_REVIEW' })).status, 200);
    assert.equal((await request(app).patch('/api/v1/admin/reports/1/status').set(auth(admin.token)).send({ status: 'OPEN' })).status, 409);
    assert.equal((await request(app).patch('/api/v1/admin/reports/1/status').set(auth(admin.token)).send({ status: 'IN_REVIEW' })).status, 409);
    assert.equal((await request(app).patch('/api/v1/admin/reports/1/status').set(auth(admin.token)).send({ status: 'RESOLVED' })).status, 200);
    assert.equal((await request(app).patch('/api/v1/admin/reports/1/status').set(auth(admin.token)).send({ status: 'DISMISSED' })).status, 409);
    assert.equal((await request(app).patch('/api/v1/admin/disputes/1').set(auth(admin.token)).send({ status: 'IN_REVIEW' })).status, 200);
    assert.equal((await request(app).patch('/api/v1/admin/disputes/1').set(auth(admin.token)).send({ status: 'OPEN' })).status, 409);
    assert.equal((await request(app).patch('/api/v1/admin/disputes/1').set(auth(admin.token)).send({ status: 'CLOSED', resolution: 'Closed after agreement.' })).status, 200);
    assert.equal((await request(app).patch('/api/v1/admin/disputes/1').set(auth(admin.token)).send({ status: 'IN_REVIEW' })).status, 409);
  });

  it('rejects unknown fields, invalid filters and unknown ids', async () => {
    assert.equal((await request(app).get('/api/v1/admin/users?unexpected=true').set(auth(admin.token))).status, 422);
    assert.equal((await request(app).get('/api/v1/admin/jobs?from=not-a-date').set(auth(admin.token))).status, 422);
    assert.equal((await request(app).get('/api/v1/admin/jobs?pageSize=51').set(auth(admin.token))).status, 422);
    assert.equal((await request(app).post('/api/v1/admin/services').set(auth(admin.token)).send({ categoryId: '1', name: 'x', slug: 'x', password: 'no' })).status, 422);
    assert.equal((await request(app).get('/api/v1/admin/users/999999').set(auth(admin.token))).status, 404);
  });

  it('streams admin documents without exposing storage references or paths', async () => {
    const storage = new LocalFileStorage(mkdtempSync(join(tmpdir(), 'fixlink-admin-docs-')));
    const verificationFile = await storage.saveAdminDocument('verification', '1', Buffer.from('%PDF-verification'), 'pdf');
    const certificateFile = await storage.saveAdminDocument('certificate', '1', Buffer.from('%PDF-certificate'), 'pdf');
    const documentStore = new MemoryAdminStore(users, {
      'verification:1': { storageKey: verificationFile.storageKey, mimeType: 'application/pdf', filename: 'verification-1.pdf' },
      'certificate:1': { storageKey: certificateFile.storageKey, mimeType: 'application/pdf', filename: 'certificate-1.pdf' },
    });
    const documentApp = createApp({ users, refreshStore: new MemoryRefreshStore(), admin: documentStore, storage });
    const verification = await request(documentApp).get('/api/v1/admin/verifications/1/document').set(auth(admin.token));
    assert.equal(verification.status, 200);
     assert.equal(verification.headers['content-type'], 'application/pdf');
     assert.equal(verification.headers['cache-control'], 'no-store, no-cache, must-revalidate, private');
     assert.equal(verification.headers.pragma, 'no-cache');
     assert.match(verification.headers['content-disposition'], /attachment/);
    assert.ok(!JSON.stringify(verification.body).includes(verificationFile.storageKey));
    const certificate = await request(documentApp).get('/api/v1/admin/certificates/1/document').set(auth(admin.token));
    assert.equal(certificate.status, 200);
    assert.equal((await request(documentApp).get('/api/v1/admin/verifications/1/document').set(auth(customer.token))).status, 403);
    const pendingAdmin = await createUser(users, 'pending-document-admin@example.co.za', ['ADMIN'], 'PENDING');
    assert.equal((await request(documentApp).get('/api/v1/admin/certificates/1/document').set(auth(pendingAdmin.token))).status, 403);
    const audits = await request(documentApp).get('/api/v1/admin/audit-logs?search=DOCUMENT_VIEWED').set(auth(admin.token));
    assert.equal(audits.body.data.total, 2);
  });

  it('returns no private document or credential fields from admin projections', async () => {
    const responses = await Promise.all(['users', 'customers', 'professionals', 'businesses', 'technicians', 'services', 'jobs', 'verifications', 'certificates', 'reviews', 'reports', 'disputes', 'audit-logs'].map((path) => request(app).get(`/api/v1/admin/${path}`).set(auth(admin.token))));
    for (const response of responses) { assert.equal(response.status, 200); assert.deepEqual(sensitive(response.body), []); }
  });
});
