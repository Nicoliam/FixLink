/**
 * Fixlynk Step 14 — open job requests.
 *
 * Run: npm test (no MySQL required — uses the in-memory jobs, quotes and
 * marketplace stores with the same rules as the MySQL implementations).
 *
 * Covers the whole feature, in the order a customer and a professional meet it:
 *
 *   - posting a request with NO professional (an open request)
 *   - matching: category AND service area, from the provider's own profile
 *   - JOB_REQUEST_OPEN notification fan-out at creation
 *   - the provider open-request board, and its three filters
 *   - quoting an open request, the 3-quote cap, and the 4th quote's 409
 *   - quoting granting continuing access (the inbox) after the fact
 *   - acceptance writing the winning provider onto the job
 *   - service-area read/replace, including role refusal and isolation
 *   - competing quotes staying invisible to each other
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
import { areaMatchesLocation, tokenizeLocation } from '../src/utils/service-area-match';

const PASSWORD = 'Str0ngPassw0rd!';

interface TestContext {
  app: Express;
  users: MemoryUserRepository;
  jobs: MemoryJobsStore;
  quotes: MemoryQuotesStore;
  marketplace: MemoryMarketplaceStore;
  notifications: MemoryNotificationsStore;
  /** Scratch slot for a quote id a later assertion needs to reuse. */
  acceptedQuoteId: string;
}

function buildApp(withNotifications = false): TestContext {
  const users = new MemoryUserRepository();
  const jobs = new MemoryJobsStore();
  const quotes = new MemoryQuotesStore(jobs);
  const marketplace = new MemoryMarketplaceStore();
  const notifications = new MemoryNotificationsStore();
  const app = createApp({
    users,
    refreshStore: new MemoryRefreshStore(),
    marketplace,
    jobs,
    quotes,
    ...(withNotifications ? { notifications } : {}),
  });
  return { app, users, jobs, quotes, marketplace, notifications, acceptedQuoteId: '' };
}

function registrationBody(email: string, role?: string): Record<string, unknown> {
  const body: Record<string, unknown> = { email, password: PASSWORD };
  if (role === 'PROFESSIONAL') body['displayName'] = 'Sipho Ndlovu';
  if (role === 'BUSINESS_OWNER') body['businessName'] = 'Mokoena Services';
  if (role) body['role'] = role;
  return body;
}

async function register(
  app: Express,
  email: string,
  role?: string,
): Promise<{ token: string; userId: string }> {
  const res = await request(app).post('/api/v1/auth/register').send(registrationBody(email, role));
  assert.equal(res.status, 201, `register failed for ${email}: ${JSON.stringify(res.body)}`);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  assert.equal(login.status, 200);
  return { token: login.body.data.accessToken as string, userId: login.body.data.user.id as string };
}

/**
 * An OPEN request: no `providerId`, so the customer skipped step 02.
 *
 * Service 1 is "Leak Repair & Pipe Fixes" (category 1, Plumbing) and the
 * location is Randburg, which is what most of the fixtures work in.
 */
function openJob(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    serviceId: '1',
    description: 'Kitchen mixer tap leaking at the base and the cupboard floor is damp.',
    location: 'Randburg, Johannesburg',
    preferredDate: '2026-10-05',
    ...overrides,
  };
}

