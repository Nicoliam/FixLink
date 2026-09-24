/**
 * FixLink Stage 7E — technician parts-request tests.
 *
 * Run: npm test (no MySQL required — in-memory business store with the
 * same rules as the MySQL implementation, plus an isolated local-storage
 * tmp dir per test app).
 *
 * Covers: technician submission on an assigned IN_PROGRESS job (201 +
 * PENDING + correct business/technician + job stays IN_PROGRESS),
 * unassigned-technician 404, another-technician 404, cross-business
 * 404, marketplace-job 404, cancelled/completed/REQUESTED 422, part
 * name / quantity / reason validation, optional photo evidence
 * (upload + authorized delivery), technician list/get, owner + manager
 * read access, cross-business owner 404, non-authorized roles
 * (401/403), timeline inclusion (technician + business) and invalid
 * id handling. Approval/rejection belongs to Stage 7F and is
 * intentionally absent.
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
import { LocalFileStorage } from '../src/services/file-storage';
import { hashPassword } from '../src/utils/password';

interface TestContext {
  app: Express;
  users: MemoryUserRepository;
  business: MemoryBusinessStore;
}

function buildApp(): TestContext {
  const users = new MemoryUserRepository();
  const business = new MemoryBusinessStore();
  const storage = new LocalFileStorage(mkdtempSync(join(tmpdir(), 'fixlink-7e-')));
  const app = createApp({
    users,
    refreshStore: new MemoryRefreshStore(),
    marketplace: new MemoryMarketplaceStore(),
    jobs: new MemoryJobsStore(),
    business,
    storage,
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
  const owner = await provisionUser(ctx, 'thabo.parts@example.co.za', ['BUSINESS_OWNER']);
  const business = ctx.business.seedBusiness({
    ownerUserId: owner.userId,
    businessName: 'Ubuntu Plumbing Co.',
    slug: 'ubuntu-plumbing-parts',
  });
  const manager = await provisionUser(ctx, 'lerato.parts@example.co.za', ['BUSINESS_MANAGER']);
  ctx.business.addMembership(business.id, manager.userId, 'BUSINESS_MANAGER');
  const ownerB = await provisionUser(ctx, 'david.parts@example.co.za', ['BUSINESS_OWNER']);
  ctx.business.seedBusiness({
    ownerUserId: ownerB.userId,
    businessName: 'Cape Spark Electrical',
    slug: 'cape-spark-parts',
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
    .send({ firstName: 'Naledi', lastName: 'Dlamini', email: uniqueEmail('naledi.parts'), phone: '+27825550111' });
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
  const address = uniqueEmail('tech.parts');
  const invite = await request(ctx.app)
    .post('/api/v1/business/technicians')
    .set('Authorization', `Bearer ${token}`)
    .send({ displayName: 'Tech Parts', email: address, password: 'TechPass123!' });
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

/** Minimal valid PNG (magic bytes matter — content is sniffed). */
function pngBuffer(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03]);
}

