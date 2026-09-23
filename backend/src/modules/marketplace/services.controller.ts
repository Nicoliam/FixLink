/**
 * FixLink Stage 6A — public services catalogue controllers.
 * No authentication required: services and categories are public data.
 */
import type { Request, Response } from 'express';
import type { MarketplaceStore } from './marketplace.store';
import { parseCatalogueId } from './marketplace.store';
import { fail, ok } from '../../utils/response';

export function makeServicesController(store: MarketplaceStore) {
  return {
    async listCategories(_req: Request, res: Response): Promise<void> {
      try {
        const categories = await store.listCategories(true);
        ok(res, { items: categories, total: categories.length }, 'Categories retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve categories. Please try again.', 500);
      }
    },

    async getCategory(req: Request, res: Response): Promise<void> {
      try {
        const id = parseCatalogueId(req.params['id']);
        if (!id) {
          fail(res, 'VALIDATION_ERROR', 'Invalid category id.', 400);
          return;
        }
        const category = await store.getCategoryById(id);
        if (!category) {
          fail(res, 'NOT_FOUND', 'Category not found.', 404);
          return;
        }
        ok(res, category, 'Category retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve category. Please try again.', 500);
      }
    },

    async listServices(_req: Request, res: Response): Promise<void> {
      try {
        const services = await store.listServices(true);
        ok(res, { items: services, total: services.length }, 'Services retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve services. Please try again.', 500);
      }
    },

    async getService(req: Request, res: Response): Promise<void> {
      try {
        const id = parseCatalogueId(req.params['id']);
        if (!id) {
          fail(res, 'VALIDATION_ERROR', 'Invalid service id.', 400);
          return;
        }
        const service = await store.getServiceById(id);
        if (!service) {
          fail(res, 'NOT_FOUND', 'Service not found.', 404);
          return;
        }
        ok(res, service, 'Service retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve service. Please try again.', 500);
      }
    },
  };
}
