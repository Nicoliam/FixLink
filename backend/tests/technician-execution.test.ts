/**
 * FixLink Stage 7D — technician execution + voice-note tests.
 *
 * Run: npm test (no MySQL required — in-memory business store with the
 * same rules as the MySQL implementation, plus an isolated local-storage
 * tmp dir per test app).
 *
 * Covers (§17 of the stage brief): assigned technician starts (1),
 * unassigned technician cannot start (2), cross-business access fails
 * (3), BEFORE/DURING/AFTER photos (4-6), text updates (7), voice notes
 * (8), unauthorized voice/image/update/complete attempts (9-12), voice
 * metadata persistence (13), storage-abstraction delivery (14),
 * voice-file authorization (15), cross-business voice access (16),
 * completion history (17), timeline events (18), audio validation (22),
 * size validation (23) and unsafe storage-key rejection (24).
 * Items 19-21 (7C / 6F / marketplace regression) are covered by the
 * untouched suites in the same `npm test` run.
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
  const storage = new LocalFileStorage(mkdtempSync(join(tmpdir(), 'fixlink-7d-')));
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
  const owner = await provisionUser(ctx, 'thabo.exec@example.co.za', ['BUSINESS_OWNER']);
  const business = ctx.business.seedBusiness({
    ownerUserId: owner.userId,
    businessName: 'Ubuntu Plumbing Co.',
    slug: 'ubuntu-plumbing-exec',
  });
  const manager = await provisionUser(ctx, 'lerato.exec@example.co.za', ['BUSINESS_MANAGER']);
  ctx.business.addMembership(business.id, manager.userId, 'BUSINESS_MANAGER');
  const ownerB = await provisionUser(ctx, 'david.exec@example.co.za', ['BUSINESS_OWNER']);
  ctx.business.seedBusiness({
    ownerUserId: ownerB.userId,
    businessName: 'Cape Spark Electrical',
    slug: 'cape-spark-exec',
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
    .send({ firstName: 'Naledi', lastName: 'Dlamini', email: uniqueEmail('naledi.exec'), phone: '+27825550111' });
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
  const address = uniqueEmail('tech.exec');
  const invite = await request(ctx.app)
    .post('/api/v1/business/technicians')
    .set('Authorization', `Bearer ${token}`)
    .send({ displayName: 'Tech Exec', email: address, password: 'TechPass123!' });
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

interface WorkingJob {
  jobId: string;
  techToken: string;
}

/** Customer → internal job → technician assigned → work started (IN_PROGRESS). */
async function createStartedJob(ctx: TestContext, ownerToken: string): Promise<WorkingJob> {
  const customer = await createCustomer(ctx, ownerToken);
  const job = await createInternalJob(ctx, ownerToken, customer['id'] as string);
  const tech = await inviteTechnician(ctx, ownerToken);
  await assignTechnician(ctx, ownerToken, job['id'] as string, tech.technician['id'] as string);
  const started = await request(ctx.app)
    .post(`/api/v1/technician/jobs/${job['id']}/start`)
    .set('Authorization', `Bearer ${tech.token}`)
    .send({});
  assert.equal(started.status, 200, `start failed: ${JSON.stringify(started.body)}`);
  return { jobId: job['id'] as string, techToken: tech.token };
}

/** Minimal valid image buffers (magic bytes matter — content is sniffed). */
function pngBuffer(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03]);
}

function jpegBuffer(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
}

/** Minimal valid audio buffers (container signatures matter — content is sniffed). */
function webmBuffer(): Buffer {
  return Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x93, 0x42, 0x82, 0x88, 0x77, 0x65, 0x62, 0x6d]);
}

function mp3Buffer(): Buffer {
  return Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04]);
}

function wavBuffer(): Buffer {
  return Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
}

function oggBuffer(): Buffer {
  return Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
}

function mp4Buffer(): Buffer {
  return Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
}

function oversizedAudio(): Buffer {
  const buf = Buffer.alloc(10 * 1024 * 1024 + 1, 0x61);
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]).copy(buf, 0);
  return buf;
}

function assertErrorEnvelope(res: { body: unknown }, code: string): void {
  const body = res.body as { success: boolean; error: { code: string; message: string } };
  assert.equal(body.success, false);
  assert.equal(body.error.code, code);
  assert.ok(typeof body.error.message === 'string' && body.error.message.length > 0);
}

