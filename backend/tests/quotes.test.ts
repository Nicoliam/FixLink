/**
 * FixLink Stage 6C — provider requests & quotes tests.
 *
 * Run: npm test (no MySQL required — uses the in-memory jobs + quotes
 * stores with the same rules as the MySQL implementation).
 *
 * Covers: provider inbox scoping (professional, business owner, manager),
 * request detail authorization, quote submission + validation, the
 * REQUESTED → QUOTED transition with history, duplicate-quote handling,
 * quote retrieval, role rejection (customer, technician, admin, unrelated
 * providers/businesses) and the standard API envelopes.
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

/** Customer creates a job; returns the created job body. */
async function createJob(ctx: TestContext, customerToken: string, overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const res = await request(ctx.app)
    .post('/api/v1/jobs')
    .set('Authorization', `Bearer ${customerToken}`)
    .send(validJob(overrides));
  assert.equal(res.status, 201, `job creation failed: ${JSON.stringify(res.body)}`);
  return res.body.data as Record<string, unknown>;
}

describe('GET /api/v1/provider/requests (provider inbox)', () => {
  let ctx: TestContext;
  let customerToken: string;
  let proToken: string;
  let jobId: string;
  beforeEach(async () => {
    ctx = buildApp();
    customerToken = (await register(ctx.app, 'thandi.khumalo@example.co.za')).token;
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    proToken = pro.token;
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    jobId = (await createJob(ctx, customerToken))['id'] as string;
  });

  it('1. provider retrieves their marketplace requests (200, standard envelope)', async () => {
    const res = await request(ctx.app).get('/api/v1/provider/requests').set('Authorization', `Bearer ${proToken}`);
    assert.equal(res.status, 200);
    assertSuccessEnvelope(res);
    const data = res.body.data as { items: Array<Record<string, unknown>>; total: number };
    assert.equal(data.total, 1);
    assert.equal(data.items[0]?.['id'], jobId);
    assert.equal(data.items[0]?.['status'], 'REQUESTED');
  });

  it('provider does not see requests addressed to another provider', async () => {
    const other = await register(ctx.app, 'johan.pro@example.co.za', 'PROFESSIONAL');
    ctx.quotes.linkProfessionalProfile(other.userId, '2');
    const res = await request(ctx.app).get('/api/v1/provider/requests').set('Authorization', `Bearer ${other.token}`);
    assert.equal(res.status, 200);
    assert.equal((res.body.data as { total: number }).total, 0);
  });

  it('2. business owner retrieves business marketplace requests', async () => {
    const job = await createJob(ctx, customerToken, { providerId: 'business-1', serviceId: '2' });
    const owner = await register(ctx.app, 'owner@example.co.za', 'BUSINESS_OWNER');
    ctx.quotes.addBusinessMembership(owner.userId, '1', 'OWNER');
    const res = await request(ctx.app).get('/api/v1/provider/requests').set('Authorization', `Bearer ${owner.token}`);
    assert.equal(res.status, 200);
    const data = res.body.data as { items: Array<Record<string, unknown>>; total: number };
    assert.equal(data.total, 1);
    assert.equal(data.items[0]?.['id'], job['id']);
  });

  it('business manager retrieves business requests where membership allows it', async () => {
    await createJob(ctx, customerToken, { providerId: 'business-1', serviceId: '2' });
    const manager = await register(ctx.app, 'manager@example.co.za');
    await ctx.users.setRoles(manager.userId, ['BUSINESS_MANAGER']);
    ctx.quotes.addBusinessMembership(manager.userId, '1', 'MANAGER');
    const res = await request(ctx.app).get('/api/v1/provider/requests').set('Authorization', `Bearer ${manager.token}`);
    assert.equal(res.status, 200);
    assert.equal((res.body.data as { total: number }).total, 1);
  });

  it('3. customer cannot retrieve the provider inbox (403)', async () => {
    const res = await request(ctx.app).get('/api/v1/provider/requests').set('Authorization', `Bearer ${customerToken}`);
    assert.equal(res.status, 403);
    assertErrorEnvelope(res, 'FORBIDDEN_ROLE');
  });

  it('4. technician cannot retrieve marketplace provider requests (403)', async () => {
    const tech = await register(ctx.app, 'tech@example.co.za');
    await ctx.users.setRoles(tech.userId, ['TECHNICIAN']);
    const res = await request(ctx.app).get('/api/v1/provider/requests').set('Authorization', `Bearer ${tech.token}`);
    assert.equal(res.status, 403);
    assertErrorEnvelope(res, 'FORBIDDEN_ROLE');
  });

  it('rejects unauthenticated inbox access (401)', async () => {
    const res = await request(ctx.app).get('/api/v1/provider/requests');
    assert.equal(res.status, 401);
    assertErrorEnvelope(res, 'UNAUTHORIZED');
  });

  it('supports status filtering and rejects invalid filters', async () => {
    const filtered = await request(ctx.app)
      .get('/api/v1/provider/requests?status=REQUESTED')
      .set('Authorization', `Bearer ${proToken}`);
    assert.equal(filtered.status, 200);
    assert.equal((filtered.body.data as { total: number }).total, 1);
    const quoted = await request(ctx.app)
      .get('/api/v1/provider/requests?status=QUOTED')
      .set('Authorization', `Bearer ${proToken}`);
    assert.equal(quoted.status, 200);
    assert.equal((quoted.body.data as { total: number }).total, 0);
    const bad = await request(ctx.app)
      .get('/api/v1/provider/requests?status=COMPLETED')
      .set('Authorization', `Bearer ${proToken}`);
    assert.equal(bad.status, 422);
    assertErrorEnvelope(bad, 'VALIDATION_ERROR');
  });
});

