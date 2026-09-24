/**
 * FixLink Stage 7B — internal business jobs + business-managed customers tests.
 *
 * Run: npm test (no MySQL required — uses the in-memory business store
 * with the same rules as the MySQL implementation, plus the shared
 * in-memory jobs store for service validation and marketplace
 * regression).
 *
 * Covers (§17 of the stage brief): unauthenticated rejection (401),
 * role gating for customer/professional/technician/admin (403),
 * business-customer CRUD with business isolation (404, never 403),
 * internal-job creation (`source = INTERNAL`, `status = REQUESTED`,
 * correct business), customer/service validation, invalid payloads
 * (400/422), internal listing (INTERNAL only — marketplace rows never
 * appear), cross-business isolation, detail with customer/service +
 * status-history timeline, server-controlled status (PATCH `status`
 * rejected), eligible/ineligible cancellation, pagination and
 * filtering, plus a marketplace regression guard.
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

/** Provision a user with exact roles (ACTIVE) and return auth credentials. */
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

/** Owner + business, manager, and a second isolated business. */
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
    email: `naledi.dlamini.${customerSeq}@example.co.za`,
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

async function createCustomer(ctx: TestContext, token: string, overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const res = await request(ctx.app)
    .post('/api/v1/business/customers')
    .set('Authorization', `Bearer ${token}`)
    .send(validCustomer(overrides));
  assert.equal(res.status, 201, `customer creation failed: ${JSON.stringify(res.body)}`);
  return res.body.data as Record<string, unknown>;
}

async function createInternalJob(
  ctx: TestContext,
  token: string,
  customerId: string,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const res = await request(ctx.app)
    .post('/api/v1/business/jobs')
    .set('Authorization', `Bearer ${token}`)
    .send(validJob(customerId, overrides));
  assert.equal(res.status, 201, `internal job creation failed: ${JSON.stringify(res.body)}`);
  return res.body.data as Record<string, unknown>;
}

async function inviteTechnician(ctx: TestContext, token: string, email: string): Promise<string> {
  const invite = await request(ctx.app)
    .post('/api/v1/business/technicians')
    .set('Authorization', `Bearer ${token}`)
    .send({ displayName: 'Bongani Zulu', email, password: 'TechPass123!' });
  assert.equal(invite.status, 201, `technician invite failed: ${JSON.stringify(invite.body)}`);
  const login = await request(ctx.app).post('/api/v1/auth/login').send({ email, password: 'TechPass123!' });
  assert.equal(login.status, 200);
  return login.body.data.accessToken as string;
}

function assertErrorEnvelope(res: { body: unknown }, code: string): void {
  const body = res.body as { success: boolean; error: { code: string; message: string } };
  assert.equal(body.success, false);
  assert.equal(body.error.code, code);
  assert.ok(typeof body.error.message === 'string' && body.error.message.length > 0);
}

function assertSuccessEnvelope(res: { body: unknown }): void {
  const body = res.body as { success: boolean; data: unknown; message: string };
  assert.equal(body.success, true);
  assert.ok(body.data !== undefined);
  assert.ok(typeof body.message === 'string');
}

describe('Stage 7B — authentication', () => {
  let ctx: TestContext;
  beforeEach(() => {
    ctx = buildApp();
  });

  it('1. unauthenticated business customer requests are rejected (401)', async () => {
    for (const [method, path] of [
      ['get', '/api/v1/business/customers'],
      ['post', '/api/v1/business/customers'],
      ['get', '/api/v1/business/customers/1'],
      ['patch', '/api/v1/business/customers/1'],
    ] as const) {
      const res = await request(ctx.app)[method](path).send({});
      assert.equal(res.status, 401, `${method} ${path}`);
      assertErrorEnvelope(res, 'UNAUTHORIZED');
    }
  });

  it('2. unauthenticated business job requests are rejected (401)', async () => {
    for (const [method, path] of [
      ['get', '/api/v1/business/jobs'],
      ['post', '/api/v1/business/jobs'],
      ['get', '/api/v1/business/jobs/1'],
      ['patch', '/api/v1/business/jobs/1'],
      ['post', '/api/v1/business/jobs/1/cancel'],
      ['get', '/api/v1/business/jobs-summary'],
    ] as const) {
      const res = await request(ctx.app)[method](path).send({});
      assert.equal(res.status, 401, `${method} ${path}`);
      assertErrorEnvelope(res, 'UNAUTHORIZED');
    }
  });
});

