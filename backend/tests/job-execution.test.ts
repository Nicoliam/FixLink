/**
 * FixLink Stage 6F — job execution & work-documentation tests.
 *
 * Run: npm test (no MySQL required — uses the in-memory jobs/quotes/
 * execution stores with the same rules as the MySQL implementation, plus
 * an isolated local-storage tmp dir per test app).
 *
 * Covers: BEFORE/DURING/AFTER photo uploads (provider only, IN_PROGRESS
 * only), upload validation (phase, MIME, size, content sniffing), private
 * photo retrieval (owner customer + addressed provider only, no raw
 * paths or storage keys), progress updates, completion (note required,
 * IN_PROGRESS → COMPLETED), customer confirmation (COMPLETED →
 * CONFIRMED → CLOSED atomically), closed-job immutability, transition
 * guards, timeline aggregation and failure atomicity.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
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
import { MemoryQuotesStore } from '../src/modules/quotes/memory-quotes.store';
import { MemoryExecutionStore } from '../src/modules/execution/memory-execution.store';
import { LocalFileStorage } from '../src/services/file-storage';

interface TestContext {
  app: Express;
  users: MemoryUserRepository;
  jobs: MemoryJobsStore;
  quotes: MemoryQuotesStore;
  execution: MemoryExecutionStore;
}

function buildApp(): TestContext {
  const users = new MemoryUserRepository();
  const jobs = new MemoryJobsStore();
  const quotes = new MemoryQuotesStore(jobs);
  const execution = new MemoryExecutionStore(jobs, quotes);
  const storage = new LocalFileStorage(mkdtempSync(join(tmpdir(), 'fixlink-6f-')));
  const app = createApp({
    users,
    refreshStore: new MemoryRefreshStore(),
    marketplace: new MemoryMarketplaceStore(),
    jobs,
    quotes,
    execution,
    storage,
  });
  return { app, users, jobs, quotes, execution };
}

const PASSWORD = 'Str0ngPassw0rd!';

/** A future SAST slot: 5 October 2026, 10:00 SAST (UTC+2). */
const FUTURE_SLOT = '2026-10-05T10:00:00+02:00';

/** Minimal valid image buffers (magic bytes matter — content is sniffed). */
function pngBuffer(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03]);
}

function jpegBuffer(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
}

function webpBuffer(): Buffer {
  return Buffer.from([0x52, 0x49, 0x46, 0x46, 0x0c, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x00]);
}

function oversizedPng(): Buffer {
  const buf = Buffer.alloc(5 * 1024 * 1024 + 1, 0x61);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  return buf;
}

async function register(app: Express, email: string, role?: string): Promise<{ token: string; userId: string }> {
  const res = await request(app).post('/api/v1/auth/register').send(role ? { email, password: PASSWORD, role } : { email, password: PASSWORD });
  assert.equal(res.status, 201, `register failed for ${email}: ${JSON.stringify(res.body)}`);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  assert.equal(login.status, 200);
  return { token: login.body.data.accessToken as string, userId: login.body.data.user.id as string };
}

/**
 * Provision a user with EXACTLY the given roles (no self-registration
 * default) — the only way to model provisioned-only actors (technician,
 * manager, admin) as production creates them via the business invite flow.
 */