describe('GET /api/v1/provider/requests/:id (request detail)', () => {
  let ctx: TestContext;
  let customerToken: string;
  let proToken: string;
  let jobId: string;
  beforeEach(async () => {
    ctx = buildApp();
    customerToken = (await register(ctx.app, 'lerato.m@example.co.za')).token;
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    proToken = pro.token;
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    jobId = (await createJob(ctx, customerToken))['id'] as string;
  });

  it('5. provider retrieves an authorized request with quoting context', async () => {
    const res = await request(ctx.app).get(`/api/v1/provider/requests/${jobId}`).set('Authorization', `Bearer ${proToken}`);
    assert.equal(res.status, 200);
    assertSuccessEnvelope(res);
    const detail = res.body.data as Record<string, unknown>;
    assert.equal(detail['id'], jobId);
    assert.equal(detail['status'], 'REQUESTED');
    assert.ok(typeof (detail['description'] as string) === 'string');
    assert.ok(typeof (detail['location'] as string) === 'string');
    const customer = detail['customer'] as { displayName: string };
    assert.ok(customer.displayName.length > 0);
    // No private contact details leak into the provider projection.
    assert.ok(!('email' in detail) && !('phone' in detail));
    assert.deepEqual(detail['quotes'], []);
  });

  it('6. provider cannot retrieve another provider\u2019s request (404)', async () => {
    const other = await register(ctx.app, 'johan.pro@example.co.za', 'PROFESSIONAL');
    ctx.quotes.linkProfessionalProfile(other.userId, '2');
    const res = await request(ctx.app).get(`/api/v1/provider/requests/${jobId}`).set('Authorization', `Bearer ${other.token}`);
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
  });

  it('returns 400 for a malformed request id', async () => {
    const res = await request(ctx.app).get('/api/v1/provider/requests/abc').set('Authorization', `Bearer ${proToken}`);
    assert.equal(res.status, 400);
    assertErrorEnvelope(res, 'VALIDATION_ERROR');
  });
});

