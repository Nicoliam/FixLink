/**
 * FixLink Stage 8 — in-app notifications tests.
 *
 * Run: npm test (no MySQL required — in-memory notifications store with
 * the same recipient-isolation rules as the MySQL implementation).
 *
 * Covers: notification creation, recipient isolation, listing,
 * unread-only filtering, pagination, unread count, single mark-read,
 * mark-all-read, foreign access (404), the marketplace events
 * (JOB_REQUEST, QUOTE_RECEIVED, QUOTE_ACCEPTED, JOB_SCHEDULED,
 * JOB_STARTED, JOB_COMPLETED, JOB_CONFIRMED), the business events
 * (TECHNICIAN_ASSIGNED/REASSIGNED, JOB_STARTED, JOB_UPDATE,
 * WORK_DOCUMENTED, PARTS_REQUESTED/APPROVED/REJECTED/MORE_INFO/
 * AVAILABLE, technician respond, internal JOB_COMPLETED),
 * cross-business isolation, customer/internal separation, actor
 * exclusion, single-delivery on parts fulfilment, and the guarantee
 * that a notification failure never breaks the core operation.
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
import { MemoryQuotesStore } from '../src/modules/quotes/memory-quotes.store';
import { MemoryExecutionStore } from '../src/modules/execution/memory-execution.store';
import { MemoryBusinessStore } from '../src/modules/business/memory-business.store';
import { MemoryNotificationsStore } from '../src/modules/notifications/memory-notifications.store';
import type { NotificationStore } from '../src/modules/notifications/notifications.store';
import type { NotificationDto } from '../src/modules/notifications/notifications.types';
import { PartsRequestEventBus } from '../src/modules/business/parts-request-events';
import { LocalFileStorage } from '../src/services/file-storage';
import { hashPassword } from '../src/utils/password';

interface TestContext {
  app: Express;
  users: MemoryUserRepository;
  jobs: MemoryJobsStore;
  quotes: MemoryQuotesStore;
  business: MemoryBusinessStore;
  events: PartsRequestEventBus;
  notifications: MemoryNotificationsStore;
}

function buildApp(notifications?: NotificationStore): TestContext {
  const users = new MemoryUserRepository();
  const jobs = new MemoryJobsStore();
  const quotes = new MemoryQuotesStore(jobs);
  const business = new MemoryBusinessStore();
  const storage = new LocalFileStorage(mkdtempSync(join(tmpdir(), 'fixlink-8-')));
  const events = new PartsRequestEventBus();
  const store = notifications ?? new MemoryNotificationsStore();
  const app = createApp({
    users,
    refreshStore: new MemoryRefreshStore(),
    marketplace: new MemoryMarketplaceStore(),
    jobs,
    quotes,
    execution: new MemoryExecutionStore(jobs, quotes),
    business,
    storage,
    events,
    notifications: store,
  });
  return {
    app,
    users,
    jobs,
    quotes,
    business,
    events,
    notifications: store instanceof MemoryNotificationsStore ? store : new MemoryNotificationsStore(),
  };
}

const PASSWORD = 'Str0ngPassw0rd!';
const FUTURE_SLOT = '2026-10-05T10:00:00+02:00';

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

let seq = 0;
function uniqueEmail(prefix: string): string {
  seq += 1;
  return `${prefix}.${seq}@example.co.za`;
}

// ------------------------------------------------------------------
// Marketplace helpers
// ------------------------------------------------------------------

async function createMarketplaceJob(
  ctx: TestContext,
  customerToken: string,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const res = await request(ctx.app)
    .post('/api/v1/jobs')
    .set('Authorization', `Bearer ${customerToken}`)
    .send({
      providerId: 'professional-1',
      serviceId: '1',
      description: 'Kitchen mixer tap leaking at the base and the cupboard floor is damp.',
      location: 'Fourways, Johannesburg',
      ...overrides,
    });
  assert.equal(res.status, 201, `job creation failed: ${JSON.stringify(res.body)}`);
  return res.body.data as Record<string, unknown>;
}

async function setupMarketplace(ctx: TestContext): Promise<{
  customerToken: string;
  customerId: string;
  proToken: string;
  proId: string;
}> {
  const customer = await provisionUser(ctx, uniqueEmail('cust.notif'), ['CUSTOMER']);
  const pro = await provisionUser(ctx, uniqueEmail('pro.notif'), ['PROFESSIONAL']);
  ctx.quotes.linkProfessionalProfile(pro.userId, '1');
  return { customerToken: customer.token, customerId: customer.userId, proToken: pro.token, proId: pro.userId };
}

/** Customer requests → provider quotes → customer accepts (ACCEPTED). */
async function createAcceptedJob(
  ctx: TestContext,
  customerToken: string,
  proToken: string,
): Promise<{ jobId: string; quoteId: string }> {
  const job = await createMarketplaceJob(ctx, customerToken);
  const jobId = job['id'] as string;
  const quoted = await request(ctx.app)
    .post(`/api/v1/jobs/${jobId}/quotes`)
    .set('Authorization', `Bearer ${proToken}`)
    .send({ total: 1250, currency: 'ZAR', message: 'Supply and install replacement mixer.' });
  assert.equal(quoted.status, 201, `quote failed: ${JSON.stringify(quoted.body)}`);
  const quoteId = (quoted.body.data as { id: string }).id;
  const accepted = await request(ctx.app)
    .post(`/api/v1/jobs/${jobId}/quotes/${quoteId}/accept`)
    .set('Authorization', `Bearer ${customerToken}`)
    .send({});
  assert.equal(accepted.status, 200, `accept failed: ${JSON.stringify(accepted.body)}`);
  return { jobId, quoteId };
}

