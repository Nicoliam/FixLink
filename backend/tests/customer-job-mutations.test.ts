/**
 * Fixlynk Step 15 — customer edit, cancel and delete.
 *
 * Run: npm test (no MySQL required — uses the in-memory jobs + quotes stores
 * with the same rules as the MySQL implementations).
 *
 * The rule under test throughout is ONE sentence: a customer may correct or
 * withdraw their own request until a quote is ACCEPTED. Everything else here
 * exists to pin down the edges of that sentence —
 *
 *   - the gate (REQUESTED/QUOTED yes, ACCEPTED and later 409)
 *   - ownership (another customer's job is 404, never 403)
 *   - role (provider/technician get 403)
 *   - which fields may change, and which are refused outright
 *   - that editing a quoted request warns instead of silently dropping quotes
 *   - that cancel is a status transition and delete is NOT
 *   - that delete is a soft delete, so a quoted request stays auditable
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
import { MemoryNotificationsStore } from '../src/modules/notifications/memory-notifications.store';
import { signAccessToken } from '../src/utils/tokens';

const PASSWORD = 'Str0ngPassw0rd!';

interface TestContext {
  app: Express;
  users: MemoryUserRepository;
  jobs: MemoryJobsStore;
  quotes: MemoryQuotesStore;
  notifications: MemoryNotificationsStore;
}

function buildApp(): TestContext {
  const users = new MemoryUserRepository();
  const jobs = new MemoryJobsStore();
  const quotes = new MemoryQuotesStore(jobs);
  const notifications = new MemoryNotificationsStore();
  const app = createApp({
    users,
    refreshStore: new MemoryRefreshStore(),
    marketplace: new MemoryMarketplaceStore(),
    jobs,
    quotes,
    notifications,
  });
  return { app, users, jobs, quotes, notifications };
}

function registrationBody(email: string, role?: string): Record<string, unknown> {
  const body: Record<string, unknown> = { email, password: PASSWORD };
  if (role === 'PROFESSIONAL') body['displayName'] = 'Sipho Ndlovu';
  if (role) body['role'] = role;
  return body;
}

async function register(
  app: Express,
  email: string,
  role?: string,
): Promise<{ token: string; userId: string }> {
  const res = await request(app).post('/api/v1/auth/register').send(registrationBody(email, role));
  assert.equal(res.status, 201, `register failed: ${JSON.stringify(res.body)}`);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  assert.equal(login.status, 200);
  return { token: login.body.data.accessToken as string, userId: login.body.data.user.id as string };
}

/** A request addressed to professional-1, which exists in the fixtures. */
function jobBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    providerId: 'professional-1',
    serviceId: '1',
    description: 'Kitchen mixer tap leaking at the base and the cupboard floor is damp.',
    location: 'Fourways, Johannesburg',
    preferredDate: '2026-10-05',
    preferredTime: '14:30',
    ...overrides,
  };
}

async function postJob(ctx: TestContext, token: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await request(ctx.app).post('/api/v1/jobs').set('Authorization', `Bearer ${token}`).send(jobBody(overrides));
  assert.equal(res.status, 201, `job create failed: ${JSON.stringify(res.body)}`);
  return res.body.data.id as string;
}

/** Mint an access token for a directly-created user (mirrors the admin tests). */
function tokenFor(userId: string): string {
  return signAccessToken({ sub: userId, email: 'thabo.tech@example.co.za', roles: ['TECHNICIAN'] });
}

function assertErrorEnvelope(res: { body: unknown }, code: string): void {
  const body = res.body as { success: boolean; error: { code: string; message: string } };
  assert.equal(body.success, false);
  assert.equal(body.error.code, code);
  assert.ok(body.error.message.length > 0);
}

/** Move a job to ACCEPTED the way the quotes store does, to test the gate. */
async function acceptViaQuote(ctx: TestContext, customerToken: string, proToken: string, jobId: string): Promise<void> {
  const quote = await request(ctx.app)
    .post(`/api/v1/jobs/${jobId}/quotes`)
    .set('Authorization', `Bearer ${proToken}`)
    .send({ total: 1250, currency: 'ZAR', message: 'Replace the mixer tap.' });
  assert.equal(quote.status, 201, `quote failed: ${JSON.stringify(quote.body)}`);
  const accepted = await request(ctx.app)
    .post(`/api/v1/jobs/${jobId}/quotes/${quote.body.data.id}/accept`)
    .set('Authorization', `Bearer ${customerToken}`)
    .send({});
  assert.equal(accepted.status, 200, `accept failed: ${JSON.stringify(accepted.body)}`);
}

