/**
 * FixLink Stage 6D — customer quote acceptance tests.
 *
 * Run: npm test (no MySQL required — uses the in-memory jobs + quotes
 * stores with the same rules as the MySQL implementation).
 *
 * Covers: the customer QUOTED → ACCEPTED flow (quote ACCEPTED, job
 * ACCEPTED with the agreed amount recorded, competing quotes retired to
 * DECLINED, history entry), strict ownership (cross-customer and
 * cross-job reads as 404), role rejection (provider, technician,
 * manager, admin → 403), state guards (REQUESTED/COMPLETED/CANCELLED/
 * DISPUTED/INTERNAL, ineligible or already-accepted quotes), failure
 * atomicity, multi-quote handling and the standard API envelopes.
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

interface QuotedJob {
  jobId: string;
  quoteId: string;
}

/** Customer requests a job and the addressed provider quotes it (job QUOTED). */
async function createQuotedJob(ctx: TestContext, customerToken: string, proToken: string): Promise<QuotedJob> {
  const job = await createJob(ctx, customerToken);
  const jobId = job['id'] as string;
  const created = await request(ctx.app)
    .post(`/api/v1/jobs/${jobId}/quotes`)
    .set('Authorization', `Bearer ${proToken}`)
    .send(validQuote());
  assert.equal(created.status, 201, `quote creation failed: ${JSON.stringify(created.body)}`);
  return { jobId, quoteId: (created.body.data as { id: string }).id };
}

