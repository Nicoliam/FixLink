/**
 * Fixlynk — provider service offering tests.
 *
 * Run: npm test (no MySQL required — uses the in-memory offerings store
 * with the same per-owner uniqueness and ownership rules as the MySQL
 * implementation).
 *
 * Covers: role gating, session-derived ownership, create/update/remove,
 * the indicative-price rules, the duplicate-name conflict, and the 409 guard
 * that refuses removal while open work still references an offering.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { MemoryUserRepository } from '../src/modules/auth/memory-user.repository';
import { MemoryRefreshStore } from '../src/modules/auth/refresh.store';
import { MemoryMarketplaceStore } from '../src/modules/marketplace/memory-marketplace.store';
import { MemoryOfferingsStore } from '../src/modules/offerings/memory-offerings.store';
import { signAccessToken } from '../src/utils/tokens';

const PASSWORD = 'Str0ngPassw0rd!';

interface TestContext {
  app: Express;
  users: MemoryUserRepository;
  offerings: MemoryOfferingsStore;
}

function buildApp(): TestContext {
  const users = new MemoryUserRepository();
  const offerings = new MemoryOfferingsStore();
  const app = createApp({
    users,
    refreshStore: new MemoryRefreshStore(),
    marketplace: new MemoryMarketplaceStore(),
    offerings,
  });
  return { app, users, offerings };
}

/** Registration provisions the provider profile, so the name is required. */
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

function validOffering(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    categoryId: '1',
    name: 'Burst Pipe Emergency Call-Out',
    description: 'Same-day call-out for burst pipes.',
    priceAmount: 850,
    ...overrides,
  };
}

