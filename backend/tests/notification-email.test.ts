/**
 * Fixlynk Stage 13 — provider notification email tests.
 *
 * Run: npm test (no MySQL and no SMTP server required — the in-memory
 * notifications store plus a `MemoryMailer` that records what would have
 * been sent).
 *
 * Covers the behaviour the feature exists for: a provider who is not
 * signed in is emailed the job request with the details and a link back
 * into the app, and can then reply on the platform. Also covers the
 * boundaries that make this safe to ship: customers are never emailed,
 * the same event can be in-app for one party and email for another, the
 * email never carries customer contact details, customer text cannot
 * inject markup, a mail failure never fails the job request, delivery is
 * tracked, and a deployment with no mail configured sends nothing.
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
import { PartsRequestEventBus } from '../src/modules/business/parts-request-events';
import { LocalFileStorage } from '../src/services/file-storage';
import { LogMailer, MemoryMailer, type Mailer } from '../src/services/mailer';
import { isEmailRecipient, renderNotificationEmail } from '../src/services/notification-email';
import { env } from '../src/config/env';
import type { NotificationDto } from '../src/modules/notifications/notifications.types';
import { hashPassword } from '../src/utils/password';

const WEB_BASE_URL = 'https://app.example.co.za';

interface TestContext {
  app: Express;
  users: MemoryUserRepository;
  quotes: MemoryQuotesStore;
  business: MemoryBusinessStore;
  notifications: MemoryNotificationsStore;
  mailer: MemoryMailer;
}

function buildApp(mailer?: Mailer): TestContext {
  const users = new MemoryUserRepository();
  const jobs = new MemoryJobsStore();
  const quotes = new MemoryQuotesStore(jobs);
  const business = new MemoryBusinessStore();
  const notifications = new MemoryNotificationsStore();
  // One mailer instance for both the app and the assertions, so a test can
  // inspect (or break) exactly what the app attempted to send.
  const transport = mailer ?? new MemoryMailer();
  const app = createApp({
    users,
    refreshStore: new MemoryRefreshStore(),
    marketplace: new MemoryMarketplaceStore(),
    jobs,
    quotes,
    execution: new MemoryExecutionStore(jobs, quotes),
    business,
    storage: new LocalFileStorage(mkdtempSync(join(tmpdir(), 'fixlynk-13-'))),
    events: new PartsRequestEventBus(),
    notifications,
    mailer: transport,
  });
  return { app, users, quotes, business, notifications, mailer: transport as MemoryMailer };
}

const PASSWORD = 'Str0ngPassw0rd!';

let seq = 0;
function uniqueEmail(prefix: string): string {
  seq += 1;
  return `${prefix}.${seq}@example.co.za`;
}

async function provisionUser(
  ctx: TestContext,
  email: string,
  roles: string[],
): Promise<{ token: string; userId: string; email: string }> {
  const created = await ctx.users.create({ email, phone: null, passwordHash: await hashPassword(PASSWORD) });
  await ctx.users.setRoles(created.id, roles);
  await ctx.users.setStatus(created.id, 'ACTIVE');
  const login = await request(ctx.app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  assert.equal(login.status, 200, `login failed for ${email}: ${JSON.stringify(login.body)}`);
  return { token: login.body.data.accessToken as string, userId: login.body.data.user.id as string, email };
}

async function requestJob(
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

async function listNotifications(ctx: TestContext, token: string): Promise<{ total: number; items: NotificationDto[] }> {
  const res = await request(ctx.app).get('/api/v1/notifications').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200, `notification list failed: ${JSON.stringify(res.body)}`);
  return res.body.data as { total: number; items: NotificationDto[] };
}

describe('Stage 13 — the provider is emailed the job request', () => {
  let ctx: TestContext;
  beforeEach(() => {
    // `env` is read at import time, so the base URL is set per test rather
    // than through the environment, keeping the expected links explicit.
    env.webBaseUrl = WEB_BASE_URL;
    ctx = buildApp();
  });

  it('1. a customer job request emails the professional the details and an in-app link', async () => {
    const customer = await provisionUser(ctx, uniqueEmail('mailcust'), ['CUSTOMER']);
    const pro = await provisionUser(ctx, uniqueEmail('mailpro'), ['PROFESSIONAL']);
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    const job = await requestJob(ctx, customer.token, {
      preferredDate: '2026-10-05',
      preferredTime: '14:30',
    });

    const sent = ctx.mailer.sentTo(pro.email);
    assert.ok(sent, `expected an email to the professional, got ${ctx.mailer.sent.length} message(s)`);
    assert.match(sent.subject, /New job request/);
    // The provider must be able to judge the job from the email itself.
    assert.match(sent.text, new RegExp(job['reference'] as string));
    assert.match(sent.text, /Leak Repair/);
    assert.match(sent.text, /Fourways, Johannesburg/);
    assert.match(sent.text, /2026-10-05/);
    assert.match(sent.text, /14:30/);
    assert.match(sent.text, /mixer tap leaking/);
    // ...and act on it in the app, where the reply is recorded.
    assert.match(sent.text, new RegExp(`${WEB_BASE_URL}/requests/${job['id']}`));
    assert.match(sent.html ?? '', new RegExp(`${WEB_BASE_URL}/requests/${job['id']}`));
    assert.equal(ctx.mailer.sent.length, 1);
  });

  it('2. the email never exposes customer contact details', async () => {
    const customer = await provisionUser(ctx, uniqueEmail('privcust'), ['CUSTOMER']);
    const pro = await provisionUser(ctx, uniqueEmail('privpro'), ['PROFESSIONAL']);
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    await requestJob(ctx, customer.token);

    const sent = ctx.mailer.sentTo(pro.email);
    assert.ok(sent);
    const body = `${sent.subject}\n${sent.text}\n${sent.html ?? ''}`;
    // The provider is told to reply on the platform, not given a way to
    // contact the customer off it.
    assert.ok(!body.includes(customer.email), 'customer email must not appear in a provider email');
    assert.match(sent.text, /not included in this email/i);
    assert.match(sent.text, /Sign in to Fixlynk/);
  });

  it('3. a provider can read the request and submit a quote after being emailed', async () => {
    const customer = await provisionUser(ctx, uniqueEmail('replycust'), ['CUSTOMER']);
    const pro = await provisionUser(ctx, uniqueEmail('replypro'), ['PROFESSIONAL']);
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    const job = await requestJob(ctx, customer.token);

    // The emailed link resolves to the provider request inbox, which is
    // where the reply is submitted.
    const inbox = await request(ctx.app)
      .get('/api/v1/provider/requests')
      .set('Authorization', `Bearer ${pro.token}`);
    assert.equal(inbox.status, 200);
    assert.equal(inbox.body.data.total, 1);
    assert.equal(inbox.body.data.items[0].id, job['id']);

    const quoted = await request(ctx.app)
      .post(`/api/v1/jobs/${job['id']}/quotes`)
      .set('Authorization', `Bearer ${pro.token}`)
      .send({ total: 1250, currency: 'ZAR', message: 'Supply and install replacement mixer.' });
    assert.equal(quoted.status, 201, `quote failed: ${JSON.stringify(quoted.body)}`);

    // The reply reaches the customer in-app, not by email.
    const customerInbox = await listNotifications(ctx, customer.token);
    assert.equal(customerInbox.total, 1);
    assert.equal(customerInbox.items[0]?.type, 'QUOTE_RECEIVED');
    assert.equal(ctx.mailer.sentTo(customer.email), undefined);
  });
});

describe('Stage 13 — who gets emailed', () => {
  let ctx: TestContext;
  beforeEach(() => {
    // `env` is read at import time, so the base URL is set per test rather
    // than through the environment, keeping the expected links explicit.
    env.webBaseUrl = WEB_BASE_URL;
    ctx = buildApp();
  });

  it('4. the customer is never emailed about their own request', async () => {
    const customer = await provisionUser(ctx, uniqueEmail('nocust'), ['CUSTOMER']);
    const pro = await provisionUser(ctx, uniqueEmail('nopro'), ['PROFESSIONAL']);
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    await requestJob(ctx, customer.token);
    assert.equal(ctx.mailer.sentTo(customer.email), undefined);
    assert.equal(ctx.mailer.sent.length, 1);
  });

  it('5. the same event is in-app for one party and email for the other', async () => {
    const customer = await provisionUser(ctx, uniqueEmail('splitcust'), ['CUSTOMER']);
    const pro = await provisionUser(ctx, uniqueEmail('splitpro'), ['PROFESSIONAL']);
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    const job = await requestJob(ctx, customer.token);
    const quoted = await request(ctx.app)
      .post(`/api/v1/jobs/${job['id']}/quotes`)
      .set('Authorization', `Bearer ${pro.token}`)
      .send({ total: 900, currency: 'ZAR' });
    assert.equal(quoted.status, 201);

    // QUOTE_ACCEPTED would be provider-facing, but the acting customer is
    // the recipient here — so the customer gets the in-app row only.
    const accepted = await request(ctx.app)
      .post(`/api/v1/jobs/${job['id']}/quotes/${quoted.body.data.id}/accept`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({});
    assert.equal(accepted.status, 200);
    assert.equal(ctx.mailer.sentTo(customer.email), undefined);
  });

  it('6. business owner and manager are both emailed for their business', async () => {
    const customer = await provisionUser(ctx, uniqueEmail('bizmailcust'), ['CUSTOMER']);
    const owner = await provisionUser(ctx, uniqueEmail('bizmailowner'), ['BUSINESS_OWNER']);
    const business = ctx.business.seedBusiness({
      ownerUserId: owner.userId,
      businessName: 'Ubuntu Plumbing Co.',
      slug: `ubuntu-mail-${seq}`,
    });
    const manager = await provisionUser(ctx, uniqueEmail('bizmailmgr'), ['BUSINESS_MANAGER']);
    ctx.business.addMembership(business.id, manager.userId, 'BUSINESS_MANAGER');
    ctx.quotes.addBusinessMembership(owner.userId, '1', 'OWNER');
    ctx.quotes.addBusinessMembership(manager.userId, '1', 'MANAGER');

    const job = await requestJob(ctx, customer.token, { providerId: 'business-1' });
    for (const recipient of [owner, manager]) {
      const sent = ctx.mailer.sentTo(recipient.email);
      assert.ok(sent, `expected ${recipient.email} to be emailed`);
      assert.match(sent.text, new RegExp(`${WEB_BASE_URL}/requests/${job['id']}`));
    }
  });

  it('7. a suspended provider is not emailed and the skip is recorded', async () => {
    const customer = await provisionUser(ctx, uniqueEmail('suspendcust'), ['CUSTOMER']);
    const pro = await provisionUser(ctx, uniqueEmail('suspendpro'), ['PROFESSIONAL']);
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    await ctx.users.setStatus(pro.userId, 'SUSPENDED');
    await requestJob(ctx, customer.token);

    assert.equal(ctx.mailer.sentTo(pro.email), undefined);
    const row = ctx.notifications.debugForUser(pro.userId)[0];
    assert.ok(row, 'the in-app notification must still be created');
    assert.deepEqual(ctx.notifications.debugEmailDelivery(row.id).status, 'SKIPPED');
  });

  it('8. with no mailer configured nothing is emailed and nothing is recorded', async () => {
    // LogMailer is what an unconfigured deployment resolves to: it cannot
    // deliver, so the channel stays inert exactly as it was pre-Stage 13.
    const logging = buildApp(new LogMailer());
    const customer = await provisionUser(logging, uniqueEmail('logcust'), ['CUSTOMER']);
    const pro = await provisionUser(logging, uniqueEmail('logpro'), ['PROFESSIONAL']);
    logging.quotes.linkProfessionalProfile(pro.userId, '1');
    const job = await requestJob(logging, customer.token);
    assert.ok(job['id']);

    const inbox = await listNotifications(logging, pro.token);
    assert.equal(inbox.total, 1);
    assert.equal(inbox.items[0]?.type, 'JOB_REQUEST');
    // NULL means the channel was not attempted — distinct from a failure.
    assert.equal(logging.notifications.debugEmailDelivery(inbox.items[0]!.id).status, null);
  });
});

describe('Stage 13 — delivery safety and failure isolation', () => {
  let ctx: TestContext;
  beforeEach(() => {
    // `env` is read at import time, so the base URL is set per test rather
    // than through the environment, keeping the expected links explicit.
    env.webBaseUrl = WEB_BASE_URL;
    ctx = buildApp();
  });

  it('9. a mail failure never fails the job request and the failure is recorded', async () => {
    const customer = await provisionUser(ctx, uniqueEmail('failcust'), ['CUSTOMER']);
    const pro = await provisionUser(ctx, uniqueEmail('failpro'), ['PROFESSIONAL']);
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    ctx.mailer.failWith = new Error('SMTP relay unavailable');

    const job = await requestJob(ctx, customer.token);
    assert.ok(job['id'], 'the job request must still be created when email fails');

    // The in-app notification is the record of what happened.
    const inbox = await listNotifications(ctx, pro.token);
    assert.equal(inbox.total, 1);
    assert.equal(inbox.items[0]?.type, 'JOB_REQUEST');
    const delivery = ctx.notifications.debugEmailDelivery(inbox.items[0]!.id);
    assert.equal(delivery.status, 'FAILED');
    assert.equal(delivery.emailedAt, null, 'a failed send must not claim a delivery time');
    assert.ok(delivery.error && delivery.error.length > 0);
    // The stored reason is the error NAME, never a relay response body.
    assert.ok(!delivery.error!.includes('relay unavailable'));
  });

  it('10. the provider can still quote when email delivery fails', async () => {
    const customer = await provisionUser(ctx, uniqueEmail('fail2cust'), ['CUSTOMER']);
    const pro = await provisionUser(ctx, uniqueEmail('fail2pro'), ['PROFESSIONAL']);
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    const job = await requestJob(ctx, customer.token);
    ctx.mailer.failWith = new Error('SMTP relay unavailable');
    const quoted = await request(ctx.app)
      .post(`/api/v1/jobs/${job['id']}/quotes`)
      .set('Authorization', `Bearer ${pro.token}`)
      .send({ total: 800, currency: 'ZAR' });
    assert.equal(quoted.status, 201, `quote must succeed despite email failure: ${JSON.stringify(quoted.body)}`);
  });

  it('11. a successful send is recorded as SENT with a delivery time', async () => {
    const customer = await provisionUser(ctx, uniqueEmail('okcust'), ['CUSTOMER']);
    const pro = await provisionUser(ctx, uniqueEmail('okpro'), ['PROFESSIONAL']);
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    await requestJob(ctx, customer.token);
    const inbox = await listNotifications(ctx, pro.token);
    const delivery = ctx.notifications.debugEmailDelivery(inbox.items[0]!.id);
    assert.equal(delivery.status, 'SENT');
    assert.ok(delivery.emailedAt, 'a sent email must record when it was delivered');
    assert.equal(delivery.error, null);
  });

  it('12. customer-supplied text cannot inject markup into the email', async () => {
    const customer = await provisionUser(ctx, uniqueEmail('xsscust'), ['CUSTOMER']);
    const pro = await provisionUser(ctx, uniqueEmail('xsspro'), ['PROFESSIONAL']);
    ctx.quotes.linkProfessionalProfile(pro.userId, '1');
    await requestJob(ctx, customer.token, {
      description:
        'Leak under the sink <script>alert(1)</script> and a broken "quoted" label <img src=x onerror=alert(2)> plus a long tail that must be truncated in the rendered email body.',
    });
    const sent = ctx.mailer.sentTo(pro.email);
    assert.ok(sent);
    const html = sent.html ?? '';
    assert.ok(!html.includes('<script>'), 'script tags must be escaped');
    assert.ok(!html.includes('<img'), 'injected tags must be escaped, not rendered');
    assert.match(html, /&lt;script&gt;/);
    // Plain text is unaffected by escaping and still carries the detail.
    assert.match(sent.text, /<script>alert\(1\)<\/script>/);
  });

  it('13. eligibility is decided by role, not by the event', () => {
    assert.equal(isEmailRecipient(['PROFESSIONAL']), true);
    assert.equal(isEmailRecipient(['BUSINESS_OWNER', 'CUSTOMER']), true);
    assert.equal(isEmailRecipient(['TECHNICIAN']), true);
    assert.equal(isEmailRecipient(['CUSTOMER']), false);
    assert.equal(isEmailRecipient([]), false);
  });
});

describe('Stage 13 — email content and links', () => {
  const base: NotificationDto = {
    id: '9',
    type: 'JOB_REQUEST',
    title: 'New job request',
    message: 'Plumbing requested at Fourways, Johannesburg (FL-2026-000123).',
    relatedJobId: '9',
    relatedEntityType: 'JOB',
    relatedEntityId: '9',
    read: false,
    createdAt: '2026-09-27T10:00:00.000Z',
    readAt: null,
  };

  // The renderer takes the base URL explicitly, so these cases are
  // independent of process configuration.
  it('14. each recipient role links to its own screen', () => {
    const rendered = (roles: string[]) =>
      renderNotificationEmail({ notification: base, roles, webBaseUrl: WEB_BASE_URL })?.text ?? '';
    assert.match(rendered(['PROFESSIONAL']), new RegExp(`${WEB_BASE_URL}/requests/9`));
    assert.match(rendered(['TECHNICIAN']), new RegExp(`${WEB_BASE_URL}/technician/jobs/9`));
    assert.match(rendered(['BUSINESS_OWNER']), new RegExp(`${WEB_BASE_URL}/requests/9`));
  });

  it('15. an internal job links a business role to the business job detail', () => {
    const internal: NotificationDto = { ...base, relatedEntityType: 'INTERNAL_JOB' };
    const rendered = renderNotificationEmail({
      notification: internal,
      roles: ['BUSINESS_MANAGER'],
      webBaseUrl: WEB_BASE_URL,
    });
    assert.match(rendered?.text ?? '', new RegExp(`${WEB_BASE_URL}/business/jobs/9`));
  });

  it('16. a notification with no job to open produces no email', () => {
    const orphan: NotificationDto = { ...base, relatedJobId: null, relatedEntityType: null, relatedEntityId: null };
    assert.equal(
      renderNotificationEmail({ notification: orphan, roles: ['PROFESSIONAL'], webBaseUrl: WEB_BASE_URL }),
      null,
    );
  });

  it('17. the subject is a single bounded line', () => {
    const rendered = renderNotificationEmail({
      notification: { ...base, title: 'New job request\nBcc: attacker@example.com' },
      roles: ['PROFESSIONAL'],
      webBaseUrl: WEB_BASE_URL,
    });
    assert.ok(rendered);
    assert.ok(!rendered.subject.includes('\n'), 'a subject must never contain a line break');
    assert.ok(rendered.subject.length <= 150);
  });
});
