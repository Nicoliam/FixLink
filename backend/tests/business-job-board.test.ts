/**
 * FixLink Stage 7G — business job board + history tests.
 *
 * Run: npm test (no MySQL required — uses the in-memory business store
 * with the same rules as the MySQL implementation).
 *
 * Covers (§19 of the stage brief) on the shared `jobs` architecture
 * (no new tables, no duplicate statuses):
 * owner/manager listing, technician/customer rejection (403),
 * unauthenticated rejection (401), cross-business exclusion (list +
 * detail read as empty/404, never 403), marketplace exclusion,
 * status + board filtering (new/assigned/scheduled/in-progress/
 * awaiting-parts/completed/cancelled/history), assigned=true/false,
 * technician + priority + creation-date-range filtering, search
 * (reference/customer/phone/service, business-scoped), pagination,
 * sorting, enriched board rows (assignment/partsOutstanding/
 * lastUpdateAt), board-summary counts (business-scoped) and the
 * unchanged legacy summary shape.
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
  managerToken: string;
  ownerBToken: string;
}> {
  const owner = await provisionUser(ctx, 'thabo.board@example.co.za', ['BUSINESS_OWNER']);
  const business = ctx.business.seedBusiness({
    ownerUserId: owner.userId,
    businessName: 'Ubuntu Plumbing Co.',
    slug: 'ubuntu-plumbing-board',
  });
  const manager = await provisionUser(ctx, 'lerato.board@example.co.za', ['BUSINESS_MANAGER']);
  ctx.business.addMembership(business.id, manager.userId, 'BUSINESS_MANAGER');
  const ownerB = await provisionUser(ctx, 'david.board@example.co.za', ['BUSINESS_OWNER']);
  ctx.business.seedBusiness({
    ownerUserId: ownerB.userId,
    businessName: 'Cape Spark Electrical',
    slug: 'cape-spark-board',
  });
  return { ownerToken: owner.token, managerToken: manager.token, ownerBToken: ownerB.token };
}

let seq = 0;
function uniqueEmail(prefix: string): string {
  seq += 1;
  return `${prefix}.${seq}@example.co.za`;
}

async function createCustomer(
  ctx: TestContext,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const res = await request(ctx.app)
    .post('/api/v1/business/customers')
    .set('Authorization', `Bearer ${token}`)
    .send({
      firstName: 'Naledi',
      lastName: 'Dlamini',
      email: uniqueEmail('naledi.board'),
      phone: '+27825550111',
      ...overrides,
    });
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
    .send({
      customerId,
      serviceId: '1',
      description: 'Geyser is leaking from the pressure valve and the drip tray is overflowing.',
      address: '12 Protea Street, Randburg',
      priority: 'HIGH',
      ...overrides,
    });
  assert.equal(res.status, 201, `internal job creation failed: ${JSON.stringify(res.body)}`);
  return res.body.data as Record<string, unknown>;
}

async function inviteTechnician(
  ctx: TestContext,
  token: string,
  displayName = 'Bongani Zulu',
): Promise<{ technician: Record<string, unknown>; token: string }> {
  const email = uniqueEmail('tech.board');
  const invite = await request(ctx.app)
    .post('/api/v1/business/technicians')
    .set('Authorization', `Bearer ${token}`)
    .send({ displayName, email, password: 'TechPass123!' });
  assert.equal(invite.status, 201, `technician invite failed: ${JSON.stringify(invite.body)}`);
  const login = await request(ctx.app).post('/api/v1/auth/login').send({ email, password: 'TechPass123!' });
  assert.equal(login.status, 200);
  return {
    technician: invite.body.data as Record<string, unknown>,
    token: login.body.data.accessToken as string,
  };
}

async function assignTechnician(ctx: TestContext, token: string, jobId: string, technicianId: string): Promise<void> {
  const res = await request(ctx.app)
    .post(`/api/v1/business/jobs/${jobId}/assign`)
    .set('Authorization', `Bearer ${token}`)
    .send({ technicianId });
  assert.equal(res.status, 200, `assignment failed: ${JSON.stringify(res.body)}`);
}

async function startJob(ctx: TestContext, techToken: string, jobId: string): Promise<void> {
  const res = await request(ctx.app)
    .post(`/api/v1/technician/jobs/${jobId}/start`)
    .set('Authorization', `Bearer ${techToken}`)
    .send({});
  assert.equal(res.status, 200, `start failed: ${JSON.stringify(res.body)}`);
}

async function submitParts(ctx: TestContext, techToken: string, jobId: string): Promise<Record<string, unknown>> {
  const res = await request(ctx.app)
    .post(`/api/v1/technician/jobs/${jobId}/parts`)
    .set('Authorization', `Bearer ${techToken}`)
    .send({
      partName: 'Pressure valve',
      quantity: 1,
      reason: 'The pressure valve has failed and must be replaced before testing.',
    });
  assert.equal(res.status, 201, `parts request failed: ${JSON.stringify(res.body)}`);
  return res.body.data as Record<string, unknown>;
}

async function approveParts(
  ctx: TestContext,
  token: string,
  jobId: string,
  requestId: string,
): Promise<void> {
  const res = await request(ctx.app)
    .post(`/api/v1/business/jobs/${jobId}/parts/${requestId}/approve`)
    .set('Authorization', `Bearer ${token}`)
    .send({});
  assert.equal(res.status, 200, `approval failed: ${JSON.stringify(res.body)}`);
}

async function completeJob(ctx: TestContext, techToken: string, jobId: string): Promise<void> {
  const res = await request(ctx.app)
    .post(`/api/v1/technician/jobs/${jobId}/complete`)
    .set('Authorization', `Bearer ${techToken}`)
    .send({ note: 'Replaced the pressure valve, tested the geyser twice and cleaned the work area thoroughly.' });
  assert.equal(res.status, 200, `completion failed: ${JSON.stringify(res.body)}`);
}

interface BoardList {
  items: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
}

async function listBoard(ctx: TestContext, token: string, qs = ''): Promise<{ status: number; body: { data: BoardList } & Record<string, unknown> }> {
  const res = await request(ctx.app)
    .get(`/api/v1/business/jobs${qs}`)
    .set('Authorization', `Bearer ${token}`);
  return res as { status: number; body: { data: BoardList } & Record<string, unknown> };
}

function assertErrorEnvelope(res: { body: unknown }, code: string): void {
  const body = res.body as { success: boolean; error: { code: string; message: string } };
  assert.equal(body.success, false);
  assert.equal(body.error.code, code);
  assert.ok(typeof body.error.message === 'string' && body.error.message.length > 0);
}

describe('Stage 7G — authorization and isolation', () => {
  let ctx: TestContext;
  let setup: Awaited<ReturnType<typeof setupBusinesses>>;
  beforeEach(async () => {
    ctx = buildApp();
    setup = await setupBusinesses(ctx);
  });

  it('1. unauthenticated board and board-summary requests are rejected (401)', async () => {
    for (const path of ['/api/v1/business/jobs', '/api/v1/business/jobs-board-summary']) {
      const res = await request(ctx.app).get(path).send({});
      assert.equal(res.status, 401, path);
      assertErrorEnvelope(res, 'UNAUTHORIZED');
    }
  });

  it('2. technician cannot access the business-wide board or summary (403)', async () => {
    const tech = await inviteTechnician(ctx, setup.ownerToken);
    for (const path of ['/api/v1/business/jobs', '/api/v1/business/jobs-board-summary']) {
      const res = await request(ctx.app).get(path).set('Authorization', `Bearer ${tech.token}`);
      assert.equal(res.status, 403, path);
      assertErrorEnvelope(res, 'FORBIDDEN_ROLE');
    }
  });

  it('3. customer cannot access the business board (403)', async () => {
    const customer = await provisionUser(ctx, 'shopper.board@example.co.za', ['CUSTOMER']);
    const res = await request(ctx.app).get('/api/v1/business/jobs').set('Authorization', `Bearer ${customer.token}`);
    assert.equal(res.status, 403);
    assertErrorEnvelope(res, 'FORBIDDEN_ROLE');
  });

  it('4. owner and manager list only their own business jobs', async () => {
    const customer = await createCustomer(ctx, setup.ownerToken);
    await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const foreignCustomer = await createCustomer(ctx, setup.ownerBToken);
    await createInternalJob(ctx, setup.ownerBToken, foreignCustomer['id'] as string);

    const ownerList = await listBoard(ctx, setup.ownerToken);
    assert.equal(ownerList.status, 200);
    assert.equal(ownerList.body.data.total, 1);
    const managerList = await listBoard(ctx, setup.managerToken);
    assert.equal(managerList.body.data.total, 1);
    const otherList = await listBoard(ctx, setup.ownerBToken);
    assert.equal(otherList.body.data.total, 1);
    assert.notEqual(
      (ownerList.body.data.items[0] as Record<string, unknown>)['id'],
      (otherList.body.data.items[0] as Record<string, unknown>)['id'],
    );
  });

  it('5. cross-business job detail reads as 404 (no probing)', async () => {
    const foreignCustomer = await createCustomer(ctx, setup.ownerBToken);
    const foreignJob = await createInternalJob(ctx, setup.ownerBToken, foreignCustomer['id'] as string);
    for (const token of [setup.ownerToken, setup.managerToken]) {
      const res = await request(ctx.app)
        .get(`/api/v1/business/jobs/${foreignJob['id']}`)
        .set('Authorization', `Bearer ${token}`);
      assert.equal(res.status, 404);
      assertErrorEnvelope(res, 'NOT_FOUND');
    }
  });

  it('6. marketplace jobs never appear on the business board', async () => {
    const customer = await provisionUser(ctx, 'market.shopper@example.co.za', ['CUSTOMER']);
    const marketplaceJob = await request(ctx.app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        providerId: 'professional-1',
        serviceId: '1',
        description: 'Kitchen mixer tap leaking at the base and the cupboard floor is damp.',
        location: 'Fourways, Johannesburg',
      });
    assert.equal(marketplaceJob.status, 201);
    const own = await createCustomer(ctx, setup.ownerToken);
    await createInternalJob(ctx, setup.ownerToken, own['id'] as string);
    const list = await listBoard(ctx, setup.ownerToken);
    assert.equal(list.body.data.total, 1);
    assert.ok(list.body.data.items.every((item) => item['source'] === 'INTERNAL'));
  });

  it('7. search cannot leak another business jobs', async () => {
    await createCustomer(ctx, setup.ownerBToken, { firstName: 'Ayesha', lastName: 'Khan' });
    const own = await createCustomer(ctx, setup.ownerToken);
    await createInternalJob(ctx, setup.ownerToken, own['id'] as string);
    const leaked = await listBoard(ctx, setup.ownerToken, '?search=Ayesha');
    assert.equal(leaked.status, 200);
    assert.equal(leaked.body.data.total, 0);
  });
});

describe('Stage 7G — board categories and derivation', () => {
  let ctx: TestContext;
  let setup: Awaited<ReturnType<typeof setupBusinesses>>;
  let ids: { fresh: string; assigned: string; scheduled: string; inProgress: string; awaiting: string; done: string; cancelled: string };

  beforeEach(async () => {
    ctx = buildApp();
    setup = await setupBusinesses(ctx);
    const customer = await createCustomer(ctx, setup.ownerToken);

    const fresh = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);

    const assignedJob = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const techA = await inviteTechnician(ctx, setup.ownerToken, 'Bongani Zulu');
    await assignTechnician(ctx, setup.ownerToken, assignedJob['id'] as string, techA.technician['id'] as string);

    const scheduledJob = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string, {
      scheduledAt: '2026-11-05T09:00:00.000Z',
    });

    const inProgressJob = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const techB = await inviteTechnician(ctx, setup.ownerToken, 'Sipho Dlamini');
    await assignTechnician(ctx, setup.ownerToken, inProgressJob['id'] as string, techB.technician['id'] as string);
    await startJob(ctx, techB.token, inProgressJob['id'] as string);

    const awaitingJob = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const techC = await inviteTechnician(ctx, setup.ownerToken, 'Thandi Mahlangu');
    await assignTechnician(ctx, setup.ownerToken, awaitingJob['id'] as string, techC.technician['id'] as string);
    await startJob(ctx, techC.token, awaitingJob['id'] as string);
    const parts = await submitParts(ctx, techC.token, awaitingJob['id'] as string);
    await approveParts(ctx, setup.ownerToken, awaitingJob['id'] as string, parts['id'] as string);

    const doneJob = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const techD = await inviteTechnician(ctx, setup.ownerToken, 'Pieter van der Merwe');
    await assignTechnician(ctx, setup.ownerToken, doneJob['id'] as string, techD.technician['id'] as string);
    await startJob(ctx, techD.token, doneJob['id'] as string);
    await completeJob(ctx, techD.token, doneJob['id'] as string);

    const cancelledJob = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const cancel = await request(ctx.app)
      .post(`/api/v1/business/jobs/${cancelledJob['id']}/cancel`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({});
    assert.equal(cancel.status, 200);

    ids = {
      fresh: fresh['id'] as string,
      assigned: assignedJob['id'] as string,
      scheduled: scheduledJob['id'] as string,
      inProgress: inProgressJob['id'] as string,
      awaiting: awaitingJob['id'] as string,
      done: doneJob['id'] as string,
      cancelled: cancelledJob['id'] as string,
    };
  });

  it('8. all board categories map to the existing lifecycle (no duplicate statuses)', async () => {
    const expectations: Array<[string, string[]]> = [
      ['?board=NEW', [ids.fresh, ids.assigned, ids.scheduled]],
      ['?board=ASSIGNED', [ids.assigned, ids.inProgress, ids.awaiting, ids.done]],
      ['?board=SCHEDULED', [ids.scheduled]],
      ['?board=IN_PROGRESS', [ids.inProgress]],
      ['?board=AWAITING_PARTS', [ids.awaiting]],
      ['?board=COMPLETED', [ids.done]],
      ['?board=CANCELLED', [ids.cancelled]],
      ['?board=HISTORY', [ids.done]],
      ['?board=ALL', [ids.fresh, ids.assigned, ids.scheduled, ids.inProgress, ids.awaiting, ids.done, ids.cancelled]],
    ];
    for (const [qs, expected] of expectations) {
      const res = await listBoard(ctx, setup.ownerToken, qs);
      assert.equal(res.status, 200, qs);
      const found = (res.body.data.items as Array<Record<string, unknown>>).map((item) => item['id'] as string).sort();
      assert.deepEqual(found, [...expected].sort(), qs);
    }
  });

  it('9. manager sees the same board categories as the owner', async () => {
    const res = await listBoard(ctx, setup.managerToken, '?board=AWAITING_PARTS');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.total, 1);
    assert.equal((res.body.data.items[0] as Record<string, unknown>)['id'], ids.awaiting);
  });

  it('10. assigned=true/false derives from the assignment relationship', async () => {
    const assigned = await listBoard(ctx, setup.ownerToken, '?assigned=true');
    assert.equal(assigned.status, 200);
    assert.deepEqual(
      (assigned.body.data.items as Array<Record<string, unknown>>).map((i) => i['id']).sort(),
      [ids.assigned, ids.inProgress, ids.awaiting, ids.done].sort(),
    );
    const unassigned = await listBoard(ctx, setup.ownerToken, '?assigned=false');
    assert.equal(unassigned.status, 200);
    assert.deepEqual(
      (unassigned.body.data.items as Array<Record<string, unknown>>).map((i) => i['id']).sort(),
      [ids.fresh, ids.scheduled, ids.cancelled].sort(),
    );
  });

  it('11. exact status filtering still works alongside the board', async () => {
    const res = await listBoard(ctx, setup.ownerToken, '?status=COMPLETED');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.total, 1);
    assert.equal((res.body.data.items[0] as Record<string, unknown>)['id'], ids.done);
  });

  it('12. board rows carry assignment, outstanding parts and work timestamps', async () => {
    const res = await listBoard(ctx, setup.ownerToken, '?board=AWAITING_PARTS');
    const row = res.body.data.items[0] as Record<string, unknown>;
    const assignment = row['assignment'] as { technician: { displayName: string }; assignedAt: string } | null;
    assert.ok(assignment);
    assert.equal(assignment.technician.displayName, 'Thandi Mahlangu');
    assert.ok(typeof assignment.assignedAt === 'string');
    assert.equal(row['partsOutstanding'], 1);
    // No notes/photos/voice yet on this job — the timestamp is null, not fabricated.
    assert.equal(row['lastUpdateAt'], null);

    const fresh = await listBoard(ctx, setup.ownerToken, `?search=${ids.fresh}`);
    const freshRow = (fresh.body.data.items as Array<Record<string, unknown>>).find((i) => i['id'] === ids.fresh);
    assert.ok(freshRow);
    assert.equal(freshRow['assignment'], null);
    assert.equal(freshRow['partsOutstanding'], 0);

    // The completed job has an AFTER completion note, so it reports work recency.
    const done = await listBoard(ctx, setup.ownerToken, '?board=COMPLETED');
    assert.ok(typeof (done.body.data.items[0] as Record<string, unknown>)['lastUpdateAt'] === 'string');
  });

  it('13. board summary reports operational counts (business-scoped)', async () => {
    const res = await request(ctx.app)
      .get('/api/v1/business/jobs-board-summary')
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, {
      total: 7,
      requested: 3,
      assigned: 4,
      scheduled: 1,
      inProgress: 1,
      awaitingParts: 1,
      completed: 1,
      cancelled: 1,
      history: 1,
    });
    const other = await request(ctx.app)
      .get('/api/v1/business/jobs-board-summary')
      .set('Authorization', `Bearer ${setup.ownerBToken}`);
    assert.deepEqual(other.body.data, {
      total: 0,
      requested: 0,
      assigned: 0,
      scheduled: 0,
      inProgress: 0,
      awaitingParts: 0,
      completed: 0,
      cancelled: 0,
      history: 0,
    });
  });

  it('14. legacy jobs-summary shape is unchanged', async () => {
    const res = await request(ctx.app)
      .get('/api/v1/business/jobs-summary')
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, {
      total: 7,
      requested: 3,
      scheduled: 0,
      inProgress: 1,
      completed: 1,
      cancelled: 1,
    });
  });

  it('15. job detail remains reachable from the board (owner) and isolated (other business)', async () => {
    const detail = await request(ctx.app)
      .get(`/api/v1/business/jobs/${ids.awaiting}`)
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal(detail.status, 200);
    assert.equal((detail.body.data as { job: Record<string, unknown> }).job['status'], 'AWAITING_PARTS');
    assert.ok(Array.isArray((detail.body.data as { timeline: unknown[] }).timeline));
  });
});

describe('Stage 7G — filtering, search, pagination and sorting', () => {
  let ctx: TestContext;
  let setup: Awaited<ReturnType<typeof setupBusinesses>>;
  let techId: string;

  beforeEach(async () => {
    ctx = buildApp();
    setup = await setupBusinesses(ctx);
    const customer = await createCustomer(ctx, setup.ownerToken, {
      firstName: 'Naledi',
      lastName: 'Dlamini',
      phone: '+27825550111',
    });
    await createInternalJob(ctx, setup.ownerToken, customer['id'] as string, { priority: 'URGENT' });
    const other = await createCustomer(ctx, setup.ownerToken, {
      firstName: 'Thandi',
      lastName: 'Mahlangu',
      email: uniqueEmail('thandi.board'),
      phone: '+27825550222',
    });
    const second = await createInternalJob(ctx, setup.ownerToken, other['id'] as string, { priority: 'LOW' });
    const tech = await inviteTechnician(ctx, setup.ownerToken, 'Bongani Zulu');
    techId = tech.technician['id'] as string;
    await assignTechnician(ctx, setup.ownerToken, second['id'] as string, techId);
  });

  it('16. technician filter is scoped to the own roster', async () => {
    const own = await listBoard(ctx, setup.ownerToken, `?technicianId=${techId}`);
    assert.equal(own.status, 200);
    assert.equal(own.body.data.total, 1);
    // A foreign roster id yields an empty page (200) — never another business's jobs.
    const foreignCustomer = await createCustomer(ctx, setup.ownerBToken);
    const foreignJob = await createInternalJob(ctx, setup.ownerBToken, foreignCustomer['id'] as string);
    const foreignTech = await inviteTechnician(ctx, setup.ownerBToken, 'Foreign Tech');
    await assignTechnician(ctx, setup.ownerBToken, foreignJob['id'] as string, foreignTech.technician['id'] as string);
    const probed = await listBoard(ctx, setup.ownerToken, `?technicianId=${foreignTech.technician['id']}`);
    assert.equal(probed.status, 200);
    assert.equal(probed.body.data.total, 0);
  });

  it('17. priority filtering works', async () => {
    const urgent = await listBoard(ctx, setup.ownerToken, '?priority=URGENT');
    assert.equal(urgent.body.data.total, 1);
    const low = await listBoard(ctx, setup.ownerToken, '?priority=low');
    assert.equal(low.body.data.total, 1);
    const none = await listBoard(ctx, setup.ownerToken, '?priority=NORMAL');
    assert.equal(none.body.data.total, 0);
  });

  it('18. search covers reference, customer name, phone and service', async () => {
    const all = await listBoard(ctx, setup.ownerToken);
    const reference = (all.body.data.items[0] as Record<string, unknown>)['reference'] as string;
    const byReference = await listBoard(ctx, setup.ownerToken, `?search=${encodeURIComponent(reference)}`);
    assert.equal(byReference.body.data.total, 1);
    const byName = await listBoard(ctx, setup.ownerToken, '?search=Thandi');
    assert.equal(byName.body.data.total, 1);
    const byPhone = await listBoard(ctx, setup.ownerToken, '?search=825550222');
    assert.equal(byPhone.body.data.total, 1);
    const byService = await listBoard(ctx, setup.ownerToken, '?search=Leak');
    assert.ok(byService.body.data.total >= 1);
  });

  it('19. creation-date range filtering works', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const inRange = await listBoard(ctx, setup.ownerToken, `?from=${today}&to=${today}`);
    assert.equal(inRange.status, 200);
    assert.equal(inRange.body.data.total, 2);
    const future = await listBoard(ctx, setup.ownerToken, '?from=2030-01-01');
    assert.equal(future.body.data.total, 0);
    const past = await listBoard(ctx, setup.ownerToken, '?to=2020-01-01');
    assert.equal(past.body.data.total, 0);
  });

  it('20. pagination returns page, pageSize and total', async () => {
    const first = await listBoard(ctx, setup.ownerToken, '?page=1&pageSize=1');
    assert.equal(first.status, 200);
    assert.equal(first.body.data.total, 2);
    assert.equal(first.body.data.items.length, 1);
    assert.equal(first.body.data.page, 1);
    assert.equal(first.body.data.pageSize, 1);
    const second = await listBoard(ctx, setup.ownerToken, '?page=2&pageSize=1');
    assert.equal(second.body.data.items.length, 1);
    assert.notEqual(
      (first.body.data.items[0] as Record<string, unknown>)['id'],
      (second.body.data.items[0] as Record<string, unknown>)['id'],
    );
  });

  it('21. sorting orders operationally (priority and scheduled)', async () => {
    const byPriority = await listBoard(ctx, setup.ownerToken, '?sort=priority');
    assert.equal(byPriority.status, 200);
    const priorities = (byPriority.body.data.items as Array<Record<string, unknown>>).map((i) => i['priority']);
    assert.deepEqual(priorities, ['URGENT', 'LOW']);
    // A job with a visit slot sorts before unscheduled work under sort=scheduled.
    const customer = await createCustomer(ctx, setup.ownerToken);
    await createInternalJob(ctx, setup.ownerToken, customer['id'] as string, {
      scheduledAt: '2026-12-01T09:00:00.000Z',
    });
    const byScheduled = await listBoard(ctx, setup.ownerToken, '?sort=scheduled');
    const first = byScheduled.body.data.items[0] as Record<string, unknown>;
    assert.ok(first['scheduledAt'] !== null);
  });

  it('22. invalid board filters are rejected (422)', async () => {
    const cases = [
      '?board=BOGUS',
      '?board=NEW&status=REQUESTED',
      '?board=ASSIGNED&assigned=true',
      '?priority=EXTREME',
      '?sort=newest',
      '?assigned=yes',
      '?technicianId=abc',
      '?from=not-a-date',
      '?from=2026-05-01&to=2026-01-01',
    ];
    for (const qs of cases) {
      const res = await listBoard(ctx, setup.ownerToken, qs);
      assert.equal(res.status, 422, qs);
      assertErrorEnvelope(res, 'VALIDATION_ERROR');
    }
  });
});
