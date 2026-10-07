/**
 * Fixlynk — customer request photo tests.
 *
 * Run: npm test (no MySQL required — the in-memory jobs store plus a local
 * storage tmp dir per test app).
 *
 * Covers: authentication, CUSTOMER-only access, session-derived ownership,
 * cross-customer isolation (404 not 403), the REQUESTED/QUOTED state gate,
 * the per-job photo cap, MIME/size/magic-byte validation, storage rollback on
 * a rejected insert, and that the row is context 'REQUEST' rather than work
 * documentation.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { MemoryUserRepository } from '../src/modules/auth/memory-user.repository';
import { MemoryRefreshStore } from '../src/modules/auth/refresh.store';
import { MemoryMarketplaceStore } from '../src/modules/marketplace/memory-marketplace.store';
import { MemoryJobsStore } from '../src/modules/jobs/memory-jobs.store';
import { LocalFileStorage } from '../src/services/file-storage';
import { MAX_REQUEST_IMAGES_PER_JOB } from '../src/modules/jobs/jobs.types';
import type { JobStatus } from '../src/modules/jobs/jobs.types';

const PASSWORD = 'Str0ngPassw0rd!';
const DESCRIPTION = 'Kitchen mixer tap leaking at the base and the cupboard floor is damp.';

/** PNG magic bytes, which the validator sniffs rather than trusting. */
function pngBuffer(size = 32): Buffer {
  const buf = Buffer.alloc(size);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  return buf;
}

interface Ctx {
  app: Express;
  jobs: MemoryJobsStore;
  storageDir: string;
}

const contexts: Ctx[] = [];

function buildApp(): Ctx {
  const storageDir = mkdtempSync(join(tmpdir(), 'fixlynk-reqimg-'));
  const jobs = new MemoryJobsStore();
  const ctx: Ctx = {
    jobs,
    storageDir,
    app: createApp({
      users: new MemoryUserRepository(),
      refreshStore: new MemoryRefreshStore(),
      marketplace: new MemoryMarketplaceStore(),
      jobs,
      storage: new LocalFileStorage(storageDir),
    }),
  };
  contexts.push(ctx);
  return ctx;
}

/**
 * Drive a job's status directly.
 *
 * The memory store has no quote-acceptance flow of its own, so the state gate
 * is exercised by moving the row rather than by replaying a whole quote
 * lifecycle. Every value used here is a real JobStatus.
 */
async function setJobStatus(ctx: Ctx, jobId: string, status: JobStatus): Promise<void> {
  const job = await ctx.jobs.getJobById(jobId);
  assert.ok(job, `job ${jobId} must exist`);
  await ctx.jobs.debugSetJobStatus(jobId, status);
}

before(() => {
  return () => {
    for (const ctx of contexts) rmSync(ctx.storageDir, { recursive: true, force: true });
  };
});

async function register(
  app: Express,
  email: string,
  role?: string,
): Promise<{ token: string }> {
  const body: Record<string, unknown> = { email, password: PASSWORD };
  if (role === 'PROFESSIONAL') body['displayName'] = 'Sipho Ndlovu';
  if (role) body['role'] = role;
  const res = await request(app).post('/api/v1/auth/register').send(body);
  assert.equal(res.status, 201, `register failed: ${JSON.stringify(res.body)}`);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  assert.equal(login.status, 200);
  return { token: login.body.data.accessToken as string };
}

function auth(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}

function validJob(): Record<string, unknown> {
  return {
    providerId: 'professional-1',
    serviceId: '1',
    description: DESCRIPTION,
    location: 'Fourways, Johannesburg',
  };
}

async function createJob(app: Express, token: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/v1/jobs')
    .set(...auth(token))
    .send({ ...validJob(), ...overrides });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data as { id: string; reference: string };
}

function upload(
  app: Express,
  token: string,
  jobId: string,
  options: { buffer?: Buffer; filename?: string; contentType?: string; field?: string } = {},
) {
  const req = request(app)
    .post(`/api/v1/jobs/${jobId}/request-images`)
    .set(...auth(token));
  const field = options.field ?? 'image';
  if (options.field === undefined && options.buffer === null) {
    return req.send({});
  }
  return req.attach(field, options.buffer ?? pngBuffer(), {
    filename: options.filename ?? 'problem.png',
    contentType: options.contentType ?? 'image/png',
  });
}

