/**
 * FixLink Stage 6B — customer job request / job creation tests.
 *
 * Run: npm test (no MySQL required — uses the in-memory jobs +
 * marketplace stores with the same rules as the MySQL implementation).
 *
 * Covers: authenticated CUSTOMER creation, MARKETPLACE source, REQUESTED
 * status, server-side ownership, provider/service association, 401/403/
 * 400/404/422 paths, customer_id spoofing, cross-customer isolation and
 * customer job retrieval.
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

function buildApp(): Express {
  return createApp({
    users: new MemoryUserRepository(),
    refreshStore: new MemoryRefreshStore(),
    marketplace: new MemoryMarketplaceStore(),
    jobs: new MemoryJobsStore(),
  });
}

const CUSTOMER_PASSWORD = 'Str0ngPassw0rd!';

async function registerCustomer(app: Express, email: string): Promise<string> {
  const register = await request(app).post('/api/v1/auth/register').send({
    email,
    password: CUSTOMER_PASSWORD,
  });
  assert.equal(register.status, 201, `register failed for ${email}: ${JSON.stringify(register.body)}`);
  const login = await request(app).post('/api/v1/auth/login').send({
    email,
    password: CUSTOMER_PASSWORD,
  });
  assert.equal(login.status, 200);
  return login.body.data.accessToken as string;
}

async function registerWithRole(app: Express, email: string, role: string): Promise<string> {
  const register = await request(app).post('/api/v1/auth/register').send({
    email,
    password: CUSTOMER_PASSWORD,
    role,
  });
  assert.equal(register.status, 201, `register failed for ${email}: ${JSON.stringify(register.body)}`);
  const login = await request(app).post('/api/v1/auth/login').send({
    email,
    password: CUSTOMER_PASSWORD,
  });
  assert.equal(login.status, 200);
  return login.body.data.accessToken as string;
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

describe('POST /api/v1/jobs (customer job request)', () => {
  let app: Express;
  let customerToken: string;
  beforeEach(async () => {
    app = buildApp();
    customerToken = await registerCustomer(app, 'thabo.mokoena@example.co.za');
  });

  it('creates a MARKETPLACE job in REQUESTED status owned by the customer (201)', async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${customerToken}`)
      .send(validJob());
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    const job = res.body.data;
    assert.ok(job.id);
    assert.ok(job.reference);
    assert.equal(job.source, 'MARKETPLACE');
    assert.equal(job.status, 'REQUESTED');
    assert.ok(job.customerId);
    assert.equal(job.provider.id, 'professional-1');
    assert.equal(job.provider.providerType, 'professional');
    assert.equal(job.provider.name, 'Sipho Ndlovu — ProPlumb');
    assert.equal(job.service.id, '1');
    assert.equal(job.service.slug, 'leak-repair');
    assert.equal(job.description, validJob().description);
    assert.equal(job.location, 'Fourways, Johannesburg');
    assert.equal(job.preferredDate, '2026-10-05');
    assert.ok(job.createdAt);
  });

  it('creates a job for a business provider', async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${customerToken}`)
      .send(validJob({ providerId: 'business-1', serviceId: '2' }));
    assert.equal(res.status, 201);
    assert.equal(res.body.data.provider.id, 'business-1');
    assert.equal(res.body.data.provider.providerType, 'business');
    assert.equal(res.body.data.provider.name, 'Ubuntu Plumbing Co.');
  });

  it('auto-provisions the customer profile on first request (Stage 5A registers users only)', async () => {
    // Freshly registered customers have no customer_profiles row yet.
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${customerToken}`)
      .send(validJob());
    assert.equal(res.status, 201);
    assert.ok(res.body.data.customerId);
  });

  it('rejects unauthenticated requests (401)', async () => {
    const res = await request(app).post('/api/v1/jobs').send(validJob());
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  it('rejects non-customer roles (403)', async () => {
    const professionalToken = await registerWithRole(app, 'pro@example.co.za', 'PROFESSIONAL');
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${professionalToken}`)
      .send(validJob());
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN_ROLE');
  });

  it('rejects a malformed provider id (400)', async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${customerToken}`)
      .send(validJob({ providerId: 'technician-1' }));
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('rejects an unknown provider (404)', async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${customerToken}`)
      .send(validJob({ providerId: 'professional-9999' }));
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  it('rejects an unknown service (404)', async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${customerToken}`)
      .send(validJob({ serviceId: '9999' }));
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  it('rejects a service the provider does not offer (422)', async () => {
    // professional-1 offers plumbing services 1-3, not electrical service 4.
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${customerToken}`)
      .send(validJob({ serviceId: '4' }));
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('ignores a spoofed customer_id and keeps server-side ownership', async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ ...validJob(), customer_id: '999', customerId: '999' });
    assert.equal(res.status, 201);
    assert.notEqual(res.body.data.customerId, '999');

    // The spoofed id owns nothing: only the real owner can read the job.
    const mine = await request(app)
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal(mine.body.data.total, 1);
    assert.equal(mine.body.data.items[0].id, res.body.data.id);
  });

  it('ignores client-controlled status/source and always starts REQUESTED', async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ ...validJob(), status: 'COMPLETED', source: 'INTERNAL' });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.status, 'REQUESTED');
    assert.equal(res.body.data.source, 'MARKETPLACE');
  });

  it('rejects invalid input (422/400 with standard envelope)', async () => {
    const cases: Array<{ payload: Record<string, unknown>; status: number }> = [
      { payload: validJob({ description: 'Fix tap' }), status: 422 },
      { payload: validJob({ description: undefined, serviceId: '1' }), status: 422 },
      { payload: validJob({ location: '' }), status: 422 },
      { payload: validJob({ serviceId: '' }), status: 400 },
      { payload: validJob({ providerId: '' }), status: 400 },
      { payload: validJob({ preferredDate: '05-10-2026' }), status: 422 },
      { payload: validJob({ preferredDate: '2026-02-30' }), status: 422 },
      { payload: validJob({ preferredTime: '25:00' }), status: 422 },
      { payload: [], status: 422 },
    ];
    for (const { payload, status } of cases) {
      const res = await request(app)
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(payload);
      assert.equal(res.status, status, `expected ${status} for ${JSON.stringify(payload)}`);
      assert.equal(res.body.success, false);
    }
  });

  it('accepts an optional preferred time and valid notes', async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${customerToken}`)
      .send(validJob({ preferredTime: '14:30', notes: 'Gate code 4455, dogs locked away.' }));
    assert.equal(res.status, 201);
    assert.ok((res.body.data.scheduledAt as string).includes('14:30'));
  });
});

describe('GET /api/v1/jobs + /api/v1/jobs/:id (customer retrieval)', () => {
  let app: Express;
  let tokenA: string;
  let tokenB: string;
  let jobIdA: string;
  beforeEach(async () => {
    app = buildApp();
    tokenA = await registerCustomer(app, 'ayanda.ndlovu@example.co.za');
    tokenB = await registerCustomer(app, 'kabelo.dlamini@example.co.za');
    const created = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(validJob());
    assert.equal(created.status, 201);
    jobIdA = created.body.data.id as string;
  });

  it('lists only the authenticated customer\u2019s jobs', async () => {
    const mine = await request(app).get('/api/v1/jobs').set('Authorization', `Bearer ${tokenA}`);
    assert.equal(mine.status, 200);
    assert.equal(mine.body.success, true);
    assert.equal(mine.body.data.total, 1);
    assert.equal(mine.body.data.items[0].id, jobIdA);

    const other = await request(app).get('/api/v1/jobs').set('Authorization', `Bearer ${tokenB}`);
    assert.equal(other.status, 200);
    assert.equal(other.body.data.total, 0);
    assert.deepEqual(other.body.data.items, []);
  });

  it('returns an owned job by id (200)', async () => {
    const res = await request(app).get(`/api/v1/jobs/${jobIdA}`).set('Authorization', `Bearer ${tokenA}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.id, jobIdA);
    assert.equal(res.body.data.status, 'REQUESTED');
  });

  it('hides another customer\u2019s job as 404', async () => {
    const res = await request(app).get(`/api/v1/jobs/${jobIdA}`).set('Authorization', `Bearer ${tokenB}`);
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  it('returns 404 for an unknown job id', async () => {
    const res = await request(app).get('/api/v1/jobs/9999').set('Authorization', `Bearer ${tokenA}`);
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  it('returns 400 for a malformed job id', async () => {
    const res = await request(app).get('/api/v1/jobs/abc').set('Authorization', `Bearer ${tokenA}`);
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('rejects unauthenticated retrieval (401)', async () => {
    assert.equal((await request(app).get('/api/v1/jobs')).status, 401);
    assert.equal((await request(app).get(`/api/v1/jobs/${jobIdA}`)).status, 401);
  });

  it('rejects non-customer retrieval (403)', async () => {
    const proToken = await registerWithRole(app, 'electrician@example.co.za', 'PROFESSIONAL');
    const list = await request(app).get('/api/v1/jobs').set('Authorization', `Bearer ${proToken}`);
    assert.equal(list.status, 403);
    const one = await request(app).get(`/api/v1/jobs/${jobIdA}`).set('Authorization', `Bearer ${proToken}`);
    assert.equal(one.status, 403);
  });
});
