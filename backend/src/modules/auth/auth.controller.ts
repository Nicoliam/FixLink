import type { Request, Response } from 'express';
import { fail, ok } from '../../utils/response';
import type { AuthService, ServiceResult } from './auth.service';

function send(res: Response, result: ServiceResult<never>, successMessage: string): void {
  if (result.data !== undefined) {
    ok(res, result.data, successMessage, result.status);
    return;
  }
  fail(
    res,
    (result.code ?? 'INTERNAL_ERROR') as Parameters<typeof fail>[1],
    result.message ?? 'Request failed.',
    result.status,
  );
}

export function makeAuthController(service: AuthService) {
  return {
    async register(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.register(req.body);
        send(res, result as ServiceResult<never>, 'Registration successful.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Registration failed. Please try again.', 500);
      }
    },

    async login(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.login(req.body);
        send(res, result as ServiceResult<never>, 'Login successful.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Login failed. Please try again.', 500);
      }
    },

    async refresh(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.refresh(req.body);
        send(res, result as ServiceResult<never>, 'Token refreshed.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Token refresh failed. Please try again.', 500);
      }
    },

    async logout(req: Request, res: Response): Promise<void> {
      try {
        const authUserId = (req as Request & { user?: { id: string } }).user?.id ?? null;
        const result = await service.logout(req.body ?? {}, authUserId);
        send(res, result as ServiceResult<never>, 'Logout successful.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Logout failed. Please try again.', 500);
      }
    },

    async me(req: Request, res: Response): Promise<void> {
      try {
        const authUserId = (req as Request & { user?: { id: string } }).user?.id;
        if (!authUserId) {
          fail(res, 'UNAUTHORIZED', 'Authentication required.', 401);
          return;
        }
        const result = await service.me(authUserId);
        send(res, result as ServiceResult<never>, 'User retrieved.');
      } catch {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve user. Please try again.', 500);
      }
    },
  };
}
