/**
 * FixLink Stage 7A — business foundation + technician management tests.
 *
 * Run: npm test (no MySQL required — uses the in-memory business store
 * with the same rules as the MySQL implementation).
 *
 * Covers: unauthenticated rejection, customer/professional/admin role
 * rejection, owner/manager business read, owner-only profile update,
 * technician invite (new + existing accounts), roster scoping, business
 * isolation (A vs B reads as 404, never 403), technician self-access vs
 * management rejection, activation sync, malformed/unknown ids, invalid
 * payloads, duplicate handling and the standard API envelopes.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { MemoryUserRepository } from '../src/modules/auth/memory-user.repository';
import { MemoryRefreshStore } from '../src/modules/auth/refresh.store';
import { MemoryMarketplaceStore } from '../src/modules/marketplace/memory-marketplace.store';
import { MemoryBusinessStore } from '../src/modules/business/memory-business.store';
import { hashPassword } from '../src/utils/password';

interface TestContext {
  app: Express;
  users: MemoryUserRepository;
  business: MemoryBusinessStore;
}

function buildApp(): TestContext {
  const users = new MemoryUserRepository();
  const business = new MemoryBusinessStore();
  const app = createApp({
    users,
    refreshStore: new MemoryRefreshStore(),
    marketplace: new MemoryMarketplaceStore(),
    business,
  });
  return { app, users, business };
}

const PASSWORD = 'Str0ngPassw0rd!';

/** Provision a user with exact roles (ACTIVE) and return auth credentials. */
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

