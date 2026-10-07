import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { getPool } from './config/db';
import { env, isAllowedCorsOrigin } from './config/env';
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
import { makeProviderAreasRoutes } from './modules/provider-areas/provider-areas.routes';
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
import { resolveMailer, type Mailer } from './services/mailer';
import { createOpsAlertSender } from './services/ops-alert';
import { logInfo } from './utils/logger';
import type { UserRepository } from './modules/users/user.repository';
import { makeOfferingsRoutes } from './modules/offerings/offerings.routes';
import { MemoryOfferingsStore } from './modules/offerings/memory-offerings.store';
import { MysqlOfferingsStore } from './modules/offerings/mysql-offerings.store';
import type { ServiceOfferingsStore } from './modules/offerings/offerings.store';
import { makeSavedProvidersRoutes } from './modules/saved-providers/saved-providers.routes';
import { MemorySavedProvidersStore } from './modules/saved-providers/memory-saved-providers.store';
import { MysqlSavedProvidersStore } from './modules/saved-providers/mysql-saved-providers.store';
import type { SavedProvidersStore } from './modules/saved-providers/saved-providers.store';
import { fail } from './utils/response';
import { errorHandler } from './middleware/error';
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
  /**
   * Stage 13 — email transport for provider notifications. Optional so
   * pre-13 constructions keep compiling; `resolveMailer()` picks SMTP
   * when mail is configured and a log-only adapter otherwise. Tests
   * inject a `MemoryMailer` to assert what would have been sent.
   */
  mailer?: Mailer;
  admin?: AdminStore;
  /**
   * Provider-authored service offerings (migration 015). Optional so earlier
   * constructions keep compiling; defaults to a memory store.
   */
  offerings?: ServiceOfferingsStore;
  /**
   * Customer bookmarks of professionals (migration 016). Optional so earlier
   * constructions keep compiling; defaults to a memory store.
   */
  savedProviders?: SavedProvidersStore;
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
      offerings: new MemoryOfferingsStore(),
      savedProviders: new MemorySavedProvidersStore(),
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
    offerings: new MysqlOfferingsStore(pool),
    savedProviders: new MysqlSavedProvidersStore(pool),
  };
}

export function createApp(deps: AppDeps = resolveDeps()): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  // Only echo `Access-Control-Allow-Origin` for an exact configured origin.
  // Returning a fixed value for every origin advertises the wrong origin and
  // makes the browser discard the response, which surfaces to the user as a
  // generic failure with no readable error body.
  app.use(
    cors({
      origin: (requestOrigin, callback) => {
        if (!requestOrigin || isAllowedCorsOrigin(requestOrigin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
    }),
  );
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
  // feature service plus the notifications router below. Stage 13 gives
  // it the recipient lookup and mail transport for the email channel;
  // `resolveMailer()` returns a log-only adapter when mail is not
  // configured, so an unconfigured deployment stays in-app only.
  const notifications = deps.notifications ?? new MemoryNotificationsStore();
  const mailer = deps.mailer ?? resolveMailer();
  // Platform alerts to the operations inbox. Disabled (sends nothing) unless
  // OPS_ALERT_EMAIL is configured AND the transport can actually deliver, so
  // a deployment without either never accumulates send failures.
  const opsAlert = createOpsAlertSender({ mailer, to: env.opsAlertEmail });
  // Log the state once at startup rather than per event. Without this, an
  // operator who set OPS_ALERT_EMAIL but left MAIL_ENABLED off sees silence
  // and has no way to tell "not configured" from "relay rejecting".
  logInfo('ops_alert.status', {
    configured: env.opsAlertEmail !== null,
    deliverable: mailer.delivers,
    active: env.opsAlertEmail !== null && mailer.delivers,
  });
  const notify = new NotificationService(notifications, deps.users, mailer, env.webBaseUrl);
  const admin = deps.admin ?? new MemoryAdminStore(deps.users);
  const offerings = deps.offerings ?? new MemoryOfferingsStore();
  const savedProviders = deps.savedProviders ?? new MemorySavedProvidersStore();

  app.use('/api/v1/auth', makeAuthRoutes(deps.users, deps.refreshStore, opsAlert));
  app.use('/api/v1', makeMarketplaceRoutes(deps.marketplace));
  app.use(
    '/api/v1',
    makeJobsRoutes(deps.users, jobs, deps.marketplace, quotes, notify, storage, opsAlert),
  );
  if (quotes) {
    // Step 14 — the marketplace store is passed for open-request matching:
    // category AND service area, resolved from the caller's own profile.
    app.use('/api/v1', makeQuotesRoutes(deps.users, jobs, quotes, notify, deps.marketplace));
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
  // Provider-authored services (migration 015). Auth-walled, so it mounts
  // with the other auth-walled routers. It must mount BEFORE the admin
  // router: that router guards its whole subtree with `requireAdmin()` via
  // `router.use`, so anything mounted after it is unreachable.
  app.use('/api/v1', makeOfferingsRoutes(deps.users, offerings));
  // Customer bookmarks of professionals (migration 016). Auth-walled, so it
  // mounts with the other auth-walled routers and before the admin router
  // for the same `requireAdmin()` subtree reason.
  app.use('/api/v1', makeSavedProvidersRoutes(deps.users, savedProviders, deps.marketplace));
  // Step 14 — provider service areas. Reads and writes `service_areas` through
  // the same marketplace store that open-request matching reads, so the two
  // can never disagree. `quotes` supplies the provider-identity resolution
  // (professional profile, business owner/manager), which is why this mounts
  // inside the `if (quotes)` guard below.
  if (quotes) {
    app.use('/api/v1', makeProviderAreasRoutes(deps.marketplace, quotes, deps.users));
  }
  app.use('/api/v1', makeAdminRoutes(deps.users, admin, storage));

  // Standard 404 envelope for unknown API routes.
  app.use('/api', (_req, res) => {
    fail(res, 'NOT_FOUND', 'Resource not found.', 404);
  });

  // Final error handler. Must stay last so every route's async failure and
  // every body-parser rejection still answers with the standard envelope
  // (docs/API.md §18) instead of Express's HTML error page.
  app.use(errorHandler());

  return app;
}
