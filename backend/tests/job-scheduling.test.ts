/**
 * FixLink Stage 6E — scheduling & job execution start tests.
 *
 * Run: npm test (no MySQL required — uses the in-memory jobs + quotes
 * stores with the same rules as the MySQL implementation).
 *
 * Covers: the provider ACCEPTED → SCHEDULED → IN_PROGRESS flow (server
 * enforced, history recorded, agreed quote preserved), strict provider
 * association (another provider's job reads as 404), role rejection
 * (customer, technician → 403), state guards (REQUESTED/QUOTED/ACCEPTED/
 * SCHEDULED/IN_PROGRESS gating), scheduledAt validation (required, valid
 * ISO, future, timezone-preserving), failure atomicity, customer
 * read-only visibility and the standard API envelopes.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { MemoryUserRepository } from '../src/modules/auth/memory-user.repository';
import { MemoryRefreshStore } from '../src/modules/auth/refresh.store';
import { MemoryMarketplaceStore } from '../src/modules/marketplace/memory-marketplace.store';
import { MemoryJobsStore } from '../src/modules/jobs/memory-jobs.store';
import { MemoryQuotesStore } from '../src/modules/quotes/memory-quotes.store';

interface TestContext {
  app: Express;
  users: MemoryUserRepository;
  jobs: MemoryJobsStore;
  quotes: MemoryQuotesStore;
}

function buildApp(): TestContext {
  const users = new MemoryUserRepository();
  const jobs = new MemoryJobsStore();
  const quotes = new MemoryQuotesStore(jobs);
  const app = createApp({
    users,
    refreshStore: new MemoryRefreshStore(),
    marketplace: new MemoryMarketplaceStore(),
    jobs,
    quotes,
  });
  return { app, users, jobs, quotes };
}

const PASSWORD = 'Str0ngPassw0rd!';

/** A future SAST slot: 5 October 2026, 10:00 SAST (UTC+2). */
const FUTURE_SLOT = '2026-10-05T10:00:00+02:00';
const FUTURE_SLOT_INSTANT = new Date(FUTURE_SLOT).toISOString();

async function register(app: Express, email: string, role?: string): Promise<{ token: string; userId: string }> {
  const res = await request(app).post('/api/v1/auth/register').send(role ? { email, password: PASSWORD, role } : { email, password: PASSWORD });
  assert.equal(res.status, 201, `register failed for ${email}: ${JSON.stringify(res.body)}`);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  assert.equal(login.status, 200);
  return { token: login.body.data.accessToken as string, userId: login.body.data.user.id as string };
}

function validJob(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    providerId: 'professional-1',
    serviceId: '1',
    description: 'Kitchen mixer tap leaking at the base and the cupboard floor is damp.',
    location: 'Fourways, Johannesburg',
    preferredDate: '2026-10-05',
    ...overrides,
  };
}

function validQuote(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    total: 1250,
    currency: 'ZAR',
    message: 'Supply and install replacement kitchen mixer tap.',
    ...overrides,
  };
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

/**
 * Provision a user with EXACTLY the given roles (no self-registration
 * default). `setRoles` is additive in every repository, so users created
 * through `/auth/register` always keep CUSTOMER — direct creation is the
 * only way to model provisioned-only actors (technician, manager, admin)
 * as production creates them via the business invite flow.
 */