function validTechnician(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    displayName: 'Bongani Zulu',
    email: 'bongani.zulu@example.co.za',
    phone: '+27825550109',
    password: 'TechPass123!',
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

function assertNoPrivateFields(value: Record<string, unknown>): void {
  const forbidden = ['passwordHash', 'password_hash', 'password', 'verificationDocument', 'internalNotes', 'audit'];
  for (const field of forbidden) {
    assert.ok(!(field in value), `private field leaked: ${field}`);
  }
}

/** Owner + business, manager, and a second isolated business. */
async function setupBusinesses(ctx: TestContext): Promise<{
  ownerToken: string;
  ownerId: string;
  businessId: string;
  managerToken: string;
  managerId: string;
  ownerBToken: string;
  businessBId: string;
}> {
  const owner = await provisionUser(ctx, 'thabo.maseko@example.co.za', ['BUSINESS_OWNER']);
  const business = ctx.business.seedBusiness({
    ownerUserId: owner.userId,
    businessName: 'Ubuntu Plumbing Co.',
    slug: 'ubuntu-plumbing-co',
  });
  const manager = await provisionUser(ctx, 'lerato.khumalo@example.co.za', ['BUSINESS_MANAGER']);
  ctx.business.addMembership(business.id, manager.userId, 'BUSINESS_MANAGER');
  const ownerB = await provisionUser(ctx, 'david.naidoo@example.co.za', ['BUSINESS_OWNER']);
  const businessB = ctx.business.seedBusiness({
    ownerUserId: ownerB.userId,
    businessName: 'Cape Spark Electrical',
    slug: 'cape-spark-electrical',
  });
  return {
    ownerToken: owner.token,
    ownerId: owner.userId,
    businessId: business.id,
    managerToken: manager.token,
    managerId: manager.userId,
    ownerBToken: ownerB.token,
    businessBId: businessB.id,
  };
}

async function inviteTechnician(
  ctx: TestContext,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const res = await request(ctx.app)
    .post('/api/v1/business/technicians')
    .set('Authorization', `Bearer ${token}`)
    .send(validTechnician(overrides));
  assert.equal(res.status, 201, `technician invite failed: ${JSON.stringify(res.body)}`);
  return res.body.data as Record<string, unknown>;
}

describe('Stage 7A — authentication & role gating', () => {
  let ctx: TestContext;
  beforeEach(() => {
    ctx = buildApp();
  });

  it('1. unauthenticated business requests are rejected (401)', async () => {
    for (const [method, path] of [
      ['get', '/api/v1/business/me'],
      ['patch', '/api/v1/business/me'],
      ['get', '/api/v1/business/technicians'],
      ['post', '/api/v1/business/technicians'],
      ['get', '/api/v1/business/technicians/1'],
      ['patch', '/api/v1/business/technicians/1'],
    ] as const) {
      const res = await request(ctx.app)[method](path).send({});
      assert.equal(res.status, 401, `${method} ${path}`);
      assertErrorEnvelope(res, 'UNAUTHORIZED');
    }
  });

  it('2. customer accessing business endpoints is denied (403)', async () => {
    const customer = await provisionUser(ctx, 'naledi.dlamini@example.co.za', ['CUSTOMER']);
    const me = await request(ctx.app).get('/api/v1/business/me').set('Authorization', `Bearer ${customer.token}`);
    assert.equal(me.status, 403);
    assertErrorEnvelope(me, 'FORBIDDEN_ROLE');
    const roster = await request(ctx.app)
      .get('/api/v1/business/technicians')
      .set('Authorization', `Bearer ${customer.token}`);
    assert.equal(roster.status, 403);
    assertErrorEnvelope(roster, 'FORBIDDEN_ROLE');
    const tech = await request(ctx.app)
      .get('/api/v1/business/technicians/1')
      .set('Authorization', `Bearer ${customer.token}`);
    assert.equal(tech.status, 403);
    assertErrorEnvelope(tech, 'FORBIDDEN_ROLE');
  });

  it('3. professional accessing business management is denied (403)', async () => {
    const pro = await provisionUser(ctx, 'sipho.ndlovu@example.co.za', ['PROFESSIONAL']);
    const me = await request(ctx.app).get('/api/v1/business/me').set('Authorization', `Bearer ${pro.token}`);
    assert.equal(me.status, 403);
    assertErrorEnvelope(me, 'FORBIDDEN_ROLE');
    const create = await request(ctx.app)
      .post('/api/v1/business/technicians')
      .set('Authorization', `Bearer ${pro.token}`)
      .send(validTechnician());
    assert.equal(create.status, 403);
    assertErrorEnvelope(create, 'FORBIDDEN_ROLE');
  });

  it('3b. admin has no business identity in this stage (403)', async () => {
    const admin = await provisionUser(ctx, 'admin@fixlink.example.co.za', ['ADMIN']);
    const me = await request(ctx.app).get('/api/v1/business/me').set('Authorization', `Bearer ${admin.token}`);
    assert.equal(me.status, 403);
    assertErrorEnvelope(me, 'FORBIDDEN_ROLE');
  });
});

describe('Stage 7A — business profile', () => {
  let ctx: TestContext;
  let setup: Awaited<ReturnType<typeof setupBusinesses>>;
  beforeEach(async () => {
    ctx = buildApp();
    setup = await setupBusinesses(ctx);
  });

  it('4. business owner can view their own business (200, standard envelope)', async () => {
    const res = await request(ctx.app).get('/api/v1/business/me').set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal(res.status, 200);
    assertSuccessEnvelope(res);
    const business = res.body.data as Record<string, unknown>;
    assert.equal(business['id'], setup.businessId);
    assert.equal(business['businessName'], 'Ubuntu Plumbing Co.');
    assert.equal(business['slug'], 'ubuntu-plumbing-co');
    assert.equal(business['role'], 'OWNER');
    assert.equal(business['technicianCount'], 0);
    assertNoPrivateFields(business);
    assert.ok(!('owner_user_id' in business) && !('ownerUserId' in business));
  });

  it('5. business manager can view their own business with the manager role', async () => {
    const res = await request(ctx.app)
      .get('/api/v1/business/me')
      .set('Authorization', `Bearer ${setup.managerToken}`);
    assert.equal(res.status, 200);
    assertSuccessEnvelope(res);
    const business = res.body.data as Record<string, unknown>;
    assert.equal(business['id'], setup.businessId);
    assert.equal(business['role'], 'MANAGER');
  });

  it('5b. owner-role account without a business reads as 404 (not 403)', async () => {
    const lonely = await provisionUser(ctx, 'lonely.owner@example.co.za', ['BUSINESS_OWNER']);
    const res = await request(ctx.app).get('/api/v1/business/me').set('Authorization', `Bearer ${lonely.token}`);
    assert.equal(res.status, 404);
    assertErrorEnvelope(res, 'NOT_FOUND');
  });

  it('owner can update the business profile; unknown fields and spoofed ids are ignored', async () => {
    const res = await request(ctx.app)
      .patch('/api/v1/business/me')
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({
        businessName: 'Ubuntu Plumbing Co. (Pty) Ltd',
        description: 'Family-run plumbing team serving Joburg North.',
        phone: '+27115550101',
        city: 'Johannesburg',
        business_id: '999',
        owner_id: '999',
        role: 'ADMIN',
        verification_status: 'VERIFIED',
      });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assertSuccessEnvelope(res);
    const business = res.body.data as Record<string, unknown>;
    assert.equal(business['businessName'], 'Ubuntu Plumbing Co. (Pty) Ltd');
    assert.equal(business['description'], 'Family-run plumbing team serving Joburg North.');
    assert.equal(business['role'], 'OWNER');
    // Spoofed ownership/role fields change nothing — the business is unchanged.
    const reread = await request(ctx.app).get('/api/v1/business/me').set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal((reread.body.data as Record<string, unknown>)['id'], setup.businessId);
  });

  it('manager cannot update the business profile (403); owner validation rejects bad input (422)', async () => {
    const denied = await request(ctx.app)
      .patch('/api/v1/business/me')
      .set('Authorization', `Bearer ${setup.managerToken}`)
      .send({ description: 'Manager edit.' });
    assert.equal(denied.status, 403);
    assertErrorEnvelope(denied, 'FORBIDDEN_ROLE');

    const empty = await request(ctx.app)
      .patch('/api/v1/business/me')
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({});
    assert.equal(empty.status, 422);
    assertErrorEnvelope(empty, 'VALIDATION_ERROR');

    const badEmail = await request(ctx.app)
      .patch('/api/v1/business/me')
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({ email: 'not-an-email' });
    assert.equal(badEmail.status, 422);
    assertErrorEnvelope(badEmail, 'VALIDATION_ERROR');
  });
});

describe('Stage 7A — technician management', () => {
  let ctx: TestContext;
  let setup: Awaited<ReturnType<typeof setupBusinesses>>;
  beforeEach(async () => {
    ctx = buildApp();
    setup = await setupBusinesses(ctx);
  });

  it('8. owner can invite a technician (201); the technician can authenticate with the TECHNICIAN role', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/business/technicians')
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send(validTechnician());
    assert.equal(res.status, 201);
    assertSuccessEnvelope(res);
    const tech = res.body.data as Record<string, unknown>;
    assert.equal(tech['businessId'], setup.businessId);
    assert.equal(tech['displayName'], 'Bongani Zulu');
    assert.equal(tech['email'], 'bongani.zulu@example.co.za');
    assert.equal(tech['phone'], '+27825550109');
    assert.equal(tech['isActive'], true);
    assertNoPrivateFields(tech);

    const login = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: 'bongani.zulu@example.co.za', password: 'TechPass123!' });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.deepEqual(login.body.data.user.roles, ['TECHNICIAN']);

    const count = await request(ctx.app).get('/api/v1/business/me').set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal((count.body.data as Record<string, unknown>)['technicianCount'], 1);
  });

  it('9. manager can invite a technician when permissions allow (201)', async () => {
    const tech = await inviteTechnician(ctx, setup.managerToken, { email: 'karin.meyer@example.co.za' });
    assert.equal(tech['businessId'], setup.businessId);
    assert.equal(tech['email'], 'karin.meyer@example.co.za');
  });

  it('existing accounts are linked (and gain the TECHNICIAN role) without a password', async () => {
    const customer = await provisionUser(ctx, 'pieter.vdm@example.co.za', ['CUSTOMER']);
    const res = await request(ctx.app)
      .post('/api/v1/business/technicians')
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({ displayName: 'Pieter van der Merwe', email: 'pieter.vdm@example.co.za' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const tech = res.body.data as Record<string, unknown>;
    assert.equal(tech['userId'], customer.userId);

    const me = await request(ctx.app).get('/api/v1/auth/me').set('Authorization', `Bearer ${customer.token}`);
    assert.deepEqual((me.body.data.user as Record<string, unknown>)['roles'], ['CUSTOMER', 'TECHNICIAN']);
  });

  it('6/7. owner and manager list only their own technicians', async () => {
    await inviteTechnician(ctx, setup.ownerToken, { email: 'tech.one@example.co.za', displayName: 'Tech One' });
    await inviteTechnician(ctx, setup.managerToken, { email: 'tech.two@example.co.za', displayName: 'Tech Two' });

    const ownerList = await request(ctx.app)
      .get('/api/v1/business/technicians')
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal(ownerList.status, 200);
    assertSuccessEnvelope(ownerList);
    const ownerData = ownerList.body.data as { items: Array<Record<string, unknown>>; total: number };
    assert.equal(ownerData.total, 2);
    assert.deepEqual(
      ownerData.items.map((item) => item['displayName']),
      ['Tech One', 'Tech Two'],
    );

    const managerList = await request(ctx.app)
      .get('/api/v1/business/technicians')
      .set('Authorization', `Bearer ${setup.managerToken}`);
    assert.equal(managerList.status, 200);
    assert.equal((managerList.body.data as { total: number }).total, 2);

    const otherOwner = await request(ctx.app)
      .get('/api/v1/business/technicians')
      .set('Authorization', `Bearer ${setup.ownerBToken}`);
    assert.equal(otherOwner.status, 200);
    assert.equal((otherOwner.body.data as { total: number }).total, 0);
  });

  it('10/11. owner and manager can view their own technician', async () => {
    const tech = await inviteTechnician(ctx, setup.ownerToken);
    for (const token of [setup.ownerToken, setup.managerToken]) {
      const res = await request(ctx.app)
        .get(`/api/v1/business/technicians/${tech['id']}`)
        .set('Authorization', `Bearer ${token}`);
      assert.equal(res.status, 200);
      assertSuccessEnvelope(res);
      assert.equal((res.body.data as Record<string, unknown>)['id'], tech['id']);
    }
  });

  it('12. business A cannot access business B technicians (404, no probing)', async () => {
    const techB = await inviteTechnician(ctx, setup.ownerBToken, { email: 'tech.b@example.co.za' });
    for (const token of [setup.ownerToken, setup.managerToken]) {
      const res = await request(ctx.app)
        .get(`/api/v1/business/technicians/${techB['id']}`)
        .set('Authorization', `Bearer ${token}`);
      assert.equal(res.status, 404);
      assertErrorEnvelope(res, 'NOT_FOUND');
    }
    const patch = await request(ctx.app)
      .patch(`/api/v1/business/technicians/${techB['id']}`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({ displayName: 'Hijacked' });
    assert.equal(patch.status, 404);
    assertErrorEnvelope(patch, 'NOT_FOUND');
  });

  it('13. technician cannot manage technicians (403 on list/create/update)', async () => {
    const tech = await inviteTechnician(ctx, setup.ownerToken);
    const login = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: 'bongani.zulu@example.co.za', password: 'TechPass123!' });
    const techToken = login.body.data.accessToken as string;

    const list = await request(ctx.app)
      .get('/api/v1/business/technicians')
      .set('Authorization', `Bearer ${techToken}`);
    assert.equal(list.status, 403);
    assertErrorEnvelope(list, 'FORBIDDEN_ROLE');

    const create = await request(ctx.app)
      .post('/api/v1/business/technicians')
      .set('Authorization', `Bearer ${techToken}`)
      .send(validTechnician({ email: 'another.tech@example.co.za' }));
    assert.equal(create.status, 403);
    assertErrorEnvelope(create, 'FORBIDDEN_ROLE');

    const patch = await request(ctx.app)
      .patch(`/api/v1/business/technicians/${tech['id']}`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ displayName: 'Self rename' });
    assert.equal(patch.status, 403);
    assertErrorEnvelope(patch, 'FORBIDDEN_ROLE');

    const business = await request(ctx.app)
      .get('/api/v1/business/me')
      .set('Authorization', `Bearer ${techToken}`);
    assert.equal(business.status, 403);
    assertErrorEnvelope(business, 'FORBIDDEN_ROLE');
  });

  it('14. technician reads their own record but not another technician (404)', async () => {
    const techOne = await inviteTechnician(ctx, setup.ownerToken, { email: 'tech.one@example.co.za' });
    await inviteTechnician(ctx, setup.ownerToken, { email: 'tech.two@example.co.za', displayName: 'Tech Two' });
    const login = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: 'tech.one@example.co.za', password: 'TechPass123!' });
    const techToken = login.body.data.accessToken as string;

    const own = await request(ctx.app)
      .get(`/api/v1/business/technicians/${techOne['id']}`)
      .set('Authorization', `Bearer ${techToken}`);
    assert.equal(own.status, 200);
    assert.equal((own.body.data as Record<string, unknown>)['email'], 'tech.one@example.co.za');

    const otherB = await inviteTechnician(ctx, setup.ownerBToken, { email: 'tech.b@example.co.za' });
    for (const foreignId of ['2', otherB['id']]) {
      const res = await request(ctx.app)
        .get(`/api/v1/business/technicians/${foreignId}`)
        .set('Authorization', `Bearer ${techToken}`);
      assert.equal(res.status, 404, `expected 404 for ${foreignId}`);
      assertErrorEnvelope(res, 'NOT_FOUND');
    }
  });

  it('15. owner/manager can activate and deactivate; deactivation revokes business access', async () => {
    const tech = await inviteTechnician(ctx, setup.ownerToken);
    const id = tech['id'] as string;

    const deactivated = await request(ctx.app)
      .patch(`/api/v1/business/technicians/${id}`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({ isActive: false });
    assert.equal(deactivated.status, 200);
    assert.equal((deactivated.body.data as Record<string, unknown>)['isActive'], false);

    // A deactivated technician loses business access entirely.
    const login = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: 'bongani.zulu@example.co.za', password: 'TechPass123!' });
    const techToken = login.body.data.accessToken as string;
    const selfAfter = await request(ctx.app)
      .get(`/api/v1/business/technicians/${id}`)
      .set('Authorization', `Bearer ${techToken}`);
    assert.equal(selfAfter.status, 404);

    const reactivated = await request(ctx.app)
      .patch(`/api/v1/business/technicians/${id}`)
      .set('Authorization', `Bearer ${setup.managerToken}`)
      .send({ active: true });
    assert.equal(reactivated.status, 200);
    assert.equal((reactivated.body.data as Record<string, unknown>)['isActive'], true);

    const renamed = await request(ctx.app)
      .patch(`/api/v1/business/technicians/${id}`)
      .set('Authorization', `Bearer ${setup.managerToken}`)
      .send({ displayName: 'Bongani Z.' });
    assert.equal(renamed.status, 200);
    assert.equal((renamed.body.data as Record<string, unknown>)['displayName'], 'Bongani Z.');
  });

  it('16. malformed technician ids are rejected (400)', async () => {
    for (const badId of ['abc', '0', '-4', '1.5', ' ']) {
      const get = await request(ctx.app)
        .get(`/api/v1/business/technicians/${encodeURIComponent(badId)}`)
        .set('Authorization', `Bearer ${setup.ownerToken}`);
      assert.equal(get.status, 400, `GET ${badId}`);
      assertErrorEnvelope(get, 'VALIDATION_ERROR');
      const patch = await request(ctx.app)
        .patch(`/api/v1/business/technicians/${encodeURIComponent(badId)}`)
        .set('Authorization', `Bearer ${setup.ownerToken}`)
        .send({ displayName: 'Nope' });
      assert.equal(patch.status, 400, `PATCH ${badId}`);
      assertErrorEnvelope(patch, 'VALIDATION_ERROR');
    }
  });

  it('17. unknown technician ids read as 404', async () => {
    const get = await request(ctx.app)
      .get('/api/v1/business/technicians/99999')
      .set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal(get.status, 404);
    assertErrorEnvelope(get, 'NOT_FOUND');
    const patch = await request(ctx.app)
      .patch('/api/v1/business/technicians/99999')
      .set('Authorization', `Bearer ${setup.managerToken}`)
      .send({ displayName: 'Ghost' });
    assert.equal(patch.status, 404);
    assertErrorEnvelope(patch, 'NOT_FOUND');
  });

  it('18. invalid technician data is rejected (422)', async () => {
    const cases: Record<string, unknown>[] = [
      {},
      { email: 'no.name@example.co.za', password: 'TechPass123!' },
      { displayName: '', email: 'empty.name@example.co.za', password: 'TechPass123!' },
      { displayName: 'Bad Email', email: 'not-an-email', password: 'TechPass123!' },
      { displayName: 'Short Pass', email: 'short.pass@example.co.za', password: 'short' },
      { displayName: 'Bad Phone', email: 'bad.phone@example.co.za', password: 'TechPass123!', phone: 'abc' },
      { displayName: 'No Pass', email: 'brand.new@example.co.za' },
    ];
    for (const [index, body] of cases.entries()) {
      const res = await request(ctx.app)
        .post('/api/v1/business/technicians')
        .set('Authorization', `Bearer ${setup.ownerToken}`)
        .send(body);
      assert.equal(res.status, 422, `case ${index}: ${JSON.stringify(res.body)}`);
      assertErrorEnvelope(res, 'VALIDATION_ERROR');
    }
    const tech = await inviteTechnician(ctx, setup.ownerToken);
    const emptyPatch = await request(ctx.app)
      .patch(`/api/v1/business/technicians/${tech['id']}`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({});
    assert.equal(emptyPatch.status, 422);
    const badStatus = await request(ctx.app)
      .patch(`/api/v1/business/technicians/${tech['id']}`)
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({ isActive: 'yes' });
    assert.equal(badStatus.status, 422);
  });

  it('19. duplicate technician and user handling follows existing constraints (409)', async () => {
    await inviteTechnician(ctx, setup.ownerToken);
    // Same email invited twice (no password — existing account) — never double-linked.
    const duplicate = await request(ctx.app)
      .post('/api/v1/business/technicians')
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({ displayName: 'Bongani Again', email: 'bongani.zulu@example.co.za' });
    assert.equal(duplicate.status, 409);
    assertErrorEnvelope(duplicate, 'CONFLICT');

    // A password alongside an existing email is rejected, not applied.
    const withPassword = await request(ctx.app)
      .post('/api/v1/business/technicians')
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send(validTechnician({ password: 'AnotherPass123!' }));
    assert.equal(withPassword.status, 422);
    assertErrorEnvelope(withPassword, 'VALIDATION_ERROR');

    // The owner themself cannot be re-linked as a technician either.
    const ownerAsTech = await request(ctx.app)
      .post('/api/v1/business/technicians')
      .set('Authorization', `Bearer ${setup.ownerToken}`)
      .send({ displayName: 'Owner Tech', email: 'thabo.maseko@example.co.za' });
    assert.equal(ownerAsTech.status, 409);
    assertErrorEnvelope(ownerAsTech, 'CONFLICT');
  });

  it('20. correct roles are returned for every actor', async () => {
    const ownerMe = await request(ctx.app).get('/api/v1/business/me').set('Authorization', `Bearer ${setup.ownerToken}`);
    assert.equal((ownerMe.body.data as Record<string, unknown>)['role'], 'OWNER');
    const managerMe = await request(ctx.app)
      .get('/api/v1/business/me')
      .set('Authorization', `Bearer ${setup.managerToken}`);
    assert.equal((managerMe.body.data as Record<string, unknown>)['role'], 'MANAGER');

    const tech = await inviteTechnician(ctx, setup.ownerToken);
    assert.equal((tech['businessId'] as string), setup.businessId);
    const login = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: 'bongani.zulu@example.co.za', password: 'TechPass123!' });
    assert.deepEqual(login.body.data.user.roles, ['TECHNICIAN']);

    // Technicians never gain a marketplace provider profile: the provider
    // inbox stays forbidden for the technician-only account.
    const inbox = await request(ctx.app)
      .get('/api/v1/provider/requests')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);
    assert.equal(inbox.status, 403);
  });
});
