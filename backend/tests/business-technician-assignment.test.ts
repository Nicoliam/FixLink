/**
 * FixLink Stage 7C — technician assignment + My Jobs tests.
 *
 * Run: npm test (no MySQL required — in-memory business store +
 * shared in-memory jobs store).
 *
 * Covers (§11 of the stage brief): owner/manager assign (1-2),
 * technician/customer/professional forbidden (3-5), cross-business
 * technician (6), inactive technician (7), non-technician id (8),
 * foreign job (9), marketplace job (10), persistence (11),
 * reassignment (12), technician list own jobs (13), isolation
 * between technicians (14), open own job (15), cannot open another
 * technician's job (16), unrelated business job (17),
 * assignment/history recording (18), 7B regression (19),
 * marketplace regression (20).
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { MemoryUserRepository } from '../src/modules/auth/memory-user.repository';
import { MemoryRefreshStore } from '../src/modules/auth/refresh.store';
import { MemoryMarketplaceStore } from '../src/modules/marketplace/memory-marketplace.store';
import { MemoryJobsStore } from '../src/modules/jobs/memory-jobs.store';
import { MemoryBusinessStore } from '../src/modules/business/memory-business.store';
import { hashPassword } from '../src/utils/password';

interface TestContext {
  app: Express;
  users: MemoryUserRepository;
  business: MemoryBusinessStore;
}

function buildApp(): TestContext {
  const users = new MemoryUserRepository();
  const business = new MemoryBusinessStore();
  const app = createApp({
    users,
    refreshStore: new MemoryRefreshStore(),
    marketplace: new MemoryMarketplaceStore(),
    jobs: new MemoryJobsStore(),
    business,
  });
  return { app, users, business };
}

const PASSWORD = 'Str0ngPassw0rd!';

async function provisionUser(
  ctx: TestContext,
  email: string,
  roles: string[],
): Promise<{ token: string; userId: string }> {
  const created = await ctx.users.create({ email, phone: null, passwordHash: await hashPassword(PASSWORD) });
  await ctx.users.setRoles(created.id, roles);
  await ctx.users.setStatus(created.id, 'ACTIVE');
  const login = await request(ctx.app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  assert.equal(login.status, 200, `login failed for ${email}: ${JSON.stringify(login.body)}`);
  return { token: login.body.data.accessToken as string, userId: login.body.data.user.id as string };
}

async function setupBusinesses(ctx: TestContext): Promise<{
  ownerToken: string;
  ownerId: string;
  businessId: string;
  managerToken: string;
  managerId: string;
  ownerBToken: string;
  businessBId: string;
}> {
  const owner = await provisionUser(ctx, 'thabo.maseko@example.co.za', ['BUSINESS_OWNER']);
  const business = ctx.business.seedBusiness({
    ownerUserId: owner.userId,
    businessName: 'Ubuntu Plumbing Co.',
    slug: 'ubuntu-plumbing-co',
  });
  const manager = await provisionUser(ctx, 'lerato.khumalo@example.co.za', ['BUSINESS_MANAGER']);
  ctx.business.addMembership(business.id, manager.userId, 'BUSINESS_MANAGER');
  const ownerB = await provisionUser(ctx, 'david.naidoo@example.co.za', ['BUSINESS_OWNER']);
  const businessB = ctx.business.seedBusiness({
    ownerUserId: ownerB.userId,
    businessName: 'Cape Spark Electrical',
    slug: 'cape-spark-electrical',
  });
  return {
    ownerToken: owner.token,
    ownerId: owner.userId,
    businessId: business.id,
    managerToken: manager.token,
    managerId: manager.userId,
    ownerBToken: ownerB.token,
    businessBId: businessB.id,
  };
}

let customerSeq = 0;
function validCustomer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  customerSeq += 1;
  return {
    firstName: 'Naledi',
    lastName: 'Dlamini',
    email: `naledi.assign.${customerSeq}@example.co.za`,
    phone: '+27825550111',
    ...overrides,
  };
}

function validJob(customerId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    customerId,
    serviceId: '1',
    description: 'Geyser is leaking from the pressure valve and the drip tray is overflowing.',
    address: '12 Protea Street, Randburg',
    priority: 'HIGH',
    ...overrides,
  };
}

async function createCustomer(ctx: TestContext, token: string): Promise<Record<string, unknown>> {
  const res = await request(ctx.app)
    .post('/api/v1/business/customers')
    .set('Authorization', `Bearer ${token}`)
    .send(validCustomer());
  assert.equal(res.status, 201, `customer creation failed: ${JSON.stringify(res.body)}`);
  return res.body.data as Record<string, unknown>;
}

async function createInternalJob(
  ctx: TestContext,
  token: string,
  customerId: string,
): Promise<Record<string, unknown>> {
  const res = await request(ctx.app)
    .post('/api/v1/business/jobs')
    .set('Authorization', `Bearer ${token}`)
    .send(validJob(customerId));
  assert.equal(res.status, 201, `internal job creation failed: ${JSON.stringify(res.body)}`);
  return res.body.data as Record<string, unknown>;
}

let techSeq = 0;
async function inviteTechnician(
  ctx: TestContext,
  token: string,
  email?: string,
): Promise<{ technician: Record<string, unknown>; token: string; userId: string }> {
  techSeq += 1;
  const address = email ?? `tech.assign.${techSeq}@example.co.za`;
  const invite = await request(ctx.app)
    .post('/api/v1/business/technicians')
    .set('Authorization', `Bearer ${token}`)
    .send({ displayName: `Tech ${techSeq}`, email: address, password: 'TechPass123!' });
  assert.equal(invite.status, 201, `technician invite failed: ${JSON.stringify(invite.body)}`);
  const technician = invite.body.data as Record<string, unknown>;
  const login = await request(ctx.app).post('/api/v1/auth/login').send({ email: address, password: 'TechPass123!' });
  assert.equal(login.status, 200);
  return {
    technician,
    token: login.body.data.accessToken as string,
    userId: login.body.data.user.id as string,
  };
}

function assertErrorEnvelope(res: { body: unknown }, code: string): void {
  const body = res.body as { success: boolean; error: { code: string; message: string } };
  assert.equal(body.success, false);
  assert.equal(body.error.code, code);
  assert.ok(typeof body.error.message === 'string' && body.error.message.length > 0);
}

describe('Stage 7C — assignment roles', () => {
  let ctx: TestContext;
  let setup: Awaited<ReturnType<typeof setupBusinesses>>;
  beforeEach(async () => {
    ctx = buildApp();
    setup = await setupBusinesses(ctx);
  });

  it('1. business owner can assign a technician', async () => {
    const customer = await createCustomer(ctx, setup.ownerToken);
    const job = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const tech = await inviteTechnician(ctx, setup.ownerToken);
    const res = await request(ctx.app)
      .post(`/api/v1/business/jobs/${job['id']}/assign`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({ technicianId: tech.technician['id'] });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.jobId, job['id']);
    assert.equal(res.body.data.technician.id, tech.technician['id']);
  });

  it('2. business manager can assign a technician', async () => {
    const customer = await createCustomer(ctx, setup.ownerToken);
    const job = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const tech = await inviteTechnician(ctx, setup.ownerToken);
    const res = await request(ctx.app)
      .post(`/api/v1/business/jobs/${job['id']}/assign`)
      .set('Authorization', `Bearer ${setup.managerToken}`)
      .send({ technicianId: tech.technician['id'] });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.technician.id, tech.technician['id']);
  });

  it('3. technician cannot assign jobs (403)', async () => {
    const customer = await createCustomer(ctx, setup.ownerToken);
    const job = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const tech = await inviteTechnician(ctx, setup.ownerToken);
    const res = await request(ctx.app)
      .post(`/api/v1/business/jobs/${job['id']}/assign`)
      .set('Authorization', `Bearer ${tech.token}`)
      .send({ technicianId: tech.technician['id'] });
    assert.equal(res.status, 403);
    assertErrorEnvelope(res, 'FORBIDDEN_ROLE');
  });

  it('4. customer cannot assign jobs (403)', async () => {
    const customerUser = await provisionUser(ctx, 'naledi.customer@example.co.za', ['CUSTOMER']);
    const customer = await createCustomer(ctx, setup.ownerToken);
    const job = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const tech = await inviteTechnician(ctx, setup.ownerToken);
    const res = await request(ctx.app)
      .post(`/api/v1/business/jobs/${job['id']}/assign`)
      .set('Authorization', `Bearer ${customerUser.token}`)
      .send({ technicianId: tech.technician['id'] });
    assert.equal(res.status, 403);
    assertErrorEnvelope(res, 'FORBIDDEN_ROLE');
  });

  it('5. professional cannot assign internal jobs (403)', async () => {
    const pro = await provisionUser(ctx, 'sipho.pro@example.co.za', ['PROFESSIONAL']);
    const customer = await createCustomer(ctx, setup.ownerToken);
    const job = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const tech = await inviteTechnician(ctx, setup.ownerToken);
    const res = await request(ctx.app)
      .post(`/api/v1/business/jobs/${job['id']}/assign`)
      .set('Authorization', `Bearer ${pro.token}`)
      .send({ technicianId: tech.technician['id'] });
    assert.equal(res.status, 403);
    assertErrorEnvelope(res, 'FORBIDDEN_ROLE');
  });

  it('6. cross-business technician cannot be assigned (404, no leak)', async () => {
    const customer = await createCustomer(ctx, setup.ownerToken);
    const job = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const techB = await inviteTechnician(ctx, setup.ownerBToken);
    const res = await request(ctx.app)
      .post(`/api/v1/business/jobs/${job['id']}/assign`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({ technicianId: techB.technician['id'] });
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
  });

  it('7. inactive technician cannot be assigned (422)', async () => {
    const customer = await createCustomer(ctx, setup.ownerToken);
    const job = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const tech = await inviteTechnician(ctx, setup.ownerToken);
    const deactivated = await request(ctx.app)
      .patch(`/api/v1/business/technicians/${tech.technician['id']}`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({ isActive: false });
    assert.equal(deactivated.status, 200);
    const res = await request(ctx.app)
      .post(`/api/v1/business/jobs/${job['id']}/assign`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({ technicianId: tech.technician['id'] });
    assert.equal(res.status, 422);
    assertErrorEnvelope(res, 'VALIDATION_ERROR');
  });

  it('8. non-technician id cannot be assigned (404)', async () => {
    const customer = await createCustomer(ctx, setup.ownerToken);
    const job = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const res = await request(ctx.app)
      .post(`/api/v1/business/jobs/${job['id']}/assign`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({ technicianId: '999999' });
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
  });

  it('9. job from another business cannot be assigned (404, no leak)', async () => {
    const customerB = await createCustomer(ctx, setup.ownerBToken);
    const jobB = await createInternalJob(ctx, setup.ownerBToken, customerB['id'] as string);
    const tech = await inviteTechnician(ctx, setup.ownerToken);
    const res = await request(ctx.app)
      .post(`/api/v1/business/jobs/${jobB['id']}/assign`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({ technicianId: tech.technician['id'] });
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
  });

  it('10. marketplace job cannot be assigned through internal assignment (404)', async () => {
    const customerUser = await provisionUser(ctx, 'mp.customer@example.co.za', ['CUSTOMER']);
    const created = await request(ctx.app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${customerUser.token}`)
      .send({
        providerId: 'professional-1',
        serviceId: '1',
        description: 'Marketplace geyser repair needed urgently at my home in Randburg area.',
        location: '12 Protea Street, Randburg',
      });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const tech = await inviteTechnician(ctx, setup.ownerToken);
    const res = await request(ctx.app)
      .post(`/api/v1/business/jobs/${created.body.data.id}/assign`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({ technicianId: tech.technician['id'] });
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
  });
});

describe('Stage 7C — persistence, reassignment, history', () => {
  let ctx: TestContext;
  let setup: Awaited<ReturnType<typeof setupBusinesses>>;
  beforeEach(async () => {
    ctx = buildApp();
    setup = await setupBusinesses(ctx);
  });

  it('11+18. assignment is persisted and history recorded', async () => {
    const customer = await createCustomer(ctx, setup.ownerToken);
    const job = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const tech = await inviteTechnician(ctx, setup.ownerToken);
    const assigned = await request(ctx.app)
      .post(`/api/v1/business/jobs/${job['id']}/assign`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({ technicianId: tech.technician['id'] });
    assert.equal(assigned.status, 200);
    const fetched = await request(ctx.app)
      .get(`/api/v1/business/jobs/${job['id']}/assignment`)
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal(fetched.status, 200, JSON.stringify(fetched.body));
    assert.equal(fetched.body.data.assignment.technician.id, tech.technician['id']);
    assert.equal(fetched.body.data.history.length, 1);
    assert.equal(fetched.body.data.history[0].isActive, true);
    // Job status itself is untouched by assignment (no ASSIGNED status).
    const detail = await request(ctx.app)
      .get(`/api/v1/business/jobs/${job['id']}`)
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.job.status, 'REQUESTED');
  });

  it('12+18. reassignment works and preserves history via PATCH alias', async () => {
    const customer = await createCustomer(ctx, setup.ownerToken);
    const job = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const techA = await inviteTechnician(ctx, setup.ownerToken);
    const techB = await inviteTechnician(ctx, setup.ownerToken);
    const first = await request(ctx.app)
      .post(`/api/v1/business/jobs/${job['id']}/assign`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({ technicianId: techA.technician['id'] });
    assert.equal(first.status, 200);
    const second = await request(ctx.app)
      .patch(`/api/v1/business/jobs/${job['id']}/assignment`)
      .set('Authorization', `Bearer ${setup.managerToken}`)
      .send({ technicianId: techB.technician['id'] });
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(second.body.data.technician.id, techB.technician['id']);
    const fetched = await request(ctx.app)
      .get(`/api/v1/business/jobs/${job['id']}/assignment`)
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.data.assignment.technician.id, techB.technician['id']);
    assert.equal(fetched.body.data.history.length, 2);
    const inactive = fetched.body.data.history.filter((h: { isActive: boolean }) => !h.isActive);
    const active = fetched.body.data.history.filter((h: { isActive: boolean }) => h.isActive);
    assert.equal(inactive.length, 1);
    assert.equal(active.length, 1);
    assert.equal(inactive[0].technician.id, techA.technician['id']);
  });
});

describe('Stage 7C — technician My Jobs', () => {
  let ctx: TestContext;
  let setup: Awaited<ReturnType<typeof setupBusinesses>>;
  beforeEach(async () => {
    ctx = buildApp();
    setup = await setupBusinesses(ctx);
  });

  it('13. technician can list own assigned jobs', async () => {
    const customer = await createCustomer(ctx, setup.ownerToken);
    const job = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const tech = await inviteTechnician(ctx, setup.ownerToken);
    await request(ctx.app)
      .post(`/api/v1/business/jobs/${job['id']}/assign`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({ technicianId: tech.technician['id'] });
    const listed = await request(ctx.app)
      .get('/api/v1/technician/jobs')
      .set('Authorization', `Bearer ${tech.token}`);
    assert.equal(listed.status, 200, JSON.stringify(listed.body));
    assert.equal(listed.body.data.total, 1);
    assert.equal(listed.body.data.items[0].id, job['id']);
    assert.equal(listed.body.data.items[0].source, 'INTERNAL');
  });

  it('14. technician cannot list another technician\u2019s jobs', async () => {
    const customer = await createCustomer(ctx, setup.ownerToken);
    const job = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const techA = await inviteTechnician(ctx, setup.ownerToken);
    const techB = await inviteTechnician(ctx, setup.ownerToken);
    await request(ctx.app)
      .post(`/api/v1/business/jobs/${job['id']}/assign`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({ technicianId: techA.technician['id'] });
    const listedB = await request(ctx.app)
      .get('/api/v1/technician/jobs')
      .set('Authorization', `Bearer ${techB.token}`);
    assert.equal(listedB.status, 200);
    assert.equal(listedB.body.data.total, 0);
    assert.deepEqual(listedB.body.data.items, []);
  });

  it('15. technician can open own assigned job', async () => {
    const customer = await createCustomer(ctx, setup.ownerToken);
    const job = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const tech = await inviteTechnician(ctx, setup.ownerToken);
    await request(ctx.app)
      .post(`/api/v1/business/jobs/${job['id']}/assign`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({ technicianId: tech.technician['id'] });
    const detail = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${job['id']}`)
      .set('Authorization', `Bearer ${tech.token}`);
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    assert.equal(detail.body.data.job.id, job['id']);
    assert.ok(Array.isArray(detail.body.data.timeline));
  });

  it('16. technician cannot open another technician\u2019s job (404)', async () => {
    const customer = await createCustomer(ctx, setup.ownerToken);
    const job = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const techA = await inviteTechnician(ctx, setup.ownerToken);
    const techB = await inviteTechnician(ctx, setup.ownerToken);
    await request(ctx.app)
      .post(`/api/v1/business/jobs/${job['id']}/assign`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({ technicianId: techA.technician['id'] });
    const res = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${job['id']}`)
      .set('Authorization', `Bearer ${techB.token}`);
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
  });

  it('17. technician cannot access an unrelated business job (404)', async () => {
    const customerB = await createCustomer(ctx, setup.ownerBToken);
    const jobB = await createInternalJob(ctx, setup.ownerBToken, customerB['id'] as string);
    const techB = await inviteTechnician(ctx, setup.ownerBToken);
    await request(ctx.app)
      .post(`/api/v1/business/jobs/${jobB['id']}/assign`)
      .set('Authorization', `Bearer ${setup.ownerBToken}`)
      .send({ technicianId: techB.technician['id'] });
    const techA = await inviteTechnician(ctx, setup.ownerToken);
    const res = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${jobB['id']}`)
      .set('Authorization', `Bearer ${techA.token}`);
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
    const listed = await request(ctx.app)
      .get('/api/v1/technician/jobs')
      .set('Authorization', `Bearer ${techA.token}`);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.data.total, 0);
  });

  it('technician My Jobs rejects other roles (403) and anonymous (401)', async () => {
    const customerUser = await provisionUser(ctx, 'other.customer@example.co.za', ['CUSTOMER']);
    const listCustomer = await request(ctx.app)
      .get('/api/v1/technician/jobs')
      .set('Authorization', `Bearer ${customerUser.token}`);
    assert.equal(listCustomer.status, 403);
    const listManager = await request(ctx.app)
      .get('/api/v1/technician/jobs')
      .set('Authorization', `Bearer ${setup.managerToken}`);
    assert.equal(listManager.status, 403);
    const anon = await request(ctx.app).get('/api/v1/technician/jobs');
    assert.equal(anon.status, 401);
    const anonAssign = await request(ctx.app).post('/api/v1/business/jobs/1/assign').send({ technicianId: '1' });
    assert.equal(anonAssign.status, 401);
  });
});

describe('Stage 7C — regressions', () => {
  let ctx: TestContext;
  let setup: Awaited<ReturnType<typeof setupBusinesses>>;
  beforeEach(async () => {
    ctx = buildApp();
    setup = await setupBusinesses(ctx);
  });

  it('19. existing Stage 7B behaviour remains passing', async () => {
    const customer = await createCustomer(ctx, setup.ownerToken);
    const job = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const listed = await request(ctx.app)
      .get('/api/v1/business/jobs')
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal(listed.status, 200);
    assert.ok(listed.body.data.total >= 1);
    const detail = await request(ctx.app)
      .get(`/api/v1/business/jobs/${job['id']}`)
      .set('Authorization', `Bearer ${setup.managerToken}`);
    assert.equal(detail.status, 200);
    const summary = await request(ctx.app)
      .get('/api/v1/business/jobs-summary')
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal(summary.status, 200);
    assert.equal(summary.body.data.total >= 1, true);
    const cancelled = await request(ctx.app)
      .post(`/api/v1/business/jobs/${job['id']}/cancel`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({});
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.data.status, 'CANCELLED');
  });

  it('20. marketplace job behaviour remains unchanged', async () => {
    const customerUser = await provisionUser(ctx, 'regression.customer@example.co.za', ['CUSTOMER']);
    const created = await request(ctx.app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${customerUser.token}`)
      .send({
        providerId: 'professional-1',
        serviceId: '1',
        description: 'Marketplace regression check for geyser repair work at home.',
        location: '12 Protea Street, Randburg',
      });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.source, 'MARKETPLACE');
    assert.equal(created.body.data.status, 'REQUESTED');
    const listed = await request(ctx.app)
      .get('/api/v1/business/jobs')
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.data.total, 0);
  });
});
