/**
 * FixLink Stage 6A — marketplace foundation tests.
 *
 * Run: npm test (no MySQL required — uses the in-memory marketplace store
 * with the same visibility rules as the MySQL implementation).
 *
 * Covers: service/category listing, provider search + location filtering,
 * provider profiles, portfolio/certificates/reviews retrieval, invalid ids,
 * invalid search parameters, and public/private field visibility.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { MemoryUserRepository } from '../src/modules/auth/memory-user.repository';
import { MemoryRefreshStore } from '../src/modules/auth/refresh.store';
import { MemoryMarketplaceStore } from '../src/modules/marketplace/memory-marketplace.store';

const SENSITIVE_KEYS = [
  'password',
  'password_hash',
  'passwordHash',
  'hash',
  'token',
  'document_reference',
  'documentReference',
  'identity',
  'id_number',
  'email',
  'phone',
];

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

function buildApp(): Express {
  return createApp({
    users: new MemoryUserRepository(),
    refreshStore: new MemoryRefreshStore(),
    marketplace: new MemoryMarketplaceStore(),
  });
}

describe('GET /api/v1/services + /api/v1/categories', () => {
  let app: Express;
  beforeEach(() => {
    app = buildApp();
  });

  it('lists services with category context (200, standard envelope)', async () => {
    const res = await request(app).get('/api/v1/services');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.total >= 13);
    const first = res.body.data.items[0];
    assert.ok(first.id);
    assert.ok(first.name);
    assert.ok(first.slug);
    assert.ok(first.categoryName);
    assert.deepEqual(scanForSensitive(res.body), []);
  });

  it('returns a single service by id', async () => {
    const res = await request(app).get('/api/v1/services/1');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.slug, 'leak-repair');
    assert.equal(res.body.data.categorySlug, 'plumbing');
  });

  it('returns 404 for an unknown service id', async () => {
    const res = await request(app).get('/api/v1/services/9999');
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  it('returns 400 for a malformed service id', async () => {
    const res = await request(app).get('/api/v1/services/not-a-number');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('lists categories', async () => {
    const res = await request(app).get('/api/v1/categories');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.total >= 9);
    assert.ok(res.body.data.items.some((c: { slug: string }) => c.slug === 'plumbing'));
  });

  it('serves the /services/categories alias', async () => {
    const res = await request(app).get('/api/v1/services/categories');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.total >= 9);
  });

  it('returns 404 for an unknown category id', async () => {
    const res = await request(app).get('/api/v1/categories/9999');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });
});

describe('GET /api/v1/providers (search)', () => {
  let app: Express;
  beforeEach(() => {
    app = buildApp();
  });

  it('returns all providers unfiltered with rating sort', async () => {
    const res = await request(app).get('/api/v1/providers');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.total, 5);
    assert.equal(res.body.data.page, 1);
    // Highest-rated first: Sipho (4.8) before Johan (4.7).
    assert.equal(res.body.data.items[0].id, 'professional-1');
    for (const item of res.body.data.items) {
      assert.ok(['professional', 'business'].includes(item.providerType));
      assert.equal(typeof item.isVerified, 'boolean');
      assert.deepEqual(scanForSensitive(item), []);
    }
  });

  it('filters by service slug', async () => {
    const res = await request(app).get('/api/v1/providers').query({ service: 'leak-repair' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.total, 2);
    const ids = res.body.data.items.map((p: { id: string }) => p.id).sort();
    assert.deepEqual(ids, ['business-1', 'professional-1']);
  });

  it('filters by category slug', async () => {
    const res = await request(app).get('/api/v1/providers').query({ category: 'electrical' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.total, 2);
  });

  it('filters by location (service area / city)', async () => {
    const fourways = await request(app).get('/api/v1/providers').query({ location: 'Fourways' });
    assert.equal(fourways.status, 200);
    assert.ok(fourways.body.data.total >= 1);
    assert.ok(
      fourways.body.data.items.every((p: { serviceAreas: { areaName: string }[] }) =>
        p.serviceAreas.some((a) => a.areaName.toLowerCase().includes('fourways')),
      ),
    );

    const nowhere = await request(app).get('/api/v1/providers').query({ location: 'Nowhereville' });
    assert.equal(nowhere.status, 200);
    assert.equal(nowhere.body.data.total, 0);
    assert.deepEqual(nowhere.body.data.items, []);
  });

  it('filters by provider type', async () => {
    const res = await request(app).get('/api/v1/providers').query({ providerType: 'business' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.total, 2);
    assert.ok(res.body.data.items.every((p: { providerType: string }) => p.providerType === 'business'));
  });

  it('filters to verified providers only', async () => {
    const res = await request(app).get('/api/v1/providers').query({ verified: 'true' });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.total >= 2);
    assert.ok(res.body.data.items.every((p: { isVerified: boolean }) => p.isVerified === true));
  });

  it('supports free-text search across names and services', async () => {
    const res = await request(app).get('/api/v1/providers').query({ q: 'electrician' });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.total >= 1);
  });

  it('paginates results', async () => {
    const page1 = await request(app).get('/api/v1/providers').query({ page: '1', pageSize: '2' });
    assert.equal(page1.status, 200);
    assert.equal(page1.body.data.items.length, 2);
    assert.equal(page1.body.data.total, 5);
    const page2 = await request(app).get('/api/v1/providers').query({ page: '2', pageSize: '2' });
    assert.equal(page2.status, 200);
    assert.equal(page2.body.data.items.length, 2);
    const ids1 = new Set(page1.body.data.items.map((p: { id: string }) => p.id));
    for (const item of page2.body.data.items as { id: string }[]) {
      assert.ok(!ids1.has(item.id));
    }
  });

  it('rejects unsupported search parameters (422)', async () => {
    const res = await request(app).get('/api/v1/providers').query({ bogusParam: 'x' });
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('rejects an invalid providerType (422)', async () => {
    const res = await request(app).get('/api/v1/providers').query({ providerType: 'technician' });
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('rejects an out-of-range pageSize (422)', async () => {
    const res = await request(app).get('/api/v1/providers').query({ pageSize: '999' });
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('neutralises LIKE wildcards in location search (no over-matching)', async () => {
    const res = await request(app).get('/api/v1/providers').query({ location: '%' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.total, 0);
  });
});

describe('GET /api/v1/providers/:id + sub-resources', () => {
  let app: Express;
  beforeEach(() => {
    app = buildApp();
  });

  it('returns a professional profile with trust, services and areas', async () => {
    const res = await request(app).get('/api/v1/providers/professional-1');
    assert.equal(res.status, 200);
    const profile = res.body.data;
    assert.equal(profile.providerType, 'professional');
    assert.equal(profile.isVerified, true);
    assert.equal(profile.ratingAvg, 4.8);
    assert.equal(profile.ratingCount, 64);
    assert.ok(profile.services.length >= 3);
    assert.ok(profile.serviceAreas.length >= 1);
    assert.equal(profile.portfolioCount, 1);
    assert.equal(profile.approvedCertificateCount, 1);
    assert.deepEqual(scanForSensitive(res.body), []);
  });

  it('returns a business profile', async () => {
    const res = await request(app).get('/api/v1/providers/business-1');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.providerType, 'business');
    assert.equal(res.body.data.name, 'Ubuntu Plumbing Co.');
    assert.deepEqual(scanForSensitive(res.body), []);
  });

  it('returns 400 for a malformed provider id', async () => {
    const res = await request(app).get('/api/v1/providers/123');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('returns 404 for an unknown provider', async () => {
    const res = await request(app).get('/api/v1/providers/professional-9999');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  it('returns portfolio with Before/After images (no private fields)', async () => {
    const res = await request(app).get('/api/v1/providers/professional-1/portfolio');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.total, 1);
    const project = res.body.data.items[0];
    assert.equal(project.title, 'Northcliff kitchen leak repair');
    assert.deepEqual(
      project.images.map((i: { kind: string }) => i.kind).sort(),
      ['AFTER', 'BEFORE'],
    );
    assert.deepEqual(scanForSensitive(res.body), []);
  });

  it('returns an empty portfolio list for providers without work', async () => {
    const res = await request(app).get('/api/v1/providers/professional-2/portfolio');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.items, []);
  });

  it('returns approved certificates without document references', async () => {
    const res = await request(app).get('/api/v1/providers/professional-1/certificates');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.total, 1);
    assert.equal(res.body.data.items[0].title, 'PIRB Registered Plumber');
    assert.equal(res.body.data.items[0].verificationStatus, 'APPROVED');
    assert.ok(!('document_reference' in res.body.data.items[0]));
    assert.deepEqual(scanForSensitive(res.body), []);
  });

  it('returns reviews with reviewer display names only', async () => {
    const res = await request(app).get('/api/v1/providers/professional-2/reviews');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.total, 1);
    assert.equal(res.body.data.items[0].rating, 5);
    assert.equal(res.body.data.items[0].reviewerName, 'Aisha P.');
    assert.deepEqual(scanForSensitive(res.body), []);
  });

  it('returns 404 for sub-resources of an unknown provider', async () => {
    for (const suffix of ['portfolio', 'certificates', 'reviews']) {
      const res = await request(app).get(`/api/v1/providers/business-9999/${suffix}`);
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    }
  });
});