async function uploadImage(
  ctx: TestContext,
  token: string,
  jobId: string,
  phase: string,
  buffer: Buffer = pngBuffer(),
  filename = 'before.png',
  contentType = 'image/png',
): Promise<request.Response> {
  return request(ctx.app)
    .post(`/api/v1/technician/jobs/${jobId}/images`)
    .set('Authorization', `Bearer ${token}`)
    .field('phase', phase)
    .attach('image', buffer, { filename, contentType });
}

async function uploadVoice(
  ctx: TestContext,
  token: string,
  jobId: string,
  buffer: Buffer = webmBuffer(),
  filename = 'note.webm',
  contentType = 'audio/webm',
  duration: string | null = '42',
): Promise<request.Response> {
  const req = request(ctx.app)
    .post(`/api/v1/technician/jobs/${jobId}/voice-notes`)
    .set('Authorization', `Bearer ${token}`)
    .attach('audio', buffer, { filename, contentType });
  if (duration !== null) req.field('duration', duration);
  return req;
}

describe('Stage 7D — technician start', () => {
  let ctx: TestContext;
  let setup: Awaited<ReturnType<typeof setupBusinesses>>;
  beforeEach(async () => {
    ctx = buildApp();
    setup = await setupBusinesses(ctx);
  });

  it('1. assigned technician can start a REQUESTED job (→ IN_PROGRESS + history)', async () => {
    const customer = await createCustomer(ctx, setup.ownerToken);
    const job = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const tech = await inviteTechnician(ctx, setup.ownerToken);
    await assignTechnician(ctx, setup.ownerToken, job['id'] as string, tech.technician['id'] as string);
    const res = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${job['id']}/start`)
      .set('Authorization', `Bearer ${tech.token}`)
      .send({});
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.status, 'IN_PROGRESS');
    const detail = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${job['id']}`)
      .set('Authorization', `Bearer ${tech.token}`);
    assert.equal(detail.status, 200);
    const statuses = (detail.body.data.timeline as Array<{ status: string }>).map((entry) => entry.status);
    assert.ok(statuses.includes('IN_PROGRESS'), `timeline missing IN_PROGRESS: ${JSON.stringify(statuses)}`);
  });

  it('2. unassigned technician cannot start the job (404, no leak)', async () => {
    const customer = await createCustomer(ctx, setup.ownerToken);
    const job = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const tech = await inviteTechnician(ctx, setup.ownerToken);
    const other = await inviteTechnician(ctx, setup.ownerToken);
    await assignTechnician(ctx, setup.ownerToken, job['id'] as string, tech.technician['id'] as string);
    const res = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${job['id']}/start`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({});
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
  });

  it('3. technician from another business cannot access the job (404)', async () => {
    const customer = await createCustomer(ctx, setup.ownerToken);
    const job = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const tech = await inviteTechnician(ctx, setup.ownerToken);
    await assignTechnician(ctx, setup.ownerToken, job['id'] as string, tech.technician['id'] as string);
    const techB = await inviteTechnician(ctx, setup.ownerBToken);
    const start = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${job['id']}/start`)
      .set('Authorization', `Bearer ${techB.token}`)
      .send({});
    assert.equal(start.status, 404);
    assertErrorEnvelope(start, 'NOT_FOUND');
    const detail = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${job['id']}`)
      .set('Authorization', `Bearer ${techB.token}`);
    assert.equal(detail.status, 404);
  });

  it('starting twice fails with 422 and leaves the job IN_PROGRESS', async () => {
    const { jobId, techToken } = await createStartedJob(ctx, setup.ownerToken);
    const res = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${jobId}/start`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({});
    assert.equal(res.status, 422);
    assertErrorEnvelope(res, 'VALIDATION_ERROR');
    const detail = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${jobId}`)
      .set('Authorization', `Bearer ${techToken}`);
    assert.equal(detail.body.data.job.status, 'IN_PROGRESS');
  });

  it('customers and managers cannot use the technician start endpoint', async () => {
    const customer = await createCustomer(ctx, setup.ownerToken);
    const job = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const tech = await inviteTechnician(ctx, setup.ownerToken);
    await assignTechnician(ctx, setup.ownerToken, job['id'] as string, tech.technician['id'] as string);
    const customerUser = await provisionUser(ctx, uniqueEmail('cust.exec'), ['CUSTOMER']);
    const asCustomer = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${job['id']}/start`)
      .set('Authorization', `Bearer ${customerUser.token}`)
      .send({});
    assert.equal(asCustomer.status, 403);
    const asManager = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${job['id']}/start`)
      .set('Authorization', `Bearer ${setup.managerToken}`)
      .send({});
    assert.equal(asManager.status, 403);
  });
});

describe('Stage 7D — BEFORE/DURING/AFTER photos', () => {
  let ctx: TestContext;
  let setup: Awaited<ReturnType<typeof setupBusinesses>>;
  beforeEach(async () => {
    ctx = buildApp();
    setup = await setupBusinesses(ctx);
  });

  it('4. assigned technician can add a BEFORE photo', async () => {
    const { jobId, techToken } = await createStartedJob(ctx, setup.ownerToken);
    const res = await uploadImage(ctx, techToken, jobId, 'BEFORE', jpegBuffer(), 'before.jpg', 'image/jpeg');
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.phase, 'BEFORE');
    assert.equal(res.body.data.mimeType, 'image/jpeg');
    assert.ok(typeof res.body.data.id === 'string');
    // No storage key or path leaks through the API.
    assert.ok(!('storageKey' in res.body.data), 'storage key leaked');
    assert.ok(!('file_reference' in res.body.data), 'file reference leaked');
    assert.ok(!('fileReference' in res.body.data), 'file reference leaked');
  });

  it('5. assigned technician can add a DURING photo', async () => {
    const { jobId, techToken } = await createStartedJob(ctx, setup.ownerToken);
    const res = await uploadImage(ctx, techToken, jobId, 'DURING');
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.phase, 'DURING');
  });

  it('6. assigned technician can add an AFTER photo', async () => {
    const { jobId, techToken } = await createStartedJob(ctx, setup.ownerToken);
    const res = await uploadImage(ctx, techToken, jobId, 'AFTER');
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.phase, 'AFTER');
  });

  it('photos are rejected before work starts (422)', async () => {
    const customer = await createCustomer(ctx, setup.ownerToken);
    const job = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const tech = await inviteTechnician(ctx, setup.ownerToken);
    await assignTechnician(ctx, setup.ownerToken, job['id'] as string, tech.technician['id'] as string);
    const res = await uploadImage(ctx, tech.token, job['id'] as string, 'BEFORE');
    assert.equal(res.status, 422);
    assertErrorEnvelope(res, 'VALIDATION_ERROR');
  });

  it('10. unauthorized technician cannot upload images (404)', async () => {
    const { jobId } = await createStartedJob(ctx, setup.ownerToken);
    const other = await inviteTechnician(ctx, setup.ownerToken);
    const res = await uploadImage(ctx, other.token, jobId, 'BEFORE');
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
  });

  it('uploader can delete their photo; bytes are removed from storage', async () => {
    const { jobId, techToken } = await createStartedJob(ctx, setup.ownerToken);
    const uploaded = await uploadImage(ctx, techToken, jobId, 'DURING');
    assert.equal(uploaded.status, 201);
    const imageId = uploaded.body.data.id as string;
    const deleted = await request(ctx.app)
      .delete(`/api/v1/technician/jobs/${jobId}/images/${imageId}`)
      .set('Authorization', `Bearer ${techToken}`);
    assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
    const fetched = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${jobId}/images/${imageId}/file`)
      .set('Authorization', `Bearer ${techToken}`);
    assert.equal(fetched.status, 404);
  });

  it('photo bytes require authorization (401 without token, 404 for strangers)', async () => {
    const { jobId, techToken } = await createStartedJob(ctx, setup.ownerToken);
    const uploaded = await uploadImage(ctx, techToken, jobId, 'BEFORE');
    const imageId = uploaded.body.data.id as string;
    const anon = await request(ctx.app).get(`/api/v1/technician/jobs/${jobId}/images/${imageId}/file`);
    assert.equal(anon.status, 401);
    const other = await inviteTechnician(ctx, setup.ownerToken);
    const stranger = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${jobId}/images/${imageId}/file`)
      .set('Authorization', `Bearer ${other.token}`);
    assert.equal(stranger.status, 404);
    const owner = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${jobId}/images/${imageId}/file`)
      .set('Authorization', `Bearer ${techToken}`);
    assert.equal(owner.status, 200);
    assert.equal(owner.headers['content-type'], 'image/png');
    assert.ok(String(owner.headers['content-disposition'] ?? '').startsWith('inline;'));
  });
});