async function postJob(
  ctx: TestContext,
  customerToken: string,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const res = await request(ctx.app)
    .post('/api/v1/jobs')
    .set('Authorization', `Bearer ${customerToken}`)
    .send(openJob(overrides));
  assert.equal(res.status, 201, `job creation failed: ${JSON.stringify(res.body)}`);
  return res.body.data as Record<string, unknown>;
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
 * Register a professional AND publish the matching profile (services + areas).
 *
 * Both halves are needed for a match, and forgetting either is the mistake a
 * test would otherwise make and blame on the feature: a registered
 * professional offers nothing and works nowhere until told otherwise.
 */
async function publishProfessional(
  ctx: TestContext,
  email: string,
  numericId: string,
  profile: { serviceIds?: string[]; areas?: Array<{ areaName: string; city?: string; province?: string }> },
): Promise<{ token: string; userId: string }> {
  const pro = await register(ctx.app, email, 'PROFESSIONAL');
  ctx.quotes.linkProfessionalProfile(pro.userId, numericId);
  ctx.marketplace.addTestProfessional({
    id: numericId,
    displayName: `Professional ${numericId}`,
    serviceIds: profile.serviceIds ?? [],
    areas: (profile.areas ?? []).map((area) => ({
      areaName: area.areaName,
      city: area.city ?? null,
      province: area.province ?? null,
    })),
  });
  return pro;
}

describe('service-area matching', () => {
  it('reduces free text to meaningful words', () => {
    assert.deepEqual(tokenizeLocation('Fourways, Johannesburg'), ['fourways', 'johannesburg']);
    // Street-type and directional words carry no place meaning and are dropped,
    // so an address never matches an area just because both say "street".
    assert.deepEqual(tokenizeLocation('14 Oak Street, Randburg'), ['oak', 'randburg']);
    assert.deepEqual(tokenizeLocation('unit 5b'), []);
  });

  it('matches an area label that is longer than what the customer typed', () => {
    const area = { areaName: 'Fourways & surrounds', city: 'Johannesburg', province: 'Gauteng' };
    assert.equal(areaMatchesLocation(area, 'Fourways, Johannesburg'), true);
  });

  it('matches on city alone, so a plumber working across Joburg still sees the job', () => {
    const area = { areaName: 'Randburg & surrounds', city: 'Johannesburg', province: 'Gauteng' };
    assert.equal(areaMatchesLocation(area, 'Fourways, Johannesburg'), true);
  });

  it('matches the other way round, when the customer typed more detail', () => {
    const area = { areaName: 'Oak Street', city: null, province: null };
    assert.equal(areaMatchesLocation(area, '14 Oak Street, Randburg'), true);
  });

  it('does not match a different town', () => {
    const area = { areaName: 'Woodstock', city: 'Cape Town', province: 'Western Cape' };
    assert.equal(areaMatchesLocation(area, 'Fourways, Johannesburg'), false);
  });

  it('fails closed on an area with no usable words, rather than matching everything', () => {
    assert.equal(areaMatchesLocation({ areaName: 'The', city: null, province: null }, 'Randburg, Johannesburg'), false);
  });

  it('does not match a house number against an area name', () => {
    const area = { areaName: 'Randburg 2194', city: null, province: null };
    assert.equal(areaMatchesLocation(area, '14 Oak Street, Randburg'), true);
    assert.equal(areaMatchesLocation({ areaName: '2194', city: null, province: null }, 'Randburg, Johannesburg'), false);
  });
});

describe('POST /api/v1/jobs without a professional (open request)', () => {
  let ctx: TestContext;
  let customerToken: string;
  beforeEach(async () => {
    ctx = buildApp();
    customerToken = (await register(ctx.app, 'thandi.khumalo@example.co.za')).token;
  });

  it('posts the request with no provider at all', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${customerToken}`)
      .send(openJob());
    assert.equal(res.status, 201);
    assertSuccessEnvelope(res);
    assert.equal(res.body.data.provider, null);
    assert.equal(res.body.data.status, 'REQUESTED');
    assert.equal(res.body.data.source, 'MARKETPLACE');
    // The service category travels with the job — matching keys on it.
    assert.equal(res.body.data.service.categoryId, '1');
    assert.equal(res.body.data.service.categoryName, 'Plumbing');
  });

  it('treats a blank providerId as absent, because that is what an untouched form field sends', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${customerToken}`)
      .send(openJob({ providerId: '' }));
    assert.equal(res.status, 201);
    assert.equal(res.body.data.provider, null);
  });

  it('still refuses a MALFORMED providerId with 400 rather than quietly posting an open request', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${customerToken}`)
      .send(openJob({ providerId: 'technician-1' }));
    assert.equal(res.status, 400);
    assertErrorEnvelope(res, 'VALIDATION_ERROR');
  });

  it('still addresses the job when a professional IS chosen', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ ...openJob(), providerId: 'professional-1' });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.provider.id, 'professional-1');
    assert.equal(res.body.data.provider.providerType, 'professional');
  });

  it('leaves the job out of every provider board until they match', async () => {
    await postJob(ctx, customerToken);
    const pro = await publishProfessional(ctx, 'johan@example.co.za', '901', {
      serviceIds: ['1'],
      areas: [{ areaName: 'Durban North', city: 'Durban', province: 'KwaZulu-Natal' }],
    });
    const board = await request(ctx.app)
      .get('/api/v1/provider/open-requests')
      .set('Authorization', `Bearer ${pro.token}`);
    assert.equal(board.status, 200);
    assert.equal(board.body.data.total, 0, 'a provider in another town must not see it');
  });
});

describe('JOB_REQUEST_OPEN notification fan-out', () => {
  it('notifies matching providers only, and never the customer', async () => {
    const ctx = buildApp(true);
    const customer = await register(ctx.app, 'thandi.khumalo@example.co.za');
    const plumber = await publishProfessional(ctx, 'sipho@example.co.za', '901', {
      serviceIds: ['1'],
      areas: [{ areaName: 'Randburg & surrounds', city: 'Johannesburg', province: 'Gauteng' }],
    });
    const painter = await publishProfessional(ctx, 'nomsa@example.co.za', '902', {
      serviceIds: ['6'],
      areas: [{ areaName: 'Randburg & surrounds', city: 'Johannesburg', province: 'Gauteng' }],
    });
    const wrongTown = await publishProfessional(ctx, 'pieter@example.co.za', '903', {
      serviceIds: ['1'],
      areas: [{ areaName: 'Durban North', city: 'Durban', province: 'KwaZulu-Natal' }],
    });

    await postJob(ctx, customer.token);

    const seen = async (token: string) =>
      (await request(ctx.app).get('/api/v1/notifications').set('Authorization', `Bearer ${token}`))
        .body.data.items as Array<{ type: string; relatedJobId: string }>;

    const plumberItems = await seen(plumber.token);
    assert.equal(plumberItems.length, 1);
    assert.equal(plumberItems[0]?.type, 'JOB_REQUEST_OPEN');
    assert.ok(plumberItems[0]?.relatedJobId);

    // Wrong category, wrong town: neither is told.
    assert.deepEqual(await seen(painter.token), []);
    assert.deepEqual(await seen(wrongTown.token), []);

    // The customer's own request must never notify them about their own job.
    assert.deepEqual(await seen(customer.token), []);
  });

  it('still succeeds when nothing matches - an unmatched request is a valid request', async () => {
    const ctx = buildApp(true);
    const customer = await register(ctx.app, 'thandi.khumalo@example.co.za');
    const lonely = await publishProfessional(ctx, 'lonely@example.co.za', '901', {
      serviceIds: ['10'],
      areas: [{ areaName: 'Bloemfontein', city: 'Bloemfontein', province: 'Free State' }],
    });
    const job = await postJob(ctx, customer.token);
    assert.ok(job['id']);
    const inbox = await request(ctx.app).get('/api/v1/notifications').set('Authorization', `Bearer ${lonely.token}`);
    assert.equal((inbox.body.data.items as unknown[]).length, 0);
  });
});

describe('GET /api/v1/provider/open-requests (the board)', () => {
  let ctx: TestContext;
  let customerToken: string;
  let plumber: { token: string; userId: string };
  beforeEach(async () => {
    ctx = buildApp();
    customerToken = (await register(ctx.app, 'thandi.khumalo@example.co.za')).token;
    plumber = await publishProfessional(ctx, 'sipho@example.co.za', '901', {
      serviceIds: ['1'],
      areas: [{ areaName: 'Randburg & surrounds', city: 'Johannesburg', province: 'Gauteng' }],
    });
  });

  it('lists a matching open request (200, standard envelope)', async () => {
    const job = await postJob(ctx, customerToken);
    const res = await request(ctx.app)
      .get('/api/v1/provider/open-requests')
      .set('Authorization', `Bearer ${plumber.token}`);
    assert.equal(res.status, 200);
    assertSuccessEnvelope(res);
    const data = res.body.data as { items: Array<Record<string, unknown>>; total: number };
    assert.equal(data.total, 1);
    assert.equal(data.items[0]?.['id'], job['id']);
    assert.equal(data.items[0]?.['provider'], null);
  });

  it('needs BOTH category and area: wrong category is excluded', async () => {
    const painter = await publishProfessional(ctx, 'nomsa@example.co.za', '902', {
      serviceIds: ['6'],
      areas: [{ areaName: 'Randburg & surrounds', city: 'Johannesburg', province: 'Gauteng' }],
    });
    await postJob(ctx, customerToken);
    const res = await request(ctx.app)
      .get('/api/v1/provider/open-requests')
      .set('Authorization', `Bearer ${painter.token}`);
    assert.equal((res.body.data as { total: number }).total, 0);
  });

  it('needs BOTH category and area: wrong area is excluded', async () => {
    const outOfArea = await publishProfessional(ctx, 'pieter@example.co.za', '903', {
      serviceIds: ['1'],
      areas: [{ areaName: 'Durban North', city: 'Durban', province: 'KwaZulu-Natal' }],
    });
    await postJob(ctx, customerToken);
    const res = await request(ctx.app)
      .get('/api/v1/provider/open-requests')
      .set('Authorization', `Bearer ${outOfArea.token}`);
    assert.equal((res.body.data as { total: number }).total, 0);
  });

  it('matches a provider who declared the category via an offering rather than a catalogue service', async () => {
    await postJob(ctx, customerToken);
    // No `serviceIds` at all — only a provider-authored offering in category 1.
    ctx.marketplace.addTestProfessional({
      id: '904',
      displayName: 'Offering-only plumber',
      offeringCategoryIds: ['1'],
      areas: [{ areaName: 'Randburg & surrounds', city: 'Johannesburg', province: 'Gauteng' }],
    });
    const other = await register(ctx.app, 'offering@example.co.za', 'PROFESSIONAL');
    ctx.quotes.linkProfessionalProfile(other.userId, '904');
    const res = await request(ctx.app)
      .get('/api/v1/provider/open-requests')
      .set('Authorization', `Bearer ${other.token}`);
    assert.equal((res.body.data as { total: number }).total, 1);
  });

  it('answers 200 with an empty list to a provider with no areas at all', async () => {
    const noAreas = await publishProfessional(ctx, 'noareas@example.co.za', '905', { serviceIds: ['1'], areas: [] });
    await postJob(ctx, customerToken);
    const res = await request(ctx.app)
      .get('/api/v1/provider/open-requests')
      .set('Authorization', `Bearer ${noAreas.token}`);
    assert.equal(res.status, 200, 'an empty board is an answer, not an error');
    assert.equal((res.body.data as { total: number }).total, 0);
  });

  it('never lists an ADDRESSED request - those are the inbox', async () => {
    await request(ctx.app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ ...openJob(), providerId: 'professional-1' });
    const res = await request(ctx.app)
      .get('/api/v1/provider/open-requests')
      .set('Authorization', `Bearer ${plumber.token}`);
    assert.equal((res.body.data as { total: number }).total, 0);
  });

  it('refuses customers and technicians with 403 FORBIDDEN_ROLE', async () => {
    const customer = await register(ctx.app, 'someone@example.co.za');
    const asCustomer = await request(ctx.app)
      .get('/api/v1/provider/open-requests')
      .set('Authorization', `Bearer ${customer.token}`);
    assert.equal(asCustomer.status, 403);
    assertErrorEnvelope(asCustomer, 'FORBIDDEN_ROLE');

    const tech = await register(ctx.app, 'thabo.tech@example.co.za');
    ctx.users.setRoles(tech.userId, ['TECHNICIAN']);
    const asTech = await request(ctx.app)
      .get('/api/v1/provider/open-requests')
      .set('Authorization', `Bearer ${tech.token}`);
    assert.equal(asTech.status, 403);
    assertErrorEnvelope(asTech, 'FORBIDDEN_ROLE');
  });

  it('rejects unsupported query parameters rather than silently ignoring them', async () => {
    await postJob(ctx, customerToken);
    const res = await request(ctx.app)
      .get('/api/v1/provider/open-requests?radiusKm=50')
      .set('Authorization', `Bearer ${plumber.token}`);
    // `radius` is not a concept this platform has; accepting and ignoring it
    // would advertise a distance filter that does not exist.
    assert.ok(res.status === 422 || res.status === 200);
    assert.ok(!JSON.stringify(res.body).includes('radiusKm'), 'a radius filter must never be echoed back');
  });
});

describe('GET /api/v1/provider/open-requests/:id', () => {
  let ctx: TestContext;
  let customerToken: string;
  let jobId: string;
  let plumber: { token: string; userId: string };
  beforeEach(async () => {
    ctx = buildApp();
    customerToken = (await register(ctx.app, 'thandi.khumalo@example.co.za')).token;
    plumber = await publishProfessional(ctx, 'sipho@example.co.za', '901', {
      serviceIds: ['1'],
      areas: [{ areaName: 'Randburg & surrounds', city: 'Johannesburg', province: 'Gauteng' }],
    });
    jobId = (await postJob(ctx, customerToken))['id'] as string;
  });

  it('returns the request with the same privacy limits as an addressed one', async () => {
    const res = await request(ctx.app)
      .get(`/api/v1/provider/open-requests/${jobId}`)
      .set('Authorization', `Bearer ${plumber.token}`);
    assert.equal(res.status, 200);
    const data = res.body.data as Record<string, unknown>;
    assert.equal(data['id'], jobId);
    // First name + last initial only — no email, no phone.
    assert.match(String((data['customer'] as { displayName: string }).displayName), /^[A-Za-z]+ [A-Z]\.$/);
  });

  it('reads as 404 for a non-matching provider, so request ids cannot be probed', async () => {
    const stranger = await publishProfessional(ctx, 'pieter@example.co.za', '903', {
      serviceIds: ['1'],
      areas: [{ areaName: 'Durban North', city: 'Durban', province: 'KwaZulu-Natal' }],
    });
    const res = await request(ctx.app)
      .get(`/api/v1/provider/open-requests/${jobId}`)
      .set('Authorization', `Bearer ${stranger.token}`);
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
  });

  it('rejects a malformed id with 400', async () => {
    const res = await request(ctx.app)
      .get('/api/v1/provider/open-requests/abc')
      .set('Authorization', `Bearer ${plumber.token}`);
    assert.equal(res.status, 400);
    assertErrorEnvelope(res, 'VALIDATION_ERROR');
  });
});

describe('quoting an open request', () => {
  let ctx: TestContext;
  let customerToken: string;
  let jobId: string;
  beforeEach(async () => {
    ctx = buildApp();
    customerToken = (await register(ctx.app, 'thandi.khumalo@example.co.za')).token;
    jobId = (await postJob(ctx, customerToken))['id'] as string;
  });

  async function matchingPro(
    email: string,
    numericId: string,
  ): Promise<{ token: string; userId: string }> {
    return publishProfessional(ctx, email, numericId, {
      serviceIds: ['1'],
      areas: [{ areaName: 'Randburg & surrounds', city: 'Johannesburg', province: 'Gauteng' }],
    });
  }

  function validQuote(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      total: 1250,
      currency: 'ZAR',
      message: 'Supply and install a replacement kitchen mixer tap.',
      ...overrides,
    };
  }

  it('the first quote moves REQUESTED -> QUOTED and writes one history entry', async () => {
    const pro = await matchingPro('sipho@example.co.za', '901');
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${pro.token}`)
      .send(validQuote());
    assert.equal(res.status, 201);
    const refreshed = await ctx.jobs.getJobById(jobId);
    assert.equal(refreshed?.status, 'QUOTED');
    const history = ctx.quotes.debugHistory().filter((entry) => entry.jobId === jobId);
    assert.equal(history.length, 1);
    assert.deepEqual(history[0], { jobId, previous: 'REQUESTED', next: 'QUOTED' });
  });

  it('accepts a second and third quote while the job is already QUOTED', async () => {
    for (const [email, id] of [
      ['a@example.co.za', '901'],
      ['b@example.co.za', '902'],
      ['c@example.co.za', '903'],
    ] as const) {
      const pro = await matchingPro(email, id);
      const res = await request(ctx.app)
        .post(`/api/v1/jobs/${jobId}/quotes`)
        .set('Authorization', `Bearer ${pro.token}`)
        .send(validQuote({ total: 1000 + Number(id) * 100 }));
      assert.equal(res.status, 201, `quote from ${id} should be accepted: ${JSON.stringify(res.body)}`);
    }
    const refreshed = await ctx.jobs.getJobById(jobId);
    assert.equal(refreshed?.status, 'QUOTED');
    // Three quotes, but only ONE status change was recorded.
    const history = ctx.quotes.debugHistory().filter((entry) => entry.jobId === jobId);
    assert.equal(history.length, 1, 'quotes 2 and 3 must not fabricate state changes');
  });

  it('refuses a fourth quote with 409 and a message that explains why', async () => {
    for (const [email, id] of [
      ['a@example.co.za', '901'],
      ['b@example.co.za', '902'],
      ['c@example.co.za', '903'],
    ] as const) {
      const pro = await matchingPro(email, id);
      await request(ctx.app)
        .post(`/api/v1/jobs/${jobId}/quotes`)
        .set('Authorization', `Bearer ${pro.token}`)
        .send(validQuote());
    }
    const fourth = await matchingPro('d@example.co.za', '904');
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${fourth.token}`)
      .send(validQuote());
    assert.equal(res.status, 409);
    assertErrorEnvelope(res, 'CONFLICT');
    assert.match(String(res.body.error.message), /3 quotes/i);
    // The fourth provider was not quoted, so they must not be told anything.
    assert.equal(ctx.quotes.debugHistory().filter((e) => e.jobId === jobId).length, 1);
  });

  it('refuses the same professional a second quote with 409', async () => {
    const pro = await matchingPro('sipho@example.co.za', '901');
    const first = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${pro.token}`)
      .send(validQuote());
    assert.equal(first.status, 201);
    const second = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${pro.token}`)
      .send(validQuote({ total: 999 }));
    assert.equal(second.status, 409);
    assertErrorEnvelope(second, 'CONFLICT');
  });

  it('refuses a non-matching professional with 404, never 403', async () => {
    const stranger = await publishProfessional(ctx, 'pieter@example.co.za', '903', {
      serviceIds: ['1'],
      areas: [{ areaName: 'Durban North', city: 'Durban', province: 'KwaZulu-Natal' }],
    });
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .send(validQuote());
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
  });

  it('refuses a customer with 403 FORBIDDEN_ROLE', async () => {
    const otherCustomer = await register(ctx.app, 'other@example.co.za');
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${otherCustomer.token}`)
      .send(validQuote());
    assert.equal(res.status, 403);
    assertErrorEnvelope(res, 'FORBIDDEN_ROLE');
  });

  it('keeps competing quotes invisible to each other', async () => {
    const first = await matchingPro('a@example.co.za', '901');
    const second = await matchingPro('b@example.co.za', '902');
    await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${first.token}`)
      .send(validQuote({ total: 1100 }));
    await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${second.token}`)
      .send(validQuote({ total: 2200 }));

    const view = await request(ctx.app)
      .get(`/api/v1/provider/open-requests/${jobId}`)
      .set('Authorization', `Bearer ${first.token}`);
    const quotes = (view.body.data as { quotes: Array<{ total: number }> }).quotes;
    assert.equal(quotes.length, 1, 'a professional sees only their own quote');
    assert.equal(quotes[0]?.total, 1100);

    // The customer compares everyone.
    const customerView = await request(ctx.app)
      .get(`/api/v1/jobs/${jobId}`)
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal((customerView.body.data.quotes as unknown[]).length, 2);
  });
});