describe('Stage 7B — role gating', () => {
  let ctx: TestContext;
  let setup: Awaited<ReturnType<typeof setupBusinesses>>;
  beforeEach(async () => {
    ctx = buildApp();
    setup = await setupBusinesses(ctx);
  });

  it('3. customer cannot manage business customers (403)', async () => {
    const customer = await provisionUser(ctx, 'naledi.dlamini@example.co.za', ['CUSTOMER']);
    const create = await request(ctx.app)
      .post('/api/v1/business/customers')
      .set('Authorization', `Bearer ${customer.token}`)
      .send(validCustomer());
    assert.equal(create.status, 403);
    assertErrorEnvelope(create, 'FORBIDDEN_ROLE');
    const list = await request(ctx.app)
      .get('/api/v1/business/customers')
      .set('Authorization', `Bearer ${customer.token}`);
    assert.equal(list.status, 403);
    assertErrorEnvelope(list, 'FORBIDDEN_ROLE');
    const jobs = await request(ctx.app)
      .get('/api/v1/business/jobs')
      .set('Authorization', `Bearer ${customer.token}`);
    assert.equal(jobs.status, 403);
    assertErrorEnvelope(jobs, 'FORBIDDEN_ROLE');
  });

  it('4. professional cannot manage business customers or internal jobs (403)', async () => {
    const pro = await provisionUser(ctx, 'sipho.ndlovu@example.co.za', ['PROFESSIONAL']);
    const create = await request(ctx.app)
      .post('/api/v1/business/customers')
      .set('Authorization', `Bearer ${pro.token}`)
      .send(validCustomer());
    assert.equal(create.status, 403);
    assertErrorEnvelope(create, 'FORBIDDEN_ROLE');
    const jobs = await request(ctx.app)
      .post('/api/v1/business/jobs')
      .set('Authorization', `Bearer ${pro.token}`)
      .send(validJob('1'));
    assert.equal(jobs.status, 403);
    assertErrorEnvelope(jobs, 'FORBIDDEN_ROLE');
  });

  it('5/32. technician cannot create, list or cancel internal jobs (403)', async () => {
    const techToken = await inviteTechnician(ctx, setup.ownerToken, 'bongani.zulu@example.co.za');
    const customer = await createCustomer(ctx, setup.ownerToken);
    const create = await request(ctx.app)
      .post('/api/v1/business/jobs')
      .set('Authorization', `Bearer ${techToken}`)
      .send(validJob(customer['id'] as string));
    assert.equal(create.status, 403);
    assertErrorEnvelope(create, 'FORBIDDEN_ROLE');
    const list = await request(ctx.app).get('/api/v1/business/jobs').set('Authorization', `Bearer ${techToken}`);
    assert.equal(list.status, 403);
    assertErrorEnvelope(list, 'FORBIDDEN_ROLE');
    const job = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const cancel = await request(ctx.app)
      .post(`/api/v1/business/jobs/${job['id']}/cancel`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({});
    assert.equal(cancel.status, 403);
    assertErrorEnvelope(cancel, 'FORBIDDEN_ROLE');
    const manage = await request(ctx.app)
      .post('/api/v1/business/customers')
      .set('Authorization', `Bearer ${techToken}`)
      .send(validCustomer());
    assert.equal(manage.status, 403);
    assertErrorEnvelope(manage, 'FORBIDDEN_ROLE');
  });

  it('admin has no business-customer or internal-job identity (403)', async () => {
    const admin = await provisionUser(ctx, 'admin@fixlink.example.co.za', ['ADMIN']);
    const customers = await request(ctx.app)
      .get('/api/v1/business/customers')
      .set('Authorization', `Bearer ${admin.token}`);
    assert.equal(customers.status, 403);
    assertErrorEnvelope(customers, 'FORBIDDEN_ROLE');
    const jobs = await request(ctx.app).get('/api/v1/business/jobs').set('Authorization', `Bearer ${admin.token}`);
    assert.equal(jobs.status, 403);
    assertErrorEnvelope(jobs, 'FORBIDDEN_ROLE');
  });
});

describe('Stage 7B — business customers', () => {
  let ctx: TestContext;
  let setup: Awaited<ReturnType<typeof setupBusinesses>>;
  beforeEach(async () => {
    ctx = buildApp();
    setup = await setupBusinesses(ctx);
  });

  it('6. owner can create a business customer (201, private to the business)', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/business/customers')
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send(validCustomer());
    assert.equal(res.status, 201);
    assertSuccessEnvelope(res);
    const customer = res.body.data as Record<string, unknown>;
    assert.ok(customer['id']);
    assert.equal(customer['businessId'], setup.businessId);
    assert.equal(customer['firstName'], 'Naledi');
    assert.equal(customer['lastName'], 'Dlamini');
    assert.equal(customer['displayName'], 'Naledi Dlamini');
    assert.ok(!('user_id' in customer) && !('userId' in customer));
    assert.ok(!('business_id' in customer && typeof customer['business_id'] === 'string' && customer['business_id'] !== setup.businessId));
  });

  it('7. manager can create a business customer (201)', async () => {
    const customer = await createCustomer(ctx, setup.managerToken);
    assert.equal(customer['businessId'], setup.businessId);
  });

  it('8/9. owner and manager list only their own customers', async () => {
    await createCustomer(ctx, setup.ownerToken, { firstName: 'Naledi' });
    await createCustomer(ctx, setup.managerToken, { firstName: 'Pieter', email: 'pieter.vdm@example.co.za' });
    await createCustomer(ctx, setup.ownerBToken, { firstName: 'Ayesha', email: 'ayesha.khan@example.co.za' });

    const ownerList = await request(ctx.app)
      .get('/api/v1/business/customers')
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal(ownerList.status, 200);
    assertSuccessEnvelope(ownerList);
    const ownerData = ownerList.body.data as { items: Array<Record<string, unknown>>; total: number; page: number; pageSize: number };
    assert.equal(ownerData.total, 2);
    assert.equal(ownerData.page, 1);

    const managerList = await request(ctx.app)
      .get('/api/v1/business/customers')
      .set('Authorization', `Bearer ${setup.managerToken}`);
    assert.equal(managerList.status, 200);
    assert.equal((managerList.body.data as { total: number }).total, 2);

    const otherList = await request(ctx.app)
      .get('/api/v1/business/customers')
      .set('Authorization', `Bearer ${setup.ownerBToken}`);
    assert.equal((otherList.body.data as { total: number }).total, 1);
  });

  it('10. customer update works (PATCH) and spoofed business ids are ignored', async () => {
    const customer = await createCustomer(ctx, setup.ownerToken);
    const id = customer['id'] as string;
    const res = await request(ctx.app)
      .patch(`/api/v1/business/customers/${id}`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({ phone: '+27825550222', business_id: '999', businessId: '999' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assertSuccessEnvelope(res);
    assert.equal((res.body.data as Record<string, unknown>)['phone'], '+27825550222');
    assert.equal((res.body.data as Record<string, unknown>)['businessId'], setup.businessId);
  });

  it('11. invalid customer data is rejected (422)', async () => {
    const cases: Record<string, unknown>[] = [
      {},
      { firstName: '', lastName: 'Dlamini' },
      { firstName: 'Naledi' },
      { firstName: 'Naledi', lastName: 'Dlamini', email: 'not-an-email' },
      { firstName: 'Naledi', lastName: 'Dlamini', phone: 'abc' },
      { firstName: 'Naledi', lastName: 'Dlamini', preferredContact: 'SMS' },
    ];
    for (const [index, body] of cases.entries()) {
      const res = await request(ctx.app)
        .post('/api/v1/business/customers')
        .set('Authorization', `Bearer ${setup.ownerToken}`)
        .send(body);
      assert.equal(res.status, 422, `case ${index}: ${JSON.stringify(res.body)}`);
      assertErrorEnvelope(res, 'VALIDATION_ERROR');
    }
    const customer = await createCustomer(ctx, setup.ownerToken);
    const emptyPatch = await request(ctx.app)
      .patch(`/api/v1/business/customers/${customer['id']}`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({});
    assert.equal(emptyPatch.status, 422);
    assertErrorEnvelope(emptyPatch, 'VALIDATION_ERROR');
  });

  it('12. cross-business customer access reads as 404 (no probing)', async () => {
    const customerB = await createCustomer(ctx, setup.ownerBToken);
    const idB = customerB['id'] as string;
    for (const token of [setup.ownerToken, setup.managerToken]) {
      const get = await request(ctx.app)
        .get(`/api/v1/business/customers/${idB}`)
        .set('Authorization', `Bearer ${token}`);
      assert.equal(get.status, 404);
      assertErrorEnvelope(get, 'NOT_FOUND');
      const patch = await request(ctx.app)
        .patch(`/api/v1/business/customers/${idB}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ phone: '+27825550333' });
      assert.equal(patch.status, 404);
      assertErrorEnvelope(patch, 'NOT_FOUND');
    }
  });

  it('13. unknown and malformed customer ids are handled correctly', async () => {
    const unknown = await request(ctx.app)
      .get('/api/v1/business/customers/99999')
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal(unknown.status, 404);
    assertErrorEnvelope(unknown, 'NOT_FOUND');
    for (const badId of ['abc', '0', '-4']) {
      const res = await request(ctx.app)
        .get(`/api/v1/business/customers/${encodeURIComponent(badId)}`)
        .set('Authorization', `Bearer ${setup.ownerToken}`);
      assert.equal(res.status, 400, `GET ${badId}`);
      assertErrorEnvelope(res, 'VALIDATION_ERROR');
    }
  });
});

describe('Stage 7B — internal jobs', () => {
  let ctx: TestContext;
  let setup: Awaited<ReturnType<typeof setupBusinesses>>;
  let customerId: string;
  beforeEach(async () => {
    ctx = buildApp();
    setup = await setupBusinesses(ctx);
    const customer = await createCustomer(ctx, setup.ownerToken);
    customerId = customer['id'] as string;
  });

  it('14/15. owner and manager can create an internal job (201)', async () => {
    const ownerJob = await createInternalJob(ctx, setup.ownerToken, customerId);
    assert.ok(ownerJob['id']);
    assert.ok(ownerJob['reference']);
    const managerCustomer = await createCustomer(ctx, setup.managerToken);
    const managerJob = await createInternalJob(ctx, setup.managerToken, managerCustomer['id'] as string);
    assert.ok(managerJob['id']);
  });

  it('16/17/18. job source is INTERNAL, initial status REQUESTED, correct business', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/business/jobs')
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({ ...validJob(customerId), business_id: '999', businessId: '999', status: 'COMPLETED', source: 'MARKETPLACE' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assertSuccessEnvelope(res);
    const job = res.body.data as Record<string, unknown>;
    assert.equal(job['source'], 'INTERNAL');
    assert.equal(job['status'], 'REQUESTED');
    assert.equal(job['businessId'], setup.businessId);
    assert.equal((job['business'] as Record<string, unknown>)['id'], setup.businessId);
    assert.equal(job['customerId'], customerId);
    assert.equal(job['priority'], 'HIGH');
  });

  it('19. job requires a valid customer (unknown → 404, malformed → 400)', async () => {
    const unknown = await request(ctx.app)
      .post('/api/v1/business/jobs')
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send(validJob('99999'));
    assert.equal(unknown.status, 404);
    assertErrorEnvelope(unknown, 'NOT_FOUND');
    const malformed = await request(ctx.app)
      .post('/api/v1/business/jobs')
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send(validJob('abc'));
    assert.equal(malformed.status, 400);
    assertErrorEnvelope(malformed, 'VALIDATION_ERROR');
  });

  it('20. a customer from another business is rejected (404)', async () => {
    const foreign = await createCustomer(ctx, setup.ownerBToken);
    const res = await request(ctx.app)
      .post('/api/v1/business/jobs')
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send(validJob(foreign['id'] as string));
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
  });

  it('21. service validation (unknown → 404, malformed → 400)', async () => {
    const unknown = await request(ctx.app)
      .post('/api/v1/business/jobs')
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send(validJob(customerId, { serviceId: '99999' }));
    assert.equal(unknown.status, 404);
    assertErrorEnvelope(unknown, 'NOT_FOUND');
    const malformed = await request(ctx.app)
      .post('/api/v1/business/jobs')
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send(validJob(customerId, { serviceId: 'abc' }));
    assert.equal(malformed.status, 400);
    assertErrorEnvelope(malformed, 'VALIDATION_ERROR');
  });

  it('22. invalid job data is rejected (422)', async () => {
    const cases: Record<string, unknown>[] = [
      validJob(customerId, { description: 'Too short' }),
      validJob(customerId, { description: undefined, address: undefined }),
      { ...validJob(customerId), address: '' },
      validJob(customerId, { priority: 'EXTREME' }),
      validJob(customerId, { preferredDate: '2026-13-40' }),
      validJob(customerId, { scheduledAt: 'not-a-date' }),
    ];
    for (const [index, body] of cases.entries()) {
      const res = await request(ctx.app)
        .post('/api/v1/business/jobs')
        .set('Authorization', `Bearer ${setup.ownerToken}`)
        .send(body);
      assert.equal(res.status, 422, `case ${index}: ${JSON.stringify(res.body)}`);
      assertErrorEnvelope(res, 'VALIDATION_ERROR');
    }
  });

  it('23/24. owner and manager list internal jobs (INTERNAL only)', async () => {
    await createInternalJob(ctx, setup.ownerToken, customerId);
    const managerCustomer = await createCustomer(ctx, setup.managerToken);
    await createInternalJob(ctx, setup.managerToken, managerCustomer['id'] as string);

    const ownerList = await request(ctx.app)
      .get('/api/v1/business/jobs')
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal(ownerList.status, 200);
    assertSuccessEnvelope(ownerList);
    const ownerData = ownerList.body.data as { items: Array<Record<string, unknown>>; total: number; page: number; pageSize: number };
    assert.equal(ownerData.total, 2);
    for (const item of ownerData.items) {
      assert.equal(item['source'], 'INTERNAL');
      assert.equal(item['businessId'], setup.businessId);
    }

    const managerList = await request(ctx.app)
      .get('/api/v1/business/jobs')
      .set('Authorization', `Bearer ${setup.managerToken}`);
    assert.equal((managerList.body.data as { total: number }).total, 2);

    const otherList = await request(ctx.app)
      .get('/api/v1/business/jobs')
      .set('Authorization', `Bearer ${setup.ownerBToken}`);
    assert.equal((otherList.body.data as { total: number }).total, 0);
  });

  it('25. marketplace jobs do not appear in the internal business job list', async () => {
    const customer = await provisionUser(ctx, 'marketplace.shopper@example.co.za', ['CUSTOMER']);
    const marketplaceJob = await request(ctx.app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        providerId: 'professional-1',
        serviceId: '1',
        description: 'Kitchen mixer tap leaking at the base and the cupboard floor is damp.',
        location: 'Fourways, Johannesburg',
      });
    assert.equal(marketplaceJob.status, 201, JSON.stringify(marketplaceJob.body));
    assert.equal(marketplaceJob.body.data.source, 'MARKETPLACE');

    await createInternalJob(ctx, setup.ownerToken, customerId);
    const list = await request(ctx.app)
      .get('/api/v1/business/jobs')
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    const data = list.body.data as { items: Array<Record<string, unknown>>; total: number };
    assert.equal(data.total, 1);
    assert.ok(data.items.every((item) => item['source'] === 'INTERNAL'));
    // References are globally unique across the shared jobs table; the
    // marketplace reference must not appear here (numeric ids come from
    // separate in-memory sequences in tests — production shares one table).
    assert.ok(data.items.every((item) => item['reference'] !== marketplaceJob.body.data.reference));

    // The marketplace row is never served through the internal detail
    // endpoint: it either reads as 404, or — where the isolated
    // in-memory sequences coincide numerically — the returned row is
    // provably an INTERNAL job (production shares one jobs table, so
    // the numeric id can never coincide there; the `source` filter is
    // what guarantees exclusion in both implementations).
    const detail = await request(ctx.app)
      .get(`/api/v1/business/jobs/${marketplaceJob.body.data.id}`)
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    if (detail.status === 200) {
      const returned = (detail.body.data as { job: Record<string, unknown> }).job;
      assert.equal(returned['source'], 'INTERNAL');
      assert.notEqual(returned['reference'], marketplaceJob.body.data.reference);
    } else {
      assert.equal(detail.status, 404);
      assertErrorEnvelope(detail, 'NOT_FOUND');
    }
  });

  it('26. business A cannot access business B jobs (404, no probing)', async () => {
    const foreignCustomer = await createCustomer(ctx, setup.ownerBToken);
    const foreignJob = await createInternalJob(ctx, setup.ownerBToken, foreignCustomer['id'] as string);
    const idB = foreignJob['id'] as string;
    for (const token of [setup.ownerToken, setup.managerToken]) {
      const get = await request(ctx.app)
        .get(`/api/v1/business/jobs/${idB}`)
        .set('Authorization', `Bearer ${token}`);
      assert.equal(get.status, 404);
      assertErrorEnvelope(get, 'NOT_FOUND');
      const patch = await request(ctx.app)
        .patch(`/api/v1/business/jobs/${idB}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ priority: 'LOW' });
      assert.equal(patch.status, 404);
      assertErrorEnvelope(patch, 'NOT_FOUND');
      const cancel = await request(ctx.app)
        .post(`/api/v1/business/jobs/${idB}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({});
      assert.equal(cancel.status, 404);
      assertErrorEnvelope(cancel, 'NOT_FOUND');
    }
  });

  it('27. job detail returns the correct customer, service, business and timeline', async () => {
    const job = await createInternalJob(ctx, setup.ownerToken, customerId);
    const res = await request(ctx.app)
      .get(`/api/v1/business/jobs/${job['id']}`)
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal(res.status, 200);
    assertSuccessEnvelope(res);
    const detail = res.body.data as {
      job: Record<string, unknown>;
      timeline: Array<Record<string, unknown>>;
    };
    assert.equal(detail.job['id'], job['id']);
    assert.equal(detail.job['source'], 'INTERNAL');
    assert.equal(detail.job['status'], 'REQUESTED');
    assert.equal(detail.job['customerId'], customerId);
    assert.equal((detail.job['customer'] as Record<string, unknown>)['displayName'], 'Naledi Dlamini');
    assert.equal((detail.job['service'] as Record<string, unknown>)['id'], '1');
    assert.ok(typeof (detail.job['service'] as Record<string, unknown>)['name'] === 'string');
    assert.equal((detail.job['business'] as Record<string, unknown>)['id'], setup.businessId);
    assert.equal((detail.job['business'] as Record<string, unknown>)['businessName'], 'Ubuntu Plumbing Co.');
    assert.ok(Array.isArray(detail.timeline));
  });

  it('28. job creation creates status history (REQUESTED entry)', async () => {
    const job = await createInternalJob(ctx, setup.ownerToken, customerId);
    const res = await request(ctx.app)
      .get(`/api/v1/business/jobs/${job['id']}`)
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    const detail = res.body.data as { timeline: Array<Record<string, unknown>> };
    assert.equal(detail.timeline.length, 1);
    assert.equal(detail.timeline[0]?.['previousStatus'], null);
    assert.equal(detail.timeline[0]?.['status'], 'REQUESTED');
    assert.equal(detail.timeline[0]?.['reason'], 'Internal job created by business');
    assert.ok(typeof detail.timeline[0]?.['createdAt'] === 'string');
  });

  it('29. invalid status mutation is rejected (422)', async () => {
    const job = await createInternalJob(ctx, setup.ownerToken, customerId);
    for (const body of [{ status: 'COMPLETED' }, { status: 'IN_PROGRESS' }, { status: 'REQUESTED' }]) {
      const res = await request(ctx.app)
        .patch(`/api/v1/business/jobs/${job['id']}`)
        .set('Authorization', `Bearer ${setup.ownerToken}`)
        .send(body);
      assert.equal(res.status, 422, JSON.stringify(res.body));
      assertErrorEnvelope(res, 'VALIDATION_ERROR');
    }
    const cancelWithStatus = await request(ctx.app)
      .post(`/api/v1/business/jobs/${job['id']}/cancel`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({ status: 'COMPLETED' });
    assert.equal(cancelWithStatus.status, 422);
    assertErrorEnvelope(cancelWithStatus, 'VALIDATION_ERROR');
    // The job is untouched by the bypass attempts.
    const reread = await request(ctx.app)
      .get(`/api/v1/business/jobs/${job['id']}`)
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal((reread.body.data as { job: Record<string, unknown> }).job['status'], 'REQUESTED');
  });

  it('30. eligible cancellation works (REQUESTED → CANCELLED with history)', async () => {
    const job = await createInternalJob(ctx, setup.ownerToken, customerId);
    const res = await request(ctx.app)
      .post(`/api/v1/business/jobs/${job['id']}/cancel`)
      .set('Authorization', `Bearer ${setup.managerToken}`)
      .send({ reason: 'Customer asked to postpone the visit.' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assertSuccessEnvelope(res);
    assert.equal((res.body.data as Record<string, unknown>)['status'], 'CANCELLED');
    const detail = await request(ctx.app)
      .get(`/api/v1/business/jobs/${job['id']}`)
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    const timeline = (detail.body.data as { timeline: Array<Record<string, unknown>> }).timeline;
    assert.equal(timeline.length, 2);
    assert.equal(timeline[1]?.['previousStatus'], 'REQUESTED');
    assert.equal(timeline[1]?.['status'], 'CANCELLED');
  });

  it('31. invalid cancellation is rejected (already cancelled, unknown, malformed)', async () => {
    const job = await createInternalJob(ctx, setup.ownerToken, customerId);
    const first = await request(ctx.app)
      .post(`/api/v1/business/jobs/${job['id']}/cancel`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({});
    assert.equal(first.status, 200);
    const second = await request(ctx.app)
      .post(`/api/v1/business/jobs/${job['id']}/cancel`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({});
    assert.equal(second.status, 422);
    assertErrorEnvelope(second, 'VALIDATION_ERROR');
    const unknown = await request(ctx.app)
      .post('/api/v1/business/jobs/99999/cancel')
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({});
    assert.equal(unknown.status, 404);
    assertErrorEnvelope(unknown, 'NOT_FOUND');
    const malformed = await request(ctx.app)
      .post('/api/v1/business/jobs/abc/cancel')
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({});
    assert.equal(malformed.status, 400);
    assertErrorEnvelope(malformed, 'VALIDATION_ERROR');
  });

  it('33. pagination works on the internal job list', async () => {
    for (let index = 0; index < 3; index += 1) {
      await createInternalJob(ctx, setup.ownerToken, customerId);
    }
    const first = await request(ctx.app)
      .get('/api/v1/business/jobs?page=1&pageSize=2')
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    const firstData = first.body.data as { items: unknown[]; total: number; page: number; pageSize: number };
    assert.equal(firstData.total, 3);
    assert.equal(firstData.items.length, 2);
    assert.equal(firstData.page, 1);
    const second = await request(ctx.app)
      .get('/api/v1/business/jobs?page=2&pageSize=2')
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal((second.body.data as { items: unknown[] }).items.length, 1);
    const bad = await request(ctx.app)
      .get('/api/v1/business/jobs?page=0&pageSize=200')
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal(bad.status, 422);
    assertErrorEnvelope(bad, 'VALIDATION_ERROR');
  });

  it('34. filtering works (status + search)', async () => {
    const one = await createInternalJob(
      ctx,
      setup.ownerToken,
      customerId,
      { description: 'Geyser pressure valve replacement with new copper piping work.' },
    );
    const twoCustomer = await createCustomer(ctx, setup.ownerToken, { firstName: 'Thandi', lastName: 'Mahlangu' });
    await createInternalJob(ctx, setup.ownerToken, twoCustomer['id'] as string);
    await request(ctx.app)
      .post(`/api/v1/business/jobs/${one['id']}/cancel`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({});

    const cancelled = await request(ctx.app)
      .get('/api/v1/business/jobs?status=CANCELLED')
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal((cancelled.body.data as { total: number }).total, 1);
    const requested = await request(ctx.app)
      .get('/api/v1/business/jobs?status=REQUESTED')
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal((requested.body.data as { total: number }).total, 1);
    const search = await request(ctx.app)
      .get(`/api/v1/business/jobs?search=${encodeURIComponent(one['reference'] as string)}`)
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal((search.body.data as { total: number }).total, 1);
    const nameSearch = await request(ctx.app)
      .get('/api/v1/business/jobs?search=Thandi')
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal((nameSearch.body.data as { total: number }).total, 1);
    const badStatus = await request(ctx.app)
      .get('/api/v1/business/jobs?status=BOGUS')
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal(badStatus.status, 422);
    assertErrorEnvelope(badStatus, 'VALIDATION_ERROR');
  });

  it('dashboard summary reports real INTERNAL counts (zero when empty)', async () => {
    const empty = await request(ctx.app)
      .get('/api/v1/business/jobs-summary')
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal(empty.status, 200);
    assertSuccessEnvelope(empty);
    assert.deepEqual(empty.body.data, {
      total: 0,
      requested: 0,
      scheduled: 0,
      inProgress: 0,
      completed: 0,
      cancelled: 0,
    });
    const job = await createInternalJob(ctx, setup.ownerToken, customerId);
    await request(ctx.app)
      .post(`/api/v1/business/jobs/${job['id']}/cancel`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({});
    await createInternalJob(ctx, setup.ownerToken, customerId);
    const summary = await request(ctx.app)
      .get('/api/v1/business/jobs-summary')
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.deepEqual(summary.body.data, {
      total: 2,
      requested: 1,
      scheduled: 0,
      inProgress: 0,
      completed: 0,
      cancelled: 1,
    });
    // Another business still sees zeros — summaries are business-scoped.
    const other = await request(ctx.app)
      .get('/api/v1/business/jobs-summary')
      .set('Authorization', `Bearer ${setup.ownerBToken}`);
    assert.deepEqual((other.body as { data: { total: number } }).data.total, 0);
  });

  it('REQUESTED field updates work; non-REQUESTED jobs reject updates', async () => {
    const job = await createInternalJob(ctx, setup.ownerToken, customerId);
    const updated = await request(ctx.app)
      .patch(`/api/v1/business/jobs/${job['id']}`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({ priority: 'URGENT', description: 'Geyser pressure valve replacement with new copper piping work.' });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal((updated.body.data as Record<string, unknown>)['priority'], 'URGENT');
    const emptyPatch = await request(ctx.app)
      .patch(`/api/v1/business/jobs/${job['id']}`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({});
    assert.equal(emptyPatch.status, 422);
    await request(ctx.app)
      .post(`/api/v1/business/jobs/${job['id']}/cancel`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({});
    const afterCancel = await request(ctx.app)
      .patch(`/api/v1/business/jobs/${job['id']}`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({ priority: 'LOW' });
    assert.equal(afterCancel.status, 422);
    assertErrorEnvelope(afterCancel, 'VALIDATION_ERROR');
  });

  it('malformed and unknown job ids are handled correctly', async () => {
    for (const badId of ['abc', '0', '-4']) {
      const res = await request(ctx.app)
        .get(`/api/v1/business/jobs/${encodeURIComponent(badId)}`)
        .set('Authorization', `Bearer ${setup.ownerToken}`);
      assert.equal(res.status, 400, `GET ${badId}`);
      assertErrorEnvelope(res, 'VALIDATION_ERROR');
    }
    const unknown = await request(ctx.app)
      .get('/api/v1/business/jobs/99999')
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal(unknown.status, 404);
    assertErrorEnvelope(unknown, 'NOT_FOUND');
  });
});