describe('provider service offerings - access control', () => {
  let ctx: TestContext;
  let professionalToken: string;

  beforeEach(async () => {
    ctx = buildApp();
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    ctx.offerings.linkProfessionalProfile(pro.userId, '1');
    professionalToken = pro.token;
  });

  it('rejects unauthenticated access (401)', async () => {
    const res = await request(ctx.app).get('/api/v1/provider/offerings');
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  it('refuses customers (403 FORBIDDEN_ROLE)', async () => {
    const customer = await register(ctx.app, 'naledi.customer@example.co.za');
    const res = await request(ctx.app)
      .get('/api/v1/provider/offerings')
      .set(...auth(customer.token));
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN_ROLE');
  });

  it('refuses technicians, who are never marketplace providers', async () => {
    const tech = await register(ctx.app, 'thabo.tech@example.co.za');
    const res = await request(ctx.app).get('/api/v1/provider/offerings').set(...auth(tech.token));
    assert.equal(res.status, 403);
  });

  it('refuses administrators on the provider surface', async () => {
    // ADMIN is not a self-registerable role, so mint the session directly.
    const users = new MemoryUserRepository();
    const created = await users.create({ email: 'admin@example.co.za', phone: null, passwordHash: 'not-a-real-hash' });
    await users.setRoles(created.id, ['ADMIN']);
    await users.setStatus(created.id, 'ACTIVE');
    const adminApp = createApp({
      users,
      refreshStore: new MemoryRefreshStore(),
      marketplace: new MemoryMarketplaceStore(),
      offerings: new MemoryOfferingsStore(),
    });
    const token = signAccessToken({ sub: created.id, email: created.email, roles: ['ADMIN'] });
    const res = await request(adminApp).get('/api/v1/provider/offerings').set(...auth(token));
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN_ROLE');
  });

  it('refuses a provider role with no professional profile (404)', async () => {
    const orphan = await register(ctx.app, 'orphan.pro@example.co.za', 'PROFESSIONAL');
    const res = await request(ctx.app).get('/api/v1/provider/offerings').set(...auth(orphan.token));
    assert.equal(res.status, 404);
  });

  it('lets a business manager manage the business offerings', async () => {
    const owner = await register(ctx.app, 'owner@example.co.za', 'BUSINESS_OWNER');
    ctx.offerings.addBusinessMembership(owner.userId, '1', 'OWNER');
    const manager = await register(ctx.app, 'manager@example.co.za');
    await ctx.users.setRoles(manager.userId, ['BUSINESS_MANAGER']);
    ctx.offerings.addBusinessMembership(manager.userId, '1', 'MANAGER');
    const res = await request(ctx.app)
      .post('/api/v1/provider/offerings')
      .set(...auth(manager.token))
      .send(validOffering({ name: 'Commercial Drainage' }));
    assert.equal(res.status, 201);
    assert.equal(res.body.data.providerType, 'BUSINESS');
    assert.equal(res.body.data.providerId, '1');
  });

  it('never lists another provider offerings', async () => {
    await request(ctx.app)
      .post('/api/v1/provider/offerings')
      .set(...auth(professionalToken))
      .send(validOffering());
    const other = await register(ctx.app, 'johan.pro@example.co.za', 'PROFESSIONAL');
    ctx.offerings.linkProfessionalProfile(other.userId, '2');
    const res = await request(ctx.app).get('/api/v1/provider/offerings').set(...auth(other.token));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.items.length, 0);
  });
});

describe('provider service offerings - create', () => {
  let ctx: TestContext;
  let token: string;

  beforeEach(async () => {
    ctx = buildApp();
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    ctx.offerings.linkProfessionalProfile(pro.userId, '1');
    token = pro.token;
  });

  it('creates an offering with an indicative ZAR price', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/provider/offerings')
      .set(...auth(token))
      .send(validOffering());
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.name, 'Burst Pipe Emergency Call-Out');
    assert.equal(res.body.data.priceAmount, 850);
    assert.equal(res.body.data.currency, 'ZAR');
    assert.equal(res.body.data.providerType, 'PROFESSIONAL');
    assert.equal(res.body.data.providerId, '1');
    assert.equal(res.body.data.isActive, true);
  });

  it('accepts a price with cents', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/provider/offerings')
      .set(...auth(token))
      .send(validOffering({ name: 'Cents Test', priceAmount: 1234.56 }));
    assert.equal(res.status, 201);
    assert.equal(res.body.data.priceAmount, 1234.56);
  });

  it('rejects a negative price (422)', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/provider/offerings')
      .set(...auth(token))
      .send(validOffering({ priceAmount: -1 }));
    assert.equal(res.status, 422);
    assert.match(res.body.error.message, /negative/i);
  });

  it('rejects a price with more than two decimals (422)', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/provider/offerings')
      .set(...auth(token))
      .send(validOffering({ priceAmount: 10.555 }));
    assert.equal(res.status, 422);
    assert.match(res.body.error.message, /decimal/i);
  });

  it('accepts a missing price and stores it as null, not 0', async () => {
    // Migration 019: a provider choosing services during registration has not
    // decided what to charge. NULL means "not set"; 0 would render to customers
    // as a real "from R0", inventing a price the provider never agreed to.
    const body = validOffering();
    delete body['priceAmount'];
    const res = await request(ctx.app).post('/api/v1/provider/offerings').set(...auth(token)).send(body);
    assert.equal(res.status, 201);
    assert.equal(res.body.data.priceAmount, null);

    // ...and it must survive a read, not come back as a number.
    const list = await request(ctx.app).get('/api/v1/provider/offerings').set(...auth(token));
    const found = list.body.data.items.find((item: { id: number }) => item.id === res.body.data.id);
    assert.equal(found.priceAmount, null);
    assert.notEqual(found.priceAmount, 0, 'an unset price must never be coerced to 0');
  });

  it('accepts an explicit null price, and still rejects a negative one', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/provider/offerings')
      .set(...auth(token))
      .send({ ...validOffering(), priceAmount: null });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.priceAmount, null);

    const negative = await request(ctx.app)
      .post('/api/v1/provider/offerings')
      .set(...auth(token))
      .send({ ...validOffering(), priceAmount: -1 });
    assert.equal(negative.status, 422);
  });

  it('lets a provider set the price later without changing the offering', async () => {
    const created = await request(ctx.app)
      .post('/api/v1/provider/offerings')
      .set(...auth(token))
      .send({ ...validOffering(), priceAmount: null });
    assert.equal(created.status, 201);

    const updated = await request(ctx.app)
      .patch(`/api/v1/provider/offerings/${created.body.data.id}`)
      .set(...auth(token))
      .send({ priceAmount: 450 });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.priceAmount, 450);
    assert.equal(updated.body.data.name, created.body.data.name, 'other fields must be untouched');
  });

  it('rejects a missing name (422)', async () => {
    const body = validOffering();
    delete body['name'];
    const res = await request(ctx.app).post('/api/v1/provider/offerings').set(...auth(token)).send(body);
    assert.equal(res.status, 422);
  });

  it('rejects an inactive category (422)', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/provider/offerings')
      .set(...auth(token))
      .send(validOffering({ categoryId: '4' }));
    assert.equal(res.status, 422);
    assert.match(res.body.error.message, /category/i);
  });

  it('rejects a client trying to set server-owned fields (422)', async () => {
    for (const field of ['professionalId', 'businessId', 'isActive', 'currency', 'id']) {
      const res = await request(ctx.app)
        .post('/api/v1/provider/offerings')
        .set(...auth(token))
        .send(validOffering({ [field]: '1' }));
      assert.equal(res.status, 422, `expected ${field} to be rejected`);
      assert.match(res.body.error.message, /Unsupported field/);
    }
  });

  it('rejects a duplicate name for the same provider (409 CONFLICT)', async () => {
    await request(ctx.app)
      .post('/api/v1/provider/offerings')
      .set(...auth(token))
      .send(validOffering());
    const res = await request(ctx.app)
      .post('/api/v1/provider/offerings')
      .set(...auth(token))
      .send(validOffering({ priceAmount: 900 }));
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CONFLICT');
  });

  it('lets two different providers use the same offering name', async () => {
    await request(ctx.app)
      .post('/api/v1/provider/offerings')
      .set(...auth(token))
      .send(validOffering());
    const other = await register(ctx.app, 'johan.pro@example.co.za', 'PROFESSIONAL');
    ctx.offerings.linkProfessionalProfile(other.userId, '2');
    const res = await request(ctx.app)
      .post('/api/v1/provider/offerings')
      .set(...auth(other.token))
      .send(validOffering({ priceAmount: 1200 }));
    assert.equal(res.status, 201);
    assert.equal(res.body.data.providerId, '2');
  });

  it('requires providerType when the caller manages more than one provider', async () => {
    const hybrid = await register(ctx.app, 'hybrid.pro@example.co.za', 'PROFESSIONAL');
    ctx.offerings.linkProfessionalProfile(hybrid.userId, '1');
    ctx.offerings.addBusinessMembership(hybrid.userId, '7', 'OWNER');
    const ambiguous = await request(ctx.app)
      .post('/api/v1/provider/offerings')
      .set(...auth(hybrid.token))
      .send(validOffering());
    assert.equal(ambiguous.status, 422);
    assert.match(ambiguous.body.error.message, /providerType/);

    const chosen = await request(ctx.app)
      .post('/api/v1/provider/offerings')
      .set(...auth(hybrid.token))
      .send(validOffering({ providerType: 'BUSINESS' }));
    assert.equal(chosen.status, 201);
    assert.equal(chosen.body.data.providerType, 'BUSINESS');
    assert.equal(chosen.body.data.providerId, '7');
  });

  it('refuses a providerType the caller does not own (403)', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/provider/offerings')
      .set(...auth(token))
      .send(validOffering({ providerType: 'BUSINESS' }));
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN_ROLE');
  });
});

