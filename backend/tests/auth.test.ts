/**
 * FixLink Stage 5A — authentication foundation tests.
 *
 * Run: npm test  (sets JWT_ACCESS_SECRET + AUTH_STORE=memory + fast bcrypt cost)
 *
 * Uses the in-memory user/refresh stores so no MySQL is required.
 * The MySQL repository enforces the same rules (unique email, roles join)
 * and the database schema itself is covered by database/tests/schema.test.js.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { MemoryUserRepository } from '../src/modules/auth/memory-user.repository';
import { MemoryRefreshStore } from '../src/modules/auth/refresh.store';
import { signAccessToken } from '../src/utils/tokens';
import { verifyPassword } from '../src/utils/password';

const SENSITIVE_KEYS = ['password', 'password_hash', 'passwordHash', 'hash'];

function scanForSensitive(value: unknown, path = 'body'): string[] {
  const hits: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((v, i) => hits.push(...scanForSensitive(v, `${path}[${i}]`)));
  } else if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEYS.includes(k)) hits.push(`${path}.${k}`);
      hits.push(...scanForSensitive(v, `${path}.${k}`));
    }
  }
  return hits;
}

function buildApp(): { app: Express; users: MemoryUserRepository } {
  const users = new MemoryUserRepository();
  const app = createApp({ users, refreshStore: new MemoryRefreshStore() });
  return { app, users };
}

async function registerLogin(app: Express, email = 'naledi.dlamini@example.co.za') {
  await request(app).post('/api/v1/auth/register').send({
    email,
    password: 'Str0ngPassw0rd!',
    phone: '+27825550101',
  });
  const login = await request(app).post('/api/v1/auth/login').send({
    email,
    password: 'Str0ngPassw0rd!',
  });
  assert.equal(login.status, 200);
  return login.body.data as { user: Record<string, unknown>; accessToken: string; refreshToken: string };
}

describe('POST /api/v1/auth/register', () => {
  let app: Express;
  let users: MemoryUserRepository;
  beforeEach(() => {
    ({ app, users } = buildApp());
  });

  it('registers a user with default CUSTOMER role (201, standard envelope)', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'Thandi.Mokoena@Example.co.za',
      password: 'Str0ngPassw0rd!',
      phone: '+27825550102',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.user.email, 'thandi.mokoena@example.co.za');
    assert.deepEqual(res.body.data.user.roles, ['CUSTOMER']);
    assert.equal(res.body.data.user.status, 'PENDING');
    // Newly self-registered users start as PENDING (registered but unverified).
    const stored = await users.findByEmail('thandi.mokoena@example.co.za');
    assert.ok(stored);
    assert.equal(stored.status, 'PENDING');
  });

  it('normalises email (trim + lowercase) and accepts a valid self-register role', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: '  SIPHO.Ndhlovu@Example.CO.ZA ',
      password: 'Str0ngPassw0rd!',
      role: 'professional',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.user.email, 'sipho.ndhlovu@example.co.za');
    assert.deepEqual(res.body.data.user.roles, ['PROFESSIONAL']);
  });

  it('rejects duplicate email with 409 (case-insensitive)', async () => {
    const payload = { email: 'duplicate@example.co.za', password: 'Str0ngPassw0rd!' };
    assert.equal((await request(app).post('/api/v1/auth/register').send(payload)).status, 201);
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'DUPLICATE@example.co.za',
      password: 'AnotherPass1!',
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'EMAIL_EXISTS');
  });

  it('rejects invalid email format with 422', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'not-an-email',
      password: 'Str0ngPassw0rd!',
    });
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('rejects missing/short passwords with 422', async () => {
    for (const body of [
      { email: 'a@example.co.za' },
      { email: 'a@example.co.za', password: 'short' },
      { email: '', password: 'Str0ngPassw0rd!' },
    ]) {
      const res = await request(app).post('/api/v1/auth/register').send(body);
      assert.equal(res.status, 422, JSON.stringify(body));
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
  });

  it('forbids self-registration of ADMIN / TECHNICIAN / BUSINESS_MANAGER (403)', async () => {
    for (const role of ['ADMIN', 'TECHNICIAN', 'BUSINESS_MANAGER']) {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: `${role.toLowerCase()}@example.co.za`,
        password: 'Str0ngPassw0rd!',
        role,
      });
      assert.equal(res.status, 403, role);
      assert.equal(res.body.error.code, 'FORBIDDEN_ROLE');
    }
    // Nothing was persisted for forbidden roles.
    assert.equal(await users.findByEmail('admin@example.co.za'), null);
  });

  it('stores a bcrypt hash — never the plaintext password', async () => {
    const password = 'Sup3rSecretPw!';
    await request(app).post('/api/v1/auth/register').send({ email: 'hashcheck@example.co.za', password });
    const stored = await users.findByEmail('hashcheck@example.co.za');
    assert.ok(stored);
    assert.notEqual(stored.passwordHash, password);
    assert.match(stored.passwordHash, /^\$2[aby]\$/);
    assert.equal(await verifyPassword(password, stored.passwordHash), true);
    assert.equal(await verifyPassword('wrong-password', stored.passwordHash), false);
  });
});

describe('POST /api/v1/auth/login', () => {
  let app: Express;
  beforeEach(() => {
    ({ app } = buildApp());
  });

  it('logs in with valid credentials (access + refresh tokens, safe user)', async () => {
    await request(app).post('/api/v1/auth/register').send({
      email: 'login.user@example.co.za',
      password: 'Str0ngPassw0rd!',
    });
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'LOGIN.USER@example.co.za',
      password: 'Str0ngPassw0rd!',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(typeof res.body.data.accessToken, 'string');
    assert.equal(typeof res.body.data.refreshToken, 'string');
    assert.equal(res.body.data.user.email, 'login.user@example.co.za');
  });

  it('returns a generic 401 for wrong password and unknown email alike', async () => {
    await request(app).post('/api/v1/auth/register').send({
      email: 'real.user@example.co.za',
      password: 'Str0ngPassw0rd!',
    });
    const wrongPw = await request(app).post('/api/v1/auth/login').send({
      email: 'real.user@example.co.za',
      password: 'WrongPassword1!',
    });
    const unknown = await request(app).post('/api/v1/auth/login').send({
      email: 'nobody-here@example.co.za',
      password: 'WhateverPass1!',
    });
    for (const res of [wrongPw, unknown]) {
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
      assert.equal(res.body.error.message, 'Invalid email or password.');
    }
  });

  it('rejects malformed login bodies with 422', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'x@example.co.za' });
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });
});

describe('protected routes + GET /api/v1/auth/me', () => {
  let app: Express;
  beforeEach(() => {
    ({ app } = buildApp());
  });

  it('rejects /me without a token (401)', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  it('rejects /me with a garbage token (401)', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer not-a-real-token');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  it('rejects /me with an expired token (401)', async () => {
    const expired = signAccessToken({ sub: '999', email: 'ghost@example.co.za', roles: ['CUSTOMER'] }, -10);
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${expired}`);
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  it('returns the authenticated user with valid token (200)', async () => {
    const { accessToken } = await registerLogin(app);
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.user.email, 'naledi.dlamini@example.co.za');
    assert.deepEqual(res.body.data.user.roles, ['CUSTOMER']);
  });
});

describe('POST /api/v1/auth/refresh + POST /api/v1/auth/logout', () => {
  let app: Express;
  beforeEach(() => {
    ({ app } = buildApp());
  });

  it('rotates the refresh token (new pair works, old refresh token is dead)', async () => {
    const first = await registerLogin(app, 'rotate@example.co.za');
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken });
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.data.accessToken, 'string');
    assert.equal(typeof res.body.data.refreshToken, 'string');
    assert.notEqual(res.body.data.refreshToken, first.refreshToken);

    const replay = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken });
    assert.equal(replay.status, 401);
    assert.equal(replay.body.error.code, 'INVALID_REFRESH_TOKEN');

    // The rotated access token is usable.
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${res.body.data.accessToken}`);
    assert.equal(me.status, 200);
  });

  it('rejects unknown refresh tokens with 401', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: 'deadbeef'.repeat(16) });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'INVALID_REFRESH_TOKEN');
  });

  it('logout invalidates the refresh token (refresh-after-logout fails)', async () => {
    const { refreshToken } = await registerLogin(app, 'logout@example.co.za');
    const out = await request(app).post('/api/v1/auth/logout').send({ refreshToken });
    assert.equal(out.status, 200);
    assert.equal(out.body.success, true);

    const after = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    assert.equal(after.status, 401);
    assert.equal(after.body.error.code, 'INVALID_REFRESH_TOKEN');
  });

  it('logout without any credential is 401', async () => {
    const res = await request(app).post('/api/v1/auth/logout').send({});
    assert.equal(res.status, 401);
  });
});

describe('sensitive data is never returned', () => {
  let app: Express;
  beforeEach(() => {
    ({ app } = buildApp());
  });

  it('no response contains password / hash material', async () => {
    const bodies: unknown[] = [];
    bodies.push((await request(app).post('/api/v1/auth/register').send({
      email: 'leak.check@example.co.za', password: 'Str0ngPassw0rd!',
    })).body);
    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'leak.check@example.co.za', password: 'Str0ngPassw0rd!',
    });
    bodies.push(login.body);
    const { accessToken, refreshToken } = login.body.data;
    bodies.push((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`)).body);
    bodies.push((await request(app).post('/api/v1/auth/refresh').send({ refreshToken })).body);
    bodies.push((await request(app).post('/api/v1/auth/logout').send({ refreshToken })).body);

    for (const body of bodies) {
      assert.deepEqual(scanForSensitive(body), []);
    }
    // And the raw JSON contains no suspicious substrings either.
    assert.ok(!JSON.stringify(bodies).toLowerCase().includes('password_hash'));
  });
});
