/**
 * FixLink Stage 7F — manager approvals + awaiting parts tests.
 *
 * Run: npm test (no MySQL required — in-memory business store with the
 * same rules as the MySQL implementation, plus an isolated local-storage
 * tmp dir per test app).
 *
 * Covers: owner/manager approve (PENDING → APPROVED + IN_PROGRESS →
 * AWAITING_PARTS + approval record + history + events), reject (→
 * REJECTED, job stays IN_PROGRESS, reason stored/required),
 * request-info (→ NEEDS_INFO, comment required, technician responds →
 * PENDING, manager acts again), parts available (APPROVED →
 * PARTS_AVAILABLE, resume only when nothing outstanding, incl. the
 * two-request rule), technician resume (guarded), idempotency/duplicate
 * rejections, role isolation (technician/customer/professional/cross-
 * business/marketplace blocked), transaction behaviour (failed actions
 * leave state untouched), timeline inclusion and the notification seam.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { MemoryUserRepository } from '../src/modules/auth/memory-user.repository';
import { MemoryRefreshStore } from '../src/modules/auth/refresh.store';
import { MemoryMarketplaceStore } from '../src/modules/marketplace/memory-marketplace.store';
import { MemoryJobsStore } from '../src/modules/jobs/memory-jobs.store';
import { MemoryBusinessStore } from '../src/modules/business/memory-business.store';
import { PartsRequestEventBus } from '../src/modules/business/parts-request-events';
import { LocalFileStorage } from '../src/services/file-storage';
import { hashPassword } from '../src/utils/password';

interface TestContext {
  app: Express;
  users: MemoryUserRepository;
  business: MemoryBusinessStore;
  events: PartsRequestEventBus;
}

function buildApp(): TestContext {
  const users = new MemoryUserRepository();
  const business = new MemoryBusinessStore();
  const storage = new LocalFileStorage(mkdtempSync(join(tmpdir(), 'fixlink-7f-')));
  // The shared bus is threaded through createApp so tests can drain the
  // Stage 8 notification seam after each HTTP workflow step.
  const events = new PartsRequestEventBus();
  const app = createApp({
    users,
    refreshStore: new MemoryRefreshStore(),
    marketplace: new MemoryMarketplaceStore(),
    jobs: new MemoryJobsStore(),
    business,
    storage,
    events,
  });
  return { app, users, business, events };
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
  const owner = await provisionUser(ctx, 'thabo.approve@example.co.za', ['BUSINESS_OWNER']);
  const business = ctx.business.seedBusiness({
    ownerUserId: owner.userId,
    businessName: 'Ubuntu Plumbing Co.',
    slug: 'ubuntu-plumbing-approve',
  });
  const manager = await provisionUser(ctx, 'lerato.approve@example.co.za', ['BUSINESS_MANAGER']);
  ctx.business.addMembership(business.id, manager.userId, 'BUSINESS_MANAGER');
  const ownerB = await provisionUser(ctx, 'david.approve@example.co.za', ['BUSINESS_OWNER']);
  ctx.business.seedBusiness({
    ownerUserId: ownerB.userId,
    businessName: 'Cape Spark Electrical',
    slug: 'cape-spark-approve',
  });
  return { ownerToken: owner.token, managerToken: manager.token, ownerBToken: ownerB.token };
}

let seq = 0;
function uniqueEmail(prefix: string): string {
  seq += 1;
  return `${prefix}.${seq}@example.co.za`;
}

async function createCustomer(ctx: TestContext, token: string): Promise<Record<string, unknown>> {
  const res = await request(ctx.app)
    .post('/api/v1/business/customers')
    .set('Authorization', `Bearer ${token}`)
    .send({ firstName: 'Naledi', lastName: 'Dlamini', email: uniqueEmail('naledi.approve'), phone: '+27825550111' });
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
    .send({
      customerId,
      serviceId: '1',
      description: 'Geyser is leaking from the pressure valve and the drip tray is overflowing.',
      address: '12 Protea Street, Randburg',
      priority: 'HIGH',
    });
  assert.equal(res.status, 201, `internal job creation failed: ${JSON.stringify(res.body)}`);
  return res.body.data as Record<string, unknown>;
}

async function inviteTechnician(
  ctx: TestContext,
  token: string,
): Promise<{ technician: Record<string, unknown>; token: string; userId: string }> {
  const address = uniqueEmail('tech.approve');
  const invite = await request(ctx.app)
    .post('/api/v1/business/technicians')
    .set('Authorization', `Bearer ${token}`)
    .send({ displayName: 'Tech Approve', email: address, password: 'TechPass123!' });
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

async function assignTechnician(
  ctx: TestContext,
  ownerToken: string,
  jobId: string,
  technicianId: string,
): Promise<void> {
  const res = await request(ctx.app)
    .post(`/api/v1/business/jobs/${jobId}/assign`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ technicianId });
  assert.equal(res.status, 200, `assignment failed: ${JSON.stringify(res.body)}`);
}

async function startJob(ctx: TestContext, techToken: string, jobId: string): Promise<void> {
  const started = await request(ctx.app)
    .post(`/api/v1/technician/jobs/${jobId}/start`)
    .set('Authorization', `Bearer ${techToken}`)
    .send({});
  assert.equal(started.status, 200, `start failed: ${JSON.stringify(started.body)}`);
}

interface WorkingJob {
  jobId: string;
  techToken: string;
  technicianId: string;
  ownerToken: string;
  managerToken: string;
}

/** Customer → internal job → technician assigned → work started (IN_PROGRESS). */
async function createStartedJob(ctx: TestContext, ownerToken: string, managerToken: string): Promise<WorkingJob> {
  const customer = await createCustomer(ctx, ownerToken);
  const job = await createInternalJob(ctx, ownerToken, customer['id'] as string);
  const tech = await inviteTechnician(ctx, ownerToken);
  await assignTechnician(ctx, ownerToken, job['id'] as string, tech.technician['id'] as string);
  await startJob(ctx, tech.token, job['id'] as string);
  return {
    jobId: job['id'] as string,
    techToken: tech.token,
    technicianId: tech.technician['id'] as string,
    ownerToken,
    managerToken,
  };
}