// ------------------------------------------------------------------
// Business helpers
// ------------------------------------------------------------------

async function setupBusinesses(ctx: TestContext): Promise<{
  ownerToken: string;
  ownerId: string;
  managerToken: string;
  managerId: string;
  ownerBToken: string;
}> {
  const owner = await provisionUser(ctx, uniqueEmail('owner.notif'), ['BUSINESS_OWNER']);
  const business = ctx.business.seedBusiness({
    ownerUserId: owner.userId,
    businessName: 'Ubuntu Plumbing Co.',
    slug: `ubuntu-plumbing-notif-${seq}`,
  });
  const manager = await provisionUser(ctx, uniqueEmail('manager.notif'), ['BUSINESS_MANAGER']);
  ctx.business.addMembership(business.id, manager.userId, 'BUSINESS_MANAGER');
  const ownerB = await provisionUser(ctx, uniqueEmail('ownerb.notif'), ['BUSINESS_OWNER']);
  ctx.business.seedBusiness({
    ownerUserId: ownerB.userId,
    businessName: 'Cape Spark Electrical',
    slug: `cape-spark-notif-${seq}`,
  });
  return {
    ownerToken: owner.token,
    ownerId: owner.userId,
    managerToken: manager.token,
    managerId: manager.userId,
    ownerBToken: ownerB.token,
  };
}

async function createBusinessCustomer(ctx: TestContext, token: string): Promise<Record<string, unknown>> {
  const res = await request(ctx.app)
    .post('/api/v1/business/customers')
    .set('Authorization', `Bearer ${token}`)
    .send({ firstName: 'Naledi', lastName: 'Dlamini', email: uniqueEmail('naledi.notif'), phone: '+27825550111' });
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
  const address = uniqueEmail('tech.notif');
  const invite = await request(ctx.app)
    .post('/api/v1/business/technicians')
    .set('Authorization', `Bearer ${token}`)
    .send({ displayName: 'Tech Notif', email: address, password: 'TechPass123!' });
  assert.equal(invite.status, 201, `technician invite failed: ${JSON.stringify(invite.body)}`);
  const login = await request(ctx.app).post('/api/v1/auth/login').send({ email: address, password: 'TechPass123!' });
  assert.equal(login.status, 200);
  return {
    technician: invite.body.data as Record<string, unknown>,
    token: login.body.data.accessToken as string,
    userId: login.body.data.user.id as string,
  };
}

interface WorkingJob {
  jobId: string;
  techToken: string;
  techId: string;
}

async function createStartedJob(ctx: TestContext, ownerToken: string): Promise<WorkingJob> {
  const customer = await createBusinessCustomer(ctx, ownerToken);
  const job = await createInternalJob(ctx, ownerToken, customer['id'] as string);
  const tech = await inviteTechnician(ctx, ownerToken);
  const jobId = job['id'] as string;
  const assigned = await request(ctx.app)
    .post(`/api/v1/business/jobs/${jobId}/assign`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ technicianId: tech.technician['id'] });
  assert.equal(assigned.status, 200, `assignment failed: ${JSON.stringify(assigned.body)}`);
  const started = await request(ctx.app)
    .post(`/api/v1/technician/jobs/${jobId}/start`)
    .set('Authorization', `Bearer ${tech.token}`)
    .send({});
  assert.equal(started.status, 200, `start failed: ${JSON.stringify(started.body)}`);
  return { jobId, techToken: tech.token, techId: tech.technician['id'] as string };
}

function pngBuffer(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03]);
}

// ------------------------------------------------------------------
// Notification API helpers
// ------------------------------------------------------------------

interface NotificationList {
  items: NotificationDto[];
  total: number;
  page: number;
  pageSize: number;
}

async function listNotifications(ctx: TestContext, token: string, qs = ''): Promise<{ status: number; body: NotificationList }> {
  const res = await request(ctx.app).get(`/api/v1/notifications${qs}`).set('Authorization', `Bearer ${token}`);
  return { status: res.status, body: res.body.data as NotificationList };
}