describe('Stage 7D — text updates', () => {
  let ctx: TestContext;
  let setup: Awaited<ReturnType<typeof setupBusinesses>>;
  beforeEach(async () => {
    ctx = buildApp();
    setup = await setupBusinesses(ctx);
  });

  it('7. assigned technician can add BEFORE/DURING text updates', async () => {
    const { jobId, techToken } = await createStartedJob(ctx, setup.ownerToken);
    const before = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${jobId}/updates`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ phase: 'BEFORE', note: 'Geyser isolated at the mains; pressure valve accessible.' });
    assert.equal(before.status, 201, JSON.stringify(before.body));
    assert.equal(before.body.data.phase, 'BEFORE');
    const during = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${jobId}/updates`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ phase: 'DURING', note: 'Old valve removed; fitting the replacement now.' });
    assert.equal(during.status, 201, JSON.stringify(during.body));
    assert.equal(during.body.data.phase, 'DURING');
  });

  it('11. unauthorized technician cannot add updates (404)', async () => {
    const { jobId } = await createStartedJob(ctx, setup.ownerToken);
    const other = await inviteTechnician(ctx, setup.ownerToken);
    const res = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${jobId}/updates`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ phase: 'DURING', note: 'Trying to write on someone else’s job.' });
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
  });

  it('updates are rejected before work starts (422)', async () => {
    const customer = await createCustomer(ctx, setup.ownerToken);
    const job = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const tech = await inviteTechnician(ctx, setup.ownerToken);
    await assignTechnician(ctx, setup.ownerToken, job['id'] as string, tech.technician['id'] as string);
    const res = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${job['id']}/updates`)
      .set('Authorization', `Bearer ${tech.token}`)
      .send({ phase: 'BEFORE', note: 'Too early.' });
    assert.equal(res.status, 422);
  });
});

