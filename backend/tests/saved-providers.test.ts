/**
 * Fixlynk — customer saved professional tests.
 *
 * Run: npm test (no MySQL required — uses the in-memory saved-providers store
 * with the same per-customer uniqueness and ownership rules as the MySQL
 * implementation).
 *
 * Covers: authentication, CUSTOMER role gating, session-derived ownership,
 * save/list/state/remove, duplicate conflicts, unknown provider ids, unknown
 * fields, cross-customer isolation, and that a saved provider renders the
 * same public card the marketplace renders (never private data).
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { MemoryUserRepository } from '../src/modules/auth/memory-user.repository';
import { MemoryRefreshStore } from '../src/modules/auth/refresh.store';
import { MemoryMarketplaceStore } from '../src/modules/marketplace/memory-marketplace.store';
import { MemorySavedProvidersStore } from '../src/modules/saved-providers/memory-saved-providers.store';
import { signAccessToken } from '../src/utils/tokens';

const PASSWORD = 'Str0ngPassw0rd!';

interface TestContext {
  app: Express;
  savedProviders: MemorySavedProvidersStore;
}

function buildApp(): TestContext {
  const savedProviders = new MemorySavedProvidersStore();
  const app = createApp({
    users: new MemoryUserRepository(),
    refreshStore: new MemoryRefreshStore(),
    marketplace: new MemoryMarketplaceStore(),
    savedProviders,
  });
  return { app, savedProviders };
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

function auth(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}

describe('customer saved professionals - access control', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = buildApp();
  });

  it('requires authentication', async () => {
    const res = await request(ctx.app).get('/api/v1/customer/saved-providers');
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  it('refuses a professional account', async () => {
    const { token } = await register(ctx.app, 'pro@example.com', 'PROFESSIONAL');
    const res = await request(ctx.app).get('/api/v1/customer/saved-providers').set(...auth(token));
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN_ROLE');
  });

  it('refuses a business owner account', async () => {
    const { token } = await register(ctx.app, 'owner@example.com', 'BUSINESS_OWNER');
    const res = await request(ctx.app).get('/api/v1/customer/saved-providers').set(...auth(token));
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN_ROLE');
  });

  it('refuses a forged token', async () => {
    const res = await request(ctx.app)
      .get('/api/v1/customer/saved-providers')
      .set('Authorization', `Bearer ${signAccessToken({ sub: 'ghost', roles: ['CUSTOMER'] })}`);
    assert.equal(res.status, 401);
  });
});

describe('customer saved professionals - saving', () => {
  let ctx: TestContext;
  let token: string;

  beforeEach(async () => {
    ctx = buildApp();
    ({ token } = await register(ctx.app, 'customer@example.com'));
  });

  it('starts empty', async () => {
    const res = await request(ctx.app).get('/api/v1/customer/saved-providers').set(...auth(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.data, { items: [], total: 0 });
  });

  it('saves a professional and returns the public card', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/customer/saved-providers')
      .set(...auth(token))
      .send({ providerId: 'professional-1' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.id, 'professional-1');
    assert.equal(res.body.data.providerType, 'professional');
    assert.ok(typeof res.body.data.savedAt === 'string');
    // The saved list is a card, not a profile: no private or profile-only data.
    assert.equal(res.body.data.bio, undefined);
    assert.equal(res.body.data.offerings, undefined);
  });

  it('saves a business', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/customer/saved-providers')
      .set(...auth(token))
      .send({ providerId: 'business-1' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.providerType, 'business');
  });

  it('lists saved providers newest first', async () => {
    for (const providerId of ['professional-1', 'business-1']) {
      const res = await request(ctx.app)
        .post('/api/v1/customer/saved-providers')
        .set(...auth(token))
        .send({ providerId });
      assert.equal(res.status, 201);
    }
    const list = await request(ctx.app).get('/api/v1/customer/saved-providers').set(...auth(token));
    assert.equal(list.body.data.total, 2);
    assert.deepEqual(
      list.body.data.items.map((item: { id: string }) => item.id),
      ['business-1', 'professional-1'],
    );
  });

  it('rejects a duplicate save with 409', async () => {
    const first = await request(ctx.app)
      .post('/api/v1/customer/saved-providers')
      .set(...auth(token))
      .send({ providerId: 'professional-1' });
    assert.equal(first.status, 201);
    const second = await request(ctx.app)
      .post('/api/v1/customer/saved-providers')
      .set(...auth(token))
      .send({ providerId: 'professional-1' });
    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, 'CONFLICT');
  });

  it('rejects a malformed provider id with 422', async () => {
    for (const providerId of ['1', 'artisan-1', "professional-1'; DROP TABLE users; --", 'professional-0']) {
      const res = await request(ctx.app)
        .post('/api/v1/customer/saved-providers')
        .set(...auth(token))
        .send({ providerId });
      assert.equal(res.status, 422, `expected 422 for ${providerId}`);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
  });

  it('rejects a missing provider id', async () => {
    const res = await request(ctx.app).post('/api/v1/customer/saved-providers').set(...auth(token)).send({});
    assert.equal(res.status, 422);
  });

  it('rejects unknown fields so ownership cannot be smuggled in', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/customer/saved-providers')
      .set(...auth(token))
      .send({ providerId: 'professional-1', userId: 'someone-else' });
    assert.equal(res.status, 422);
    assert.match(res.body.error.message, /Unsupported field/u);
  });

  it('refuses a provider that does not exist with 404', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/customer/saved-providers')
      .set(...auth(token))
      .send({ providerId: 'professional-9999' });
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });
});

describe('customer saved professionals - saved state and removal', () => {
  let ctx: TestContext;
  let token: string;

  beforeEach(async () => {
    ctx = buildApp();
    ({ token } = await register(ctx.app, 'customer@example.com'));
  });

  it('reports saved state per provider', async () => {
    const before = await request(ctx.app)
      .get('/api/v1/customer/saved-providers/professional-1')
      .set(...auth(token));
    assert.equal(before.status, 200);
    assert.equal(before.body.data.saved, false);

    await request(ctx.app)
      .post('/api/v1/customer/saved-providers')
      .set(...auth(token))
      .send({ providerId: 'professional-1' });

    const after = await request(ctx.app)
      .get('/api/v1/customer/saved-providers/professional-1')
      .set(...auth(token));
    assert.equal(after.body.data.saved, true);

    const other = await request(ctx.app)
      .get('/api/v1/customer/saved-providers/professional-2')
      .set(...auth(token));
    assert.equal(other.body.data.saved, false);
  });

  it('rejects a malformed provider id in the state path', async () => {
    const res = await request(ctx.app)
      .get('/api/v1/customer/saved-providers/not-a-provider')
      .set(...auth(token));
    assert.equal(res.status, 400);
  });

  it('removes a saved provider', async () => {
    await request(ctx.app)
      .post('/api/v1/customer/saved-providers')
      .set(...auth(token))
      .send({ providerId: 'professional-1' });

    const removed = await request(ctx.app)
      .delete('/api/v1/customer/saved-providers/professional-1')
      .set(...auth(token));
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    assert.equal(removed.body.success, true);

    const list = await request(ctx.app).get('/api/v1/customer/saved-providers').set(...auth(token));
    assert.equal(list.body.data.total, 0);
  });

  it('reports 404 when removing something that was never saved', async () => {
    const res = await request(ctx.app)
      .delete('/api/v1/customer/saved-providers/professional-1')
      .set(...auth(token));
    assert.equal(res.status, 404);
  });

  it('lets a provider be saved again after removal', async () => {
    await request(ctx.app)
      .post('/api/v1/customer/saved-providers')
      .set(...auth(token))
      .send({ providerId: 'professional-1' });
    await request(ctx.app).delete('/api/v1/customer/saved-providers/professional-1').set(...auth(token));
    const res = await request(ctx.app)
      .post('/api/v1/customer/saved-providers')
      .set(...auth(token))
      .send({ providerId: 'professional-1' });
    assert.equal(res.status, 201);
  });
});

describe('customer saved professionals - isolation between customers', () => {
  it('keeps one customer\'s saved list invisible to another', async () => {
    const ctx = buildApp();
    const alice = await register(ctx.app, 'alice@example.com');
    const bob = await register(ctx.app, 'bob@example.com');

    await request(ctx.app)
      .post('/api/v1/customer/saved-providers')
      .set(...auth(alice.token))
      .send({ providerId: 'professional-1' });

    const bobList = await request(ctx.app).get('/api/v1/customer/saved-providers').set(...auth(bob.token));
    assert.equal(bobList.body.data.total, 0);

    const bobState = await request(ctx.app)
      .get('/api/v1/customer/saved-providers/professional-1')
      .set(...auth(bob.token));
    assert.equal(bobState.body.data.saved, false);

    // Bob cannot delete Alice's bookmark.
    const bobDelete = await request(ctx.app)
      .delete('/api/v1/customer/saved-providers/professional-1')
      .set(...auth(bob.token));
    assert.equal(bobDelete.status, 404);

    const aliceList = await request(ctx.app).get('/api/v1/customer/saved-providers').set(...auth(alice.token));
    assert.equal(aliceList.body.data.total, 1);
  });
});