async function unreadCount(ctx: TestContext, token: string): Promise<number> {
  const res = await request(ctx.app).get('/api/v1/notifications/unread-count').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200, `unread-count failed: ${JSON.stringify(res.body)}`);
  return (res.body.data as { unreadCount: number }).unreadCount;
}

function types(items: NotificationDto[]): string[] {
  return items.map((item) => item.type);
}

// ==================================================================
// Inbox API: auth, shape, filtering, pagination, read behaviour
// ==================================================================

describe('Stage 8 — notification inbox API', () => {
  let ctx: TestContext;
  beforeEach(() => {
    ctx = buildApp();
  });

  it('1. unauthenticated requests are rejected (401)', async () => {
    assert.equal((await request(ctx.app).get('/api/v1/notifications')).status, 401);
    assert.equal((await request(ctx.app).get('/api/v1/notifications/unread-count')).status, 401);
    assert.equal((await request(ctx.app).post('/api/v1/notifications/1/read')).status, 401);
    assert.equal((await request(ctx.app).post('/api/v1/notifications/read-all')).status, 401);
  });

  it('2. a new user sees an empty list and a zero unread count', async () => {
    const user = await provisionUser(ctx, uniqueEmail('fresh.notif'), ['CUSTOMER']);
    const list = await listNotifications(ctx, user.token);
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.items, []);
    assert.equal(list.body.total, 0);
    assert.equal(await unreadCount(ctx, user.token), 0);
  });

  it('3. list items expose the documented shape', async () => {
    const setup = await setupMarketplace(ctx);
    await createMarketplaceJob(ctx, setup.customerToken);
    const list = await listNotifications(ctx, setup.proToken);
    assert.equal(list.status, 200);
    assert.equal(list.body.total, 1);
    const item = list.body.items[0] as NotificationDto;
    assert.match(item.id, /^[1-9][0-9]*$/);
    assert.equal(item.type, 'JOB_REQUEST');
    assert.ok(item.title.length > 0);
    assert.ok(typeof item.message === 'string' && item.message.length > 0);
    assert.match(item.relatedJobId as string, /^[1-9][0-9]*$/);
    assert.equal(item.relatedEntityType, 'JOB');
    assert.equal(item.relatedEntityId, item.relatedJobId);
    assert.equal(item.read, false);
    assert.equal(item.readAt, null);
    assert.ok(typeof item.createdAt === 'string');
  });

  it('4. unreadOnly filters read notifications', async () => {
    const setup = await setupMarketplace(ctx);
    await createMarketplaceJob(ctx, setup.customerToken);
    await createMarketplaceJob(ctx, setup.customerToken);
    const before = await listNotifications(ctx, setup.proToken);
    assert.equal(before.body.total, 2);
    const firstId = before.body.items[0]?.id as string;
    const marked = await request(ctx.app)
      .post(`/api/v1/notifications/${firstId}/read`)
      .set('Authorization', `Bearer ${setup.proToken}`);
    assert.equal(marked.status, 200);
    const unread = await listNotifications(ctx, setup.proToken, '?unreadOnly=true');
    assert.equal(unread.body.total, 1);
    assert.equal(unread.body.items[0]?.read, false);
    const all = await listNotifications(ctx, setup.proToken, '?unreadOnly=false');
    assert.equal(all.body.total, 2);
  });

  it('5. pagination pages newest-first', async () => {
    const setup = await setupMarketplace(ctx);
    await createMarketplaceJob(ctx, setup.customerToken);
    await createMarketplaceJob(ctx, setup.customerToken);
    await createMarketplaceJob(ctx, setup.customerToken);
    const page1 = await listNotifications(ctx, setup.proToken, '?page=1&pageSize=2');
    assert.equal(page1.body.total, 3);
    assert.equal(page1.body.items.length, 2);
    assert.equal(page1.body.page, 1);
    assert.equal(page1.body.pageSize, 2);
    const page2 = await listNotifications(ctx, setup.proToken, '?page=2&pageSize=2');
    assert.equal(page2.body.items.length, 1);
    const ids1 = page1.body.items.map((item) => item.id);
    const ids2 = page2.body.items.map((item) => item.id);
    assert.ok(!ids2.some((id) => ids1.includes(id)));
  });

  it('6. invalid pagination and filters are rejected (422)', async () => {
    const user = await provisionUser(ctx, uniqueEmail('paging.notif'), ['CUSTOMER']);
    for (const qs of ['?page=0', '?page=abc', '?pageSize=0', '?pageSize=51', '?unreadOnly=maybe']) {
      const res = await request(ctx.app).get(`/api/v1/notifications${qs}`).set('Authorization', `Bearer ${user.token}`);
      assert.equal(res.status, 422, `expected 422 for ${qs}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
  });

  it('7. mark single read updates state, count and is idempotent', async () => {
    const setup = await setupMarketplace(ctx);
    await createMarketplaceJob(ctx, setup.customerToken);
    assert.equal(await unreadCount(ctx, setup.proToken), 1);
    const list = await listNotifications(ctx, setup.proToken);
    const id = list.body.items[0]?.id as string;
    const first = await request(ctx.app).post(`/api/v1/notifications/${id}/read`).set('Authorization', `Bearer ${setup.proToken}`);
    assert.equal(first.status, 200);
    assert.equal((first.body.data as NotificationDto).read, true);
    assert.ok(typeof (first.body.data as NotificationDto).readAt === 'string');
    assert.equal(await unreadCount(ctx, setup.proToken), 0);
    const second = await request(ctx.app).post(`/api/v1/notifications/${id}/read`).set('Authorization', `Bearer ${setup.proToken}`);
    assert.equal(second.status, 200);
    assert.equal((second.body.data as NotificationDto).read, true);
  });

  it('8. mark read rejects invalid ids (400) and foreign ids (404)', async () => {
    const setup = await setupMarketplace(ctx);
    await createMarketplaceJob(ctx, setup.customerToken);
    const other = await provisionUser(ctx, uniqueEmail('other.notif'), ['CUSTOMER']);
    const list = await listNotifications(ctx, setup.proToken);
    const foreignId = list.body.items[0]?.id as string;
    for (const bad of ['abc', '0', '  ']) {
      const res = await request(ctx.app).post(`/api/v1/notifications/${bad}/read`).set('Authorization', `Bearer ${setup.proToken}`);
      assert.equal(res.status, 400, `expected 400 for ${bad}`);
    }
    const foreign = await request(ctx.app).post(`/api/v1/notifications/${foreignId}/read`).set('Authorization', `Bearer ${other.token}`);
    assert.equal(foreign.status, 404);
    assert.equal(foreign.body.error.code, 'NOT_FOUND');
    const missing = await request(ctx.app).post('/api/v1/notifications/99999/read').set('Authorization', `Bearer ${setup.proToken}`);
    assert.equal(missing.status, 404);
  });

  it('9. mark all read zeroes the unread count', async () => {
    const setup = await setupMarketplace(ctx);
    await createMarketplaceJob(ctx, setup.customerToken);
    await createMarketplaceJob(ctx, setup.customerToken);
    assert.equal(await unreadCount(ctx, setup.proToken), 2);
    const res = await request(ctx.app).post('/api/v1/notifications/read-all').set('Authorization', `Bearer ${setup.proToken}`);
    assert.equal(res.status, 200);
    assert.equal((res.body.data as { markedRead: number }).markedRead, 2);
    assert.equal(await unreadCount(ctx, setup.proToken), 0);
    const again = await request(ctx.app).post('/api/v1/notifications/read-all').set('Authorization', `Bearer ${setup.proToken}`);
    assert.equal((again.body.data as { markedRead: number }).markedRead, 0);
  });

  it('10. recipient isolation: providers only see their own notifications', async () => {
    const setup = await setupMarketplace(ctx);
    const proB = await provisionUser(ctx, uniqueEmail('prob.notif'), ['PROFESSIONAL']);
    ctx.quotes.linkProfessionalProfile(proB.userId, '2');
    await createMarketplaceJob(ctx, setup.customerToken, { providerId: 'professional-1' });
    const listA = await listNotifications(ctx, setup.proToken);
    assert.equal(listA.body.total, 1);
    const listB = await listNotifications(ctx, proB.token);
    assert.equal(listB.body.total, 0);
    assert.equal(await unreadCount(ctx, proB.token), 0);
  });

  it('11. userId query parameters never leak another inbox', async () => {
    const setup = await setupMarketplace(ctx);
    await createMarketplaceJob(ctx, setup.customerToken);
    // Any ownership-looking parameter is ignored: the session owns the inbox.
    const res = await request(ctx.app)
      .get(`/api/v1/notifications?userId=${setup.customerToken}`)
      .set('Authorization', `Bearer ${setup.proToken}`);
    assert.equal(res.status, 200);
    assert.equal((res.body.data as NotificationList).total, 1);
  });
});

// ==================================================================
// Marketplace events
// ==================================================================

describe('Stage 8 — marketplace notification events', () => {
  let ctx: TestContext;
  beforeEach(() => {
    ctx = buildApp();
  });

  it('12. customer job request notifies the selected provider (JOB_REQUEST)', async () => {
    const setup = await setupMarketplace(ctx);
    const job = await createMarketplaceJob(ctx, setup.customerToken);
    const list = await listNotifications(ctx, setup.proToken);
    assert.equal(list.body.total, 1);
    const item = list.body.items[0] as NotificationDto;
    assert.equal(item.type, 'JOB_REQUEST');
    assert.equal(item.relatedJobId, job['id']);
    assert.equal(item.relatedEntityType, 'JOB');
    // The customer is not notified of their own request.
    assert.equal((await listNotifications(ctx, setup.customerToken)).body.total, 0);
  });

  it('13. business providers notify owner and manager (JOB_REQUEST)', async () => {
    const customer = await provisionUser(ctx, uniqueEmail('bizcust.notif'), ['CUSTOMER']);
    const owner = await provisionUser(ctx, uniqueEmail('bizowner.notif'), ['BUSINESS_OWNER']);
    const business = ctx.business.seedBusiness({
      ownerUserId: owner.userId,
      businessName: 'Ubuntu Plumbing Co.',
      slug: `ubuntu-req-${seq}`,
    });
    const manager = await provisionUser(ctx, uniqueEmail('bizmanager.notif'), ['BUSINESS_MANAGER']);
    ctx.business.addMembership(business.id, manager.userId, 'BUSINESS_MANAGER');
    ctx.quotes.addBusinessMembership(owner.userId, '1', 'OWNER');
    ctx.quotes.addBusinessMembership(manager.userId, '1', 'MANAGER');
    const job = await createMarketplaceJob(ctx, customer.token, { providerId: 'business-1' });
    for (const token of [owner.token, manager.token]) {
      const list = await listNotifications(ctx, token);
      assert.equal(list.body.total, 1, `expected 1 notification: ${JSON.stringify(list.body)}`);
      assert.equal(list.body.items[0]?.type, 'JOB_REQUEST');
      assert.equal(list.body.items[0]?.relatedJobId, job['id']);
    }
  });

  it('14. provider quote notifies the customer (QUOTE_RECEIVED)', async () => {
    const setup = await setupMarketplace(ctx);
    const job = await createMarketplaceJob(ctx, setup.customerToken);
    const quoted = await request(ctx.app)
      .post(`/api/v1/jobs/${job['id']}/quotes`)
      .set('Authorization', `Bearer ${setup.proToken}`)
      .send({ total: 1250, currency: 'ZAR', message: 'Supply and install replacement mixer.' });
    assert.equal(quoted.status, 201);
    const list = await listNotifications(ctx, setup.customerToken);
    assert.equal(list.body.total, 1);
    assert.equal(list.body.items[0]?.type, 'QUOTE_RECEIVED');
    assert.equal(list.body.items[0]?.relatedJobId, job['id']);
    assert.match(list.body.items[0]?.message as string, /1250/);
  });

  it('15. customer acceptance notifies the provider (QUOTE_ACCEPTED)', async () => {
    const setup = await setupMarketplace(ctx);
    const accepted = await createAcceptedJob(ctx, setup.customerToken, setup.proToken);
    const list = await listNotifications(ctx, setup.proToken);
    assert.deepEqual(types(list.body.items), ['QUOTE_ACCEPTED', 'JOB_REQUEST']);
    assert.equal(list.body.items[0]?.relatedJobId, accepted.jobId);
  });

  it('16. provider scheduling notifies the customer but not the acting provider (JOB_SCHEDULED)', async () => {
    const setup = await setupMarketplace(ctx);
    const accepted = await createAcceptedJob(ctx, setup.customerToken, setup.proToken);
    const scheduled = await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/schedule`)
      .set('Authorization', `Bearer ${setup.proToken}`)
      .send({ scheduledAt: FUTURE_SLOT });
    assert.equal(scheduled.status, 200, `schedule failed: ${JSON.stringify(scheduled.body)}`);
    const customerList = await listNotifications(ctx, setup.customerToken);
    assert.ok(types(customerList.body.items).includes('JOB_SCHEDULED'));
    const proList = await listNotifications(ctx, setup.proToken);
    assert.ok(!types(proList.body.items).includes('JOB_SCHEDULED'));
  });

  it('17. provider start notifies the customer (JOB_STARTED)', async () => {
    const setup = await setupMarketplace(ctx);
    const accepted = await createAcceptedJob(ctx, setup.customerToken, setup.proToken);
    await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/schedule`)
      .set('Authorization', `Bearer ${setup.proToken}`)
      .send({ scheduledAt: FUTURE_SLOT });
    const started = await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/start`)
      .set('Authorization', `Bearer ${setup.proToken}`)
      .send({});
    assert.equal(started.status, 200);
    const customerList = await listNotifications(ctx, setup.customerToken);
    assert.ok(types(customerList.body.items).includes('JOB_STARTED'));
  });

  it('18. provider completion notifies the customer (JOB_COMPLETED)', async () => {
    const setup = await setupMarketplace(ctx);
    const accepted = await createAcceptedJob(ctx, setup.customerToken, setup.proToken);
    await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/schedule`)
      .set('Authorization', `Bearer ${setup.proToken}`)
      .send({ scheduledAt: FUTURE_SLOT });
    await request(ctx.app).post(`/api/v1/jobs/${accepted.jobId}/start`).set('Authorization', `Bearer ${setup.proToken}`).send({});
    const completed = await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/complete`)
      .set('Authorization', `Bearer ${setup.proToken}`)
      .send({ note: 'Mixer replaced and tested with no leaks.' });
    assert.equal(completed.status, 200, `complete failed: ${JSON.stringify(completed.body)}`);
    const customerList = await listNotifications(ctx, setup.customerToken);
    assert.ok(types(customerList.body.items).includes('JOB_COMPLETED'));
  });

  it('19. customer confirmation notifies the provider (JOB_CONFIRMED)', async () => {
    const setup = await setupMarketplace(ctx);
    const accepted = await createAcceptedJob(ctx, setup.customerToken, setup.proToken);
    await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/schedule`)
      .set('Authorization', `Bearer ${setup.proToken}`)
      .send({ scheduledAt: FUTURE_SLOT });
    await request(ctx.app).post(`/api/v1/jobs/${accepted.jobId}/start`).set('Authorization', `Bearer ${setup.proToken}`).send({});
    await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/complete`)
      .set('Authorization', `Bearer ${setup.proToken}`)
      .send({ note: 'Mixer replaced and tested with no leaks.' });
    const confirmed = await request(ctx.app)
      .post(`/api/v1/jobs/${accepted.jobId}/confirm`)
      .set('Authorization', `Bearer ${setup.customerToken}`)
      .send({});
    assert.equal(confirmed.status, 200, `confirm failed: ${JSON.stringify(confirmed.body)}`);
    const proList = await listNotifications(ctx, setup.proToken);
    assert.ok(types(proList.body.items).includes('JOB_CONFIRMED'));
    // The confirming customer is not notified of their own confirmation.
    const customerList = await listNotifications(ctx, setup.customerToken);
    assert.ok(!types(customerList.body.items).includes('JOB_CONFIRMED'));
  });
});