describe('Stage 7D — voice notes', () => {
  let ctx: TestContext;
  let setup: Awaited<ReturnType<typeof setupBusinesses>>;
  beforeEach(async () => {
    ctx = buildApp();
    setup = await setupBusinesses(ctx);
  });

  it('8. assigned technician can add a voice note', async () => {
    const { jobId, techToken } = await createStartedJob(ctx, setup.ownerToken);
    const res = await uploadVoice(ctx, techToken, jobId);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.mimeType, 'audio/webm');
    assert.ok(typeof res.body.data.id === 'string');
    assert.ok(!('storageKey' in res.body.data), 'storage key leaked');
    assert.ok(!('fileReference' in res.body.data), 'file reference leaked');
  });

  it('13. voice-note metadata is persisted (mime, size, duration)', async () => {
    const { jobId, techToken } = await createStartedJob(ctx, setup.ownerToken);
    const created = await uploadVoice(ctx, techToken, jobId, mp3Buffer(), 'note.mp3', 'audio/mpeg', '125');
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.mimeType, 'audio/mpeg');
    assert.equal(created.body.data.durationSeconds, 125);
    assert.equal(created.body.data.size, mp3Buffer().length);
    const listed = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${jobId}/voice-notes`)
      .set('Authorization', `Bearer ${techToken}`);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.data.total, 1);
    assert.equal(listed.body.data.items[0].durationSeconds, 125);
    assert.equal(listed.body.data.items[0].mimeType, 'audio/mpeg');
  });

  it('wav, ogg and mp4 voice notes are accepted', async () => {
    const { jobId, techToken } = await createStartedJob(ctx, setup.ownerToken);
    for (const [buffer, filename, contentType] of [
      [wavBuffer(), 'note.wav', 'audio/wav'],
      [oggBuffer(), 'note.ogg', 'audio/ogg'],
      [mp4Buffer(), 'note.mp4', 'audio/mp4'],
    ] as const) {
      const res = await uploadVoice(ctx, techToken, jobId, buffer, filename, contentType);
      assert.equal(res.status, 201, `rejected ${contentType}: ${JSON.stringify(res.body)}`);
    }
  });

  it('14. voice file is stored through the storage abstraction and streams back', async () => {
    const { jobId, techToken } = await createStartedJob(ctx, setup.ownerToken);
    const created = await uploadVoice(ctx, techToken, jobId);
    const voiceId = created.body.data.id as string;
    const fetched = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${jobId}/voice-notes/${voiceId}/file`)
      .set('Authorization', `Bearer ${techToken}`);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.headers['content-type'], 'audio/webm');
    assert.ok(String(fetched.headers['content-disposition'] ?? '').startsWith('inline;'));
    assert.ok(String(fetched.headers['cache-control'] ?? '').includes('private'));
  });

  it('9. unauthorized technician cannot add a voice note (404)', async () => {
    const { jobId } = await createStartedJob(ctx, setup.ownerToken);
    const other = await inviteTechnician(ctx, setup.ownerToken);
    const res = await uploadVoice(ctx, other.token, jobId);
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
  });

  it('15. voice-note file endpoint requires authorization', async () => {
    const { jobId, techToken } = await createStartedJob(ctx, setup.ownerToken);
    const created = await uploadVoice(ctx, techToken, jobId);
    const voiceId = created.body.data.id as string;
    const anon = await request(ctx.app).get(`/api/v1/technician/jobs/${jobId}/voice-notes/${voiceId}/file`);
    assert.equal(anon.status, 401);
    const other = await inviteTechnician(ctx, setup.ownerToken);
    const stranger = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${jobId}/voice-notes/${voiceId}/file`)
      .set('Authorization', `Bearer ${other.token}`);
    assert.equal(stranger.status, 404);
  });

  it('16. cross-business voice-note access fails (404)', async () => {
    const { jobId, techToken } = await createStartedJob(ctx, setup.ownerToken);
    const created = await uploadVoice(ctx, techToken, jobId);
    const voiceId = created.body.data.id as string;
    const techB = await inviteTechnician(ctx, setup.ownerBToken);
    const listed = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${jobId}/voice-notes`)
      .set('Authorization', `Bearer ${techB.token}`);
    assert.equal(listed.status, 404);
    const fetched = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${jobId}/voice-notes/${voiceId}/file`)
      .set('Authorization', `Bearer ${techB.token}`);
    assert.equal(fetched.status, 404);
  });

  it('22. file validation rejects unsupported audio and MIME/content mismatches', async () => {
    const { jobId, techToken } = await createStartedJob(ctx, setup.ownerToken);
    const text = await uploadVoice(
      ctx,
      techToken,
      jobId,
      Buffer.from('this is not audio at all, just plain text bytes.....'),
      'note.txt',
      'text/plain',
    );
    assert.equal(text.status, 422);
    assertErrorEnvelope(text, 'VALIDATION_ERROR');
    // Claimed audio MIME but PNG bytes: content sniffing must reject.
    const mismatch = await uploadVoice(ctx, techToken, jobId, pngBuffer(), 'note.webm', 'audio/webm');
    assert.equal(mismatch.status, 422);
    assertErrorEnvelope(mismatch, 'VALIDATION_ERROR');
    // Claimed image MIME but audio bytes on the image endpoint.
    const imageMismatch = await uploadImage(ctx, techToken, jobId, 'DURING', webmBuffer(), 'x.png', 'image/png');
    assert.equal(imageMismatch.status, 422);
    // Invalid duration is rejected, not silently stored.
    const badDuration = await uploadVoice(ctx, techToken, jobId, webmBuffer(), 'n.webm', 'audio/webm', 'nope');
    assert.equal(badDuration.status, 422);
    assertErrorEnvelope(badDuration, 'VALIDATION_ERROR');
  });

  it('23. file size validation works (voice >10MB, image >5MB)', async () => {
    const { jobId, techToken } = await createStartedJob(ctx, setup.ownerToken);
    const bigVoice = await uploadVoice(ctx, techToken, jobId, oversizedAudio(), 'long.webm', 'audio/webm');
    assert.equal(bigVoice.status, 422, `expected 422, got ${bigVoice.status}: ${JSON.stringify(bigVoice.body)}`);
    assertErrorEnvelope(bigVoice, 'VALIDATION_ERROR');
    const bigImage = Buffer.alloc(5 * 1024 * 1024 + 1, 0x61);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bigImage, 0);
    const image = await uploadImage(ctx, techToken, jobId, 'DURING', bigImage, 'big.png', 'image/png');
    assert.equal(image.status, 422, `expected 422, got ${image.status}: ${JSON.stringify(image.body)}`);
    assertErrorEnvelope(image, 'VALIDATION_ERROR');
  });

  it('24. malformed and unsafe storage keys are rejected by the storage adapter', async () => {
    const storage = new LocalFileStorage(mkdtempSync(join(tmpdir(), 'fixlink-7d-keys-')));
    assert.equal(await storage.read('../evil'), null);
    assert.equal(await storage.read('job-images/1/../../etc/passwd'), null);
    assert.equal(await storage.read('job-images/0/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png'), null);
    assert.equal(await storage.read('job-voice-notes/1/not-hex.webm'), null);
    assert.equal(await storage.read('job-voice-notes/1/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.exe'), null);
    assert.equal(await storage.read(''), null);
    await assert.rejects(() => storage.save('abc', Buffer.from([1]), 'png'), /Invalid job id/);
    await assert.rejects(() => storage.saveVoiceNote('1', Buffer.from([1]), 'exe'), /Unsupported audio/);
    // Round-trip through the real adapter still works for both kinds.
    const image = await storage.save('7', jpegBuffer(), 'jpg');
    assert.match(image.storageKey, /^job-images\/7\/[0-9a-f]{32}\.jpg$/);
    assert.deepEqual(await storage.read(image.storageKey), jpegBuffer());
    const voice = await storage.saveVoiceNote('7', webmBuffer(), 'webm');
    assert.match(voice.storageKey, /^job-voice-notes\/7\/[0-9a-f]{32}\.webm$/);
    assert.deepEqual(await storage.read(voice.storageKey), webmBuffer());
  });
});

describe('Stage 7D — completion and timeline', () => {
  let ctx: TestContext;
  let setup: Awaited<ReturnType<typeof setupBusinesses>>;
  beforeEach(async () => {
    ctx = buildApp();
    setup = await setupBusinesses(ctx);
  });

  it('completion requires a note and only works from IN_PROGRESS', async () => {
    const customer = await createCustomer(ctx, setup.ownerToken);
    const job = await createInternalJob(ctx, setup.ownerToken, customer['id'] as string);
    const tech = await inviteTechnician(ctx, setup.ownerToken);
    await assignTechnician(ctx, setup.ownerToken, job['id'] as string, tech.technician['id'] as string);
    const early = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${job['id']}/complete`)
      .set('Authorization', `Bearer ${tech.token}`)
      .send({ note: 'Trying to complete before starting.' });
    assert.equal(early.status, 422);
    await request(ctx.app)
      .post(`/api/v1/technician/jobs/${job['id']}/start`)
      .set('Authorization', `Bearer ${tech.token}`)
      .send({});
    const empty = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${job['id']}/complete`)
      .set('Authorization', `Bearer ${tech.token}`)
      .send({ note: '   ' });
    assert.equal(empty.status, 422);
    assertErrorEnvelope(empty, 'VALIDATION_ERROR');
  });

  it('12. unauthorized technician cannot complete the job (404)', async () => {
    const { jobId } = await createStartedJob(ctx, setup.ownerToken);
    const other = await inviteTechnician(ctx, setup.ownerToken);
    const res = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${jobId}/complete`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ note: 'Not my job.' });
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
  });

  it('17. completion records the AFTER note and COMPLETED status history', async () => {
    const { jobId, techToken } = await createStartedJob(ctx, setup.ownerToken);
    const res = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${jobId}/complete`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ note: 'Valve replaced and pressure tested; no further leaks.' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.job.status, 'COMPLETED');
    assert.equal(res.body.data.update.phase, 'AFTER');
    assert.equal(res.body.data.update.note, 'Valve replaced and pressure tested; no further leaks.');
    // Work documentation is closed once completed.
    const late = await uploadImage(ctx, techToken, jobId, 'AFTER');
    assert.equal(late.status, 422);
    const repeat = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${jobId}/complete`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ note: 'Again.' });
    assert.equal(repeat.status, 422);
    const timeline = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${jobId}/timeline`)
      .set('Authorization', `Bearer ${techToken}`);
    assert.equal(timeline.status, 200);
    const statuses = (timeline.body.data.events as Array<{ kind: string; status?: string }>)
      .filter((event) => event.kind === 'status')
      .map((event) => event.status);
    assert.ok(statuses.includes('IN_PROGRESS'), JSON.stringify(statuses));
    assert.ok(statuses.includes('COMPLETED'), JSON.stringify(statuses));
  });

  it('18. timeline includes assignment, updates, photos and voice notes in order', async () => {
    const { jobId, techToken } = await createStartedJob(ctx, setup.ownerToken);
    await uploadImage(ctx, techToken, jobId, 'BEFORE');
    await request(ctx.app)
      .post(`/api/v1/technician/jobs/${jobId}/updates`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ phase: 'BEFORE', note: 'Site inspected.' });
    await uploadVoice(ctx, techToken, jobId);
    await uploadImage(ctx, techToken, jobId, 'DURING');
    const res = await request(ctx.app)
      .get(`/api/v1/technician/jobs/${jobId}/timeline`)
      .set('Authorization', `Bearer ${techToken}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const events = res.body.data.events as Array<{ kind: string; createdAt: string }>;
    const kinds = new Set(events.map((event) => event.kind));
    for (const expected of ['status', 'assignment', 'update', 'image', 'voice']) {
      assert.ok(kinds.has(expected), `timeline missing ${expected}: ${JSON.stringify(events)}`);
    }
    const stamps = events.map((event) => event.createdAt);
    assert.deepEqual([...stamps].sort(), stamps, 'timeline is not chronological');
  });
});

