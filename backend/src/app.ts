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
import { makeQuotesRoutes } from './modules/quotes/quotes.routes';
import { MemoryQuotesStore } from './modules/quotes/memory-quotes.store';
import { MysqlQuotesStore } from './modules/quotes/mysql-quotes.store';
import type { QuotesStore } from './modules/quotes/quotes.store';
import { makeExecutionRoutes } from './modules/execution/execution.routes';
import { MemoryExecutionStore } from './modules/execution/memory-execution.store';
import { MysqlExecutionStore } from './modules/execution/mysql-execution.store';
import type { ExecutionStore } from './modules/execution/execution.store';
import { LocalFileStorage, type FileStorage } from './services/file-storage';
import type { UserRepository } from './modules/users/user.repository';
import { fail } from './utils/response';

export interface AppDeps {
  users: UserRepository;
  refreshStore: RefreshStore;
  marketplace: MarketplaceStore;
  /** Optional so Stage 6A-era tests keep compiling; defaults to memory. */
  jobs?: JobsStore;
  /** Optional so Stage 6B-era tests keep compiling; defaults to memory. */
  quotes?: QuotesStore;
  /** Optional so pre-6F tests keep compiling; defaults to memory. */
  execution?: ExecutionStore;
  /** Optional file storage; defaults to the local MVP adapter. */
  storage?: FileStorage;
}

export function resolveDeps(): AppDeps {
  const refreshStore = new MemoryRefreshStore();
  if (env.authStore === 'memory') {
    const jobs = new MemoryJobsStore();
    const quotes = new MemoryQuotesStore(jobs);
    return {
      users: new MemoryUserRepository(),
      refreshStore,
      marketplace: new MemoryMarketplaceStore(),
      jobs,
      quotes,
      execution: new MemoryExecutionStore(jobs, quotes),
      storage: new LocalFileStorage(),
    };
  }
  const pool = getPool();
  const jobs = new MysqlJobsStore(pool);
  return {
    users: new MysqlUserRepository(pool),
    refreshStore,
    marketplace: new MysqlMarketplaceStore(pool),
    jobs,
    quotes: new MysqlQuotesStore(pool),
    execution: new MysqlExecutionStore(pool),
    storage: new LocalFileStorage(),
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

  const jobs = deps.jobs ?? new MemoryJobsStore();
  // The quotes store must share job rows: reuse the resolved jobs store
  // when it is the memory implementation, so tests stay consistent.
  const quotes = deps.quotes ?? (jobs instanceof MemoryJobsStore ? new MemoryQuotesStore(jobs) : undefined);
  // The execution store shares job rows (and earlier-stage history) the
  // same way; file bytes go through the storage adapter (local MVP dir by
  // default, isolated tmp dirs in tests).
  const execution =
    deps.execution ??
    (jobs instanceof MemoryJobsStore
      ? new MemoryExecutionStore(jobs, quotes instanceof MemoryQuotesStore ? quotes : undefined)
      : undefined);
  const storage = deps.storage ?? new LocalFileStorage();

  app.use('/api/v1/auth', makeAuthRoutes(deps.users, deps.refreshStore));
  app.use('/api/v1', makeMarketplaceRoutes(deps.marketplace));
  app.use('/api/v1', makeJobsRoutes(deps.users, jobs, deps.marketplace, quotes));
  if (quotes) {
    app.use('/api/v1', makeQuotesRoutes(deps.users, jobs, quotes));
  }
  if (quotes && execution) {
    app.use('/api/v1', makeExecutionRoutes(deps.users, jobs, quotes, execution, storage));
  }

  // Standard 404 envelope for unknown API routes.
  app.use('/api', (_req, res) => {
    fail(res, 'NOT_FOUND', 'Resource not found.', 404);
  });

  return app;
}
