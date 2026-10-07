/**
 * Fixlynk Stage 6B — in-memory jobs store for automated tests.
 *
 * Mirrors the MySQL implementation's rules (server-side ownership,
 * MARKETPLACE source, REQUESTED status, active-service check) without
 * requiring a database. Fixture services mirror the marketplace catalogue
 * ids so provider/service eligibility matches production seed data.
 */
import {
  JobNotMutableError,
  JobRequestImageRejected,
  OPEN_REQUEST_SCAN_LIMIT,
  type CustomerProvision,
  type JobsStore,
  type OpenJobQuery,
} from './jobs.store';
import type {
  ActiveServiceRef,
  CustomerProfileRef,
  JobDto,
  PersistJobInput,
  RequestImagePersistInput,
} from './jobs.types';
import { CUSTOMER_MUTABLE_STATUSES, MAX_REQUEST_IMAGES_PER_JOB, REQUEST_IMAGE_STATUSES } from './jobs.types';
import type { PersistJobUpdateInput } from './jobs.types';
import type { JobImageDto } from '../execution/execution.types';

const ACTIVE_SERVICES: ActiveServiceRef[] = [
  { id: '1', name: 'Leak Repair & Pipe Fixes', slug: 'leak-repair', categoryId: '1', categoryName: 'Plumbing' },
  { id: '2', name: 'Geyser Installation & Repair', slug: 'geyser-install-repair', categoryId: '1', categoryName: 'Plumbing' },
  { id: '3', name: 'Drain Unblocking', slug: 'drain-unblocking', categoryId: '1', categoryName: 'Plumbing' },
  { id: '4', name: 'DB Board & Wiring Repairs', slug: 'db-board-wiring', categoryId: '2', categoryName: 'Electrical' },
  { id: '5', name: 'Lighting Installation', slug: 'lighting-installation', categoryId: '2', categoryName: 'Electrical' },
  { id: '6', name: 'Interior Painting', slug: 'interior-painting', categoryId: '3', categoryName: 'Painting' },
  { id: '7', name: 'Exterior Painting', slug: 'exterior-painting', categoryId: '3', categoryName: 'Painting' },
  { id: '8', name: 'Wall Crack & Plaster Repair', slug: 'wall-crack-plaster-repair', categoryId: '4', categoryName: 'Building & Renovation' },
  { id: '9', name: 'General Handyman', slug: 'general-handyman', categoryId: '5', categoryName: 'Handyman' },
  { id: '10', name: 'Appliance Repair', slug: 'appliance-repair', categoryId: '6', categoryName: 'Appliances' },
  { id: '11', name: 'Aircon Service & Install', slug: 'aircon-service-install', categoryId: '7', categoryName: 'Air Conditioning' },
  { id: '12', name: 'Garden Cleanup & Maintenance', slug: 'garden-cleanup-maintenance', categoryId: '8', categoryName: 'Gardening' },
  { id: '13', name: 'Home Deep Cleaning', slug: 'home-deep-cleaning', categoryId: '9', categoryName: 'Cleaning' },
];

function nowIso(): string {
  return new Date().toISOString();
}

export class MemoryJobsStore implements JobsStore {
  private jobSeq = 0;
  /** Step 15 - soft-deleted job ids. Mirrors `jobs.deleted_at IS NOT NULL`. */
  private readonly deleted = new Set<string>();
  private customerSeq = 0;
  private readonly jobs = new Map<string, JobDto>();
  private readonly customerByUserId = new Map<string, CustomerProfileRef>();
  private readonly customerNames = new Map<string, { firstName: string; lastName: string }>();
  /** jobId -> number of customer request photos, for the per-job cap. */
  private readonly requestImages = new Map<string, number>();
  /** jobId -> history entries, mirroring `job_status_history` for assertions. */
  private readonly history: Array<{ jobId: string; previous: string | null; next: string; changedBy?: string; reason?: string }> = [];

  async findCustomerProfileByUserId(userId: string): Promise<CustomerProfileRef | null> {
    return this.customerByUserId.get(userId) ?? null;
  }