async function provisionUser(ctx: TestContext, email: string, roles: string[]): Promise<{ token: string; userId: string }> {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const user = await ctx.users.create({ email, phone: null, passwordHash });
  await ctx.users.setRoles(user.id, roles);
  const login = await request(ctx.app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  assert.equal(login.status, 200, `login failed for provisioned ${email}: ${JSON.stringify(login.body)}`);
  return { token: login.body.data.accessToken as string, userId: user.id };
}

/** Customer creates a job; returns the created job body. */
async function createJob(ctx: TestContext, customerToken: string, overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const res = await request(ctx.app)
    .post('/api/v1/jobs')
    .set('Authorization', `Bearer ${customerToken}`)
    .send(validJob(overrides));
  assert.equal(res.status, 201, `job creation failed: ${JSON.stringify(res.body)}`);
  return res.body.data as Record<string, unknown>;
}

interface AcceptedJob {
  jobId: string;
  quoteId: string;
}

/** Customer requests, provider quotes, customer accepts (job ACCEPTED). */
async function createAcceptedJob(ctx: TestContext, customerToken: string, proToken: string): Promise<AcceptedJob> {
  const job = await createJob(ctx, customerToken);
  const jobId = job['id'] as string;
  const created = await request(ctx.app)
    .post(`/api/v1/jobs/${jobId}/quotes`)
    .set('Authorization', `Bearer ${proToken}`)
    .send(validQuote());
  assert.equal(created.status, 201, `quote creation failed: ${JSON.stringify(created.body)}`);
  const quoteId = (created.body.data as { id: string }).id;
  const accepted = await request(ctx.app)
    .post(`/api/v1/jobs/${jobId}/quotes/${quoteId}/accept`)
    .set('Authorization', `Bearer ${customerToken}`);
  assert.equal(accepted.status, 200, `quote acceptance failed: ${JSON.stringify(accepted.body)}`);
  return { jobId, quoteId };
}

async function jobStatus(ctx: TestContext, token: string, jobId: string): Promise<string> {
  const detail = await request(ctx.app).get(`/api/v1/jobs/${jobId}`).set('Authorization', `Bearer ${token}`);
  assert.equal(detail.status, 200);
  return (detail.body.data as { status: string }).status;
}

describe('POST /api/v1/jobs/:jobId/schedule (provider scheduling)', () => {
  let ctx: TestContext;
  let customerToken: string;
  let proToken: string;
  let accepted: AcceptedJob;
  beforeEach(async () => {
    ctx = buildApp();
    customerToken = (await register(ctx.app, 'thandi.khumalo@example.co.za')).token;
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    proToken = pro.token;
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    accepted = await createAcceptedJob(ctx, customerToken, proToken);
  });

  it('1. provider can schedule an accepted marketplace job (200, SCHEDULED)', async () => {
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/schedule`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ scheduledAt: FUTURE_SLOT });
    assert.equal(res.status, 200);
    assertSuccessEnvelope(res);
    const job = (res.body.data as { job: Record<string, unknown> }).job;
    assert.equal(job['id'], accepted.jobId);
    assert.equal(job['status'], 'SCHEDULED');
    // The exact instant the provider picked is preserved (08:00Z == 10:00+02:00).
    assert.equal(job['scheduledAt'], FUTURE_SLOT_INSTANT);
    assert.equal(job['agreedAmount'], 1250);
    assert.equal(job['currency'], 'ZAR');
    assert.equal(res.body.message, 'Job scheduled successfully.');
  });

  it('2. provider cannot schedule a REQUESTED job (422)', async () => {
    const job = await createJob(ctx, customerToken);
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${job['id']}/schedule`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ scheduledAt: FUTURE_SLOT });
    assert.equal(res.status, 422);
    assertErrorEnvelope(res, 'VALIDATION_ERROR');
  });

  it('3. provider cannot schedule a QUOTED job (422)', async () => {
    const job = await createJob(ctx, customerToken);
    const jobId = job['id'] as string;
    const created = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${proToken}`)
      .send(validQuote());
    assert.equal(created.status, 201);
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/schedule`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ scheduledAt: FUTURE_SLOT });
    assert.equal(res.status, 422);
    assertErrorEnvelope(res, 'VALIDATION_ERROR');
  });

  it('4. provider cannot schedule another provider\u2019s job (404)', async () => {
    const other = await register(ctx.app, 'johan.pro@example.co.za', 'PROFESSIONAL');
    ctx.quotes.linkProfessionalProfile(other.userId, '2');
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/schedule`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ scheduledAt: FUTURE_SLOT });
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
    // The job is untouched by the foreign attempt.
    assert.equal(await jobStatus(ctx, customerToken, accepted.jobId), 'ACCEPTED');
  });

  it('5. customer cannot schedule the job (403)', async () => {
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/schedule`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ scheduledAt: FUTURE_SLOT });
    assert.equal(res.status, 403);
    assertErrorEnvelope(res, 'FORBIDDEN_ROLE');
    assert.equal(await jobStatus(ctx, customerToken, accepted.jobId), 'ACCEPTED');
  });

  it('6. technician cannot schedule a marketplace job (403)', async () => {
    const tech = await provisionUser(ctx, 'tech@example.co.za', ['TECHNICIAN']);
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/schedule`)
      .set('Authorization', `Bearer ${tech.token}`)
      .send({ scheduledAt: FUTURE_SLOT });
    assert.equal(res.status, 403);
    assertErrorEnvelope(res, 'FORBIDDEN_ROLE');
    assert.equal(await jobStatus(ctx, customerToken, accepted.jobId), 'ACCEPTED');
  });

  it('7. business owner can schedule an applicable business-owned marketplace job', async () => {
    const job = await createJob(ctx, customerToken, { providerId: 'business-1', serviceId: '2' });
    const jobId = job['id'] as string;
    const owner = await register(ctx.app, 'owner@example.co.za', 'BUSINESS_OWNER');
    ctx.quotes.addBusinessMembership(owner.userId, '1', 'OWNER');
    const created = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send(validQuote());
    assert.equal(created.status, 201);
    const quoteId = (created.body.data as { id: string }).id;
    const accept = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes/${quoteId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal(accept.status, 200);
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/schedule`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ scheduledAt: FUTURE_SLOT });
    assert.equal(res.status, 200);
    assertSuccessEnvelope(res);
    assert.equal((res.body.data as { job: { status: string } }).job.status, 'SCHEDULED');
  });

  it('8. business manager can schedule an applicable business-owned marketplace job', async () => {
    const job = await createJob(ctx, customerToken, { providerId: 'business-1', serviceId: '2' });
    const jobId = job['id'] as string;
    const manager = await provisionUser(ctx, 'manager@example.co.za', ['BUSINESS_MANAGER']);
    ctx.quotes.addBusinessMembership(manager.userId, '1', 'MANAGER');
    const created = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send(validQuote());
    assert.equal(created.status, 201);
    const quoteId = (created.body.data as { id: string }).id;
    const accept = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes/${quoteId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal(accept.status, 200);
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/schedule`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send({ scheduledAt: FUTURE_SLOT });
    assert.equal(res.status, 200);
    assert.equal((res.body.data as { job: { status: string } }).job.status, 'SCHEDULED');
  });

  it('9. missing scheduledAt is rejected (422)', async () => {
    for (const body of [{}, { scheduledAt: '' }, { scheduledAt: null }]) {
      const res = await request(ctx.app)
        .post(`/api/v1/jobs/${accepted.jobId}/schedule`)
        .set('Authorization', `Bearer ${proToken}`)
        .send(body);
      assert.equal(res.status, 422, `expected 422 for ${JSON.stringify(body)}`);
      assertErrorEnvelope(res, 'VALIDATION_ERROR');
    }
    assert.equal(await jobStatus(ctx, customerToken, accepted.jobId), 'ACCEPTED');
  });

  it('10. malformed scheduledAt is rejected (422)', async () => {
    for (const scheduledAt of ['not-a-date', '2026-13-40', '2026-02-30', 12345, '10:00']) {
      const res = await request(ctx.app)
        .post(`/api/v1/jobs/${accepted.jobId}/schedule`)
        .set('Authorization', `Bearer ${proToken}`)
        .send({ scheduledAt });
      assert.equal(res.status, 422, `expected 422 for ${JSON.stringify(scheduledAt)}`);
      assertErrorEnvelope(res, 'VALIDATION_ERROR');
    }
    assert.equal(await jobStatus(ctx, customerToken, accepted.jobId), 'ACCEPTED');
  });

  it('11. past scheduledAt is rejected (422)', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/schedule`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ scheduledAt: past });
    assert.equal(res.status, 422);
    assertErrorEnvelope(res, 'VALIDATION_ERROR');
    assert.equal(await jobStatus(ctx, customerToken, accepted.jobId), 'ACCEPTED');
  });

  it('12. scheduling records ACCEPTED \u2192 SCHEDULED history', async () => {
    await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/schedule`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ scheduledAt: FUTURE_SLOT });
    const history = ctx.quotes.debugHistory();
    assert.ok(history.some((entry) => entry.jobId === accepted.jobId && entry.previous === 'ACCEPTED' && entry.next === 'SCHEDULED'));
  });

  it('13. scheduling failure leaves the job ACCEPTED with no SCHEDULED history', async () => {
    const historyBefore = ctx.quotes.debugHistory().length;
    const failed = await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/schedule`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ scheduledAt: 'not-a-date' });
    assert.equal(failed.status, 422);
    assert.equal(await jobStatus(ctx, customerToken, accepted.jobId), 'ACCEPTED');
    assert.equal(ctx.quotes.debugHistory().length, historyBefore);
    assert.ok(!ctx.quotes.debugHistory().some((entry) => entry.jobId === accepted.jobId && entry.next === 'SCHEDULED'));
  });

  it('scheduling without an accepted quote is rejected (422)', async () => {
    // A job forced to ACCEPTED with no ACCEPTED quote row (e.g. data fix-up)
    // must not be schedulable: the agreed quote is the scheduling basis.
    const job = await createJob(ctx, customerToken);
    const jobId = job['id'] as string;
    ctx.jobs.debugSetJobStatus(jobId, 'ACCEPTED');
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/schedule`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ scheduledAt: FUTURE_SLOT });
    assert.equal(res.status, 422);
    assertErrorEnvelope(res, 'VALIDATION_ERROR');
    assert.equal(await jobStatus(ctx, customerToken, jobId), 'ACCEPTED');
  });

  it('timezone is preserved: a +02:00 slot returns the same instant', async () => {
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/schedule`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ scheduledAt: FUTURE_SLOT });
    assert.equal(res.status, 200);
    const job = (res.body.data as { job: { scheduledAt: string } }).job;
    // Same instant, regardless of the offset the provider typed.
    assert.equal(new Date(job['scheduledAt']).getTime(), new Date(FUTURE_SLOT).getTime());
    assert.equal(job['scheduledAt'], FUTURE_SLOT_INSTANT);
  });
});

