/**
 * Operations alerts — new registration and new job request.
 *
 * Covers three things that matter more than the happy path:
 *
 * 1. The right message reaches the configured inbox, with the details an
 *    operator needs (who signed up, who is asking, for what).
 * 2. NO credential is ever included. A password in an email is a security
 *    incident, so the tests assert the plaintext password and its hash are
 *    absent from the rendered body — not merely that the message looks right.
 * 3. Delivery is best-effort. A mail relay that rejects must not stop a
 *    registration or fail a job request, because those are the operations
 *    that actually matter to a customer.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createApp } from '../src/app';
import { MemoryUserRepository } from '../src/modules/auth/memory-user.repository';
import { MemoryRefreshStore } from '../src/modules/auth/refresh.store';
import { MemoryMarketplaceStore } from '../src/modules/marketplace/memory-marketplace.store';
import { MemoryJobsStore } from '../src/modules/jobs/memory-jobs.store';
import { MemoryQuotesStore } from '../src/modules/quotes/memory-quotes.store';
import { MemoryMailer } from '../src/services/mailer';
import { renderOpsAlert } from '../src/services/ops-alert';
import request from 'supertest';

const PASSWORD = 'Str0ngPassw0rd!';
const OPS_INBOX = 'info@fixlynk.co.za';

interface Harness {
  app: ReturnType<typeof createApp>;
  mailer: MemoryMailer;
}

function harness(): Harness {
  const users = new MemoryUserRepository();
  const jobs = new MemoryJobsStore();
  const quotes = new MemoryQuotesStore(jobs);
  const mailer = new MemoryMailer();
  const app = createApp({
    users,
    refreshStore: new MemoryRefreshStore(),
    marketplace: new MemoryMarketplaceStore(),
    jobs,
    quotes,
    mailer,
  });
  return { app, mailer };
}

async function registerCustomer(
  h: Harness,
  email: string,
  firstName = 'Naledi',
  lastName = 'Dlamini',
): Promise<string> {
  await request(h.app)
    .post('/api/v1/auth/register')
    .send({ email, password: PASSWORD, role: 'CUSTOMER', firstName, lastName });
  const login = await request(h.app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  // Setting up a customer also fires a registration alert. Drop it so the job
  // tests assert on the job alert and not on whichever alert landed first.
  h.mailer.clear();
  return (login.body as { data: { accessToken: string } }).data.accessToken;
}

/** The single message delivered to the operations inbox. */
function opsMail(h: Harness): { subject: string; text: string; html: string } | undefined {
  return h.mailer.sentTo(OPS_INBOX);
}

describe('renderOpsAlert', () => {
  it('leads the subject with the reference so the inbox is scannable', () => {
    const rendered = renderOpsAlert({
      kind: 'JOB_POSTED',
      details: [
        { label: 'Reference', value: 'FL-2026-000123' },
        { label: 'Service', value: 'Leak Repair' },
      ],
    });
    assert.match(rendered.subject, /New Fixlynk job request: FL-2026-000123/);
  });

  it('escapes HTML in customer-supplied values', () => {
    const rendered = renderOpsAlert({
      kind: 'JOB_POSTED',
      details: [{ label: 'Description', value: '<script>alert(1)</script> & "quotes"' }],
    });
    assert.ok(!rendered.html.includes('<script>'), 'raw script tag must not survive');
    assert.match(rendered.html, /&lt;script&gt;/);
    // The plain-text part is for humans, not a renderer, so it stays readable.
    assert.match(rendered.text, /<script>/);
  });

  it('strips newlines from a value used in the subject, so headers cannot be injected', () => {
    const rendered = renderOpsAlert({
      kind: 'REGISTRATION',
      details: [{ label: 'Email', value: 'a@b.co.za\r\nBcc: attacker@evil.example' }],
    });
    assert.ok(!rendered.subject.includes('\n'), 'subject must be a single line');
    assert.ok(!rendered.subject.includes('\r'));
  });

  it('drops rows with an empty label or value rather than rendering blanks', () => {
    const rendered = renderOpsAlert({
      kind: 'REGISTRATION',
      details: [
        { label: 'Email', value: 'a@b.co.za' },
        { label: '', value: 'orphan' },
        { label: 'Phone', value: '   ' },
      ],
    });
    assert.match(rendered.text, /Email: a@b\.co\.za/);
    assert.ok(!rendered.text.includes('orphan'));
  });

  it('falls back to a plain subject when there is no reference row', () => {
    const rendered = renderOpsAlert({ kind: 'REGISTRATION', details: [] });
    assert.equal(rendered.subject, 'New Fixlynk registration');
  });
});