  /**
   * Stage 8 — reverse lookup for notification recipients: the login
   * user id behind a marketplace customer profile.
   */
  async findUserIdByCustomerId(customerId: string): Promise<string | null> {
    for (const [userId, profile] of this.customerByUserId) {
      if (profile.id === customerId) return userId;
    }
    return null;
  }

  async createCustomerProfile(userId: string, provision: CustomerProvision): Promise<CustomerProfileRef> {
    const existing = this.customerByUserId.get(userId);
    if (existing) return existing;
    this.customerSeq += 1;
    const profile: CustomerProfileRef = { id: String(this.customerSeq) };
    this.customerByUserId.set(userId, profile);
    this.customerNames.set(profile.id, { firstName: provision.firstName, lastName: provision.lastName });
    return profile;
  }

  async findActiveService(serviceId: string): Promise<ActiveServiceRef | null> {
    return ACTIVE_SERVICES.find((s) => s.id === serviceId) ?? null;
  }

  async createJob(input: PersistJobInput): Promise<JobDto> {
    this.jobSeq += 1;
    const now = nowIso();
    const preferredDate = input.scheduledAt === null ? null : input.scheduledAt.slice(0, 10);
    const service = ACTIVE_SERVICES.find((s) => s.id === input.serviceId);
    const job: JobDto = {
      id: String(this.jobSeq),
      reference: input.reference,
      source: 'MARKETPLACE',
      status: 'REQUESTED',
      customerId: input.customerId,
      // Step 14: null provider type + id together means an open request.
      provider:
        input.providerType !== null && input.providerNumericId !== null
          ? {
              id: `${input.providerType}-${input.providerNumericId}`,
              providerType: input.providerType,
              name: input.providerName ?? `${input.providerType}-${input.providerNumericId}`,
            }
          : null,
      service: {
        id: input.serviceId,
        name: service?.name ?? 'Service',
        slug: service?.slug ?? 'service',
        categoryId: service?.categoryId ?? '',
        categoryName: service?.categoryName ?? '',
      },
      description: input.description,
      location: input.location,
      city: null,
      province: null,
      preferredDate,
      // Wall-clock echo of the submitted date/time (no timezone shift), so
      // the preferred slot the customer picked is what the API reports.
      scheduledAt: input.scheduledAt === null ? null : input.scheduledAt.replace(' ', 'T'),
      // Stage 6D: no agreed amount until the customer accepts a quote.
      agreedAmount: null,
      currency: 'ZAR',
      // Stage 6F: terminal timestamps, null until each transition runs.
      completedAt: null,
      confirmedAt: null,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  /**
   * Step 14 — open requests this provider's categories reach. No area test
   * here (see the store contract): the service narrows and paginates.
   */
  async listOpenJobs(query: OpenJobQuery): Promise<JobDto[]> {
    if (query.categoryIds.length === 0) return [];
    const categories = new Set(query.categoryIds);
    const quoted = new Set(query.quotedJobIds);
    return [...this.jobs.values()]
      .filter(
        (job) =>
          !this.deleted.has(job.id) &&
          job.source === 'MARKETPLACE' &&
          job.provider === null &&
          (query.statuses as string[]).includes(job.status) &&
          categories.has(job.service.categoryId),
      )
      .filter((job) => !quoted.has(job.id))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, OPEN_REQUEST_SCAN_LIMIT);
  }

  async createRequestImage(input: RequestImagePersistInput): Promise<JobImageDto> {
    const job = await this.getJobById(input.jobId);
    if (!job) throw new JobRequestImageRejected('NOT_FOUND', 'Job not found.');
    if (!REQUEST_IMAGE_STATUSES.includes(job.status)) {
      throw new JobRequestImageRejected(
        'INVALID_STATE',
        'This request is no longer accepting photos of the problem.',
      );
    }
    const existing = this.requestImages.get(input.jobId) ?? 0;
    if (existing >= MAX_REQUEST_IMAGES_PER_JOB) {
      throw new JobRequestImageRejected(
        'TOO_MANY',
        `You can attach up to ${MAX_REQUEST_IMAGES_PER_JOB} photos to a request.`,
      );
    }
    this.requestImages.set(input.jobId, existing + 1);
    return {
      id: `${input.jobId}-request-${existing + 1}`,
      jobId: input.jobId,
      uploadedBy: input.uploadedBy,
      // See the MySQL store: BEFORE is the only honest phase for a photo taken
      // before any work; `context` is what marks it as customer evidence.
      phase: 'BEFORE',
      context: 'REQUEST',
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      size: input.size,
      createdAt: new Date().toISOString(),
    };
  }

  async getJobById(jobId: string): Promise<JobDto | null> {
    if (this.deleted.has(jobId)) return null;
    return this.jobs.get(jobId) ?? null;
  }

  /**
   * Step 15 - apply a customer edit, mirroring the MySQL store: gate first,
   * mutate only the supplied keys, and refuse once a quote is accepted.
   */
  async updateJob(input: PersistJobUpdateInput): Promise<JobDto> {
    const job = this.requireMutable(input.jobId);
    const next: JobDto = { ...job, updatedAt: nowIso() };
    if (input.patch.description !== undefined) next.description = input.patch.description;
    if (input.patch.location !== undefined) next.location = input.patch.location;
    if (input.patch.scheduledAt !== undefined) {
      next.scheduledAt = input.patch.scheduledAt === null ? null : input.patch.scheduledAt.replace(' ', 'T');
      next.preferredDate = input.patch.scheduledAt === null ? null : input.patch.scheduledAt.slice(0, 10);
    }
    this.jobs.set(input.jobId, next);
    return next;
  }

  async cancelJob(jobId: string, cancelledBy: string): Promise<JobDto> {
    const job = this.requireMutable(jobId);
    const previous = job.status;
    const next: JobDto = { ...job, status: 'CANCELLED', updatedAt: nowIso() };
    this.jobs.set(jobId, next);
    this.history.push({ jobId, previous, next: 'CANCELLED', changedBy: cancelledBy, reason: 'Customer cancelled request' });
    return next;
  }

  async deleteJob(jobId: string): Promise<void> {
    // Gate first, exactly as the MySQL store does, so an accepted job cannot
    // be deleted by racing the acceptance.
    this.requireMutable(jobId);
    // No history row: a delete is not a status transition.
    this.deleted.add(jobId);
  }

  /** Resolve a job the customer may still change, or throw the right reason. */
  private requireMutable(jobId: string): JobDto {
    if (this.deleted.has(jobId)) throw new JobNotMutableError('NOT_FOUND', 'Job not found.');
    const job = this.jobs.get(jobId);
    if (!job) throw new JobNotMutableError('NOT_FOUND', 'Job not found.');
    if (!(CUSTOMER_MUTABLE_STATUSES as readonly string[]).includes(job.status)) {
      throw new JobNotMutableError();
    }
    return job;
  }

  async listJobsByCustomerId(
    customerId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: JobDto[]; total: number }> {
    const owned = [...this.jobs.values()]
      .filter((job) => !this.deleted.has(job.id))
      .filter((job) => job.customerId === customerId && job.source === 'MARKETPLACE')
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const start = (page - 1) * pageSize;
    return { items: owned.slice(start, start + pageSize), total: owned.length };
  }

  /**
   * Stage 6C test helpers (mirror the `debug*` convention): the quotes
   * store reads shared job rows so customer creation and provider quoting
   * stay consistent in tests. Production uses SQL joins instead.
   */
  async debugAllJobs(): Promise<JobDto[]> {
    return [...this.jobs.values()];
  }

  debugCustomerNames(customerId: string): { firstName: string; lastName: string } | null {
    return this.customerNames.get(customerId) ?? null;
  }

  debugSetJobStatus(jobId: string, status: JobDto['status']): void {
    const job = this.jobs.get(jobId);
    if (job) this.jobs.set(jobId, { ...job, status, updatedAt: nowIso() });
  }

  /**
   * Stage 6D test helper: record acceptance exactly as the quotes store
   * does (status ACCEPTED + agreed amount/currency). Production updates
   * these columns in the same acceptance transaction.
   */
  /**
   * Step 15 - status-history entries written by THIS store (mirrors
   * `job_status_history`). Acceptance is written by the quotes store, so what
   * this covers is the customer's cancellation.
   */
  debugHistory(): Array<{ jobId: string; previous: string | null; next: string; changedBy?: string; reason?: string }> {
    return [...this.history];
  }

  /**
   * Step 15 - is this job soft-deleted? Mirrors `jobs.deleted_at IS NOT NULL`
   * so the quotes store can filter reads exactly as its SQL does.
   */
  debugIsDeleted(jobId: string): boolean {
    return this.deleted.has(jobId);
  }

  /**
   * Step 15 test helper (mirrors what `updateJob` does through the quotes
   * store): record acceptance so a gate can be exercised without a full quote
   * round-trip.
   */
  debugSetJobAccepted(jobId: string, agreedAmount: number, currency: string): void {
    const job = this.jobs.get(jobId);
    if (job) this.jobs.set(jobId, { ...job, status: 'ACCEPTED', agreedAmount, currency, updatedAt: nowIso() });
  }

  /**
   * Stage 6E helper used by the memory quotes store: record scheduling
   * (status SCHEDULED + normalized UTC ISO instant). Production updates
   * these columns in the same scheduling transaction.
   */
  debugSetJobScheduled(jobId: string, scheduledAtIso: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      this.jobs.set(jobId, {
        ...job,
        status: 'SCHEDULED',
        scheduledAt: scheduledAtIso,
        preferredDate: scheduledAtIso.slice(0, 10),
        updatedAt: nowIso(),
      });
    }
  }