describe('POST /api/v1/jobs/:jobId/start (provider start)', () => {
  let ctx: TestContext;
  let customerToken: string;
  let proToken: string;
  let accepted: AcceptedJob;
  beforeEach(async () => {
    ctx = buildApp();
    customerToken = (await register(ctx.app, 'thandi.khumalo@example.co.za')).token;
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    proToken = pro.token;
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    accepted = await createAcceptedJob(ctx, customerToken, proToken);
  });

  async function schedule(jobId: string, token: string): Promise<void> {
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/schedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({ scheduledAt: FUTURE_SLOT });
    assert.equal(res.status, 200, `scheduling failed: ${JSON.stringify(res.body)}`);
  }

  it('14. provider can start a SCHEDULED job (200, IN_PROGRESS)', async () => {
    await schedule(accepted.jobId, proToken);
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/start`)
      .set('Authorization', `Bearer ${proToken}`);
    assert.equal(res.status, 200);
    assertSuccessEnvelope(res);
    const job = (res.body.data as { job: Record<string, unknown> }).job;
    assert.equal(job['id'], accepted.jobId);
    assert.equal(job['status'], 'IN_PROGRESS');
    // Schedule and agreed price survive the start.
    assert.equal(job['scheduledAt'], FUTURE_SLOT_INSTANT);
    assert.equal(job['agreedAmount'], 1250);
    assert.equal(res.body.message, 'Job started successfully.');
  });

  it('15. provider cannot start an ACCEPTED job (422)', async () => {
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/start`)
      .set('Authorization', `Bearer ${proToken}`);
    assert.equal(res.status, 422);
    assertErrorEnvelope(res, 'VALIDATION_ERROR');
    assert.equal(await jobStatus(ctx, customerToken, accepted.jobId), 'ACCEPTED');
  });

  it('provider cannot start REQUESTED or QUOTED jobs (422)', async () => {
    const job = await createJob(ctx, customerToken);
    const jobId = job['id'] as string;
    const requested = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/start`)
      .set('Authorization', `Bearer ${proToken}`);
    assert.equal(requested.status, 422);
    assertErrorEnvelope(requested, 'VALIDATION_ERROR');
    const created = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${proToken}`)
      .send(validQuote());
    assert.equal(created.status, 201);
    const quoted = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/start`)
      .set('Authorization', `Bearer ${proToken}`);
    assert.equal(quoted.status, 422);
    assertErrorEnvelope(quoted, 'VALIDATION_ERROR');
  });

  it('16. provider cannot start another provider\u2019s job (404)', async () => {
    await schedule(accepted.jobId, proToken);
    const other = await register(ctx.app, 'johan.pro@example.co.za', 'PROFESSIONAL');
    ctx.quotes.linkProfessionalProfile(other.userId, '2');
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/start`)
      .set('Authorization', `Bearer ${other.token}`);
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
    assert.equal(await jobStatus(ctx, customerToken, accepted.jobId), 'SCHEDULED');
  });

  it('17. customer cannot start the job (403)', async () => {
    await schedule(accepted.jobId, proToken);
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/start`)
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal(res.status, 403);
    assertErrorEnvelope(res, 'FORBIDDEN_ROLE');
    assert.equal(await jobStatus(ctx, customerToken, accepted.jobId), 'SCHEDULED');
  });

  it('18. technician cannot start a marketplace job (403)', async () => {
    await schedule(accepted.jobId, proToken);
    const tech = await provisionUser(ctx, 'tech@example.co.za', ['TECHNICIAN']);
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/start`)
      .set('Authorization', `Bearer ${tech.token}`);
    assert.equal(res.status, 403);
    assertErrorEnvelope(res, 'FORBIDDEN_ROLE');
    assert.equal(await jobStatus(ctx, customerToken, accepted.jobId), 'SCHEDULED');
  });

  it('19. starting records SCHEDULED \u2192 IN_PROGRESS history', async () => {
    await schedule(accepted.jobId, proToken);
    await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/start`)
      .set('Authorization', `Bearer ${proToken}`);
    const history = ctx.quotes.debugHistory();
    assert.ok(history.some((entry) => entry.jobId === accepted.jobId && entry.previous === 'ACCEPTED' && entry.next === 'SCHEDULED'));
    assert.ok(history.some((entry) => entry.jobId === accepted.jobId && entry.previous === 'SCHEDULED' && entry.next === 'IN_PROGRESS'));
  });

  it('20. starting failure leaves the job SCHEDULED with no IN_PROGRESS history', async () => {
    await schedule(accepted.jobId, proToken);
    const historyBefore = ctx.quotes.debugHistory().length;
    // A customer attempt fails authorization; the job must not move.
    const failed = await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/start`)
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal(failed.status, 403);
    assert.equal(await jobStatus(ctx, customerToken, accepted.jobId), 'SCHEDULED');
    assert.equal(ctx.quotes.debugHistory().length, historyBefore);
    assert.ok(!ctx.quotes.debugHistory().some((entry) => entry.jobId === accepted.jobId && entry.next === 'IN_PROGRESS'));
  });

  it('starting an already-started job is rejected (422)', async () => {
    await schedule(accepted.jobId, proToken);
    const first = await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/start`)
      .set('Authorization', `Bearer ${proToken}`);
    assert.equal(first.status, 200);
    const second = await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/start`)
      .set('Authorization', `Bearer ${proToken}`);
    assert.equal(second.status, 422);
    assertErrorEnvelope(second, 'VALIDATION_ERROR');
    const startedCount = ctx.quotes.debugHistory().filter((entry) => entry.jobId === accepted.jobId && entry.next === 'IN_PROGRESS').length;
    assert.equal(startedCount, 1);
  });
});