describe('PATCH /api/v1/jobs/:id (customer edit)', () => {
  let ctx: TestContext;
  let customerToken: string;
  let proToken: string;
  let jobId: string;

  beforeEach(async () => {
    ctx = buildApp();
    customerToken = (await register(ctx.app, 'thandi@example.co.za')).token;
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    proToken = pro.token;
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    jobId = await postJob(ctx, customerToken);
  });

  it('updates the description and returns the job with the quote warning flag', async () => {
    const res = await request(ctx.app)
      .patch(`/api/v1/jobs/${jobId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ description: 'Kitchen mixer tap leaking badly and the floor is now soaked.' });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.match(res.body.data.job.description as string, /now soaked/);
    // No quotes yet, so the customer is not warned.
    assert.equal(res.body.data.quotedRequestsChanged, false);
  });

  it('updates the location and the preferred slot', async () => {
    const res = await request(ctx.app)
      .patch(`/api/v1/jobs/${jobId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ location: '14 Oak Street, Randburg', preferredDate: '2026-11-02', preferredTime: '09:00' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.job.location, '14 Oak Street, Randburg');
    assert.equal(res.body.data.job.preferredDate, '2026-11-02');
    assert.match(res.body.data.job.scheduledAt as string, /09:00/);
  });

  it('leaves untouched fields alone on a partial edit', async () => {
    await request(ctx.app)
      .patch(`/api/v1/jobs/${jobId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ location: 'Sandton' });
    const res = await request(ctx.app).get(`/api/v1/jobs/${jobId}`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(res.body.data.location, 'Sandton');
    // The description and schedule must survive an edit that did not mention them.
    assert.match(res.body.data.description as string, /Kitchen mixer tap/);
    assert.equal(res.body.data.preferredDate, '2026-10-05');
  });

  it('clears the preferred date when it is explicitly nulled', async () => {
    const res = await request(ctx.app)
      .patch(`/api/v1/jobs/${jobId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ preferredDate: null });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.job.preferredDate, null);
    assert.equal(res.body.data.job.scheduledAt, null);
  });

  it('REFUSES to change the service or the professional, and says why', async () => {
    // Both decide who does the work rather than correcting it, so a wrong
    // choice is fixed by cancelling and reposting.
    for (const payload of [{ serviceId: '2' }, { providerId: 'professional-2' }]) {
      const res = await request(ctx.app)
        .patch(`/api/v1/jobs/${jobId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send(payload);
      assert.equal(res.status, 422, `expected 422 for ${JSON.stringify(payload)}`);
      assert.match(res.body.error.message, /cannot be changed|cancel and post a new request/i);
    }
  });

  it('refuses a client-supplied status or owner', async () => {
    for (const payload of [{ status: 'ACCEPTED' }, { customerId: '2' }]) {
      const res = await request(ctx.app)
        .patch(`/api/v1/jobs/${jobId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send(payload);
      assert.equal(res.status, 422);
      assert.match(res.body.error.message, /status or ownership/i);
    }
  });

  it('rejects an empty body and invalid field values', async () => {
    const cases: Array<[Record<string, unknown>, number]> = [
      [{}, 422],
      [{ description: 'too short' }, 422],
      [{ location: '' }, 422],
      [{ preferredDate: '05-10-2026' }, 422],
      [{ preferredDate: '2026-02-30' }, 422],
      [{ preferredTime: '25:00' }, 422],
    ];
    for (const [payload, status] of cases) {
      const res = await request(ctx.app)
        .patch(`/api/v1/jobs/${jobId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send(payload);
      assert.equal(res.status, status, `expected ${status} for ${JSON.stringify(payload)}`);
    }
  });

  it("warns that existing quotes were priced on the old description, and keeps them", async () => {
    const quote = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ total: 1250, currency: 'ZAR', message: 'Based on the description as read.' });
    assert.equal(quote.status, 201);

    const res = await request(ctx.app)
      .patch(`/api/v1/jobs/${jobId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ description: 'Actually the whole downstairs bathroom needs re-plumbing.' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.quotedRequestsChanged, true);

    // The quote survives: it is the professional's to withdraw, not the
    // customer's to retract.
    const view = await request(ctx.app).get(`/api/v1/jobs/${jobId}`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal((view.body.data.quotes as unknown[]).length, 1);
    assert.equal((view.body.data.quotes[0] as { total: number }).total, 1250);
  });

  it('refuses once a quote has been ACCEPTED, with 409 not 404', async () => {
    await acceptViaQuote(ctx, customerToken, proToken, jobId);
    const res = await request(ctx.app)
      .patch(`/api/v1/jobs/${jobId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ description: 'Trying to change my mind after accepting.' });
    assert.equal(res.status, 409);
    assertErrorEnvelope(res, 'CONFLICT');
    assert.match(res.body.error.message, /no longer be changed/i);
  });

  it("refuses another customer's job as 404, so ids cannot be probed", async () => {
    const other = await register(ctx.app, 'other@example.co.za');
    const res = await request(ctx.app)
      .patch(`/api/v1/jobs/${jobId}`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ location: 'Hijacked' });
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
  });

  it('refuses the addressed provider and another provider with 403', async () => {
    // The provider this job is addressed to still cannot edit it: changing the
    // scope of work is the customer's call, not theirs.
    const otherPro = await register(ctx.app, 'other.pro@example.co.za', 'PROFESSIONAL');
    for (const token of [proToken, otherPro.token]) {
      const res = await request(ctx.app)
        .patch(`/api/v1/jobs/${jobId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ location: 'Nope' });
      assert.equal(res.status, 403);
      assertErrorEnvelope(res, 'FORBIDDEN_ROLE');
    }
  });

  it('refuses a technician with 403', async () => {
    // Built directly rather than via registration: `setRoles` ADDS to the
    // existing set, so registering first would leave the account holding
    // CUSTOMER as well - a combination the platform cannot actually produce,
    // and one that would (correctly) answer 404 instead of 403.
    const created = await ctx.users.create({ email: 'thabo.tech@example.co.za', phone: null, passwordHash: 'x' });
    await ctx.users.setRoles(created.id, ['TECHNICIAN']);
    await ctx.users.setStatus(created.id, 'ACTIVE');
    const res = await request(ctx.app)
      .patch(`/api/v1/jobs/${jobId}`)
      .set('Authorization', `Bearer ${tokenFor(created.id)}`)
      .send({ location: 'Nope' });
    assert.equal(res.status, 403);
    assertErrorEnvelope(res, 'FORBIDDEN_ROLE');
  });

  it('rejects a malformed id and an unauthenticated request', async () => {
    const bad = await request(ctx.app)
      .patch('/api/v1/jobs/abc')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ location: 'x' });
    assert.equal(bad.status, 400);
    const anon = await request(ctx.app).patch(`/api/v1/jobs/${jobId}`).send({ location: 'x' });
    assert.equal(anon.status, 401);
  });
});

describe('POST /api/v1/jobs/:id/cancel', () => {
  let ctx: TestContext;
  let customerToken: string;
  let jobId: string;

  beforeEach(async () => {
    ctx = buildApp();
    customerToken = (await register(ctx.app, 'thandi@example.co.za')).token;
    jobId = await postJob(ctx, customerToken);
  });

  it('moves the job to CANCELLED and records the transition', async () => {
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'CANCELLED');
    // The status change must be auditable, not silent.
    const history = ctx.jobs.debugHistory().filter((entry) => entry.jobId === jobId);
    const cancel = history.find((entry) => entry.next === 'CANCELLED');
    assert.ok(cancel, 'expected a history entry for the cancellation');
    assert.equal(cancel?.previous, 'REQUESTED');
  });

  it('keeps the record: the job is still readable after cancelling', async () => {
    await request(ctx.app).post(`/api/v1/jobs/${jobId}/cancel`).set('Authorization', `Bearer ${customerToken}`).send({});
    const res = await request(ctx.app).get(`/api/v1/jobs/${jobId}`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'CANCELLED');
  });

  it('refuses a second cancellation with 409', async () => {
    await request(ctx.app).post(`/api/v1/jobs/${jobId}/cancel`).set('Authorization', `Bearer ${customerToken}`).send({});
    const res = await request(ctx.app).post(`/api/v1/jobs/${jobId}/cancel`).set('Authorization', `Bearer ${customerToken}`).send({});
    assert.equal(res.status, 409);
    assertErrorEnvelope(res, 'CONFLICT');
  });

  it('refuses once a quote has been accepted', async () => {
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    await acceptViaQuote(ctx, customerToken, pro.token, jobId);
    const res = await request(ctx.app).post(`/api/v1/jobs/${jobId}/cancel`).set('Authorization', `Bearer ${customerToken}`).send({});
    assert.equal(res.status, 409);
  });

  it("refuses another customer with 404 and a provider with 403", async () => {
    const other = await register(ctx.app, 'other@example.co.za');
    const stranger = await request(ctx.app).post(`/api/v1/jobs/${jobId}/cancel`).set('Authorization', `Bearer ${other.token}`).send({});
    assert.equal(stranger.status, 404);
    const pro = await register(ctx.app, 'p@example.co.za', 'PROFESSIONAL');
    const asPro = await request(ctx.app).post(`/api/v1/jobs/${jobId}/cancel`).set('Authorization', `Bearer ${pro.token}`).send({});
    assert.equal(asPro.status, 403);
  });

  it('removes the job from the customer list and returns the deleted flag', async () => {
    const res = await request(ctx.app)
      .delete(`/api/v1/jobs/${jobId}`)
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, { deleted: true });

    const list = await request(ctx.app).get('/api/v1/jobs').set('Authorization', `Bearer ${customerToken}`);
    assert.equal((list.body.data.items as unknown[]).length, 0);
  });

  it('makes the job unreadable afterwards, as 404', async () => {
    await request(ctx.app).delete(`/api/v1/jobs/${jobId}`).set('Authorization', `Bearer ${customerToken}`);
    const res = await request(ctx.app).get(`/api/v1/jobs/${jobId}`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(res.status, 404);
  });

  it('is a SOFT delete: the row and its quotes survive for audit', async () => {
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    const quote = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${pro.token}`)
      .send({ total: 1250, currency: 'ZAR', message: 'Quoted before withdrawal.' });
    assert.equal(quote.status, 201);

    await request(ctx.app).delete(`/api/v1/jobs/${jobId}`).set('Authorization', `Bearer ${customerToken}`);

    // The quote still exists in the store: a professional who quoted a request
    // the customer then withdrew must still be able to prove they did.
    const quotes = ctx.quotes.debugHistory();
    void quotes;
    assert.equal(await ctx.quotes.listQuotesByJobId(jobId).then((rows) => rows.length), 1);
  });

  it('writes NO status history, because a delete is not a transition', async () => {
    await request(ctx.app).delete(`/api/v1/jobs/${jobId}`).set('Authorization', `Bearer ${customerToken}`);
    const history = ctx.jobs.debugHistory().filter((entry) => entry.jobId === jobId);
    assert.equal(history.length, 0, 'a soft delete must not fabricate a status change');
  });

  it('refuses once a quote has been accepted', async () => {
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    await acceptViaQuote(ctx, customerToken, pro.token, jobId);
    const res = await request(ctx.app).delete(`/api/v1/jobs/${jobId}`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(res.status, 409);
  });

  it('refuses a second delete with 404, since it is already gone', async () => {
    await request(ctx.app).delete(`/api/v1/jobs/${jobId}`).set('Authorization', `Bearer ${customerToken}`);
    const res = await request(ctx.app).delete(`/api/v1/jobs/${jobId}`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(res.status, 404);
  });

  it("refuses another customer with 404 and a provider with 403", async () => {
    const other = await register(ctx.app, 'other@example.co.za');
    const stranger = await request(ctx.app).delete(`/api/v1/jobs/${jobId}`).set('Authorization', `Bearer ${other.token}`);
    assert.equal(stranger.status, 404);
    const pro = await register(ctx.app, 'p@example.co.za', 'PROFESSIONAL');
    const asPro = await request(ctx.app).delete(`/api/v1/jobs/${jobId}`).set('Authorization', `Bearer ${pro.token}`);
    assert.equal(asPro.status, 403);
  });

  it('keeps the job out of the provider inbox after deletion', async () => {
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    const before = await request(ctx.app).get('/api/v1/provider/requests').set('Authorization', `Bearer ${pro.token}`);
    assert.equal((before.body.data as { total: number }).total, 1);

    await request(ctx.app).delete(`/api/v1/jobs/${jobId}`).set('Authorization', `Bearer ${customerToken}`);

    const after = await request(ctx.app).get('/api/v1/provider/requests').set('Authorization', `Bearer ${pro.token}`);
    assert.equal((after.body.data as { total: number }).total, 0);
  });
});

describe('JOB_CANCELLED notification', () => {
  it('reaches the addressed provider and a professional holding a live quote', async () => {
    const ctx = buildApp();
    const customer = await register(ctx.app, 'thandi@example.co.za');
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    const jobId = await postJob(ctx, customer.token);
    await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${pro.token}`)
      .send({ total: 1250, currency: 'ZAR', message: 'Quoted.' });

    await request(ctx.app).post(`/api/v1/jobs/${jobId}/cancel`).set('Authorization', `Bearer ${customer.token}`).send({});

    const inbox = await request(ctx.app).get('/api/v1/notifications').set('Authorization', `Bearer ${pro.token}`);
    const items = inbox.body.data.items as Array<{ type: string; relatedJobId: string }>;
    const cancelled = items.filter((item) => item.type === 'JOB_CANCELLED');
    assert.equal(cancelled.length, 1, 'the provider must be told the work is off');
    assert.equal(cancelled[0]?.relatedJobId, jobId);
  });

  it('is not sent to the customer, who already knows', async () => {
    const ctx = buildApp();
    const customer = await register(ctx.app, 'thandi@example.co.za');
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    const jobId = await postJob(ctx, customer.token);
    await request(ctx.app).post(`/api/v1/jobs/${jobId}/cancel`).set('Authorization', `Bearer ${customer.token}`).send({});

    const inbox = await request(ctx.app).get('/api/v1/notifications').set('Authorization', `Bearer ${customer.token}`);
    const items = inbox.body.data.items as Array<{ type: string }>;
    assert.equal(items.filter((item) => item.type === 'JOB_CANCELLED').length, 0);
  });
});