// ==================================================================
// Business workflow events
// ==================================================================

describe('Stage 8 — business workflow notification events', () => {
  let ctx: TestContext;
  beforeEach(() => {
    ctx = buildApp();
  });

  it('20. assignment notifies the technician (TECHNICIAN_ASSIGNED)', async () => {
    const tokens = await setupBusinesses(ctx);
    const customer = await createBusinessCustomer(ctx, tokens.ownerToken);
    const job = await createInternalJob(ctx, tokens.ownerToken, customer['id'] as string);
    const tech = await inviteTechnician(ctx, tokens.ownerToken);
    const assigned = await request(ctx.app)
      .post(`/api/v1/business/jobs/${job['id']}/assign`)
      .set('Authorization', `Bearer ${tokens.ownerToken}`)
      .send({ technicianId: tech.technician['id'] });
    assert.equal(assigned.status, 200);
    const list = await listNotifications(ctx, tech.token);
    assert.equal(list.body.total, 1);
    assert.equal(list.body.items[0]?.type, 'TECHNICIAN_ASSIGNED');
    assert.equal(list.body.items[0]?.relatedJobId, job['id']);
    assert.equal(list.body.items[0]?.relatedEntityType, 'INTERNAL_JOB');
  });

  it('21. reassignment notifies only the newly assigned technician (TECHNICIAN_REASSIGNED)', async () => {
    const tokens = await setupBusinesses(ctx);
    const customer = await createBusinessCustomer(ctx, tokens.ownerToken);
    const job = await createInternalJob(ctx, tokens.ownerToken, customer['id'] as string);
    const techA = await inviteTechnician(ctx, tokens.ownerToken);
    const techB = await inviteTechnician(ctx, tokens.ownerToken);
    const jobId = job['id'] as string;
    await request(ctx.app)
      .post(`/api/v1/business/jobs/${jobId}/assign`)
      .set('Authorization', `Bearer ${tokens.ownerToken}`)
      .send({ technicianId: techA.technician['id'] });
    const reassigned = await request(ctx.app)
      .post(`/api/v1/business/jobs/${jobId}/assign`)
      .set('Authorization', `Bearer ${tokens.ownerToken}`)
      .send({ technicianId: techB.technician['id'] });
    assert.equal(reassigned.status, 200);
    const listA = await listNotifications(ctx, techA.token);
    assert.deepEqual(types(listA.body.items), ['TECHNICIAN_ASSIGNED']);
    const listB = await listNotifications(ctx, techB.token);
    assert.deepEqual(types(listB.body.items), ['TECHNICIAN_REASSIGNED']);
  });

  it('22. technician start notifies owners and managers (JOB_STARTED)', async () => {
    const tokens = await setupBusinesses(ctx);
    const working = await createStartedJob(ctx, tokens.ownerToken);
    for (const token of [tokens.ownerToken, tokens.managerToken]) {
      const list = await listNotifications(ctx, token);
      assert.deepEqual(types(list.body.items), ['JOB_STARTED']);
      assert.equal(list.body.items[0]?.relatedEntityType, 'INTERNAL_JOB');
      assert.equal(list.body.items[0]?.relatedJobId, working.jobId);
    }
  });

  it('23. technician update notifies owners and managers (JOB_UPDATE)', async () => {
    const tokens = await setupBusinesses(ctx);
    const working = await createStartedJob(ctx, tokens.ownerToken);
    const created = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/updates`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send({ phase: 'DURING', note: 'Old geyser drained and isolated; new valve fitted.' });
    assert.equal(created.status, 201, `update failed: ${JSON.stringify(created.body)}`);
    for (const token of [tokens.ownerToken, tokens.managerToken]) {
      const list = await listNotifications(ctx, token);
      assert.ok(types(list.body.items).includes('JOB_UPDATE'));
    }
  });

  it('24. work photos notify owners and managers (WORK_DOCUMENTED)', async () => {
    const tokens = await setupBusinesses(ctx);
    const working = await createStartedJob(ctx, tokens.ownerToken);
    const uploaded = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/images`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .field('phase', 'BEFORE')
      .attach('image', pngBuffer(), { filename: 'before.png', contentType: 'image/png' });
    assert.equal(uploaded.status, 201, `upload failed: ${JSON.stringify(uploaded.body)}`);
    for (const token of [tokens.ownerToken, tokens.managerToken]) {
      const list = await listNotifications(ctx, token);
      assert.ok(types(list.body.items).includes('WORK_DOCUMENTED'));
    }
  });

  it('25. parts request notifies owners and managers (PARTS_REQUESTED)', async () => {
    const tokens = await setupBusinesses(ctx);
    const working = await createStartedJob(ctx, tokens.ownerToken);
    const created = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/parts`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send({ partName: 'Pressure valve', quantity: 1, reason: 'Required to complete the repair safely and test the system.' });
    assert.equal(created.status, 201, `parts request failed: ${JSON.stringify(created.body)}`);
    for (const token of [tokens.ownerToken, tokens.managerToken]) {
      const list = await listNotifications(ctx, token);
      assert.ok(types(list.body.items).includes('PARTS_REQUESTED'));
    }
  });

  it('26. approval notifies the technician (PARTS_APPROVED)', async () => {
    const tokens = await setupBusinesses(ctx);
    const working = await createStartedJob(ctx, tokens.ownerToken);
    const created = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/parts`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send({ partName: 'Pressure valve', quantity: 1, reason: 'Required to complete the repair safely and test the system.' });
    const approved = await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created.body.data.id}/approve`)
      .set('Authorization', `Bearer ${tokens.ownerToken}`)
      .send({ comment: 'Genuine part required — approved.' });
    assert.equal(approved.status, 200);
    const techList = await listNotifications(ctx, working.techToken);
    assert.ok(types(techList.body.items).includes('PARTS_APPROVED'));
    // The deciding manager is not notified of their own decision.
    const ownerList = await listNotifications(ctx, tokens.ownerToken);
    assert.ok(!types(ownerList.body.items).includes('PARTS_APPROVED'));
  });

  it('27. rejection notifies the technician (PARTS_REJECTED)', async () => {
    const tokens = await setupBusinesses(ctx);
    const working = await createStartedJob(ctx, tokens.ownerToken);
    const created = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/parts`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send({ partName: 'Pressure valve', quantity: 1, reason: 'Required to complete the repair safely and test the system.' });
    const rejected = await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created.body.data.id}/reject`)
      .set('Authorization', `Bearer ${tokens.managerToken}`)
      .send({ reason: 'We already stock this part in the van.' });
    assert.equal(rejected.status, 200);
    const techList = await listNotifications(ctx, working.techToken);
    assert.ok(types(techList.body.items).includes('PARTS_REJECTED'));
  });

  it('28. more-info request notifies the technician (PARTS_MORE_INFO)', async () => {
    const tokens = await setupBusinesses(ctx);
    const working = await createStartedJob(ctx, tokens.ownerToken);
    const created = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/parts`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send({ partName: 'Pressure valve', quantity: 1, reason: 'Required to complete the repair safely and test the system.' });
    const info = await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created.body.data.id}/request-info`)
      .set('Authorization', `Bearer ${tokens.ownerToken}`)
      .send({ comment: 'Which brand and specification do you need?' });
    assert.equal(info.status, 200);
    const techList = await listNotifications(ctx, working.techToken);
    assert.ok(types(techList.body.items).includes('PARTS_MORE_INFO'));
  });

  it('29. parts available notifies the technician exactly once (PARTS_AVAILABLE)', async () => {
    const tokens = await setupBusinesses(ctx);
    const working = await createStartedJob(ctx, tokens.ownerToken);
    const created = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/parts`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send({ partName: 'Pressure valve', quantity: 1, reason: 'Required to complete the repair safely and test the system.' });
    await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created.body.data.id}/approve`)
      .set('Authorization', `Bearer ${tokens.ownerToken}`)
      .send({ comment: 'Approved.' });
    const before = (await listNotifications(ctx, working.techToken)).body.total;
    const available = await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created.body.data.id}/available`)
      .set('Authorization', `Bearer ${tokens.ownerToken}`)
      .send({});
    assert.equal(available.status, 200, `available failed: ${JSON.stringify(available.body)}`);
    const techList = await listNotifications(ctx, working.techToken);
    assert.equal(techList.body.total, before + 1, `expected exactly one new notification: ${JSON.stringify(types(techList.body.items))}`);
    assert.ok(types(techList.body.items).includes('PARTS_AVAILABLE'));
  });

  it('30. technician response notifies owners and managers (PARTS_REQUESTED)', async () => {
    const tokens = await setupBusinesses(ctx);
    const working = await createStartedJob(ctx, tokens.ownerToken);
    const created = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/parts`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send({ partName: 'Pressure valve', quantity: 1, reason: 'Required to complete the repair safely and test the system.' });
    await request(ctx.app)
      .post(`/api/v1/business/jobs/${working.jobId}/parts/${created.body.data.id}/request-info`)
      .set('Authorization', `Bearer ${tokens.ownerToken}`)
      .send({ comment: 'Which brand and specification do you need?' });
    const responded = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/parts/${created.body.data.id}/respond`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send({ note: 'Kwikot 400kPa valve.' });
    assert.equal(responded.status, 200);
    for (const token of [tokens.ownerToken, tokens.managerToken]) {
      const list = await listNotifications(ctx, token);
      assert.ok(types(list.body.items).filter((type) => type === 'PARTS_REQUESTED').length >= 2);
    }
  });

  it('31. internal completion notifies owners and managers (JOB_COMPLETED)', async () => {
    const tokens = await setupBusinesses(ctx);
    const working = await createStartedJob(ctx, tokens.ownerToken);
    const completed = await request(ctx.app)
      .post(`/api/v1/technician/jobs/${working.jobId}/complete`)
      .set('Authorization', `Bearer ${working.techToken}`)
      .send({ note: 'Valve replaced and pressure tested with no leaks.' });
    assert.equal(completed.status, 200, `complete failed: ${JSON.stringify(completed.body)}`);
    for (const token of [tokens.ownerToken, tokens.managerToken]) {
      const list = await listNotifications(ctx, token);
      assert.ok(types(list.body.items).includes('JOB_COMPLETED'));
    }
  });

  it('32. cross-business and customer/internal separation holds', async () => {
    const tokens = await setupBusinesses(ctx);
    const working = await createStartedJob(ctx, tokens.ownerToken);
    // The other business sees nothing from this business's workflow.
    assert.equal((await listNotifications(ctx, tokens.ownerBToken)).body.total, 0);
    // A marketplace customer never sees internal business notifications.
    const setup = await setupMarketplace(ctx);
    const customerList = await listNotifications(ctx, setup.customerToken);
    assert.ok(!customerList.body.items.some((item) => item.relatedEntityType === 'INTERNAL_JOB'));
    // Internal technicians never see marketplace notifications.
    const techList = await listNotifications(ctx, working.techToken);
    assert.ok(!techList.body.items.some((item) => item.relatedEntityType === 'JOB'));
  });

  it('33. a notification failure never breaks the core operation', async () => {
    const throwing: NotificationStore = {
      create: async () => {
        throw new Error('notification store unavailable');
      },
      listForUser: async () => ({ items: [], total: 0 }),
      countUnread: async () => 0,
      getById: async () => null,
      markRead: async () => null,
      markAllRead: async () => 0,
    };
    const failing = buildApp(throwing);
    const customer = await provisionUser(failing, uniqueEmail('resilient.notif'), ['CUSTOMER']);
    const pro = await provisionUser(failing, uniqueEmail('resilientpro.notif'), ['PROFESSIONAL']);
    failing.quotes.linkProfessionalProfile(pro.userId, '1');
    const job = await createMarketplaceJob(failing, customer.token);
    assert.ok(job['id']);
    const quoted = await request(failing.app)
      .post(`/api/v1/jobs/${job['id']}/quotes`)
      .set('Authorization', `Bearer ${pro.token}`)
      .send({ total: 900, currency: 'ZAR' });
    assert.equal(quoted.status, 201, `quote must succeed despite notification failure: ${JSON.stringify(quoted.body)}`);
  });
});