describe('Stage 6E — customer visibility, quote integrity and envelopes', () => {
  let ctx: TestContext;
  let customerToken: string;
  let proToken: string;
  let accepted: AcceptedJob;
  beforeEach(async () => {
    ctx = buildApp();
    customerToken = (await register(ctx.app, 'thandi.khumalo@example.co.za')).token;
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    proToken = pro.token;
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    accepted = await createAcceptedJob(ctx, customerToken, proToken);
  });

  it('21. customer can retrieve a SCHEDULED job with schedule and price', async () => {
    await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/schedule`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ scheduledAt: FUTURE_SLOT });
    const detail = await request(ctx.app).get(`/api/v1/jobs/${accepted.jobId}`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(detail.status, 200);
    assertSuccessEnvelope(detail);
    const job = detail.body.data as { status: string; scheduledAt: string; agreedAmount: number; currency: string };
    assert.equal(job.status, 'SCHEDULED');
    assert.equal(job.scheduledAt, FUTURE_SLOT_INSTANT);
    assert.equal(job.agreedAmount, 1250);
    assert.equal(job.currency, 'ZAR');
  });

  it('22. customer can retrieve an IN_PROGRESS job', async () => {
    await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/schedule`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ scheduledAt: FUTURE_SLOT });
    await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/start`)
      .set('Authorization', `Bearer ${proToken}`);
    const detail = await request(ctx.app).get(`/api/v1/jobs/${accepted.jobId}`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(detail.status, 200);
    const job = detail.body.data as { status: string; scheduledAt: string; agreedAmount: number };
    assert.equal(job.status, 'IN_PROGRESS');
    assert.equal(job.scheduledAt, FUTURE_SLOT_INSTANT);
    assert.equal(job.agreedAmount, 1250);
  });

  it('23. the accepted quote remains associated with the job', async () => {
    await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/schedule`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ scheduledAt: FUTURE_SLOT });
    await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/start`)
      .set('Authorization', `Bearer ${proToken}`);
    const detail = await request(ctx.app).get(`/api/v1/jobs/${accepted.jobId}`).set('Authorization', `Bearer ${customerToken}`);
    const job = detail.body.data as {
      provider: { id: string };
      quotes: Array<{ id: string; status: string; total: number; provider: { id: string } }>;
    };
    const quote = job.quotes.find((entry) => entry.id === accepted.quoteId);
    assert.ok(quote);
    assert.equal(quote?.status, 'ACCEPTED');
    assert.equal(quote?.total, 1250);
    assert.equal(quote?.provider.id, job.provider.id);
  });

  it('24. the accepted quote cannot be replaced accidentally', async () => {
    await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/schedule`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ scheduledAt: FUTURE_SLOT });
    // A second quote submission after scheduling is rejected — the job
    // left the REQUESTED state long ago and quotes are never overwritten.
    const resubmit = await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/quotes`)
      .set('Authorization', `Bearer ${proToken}`)
      .send(validQuote({ total: 900 }));
    assert.equal(resubmit.status, 422);
    assertErrorEnvelope(resubmit, 'VALIDATION_ERROR');
    const list = await request(ctx.app).get(`/api/v1/jobs/${accepted.jobId}/quotes`).set('Authorization', `Bearer ${customerToken}`);
    const items = (list.body.data as { items: Array<{ id: string; status: string }> }).items;
    assert.equal(items.filter((entry) => entry.status === 'ACCEPTED').length, 1);
    assert.equal(items.find((entry) => entry.id === accepted.quoteId)?.status, 'ACCEPTED');
  });

  it('25. malformed job ids, unknown jobs and unauthenticated calls keep standard envelopes', async () => {
    const malformedSchedule = await request(ctx.app)
      .post('/api/v1/jobs/abc/schedule')
      .set('Authorization', `Bearer ${proToken}`)
      .send({ scheduledAt: FUTURE_SLOT });
    assert.equal(malformedSchedule.status, 400);
    assertErrorEnvelope(malformedSchedule, 'VALIDATION_ERROR');
    const malformedStart = await request(ctx.app).post('/api/v1/jobs/abc/start').set('Authorization', `Bearer ${proToken}`);
    assert.equal(malformedStart.status, 400);
    assertErrorEnvelope(malformedStart, 'VALIDATION_ERROR');
    const unknownSchedule = await request(ctx.app)
      .post('/api/v1/jobs/9999/schedule')
      .set('Authorization', `Bearer ${proToken}`)
      .send({ scheduledAt: FUTURE_SLOT });
    assert.equal(unknownSchedule.status, 404);
    assertErrorEnvelope(unknownSchedule, 'NOT_FOUND');
    const unknownStart = await request(ctx.app).post('/api/v1/jobs/9999/start').set('Authorization', `Bearer ${proToken}`);
    assert.equal(unknownStart.status, 404);
    assertErrorEnvelope(unknownStart, 'NOT_FOUND');
    const unauthenticatedSchedule = await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/schedule`)
      .send({ scheduledAt: FUTURE_SLOT });
    assert.equal(unauthenticatedSchedule.status, 401);
    assertErrorEnvelope(unauthenticatedSchedule, 'UNAUTHORIZED');
    const unauthenticatedStart = await request(ctx.app).post(`/api/v1/jobs/${accepted.jobId}/start`);
    assert.equal(unauthenticatedStart.status, 401);
    assertErrorEnvelope(unauthenticatedStart, 'UNAUTHORIZED');
  });

  it('provider inbox surfaces ACCEPTED, SCHEDULED and IN_PROGRESS requests', async () => {
    const inbox = async (status: string): Promise<number> => {
      const res = await request(ctx.app)
        .get(`/api/v1/provider/requests?status=${status}`)
        .set('Authorization', `Bearer ${proToken}`);
      assert.equal(res.status, 200);
      return (res.body.data as { total: number }).total;
    };
    assert.equal(await inbox('ACCEPTED'), 1);
    await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/schedule`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ scheduledAt: FUTURE_SLOT });
    assert.equal(await inbox('ACCEPTED'), 0);
    assert.equal(await inbox('SCHEDULED'), 1);
    await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/start`)
      .set('Authorization', `Bearer ${proToken}`);
    assert.equal(await inbox('SCHEDULED'), 0);
    assert.equal(await inbox('IN_PROGRESS'), 1);
    // Terminal states are still not inbox states.
    const terminal = await request(ctx.app)
      .get('/api/v1/provider/requests?status=COMPLETED')
      .set('Authorization', `Bearer ${proToken}`);
    assert.equal(terminal.status, 422);
    assertErrorEnvelope(terminal, 'VALIDATION_ERROR');
  });

  it('provider sees the scheduled and in-progress job detail', async () => {
    await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/schedule`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ scheduledAt: FUTURE_SLOT });
    const scheduled = await request(ctx.app).get(`/api/v1/provider/requests/${accepted.jobId}`).set('Authorization', `Bearer ${proToken}`);
    assert.equal(scheduled.status, 200);
    assert.equal((scheduled.body.data as { status: string }).status, 'SCHEDULED');
    assert.equal((scheduled.body.data as { scheduledAt: string }).scheduledAt, FUTURE_SLOT_INSTANT);
    await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/start`)
      .set('Authorization', `Bearer ${proToken}`);
    const active = await request(ctx.app).get(`/api/v1/provider/requests/${accepted.jobId}`).set('Authorization', `Bearer ${proToken}`);
    assert.equal(active.status, 200);
    assert.equal((active.body.data as { status: string }).status, 'IN_PROGRESS');
  });
});