describe('new registration alert', () => {
  it('emails the operations inbox with the account details', async () => {
    const h = harness();
    await request(h.app)
      .post('/api/v1/auth/register')
      .send({
        email: 'newcomer@example.co.za',
        password: PASSWORD,
        role: 'CUSTOMER',
        firstName: 'Thabo',
        lastName: 'Maseko',
      });

    const mail = opsMail(h);
    assert.ok(mail, 'an alert must be sent to the operations inbox');
    assert.match(mail.subject, /New Fixlynk registration/);
    assert.match(mail.text, /newcomer@example\.co\.za/);
    assert.match(mail.text, /Thabo Maseko/);
    assert.match(mail.text, /CUSTOMER/);
  });

  it('reports the role a professional registered with', async () => {
    const h = harness();
    await request(h.app)
      .post('/api/v1/auth/register')
      .send({
        email: 'pro.new@example.co.za',
        password: PASSWORD,
        role: 'PROFESSIONAL',
        displayName: 'Sipho Ndlovu',
      });

    const mail = opsMail(h);
    assert.ok(mail);
    assert.match(mail.text, /PROFESSIONAL/);
    assert.match(mail.text, /Sipho Ndlovu/);
  });

  it('NEVER includes the password or its hash', async () => {
    const h = harness();
    await request(h.app)
      .post('/api/v1/auth/register')
      .send({ email: 'secretive@example.co.za', password: PASSWORD, role: 'CUSTOMER' });

    const mail = opsMail(h);
    assert.ok(mail);
    // The single most important assertion in this file.
    assert.ok(!mail.text.includes(PASSWORD), 'plaintext password must not appear');
    assert.ok(!mail.html.includes(PASSWORD), 'plaintext password must not appear in HTML');
    assert.ok(!/\$2[aby]\$/.test(mail.text), 'no bcrypt hash may appear');
    assert.ok(!/eyJhbGciOi/.test(mail.text), 'no JWT may appear');
  });

  it('sends exactly one alert per registration', async () => {
    const h = harness();
    await request(h.app)
      .post('/api/v1/auth/register')
      .send({ email: 'once@example.co.za', password: PASSWORD, role: 'CUSTOMER' });
    assert.equal(h.mailer.sentTo(OPS_INBOX)?.subject.match(/New Fixlynk registration/g)?.length, 1);
  });

  it('does not send an alert when registration is rejected', async () => {
    const h = harness();
    const res = await request(h.app)
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: PASSWORD, role: 'CUSTOMER' });
    assert.equal(res.status, 422);
    assert.equal(opsMail(h), undefined, 'a rejected signup must not alert the operator');
  });
});