describe('Stage 7D — business visibility', () => {
  let ctx: TestContext;
  let setup: Awaited<ReturnType<typeof setupBusinesses>>;
  beforeEach(async () => {
    ctx = buildApp();
    setup = await setupBusinesses(ctx);
  });

  it('owner and manager can see execution documentation (read-only)', async () => {
    const { jobId, techToken } = await createStartedJob(ctx, setup.ownerToken);
    const uploaded = await uploadImage(ctx, techToken, jobId, 'BEFORE');
    const imageId = uploaded.body.data.id as string;
    await request(ctx.app)
      .post(`/api/v1/technician/jobs/${jobId}/updates`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ phase: 'DURING', note: 'Progress note for management.' });
    const voice = await uploadVoice(ctx, techToken, jobId);
    const voiceId = voice.body.data.id as string;
    for (const token of [setup.ownerToken, setup.managerToken]) {
      const images = await request(ctx.app)
        .get(`/api/v1/business/jobs/${jobId}/images`)
        .set('Authorization', `Bearer ${token}`);
      assert.equal(images.status, 200, JSON.stringify(images.body));
      assert.equal(images.body.data.total, 1);
      const updates = await request(ctx.app)
        .get(`/api/v1/business/jobs/${jobId}/updates`)
        .set('Authorization', `Bearer ${token}`);
      assert.equal(updates.status, 200);
      assert.equal(updates.body.data.total, 1);
      const voices = await request(ctx.app)
        .get(`/api/v1/business/jobs/${jobId}/voice-notes`)
        .set('Authorization', `Bearer ${token}`);
      assert.equal(voices.status, 200);
      assert.equal(voices.body.data.total, 1);
      const timeline = await request(ctx.app)
        .get(`/api/v1/business/jobs/${jobId}/timeline`)
        .set('Authorization', `Bearer ${token}`);
      assert.equal(timeline.status, 200);
      assert.ok((timeline.body.data.events as unknown[]).length >= 4);
      const imageFile = await request(ctx.app)
        .get(`/api/v1/business/jobs/${jobId}/images/${imageId}/file`)
        .set('Authorization', `Bearer ${token}`);
      assert.equal(imageFile.status, 200);
      const voiceFile = await request(ctx.app)
        .get(`/api/v1/business/jobs/${jobId}/voice-notes/${voiceId}/file`)
        .set('Authorization', `Bearer ${token}`);
      assert.equal(voiceFile.status, 200);
      assert.equal(voiceFile.headers['content-type'], 'audio/webm');
    }
  });

  it('another business cannot see execution documentation (404)', async () => {
    const { jobId } = await createStartedJob(ctx, setup.ownerToken);
    for (const path of ['images', 'updates', 'voice-notes', 'timeline']) {
      const res = await request(ctx.app)
        .get(`/api/v1/business/jobs/${jobId}/${path}`)
        .set('Authorization', `Bearer ${setup.ownerBToken}`);
      assert.equal(res.status, 404, path);
      assertErrorEnvelope(res, 'NOT_FOUND');
    }
  });

  it('technicians cannot use the business visibility surface (403)', async () => {
    const { jobId, techToken } = await createStartedJob(ctx, setup.ownerToken);
    const res = await request(ctx.app)
      .get(`/api/v1/business/jobs/${jobId}/images`)
      .set('Authorization', `Bearer ${techToken}`);
    assert.equal(res.status, 403);
  });
});