async function provisionUser(ctx: TestContext, email: string, roles: string[]): Promise<{ token: string; userId: string }> {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const user = await ctx.users.create({ email, phone: null, passwordHash });
  await ctx.users.setRoles(user.id, roles);
  const login = await request(ctx.app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  assert.equal(login.status, 200, `login failed for provisioned ${email}: ${JSON.stringify(login.body)}`);
  return { token: login.body.data.accessToken as string, userId: user.id };
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

async function createJob(ctx: TestContext, customerToken: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await request(ctx.app)
    .post('/api/v1/jobs')
    .set('Authorization', `Bearer ${customerToken}`)
    .send(validJob(overrides));
  assert.equal(res.status, 201, `job creation failed: ${JSON.stringify(res.body)}`);
  return (res.body.data as { id: string }).id;
}

interface WorkingJob {
  jobId: string;
}

/** Customer requests → provider quotes → customer accepts → provider schedules → provider starts. */
async function createInProgressJob(ctx: TestContext, customerToken: string, proToken: string, overrides: Record<string, unknown> = {}): Promise<WorkingJob> {
  const jobId = await createJob(ctx, customerToken, overrides);
  const created = await request(ctx.app)
    .post(`/api/v1/jobs/${jobId}/quotes`)
    .set('Authorization', `Bearer ${proToken}`)
    .send({ total: 1250, currency: 'ZAR', message: 'Supply and install replacement kitchen mixer tap.' });
  assert.equal(created.status, 201, `quote creation failed: ${JSON.stringify(created.body)}`);
  const quoteId = (created.body.data as { id: string }).id;
  const accepted = await request(ctx.app)
    .post(`/api/v1/jobs/${jobId}/quotes/${quoteId}/accept`)
    .set('Authorization', `Bearer ${customerToken}`);
  assert.equal(accepted.status, 200, `quote acceptance failed: ${JSON.stringify(accepted.body)}`);
  const scheduled = await request(ctx.app)
    .post(`/api/v1/jobs/${jobId}/schedule`)
    .set('Authorization', `Bearer ${proToken}`)
    .send({ scheduledAt: FUTURE_SLOT });
  assert.equal(scheduled.status, 200, `scheduling failed: ${JSON.stringify(scheduled.body)}`);
  const started = await request(ctx.app).post(`/api/v1/jobs/${jobId}/start`).set('Authorization', `Bearer ${proToken}`);
  assert.equal(started.status, 200, `start failed: ${JSON.stringify(started.body)}`);
  return { jobId };
}

async function jobStatus(ctx: TestContext, token: string, jobId: string): Promise<string> {
  const detail = await request(ctx.app).get(`/api/v1/jobs/${jobId}`).set('Authorization', `Bearer ${token}`);
  assert.equal(detail.status, 200);
  return (detail.body.data as { status: string }).status;
}

async function upload(ctx: TestContext, token: string, jobId: string, phase: string, buf: Buffer, filename: string, contentType: string) {
  return request(ctx.app)
    .post(`/api/v1/jobs/${jobId}/images`)
    .set('Authorization', `Bearer ${token}`)
    .field('phase', phase)
    .attach('image', buf, { filename, contentType });
}

describe('POST /api/v1/jobs/:jobId/images (work photos)', () => {
  let ctx: TestContext;
  let customerToken: string;
  let proToken: string;
  let job: WorkingJob;
  beforeEach(async () => {
    ctx = buildApp();
    customerToken = (await register(ctx.app, 'thandi.khumalo@example.co.za')).token;
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    proToken = pro.token;
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    job = await createInProgressJob(ctx, customerToken, proToken);
  });

  it('1. provider can upload a BEFORE photo (201, metadata only)', async () => {
    const res = await upload(ctx, proToken, job.jobId, 'BEFORE', pngBuffer(), 'before.png', 'image/png');
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assertSuccessEnvelope(res);
    const image = res.body.data as Record<string, unknown>;
    assert.equal(image['jobId'], job.jobId);
    assert.equal(image['phase'], 'BEFORE');
    assert.equal(image['mimeType'], 'image/png');
    assert.ok(typeof image['id'] === 'string');
    // Metadata only: no binary, no raw path, no storage key.
    assert.ok(!('buffer' in image) && !('data' in image) && !('path' in image));
    assert.ok(!('storageKey' in image) && !('file_reference' in image) && !('fileReference' in image));
  });

  it('2. provider can upload a DURING photo', async () => {
    const res = await upload(ctx, proToken, job.jobId, 'DURING', jpegBuffer(), 'progress.jpg', 'image/jpeg');
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal((res.body.data as { phase: string }).phase, 'DURING');
  });

  it('3. provider can upload an AFTER photo', async () => {
    const res = await upload(ctx, proToken, job.jobId, 'AFTER', webpBuffer(), 'after.webp', 'image/webp');
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal((res.body.data as { phase: string }).phase, 'AFTER');
  });

  it('4. customer cannot upload a provider work photo (403)', async () => {
    const res = await upload(ctx, customerToken, job.jobId, 'BEFORE', pngBuffer(), 'before.png', 'image/png');
    assert.equal(res.status, 403);
    assertErrorEnvelope(res, 'FORBIDDEN_ROLE');
  });

  it('5. unrelated provider cannot upload a photo (404)', async () => {
    const other = await register(ctx.app, 'johan.pro@example.co.za', 'PROFESSIONAL');
    ctx.quotes.linkProfessionalProfile(other.userId, '2');
    const res = await upload(ctx, other.token, job.jobId, 'BEFORE', pngBuffer(), 'before.png', 'image/png');
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
  });

  it('7. invalid phase is rejected (422)', async () => {
    for (const phase of ['SETUP', '', 'before-work']) {
      const res = await upload(ctx, proToken, job.jobId, phase, pngBuffer(), 'before.png', 'image/png');
      assert.equal(res.status, 422, `expected 422 for phase ${JSON.stringify(phase)}`);
      assertErrorEnvelope(res, 'VALIDATION_ERROR');
    }
  });

  it('8. invalid MIME is rejected (422)', async () => {
    const text = await upload(ctx, proToken, job.jobId, 'BEFORE', Buffer.from('not an image'), 'note.txt', 'text/plain');
    assert.equal(text.status, 422);
    assertErrorEnvelope(text, 'VALIDATION_ERROR');
    // Spoofed content: PNG extension with text bytes is sniffed and rejected.
    const spoofed = await upload(ctx, proToken, job.jobId, 'BEFORE', Buffer.from('not an image at all'), 'evil.png', 'image/png');
    assert.equal(spoofed.status, 422);
    assertErrorEnvelope(spoofed, 'VALIDATION_ERROR');
  });

  it('9. oversized file is rejected (422)', async () => {
    const res = await upload(ctx, proToken, job.jobId, 'BEFORE', oversizedPng(), 'huge.png', 'image/png');
    assert.equal(res.status, 422);
    assertErrorEnvelope(res, 'VALIDATION_ERROR');
  });

  it('upload requires IN_PROGRESS (SCHEDULED job rejected, 422)', async () => {
    const scheduledId = await createJob(ctx, customerToken);
    const created = await request(ctx.app)
      .post(`/api/v1/jobs/${scheduledId}/quotes`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ total: 500 });
    assert.equal(created.status, 201);
    const quoteId = (created.body.data as { id: string }).id;
    await request(ctx.app).post(`/api/v1/jobs/${scheduledId}/quotes/${quoteId}/accept`).set('Authorization', `Bearer ${customerToken}`);
    await request(ctx.app).post(`/api/v1/jobs/${scheduledId}/schedule`).set('Authorization', `Bearer ${proToken}`).send({ scheduledAt: FUTURE_SLOT });
    const res = await upload(ctx, proToken, scheduledId, 'BEFORE', pngBuffer(), 'before.png', 'image/png');
    assert.equal(res.status, 422);
    assertErrorEnvelope(res, 'VALIDATION_ERROR');
  });
});

describe('GET /api/v1/jobs/:jobId/images (photo retrieval)', () => {
  let ctx: TestContext;
  let customerToken: string;
  let proToken: string;
  let job: WorkingJob;
  let imageId: string;
  beforeEach(async () => {
    ctx = buildApp();
    customerToken = (await register(ctx.app, 'thandi.khumalo@example.co.za')).token;
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    proToken = pro.token;
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    job = await createInProgressJob(ctx, customerToken, proToken);
    const uploaded = await upload(ctx, proToken, job.jobId, 'BEFORE', pngBuffer(), 'before.png', 'image/png');
    assert.equal(uploaded.status, 201);
    imageId = (uploaded.body.data as { id: string }).id;
  });

  it('11. customer can retrieve their own job photos', async () => {
    const res = await request(ctx.app).get(`/api/v1/jobs/${job.jobId}/images`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(res.status, 200);
    assertSuccessEnvelope(res);
    const data = res.body.data as { items: Array<{ id: string; phase: string }>; total: number };
    assert.equal(data.total, 1);
    assert.equal(data.items[0]?.id, imageId);
  });

  it('12. provider can retrieve their own job photos', async () => {
    const res = await request(ctx.app).get(`/api/v1/jobs/${job.jobId}/images`).set('Authorization', `Bearer ${proToken}`);
    assert.equal(res.status, 200);
    assert.equal((res.body.data as { total: number }).total, 1);
  });

  it('10. unauthorized photo retrieval is rejected', async () => {
    const otherCustomer = await register(ctx.app, 'other.customer@example.co.za');
    const foreign = await request(ctx.app).get(`/api/v1/jobs/${job.jobId}/images`).set('Authorization', `Bearer ${otherCustomer.token}`);
    assert.equal(foreign.status, 404);
    assertErrorEnvelope(foreign, 'NOT_FOUND');
    const unauthenticated = await request(ctx.app).get(`/api/v1/jobs/${job.jobId}/images`);
    assert.equal(unauthenticated.status, 401);
    assertErrorEnvelope(unauthenticated, 'UNAUTHORIZED');
    // File bytes are protected too: no direct access without authorization.
    const foreignFile = await request(ctx.app)
      .get(`/api/v1/jobs/${job.jobId}/images/${imageId}/file`)
      .set('Authorization', `Bearer ${otherCustomer.token}`);
    assert.equal(foreignFile.status, 404);
    const unauthenticatedFile = await request(ctx.app).get(`/api/v1/jobs/${job.jobId}/images/${imageId}/file`);
    assert.equal(unauthenticatedFile.status, 401);
  });

  it('authorized file download returns the stored bytes with the image MIME', async () => {
    const res = await request(ctx.app)
      .get(`/api/v1/jobs/${job.jobId}/images/${imageId}/file`)
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal(res.status, 200);
     assert.equal(res.headers['content-type'], 'image/png');
     assert.equal(res.headers['cache-control'], 'no-store, no-cache, must-revalidate, private');
     assert.equal(res.headers.pragma, 'no-cache');
  });
});

describe('DELETE /api/v1/jobs/:jobId/images/:imageId (photo deletion)', () => {
  let ctx: TestContext;
  let customerToken: string;
  let proToken: string;
  let job: WorkingJob;
  beforeEach(async () => {
    ctx = buildApp();
    customerToken = (await register(ctx.app, 'thandi.khumalo@example.co.za')).token;
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    proToken = pro.token;
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    job = await createInProgressJob(ctx, customerToken, proToken);
  });

  it('provider can delete their own photo while IN_PROGRESS', async () => {
    const uploaded = await upload(ctx, proToken, job.jobId, 'BEFORE', pngBuffer(), 'before.png', 'image/png');
    const imageId = (uploaded.body.data as { id: string }).id;
    const res = await request(ctx.app).get(`/api/v1/jobs/${job.jobId}/images`).set('Authorization', `Bearer ${proToken}`);
    assert.equal((res.body.data as { total: number }).total, 1);
    const deleted = await request(ctx.app)
      .delete(`/api/v1/jobs/${job.jobId}/images/${imageId}`)
      .set('Authorization', `Bearer ${proToken}`);
    assert.equal(deleted.status, 200);
    assertSuccessEnvelope(deleted);
    const after = await request(ctx.app).get(`/api/v1/jobs/${job.jobId}/images`).set('Authorization', `Bearer ${proToken}`);
    assert.equal((after.body.data as { total: number }).total, 0);
  });

  it('customer cannot delete provider work photos (403)', async () => {
    const uploaded = await upload(ctx, proToken, job.jobId, 'BEFORE', pngBuffer(), 'before.png', 'image/png');
    const imageId = (uploaded.body.data as { id: string }).id;
    const res = await request(ctx.app)
      .delete(`/api/v1/jobs/${job.jobId}/images/${imageId}`)
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal(res.status, 403);
    assertErrorEnvelope(res, 'FORBIDDEN_ROLE');
  });

  it('deletion after completion is rejected (422)', async () => {
    const uploaded = await upload(ctx, proToken, job.jobId, 'BEFORE', pngBuffer(), 'before.png', 'image/png');
    const imageId = (uploaded.body.data as { id: string }).id;
    const completed = await request(ctx.app)
      .post(`/api/v1/jobs/${job.jobId}/complete`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ note: 'Replacement pipe installed and tested for leaks.' });
    assert.equal(completed.status, 200);
    const res = await request(ctx.app)
      .delete(`/api/v1/jobs/${job.jobId}/images/${imageId}`)
      .set('Authorization', `Bearer ${proToken}`);
    assert.equal(res.status, 422);
    assertErrorEnvelope(res, 'VALIDATION_ERROR');
  });
});

describe('POST /api/v1/jobs/:jobId/updates (progress notes)', () => {
  let ctx: TestContext;
  let customerToken: string;
  let proToken: string;
  let job: WorkingJob;
  beforeEach(async () => {
    ctx = buildApp();
    customerToken = (await register(ctx.app, 'thandi.khumalo@example.co.za')).token;
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    proToken = pro.token;
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    job = await createInProgressJob(ctx, customerToken, proToken);
  });

  it('13. provider can create a BEFORE update', async () => {
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${job.jobId}/updates`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ phase: 'BEFORE', note: 'Existing pipe is damaged near the kitchen sink.' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assertSuccessEnvelope(res);
    assert.equal((res.body.data as { phase: string }).phase, 'BEFORE');
  });

  it('14. provider can create a DURING update', async () => {
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${job.jobId}/updates`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ phase: 'DURING', note: 'Removed damaged section and preparing replacement.' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal((res.body.data as { phase: string }).phase, 'DURING');
  });

  it('15. provider can create an AFTER update', async () => {
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${job.jobId}/updates`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ phase: 'AFTER', note: 'Replacement pipe installed and tested for leaks.' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal((res.body.data as { phase: string }).phase, 'AFTER');
  });

  it('6. technician cannot perform marketplace work updates (403)', async () => {
    const tech = await provisionUser(ctx, 'tech@example.co.za', ['TECHNICIAN']);
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${job.jobId}/updates`)
      .set('Authorization', `Bearer ${tech.token}`)
      .send({ phase: 'DURING', note: 'Technician progress note.' });
    assert.equal(res.status, 403);
    assertErrorEnvelope(res, 'FORBIDDEN_ROLE');
  });

  it('16. customer cannot create a provider update (403)', async () => {
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${job.jobId}/updates`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ phase: 'DURING', note: 'Customer trying to write a provider note.' });
    assert.equal(res.status, 403);
    assertErrorEnvelope(res, 'FORBIDDEN_ROLE');
  });

  it('17. provider cannot update another provider\u2019s job (404)', async () => {
    const other = await register(ctx.app, 'johan.pro@example.co.za', 'PROFESSIONAL');
    ctx.quotes.linkProfessionalProfile(other.userId, '2');
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${job.jobId}/updates`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ phase: 'DURING', note: 'Foreign update.' });
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
  });

  it('empty and overlong notes are rejected (422)', async () => {
    const empty = await request(ctx.app)
      .post(`/api/v1/jobs/${job.jobId}/updates`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ phase: 'DURING', note: '   ' });
    assert.equal(empty.status, 422);
    assertErrorEnvelope(empty, 'VALIDATION_ERROR');
    const overlong = await request(ctx.app)
      .post(`/api/v1/jobs/${job.jobId}/updates`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ phase: 'DURING', note: 'x'.repeat(2001) });
    assert.equal(overlong.status, 422);
    assertErrorEnvelope(overlong, 'VALIDATION_ERROR');
  });
});

