/**
 * Fixlynk Stage 6B — customer job request service.
 *
 * Owns the marketplace job-creation rules. The authenticated customer is
 * derived server-side from the session user id — any `customer_id`,
 * `status`, `source` or timestamp supplied by the browser is ignored.
 * Customer profiles are auto-provisioned on first request because Stage 5A
 * registration creates only `users` + `user_roles` rows.
 *
 * Stage 6C: the owned-job detail embeds the job's quotes (read-only here;
 * quoting itself lives in the quotes module).
 */
import type { MarketplaceStore } from '../marketplace/marketplace.store';
import type { NotificationService } from '../notifications/notifications.service';
import type { NotificationEmailDetail } from '../notifications/notifications.types';
import type { UserRepository } from '../users/user.repository';
import type { JobQuotesReader } from '../quotes/quotes.store';
import type { JobWithQuotes } from '../quotes/quotes.types';
import type { JobsStore } from './jobs.store';
import type { JobDto, UpdateJobInput, UpdatedJobDto } from './jobs.types';
import { CUSTOMER_MUTABLE_STATUSES } from './jobs.types';
import { validateCreateJob, validateUpdateJob } from './jobs.validation';
import { provisionCustomerNames } from '../../utils/customer-names';
import { sanitizeOriginalFilename, validateJobImageUpload } from '../../services/file-storage';
import type { FileStorage } from '../../services/file-storage';
import type { OpsAlertSender } from '../../services/ops-alert';
import { JobNotMutableError, JobRequestImageRejected } from './jobs.store';
import { MAX_OPEN_REQUEST_MATCHES } from '../marketplace/marketplace.store';
import type { JobImageDto } from '../execution/execution.types';

export interface ServiceResult<T> {
  status: number;
  code?: string;
  message?: string;
  data?: T;
}

function fail<T>(status: number, code: string, message: string): ServiceResult<T> {
  return { status, code, message };
}

/**
 * A failure with every field required.
 *
 * `ServiceResult` marks `code`/`message` optional, so returning one of those
 * and reading `.status` back off it does not typecheck. Internal helpers that
 * hand a failure back to a caller use this instead.
 */
interface Failure {
  status: number;
  code: string;
  message: string;
}

function failure(status: number, code: string, message: string): Failure {
  return { status, code, message };
}

function toScheduledAt(preferredDate: string | null, preferredTime: string | null): string | null {
  if (preferredDate === null) return null;
  // Default site-visit hour when the customer picks a date without a time.
  const time = preferredTime ?? '09:00';
  return `${preferredDate} ${time}:00`;
}

/**
 * Stage 13 — extract the `HH:MM` part of a scheduled slot.
 *
 * The two stores report `scheduled_at` in different shapes (the MySQL row
 * as `YYYY-MM-DD HH:MM:SS`, the in-memory one as an ISO string), so the
 * time is parsed from either separator rather than assumed.
 */
export function scheduledTimeOfDay(scheduledAt: string | null): string | null {
  if (!scheduledAt) return null;
  const separator = Math.max(scheduledAt.indexOf(' '), scheduledAt.indexOf('T'));
  if (separator < 0) return null;
  return /^\d{2}:\d{2}/.exec(scheduledAt.slice(separator + 1))?.[0] ?? null;
}

/**
 * Stage 13 — the job details a provider needs in order to decide whether
 * to quote, taken from the job the customer just submitted.
 *
 * Every value is a display fact the provider is already entitled to see on
 * the request itself. Nothing here identifies the customer: no name, no
 * email, no phone. The description is the customer's own free text, which
 * the renderer escapes and truncates.
 */
export function jobRequestEmailDetails(job: JobDto): NotificationEmailDetail[] {
  const details: NotificationEmailDetail[] = [
    { label: 'Job reference', value: job.reference },
    { label: 'Service', value: job.service.name },
    { label: 'Location', value: job.location },
  ];
  if (job.preferredDate) details.push({ label: 'Preferred date', value: job.preferredDate });
  const time = scheduledTimeOfDay(job.scheduledAt);
  if (time) details.push({ label: 'Preferred time', value: time });
  details.push({ label: 'What the customer needs', value: job.description });
  return details;
}