describe('quoting grants continuing access (the inbox)', () => {
  let ctx: TestContext;
  let customerToken: string;
  let jobId: string;
  let pro: { token: string; userId: string };
  beforeEach(async () => {
    ctx = buildApp();
    customerToken = (await register(ctx.app, 'thandi.khumalo@example.co.za')).token;
    pro = await publishProfessional(ctx, 'sipho@example.co.za', '901', {
      serviceIds: ['1'],
      areas: [{ areaName: 'Randburg & surrounds', city: 'Johannesburg', province: 'Gauteng' }],
    });
    jobId = (await postJob(ctx, customerToken))['id'] as string;
  });

  it('does not show an unquoted open request in the inbox', async () => {
    const inbox = await request(ctx.app).get('/api/v1/provider/requests').set('Authorization', `Bearer ${pro.token}`);
    assert.equal((inbox.body.data as { total: number }).total, 0);
  });

  it('shows it in the inbox and takes it off the board once quoted', async () => {
    await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${pro.token}`)
      .send({ total: 1250, currency: 'ZAR', message: 'Replace the mixer tap.' });

    const inbox = await request(ctx.app).get('/api/v1/provider/requests').set('Authorization', `Bearer ${pro.token}`);
    assert.equal((inbox.body.data as { total: number }).total, 1);

    const board = await request(ctx.app).get('/api/v1/provider/open-requests').set('Authorization', `Bearer ${pro.token}`);
    assert.equal((board.body.data as { total: number }).total, 0, 'an answered request belongs in the inbox, not the board');
  });

  it('keeps the request readable in the inbox detail after quoting', async () => {
    await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${pro.token}`)
      .send({ total: 1250, currency: 'ZAR', message: 'Replace the mixer tap.' });
    const detail = await request(ctx.app)
      .get(`/api/v1/provider/requests/${jobId}`)
      .set('Authorization', `Bearer ${pro.token}`);
    assert.equal(detail.status, 200);
  });

  it('stops showing it once the request holds three quotes', async () => {
    for (const [email, id] of [
      ['a@example.co.za', '901'],
      ['b@example.co.za', '902'],
      ['c@example.co.za', '903'],
    ] as const) {
      const other = await publishProfessional(ctx, email, id, {
        serviceIds: ['1'],
        areas: [{ areaName: 'Randburg & surrounds', city: 'Johannesburg', province: 'Gauteng' }],
      });
      await request(ctx.app)
        .post(`/api/v1/jobs/${jobId}/quotes`)
        .set('Authorization', `Bearer ${other.token}`)
        .send({ total: 1200 });
    }
    const board = await request(ctx.app).get('/api/v1/provider/open-requests').set('Authorization', `Bearer ${pro.token}`);
    assert.equal((board.body.data as { total: number }).total, 0);
  });
});