describe('new job request alert', () => {
  async function postJob(h: Harness, token: string, body: Record<string, unknown> = {}) {
    return request(h.app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        // `1` is a service that exists in the marketplace fixtures.
        serviceId: '1',
        description: 'Kitchen mixer tap is leaking at the base and the floor is damp.',
        location: 'Randburg, Johannesburg',
        ...body,
      });
  }

  it('emails the operations inbox with the job details', async () => {
    const h = harness();
    const token = await registerCustomer(h, `jobs.${Date.now()}@example.co.za`);
    const res = await postJob(h, token);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const reference = (res.body as { data: { reference: string } }).data.reference;

    const mail = opsMail(h);
    assert.ok(mail, 'a job alert must be sent to the operations inbox');
    assert.match(mail.subject, new RegExp(`New Fixlynk job request: ${reference}`));
    assert.match(mail.text, /Kitchen mixer tap is leaking/);
    assert.match(mail.text, /Randburg, Johannesburg/);
  });

  it('distinguishes an open request from one addressed to a chosen professional', async () => {
    const h = harness();
    const token = await registerCustomer(h, `open.${Date.now()}@example.co.za`);
    await postJob(h, token);

    const mail = opsMail(h);
    assert.ok(mail);
    assert.match(mail.text, /Open request/);
    assert.match(mail.text, /Matching professionals/);
  });

  it('carries the customer email, which the provider alert deliberately withholds', async () => {
    const h = harness();
    const email = `carry.${Date.now()}@example.co.za`;
    const token = await registerCustomer(h, email);
    await postJob(h, token);

    const mail = opsMail(h);
    assert.ok(mail);
    assert.ok(mail.text.includes(email), 'the operations inbox needs to know who asked');
  });

  it('NEVER includes a credential', async () => {
    const h = harness();
    const token = await registerCustomer(h, `nocred.${Date.now()}@example.co.za`);
    await postJob(h, token);

    const mail = opsMail(h);
    assert.ok(mail);
    assert.ok(!mail.text.includes(PASSWORD));
    assert.ok(!/\$2[aby]\$/.test(mail.text));
    assert.ok(!/eyJhbGciOi/.test(mail.text));
  });

  it('sends no job alert when the request is rejected', async () => {
    const h = harness();
    const token = await registerCustomer(h, `bad.${Date.now()}@example.co.za`);
    const res = await postJob(h, token, { description: 'too short' });
    assert.equal(res.status, 422);
    assert.equal(opsMail(h), undefined);
  });

  it('does not let a rejected job request affect a valid one', async () => {
    const h = harness();
    const token = await registerCustomer(h, `mixed.${Date.now()}@example.co.za`);
    await postJob(h, token, { description: 'nope' });
    h.mailer.clear();
    const ok = await postJob(h, token);
    assert.equal(ok.status, 201);
    assert.equal(h.mailer.sent.filter((m) => m.to === OPS_INBOX).length, 1);
  });
});

describe('delivery failures never break the customer-facing operation', () => {
  it('still returns 201 when the mailer rejects a job alert', async () => {
    const h = harness();
    h.mailer.failWith = new Error('SMTP unavailable');
    const token = await registerCustomer(h, `smtpfail.${Date.now()}@example.co.za`);
    const res = await request(h.app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        serviceId: '1',
        description: 'Kitchen mixer tap is leaking at the base and the floor is damp.',
        location: 'Randburg',
      });
    assert.equal(res.status, 201, 'a mail outage must not fail the job request');
  });

  it('still registers the account when the mailer rejects', async () => {
    const h = harness();
    h.mailer.failWith = new Error('SMTP unavailable');
    const res = await request(h.app)
      .post('/api/v1/auth/register')
      .send({ email: `outage.${Date.now()}@example.co.za`, password: PASSWORD, role: 'CUSTOMER' });
    assert.equal(res.status, 201, 'a mail outage must not block registration');
  });

  it('the job is readable afterwards, proving the request really committed', async () => {
    const h = harness();
    h.mailer.failWith = new Error('SMTP unavailable');
    const token = await registerCustomer(h, `commit.${Date.now()}@example.co.za`);
    const created = await request(h.app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        serviceId: '1',
        description: 'Kitchen mixer tap is leaking at the base and the floor is damp.',
        location: 'Randburg',
      });
    const jobId = (created.body as { data: { id: string } }).data.id;
    const fetched = await request(h.app)
      .get(`/api/v1/jobs/${jobId}`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(fetched.status, 200);
  });
});
