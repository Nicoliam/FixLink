import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { getPool } from './config/db';
import { env } from './config/env';
import { makeAuthRoutes } from './modules/auth/auth.routes';
import { MemoryRefreshStore, type RefreshStore } from './modules/auth/refresh.store';
import { MysqlRefreshStore } from './modules/auth/mysql-refresh.store';
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
import { makeBusinessRoutes } from './modules/business/business.routes';
import { MemoryBusinessStore } from './modules/business/memory-business.store';
import { MysqlBusinessStore } from './modules/business/mysql-business.store';
import type { BusinessStore } from './modules/business/business.store';
import { PartsRequestEventBus } from './modules/business/parts-request-events';
import { makeNotificationsRoutes } from './modules/notifications/notifications.routes';
import { MemoryNotificationsStore } from './modules/notifications/memory-notifications.store';
import { MysqlNotificationsStore } from './modules/notifications/mysql-notifications.store';
import type { NotificationStore } from './modules/notifications/notifications.store';
import { NotificationService } from './modules/notifications/notifications.service';
import { LocalFileStorage, type FileStorage } from './services/file-storage';
import type { UserRepository } from './modules/users/user.repository';
import { fail } from './utils/response';
import { makeAdminRoutes } from './modules/admin/admin.routes';
import { MemoryAdminStore } from './modules/admin/memory-admin.store';
import { MysqlAdminStore } from './modules/admin/mysql-admin.store';
import type { AdminStore } from './modules/admin/admin.store';

export interface AppDeps {
  users: UserRepository;
  refreshStore: RefreshStore;
  marketplace: MarketplaceStore;
  /** Optional so Stage 6A-era tests keep compiling; defaults to memory. */
  jobs?: JobsStore;
  /** Optional so Stage 6B-era tests keep compiling; defaults to memory. */
  quotes?: QuotesStore;
  /** Optional so Stage 6F-era tests keep compiling; defaults to memory. */
  execution?: ExecutionStore;
  /** Optional so pre-7A tests keep compiling; defaults to memory. */
  business?: BusinessStore;
  /** Optional file storage; defaults to the local MVP adapter. */
  storage?: FileStorage;
  /**
   * Stage 7F notification seam. Optional so pre-7F constructions keep
   * compiling; defaults to a fresh bus. Tests supply one to drain the
   * parts-approval events; Stage 8 will persist them into the
   * `notifications` table.
   */
  events?: PartsRequestEventBus;
  /**
   * Stage 8 — notification persistence. Optional so pre-8
   * constructions keep compiling; defaults to a memory store. The
   * single NotificationService built from it is shared by every
   * feature service (jobs, quotes, execution, business) for
   * best-effort in-app delivery.
   */
  notifications?: NotificationStore;
  admin?: AdminStore;
}

export function resolveDeps(): AppDeps {
  const refreshStore = new MemoryRefreshStore();
  if (env.authStore === 'memory') {
    const users = new MemoryUserRepository();
    const jobs = new MemoryJobsStore();
    const quotes = new MemoryQuotesStore(jobs);
    return {
      users,
      refreshStore,
      marketplace: new MemoryMarketplaceStore(),
      jobs,
      quotes,
      execution: new MemoryExecutionStore(jobs, quotes),
      business: new MemoryBusinessStore(),
      storage: new LocalFileStorage(),
      notifications: new MemoryNotificationsStore(),
      admin: new MemoryAdminStore(users),
    };
  }
  const pool = getPool();
  const jobs = new MysqlJobsStore(pool);
  return {
    users: new MysqlUserRepository(pool),
    refreshStore: new MysqlRefreshStore(pool),
    marketplace: new MysqlMarketplaceStore(pool),
    jobs,
    quotes: new MysqlQuotesStore(pool),
    execution: new MysqlExecutionStore(pool),
    business: new MysqlBusinessStore(pool),
    storage: new LocalFileStorage(),
    notifications: new MysqlNotificationsStore(pool),
    admin: new MysqlAdminStore(pool),
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
  const business = deps.business ?? new MemoryBusinessStore();
  // Stage 8 — one central notification service shared by every
  // feature service plus the notifications router below.
  const notifications = deps.notifications ?? new MemoryNotificationsStore();
  const notify = new NotificationService(notifications);
  const admin = deps.admin ?? new MemoryAdminStore(deps.users);

  app.use('/api/v1/auth', makeAuthRoutes(deps.users, deps.refreshStore));
  app.use('/api/v1', makeMarketplaceRoutes(deps.marketplace));
  app.use('/api/v1', makeJobsRoutes(deps.users, jobs, deps.marketplace, quotes, notify));
  if (quotes) {
    app.use('/api/v1', makeQuotesRoutes(deps.users, jobs, quotes, notify));
  }
  if (quotes && execution) {
    app.use('/api/v1', makeExecutionRoutes(deps.users, jobs, quotes, execution, storage, notify));
  }
  // Auth-walled routers mount after the public marketplace routes: each
  // calls `router.use(requireAuth(...))`, which answers 401 for requests
  // without a token, so mounting earlier would shadow public endpoints.
  // The business router also receives the shared jobs store so internal
  // jobs (Stage 7B) validate services against the same catalogue, plus
  // the shared file storage so technician execution (Stage 7D) stores
  // photos and voice notes through the same adapter as marketplace work.
  app.use('/api/v1', makeBusinessRoutes(deps.users, business, jobs, storage, deps.events, notify));
  // Stage 8 — in-app notification inbox (recipient is always the session user).
  app.use('/api/v1', makeNotificationsRoutes(deps.users, notifications));
  app.use('/api/v1', makeAdminRoutes(deps.users, admin, storage));

  // Standard 404 envelope for unknown API routes.
  app.use('/api', (_req, res) => {
    fail(res, 'NOT_FOUND', 'Resource not found.', 404);
  });

  return app;
}