/** The multer file shape the request-image route hands to the service. */
export interface RequestImageUpload {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export class JobsService {
  constructor(
    private readonly jobs: JobsStore,
    private readonly marketplace: MarketplaceStore,
    private readonly users: UserRepository,
    private readonly quotes?: JobQuotesReader,
    /**
     * Stage 8 — central notification delivery (in-app only). Optional
     * so pre-8 constructions keep compiling; Stage 8 wiring supplies
     * the shared service. Delivery is best-effort: a failure here
     * never rolls back the committed job request.
     */
    private readonly notify?: NotificationService,
    /**
     * Stage 8 — provider → login-user resolution for JOB_REQUEST
     * recipients. The live quotes store implements it; the structural
     * `quotes` reader above does not promise it, so this stays a
     * separate optional capability with a runtime guard.
     */
    private readonly providerDirectory?: {
      findUserIdsForProvider(
        providerType: 'professional' | 'business',
        providerNumericId: string,
      ): Promise<string[]>;
    },
    /**
     * Where request photo bytes go. Optional so pre-existing constructions keep
     * compiling; without it the upload route reports a clear 501-shaped error
     * rather than pretending to store the file.
     */
    private readonly storage?: FileStorage,
    /**
     * Operations alert for a newly posted job request. Optional, and LAST in
     * the parameter list on purpose: inserting it earlier would shift the
     * positional arguments of every existing construction.
     */
    private readonly opsAlert?: OpsAlertSender,
  ) {}

  async createMarketplaceJob(authUserId: string, authEmail: string, body: unknown): Promise<ServiceResult<JobDto>> {
    const roles = await this.users.getRoles(authUserId);
    if (!roles.includes('CUSTOMER')) {
      return fail(403, 'FORBIDDEN_ROLE', 'Only customers can request jobs.');
    }

    const { input, error } = validateCreateJob(body);
    if (!input || error) {
      const failure = error ?? { status: 422, code: 'VALIDATION_ERROR', message: 'Invalid job request.' };
      return fail(failure.status, failure.code, failure.message);
    }

    let customer = await this.jobs.findCustomerProfileByUserId(authUserId);
    if (!customer) {
      // Legacy fallback. Registration now provisions `customer_profiles` in the
      // same transaction as the account, so a new customer always has one.
      // This still covers accounts created before that change, and any
      // customer provisioned outside registration, so the job request can
      // never fail for want of an ownership row.
      const names = provisionCustomerNames(authEmail);
      customer = await this.jobs.createCustomerProfile(authUserId, {
        firstName: names.firstName,
        lastName: names.lastName,
        email: authEmail,
      });
    }

    // Step 14: `providerId` is optional. When the customer chose nobody the
    // request becomes an OPEN REQUEST and every provider-dependent gate below
    // is skipped — there is no provider to look up, and nothing to check them
    // against. The service lookup always runs: the category it resolves is
    // what open-request matching keys on.
    const chosenProviderId =
      input.providerType !== null && input.providerNumericId !== null
        ? `${input.providerType}-${input.providerNumericId}`
        : null;
    const provider = chosenProviderId ? await this.marketplace.getProviderById(chosenProviderId) : null;
    if (chosenProviderId && !provider) {
      return fail(404, 'NOT_FOUND', 'Provider not found.');
    }

    const service = await this.jobs.findActiveService(input.serviceId);
    if (!service) {
      return fail(404, 'NOT_FOUND', 'Service not found.');
    }

    if (provider) {
      const offersService = provider.services.some((tag) => tag.id === input.serviceId);
      if (!offersService) {
        return fail(422, 'VALIDATION_ERROR', 'The selected provider does not offer this service.');
      }
    }

    const year = new Date().getFullYear();
    const reference = `FL-${year}-${Date.now().toString().slice(-6)}`;
    const job = await this.jobs.createJob({
      reference,
      customerId: customer.id,
      providerType: input.providerType,
      providerNumericId: input.providerNumericId,
      providerName: provider?.name ?? null,
      serviceId: input.serviceId,
      description: input.description,
      location: input.location,
      scheduledAt: toScheduledAt(input.preferredDate, input.preferredTime),
      createdBy: authUserId,
    });
    // An addressed request tells one provider; an open request tells everyone
    // who matches it. Same method, different recipient set.
    await (provider ? this.emitJobRequest(job) : this.emitOpenRequestMatches(job));
    // Operations alert, after the job is committed. Best-effort: a mail relay
    // failure must not turn a successful request into an error response.
    await this.alertJobPosted(job, authEmail);
    return { status: 201, data: job };
  }