  /** Stage 6E helper used by the memory quotes store: record a job start. */
  debugSetJobInProgress(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job) this.jobs.set(jobId, { ...job, status: 'IN_PROGRESS', updatedAt: nowIso() });
  }

  /** Stage 6F helper used by the memory execution store: record completion. */
  debugSetJobCompleted(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      this.jobs.set(jobId, { ...job, status: 'COMPLETED', completedAt: nowIso(), updatedAt: nowIso() });
    }
  }

  /** Stage 6F helper used by the memory execution store: record confirmation. */
  debugSetJobConfirmed(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      this.jobs.set(jobId, { ...job, status: 'CONFIRMED', confirmedAt: nowIso(), updatedAt: nowIso() });
    }
  }

  /** Stage 6F helper used by the memory execution store: record closure. */
  debugSetJobClosed(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      this.jobs.set(jobId, { ...job, status: 'CLOSED', closedAt: nowIso(), updatedAt: nowIso() });
    }
  }

  /** Stage 6D test helper: simulate a non-marketplace job row. */
  debugSetJobSource(jobId: string, source: JobDto['source']): void {
    const job = this.jobs.get(jobId);
    if (job) this.jobs.set(jobId, { ...job, source, updatedAt: nowIso() });
  }

  /**
   * Step 14 test helper: address an open request to the provider whose quote
   * the customer accepted. Mirrors what `acceptQuote` writes in production —
   * `jobs.professional_id` / `jobs.business_id` plus the provider
   * `job_assignments` row an open request does not get at creation.
   */
  debugSetJobProvider(
    jobId: string,
    providerType: 'professional' | 'business',
    providerNumericId: string,
    providerName: string,
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    this.jobs.set(jobId, {
      ...job,
      // The real store resolves the name by joining `professional_profiles` /
      // `business_profiles`, so the name comes from the quote, not the id.
      provider: { id: `${providerType}-${providerNumericId}`, providerType, name: providerName },
      updatedAt: nowIso(),
    });
  }
}

function toIso(scheduledAt: string): string {
  // `YYYY-MM-DD HH:MM:SS` (local server time) -> ISO for API consumers.
  return new Date(scheduledAt.replace(' ', 'T')).toISOString();
}