describe('customer request photos - creating a request', () => {
  it('attaches a photo to a request the caller owns', async () => {
    const ctx = buildApp();
    const { token } = await register(ctx.app, 'customer@example.com');
    const job = await createJob(ctx.app, token);

    const res = await upload(ctx.app, token, job.id);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.success, true);
    const image = res.body.data;
    assert.equal(image.jobId, job.id);
    assert.equal(image.mimeType, 'image/png');
    // The whole point of migration 017: this is customer evidence, not the
    // professional's Before/During/After work record.
    assert.equal(image.context, 'REQUEST');
  });

  it('never exposes binary content, a storage key or a path', async () => {
    const ctx = buildApp();
    const { token } = await register(ctx.app, 'customer@example.com');
    const job = await createJob(ctx.app, token);
    const res = await upload(ctx.app, token, job.id);
    const image = res.body.data;
    assert.ok(!('storageKey' in image));
    assert.ok(!('fileReference' in image));
    assert.ok(!('file_reference' in image));
    assert.equal(image.originalFilename, 'problem.png');
  });

  it('requires authentication (401)', async () => {
    const ctx = buildApp();
    const { token } = await register(ctx.app, 'customer@example.com');
    const job = await createJob(ctx.app, token);
    const res = await request(ctx.app).post(`/api/v1/jobs/${job.id}/request-images`);
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  it('rejects a malformed job id (400)', async () => {
    const ctx = buildApp();
    const { token } = await register(ctx.app, 'customer@example.com');
    const res = await upload(ctx.app, token, 'not-a-job');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it("refuses another customer's job as 404, so job ids cannot be probed", async () => {
    const ctx = buildApp();
    const naledi = await register(ctx.app, 'naledi@example.com');
    const sipho = await register(ctx.app, 'sipho@example.com');
    const job = await createJob(ctx.app, naledi.token);

    const res = await upload(ctx.app, sipho.token, job.id);
    // 404, never 403: a 403 would confirm the job exists.
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  it('refuses a provider account (403)', async () => {
    const ctx = buildApp();
    const { token } = await register(ctx.app, 'pro@example.com', 'PROFESSIONAL');
    const customer = await register(ctx.app, 'customer@example.com');
    const job = await createJob(ctx.app, customer.token);

    const res = await upload(ctx.app, token, job.id);
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN_ROLE');
  });
});

describe('customer request photos - validation', () => {
  it('rejects a request with no file (422)', async () => {
    const ctx = buildApp();
    const { token } = await register(ctx.app, 'customer@example.com');
    const job = await createJob(ctx.app, token);
    const res = await request(ctx.app)
      .post(`/api/v1/jobs/${job.id}/request-images`)
      .set(...auth(token))
      .send({});
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('rejects a disallowed MIME type (422)', async () => {
    const ctx = buildApp();
    const { token } = await register(ctx.app, 'customer@example.com');
    const job = await createJob(ctx.app, token);
    const res = await upload(ctx.app, token, job.id, {
      buffer: Buffer.from('%PDF-1.4 not an image'),
      filename: 'notes.pdf',
      contentType: 'application/pdf',
    });
    assert.equal(res.status, 422);
    assert.match(res.body.error.message, /JPEG, PNG or WebP/u);
  });

  it('rejects a file whose bytes are not the image it claims to be (422)', async () => {
    const ctx = buildApp();
    const { token } = await register(ctx.app, 'customer@example.com');
    const job = await createJob(ctx.app, token);
    // Claims PNG, actually plain text: the magic-byte check must catch this.
    const res = await upload(ctx.app, token, job.id, {
      buffer: Buffer.from('<?php echo "not an image"; ?>'),
      filename: 'sneaky.png',
      contentType: 'image/png',
    });
    assert.equal(res.status, 422);
    assert.match(res.body.error.message, /JPEG, PNG or WebP/u);
  });

  it('rejects an oversized file with the standard envelope (422)', async () => {
    const ctx = buildApp();
    const { token } = await register(ctx.app, 'customer@example.com');
    const job = await createJob(ctx.app, token);
    const res = await upload(ctx.app, token, job.id, {
      buffer: pngBuffer(6 * 1024 * 1024),
      filename: 'huge.png',
      contentType: 'image/png',
    });
    assert.equal(res.status, 422);
    assert.equal(res.body.success, false);
    assert.match(res.body.error.message, /5MB or smaller/u);
  });

  it('rejects an unexpected file field (422)', async () => {
    const ctx = buildApp();
    const { token } = await register(ctx.app, 'customer@example.com');
    const job = await createJob(ctx.app, token);
    const res = await upload(ctx.app, token, job.id, { field: 'document' });
    assert.equal(res.status, 422);
    assert.equal(res.body.success, false);
  });

  it('sanitises a traversal attempt in the filename', async () => {
    const ctx = buildApp();
    const { token } = await register(ctx.app, 'customer@example.com');
    const job = await createJob(ctx.app, token);
    const res = await upload(ctx.app, token, job.id, {
      filename: '../../etc/passwd.png',
    });
    assert.equal(res.status, 201);
    // Stored as metadata only, stripped of directories.
    assert.equal(res.body.data.originalFilename, 'passwd.png');
  });
});

describe('customer request photos - lifecycle limits', () => {
  it('accepts photos while the request is REQUESTED', async () => {
    const ctx = buildApp();
    const { token } = await register(ctx.app, 'customer@example.com');
    const job = await createJob(ctx.app, token);
    const res = await upload(ctx.app, token, job.id);
    assert.equal(res.status, 201);
    assert.equal(res.body.data.context, 'REQUEST');
  });

  it('still accepts photos while the request is QUOTED', async () => {
    const ctx = buildApp();
    const { token } = await register(ctx.app, 'customer@example.com');
    const job = await createJob(ctx.app, token);
    // The customer may add a missing photo before deciding on the quote.
    await setJobStatus(ctx, job.id, 'QUOTED');
    const res = await upload(ctx.app, token, job.id);
    assert.equal(res.status, 201, JSON.stringify(res.body));
  });

  it('refuses photos once the quote is accepted (409)', async () => {
    const ctx = buildApp();
    const { token } = await register(ctx.app, 'customer@example.com');
    const job = await createJob(ctx.app, token);
    await setJobStatus(ctx, job.id, 'ACCEPTED');

    const res = await upload(ctx.app, token, job.id);
    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.match(res.body.error.message, /no longer accepting photos/u);
  });

  it('refuses photos once work has started', async () => {
    const ctx = buildApp();
    const { token } = await register(ctx.app, 'customer@example.com');
    const job = await createJob(ctx.app, token);
    await setJobStatus(ctx, job.id, 'IN_PROGRESS');
    // From here the professional owns the Before/During/After record, so a
    // customer must not be able to write into it.
    assert.equal((await upload(ctx.app, token, job.id)).status, 409);
  });

  it('enforces the per-job photo cap', async () => {
    const ctx = buildApp();
    const { token } = await register(ctx.app, 'customer@example.com');
    const job = await createJob(ctx.app, token);

    for (let i = 0; i < MAX_REQUEST_IMAGES_PER_JOB; i += 1) {
      const res = await upload(ctx.app, token, job.id, { filename: `photo-${i}.png` });
      assert.equal(res.status, 201, `photo ${i} should be accepted`);
    }
    const overflow = await upload(ctx.app, token, job.id, { filename: 'one-too-many.png' });
    assert.equal(overflow.status, 422);
    assert.match(overflow.body.error.message, /up to \d+ photos/u);
  });

  it('leaves no stored file behind when the upload is refused', async () => {
    const ctx = buildApp();
    const { token } = await register(ctx.app, 'customer@example.com');
    const job = await createJob(ctx.app, token);
    await setJobStatus(ctx, job.id, 'ACCEPTED');

    const storage = new LocalFileStorage(ctx.storageDir);
    assert.equal((await upload(ctx.app, token, job.id)).status, 409);

    // The service writes bytes to storage before inserting the row, then rolls
    // the file back when the insert is refused. A directory that does not exist
    // means nothing was written; an existing but empty one means it was cleaned.
    const dir = join(ctx.storageDir, 'job-images', job.id);
    const { existsSync, readdirSync } = await import('node:fs');
    if (existsSync(dir)) assert.deepEqual(readdirSync(dir), []);
  });
});