  /**
   * Stage 8 — JOB_REQUEST: notify the selected professional/business
   * that a customer requested work. Best-effort (never fails the
   * committed request); recipients resolve server-side from the
   * provider directory. The message carries only the service, the
   * customer-supplied location the provider already sees on the
   * request, and the reference — no private customer contact data.
   *
   * Stage 13: the same event is emailed to provider-side recipients
   * (see `docs/NOTIFICATIONS.md`). The email carries the details a
   * professional needs to decide whether to quote — service, reference,
   * location, preferred date and the customer's description — plus a link
   * to this exact request. The customer is referred to only as
   * "Customer": the request detail screen shows the privacy-limited
   * display name, and contact details stay out of email entirely so the
   * conversation and its audit trail remain on the platform.
   */
  /**
   * Tell the operations inbox that a job request was posted.
   *
   * Includes the customer's email and the full description, because the
   * operator needs to know who is asking and for what — this is the internal
   * inbox, and unlike the provider notification email it is not withheld.
   * Nothing credential-shaped is available here at all.
   */
  private async alertJobPosted(job: JobDto, customerEmail: string): Promise<void> {
    if (!this.opsAlert) return;
    await this.opsAlert.send({
      kind: 'JOB_POSTED',
      details: [
        { label: 'Reference', value: job.reference },
        { label: 'Service', value: job.service.name },
        { label: 'Request type', value: job.provider ? 'Chosen professional' : 'Open request' },
        { label: 'Provider', value: job.provider ? job.provider.name : 'Matching professionals' },
        { label: 'Location', value: job.location },
        { label: 'Preferred date', value: job.preferredDate ?? 'Not specified' },
        { label: 'Customer email', value: customerEmail },
        { label: 'Description', value: job.description },
      ],
    });
  }

  private async emitJobRequest(job: JobDto): Promise<void> {
    if (!this.notify || !this.providerDirectory) return;
    try {
      if (typeof this.providerDirectory.findUserIdsForProvider !== 'function') return;
      const addressee = job.provider;
      if (!addressee) return;
      const numeric = addressee.id.split('-')[1] ?? '';
      const userIds = await this.providerDirectory.findUserIdsForProvider(addressee.providerType, numeric);
      if (userIds.length === 0) return;
      await this.notify.createForUsers(userIds, {
        type: 'JOB_REQUEST',
        title: 'New job request',
        message: `${job.service.name} requested at ${job.location} (${job.reference}).`,
        referenceType: 'JOB',
        referenceId: job.id,
        email: { details: jobRequestEmailDetails(job) },
      });
    } catch {
      // Notification delivery is best-effort — the job request stands.
    }
  }