describe('POST /api/v1/jobs/:jobId/quotes (quote submission)', () => {
  let ctx: TestContext;
  let customerToken: string;
  let proToken: string;
  let jobId: string;
  beforeEach(async () => {
    ctx = buildApp();
    customerToken = (await register(ctx.app, 'naledi.s@example.co.za')).token;
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    proToken = pro.token;
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    jobId = (await createJob(ctx, customerToken))['id'] as string;
  });

  it('7. provider submits a valid quote (201, standard envelope)', async () => {
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${proToken}`)
      .send(validQuote());
    assert.equal(res.status, 201);
    assertSuccessEnvelope(res);
    const quote = res.body.data as Record<string, unknown>;
    assert.ok(quote['id']);
    assert.equal(quote['jobId'], jobId);
    assert.equal(quote['total'], 1250);
    assert.equal(quote['currency'], 'ZAR');
    assert.equal(quote['message'], 'Supply and install replacement kitchen mixer tap.');
    assert.equal(quote['status'], 'SUBMITTED');
    assert.ok(quote['submittedAt']);
  });

  it('8. quote is stored and retrievable; 9. items carry derived totals', async () => {
    const created = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${proToken}`)
      .send(validQuote({ items: [{ description: 'Labour', quantity: 1, unitPrice: 950 }, { description: 'Mixer cartridge', quantity: 2, unitPrice: 150 }] }));
    assert.equal(created.status, 201);
    const quoteId = (created.body.data as { id: string }).id;
    const fetched = await request(ctx.app).get(`/api/v1/quotes/${quoteId}`).set('Authorization', `Bearer ${proToken}`);
    assert.equal(fetched.status, 200);
    const quote = fetched.body.data as { total: number; items: Array<{ description: string; quantity: number; unitPrice: number; total: number }> };
    assert.equal(quote.total, 1250);
    assert.equal(quote.items.length, 2);
    assert.equal(quote.items[0]?.total, 950);
    assert.equal(quote.items[1]?.total, 300);
  });

  it('10. job transitions REQUESTED \u2192 QUOTED with 11. history recorded', async () => {
    await request(ctx.app).post(`/api/v1/jobs/${jobId}/quotes`).set('Authorization', `Bearer ${proToken}`).send(validQuote());
    const mine = await request(ctx.app).get(`/api/v1/jobs/${jobId}`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(mine.status, 200);
    assert.equal((mine.body.data as { status: string }).status, 'QUOTED');
    const history = ctx.quotes.debugHistory();
    assert.ok(history.some((entry) => entry.jobId === jobId && entry.previous === 'REQUESTED' && entry.next === 'QUOTED'));
  });

  it('12. invalid quote amounts are rejected (422)', async () => {
    for (const total of [-1, 'many', null, Number.NaN, 10000000000]) {
      const res = await request(ctx.app)
        .post(`/api/v1/jobs/${jobId}/quotes`)
        .set('Authorization', `Bearer ${proToken}`)
        .send(validQuote({ total }));
      assert.equal(res.status, 422, `expected 422 for total ${String(total)}`);
      assertErrorEnvelope(res, 'VALIDATION_ERROR');
    }
  });

  it('13. invalid quote items are rejected (422)', async () => {
    const cases: Record<string, unknown>[] = [
      { items: [{ description: 'Labour', quantity: 0, unitPrice: 100 }] },
      { items: [{ description: 'Labour', quantity: -2, unitPrice: 100 }] },
      { items: [{ description: 'Labour', quantity: 1, unitPrice: -5 }] },
      { items: [{ description: '', quantity: 1, unitPrice: 100 }] },
      { items: 'not-a-list' },
    ];
    for (const payload of cases) {
      const res = await request(ctx.app)
        .post(`/api/v1/jobs/${jobId}/quotes`)
        .set('Authorization', `Bearer ${proToken}`)
        .send({ ...validQuote(), ...payload });
      assert.equal(res.status, 422, `expected 422 for ${JSON.stringify(payload)}`);
      assertErrorEnvelope(res, 'VALIDATION_ERROR');
    }
  });

  it('14. unknown and malformed job ids are rejected', async () => {
    const unknown = await request(ctx.app)
      .post('/api/v1/jobs/9999/quotes')
      .set('Authorization', `Bearer ${proToken}`)
      .send(validQuote());
    assert.equal(unknown.status, 404);
    assertErrorEnvelope(unknown, 'NOT_FOUND');
    const malformed = await request(ctx.app)
      .post('/api/v1/jobs/abc/quotes')
      .set('Authorization', `Bearer ${proToken}`)
      .send(validQuote());
    assert.equal(malformed.status, 400);
    assertErrorEnvelope(malformed, 'VALIDATION_ERROR');
  });

  it('15. provider cannot quote an unrelated job (404)', async () => {
    const other = await register(ctx.app, 'johan.pro@example.co.za', 'PROFESSIONAL');
    ctx.quotes.linkProfessionalProfile(other.userId, '2');
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${other.token}`)
      .send(validQuote());
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
  });

  it('business A cannot quote business B\u2019s job', async () => {
    const job = await createJob(ctx, customerToken, { providerId: 'business-1', serviceId: '2' });
    const ownerB = await register(ctx.app, 'ownerb@example.co.za', 'BUSINESS_OWNER');
    ctx.quotes.addBusinessMembership(ownerB.userId, '2', 'OWNER');
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${job['id']}/quotes`)
      .set('Authorization', `Bearer ${ownerB.token}`)
      .send(validQuote());
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
  });

  it('16. customer cannot submit a quote (403)', async () => {
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send(validQuote());
    assert.equal(res.status, 403);
    assertErrorEnvelope(res, 'FORBIDDEN_ROLE');
  });

  it('17. technician cannot submit a quote (403)', async () => {
    const tech = await register(ctx.app, 'tech@example.co.za');
    await ctx.users.setRoles(tech.userId, ['TECHNICIAN']);
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${tech.token}`)
      .send(validQuote());
    assert.equal(res.status, 403);
    assertErrorEnvelope(res, 'FORBIDDEN_ROLE');
  });

  it('18. duplicate/second quote is rejected without overwriting (409)', async () => {
    const first = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${proToken}`)
      .send(validQuote());
    assert.equal(first.status, 201);
    const second = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${proToken}`)
      .send(validQuote({ total: 999 }));
    assert.equal(second.status, 409);
    assertErrorEnvelope(second, 'CONFLICT');
    const list = await request(ctx.app).get(`/api/v1/jobs/${jobId}/quotes`).set('Authorization', `Bearer ${proToken}`);
    assert.equal((list.body.data as { total: number }).total, 1);
    assert.equal(((list.body.data as { items: Array<{ total: number }> }).items[0] as { total: number }).total, 1250);
  });

  it('19. failed quote creation leaves the job REQUESTED', async () => {
    const bad = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${proToken}`)
      .send(validQuote({ total: -50 }));
    assert.equal(bad.status, 422);
    const mine = await request(ctx.app).get(`/api/v1/jobs/${jobId}`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal((mine.body.data as { status: string }).status, 'REQUESTED');
    assert.deepEqual((mine.body.data as { quotes: unknown[] }).quotes, []);
    assert.equal(ctx.quotes.debugHistory().length, 0);
  });
});