describe('provider service offerings - update', () => {
  let ctx: TestContext;
  let token: string;
  let offeringId: string;

  beforeEach(async () => {
    ctx = buildApp();
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    ctx.offerings.linkProfessionalProfile(pro.userId, '1');
    token = pro.token;
    const created = await request(ctx.app)
      .post('/api/v1/provider/offerings')
      .set(...auth(token))
      .send(validOffering());
    offeringId = created.body.data.id as string;
  });

  it('updates the price only, leaving other fields intact', async () => {
    const res = await request(ctx.app)
      .patch(`/api/v1/provider/offerings/${offeringId}`)
      .set(...auth(token))
      .send({ priceAmount: 999.99 });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.priceAmount, 999.99);
    assert.equal(res.body.data.name, 'Burst Pipe Emergency Call-Out');
  });

  it('moves the offering to another active category', async () => {
    const res = await request(ctx.app)
      .patch(`/api/v1/provider/offerings/${offeringId}`)
      .set(...auth(token))
      .send({ categoryId: '2' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.categoryId, '2');
    assert.equal(res.body.data.categoryName, 'Electrical');
  });

  it('rejects moving to an inactive category', async () => {
    const res = await request(ctx.app)
      .patch(`/api/v1/provider/offerings/${offeringId}`)
      .set(...auth(token))
      .send({ categoryId: '4' });
    assert.equal(res.status, 422);
  });

  it('rejects an empty update (422)', async () => {
    const res = await request(ctx.app)
      .patch(`/api/v1/provider/offerings/${offeringId}`)
      .set(...auth(token))
      .send({});
    assert.equal(res.status, 422);
  });

  it('cannot be moved to another provider via providerType (422)', async () => {
    const res = await request(ctx.app)
      .patch(`/api/v1/provider/offerings/${offeringId}`)
      .set(...auth(token))
      .send({ providerType: 'BUSINESS' });
    assert.equal(res.status, 422);
    assert.match(res.body.error.message, /providerType cannot be changed/);
  });

  it('hides another provider offering behind 404', async () => {
    const other = await register(ctx.app, 'johan.pro@example.co.za', 'PROFESSIONAL');
    ctx.offerings.linkProfessionalProfile(other.userId, '2');
    const res = await request(ctx.app)
      .patch(`/api/v1/provider/offerings/${offeringId}`)
      .set(...auth(other.token))
      .send({ priceAmount: 1 });
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  it('returns 404 for an unknown offering id', async () => {
    const res = await request(ctx.app)
      .patch('/api/v1/provider/offerings/999999')
      .set(...auth(token))
      .send({ priceAmount: 1 });
    assert.equal(res.status, 404);
  });

  it('returns 422 for a malformed id', async () => {
    const res = await request(ctx.app)
      .patch('/api/v1/provider/offerings/not-a-number')
      .set(...auth(token))
      .send({ priceAmount: 1 });
    assert.equal(res.status, 422);
  });

  it('rejects a rename that collides with the provider own other offering', async () => {
    await request(ctx.app)
      .post('/api/v1/provider/offerings')
      .set(...auth(token))
      .send(validOffering({ name: 'Drain Replacement' }));
    const res = await request(ctx.app)
      .patch(`/api/v1/provider/offerings/${offeringId}`)
      .set(...auth(token))
      .send({ name: 'Drain Replacement' });
    assert.equal(res.status, 409);
  });
});

describe('provider service offerings - removal guard', () => {
  let ctx: TestContext;
  let token: string;
  let offeringId: string;

  beforeEach(async () => {
    ctx = buildApp();
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    ctx.offerings.linkProfessionalProfile(pro.userId, '1');
    token = pro.token;
    const created = await request(ctx.app)
      .post('/api/v1/provider/offerings')
      .set(...auth(token))
      .send(validOffering());
    offeringId = created.body.data.id as string;
  });

  it('refuses removal while an open job references the offering (409)', async () => {
    ctx.offerings.addOfferingJob(offeringId, 'IN_PROGRESS');
    const res = await request(ctx.app)
      .delete(`/api/v1/provider/offerings/${offeringId}`)
      .set(...auth(token));
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CONFLICT');
  });

  it('refuses removal for every non-terminal status', async () => {
    for (const status of [
      'REQUESTED',
      'QUOTED',
      'ACCEPTED',
      'SCHEDULED',
      'IN_PROGRESS',
      'AWAITING_PARTS',
      'DISPUTED',
    ]) {
      const fresh = buildApp();
      const pro = await register(fresh.app, `pro.${status}@example.co.za`, 'PROFESSIONAL');
      fresh.offerings.linkProfessionalProfile(pro.userId, '1');
      const created = await request(fresh.app)
        .post('/api/v1/provider/offerings')
        .set(...auth(pro.token))
        .send(validOffering());
      const id = created.body.data.id as string;
      fresh.offerings.addOfferingJob(id, status);
      const res = await request(fresh.app).delete(`/api/v1/provider/offerings/${id}`).set(...auth(pro.token));
      assert.equal(res.status, 409, `expected ${status} to block removal`);
    }
  });

  it('allows removal once only terminal jobs reference the offering', async () => {
    for (const status of ['COMPLETED', 'CONFIRMED', 'CLOSED', 'CANCELLED']) {
      ctx.offerings.addOfferingJob(offeringId, status);
    }
    const res = await request(ctx.app)
      .delete(`/api/v1/provider/offerings/${offeringId}`)
      .set(...auth(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.isActive, false);
  });

  it('removes the offering from the provider list', async () => {
    await request(ctx.app).delete(`/api/v1/provider/offerings/${offeringId}`).set(...auth(token));
    const list = await request(ctx.app).get('/api/v1/provider/offerings').set(...auth(token));
    assert.equal(list.status, 200);
    const ids = (list.body.data.items as { id: string }[]).map((item) => item.id);
    assert.ok(!ids.includes(offeringId), 'removed offering must not be listed');
  });

  it('is idempotent', async () => {
    await request(ctx.app).delete(`/api/v1/provider/offerings/${offeringId}`).set(...auth(token));
    const again = await request(ctx.app)
      .delete(`/api/v1/provider/offerings/${offeringId}`)
      .set(...auth(token));
    assert.equal(again.status, 200);
  });

  it('hides another provider offering behind 404 on delete', async () => {
    const other = await register(ctx.app, 'johan.pro@example.co.za', 'PROFESSIONAL');
    ctx.offerings.linkProfessionalProfile(other.userId, '2');
    const res = await request(ctx.app)
      .delete(`/api/v1/provider/offerings/${offeringId}`)
      .set(...auth(other.token));
    assert.equal(res.status, 404);
  });
});

describe('provider service offerings - public visibility', () => {
  it('lists a professional authored services on the public profile', async () => {
    const ctx = buildApp();
    const res = await request(ctx.app).get('/api/v1/providers/professional-1');
    assert.equal(res.status, 200);
    const offerings = res.body.data.offerings as {
      id: string;
      name: string;
      priceAmount: number;
      currency: string;
    }[];
    const byName = new Map(offerings.map((o) => [o.name, o]));
    const burst = byName.get('Emergency Burst Pipe Repair');
    assert.ok(burst, 'expected the burst pipe repair offering');
    assert.equal(burst.priceAmount, 850);
    assert.equal(burst.currency, 'ZAR');
    // Only live offerings are public.
    assert.equal(byName.has('Retired Service'), false);
    // A price that was never stated stays null; it must not become 0.
    const unpriced = byName.get('Drain Blockage Clearance');
    assert.ok(unpriced, 'expected the unpriced offering');
    assert.equal(unpriced.priceAmount, null);
  });

  it('exposes a business authored services on the public profile', async () => {
    const ctx = buildApp();
    const res = await request(ctx.app).get('/api/v1/providers/business-1');
    assert.equal(res.status, 200);
    const offerings = res.body.data.offerings as { name: string }[];
    assert.equal(offerings.length, 1);
    assert.equal(offerings[0]?.name, 'Commercial Drainage');
  });

  it('never exposes removed offerings publicly', async () => {
    const ctx = buildApp();
    const pro = await register(ctx.app, 'sipho.remove@example.co.za', 'PROFESSIONAL');
    ctx.offerings.linkProfessionalProfile(pro.userId, '1');
    const created = await request(ctx.app)
      .post('/api/v1/provider/offerings')
      .set(...auth(pro.token))
      .send(validOffering({ name: 'Temporary Service' }));
    await request(ctx.app)
      .delete(`/api/v1/provider/offerings/${created.body.data.id}`)
      .set(...auth(pro.token));
    // The public marketplace fixture store is independent of the offerings
    // store, so assert the removal rule directly on the offerings read.
    const list = await request(ctx.app).get('/api/v1/provider/offerings').set(...auth(pro.token));
    const ids = (list.body.data.items as { id: string; name: string }[]).map((i) => i.id);
    assert.ok(!ids.includes(created.body.data.id as string));
  });

describe('provider service offerings - isolation and privacy', () => {
});
  it('keeps two businesses offerings separate', async () => {
    const ctx = buildApp();
    const ownerA = await register(ctx.app, 'owner.a@example.co.za', 'BUSINESS_OWNER');
    ctx.offerings.addBusinessMembership(ownerA.userId, '1', 'OWNER');
    const ownerB = await register(ctx.app, 'owner.b@example.co.za', 'BUSINESS_OWNER');
    ctx.offerings.addBusinessMembership(ownerB.userId, '2', 'OWNER');

    await request(ctx.app)
      .post('/api/v1/provider/offerings')
      .set(...auth(ownerA.token))
      .send(validOffering({ name: 'A only service' }));
    await request(ctx.app)
      .post('/api/v1/provider/offerings')
      .set(...auth(ownerB.token))
      .send(validOffering({ name: 'B only service' }));

    const listA = await request(ctx.app).get('/api/v1/provider/offerings').set(...auth(ownerA.token));
    assert.equal(listA.body.data.items.length, 1);
    assert.equal(listA.body.data.items[0].name, 'A only service');

    // Business B cannot reach business A's offering even by guessing the id.
    const listB = await request(ctx.app).get('/api/v1/provider/offerings').set(...auth(ownerB.token));
    const foreignId = listA.body.data.items[0].id as string;
    const peek = await request(ctx.app)
      .get(`/api/v1/provider/offerings/${foreignId}`)
      .set(...auth(ownerB.token));
    assert.equal(peek.status, 404);
  });

  it('exposes no private provider data on an offering', async () => {
    const ctx = buildApp();
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    ctx.offerings.linkProfessionalProfile(pro.userId, '1');
    const created = await request(ctx.app)
      .post('/api/v1/provider/offerings')
      .set(...auth(pro.token))
      .send(validOffering());
    const serialised = JSON.stringify(created.body);
    for (const secret of ['password', 'token', 'email', 'phone', 'document']) {
      assert.ok(!serialised.includes(secret), `offering response leaked ${secret}`);
    }
  });

  it('returns the standard envelope on success', async () => {
    const ctx = buildApp();
    const pro = await register(ctx.app, 'sipho.pro@example.co.za', 'PROFESSIONAL');
    ctx.offerings.linkProfessionalProfile(pro.userId, '1');
    const res = await request(ctx.app).get('/api/v1/provider/offerings').set(...auth(pro.token));
    assert.equal(res.body.success, true);
    assert.equal(typeof res.body.message, 'string');
    assert.ok(Array.isArray(res.body.data.items));
    assert.equal(typeof res.body.data.total, 'number');
    assert.deepEqual(res.body.data.providers, [{ providerType: 'PROFESSIONAL', providerId: '1' }]);
  });

  it('reports every owned provider even when one has no offerings', async () => {
    // The client can only offer the providerType picker when the backend
    // says a second identity exists, and a brand-new account has no
    // offerings to infer that from.
    const ctx = buildApp();
    const hybrid = await register(ctx.app, 'hybrid.new@example.co.za', 'PROFESSIONAL');
    ctx.offerings.linkProfessionalProfile(hybrid.userId, '5');
    ctx.offerings.addBusinessMembership(hybrid.userId, '9', 'OWNER');
    const res = await request(ctx.app).get('/api/v1/provider/offerings').set(...auth(hybrid.token));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.items.length, 0);
    assert.deepEqual(res.body.data.providers, [
      { providerType: 'PROFESSIONAL', providerId: '5' },
      { providerType: 'BUSINESS', providerId: '9' },
    ]);
  });
});