  /**
   * Step 14 — JOB_REQUEST_OPEN: tell every provider matching this open request
   * that new work is available in their category and area.
   *
   * Two deliberate bounds:
   *
   * - Recipients are capped (MAX_OPEN_REQUEST_MATCHES) so one customer cannot
   *   turn a single POST into thousands of notifications.
   * - The whole thing is best-effort. A request that matches nobody is still
   *   a perfectly valid request: it sits in the customer's job list and the
   *   customer can go and choose a professional from the marketplace. Failing
   *   the POST here would punish the customer for the platform's coverage
   *   gaps, which is the wrong person to pay for them.
   *
   * The copy is the same privacy-limited set as an addressed request: service,
   * location, reference. No customer name, no contact details.
   */
  private async emitOpenRequestMatches(job: JobDto): Promise<void> {
    if (!this.notify) return;
    let matches: Awaited<ReturnType<MarketplaceStore['findOpenRequestMatches']>>;
    try {
      matches = await this.marketplace.findOpenRequestMatches(
        job.service.categoryId,
        job.location,
        MAX_OPEN_REQUEST_MATCHES,
      );
    } catch {
      return;
    }
    if (matches.length === 0) return;

    const recipients = new Map<string, string[]>();
    for (const match of matches) {
      if (!this.providerDirectory || typeof this.providerDirectory.findUserIdsForProvider !== 'function') return;
      try {
        const userIds = await this.providerDirectory.findUserIdsForProvider(match.providerType, match.numericId);
        for (const userId of userIds) {
          const bucket = recipients.get(userId) ?? [];
          bucket.push(match.providerType);
          recipients.set(userId, bucket);
        }
      } catch {
        // One unresolvable provider must not abort the rest of the fan-out.
      }
    }
    if (recipients.size === 0) return;

    await this.notify
      .createForUsers([...recipients.keys()], {
        type: 'JOB_REQUEST_OPEN',
        title: 'New job request in your area',
        message: `${job.service.name} requested at ${job.location} (${job.reference}). Quote before other professionals do.`,
        referenceType: 'JOB',
        referenceId: job.id,
        email: { details: jobRequestEmailDetails(job) },
      })
      .catch(() => {
        // Best-effort — the open request stands even if nobody was told.
      });
  }

  /**
   * Step 15 - correct an owned request.
   *
   * The gate is "not yet accepted", enforced in the store under a row lock so it
   * cannot be lost to a concurrent acceptance (see JobsStore.updateJob).
   *
   * Returns the quote warning alongside the job rather than leaving the UI to
   * guess. Existing quotes are deliberately KEPT: they were priced on what the
   * professional read, and a quote is the professional's to withdraw, not the
   * customer's to retract. The customer is told.
   *
   * On an open request, moving the location re-runs category and area matching,
   * because the move may bring new professionals into range - that is the whole
   * point of moving it. An edit that leaves the location alone sends nothing.
   */
  async updateJob(authUserId: string, jobId: string, body: unknown): Promise<ServiceResult<UpdatedJobDto>> {
    const denied = await this.requireCustomer(authUserId, 'Only the customer who requested this job can change it.');
    if (denied) return denied;
    if (!/^[1-9][0-9]*$/.test(jobId.trim())) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    }
    const { input, error } = validateUpdateJob(body);
    if (!input || error) {
      const failure = error ?? { status: 422, code: 'VALIDATION_ERROR', message: 'Invalid changes.' };
      return fail(failure.status, failure.code, failure.message);
    }
    const owned = await this.requireOwnedJob(authUserId, jobId.trim());
    if ('error' in owned) return fail(owned.error.status, owned.error.code, owned.error.message);

    const before = owned.job;
    // `null` on a date or time means "clear it"; that is the only way to remove
    // a preference, so it must survive the combine into `scheduled_at`.
    const scheduledAt = this.combineScheduledSlot(before, input);
    const locationChanged =
      input.location !== undefined && input.location.trim() !== before.location.trim();

    try {
      await this.jobs.updateJob({
        jobId: before.id,
        patch: {
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.location !== undefined ? { location: input.location } : {}),
          ...(scheduledAt !== undefined ? { scheduledAt } : {}),
        },
      });
    } catch (err) {
      if (err instanceof JobNotMutableError) {
        return err.reason === 'NOT_FOUND'
          ? fail(404, 'NOT_FOUND', 'Job not found.')
          : fail(409, 'CONFLICT', err.message);
      }
      throw err;
    }

    const updated = await this.jobs.getJobById(before.id);
    if (!updated) return fail(404, 'NOT_FOUND', 'Job not found.');
    const quotedRequestsChanged = await this.hasActiveQuotes(before.id);