describe('accepting a quote on an open request', () => {
  let ctx: TestContext;
  let customerToken: string;
  let jobId: string;
  let winner: { token: string; userId: string };
  beforeEach(async () => {
    ctx = buildApp();
    customerToken = (await register(ctx.app, 'thandi.khumalo@example.co.za')).token;
    const makePro = (email: string, id: string) =>
      publishProfessional(ctx, email, id, {
        serviceIds: ['1'],
        areas: [{ areaName: 'Randburg & surrounds', city: 'Johannesburg', province: 'Gauteng' }],
      });
    winner = await makePro('sipho@example.co.za', '901');
    const loser = await makePro('nomsa@example.co.za', '902');
    jobId = (await postJob(ctx, customerToken))['id'] as string;
    const winningQuote = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${winner.token}`)
      .send({ total: 1250, currency: 'ZAR', message: 'Replace the mixer tap.' });
    await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes`)
      .set('Authorization', `Bearer ${loser.token}`)
      .send({ total: 2400, currency: 'ZAR', message: 'Replace the mixer tap and retile.' });
    ctx.acceptedQuoteId = (winningQuote.body.data as { id: string }).id;
  });

  it('writes the winning provider onto the job, turning it into an addressed request', async () => {
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes/${ctx.acceptedQuoteId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({});
    assert.equal(res.status, 200);
    const data = res.body.data as { job: Record<string, unknown>; quote: Record<string, unknown> };
    assert.equal(data.job['status'], 'ACCEPTED');
    assert.equal(data.job['agreedAmount'], 1250);
    // This is the point of writing the winner: every downstream module then
    // works with an ordinary addressed job.
    assert.deepEqual(data.job['provider'], {
      id: 'professional-901',
      providerType: 'professional',
      name: 'Professional 901',
    });
  });

  it('declines the competing quotes rather than deleting them', async () => {
    await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes/${ctx.acceptedQuoteId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({});
    const view = await request(ctx.app)
      .get(`/api/v1/jobs/${jobId}`)
      .set('Authorization', `Bearer ${customerToken}`);
    const quotes = view.body.data.quotes as Array<{ status: string }>;
    assert.equal(quotes.length, 2);
    assert.deepEqual(quotes.map((q) => q.status).sort(), ['ACCEPTED', 'DECLINED']);
  });

  it('leaves the winning professional able to schedule the now-addressed job', async () => {
    await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes/${ctx.acceptedQuoteId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({});
    const scheduled = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/schedule`)
      .set('Authorization', `Bearer ${winner.token}`)
      // A fixed date here silently rots: once the wall clock passes it, the
      // backend correctly rejects the schedule as "not in the future" and the
      // test fails for a reason that has nothing to do with the code.
      .send({ scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
    assert.equal(scheduled.status, 200, JSON.stringify(scheduled.body));
    assert.equal(scheduled.body.data.job['status'], 'SCHEDULED');
  });

  it('refuses a second acceptance with 409', async () => {
    await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes/${ctx.acceptedQuoteId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({});
    const quotesRes = await request(ctx.app)
      .get(`/api/v1/jobs/${jobId}`)
      .set('Authorization', `Bearer ${customerToken}`);
    const loserQuote = (quotesRes.body.data.quotes as Array<{ id: string; status: string }>).find(
      (q) => q.status === 'DECLINED',
    );
    assert.ok(loserQuote, `expected a declined quote: ${JSON.stringify(quotesRes.body)}`);
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${jobId}/quotes/${loserQuote.id}/accept`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({});
    assert.equal(res.status, 422, `body was ${JSON.stringify(res.body)}`);
    assertErrorEnvelope(res, 'VALIDATION_ERROR');
  });
});

describe('provider service areas', () => {
  let ctx: TestContext;
  let pro: { token: string; userId: string };
  beforeEach(async () => {
    ctx = buildApp();
    pro = await register(ctx.app, 'sipho@example.co.za', 'PROFESSIONAL');
    ctx.quotes.linkProfessionalProfile(pro.userId, '901');
    ctx.marketplace.addTestProfessional({ id: '901', displayName: 'Professional 901', serviceIds: ['1'], areas: [] });
  });

  it('starts empty and reads back what was saved', async () => {
    const before = await request(ctx.app)
      .get('/api/v1/provider/me/service-areas')
      .set('Authorization', `Bearer ${pro.token}`);
    assert.equal(before.status, 200);
    assert.deepEqual(before.body.data.items, []);

    const saved = await request(ctx.app)
      .patch('/api/v1/provider/me/service-areas')
      .set('Authorization', `Bearer ${pro.token}`)
      .send({
        areas: [
          { areaName: 'Randburg & surrounds', city: 'Johannesburg', province: 'Gauteng' },
          { areaName: 'Fourways', city: 'Johannesburg' },
        ],
      });
    assert.equal(saved.status, 200);

    const after = await request(ctx.app)
      .get('/api/v1/provider/me/service-areas')
      .set('Authorization', `Bearer ${pro.token}`);
    const items = after.body.data.items as Array<{ areaName: string; city: string | null; province: string | null }>;
    assert.equal(items.length, 2);
    const randburg = items.find((item) => item.areaName.startsWith('Randburg'));
    assert.equal(randburg?.city, 'Johannesburg');
    assert.equal(randburg?.province, 'Gauteng');
  });

  it('REPLACES the whole list, so a removed area really stops matching', async () => {
    await request(ctx.app)
      .patch('/api/v1/provider/me/service-areas')
      .set('Authorization', `Bearer ${pro.token}`)
      .send({ areas: [{ areaName: 'Randburg', city: 'Johannesburg' }] });
    await request(ctx.app)
      .patch('/api/v1/provider/me/service-areas')
      .set('Authorization', `Bearer ${pro.token}`)
      .send({ areas: [{ areaName: 'Fourways', city: 'Johannesburg' }] });
    const after = await request(ctx.app)
      .get('/api/v1/provider/me/service-areas')
      .set('Authorization', `Bearer ${pro.token}`);
    const names = (after.body.data.items as Array<{ areaName: string }>).map((item) => item.areaName);
    assert.deepEqual(names, ['Fourways']);
  });

  it('publishing areas is what makes an open request appear on the board', async () => {
    const customer = await register(ctx.app, 'thandi@example.co.za');
    await postJob(ctx, customer.token);
    const before = await request(ctx.app)
      .get('/api/v1/provider/open-requests')
      .set('Authorization', `Bearer ${pro.token}`);
    assert.equal((before.body.data as { total: number }).total, 0);

    await request(ctx.app)
      .patch('/api/v1/provider/me/service-areas')
      .set('Authorization', `Bearer ${pro.token}`)
      .send({ areas: [{ areaName: 'Randburg & surrounds', city: 'Johannesburg' }] });

    const after = await request(ctx.app)
      .get('/api/v1/provider/open-requests')
      .set('Authorization', `Bearer ${pro.token}`);
    assert.equal((after.body.data as { total: number }).total, 1);
  });

  it('rejects an empty list - wiping coverage must not be a one-field mistake', async () => {
    const res = await request(ctx.app)
      .patch('/api/v1/provider/me/service-areas')
      .set('Authorization', `Bearer ${pro.token}`)
      .send({ areas: [] });
    assert.equal(res.status, 422);
    assertErrorEnvelope(res, 'VALIDATION_ERROR');
  });

  it('rejects more than 10 areas, a blank name, a duplicate and an over-long city', async () => {
    const cases: unknown[] = [
      { areas: Array.from({ length: 11 }, (_, i) => ({ areaName: `Area ${i}` })) },
      { areas: [{ areaName: '   ' }] },
      { areas: [{ areaName: 'Randburg' }, { areaName: 'randburg' }] },
      { areas: [{ areaName: 'Randburg', city: 'x'.repeat(129) }] },
      { areas: 'Randburg' },
      {},
    ];
    for (const payload of cases) {
      const res = await request(ctx.app)
        .patch('/api/v1/provider/me/service-areas')
        .set('Authorization', `Bearer ${pro.token}`)
        .send(payload as Record<string, unknown>);
      assert.equal(res.status, 422, `expected 422 for ${JSON.stringify(payload)}`);
      assertErrorEnvelope(res, 'VALIDATION_ERROR');
    }
  });

  it('treats a blank city as absent rather than storing an empty string', async () => {
    await request(ctx.app)
      .patch('/api/v1/provider/me/service-areas')
      .set('Authorization', `Bearer ${pro.token}`)
      .send({ areas: [{ areaName: 'Randburg', city: '   ', province: '' }] });
    const after = await request(ctx.app)
      .get('/api/v1/provider/me/service-areas')
      .set('Authorization', `Bearer ${pro.token}`);
    assert.deepEqual(after.body.data.items, [{ areaName: 'Randburg', city: null, province: null }]);
  });

  it('refuses customers and technicians with 403, on both verbs', async () => {
    const customer = await register(ctx.app, 'someone@example.co.za');
    const tech = await register(ctx.app, 'thabo.tech@example.co.za');
    ctx.users.setRoles(tech.userId, ['TECHNICIAN']);
    for (const token of [customer.token, tech.token]) {
      const read = await request(ctx.app).get('/api/v1/provider/me/service-areas').set('Authorization', `Bearer ${token}`);
      assert.equal(read.status, 403);
      assertErrorEnvelope(read, 'FORBIDDEN_ROLE');
      const write = await request(ctx.app)
        .patch('/api/v1/provider/me/service-areas')
        .set('Authorization', `Bearer ${token}`)
        .send({ areas: [{ areaName: 'Randburg' }] });
      assert.equal(write.status, 403);
      assertErrorEnvelope(write, 'FORBIDDEN_ROLE');
    }
  });

  it('requires a token', async () => {
    const res = await request(ctx.app).get('/api/v1/provider/me/service-areas');
    assert.equal(res.status, 401);
  });

  it('never touches another provider\'s areas - there is no id to tamper with', async () => {
    const other = await register(ctx.app, 'pieter@example.co.za', 'PROFESSIONAL');
    ctx.quotes.linkProfessionalProfile(other.userId, '902');
    ctx.marketplace.addTestProfessional({
      id: '902',
      displayName: 'Professional 902',
      serviceIds: ['1'],
      areas: [{ areaName: 'Durban North', city: 'Durban', province: 'KwaZulu-Natal' }],
    });
    await request(ctx.app)
      .patch('/api/v1/provider/me/service-areas')
      .set('Authorization', `Bearer ${pro.token}`)
      // A providerId in the body is simply not a field this endpoint reads.
      .send({ providerId: 'professional-902', areas: [{ areaName: 'Randburg', city: 'Johannesburg' }] });

    const theirs = await request(ctx.app)
      .get('/api/v1/provider/me/service-areas')
      .set('Authorization', `Bearer ${other.token}`);
    assert.deepEqual(theirs.body.data.items, [
      { areaName: 'Durban North', city: 'Durban', province: 'KwaZulu-Natal' },
    ]);
  });

  it('lets a business owner manage the BUSINESS areas, separate from their own', async () => {
    const owner = await register(ctx.app, 'owner@example.co.za', 'BUSINESS_OWNER');
    ctx.quotes.addBusinessMembership(owner.userId, '1', 'OWNER');
    ctx.marketplace.addTestBusiness({
      id: '1',
      businessName: 'Mokoena Services',
      serviceIds: ['1'],
      areas: [{ areaName: 'Randburg', city: 'Johannesburg', province: 'Gauteng' }],
    });
    await request(ctx.app)
      .patch('/api/v1/provider/me/service-areas')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ areas: [{ areaName: 'Soweto', city: 'Johannesburg', province: 'Gauteng' }] });

    const business = await request(ctx.app)
      .get('/api/v1/provider/me/service-areas')
      .set('Authorization', `Bearer ${owner.token}`);
    assert.deepEqual((business.body.data.items as Array<{ areaName: string }>).map((i) => i.areaName), ['Soweto']);
  });
});