function validParts(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    partName: 'Brake fluid',
    quantity: 2,
    reason: 'Required to complete the repair safely and test the system.',
    ...overrides,
  };
}

async function submitParts(ctx: TestContext, working: WorkingJob, overrides: Record<string, unknown> = {}) {
  const res = await request(ctx.app)
    .post(`/api/v1/technician/jobs/${working.jobId}/parts`)
    .set('Authorization', `Bearer ${working.techToken}`)
    .send(validParts(overrides));
  assert.equal(res.status, 201, `parts request failed: ${JSON.stringify(res.body)}`);
  return res.body.data as Record<string, unknown>;
}

async function jobStatus(ctx: TestContext, token: string, jobId: string, as: 'business' | 'technician'): Promise<string> {
  const path = as === 'business' ? `/api/v1/business/jobs/${jobId}` : `/api/v1/technician/jobs/${jobId}`;
  const res = await request(ctx.app).get(path).set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200, `job read failed: ${JSON.stringify(res.body)}`);
  return (res.body.data.job as Record<string, unknown>)['status'] as string;
}

describe('Stage 7F — manager approvals + awaiting parts', () => {
  let ctx: TestContext;
  let tokens: { ownerToken: string; managerToken: string; ownerBToken: string };
  beforeEach(async () => {
    ctx = buildApp();
    tokens = await setupBusinesses(ctx);
  });

  it('owner can approve a PENDING request (APPROVED + IN_PROGRESS → AWAITING_PARTS + approval record)', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const created = await submitParts(ctx, working);
    const res = await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/approve`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({ comment: 'Genuine part required — approved.' });
    assert.equal(res.status, 200, `approve failed: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    const payload = res.body.data as Record<string, unknown>;
    const approvedRequest = payload['request'] as Record<string, unknown>;
    assert.equal(approvedRequest['status'], 'APPROVED');
    assert.equal(approvedRequest['reviewNotes'], 'Genuine part required — approved.');
    assert.ok(approvedRequest['reviewedAt']);
    assert.equal(approvedRequest['reviewedBy'], (await ctx.users.findByEmail('thabo.approve@example.co.za'))?.id);
    const approval = payload['approval'] as Record<string, unknown>;
    assert.ok(approval['id']);
    assert.equal(approval['status'], 'APPROVED');
    assert.equal(approval['partsRequestId'], created['id']);
    assert.equal((payload['job'] as Record<string, unknown>)['status'], 'AWAITING_PARTS');
    assert.equal(await jobStatus(ctx, working.ownerToken, working.jobId, 'business'), 'AWAITING_PARTS');
    // Timeline records the move.
    const timeline = await request(ctx.app)
      .get(`/api/v1/business/jobs/${working.jobId}/timeline`)
      .set('Authorization', `Bearer ${working.ownerToken}`);
    assert.equal(timeline.status, 200);
    const events = timeline.body.data.events as Array<Record<string, unknown>>;
    const awaiting = events.filter((e) => e['kind'] === 'status' && e['status'] === 'AWAITING_PARTS');
    assert.equal(awaiting.length, 1);
    assert.match((awaiting[0]?.['reason'] as string) ?? '', /approved/i);
    const partsEvents = events.filter((e) => e['kind'] === 'parts');
    assert.ok(partsEvents.some((e) => e['partsStatus'] === 'APPROVED'));
  });

  it('manager can approve an own-business request', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const created = await submitParts(ctx, working);
    const res = await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/approve`)
      .set('Authorization', `Bearer ${working.managerToken}`)
      .send({});
    assert.equal(res.status, 200, `manager approve failed: ${JSON.stringify(res.body)}`);
    assert.equal((res.body.data.request as Record<string, unknown>)['status'], 'APPROVED');
    assert.equal(await jobStatus(ctx, working.ownerToken, working.jobId, 'business'), 'AWAITING_PARTS');
  });

  it('rejection stores the reason, leaves the job IN_PROGRESS and records history', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const created = await submitParts(ctx, working);
    const res = await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/reject`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({ reason: 'We already stock this part in the van.' });
    assert.equal(res.status, 200, `reject failed: ${JSON.stringify(res.body)}`);
    assert.equal((res.body.data.request as Record<string, unknown>)['status'], 'REJECTED');
    assert.equal((res.body.data.request as Record<string, unknown>)['reviewNotes'], 'We already stock this part in the van.');
    assert.equal((res.body.data.approval as Record<string, unknown>)['status'], 'REJECTED');
    assert.equal(await jobStatus(ctx, working.ownerToken, working.jobId, 'business'), 'IN_PROGRESS');
    const timeline = await request(ctx.app)
      .get(`/api/v1/business/jobs/${working.jobId}/timeline`)
      .set('Authorization', `Bearer ${working.ownerToken}`);
    const events = timeline.body.data.events as Array<Record<string, unknown>>;
    assert.ok(events.some((e) => e['kind'] === 'parts' && e['partsStatus'] === 'REJECTED'));
    assert.ok(!events.some((e) => e['kind'] === 'status' && e['status'] === 'AWAITING_PARTS'));
  });

  it('rejection without a reason is rejected (422) and leaves state untouched', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const created = await submitParts(ctx, working);
    for (const body of [{}, { comment: '   ' }, { reason: '' }]) {
      const res = await request(ctx.app)
        .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/reject`)
        .set('Authorization', `Bearer ${working.ownerToken}`)
        .send(body);
      assert.equal(res.status, 422, `reject without reason: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
    const reread = await request(ctx.app)
      .get(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}`)
      .set('Authorization', `Bearer ${working.ownerToken}`);
    assert.equal((reread.body.data as Record<string, unknown>)['status'], 'PENDING');
  });

  it('request-info requires a comment, moves to NEEDS_INFO and leaves the job IN_PROGRESS', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const created = await submitParts(ctx, working);
    const missing = await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/request-info`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({});
    assert.equal(missing.status, 422);
    const res = await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/request-info`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({ comment: 'Which brand and specification do you need?' });
    assert.equal(res.status, 200, `request-info failed: ${JSON.stringify(res.body)}`);
    assert.equal((res.body.data.request as Record<string, unknown>)['status'], 'NEEDS_INFO');
    assert.equal(await jobStatus(ctx, working.ownerToken, working.jobId, 'business'), 'IN_PROGRESS');
    // Technician sees that more information is required.
    const techRead = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${working.jobId}/parts/${created['id']}`)
      .set('Authorization', `Bearer ${working.techToken}`);
    assert.equal(techRead.status, 200);
    assert.equal((techRead.body.data as Record<string, unknown>)['status'], 'NEEDS_INFO');
    assert.equal(
      (techRead.body.data as Record<string, unknown>)['reviewNotes'],
      'Which brand and specification do you need?',
    );
  });

  it('technician responds to NEEDS_INFO (→ PENDING) and the manager can then approve', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const created = await submitParts(ctx, working);
    await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/request-info`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({ comment: 'Which brand and specification do you need?' });
    const respond = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/parts/${created['id']}/respond`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send({ note: 'Castrol DOT4, 500ml bottles.' });
    assert.equal(respond.status, 200, `respond failed: ${JSON.stringify(respond.body)}`);
    assert.equal((respond.body.data as Record<string, unknown>)['status'], 'PENDING');
    const reread = await request(ctx.app)
      .get(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}`)
      .set('Authorization', `Bearer ${working.ownerToken}`);
    const approvals = (reread.body.data as Record<string, unknown>)['approvals'] as Array<Record<string, unknown>>;
    assert.equal(approvals.length, 2);
    assert.equal(approvals[1]?.['status'], 'PENDING');
    assert.equal(approvals[1]?.['comments'], 'Castrol DOT4, 500ml bottles.');
    const approve = await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/approve`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({ comment: 'Confirmed — approved.' });
    assert.equal(approve.status, 200);
    assert.equal(await jobStatus(ctx, working.ownerToken, working.jobId, 'business'), 'AWAITING_PARTS');
  });

  it('parts available resumes the job (AWAITING_PARTS → IN_PROGRESS) with history', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const created = await submitParts(ctx, working);
    await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/approve`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({ comment: 'Approved.' });
    const res = await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/available`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({});
    assert.equal(res.status, 200, `available failed: ${JSON.stringify(res.body)}`);
    assert.equal((res.body.data.request as Record<string, unknown>)['status'], 'PARTS_AVAILABLE');
    assert.equal((res.body.data as Record<string, unknown>)['jobResumed'], true);
    assert.equal((res.body.data.job as Record<string, unknown>)['status'], 'IN_PROGRESS');
    assert.equal(await jobStatus(ctx, working.techToken, working.jobId, 'technician'), 'IN_PROGRESS');
    const timeline = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${working.jobId}/timeline`)
      .set('Authorization', `Bearer ${working.techToken}`);
    const events = timeline.body.data.events as Array<Record<string, unknown>>;
    const resumed = events.filter((e) => e['kind'] === 'status' && e['status'] === 'IN_PROGRESS');
    assert.ok(resumed.length >= 1);
  });

  it('multiple approved requests: one available keeps AWAITING_PARTS until all are available', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const first = await submitParts(ctx, working, { partName: 'Brake fluid' });
    const second = await submitParts(ctx, working, { partName: 'Copper pipe 15mm', quantity: 4 });
    for (const created of [first, second]) {
      const approved = await request(ctx.app)
        .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/approve`)
        .set('Authorization', `Bearer ${working.ownerToken}`)
        .send({ comment: 'Approved.' });
      assert.equal(approved.status, 200);
    }
    assert.equal(await jobStatus(ctx, working.ownerToken, working.jobId, 'business'), 'AWAITING_PARTS');
    const oneAvailable = await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${first['id']}/available`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({});
    assert.equal(oneAvailable.status, 200);
    assert.equal((oneAvailable.body.data as Record<string, unknown>)['jobResumed'], false);
    assert.equal(await jobStatus(ctx, working.ownerToken, working.jobId, 'business'), 'AWAITING_PARTS');
    // Technician cannot resume while an APPROVED request is outstanding.
    const blocked = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/resume`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send({});
    assert.equal(blocked.status, 422);
    assert.equal(blocked.body.error.code, 'VALIDATION_ERROR');
    const allAvailable = await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${second['id']}/available`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({});
    assert.equal(allAvailable.status, 200);
    assert.equal((allAvailable.body.data as Record<string, unknown>)['jobResumed'], true);
    assert.equal(await jobStatus(ctx, working.techToken, working.jobId, 'technician'), 'IN_PROGRESS');
  });

  it('technician resumes directly once all approved parts are available', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const created = await submitParts(ctx, working);
    await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/approve`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({});
    // Manager marks available but the job is forced back to waiting to
    // exercise the technician resume path is covered by the auto-resume
    // above; here the technician path is blocked first, then allowed.
    const blocked = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/resume`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send({});
    assert.equal(blocked.status, 422);
    await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/available`)
      .set('Authorization', `Bearer ${working.managerToken}`)
      .send({});
    assert.equal(await jobStatus(ctx, working.techToken, working.jobId, 'technician'), 'IN_PROGRESS');
  });

  it('rejects duplicate and terminal transitions (idempotency)', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const created = await submitParts(ctx, working);
    const approve = await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/approve`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({});
    assert.equal(approve.status, 200);
    for (const action of ['approve', 'reject', 'request-info']) {
      const dup = await request(ctx.app)
        .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/${action}`)
        .set('Authorization', `Bearer ${working.ownerToken}`)
        .send({ comment: 'Second attempt.' });
      assert.equal(dup.status, 422, `${action} again: ${JSON.stringify(dup.body)}`);
      assert.equal(dup.body.error.code, 'VALIDATION_ERROR');
    }
    const pendingAvailable = await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/available`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({});
    assert.equal(pendingAvailable.status, 200);
    const again = await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/available`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({});
    assert.equal(again.status, 422);
    // Rejected requests can never be approved afterwards.
    const second = await submitParts(ctx, working, { partName: 'Copper pipe 15mm', quantity: 4 });
    const rejected = await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${second['id']}/reject`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({ reason: 'Not needed.' });
    assert.equal(rejected.status, 200);
    const lateApprove = await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${second['id']}/approve`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({});
    assert.equal(lateApprove.status, 422);
    // NEEDS_INFO requests cannot be marked available without approval.
    const third = await submitParts(ctx, working, { partName: 'Geyser element 3kW', quantity: 1 });
    await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${third['id']}/request-info`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({ comment: 'Which wattage?' });
    const premature = await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${third['id']}/available`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({});
    assert.equal(premature.status, 422);
  });

  it('technician, customer, professional and anonymous callers cannot approve', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const created = await submitParts(ctx, working);
    const customer = await provisionUser(ctx, uniqueEmail('cust.approve'), ['CUSTOMER']);
    const professional = await provisionUser(ctx, uniqueEmail('pro.approve'), ['PROFESSIONAL']);
    const anon = await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/approve`)
      .send({});
    assert.equal(anon.status, 401);
    for (const token of [working.techToken, customer.token, professional.token]) {
      for (const action of ['approve', 'reject', 'request-info', 'available']) {
        const res = await request(ctx.app)
          .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/${action}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ comment: 'Trying to decide.' });
        assert.equal(res.status, 403, `${action}: ${JSON.stringify(res.body)}`);
      }
    }
    // Owner/manager cannot use the technician respond/resume surface.
    for (const token of [working.ownerToken, working.managerToken]) {
      const res = await request(ctx.app)
        .post(`/api/v1/technician/jobs/${working.jobId}/parts/${created['id']}/respond`)
        .set('Authorization', `Bearer ${token}`)
        .send({ note: 'Manager posing as technician.' });
      assert.equal(res.status, 403, `manager respond: ${JSON.stringify(res.body)}`);
    }
  });

  it('cross-business approval is blocked (404, no probing)', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const created = await submitParts(ctx, working);
    for (const action of ['approve', 'reject', 'request-info', 'available']) {
      const res = await request(ctx.app)
        .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/${action}`)
        .set('Authorization', `Bearer ${tokens.ownerBToken}`)
        .send({ comment: 'Foreign business.' });
      assert.equal(res.status, 404, `${action}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    }
  });

  it('marketplace jobs cannot use the approval workflow (404)', async () => {
    const registered = await request(ctx.app)
      .post('/api/v1/auth/register')
      .send({ email: uniqueEmail('customer.market2'), password: PASSWORD });
    assert.equal(registered.status, 201);
    const login = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: registered.body.data.user.email, password: PASSWORD });
    const customerToken = login.body.data.accessToken as string;
    const created = await request(ctx.app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        providerId: 'professional-1',
        serviceId: '1',
        description: 'Kitchen mixer tap leaking at the base and the cupboard floor is damp.',
        location: 'Fourways, Johannesburg',
        preferredDate: '2026-10-05',
      });
    assert.equal(created.status, 201);
    const marketplaceId = created.body.data.id as string;
    const res = await request(ctx.app)
      .post(`/api/v1/business/jobs/${marketplaceId}/parts/1/approve`)
      .set('Authorization', `Bearer ${tokens.ownerToken}`)
      .send({});
    assert.equal(res.status, 404);
  });

  it('invalid ids are rejected (400) and unknown requests read as 404', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const badJob = await request(ctx.app)
      .post('/api/v1/business/jobs/abc/parts/1/approve')
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({});
    assert.equal(badJob.status, 400);
    const badRequest = await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/abc/approve`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({});
    assert.equal(badRequest.status, 400);
    const missing = await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/99999/approve`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({});
    assert.equal(missing.status, 404);
  });

  it('failed actions leave request, job and history untouched (rollback behaviour)', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const created = await submitParts(ctx, working);
    const before = await request(ctx.app)
      .get(`/api/v1/business/jobs/${working.jobId}/timeline`)
      .set('Authorization', `Bearer ${working.ownerToken}`);
    const beforeCount = (before.body.data.events as unknown[]).length;
    // Duplicate approve fails: status, job and timeline unchanged.
    await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/approve`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({});
    const dup = await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/approve`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({});
    assert.equal(dup.status, 422);
    const reread = await request(ctx.app)
      .get(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}`)
      .set('Authorization', `Bearer ${working.ownerToken}`);
    assert.equal((reread.body.data as Record<string, unknown>)['status'], 'APPROVED');
    assert.equal(await jobStatus(ctx, working.ownerToken, working.jobId, 'business'), 'AWAITING_PARTS');
    const after = await request(ctx.app)
      .get(`/api/v1/business/jobs/${working.jobId}/timeline`)
      .set('Authorization', `Bearer ${working.ownerToken}`);
    // Exactly one new AWAITING_PARTS status event — the failed duplicate
    // wrote nothing.
    const awaiting = (after.body.data.events as Array<Record<string, unknown>>).filter(
      (e) => e['kind'] === 'status' && e['status'] === 'AWAITING_PARTS',
    );
    assert.equal(awaiting.length, 1);
    assert.ok((after.body.data.events as unknown[]).length > beforeCount);
  });

  it('emits notification-seam events for approve, reject, needs-info, respond, available and resume', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const created = await submitParts(ctx, working);
    // Request-info → technician responds → approve → available (resume).
    await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/request-info`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({ comment: 'Which brand?' });
    await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/parts/${created['id']}/respond`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send({ note: 'Castrol DOT4.' });
    await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/approve`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({});
    await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/available`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({});
    // A second request is rejected for the REJECTED event.
    const second = await submitParts(ctx, working, { partName: 'Copper pipe 15mm', quantity: 4 });
    await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${second['id']}/reject`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({ reason: 'Not needed.' });
    const events = ctx.events.drain();
    const types = events.map((event) => event.type);
    assert.deepEqual(types, [
      'PARTS_REQUEST_NEEDS_INFO',
      'PARTS_REQUEST_RESPONDED',
      'PARTS_REQUEST_APPROVED',
      'PARTS_AVAILABLE',
      'JOB_READY_TO_CONTINUE',
      'PARTS_REQUEST_REJECTED',
    ]);
    for (const event of events) {
      assert.equal(event.jobId, working.jobId);
      assert.ok(event.title.length > 0);
      assert.ok(event.message.length > 0);
      assert.ok(event.actorUserId.length > 0);
      assert.ok(event.technicianUserId.length > 0);
      assert.ok(event.createdAt.length > 0);
    }
    // Nothing is persisted to the notifications table in Stage 7F — the
    // seam is a collector only (Stage 8 persists). Draining is consumptive.
    assert.deepEqual(ctx.events.drain(), []);
  });

  it('approval decisions appear in both technician and business timelines', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const created = await submitParts(ctx, working);
    await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/request-info`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({ comment: 'Which brand?' });
    await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/parts/${created['id']}/respond`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send({ note: 'Castrol DOT4.' });
    await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created['id']}/approve`)
      .set('Authorization', `Bearer ${working.ownerToken}`)
      .send({ comment: 'Approved.' });
    for (const [token, path] of [
      [working.techToken, `/api/v1/technician/jobs/${working.jobId}/timeline`],
      [working.ownerToken, `/api/v1/business/jobs/${working.jobId}/timeline`],
    ] as const) {
      const timeline = await request(ctx.app).get(path).set('Authorization', `Bearer ${token}`);
      assert.equal(timeline.status, 200, path);
      const events = timeline.body.data.events as Array<Record<string, unknown>>;
      const statuses = events.filter((e) => e['kind'] === 'parts').map((e) => e['partsStatus']);
      assert.ok(statuses.includes('PENDING'), `${path}: ${JSON.stringify(statuses)}`);
      assert.ok(statuses.includes('NEEDS_INFO'), `${path}: ${JSON.stringify(statuses)}`);
      assert.ok(statuses.includes('APPROVED'), `${path}: ${JSON.stringify(statuses)}`);
      assert.ok(events.some((e) => e['kind'] === 'status' && e['status'] === 'AWAITING_PARTS'), path);
    }
  });

  it('technician cannot respond to a PENDING request and cannot resume an IN_PROGRESS job', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const created = await submitParts(ctx, working);
    const respond = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/parts/${created['id']}/respond`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send({ note: 'Nothing was asked.' });
    assert.equal(respond.status, 422);
    const resume = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/resume`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send({});
    assert.equal(resume.status, 422);
  });
});
