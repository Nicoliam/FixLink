/**
 * FixLink Stage 6A — public marketplace provider controllers.
 * No authentication required: provider cards, profiles, portfolio,
 * approved certificates and visible reviews are public data.
 * Private data is excluded by the store projections, never by the client.
 */
import type { Request, Response } from 'express';
import type { MarketplaceStore } from './marketplace.store';
import { parseProviderId, parseSearchQuery } from './marketplace.store';
import { fail, ok } from '../../utils/response';

function parsePagination(query: Record<string, unknown>): { page: number; pageSize: number } | { error: string } {
  const read = (value: unknown, fallback: number, max: number, label: string): number | null => {
    if (value === undefined || value === null || String(value).trim() === '') return fallback;
    const num = Number(String(value).trim());
    if (!Number.isInteger(num) || num < 1 || num > max) return null;
    void label;
    return num;
  };
  const page = read(query['page'], 1, 1000, 'page');
  const pageSize = read(query['pageSize'] ?? query['page_size'], 20, 50, 'pageSize');
  if (page === null) return { error: 'Invalid "page" parameter. Use an integer between 1 and 1000.' };
  if (pageSize === null) return { error: 'Invalid "pageSize" parameter. Use an integer between 1 and 50.' };
  return { page, pageSize };
}

export function makeProvidersController(store: MarketplaceStore) {
  return {
    async search(req: Request, res: Response): Promise<void> {
      try {
        const parsed = parseSearchQuery(req.query as Record<string, unknown>);
        if (!parsed.filters) {
          fail(res, 'VALIDATION_ERROR', parsed.error ?? 'Invalid search parameters.', 422);
          return;
        }
        const result = await store.searchProviders(parsed.filters);
        ok(res, result, 'Providers retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not search providers. Please try again.', 500);
      }
    },

    async getById(req: Request, res: Response): Promise<void> {
      try {
        const parsed = parseProviderId(req.params['id']);
        if (!parsed) {
          fail(res, 'VALIDATION_ERROR', 'Invalid provider id.', 400);
          return;
        }
        const profile = await store.getProviderById(`${parsed.providerType}-${parsed.numericId}`);
        if (!profile) {
          fail(res, 'NOT_FOUND', 'Provider not found.', 404);
          return;
        }
        ok(res, profile, 'Provider retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve provider. Please try again.', 500);
      }
    },

    async getPortfolio(req: Request, res: Response): Promise<void> {
      try {
        const parsed = parseProviderId(req.params['id']);
        if (!parsed) {
          fail(res, 'VALIDATION_ERROR', 'Invalid provider id.', 400);
          return;
        }
        const providerId = `${parsed.providerType}-${parsed.numericId}`;
        const profile = await store.getProviderById(providerId);
        if (!profile) {
          fail(res, 'NOT_FOUND', 'Provider not found.', 404);
          return;
        }
        const projects = await store.getProviderPortfolio(providerId);
        ok(res, { items: projects, total: projects.length }, 'Portfolio retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve portfolio. Please try again.', 500);
      }
    },

    async getCertificates(req: Request, res: Response): Promise<void> {
      try {
        const parsed = parseProviderId(req.params['id']);
        if (!parsed) {
          fail(res, 'VALIDATION_ERROR', 'Invalid provider id.', 400);
          return;
        }
        const providerId = `${parsed.providerType}-${parsed.numericId}`;
        const profile = await store.getProviderById(providerId);
        if (!profile) {
          fail(res, 'NOT_FOUND', 'Provider not found.', 404);
          return;
        }
        const certificates = await store.getProviderCertificates(providerId);
        ok(res, { items: certificates, total: certificates.length }, 'Certificates retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve certificates. Please try again.', 500);
      }
    },

    async getReviews(req: Request, res: Response): Promise<void> {
      try {
        const parsed = parseProviderId(req.params['id']);
        if (!parsed) {
          fail(res, 'VALIDATION_ERROR', 'Invalid provider id.', 400);
          return;
        }
        const providerId = `${parsed.providerType}-${parsed.numericId}`;
        const profile = await store.getProviderById(providerId);
        if (!profile) {
          fail(res, 'NOT_FOUND', 'Provider not found.', 404);
          return;
        }
        const pagination = parsePagination(req.query as Record<string, unknown>);
        if ('error' in pagination) {
          fail(res, 'VALIDATION_ERROR', pagination.error, 422);
          return;
        }
        const result = await store.getProviderReviews(providerId, pagination.page, pagination.pageSize);
        ok(res, result, 'Reviews retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve reviews. Please try again.', 500);
      }
    },
  };
}