    if (locationChanged && updated.provider === null) {
      await this.emitOpenRequestMatches(updated);
    }
    return { status: 200, data: { job: updated, quotedRequestsChanged } };
  }

  /**
   * Step 15 - withdraw a request while keeping its record.
   *
   * Cancel rather than delete: the job stays in the customer's list at
   * CANCELLED with its history intact, which is the honest outcome for "I found
   * someone cheaper". Deleting is a separate operation for "that was a
   * mistake".
   */
  async cancelJob(authUserId: string, jobId: string): Promise<ServiceResult<JobDto>> {
    const denied = await this.requireCustomer(authUserId, 'Only the customer who requested this job can cancel it.');
    if (denied) return denied;
    if (!/^[1-9][0-9]*$/.test(jobId.trim())) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    }
    const owned = await this.requireOwnedJob(authUserId, jobId.trim());
    if ('error' in owned) return fail(owned.error.status, owned.error.code, owned.error.message);

    try {
      const cancelled = await this.jobs.cancelJob(owned.job.id, authUserId);
      await this.emitWithdrawn(cancelled, 'cancel');
      return { status: 200, data: cancelled };
    } catch (err) {
      if (err instanceof JobNotMutableError) {
        return err.reason === 'NOT_FOUND'
          ? fail(404, 'NOT_FOUND', 'Job not found.')
          : fail(409, 'CONFLICT', err.message);
      }
      throw err;
    }
  }

  /**
   * Step 15 - soft delete an owned request.
   *
   * The row, its quotes, its history, its assignments and its photos all
   * survive; only `deleted_at` is set, which is what makes a request a
   * professional already quoted stay auditable.
   */
  async deleteJob(authUserId: string, jobId: string): Promise<ServiceResult<{ deleted: true }>> {
    const denied = await this.requireCustomer(authUserId, 'Only the customer who requested this job can delete it.');
    if (denied) return denied;
    if (!/^[1-9][0-9]*$/.test(jobId.trim())) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    }
    const owned = await this.requireOwnedJob(authUserId, jobId.trim());
    if ('error' in owned) return fail(owned.error.status, owned.error.code, owned.error.message);

    // Notify BEFORE the delete: afterwards the job is no longer readable, so
    // resolving recipients from the row would be impossible.
    await this.emitWithdrawn(owned.job, 'delete');
    try {
      await this.jobs.deleteJob(owned.job.id);
      return { status: 200, data: { deleted: true } };
    } catch (err) {
      if (err instanceof JobNotMutableError) {
        return err.reason === 'NOT_FOUND'
          ? fail(404, 'NOT_FOUND', 'Job not found.')
          : fail(409, 'CONFLICT', err.message);
      }
      throw err;
    }
  }

  /**
   * Combine the edited date/time preference into `scheduled_at`.
   *
   * Returns `undefined` when neither changed, so an edit to the description
   * alone never rewrites the schedule. A date with no time defaults to 09:00,
   * matching create; clearing the date clears the whole slot.
   */
  private combineScheduledSlot(job: JobDto, input: UpdateJobInput): string | null | undefined {
    const dateTouched = input.preferredDate !== undefined;
    const timeTouched = input.preferredTime !== undefined;
    if (!dateTouched && !timeTouched) return undefined;
    const date = dateTouched ? input.preferredDate ?? null : job.preferredDate;
    if (date === null) return null;
    const time = timeTouched ? input.preferredTime ?? null : scheduledTimeOfDay(job.scheduledAt);
    return `${date} ${time ?? '09:00'}:00`;
  }

  /** Are there active (DRAFT/SUBMITTED) quotes on this job right now? */
  private async hasActiveQuotes(jobId: string): Promise<boolean> {
    try {
      const quotes = await this.quotes?.listQuotesByJobId(jobId);
      return (quotes ?? []).some((quote) => quote.status === 'DRAFT' || quote.status === 'SUBMITTED');
    } catch {
      // A failed count must not block the edit itself; the warning is advisory.
      return false;
    }
  }

  /**
   * Tell the people who were relying on this request that it is gone.
   *
   * Recipients are the addressed provider and every professional holding a live
   * quote. Best-effort, and never allowed to fail the operation the customer
   * asked for.
   */
  private async emitWithdrawn(job: JobDto, kind: 'cancel' | 'delete'): Promise<void> {
    if (!this.notify) return;
    const reference = job.reference;
    const service = job.service.name;
    const title = kind === 'cancel' ? 'Job request cancelled' : 'Job request withdrawn';
    const message =
      kind === 'cancel'
        ? `The customer cancelled ${service} (${reference}).`
        : `The customer deleted ${service} (${reference}).`;
    try {
      const recipients = new Set<string>();
      if (job.provider !== null && this.providerDirectory) {
        const numeric = job.provider.id.split('-')[1] ?? '';
        for (const userId of await this.providerDirectory.findUserIdsForProvider(
          job.provider.providerType,
          numeric,
        )) {
          recipients.add(userId);
        }
      }
      if (this.quotes && this.providerDirectory) {
        for (const quote of await this.quotes.listQuotesByJobId(job.id)) {
          if (quote.status !== 'DRAFT' && quote.status !== 'SUBMITTED') continue;
          const numeric = quote.provider.id.split('-')[1] ?? '';
          for (const userId of await this.providerDirectory
            .findUserIdsForProvider(quote.provider.providerType, numeric)
            .catch(() => [])) {
            recipients.add(userId);
          }
        }
      }
      if (recipients.size === 0) return;
      await this.notify.createForUsers([...recipients], {
        type: 'JOB_CANCELLED',
        title,
        message,
        referenceType: 'JOB',
        referenceId: job.id,
      });
    } catch {
      // Best-effort - the cancellation or delete still stands.
    }
  }

  /** 403 unless the caller is a CUSTOMER, else null. */
  private async requireCustomer(authUserId: string, message: string): Promise<Failure | null> {
    const roles = await this.users.getRoles(authUserId);
    return roles.includes('CUSTOMER') ? null : failure(403, 'FORBIDDEN_ROLE', message);
  }

  /**
   * Resolve an owned MARKETPLACE job, or the failure to report.
   *
   * Ownership is part of existence: another customer's job, an internal
   * business job, and a soft-deleted job all read as 404 so ids cannot be
   * probed across accounts.
   */
  private async requireOwnedJob(authUserId: string, jobId: string): Promise<{ job: JobDto } | { error: Failure }> {
    const customer = await this.jobs.findCustomerProfileByUserId(authUserId);
    const job = customer ? await this.jobs.getJobById(jobId) : null;
    if (!job || job.source !== 'MARKETPLACE' || job.customerId !== customer?.id) {
      return { error: failure(404, 'NOT_FOUND', 'Job not found.') };
    }
    return { job };
  }

  async listMyJobs(
    authUserId: string,
    query: Record<string, unknown>,
  ): Promise<ServiceResult<{ items: JobDto[]; total: number; page: number; pageSize: number }>> {
    const roles = await this.users.getRoles(authUserId);
    if (!roles.includes('CUSTOMER')) {
      return fail(403, 'FORBIDDEN_ROLE', 'Only customers can view their jobs.');
    }
    const page = readPage(query['page'], 1, 1000);
    const pageSize = readPage(query['pageSize'] ?? query['page_size'], 20, 50);
    if (page === null || pageSize === null) {
      return fail(422, 'VALIDATION_ERROR', 'Invalid pagination. Use page 1-1000 and pageSize 1-50.');
    }
    const customer = await this.jobs.findCustomerProfileByUserId(authUserId);
    if (!customer) return { status: 200, data: { items: [], total: 0, page, pageSize } };
    const result = await this.jobs.listJobsByCustomerId(customer.id, page, pageSize);
    return { status: 200, data: { ...result, page, pageSize } };
  }

  async getMyJobById(authUserId: string, jobId: string): Promise<ServiceResult<JobWithQuotes>> {
    const roles = await this.users.getRoles(authUserId);
    if (!roles.includes('CUSTOMER')) {
      return fail(403, 'FORBIDDEN_ROLE', 'Only customers can view their jobs.');
    }
    if (!/^[1-9][0-9]*$/.test(jobId.trim())) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    }
    const customer = await this.jobs.findCustomerProfileByUserId(authUserId);
    const job = customer ? await this.jobs.getJobById(jobId.trim()) : null;
    // Ownership is part of existence: another customer's job reads as 404
    // so job ids cannot be probed across accounts.
    if (!job || job.source !== 'MARKETPLACE' || job.customerId !== customer?.id) {
      return fail(404, 'NOT_FOUND', 'Job not found.');
    }
    const quotes = this.quotes ? await this.quotes.listQuotesByJobId(job.id) : [];
    return { status: 200, data: { ...job, quotes } };
  }

  /**
   * Attach a photo of the problem to a request the caller owns.
   *
   * This is the customer's evidence, not the professional's work record: rows
   * land with context 'REQUEST' so they can never be mistaken for a
   * Before/During/After execution photo (migration 017).
   *
   * Order of operations matters. Authorization and the file checks run before
   * anything is written, the bytes go to storage, and only then is the row
   * inserted. If the insert is refused — the job moved past QUOTED, or the
   * per-job cap was reached — the just-written file is deleted, so a failed
   * upload never leaves an orphan on disk.
   */
  async uploadRequestImage(
    authUserId: string,
    jobId: string,
    file: RequestImageUpload | null | undefined,
  ): Promise<ServiceResult<JobImageDto>> {
    if (!this.storage) {
      return fail(503, 'INTERNAL_ERROR', 'Photo uploads are not available right now.');
    }
    if (!/^[1-9][0-9]*$/.test(jobId.trim())) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    }
    // Role first. A non-customer is refused before any job lookup, so the
    // answer never depends on which job id they guessed.
    const roles = await this.users.getRoles(authUserId);
    if (!roles.includes('CUSTOMER')) {
      return fail(403, 'FORBIDDEN_ROLE', 'Only the customer who requested this job can add photos to it.');
    }
    const customer = await this.jobs.findCustomerProfileByUserId(authUserId);
    if (!customer) {
      return fail(404, 'NOT_FOUND', 'No customer profile found for your account.');
    }
    // Ownership comes from the session, never the request. Another customer's
    // job reads as 404 so job ids cannot be probed across customers.
    const job = await this.jobs.getJobById(jobId.trim());
    if (!job || job.customerId !== customer.id) {
      return fail(404, 'NOT_FOUND', 'Job not found.');
    }

    const checked = validateJobImageUpload(file);
    if ('error' in checked) return fail(422, 'VALIDATION_ERROR', checked.error);
    const upload = file as RequestImageUpload;

    let stored: { storageKey: string; size: number };
    try {
      stored = await this.storage.save(job.id, upload.buffer, checked.extension);
    } catch {
      return fail(500, 'INTERNAL_ERROR', 'Could not store the photo. Please try again.');
    }
    try {
      const image = await this.jobs.createRequestImage({
        jobId: job.id,
        uploadedBy: authUserId,
        storageKey: stored.storageKey,
        originalFilename: sanitizeOriginalFilename(upload.originalname),
        mimeType: checked.mime,
        size: stored.size,
      });
      return { status: 201, data: image };
    } catch (err) {
      // Roll the orphaned file back so a rejected upload leaves nothing behind.
      await this.storage.remove(stored.storageKey).catch(() => undefined);
      if (err instanceof JobRequestImageRejected) {
        const status = err.reason === 'NOT_FOUND' ? 404 : err.reason === 'TOO_MANY' ? 422 : 409;
        return fail(status, err.reason === 'NOT_FOUND' ? 'NOT_FOUND' : 'VALIDATION_ERROR', err.message);
      }
      throw err;
    }
  }
}

function readPage(value: unknown, fallback: number, max: number): number | null {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const num = Number(String(value).trim());
  if (!Number.isInteger(num) || num < 1 || num > max) return null;
  return num;
}
