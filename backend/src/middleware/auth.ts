import type { NextFunction, Request, Response } from 'express';
import { fail } from '../utils/response';
import { verifyAccessToken } from '../utils/tokens';
import type { UserRepository, UserStatus } from '../modules/users/user.repository';

export interface AuthenticatedUser {
  id: string;
  email: string;
  status: UserStatus;
  roles: string[];
}

/**
 * JWT authentication middleware for protected routes.
 * Verifies the Bearer access token, then loads the authoritative user
 * (status + roles) from the repository — the token alone is never trusted
 * for account state.
 */
export function requireAuth(users: UserRepository) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.header('authorization');
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      fail(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      return;
    }
    const token = header.slice(7).trim();
    if (!token) {
      fail(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      return;
    }

    let claims;
    try {
      claims = verifyAccessToken(token);
    } catch {
      fail(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      return;
    }

    try {
      const user = await users.findById(claims.sub);
      if (!user || user.status === 'SUSPENDED' || user.status === 'DELETED') {
        fail(res, 'UNAUTHORIZED', 'Authentication required.', 401);
        return;
      }
      const roles = await users.getRoles(user.id);
      (req as Request & { user: AuthenticatedUser }).user = {
        id: user.id,
        email: user.email,
        status: user.status,
        roles,
      };
      next();
    } catch {
      fail(res, 'INTERNAL_ERROR', 'Authentication failed. Please try again.', 500);
    }
  };
}

/**
 * Optional-auth variant used by logout: attaches req.user when a valid
 * Bearer token is present, otherwise continues without one.
 */
export function requireAdmin() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as Request & { user?: AuthenticatedUser }).user;
    if (!user) {
      fail(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      return;
    }
    if (user.status !== 'ACTIVE') {
      fail(res, 'FORBIDDEN_ROLE', 'Administrator account must be active.', 403);
      return;
    }
    if (!user.roles.includes('ADMIN')) {
      fail(res, 'FORBIDDEN_ROLE', 'Administrator access required.', 403);
      return;
    }
    next();
  };
}

export function optionalAuth(users: UserRepository) {
  const strict = requireAuth(users);
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header('authorization');
    if (!header) {
      next();
      return;
    }
    void strict(req, res, next);
  };
}