describe('POST /api/v1/jobs/:jobId/quotes/:quoteId/accept (customer acceptance)', () => {
  let ctx: TestContext;
  let customerToken: string;
  let proToken: string;
  let quoted: QuotedJob;
  beforeEach(async () => {
    ctx = buildApp();
    customerToken = (await register(ctx.app, 'thandi.khumalo@example.co.za')).token;
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    proToken = pro.token;
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    quoted = await createQuotedJob(ctx, customerToken, proToken);
  });

  it('1. customer retrieves their own quotes before accepting', async () => {
    const list = await request(ctx.app).get(`/api/v1/jobs/${quoted.jobId}/quotes`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(list.status, 200);
    assertSuccessEnvelope(list);
    assert.equal((list.body.data as { total: number }).total, 1);
    const one = await request(ctx.app).get(`/api/v1/quotes/${quoted.quoteId}`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(one.status, 200);
    assertSuccessEnvelope(one);
    assert.equal((one.body.data as { status: string }).status, 'SUBMITTED');
    const detail = await request(ctx.app).get(`/api/v1/jobs/${quoted.jobId}`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(detail.status, 200);
    assert.equal((detail.body.data as { status: string }).status, 'QUOTED');
    assert.equal(((detail.body.data as { quotes: unknown[] }).quotes ?? []).length, 1);
  });

  it('2. customer accepts an eligible quote (200, accepted quote + updated job)', async () => {
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${quoted.jobId}/quotes/${quoted.quoteId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal(res.status, 200);
    assertSuccessEnvelope(res);
    const data = res.body.data as { job: Record<string, unknown>; quote: Record<string, unknown> };
    assert.equal((data.quote as { status: string }).status, 'ACCEPTED');
    assert.equal((data.quote as { id: string }).id, quoted.quoteId);
    assert.equal(data.job['status'], 'ACCEPTED');
    assert.equal(data.job['id'], quoted.jobId);
    assert.equal(data.job['agreedAmount'], 1250);
    assert.equal(data.job['currency'], 'ZAR');
  });

  it('3. job changes QUOTED → ACCEPTED and is retrievable as ACCEPTED', async () => {
    await request(ctx.app)
      .post(`/api/v1/jobs/${quoted.jobId}/quotes/${quoted.quoteId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    const detail = await request(ctx.app).get(`/api/v1/jobs/${quoted.jobId}`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(detail.status, 200);
    const job = detail.body.data as { status: string; agreedAmount: number; currency: string; quotes: Array<{ id: string; status: string }> };
    assert.equal(job.status, 'ACCEPTED');
    assert.equal(job.agreedAmount, 1250);
    assert.equal(job.currency, 'ZAR');
    assert.equal(job.quotes.find((quote) => quote.id === quoted.quoteId)?.status, 'ACCEPTED');
  });

  it('4. quote becomes ACCEPTED and stays retrievable', async () => {
    await request(ctx.app)
      .post(`/api/v1/jobs/${quoted.jobId}/quotes/${quoted.quoteId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    const one = await request(ctx.app).get(`/api/v1/quotes/${quoted.quoteId}`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(one.status, 200);
    const quote = one.body.data as { status: string; total: number; currency: string };
    assert.equal(quote.status, 'ACCEPTED');
    assert.equal(quote.total, 1250);
    assert.equal(quote.currency, 'ZAR');
  });

  it('5. accepted provider is associated with the job', async () => {
    await request(ctx.app)
      .post(`/api/v1/jobs/${quoted.jobId}/quotes/${quoted.quoteId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    const detail = await request(ctx.app).get(`/api/v1/jobs/${quoted.jobId}`).set('Authorization', `Bearer ${customerToken}`);
    const job = detail.body.data as { provider: { id: string }; quotes: Array<{ id: string; provider: { id: string } }> };
    const acceptedQuote = job.quotes.find((quote) => quote.id === quoted.quoteId);
    assert.ok(acceptedQuote);
    // No new provider table: the job keeps the addressed provider and the
    // accepted quote belongs to that same provider.
    assert.equal(job.provider.id, 'professional-1');
    assert.equal(acceptedQuote?.provider.id, job.provider.id);
  });

  it('6. status history records QUOTED → ACCEPTED', async () => {
    await request(ctx.app)
      .post(`/api/v1/jobs/${quoted.jobId}/quotes/${quoted.quoteId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    const history = ctx.quotes.debugHistory();
    assert.ok(history.some((entry) => entry.jobId === quoted.jobId && entry.previous === 'REQUESTED' && entry.next === 'QUOTED'));
    assert.ok(history.some((entry) => entry.jobId === quoted.jobId && entry.previous === 'QUOTED' && entry.next === 'ACCEPTED'));
  });

  it('7. customer cannot accept another customer\u2019s quote (404)', async () => {
    const other = await register(ctx.app, 'sipho.c@example.co.za');
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${quoted.jobId}/quotes/${quoted.quoteId}/accept`)
      .set('Authorization', `Bearer ${other.token}`);
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
    // The job is untouched: the owner still sees it QUOTED.
    const detail = await request(ctx.app).get(`/api/v1/jobs/${quoted.jobId}`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal((detail.body.data as { status: string }).status, 'QUOTED');
  });

  it('8. customer cannot accept a quote belonging to another job (404)', async () => {
    const otherJob = await createJob(ctx, customerToken);
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${otherJob['id']}/quotes/${quoted.quoteId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
    const unknown = await request(ctx.app)
      .post(`/api/v1/jobs/${quoted.jobId}/quotes/9999/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal(unknown.status, 404);
    assertErrorEnvelope(unknown, 'NOT_FOUND');
  });

  it('9. provider cannot accept a quote (403)', async () => {
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${quoted.jobId}/quotes/${quoted.quoteId}/accept`)
      .set('Authorization', `Bearer ${proToken}`);
    assert.equal(res.status, 403);
    assertErrorEnvelope(res, 'FORBIDDEN_ROLE');
  });

  it('10. technician cannot accept a quote (403)', async () => {
    const tech = await provisionUser(ctx, 'tech@example.co.za', ['TECHNICIAN']);
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${quoted.jobId}/quotes/${quoted.quoteId}/accept`)
      .set('Authorization', `Bearer ${tech.token}`);
    assert.equal(res.status, 403);
    assertErrorEnvelope(res, 'FORBIDDEN_ROLE');
    // The job is untouched by the technician attempt.
    const detail = await request(ctx.app).get(`/api/v1/jobs/${quoted.jobId}`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal((detail.body.data as { status: string }).status, 'QUOTED');
  });

  it('business manager without customer ownership cannot accept (403); dual-role owner-customer can', async () => {
    const manager = await provisionUser(ctx, 'manager@example.co.za', ['BUSINESS_MANAGER']);
    const denied = await request(ctx.app)
      .post(`/api/v1/jobs/${quoted.jobId}/quotes/${quoted.quoteId}/accept`)
      .set('Authorization', `Bearer ${manager.token}`);
    assert.equal(denied.status, 403);
    assertErrorEnvelope(denied, 'FORBIDDEN_ROLE');
    // A business manager who IS the owning customer acts as the customer:
    // their own requested + quoted job accepts normally.
    const ownerManager = await provisionUser(ctx, 'owner.manager@example.co.za', ['CUSTOMER', 'BUSINESS_MANAGER']);
    const ownJob = await createJob(ctx, ownerManager.token);
    const ownJobId = ownJob['id'] as string;
    ctx.jobs.debugSetJobStatus(ownJobId, 'QUOTED');
    const ownQuote = ctx.quotes.debugAddQuote(ownJobId, { total: 800 });
    const accepted = await request(ctx.app)
      .post(`/api/v1/jobs/${ownJobId}/quotes/${ownQuote.id}/accept`)
      .set('Authorization', `Bearer ${ownerManager.token}`);
    assert.equal(accepted.status, 200);
    assertSuccessEnvelope(accepted);
  });

  it('admin cannot accept a customer quote (403)', async () => {
    const admin = await provisionUser(ctx, 'admin@example.co.za', ['ADMIN']);
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${quoted.jobId}/quotes/${quoted.quoteId}/accept`)
      .set('Authorization', `Bearer ${admin.token}`);
    assert.equal(res.status, 403);
    assertErrorEnvelope(res, 'FORBIDDEN_ROLE');
  });

  it('11. already accepted quote cannot be accepted again (409)', async () => {
    const first = await request(ctx.app)
      .post(`/api/v1/jobs/${quoted.jobId}/quotes/${quoted.quoteId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal(first.status, 200);
    const second = await request(ctx.app)
      .post(`/api/v1/jobs/${quoted.jobId}/quotes/${quoted.quoteId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal(second.status, 409);
    assertErrorEnvelope(second, 'CONFLICT');
    // State is unchanged by the repeat attempt.
    const detail = await request(ctx.app).get(`/api/v1/jobs/${quoted.jobId}`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal((detail.body.data as { status: string }).status, 'ACCEPTED');
    const acceptedCount = ctx.quotes.debugHistory().filter((entry) => entry.jobId === quoted.jobId && entry.next === 'ACCEPTED').length;
    assert.equal(acceptedCount, 1);
  });

  it('12. ineligible (withdrawn/declined) quotes cannot be accepted (422)', async () => {
    for (const status of ['WITHDRAWN', 'DECLINED'] as const) {
      ctx.quotes.debugSetQuoteStatus(quoted.quoteId, status);
      const res = await request(ctx.app)
        .post(`/api/v1/jobs/${quoted.jobId}/quotes/${quoted.quoteId}/accept`)
        .set('Authorization', `Bearer ${customerToken}`);
      assert.equal(res.status, 422, `expected 422 for ${status}`);
      assertErrorEnvelope(res, 'VALIDATION_ERROR');
      ctx.quotes.debugSetQuoteStatus(quoted.quoteId, 'SUBMITTED');
    }
    const detail = await request(ctx.app).get(`/api/v1/jobs/${quoted.jobId}`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal((detail.body.data as { status: string }).status, 'QUOTED');
  });

  it('13. REQUESTED job cannot accept a quote (422)', async () => {
    ctx.jobs.debugSetJobStatus(quoted.jobId, 'REQUESTED');
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${quoted.jobId}/quotes/${quoted.quoteId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal(res.status, 422);
    assertErrorEnvelope(res, 'VALIDATION_ERROR');
  });

  it('14. COMPLETED job cannot accept a quote (422)', async () => {
    ctx.jobs.debugSetJobStatus(quoted.jobId, 'COMPLETED');
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${quoted.jobId}/quotes/${quoted.quoteId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal(res.status, 422);
    assertErrorEnvelope(res, 'VALIDATION_ERROR');
  });

  it('15. CANCELLED and DISPUTED jobs cannot accept quotes (422)', async () => {
    for (const status of ['CANCELLED', 'DISPUTED'] as const) {
      ctx.jobs.debugSetJobStatus(quoted.jobId, status);
      const res = await request(ctx.app)
        .post(`/api/v1/jobs/${quoted.jobId}/quotes/${quoted.quoteId}/accept`)
        .set('Authorization', `Bearer ${customerToken}`);
      assert.equal(res.status, 422, `expected 422 for ${status}`);
      assertErrorEnvelope(res, 'VALIDATION_ERROR');
    }
  });

  it('16. INTERNAL job cannot use marketplace quote acceptance (404)', async () => {
    ctx.jobs.debugSetJobSource(quoted.jobId, 'INTERNAL');
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${quoted.jobId}/quotes/${quoted.quoteId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
  });

  it('17. failed acceptance leaves every record untouched (rollback)', async () => {
    ctx.quotes.debugSetQuoteStatus(quoted.quoteId, 'WITHDRAWN');
    const historyBefore = ctx.quotes.debugHistory().length;
    const failed = await request(ctx.app)
      .post(`/api/v1/jobs/${quoted.jobId}/quotes/${quoted.quoteId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal(failed.status, 422);
    const detail = await request(ctx.app).get(`/api/v1/jobs/${quoted.jobId}`).set('Authorization', `Bearer ${customerToken}`);
    const job = detail.body.data as { status: string; agreedAmount: number | null };
    assert.equal(job.status, 'QUOTED');
    assert.equal(job.agreedAmount, null);
    const quote = await request(ctx.app).get(`/api/v1/quotes/${quoted.quoteId}`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal((quote.body.data as { status: string }).status, 'WITHDRAWN');
    assert.equal(ctx.quotes.debugHistory().length, historyBefore);
    assert.ok(!ctx.quotes.debugHistory().some((entry) => entry.jobId === quoted.jobId && entry.next === 'ACCEPTED'));
  });

  it('18. multiple quotes are handled: one acceptance wins', async () => {
    const competing = ctx.quotes.debugAddQuote(quoted.jobId, { total: 950 });
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${quoted.jobId}/quotes/${quoted.quoteId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal(res.status, 200);
    assert.equal(((res.body.data as { quote: { id: string } }).quote).id, quoted.quoteId);
    const list = await request(ctx.app).get(`/api/v1/jobs/${quoted.jobId}/quotes`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal((list.body.data as { total: number }).total, 2);
    // No quote is silently deleted — both remain visible with final states.
    const items = (list.body.data as { items: Array<{ id: string; status: string }> }).items;
    assert.equal(items.find((item) => item.id === quoted.quoteId)?.status, 'ACCEPTED');
    assert.equal(items.find((item) => item.id === competing.id)?.status, 'DECLINED');
  });

  it('19. competing quotes are no longer selectable after acceptance', async () => {
    const competing = ctx.quotes.debugAddQuote(quoted.jobId, { total: 950 });
    await request(ctx.app)
      .post(`/api/v1/jobs/${quoted.jobId}/quotes/${quoted.quoteId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    // The retired quote can no longer be accepted (job left QUOTED-path).
    const retry = await request(ctx.app)
      .post(`/api/v1/jobs/${quoted.jobId}/quotes/${competing.id}/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal(retry.status, 422);
    assertErrorEnvelope(retry, 'VALIDATION_ERROR');
    const detail = await request(ctx.app).get(`/api/v1/jobs/${quoted.jobId}`).set('Authorization', `Bearer ${customerToken}`);
    const quotes = (detail.body.data as { quotes: Array<{ id: string; status: string }> }).quotes;
    assert.ok(quotes.filter((quote) => quote.status === 'SUBMITTED').length === 0);
  });

  it('20. malformed ids, unknown jobs and unauthenticated calls keep standard envelopes', async () => {
    const malformedJob = await request(ctx.app)
      .post(`/api/v1/jobs/abc/quotes/${quoted.quoteId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal(malformedJob.status, 400);
    assertErrorEnvelope(malformedJob, 'VALIDATION_ERROR');
    const malformedQuote = await request(ctx.app)
      .post(`/api/v1/jobs/${quoted.jobId}/quotes/abc/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal(malformedQuote.status, 400);
    assertErrorEnvelope(malformedQuote, 'VALIDATION_ERROR');
    const unknownJob = await request(ctx.app)
      .post(`/api/v1/jobs/9999/quotes/${quoted.quoteId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal(unknownJob.status, 404);
    assertErrorEnvelope(unknownJob, 'NOT_FOUND');
    const unauthenticated = await request(ctx.app).post(`/api/v1/jobs/${quoted.jobId}/quotes/${quoted.quoteId}/accept`);
    assert.equal(unauthenticated.status, 401);
    assertErrorEnvelope(unauthenticated, 'UNAUTHORIZED');
  });

  it('provider sees the accepted quote and ACCEPTED status', async () => {
    await request(ctx.app)
      .post(`/api/v1/jobs/${quoted.jobId}/quotes/${quoted.quoteId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    const detail = await request(ctx.app).get(`/api/v1/provider/requests/${quoted.jobId}`).set('Authorization', `Bearer ${proToken}`);
    assert.equal(detail.status, 200);
    const body = detail.body.data as { status: string; quotes: Array<{ id: string; status: string; total: number }> };
    assert.equal(body.status, 'ACCEPTED');
    assert.equal(body.quotes.find((quote) => quote.id === quoted.quoteId)?.status, 'ACCEPTED');
  });
});