describe('quote retrieval (Part F)', () => {
  let ctx: TestContext;
  let customerToken: string;
  let otherCustomerToken: string;
  let proToken: string;
  let jobId: string;
  let quoteId: string;
  beforeEach(async () => {
    ctx = buildApp();
    customerToken = (await register(ctx.app, 'zanele.d@example.co.za')).token;
    otherCustomerToken = (await register(ctx.app, 'sipho.c@example.co.za')).token;
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    proToken = pro.token;
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    jobId = (await createJob(ctx, customerToken))['id'] as string;
    const created = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${proToken}`)
      .send(validQuote());
    assert.equal(created.status, 201);
    quoteId = (created.body.data as { id: string }).id;
  });

  it('customer retrieves quotes for their own job', async () => {
    const list = await request(ctx.app).get(`/api/v1/jobs/${jobId}/quotes`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(list.status, 200);
    assertSuccessEnvelope(list);
    assert.equal((list.body.data as { total: number }).total, 1);
    const one = await request(ctx.app).get(`/api/v1/quotes/${quoteId}`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(one.status, 200);
    assert.equal((one.body.data as { total: number }).total, 1250);
    // Embedded in the customer job detail as well.
    const detail = await request(ctx.app).get(`/api/v1/jobs/${jobId}`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(((detail.body.data as { quotes: Array<{ id: string }> }).quotes[0] as { id: string }).id, quoteId);
  });

  it('provider retrieves the quote they submitted', async () => {
    const res = await request(ctx.app).get(`/api/v1/quotes/${quoteId}`).set('Authorization', `Bearer ${proToken}`);
    assert.equal(res.status, 200);
    assertSuccessEnvelope(res);
  });

  it('another customer\u2019s quotes read as 404', async () => {
    const list = await request(ctx.app).get(`/api/v1/jobs/${jobId}/quotes`).set('Authorization', `Bearer ${otherCustomerToken}`);
    assert.equal(list.status, 404);
    assertErrorEnvelope(list, 'NOT_FOUND');
    const one = await request(ctx.app).get(`/api/v1/quotes/${quoteId}`).set('Authorization', `Bearer ${otherCustomerToken}`);
    assert.equal(one.status, 404);
    assertErrorEnvelope(one, 'NOT_FOUND');
  });

  it('admin has no quoting-provider access in this stage', async () => {
    // Platform admin quote management belongs to the later admin surface
    // (/api/v1/admin/*). Here an ADMIN-role holder with no customer
    // ownership sees another customer's quote as 404 (no probing), and an
    // ADMIN cannot submit provider quotes (403, covered by the role gate).
    const admin = await register(ctx.app, 'admin@example.co.za');
    await ctx.users.setRoles(admin.userId, ['ADMIN']);
    const res = await request(ctx.app).get(`/api/v1/quotes/${quoteId}`).set('Authorization', `Bearer ${admin.token}`);
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
    const submit = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send(validQuote());
    assert.equal(submit.status, 403);
    assertErrorEnvelope(submit, 'FORBIDDEN_ROLE');
  });
});