describe('Stage 7E — technician parts requests', () => {
  let ctx: TestContext;
  let tokens: { ownerToken: string; managerToken: string; ownerBToken: string };
  beforeEach(async () => {
    ctx = buildApp();
    tokens = await setupBusinesses(ctx);
  });

  it('technician creates a PENDING parts request for the assigned IN_PROGRESS job (201)', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const res = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/parts`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send(validParts());
    assert.equal(res.status, 201, `parts request failed: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    const created = res.body.data as Record<string, unknown>;
    assert.ok(created['id']);
    assert.equal(created['jobId'], working.jobId);
    assert.equal(created['status'], 'PENDING');
    assert.equal(created['reason'], validParts()['reason']);
    const requestedBy = created['requestedBy'] as Record<string, unknown>;
    assert.equal(requestedBy['technicianId'], working.technicianId);
    assert.ok(typeof requestedBy['displayName'] === 'string' && (requestedBy['displayName'] as string).length > 0);
    const businessJob = await request(ctx.app)
      .get(`/api/v1/business/jobs/${working.jobId}`)
      .set('Authorization', `Bearer ${working.ownerToken}`);
    assert.equal(businessJob.status, 200);
    assert.equal(created['businessId'], (businessJob.body.data.job as Record<string, unknown>)['businessId']);
    const items = created['items'] as Array<Record<string, unknown>>;
    assert.equal(items.length, 1);
    assert.equal(items[0]?.['partName'], 'Brake fluid');
    assert.equal(items[0]?.['quantity'], 2);
    assert.equal(items[0]?.['hasPhoto'], false);
    assert.ok(created['createdAt']);
    // The job stays IN_PROGRESS — Stage 7F moves it to AWAITING_PARTS.
    const job = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${working.jobId}`)
      .set('Authorization', `Bearer ${working.techToken}`);
    assert.equal(job.status, 200);
    assert.equal((job.body.data.job as Record<string, unknown>)['status'], 'IN_PROGRESS');
  });

  it('technician cannot request parts for an unassigned job (404)', async () => {
    const customer = await createCustomer(ctx, tokens.ownerToken);
    const job = await createInternalJob(ctx, tokens.ownerToken, customer['id'] as string);
    const tech = await inviteTechnician(ctx, tokens.ownerToken);
    await assignTechnician(ctx, tokens.ownerToken, job['id'] as string, tech.technician['id'] as string);
    await startJob(ctx, tech.token, job['id'] as string);
    const other = await inviteTechnician(ctx, tokens.ownerToken);
    const res = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${job['id']}/parts`)
      .set('Authorization', `Bearer ${other.token}`)
      .send(validParts());
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  it('technician cannot request parts for a job assigned to another technician (404)', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const other = await inviteTechnician(ctx, tokens.ownerToken);
    const res = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/parts`)
      .set('Authorization', `Bearer ${other.token}`)
      .send(validParts());
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  it('technician cannot request parts for another business job (404)', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const techB = await inviteTechnician(ctx, tokens.ownerBToken);
    const res = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/parts`)
      .set('Authorization', `Bearer ${techB.token}`)
      .send(validParts());
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  it('technician cannot request parts for a marketplace job (404)', async () => {
    const registered = await request(ctx.app)
      .post('/api/v1/auth/register')
      .send({ email: uniqueEmail('customer.market'), password: PASSWORD });
    assert.equal(registered.status, 201);
    const login = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: registered.body.data.user.email, password: PASSWORD });
    const customerToken = login.body.data.accessToken as string;
    // Two marketplace jobs: the second id ('2') is guaranteed to have no
    // INTERNAL row in the business store (the fixture internal job below
    // takes id '1'), so it proves marketplace jobs are unreachable
    // through the technician surface rather than colliding ids.
    let marketplaceId = '';
    for (let index = 0; index < 2; index += 1) {
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
      marketplaceId = created.body.data.id as string;
    }
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const res = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${marketplaceId}/parts`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send(validParts());
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  it('technician cannot request parts before work starts (REQUESTED → 422)', async () => {
    const customer = await createCustomer(ctx, tokens.ownerToken);
    const job = await createInternalJob(ctx, tokens.ownerToken, customer['id'] as string);
    const tech = await inviteTechnician(ctx, tokens.ownerToken);
    await assignTechnician(ctx, tokens.ownerToken, job['id'] as string, tech.technician['id'] as string);
    const res = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${job['id']}/parts`)
      .set('Authorization', `Bearer ${tech.token}`)
      .send(validParts());
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('technician cannot request parts for a cancelled job (422)', async () => {
    const customer = await createCustomer(ctx, tokens.ownerToken);
    const job = await createInternalJob(ctx, tokens.ownerToken, customer['id'] as string);
    const tech = await inviteTechnician(ctx, tokens.ownerToken);
    await assignTechnician(ctx, tokens.ownerToken, job['id'] as string, tech.technician['id'] as string);
    const cancelled = await request(ctx.app)
      .post(`/api/v1/business/jobs/${job['id']}/cancel`)
      .set('Authorization', `Bearer ${tokens.ownerToken}`)
      .send({ reason: 'Customer withdrew the request.' });
    assert.equal(cancelled.status, 200);
    const res = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${job['id']}/parts`)
      .set('Authorization', `Bearer ${tech.token}`)
      .send(validParts());
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('technician cannot request parts for a completed job (422)', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const completed = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/complete`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send({ note: 'Valve replaced, system tested and holding pressure.' });
    assert.equal(completed.status, 200);
    const res = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/parts`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send(validParts());
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('rejects missing part name, bad quantity and missing/short reason (422)', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const cases: Array<{ body: Record<string, unknown>; label: string }> = [
      { body: validParts({ partName: '' }), label: 'empty part name' },
      { body: validParts({ partName: '   ' }), label: 'blank part name' },
      { body: { quantity: 2, reason: validParts()['reason'] }, label: 'missing part name' },
      { body: validParts({ quantity: 0 }), label: 'zero quantity' },
      { body: validParts({ quantity: -3 }), label: 'negative quantity' },
      { body: validParts({ quantity: 1.5 }), label: 'fractional quantity' },
      { body: validParts({ quantity: 'two' }), label: 'non-numeric quantity' },
      { body: { partName: 'Brake fluid', reason: validParts()['reason'] }, label: 'missing quantity' },
      { body: { partName: 'Brake fluid', quantity: 2 }, label: 'missing reason' },
      { body: validParts({ reason: 'short' }), label: 'short reason' },
    ];
    for (const { body, label } of cases) {
      const res = await request(ctx.app)
        .post(`/api/v1/technician/jobs/${working.jobId}/parts`)
        .set('Authorization', `Bearer ${working.techToken}`)
        .send(body);
      assert.equal(res.status, 422, `${label}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR', label);
    }
  });

  it('technician lists and reads their own job parts requests', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const first = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/parts`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send(validParts());
    assert.equal(first.status, 201);
    const second = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/parts`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send(validParts({ partName: 'Copper pipe 15mm', quantity: 4 }));
    assert.equal(second.status, 201);
    const list = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${working.jobId}/parts`)
      .set('Authorization', `Bearer ${working.techToken}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.success, true);
    assert.equal((list.body.data.items as unknown[]).length, 2);
    assert.equal(list.body.data.total, 2);
    const one = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${working.jobId}/parts/${first.body.data.id}`)
      .set('Authorization', `Bearer ${working.techToken}`);
    assert.equal(one.status, 200);
    assert.equal((one.body.data.items as Array<Record<string, unknown>>)[0]?.['partName'], 'Brake fluid');
    const missing = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${working.jobId}/parts/99999`)
      .set('Authorization', `Bearer ${working.techToken}`);
    assert.equal(missing.status, 404);
  });

  it('business owner and manager can view requests for their own business', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const created = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/parts`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send(validParts());
    assert.equal(created.status, 201);
    for (const token of [working.ownerToken, working.managerToken]) {
      const list = await request(ctx.app)
        .get(`/api/v1/business/jobs/${working.jobId}/parts`)
        .set('Authorization', `Bearer ${token}`);
      assert.equal(list.status, 200, `business list failed: ${JSON.stringify(list.body)}`);
      const items = list.body.data.items as Array<Record<string, unknown>>;
      assert.equal(items.length, 1);
      assert.equal(items[0]?.['status'], 'PENDING');
      const itemList = items[0]?.['items'] as Array<Record<string, unknown>>;
      assert.equal(itemList[0]?.['partName'], 'Brake fluid');
      assert.equal(itemList[0]?.['quantity'], 2);
      const requestedBy = items[0]?.['requestedBy'] as Record<string, unknown>;
      assert.equal(requestedBy['technicianId'], working.technicianId);
      assert.ok(created.body.data.reason === items[0]?.['reason']);
      const one = await request(ctx.app)
        .get(`/api/v1/business/jobs/${working.jobId}/parts/${created.body.data.id}`)
        .set('Authorization', `Bearer ${token}`);
      assert.equal(one.status, 200);
      assert.equal(one.body.data.id, created.body.data.id);
    }
  });

  it('cross-business owner access to parts is blocked (404)', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const created = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/parts`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send(validParts());
    assert.equal(created.status, 201);
    const list = await request(ctx.app)
      .get(`/api/v1/business/jobs/${working.jobId}/parts`)
      .set('Authorization', `Bearer ${tokens.ownerBToken}`);
    assert.equal(list.status, 404);
    assert.equal(list.body.error.code, 'NOT_FOUND');
    const one = await request(ctx.app)
      .get(`/api/v1/business/jobs/${working.jobId}/parts/${created.body.data.id}`)
      .set('Authorization', `Bearer ${tokens.ownerBToken}`);
    assert.equal(one.status, 404);
  });

  it('non-authorized roles are blocked (401/403)', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const customer = await provisionUser(ctx, uniqueEmail('cust.parts'), ['CUSTOMER']);
    const professional = await provisionUser(ctx, uniqueEmail('pro.parts'), ['PROFESSIONAL']);
    // No token → 401 on both surfaces.
    const anonTech = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/parts`)
      .send(validParts());
    assert.equal(anonTech.status, 401);
    const anonBiz = await request(ctx.app).get(`/api/v1/business/jobs/${working.jobId}/parts`);
    assert.equal(anonBiz.status, 401);
    // Customer / professional cannot use the technician surface.
    for (const token of [customer.token, professional.token]) {
      const res = await request(ctx.app)
        .post(`/api/v1/technician/jobs/${working.jobId}/parts`)
        .set('Authorization', `Bearer ${token}`)
        .send(validParts());
      assert.equal(res.status, 403, `technician surface: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.error.code, 'FORBIDDEN_ROLE');
    }
    // Customer / professional / technician cannot use the business surface.
    for (const token of [customer.token, professional.token, working.techToken]) {
      const res = await request(ctx.app)
        .get(`/api/v1/business/jobs/${working.jobId}/parts`)
        .set('Authorization', `Bearer ${token}`);
      assert.equal(res.status, 403, `business surface: ${JSON.stringify(res.body)}`);
    }
    // Owner/manager cannot use the technician submission surface.
    for (const token of [working.ownerToken, working.managerToken]) {
      const res = await request(ctx.app)
        .post(`/api/v1/technician/jobs/${working.jobId}/parts`)
        .set('Authorization', `Bearer ${token}`)
        .send(validParts());
      assert.equal(res.status, 403, `owner submit: ${JSON.stringify(res.body)}`);
    }
  });

  it('parts-request creation appears in the technician and business timelines', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const created = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/parts`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send(validParts());
    assert.equal(created.status, 201);
    const techTimeline = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${working.jobId}/timeline`)
      .set('Authorization', `Bearer ${working.techToken}`);
    assert.equal(techTimeline.status, 200);
    const techEvents = techTimeline.body.data.events as Array<Record<string, unknown>>;
    const techParts = techEvents.filter((event) => event['kind'] === 'parts');
    assert.equal(techParts.length, 1);
    assert.equal(techParts[0]?.['partsRequestId'], created.body.data.id);
    assert.equal(techParts[0]?.['partName'], 'Brake fluid');
    assert.equal(techParts[0]?.['quantity'], 2);
    assert.equal(techParts[0]?.['partsStatus'], 'PENDING');
    const bizTimeline = await request(ctx.app)
      .get(`/api/v1/business/jobs/${working.jobId}/timeline`)
      .set('Authorization', `Bearer ${working.ownerToken}`);
    assert.equal(bizTimeline.status, 200);
    const bizEvents = bizTimeline.body.data.events as Array<Record<string, unknown>>;
    assert.equal(bizEvents.filter((event) => event['kind'] === 'parts').length, 1);
  });

  it('supports optional photo evidence with authorized delivery', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const created = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/parts`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .field('partName', 'Geyser element 3kW')
      .field('quantity', '1')
      .field('reason', 'The element has burnt out and must be replaced before testing.')
      .attach('photo', pngBuffer(), { filename: 'element.png', contentType: 'image/png' });
    assert.equal(created.status, 201, `photo request failed: ${JSON.stringify(created.body)}`);
    const items = created.body.data.items as Array<Record<string, unknown>>;
    assert.equal(items[0]?.['hasPhoto'], true);
    assert.equal(items[0]?.['photoMime'], 'image/png');
    // Technician downloads their own evidence photo.
    const techFile = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${working.jobId}/parts/${created.body.data.id}/photo/file`)
      .set('Authorization', `Bearer ${working.techToken}`);
    assert.equal(techFile.status, 200);
    assert.match(techFile.headers['content-type'] as string, /image\/png/);
    // Owner downloads the same evidence photo.
    const bizFile = await request(ctx.app)
      .get(`/api/v1/business/jobs/${working.jobId}/parts/${created.body.data.id}/photo/file`)
      .set('Authorization', `Bearer ${working.ownerToken}`);
    assert.equal(bizFile.status, 200);
    // Another technician cannot reach the photo (404, no probing).
    const other = await inviteTechnician(ctx, tokens.ownerToken);
    const foreign = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${working.jobId}/parts/${created.body.data.id}/photo/file`)
      .set('Authorization', `Bearer ${other.token}`);
    assert.equal(foreign.status, 404);
    // A request without a photo has no file to download.
    const plain = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/parts`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send(validParts());
    assert.equal(plain.status, 201);
    const noPhoto = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${working.jobId}/parts/${plain.body.data.id}/photo/file`)
      .set('Authorization', `Bearer ${working.techToken}`);
    assert.equal(noPhoto.status, 404);
  });

  it('rejects invalid file content and invalid ids', async () => {
    const working = await createStartedJob(ctx, tokens.ownerToken, tokens.managerToken);
    const badPhoto = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/parts`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .field('partName', 'Geyser element 3kW')
      .field('quantity', '1')
      .field('reason', 'The element has burnt out and must be replaced before testing.')
      .attach('photo', Buffer.from('not-an-image-at-all'), { filename: 'evil.txt', contentType: 'text/plain' });
    assert.equal(badPhoto.status, 422);
    const badJob = await request(ctx.app)
      .post('/api/v1/technician/jobs/abc/parts')
      .set('Authorization', `Bearer ${working.techToken}`)
      .send(validParts());
    assert.equal(badJob.status, 400);
    const badRequest = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${working.jobId}/parts/abc`)
      .set('Authorization', `Bearer ${working.techToken}`);
    assert.equal(badRequest.status, 400);
    const badBiz = await request(ctx.app)
      .get(`/api/v1/business/jobs/${working.jobId}/parts/abc`)
      .set('Authorization', `Bearer ${working.ownerToken}`);
    assert.equal(badBiz.status, 400);
  });
});
