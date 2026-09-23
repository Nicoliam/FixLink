import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { getPool } from './config/db';
import { env } from './config/env';
import { makeAuthRoutes } from './modules/auth/auth.routes';
import { MemoryRefreshStore, type RefreshStore } from './modules/auth/refresh.store';
import { MemoryUserRepository } from './modules/auth/memory-user.repository';
import { MysqlUserRepository } from './modules/auth/mysql-user.repository';
import type { UserRepository } from './modules/users/user.repository';
import { fail } from './utils/response';

export interface AppDeps {
  users: UserRepository;
  refreshStore: RefreshStore;
}

export function resolveDeps(): AppDeps {
  const refreshStore = new MemoryRefreshStore();
  if (env.authStore === 'memory') {
    return { users: new MemoryUserRepository(), refreshStore };
  }
  return { users: new MysqlUserRepository(getPool()), refreshStore };
}

export function createApp(deps: AppDeps = resolveDeps()): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ success: true, data: { status: 'ok' }, message: 'OK' });
  });

  app.use('/api/v1/auth', makeAuthRoutes(deps.users, deps.refreshStore));

  // Standard 404 envelope for unknown API routes.
  app.use('/api', (_req, res) => {
    fail(res, 'NOT_FOUND', 'Resource not found.', 404);
  });

  return app;
}