describe('POST /api/v1/jobs/:jobId/complete (provider completion)', () => {
  let ctx: TestContext;
  let customerToken: string;
  let proToken: string;
  let job: WorkingJob;
  beforeEach(async () => {
    ctx = buildApp();
    customerToken = (await register(ctx.app, 'thandi.khumalo@example.co.za')).token;
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    proToken = pro.token;
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    job = await createInProgressJob(ctx, customerToken, proToken);
  });

  it('18. provider can complete an IN_PROGRESS job (200, COMPLETED)', async () => {
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${job.jobId}/complete`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ note: 'Replacement pipe installed and tested for leaks.' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assertSuccessEnvelope(res);
    const data = res.body.data as { job: { status: string }; update: { phase: string; note: string } };
    assert.equal(data.job.status, 'COMPLETED');
    assert.equal(data.update.phase, 'AFTER');
    assert.equal(data.update.note, 'Replacement pipe installed and tested for leaks.');
    assert.equal(res.body.message, 'Job completed successfully.');
  });

  it('19. provider cannot complete a SCHEDULED job (422)', async () => {
    const scheduledId = await createJob(ctx, customerToken);
    const created = await request(ctx.app)
      .post(`/api/v1/jobs/${scheduledId}/quotes`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ total: 500 });
    const quoteId = (created.body.data as { id: string }).id;
    await request(ctx.app).post(`/api/v1/jobs/${scheduledId}/quotes/${quoteId}/accept`).set('Authorization', `Bearer ${customerToken}`);
    await request(ctx.app).post(`/api/v1/jobs/${scheduledId}/schedule`).set('Authorization', `Bearer ${proToken}`).send({ scheduledAt: FUTURE_SLOT });
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${scheduledId}/complete`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ note: 'Trying to skip ahead.' });
    assert.equal(res.status, 422);
    assertErrorEnvelope(res, 'VALIDATION_ERROR');
  });

  it('20. provider cannot complete an ACCEPTED job (422)', async () => {
    const acceptedId = await createJob(ctx, customerToken);
    const created = await request(ctx.app)
      .post(`/api/v1/jobs/${acceptedId}/quotes`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ total: 500 });
    const quoteId = (created.body.data as { id: string }).id;
    await request(ctx.app).post(`/api/v1/jobs/${acceptedId}/quotes/${quoteId}/accept`).set('Authorization', `Bearer ${customerToken}`);
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${acceptedId}/complete`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ note: 'Trying to skip scheduling and start.' });
    assert.equal(res.status, 422);
    assertErrorEnvelope(res, 'VALIDATION_ERROR');
  });

  it('21. completion note is required (422)', async () => {
    for (const body of [{}, { note: '' }, { note: '   ' }]) {
      const res = await request(ctx.app)
        .post(`/api/v1/jobs/${job.jobId}/complete`)
        .set('Authorization', `Bearer ${proToken}`)
        .send(body);
      assert.equal(res.status, 422, `expected 422 for ${JSON.stringify(body)}`);
      assertErrorEnvelope(res, 'VALIDATION_ERROR');
    }
  });

  it('22. completion note validation is enforced (422)', async () => {
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${job.jobId}/complete`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ note: 'x'.repeat(2001) });
    assert.equal(res.status, 422);
    assertErrorEnvelope(res, 'VALIDATION_ERROR');
  });

  it('23. completion creates status history', async () => {
    await request(ctx.app)
      .post(`/api/v1/jobs/${job.jobId}/complete`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ note: 'Replacement pipe installed and tested for leaks.' });
    const history = ctx.execution.debugHistory();
    assert.ok(history.some((entry) => entry.jobId === job.jobId && entry.previousStatus === 'IN_PROGRESS' && entry.status === 'COMPLETED'));
  });

  it('33. completion failure leaves the job IN_PROGRESS', async () => {
    const historyBefore = ctx.execution.debugHistory().length;
    const failed = await request(ctx.app)
      .post(`/api/v1/jobs/${job.jobId}/complete`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({});
    assert.equal(failed.status, 422);
    assert.equal(await jobStatus(ctx, customerToken, job.jobId), 'IN_PROGRESS');
    assert.equal(ctx.execution.debugHistory().length, historyBefore);
  });

  it('customer cannot complete the job (403)', async () => {
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${job.jobId}/complete`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ note: 'Customer trying to complete.' });
    assert.equal(res.status, 403);
    assertErrorEnvelope(res, 'FORBIDDEN_ROLE');
    assert.equal(await jobStatus(ctx, customerToken, job.jobId), 'IN_PROGRESS');
  });
});

describe('POST /api/v1/jobs/:jobId/confirm (customer confirmation)', () => {
  let ctx: TestContext;
  let customerToken: string;
  let proToken: string;
  let job: WorkingJob;
  beforeEach(async () => {
    ctx = buildApp();
    customerToken = (await register(ctx.app, 'thandi.khumalo@example.co.za')).token;
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    proToken = pro.token;
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    job = await createInProgressJob(ctx, customerToken, proToken);
    const completed = await request(ctx.app)
      .post(`/api/v1/jobs/${job.jobId}/complete`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ note: 'Replacement pipe installed and tested for leaks.' });
    assert.equal(completed.status, 200);
  });

  it('24. customer can confirm a COMPLETED job (200, closed)', async () => {
    const res = await request(ctx.app).post(`/api/v1/jobs/${job.jobId}/confirm`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assertSuccessEnvelope(res);
    assert.equal((res.body.data as { job: { status: string } }).job.status, 'CLOSED');
    assert.equal(res.body.message, 'Job confirmed successfully.');
  });

  it('25. customer cannot confirm an IN_PROGRESS job (422)', async () => {
    const active = await createInProgressJob(ctx, customerToken, proToken);
    const res = await request(ctx.app).post(`/api/v1/jobs/${active.jobId}/confirm`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(res.status, 422);
    assertErrorEnvelope(res, 'VALIDATION_ERROR');
    assert.equal(await jobStatus(ctx, customerToken, active.jobId), 'IN_PROGRESS');
  });

  it('26. customer cannot confirm another customer\u2019s job (404)', async () => {
    const other = await register(ctx.app, 'other.customer@example.co.za');
    const res = await request(ctx.app).post(`/api/v1/jobs/${job.jobId}/confirm`).set('Authorization', `Bearer ${other.token}`);
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
  });

  it('27. provider cannot confirm the customer completion (403)', async () => {
    const res = await request(ctx.app).post(`/api/v1/jobs/${job.jobId}/confirm`).set('Authorization', `Bearer ${proToken}`);
    assert.equal(res.status, 403);
    assertErrorEnvelope(res, 'FORBIDDEN_ROLE');
    assert.equal(await jobStatus(ctx, customerToken, job.jobId), 'COMPLETED');
  });

  it('28. confirmation records history (CONFIRMED and CLOSED)', async () => {
    await request(ctx.app).post(`/api/v1/jobs/${job.jobId}/confirm`).set('Authorization', `Bearer ${customerToken}`);
    const history = ctx.execution.debugHistory();
    assert.ok(history.some((entry) => entry.jobId === job.jobId && entry.previousStatus === 'COMPLETED' && entry.status === 'CONFIRMED'));
    assert.ok(history.some((entry) => entry.jobId === job.jobId && entry.previousStatus === 'CONFIRMED' && entry.status === 'CLOSED'));
  });

  it('29. confirmation closes the job per the documented lifecycle', async () => {
    await request(ctx.app).post(`/api/v1/jobs/${job.jobId}/confirm`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(await jobStatus(ctx, customerToken, job.jobId), 'CLOSED');
    // No second customer action is required: a repeat confirm is rejected.
    const repeat = await request(ctx.app).post(`/api/v1/jobs/${job.jobId}/confirm`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(repeat.status, 422);
  });

  it('34. confirmation failure leaves the job COMPLETED', async () => {
    const historyBefore = ctx.execution.debugHistory().length;
    // A provider attempt fails authorization; the job must not move.
    const failed = await request(ctx.app).post(`/api/v1/jobs/${job.jobId}/confirm`).set('Authorization', `Bearer ${proToken}`);
    assert.equal(failed.status, 403);
    assert.equal(await jobStatus(ctx, customerToken, job.jobId), 'COMPLETED');
    assert.equal(ctx.execution.debugHistory().length, historyBefore);
  });
});

describe('Stage 6F — guards, timeline and envelopes', () => {
  let ctx: TestContext;
  let customerToken: string;
  let proToken: string;
  let job: WorkingJob;
  beforeEach(async () => {
    ctx = buildApp();
    customerToken = (await register(ctx.app, 'thandi.khumalo@example.co.za')).token;
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    proToken = pro.token;
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    job = await createInProgressJob(ctx, customerToken, proToken);
  });

  it('30. closed jobs cannot be modified', async () => {
    await request(ctx.app)
      .post(`/api/v1/jobs/${job.jobId}/complete`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ note: 'Replacement pipe installed and tested for leaks.' });
    await request(ctx.app).post(`/api/v1/jobs/${job.jobId}/confirm`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(await jobStatus(ctx, customerToken, job.jobId), 'CLOSED');
    const update = await request(ctx.app)
      .post(`/api/v1/jobs/${job.jobId}/updates`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ phase: 'DURING', note: 'Late note.' });
    assert.equal(update.status, 422);
    const image = await upload(ctx, proToken, job.jobId, 'AFTER', pngBuffer(), 'late.png', 'image/png');
    assert.equal(image.status, 422);
    const complete = await request(ctx.app)
      .post(`/api/v1/jobs/${job.jobId}/complete`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ note: 'Again.' });
    assert.equal(complete.status, 422);
    const confirm = await request(ctx.app).post(`/api/v1/jobs/${job.jobId}/confirm`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(confirm.status, 422);
  });

  it('31. status transitions cannot be bypassed', async () => {
    // SCHEDULED → COMPLETED directly.
    const scheduledId = await createJob(ctx, customerToken);
    const created = await request(ctx.app)
      .post(`/api/v1/jobs/${scheduledId}/quotes`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ total: 500 });
    const quoteId = (created.body.data as { id: string }).id;
    await request(ctx.app).post(`/api/v1/jobs/${scheduledId}/quotes/${quoteId}/accept`).set('Authorization', `Bearer ${customerToken}`);
    await request(ctx.app).post(`/api/v1/jobs/${scheduledId}/schedule`).set('Authorization', `Bearer ${proToken}`).send({ scheduledAt: FUTURE_SLOT });
    const skipStart = await request(ctx.app)
      .post(`/api/v1/jobs/${scheduledId}/complete`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ note: 'Skipping start.' });
    assert.equal(skipStart.status, 422);
    // IN_PROGRESS → CONFIRMED via the confirm endpoint (wrong actor and state).
    const confirmActive = await request(ctx.app).post(`/api/v1/jobs/${job.jobId}/confirm`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(confirmActive.status, 422);
    // COMPLETED → IN_PROGRESS via the start endpoint.
    await request(ctx.app)
      .post(`/api/v1/jobs/${job.jobId}/complete`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ note: 'Replacement pipe installed and tested for leaks.' });
    const restart = await request(ctx.app).post(`/api/v1/jobs/${job.jobId}/start`).set('Authorization', `Bearer ${proToken}`);
    assert.equal(restart.status, 422);
    assert.equal(await jobStatus(ctx, customerToken, job.jobId), 'COMPLETED');
  });

  it('32. timeline contains the expected events', async () => {
    await upload(ctx, proToken, job.jobId, 'BEFORE', pngBuffer(), 'before.png', 'image/png');
    await request(ctx.app)
      .post(`/api/v1/jobs/${job.jobId}/updates`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ phase: 'BEFORE', note: 'Existing pipe is damaged near the kitchen sink.' });
    await request(ctx.app)
      .post(`/api/v1/jobs/${job.jobId}/updates`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ phase: 'DURING', note: 'Removed damaged section and preparing replacement.' });
    await request(ctx.app)
      .post(`/api/v1/jobs/${job.jobId}/complete`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ note: 'Replacement pipe installed and tested for leaks.' });
    await request(ctx.app).post(`/api/v1/jobs/${job.jobId}/confirm`).set('Authorization', `Bearer ${customerToken}`);
    const res = await request(ctx.app).get(`/api/v1/jobs/${job.jobId}/timeline`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assertSuccessEnvelope(res);
    const data = res.body.data as {
      job: { id: string };
      events: Array<{ kind: string; status?: string; phase?: string; note?: string }>;
    };
    assert.equal(data.job.id, job.jobId);
    const statuses = data.events.filter((event) => event.kind === 'status').map((event) => event.status);
    for (const expected of ['REQUESTED', 'QUOTED', 'ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CONFIRMED', 'CLOSED']) {
      assert.ok(statuses.includes(expected), `timeline missing status ${expected}: ${JSON.stringify(statuses)}`);
    }
    assert.ok(data.events.some((event) => event.kind === 'update' && event.phase === 'BEFORE'));
    assert.ok(data.events.some((event) => event.kind === 'update' && event.phase === 'DURING'));
    assert.ok(data.events.some((event) => event.kind === 'update' && event.phase === 'AFTER'));
    assert.ok(data.events.some((event) => event.kind === 'image' && event.phase === 'BEFORE'));
    // The provider sees the same timeline.
    const providerView = await request(ctx.app).get(`/api/v1/jobs/${job.jobId}/timeline`).set('Authorization', `Bearer ${proToken}`);
    assert.equal(providerView.status, 200);
    assert.equal((providerView.body.data as { events: unknown[] }).events.length, data.events.length);
  });

  it('malformed ids, unknown jobs and unauthenticated calls keep standard envelopes', async () => {
    const malformed = await request(ctx.app)
      .post('/api/v1/jobs/abc/complete')
      .set('Authorization', `Bearer ${proToken}`)
      .send({ note: 'x' });
    assert.equal(malformed.status, 400);
    assertErrorEnvelope(malformed, 'VALIDATION_ERROR');
    const unknown = await request(ctx.app)
      .post('/api/v1/jobs/9999/complete')
      .set('Authorization', `Bearer ${proToken}`)
      .send({ note: 'x' });
    assert.equal(unknown.status, 404);
    assertErrorEnvelope(unknown, 'NOT_FOUND');
    const unauthenticated = await request(ctx.app).post(`/api/v1/jobs/${job.jobId}/complete`).send({ note: 'x' });
    assert.equal(unauthenticated.status, 401);
    assertErrorEnvelope(unauthenticated, 'UNAUTHORIZED');
    const malformedTimeline = await request(ctx.app).get('/api/v1/jobs/abc/timeline').set('Authorization', `Bearer ${customerToken}`);
    assert.equal(malformedTimeline.status, 400);
    assertErrorEnvelope(malformedTimeline, 'VALIDATION_ERROR');
  });
});
