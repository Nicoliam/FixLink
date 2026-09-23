import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { getPool } from './config/db';
import { env } from './config/env';
import { makeAuthRoutes } from './modules/auth/auth.routes';
import { MemoryRefreshStore, type RefreshStore } from './modules/auth/refresh.store';
import { MemoryUserRepository } from './modules/auth/memory-user.repository';
import { MysqlUserRepository } from './modules/auth/mysql-user.repository';
import { makeMarketplaceRoutes } from './modules/marketplace/marketplace.routes';
import { MemoryMarketplaceStore } from './modules/marketplace/memory-marketplace.store';
import { MysqlMarketplaceStore } from './modules/marketplace/mysql-marketplace.store';
import type { MarketplaceStore } from './modules/marketplace/marketplace.store';
import { makeJobsRoutes } from './modules/jobs/jobs.routes';
import { MemoryJobsStore } from './modules/jobs/memory-jobs.store';
import { MysqlJobsStore } from './modules/jobs/mysql-jobs.store';
import type { JobsStore } from './modules/jobs/jobs.store';
import type { UserRepository } from './modules/users/user.repository';
import { fail } from './utils/response';

export interface AppDeps {
  users: UserRepository;
  refreshStore: RefreshStore;
  marketplace: MarketplaceStore;
  /** Optional so Stage 6A-era tests keep compiling; defaults to memory. */
  jobs?: JobsStore;
}

export function resolveDeps(): AppDeps {
  const refreshStore = new MemoryRefreshStore();
  if (env.authStore === 'memory') {
    return {
      users: new MemoryUserRepository(),
      refreshStore,
      marketplace: new MemoryMarketplaceStore(),
      jobs: new MemoryJobsStore(),
    };
  }
  const pool = getPool();
  return {
    users: new MysqlUserRepository(pool),
    refreshStore,
    marketplace: new MysqlMarketplaceStore(pool),
    jobs: new MysqlJobsStore(pool),
  };
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
  app.use('/api/v1', makeMarketplaceRoutes(deps.marketplace));
  app.use('/api/v1', makeJobsRoutes(deps.users, deps.jobs ?? new MemoryJobsStore(), deps.marketplace));

  // Standard 404 envelope for unknown API routes.
  app.use('/api', (_req, res) => {
    fail(res, 'NOT_FOUND', 'Resource not found.', 404);
  });

  return app;
}
