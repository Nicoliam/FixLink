/**
 * FixLink Stage 6F — job execution & work-documentation service.
 *
 * Owns the marketplace execution segment: BEFORE/DURING/AFTER photos and
 * notes while IN_PROGRESS, provider completion (IN_PROGRESS → COMPLETED)
 * and customer confirmation with server-side closure
 * (COMPLETED → CONFIRMED → CLOSED). Provider identity and customer
 * ownership are always derived server-side — never from request
 * parameters. TECHNICIANS are not enabled for marketplace execution in
 * this stage; CUSTOMERs can never perform provider actions.
 */
import type { FileStorage } from '../../services/file-storage';
import {
  JOB_IMAGE_ALLOWED_MIME,
  JOB_IMAGE_MAX_BYTES,
  detectImageType,
  extensionForMime,
  sanitizeOriginalFilename,
} from '../../services/file-storage';
import type { JobsStore } from '../jobs/jobs.store';
import type { JobDto } from '../jobs/jobs.types';
import type { NotificationService } from '../notifications/notifications.service';
import type { QuotesStore } from '../quotes/quotes.store';
import type { JobWithQuotes } from '../quotes/quotes.types';
import type { UserRepository } from '../users/user.repository';
import {
  JobImageNotDeletableError,
  JobNotCompletableError,
  JobNotConfirmableError,
  JobNotExecutableError,
  type ExecutionStore,
} from './execution.store';
import type {
  CompleteJobResult,
  JobImageDto,
  JobTimelineDto,
  JobUpdateDto,
  TimelineEventDto,
} from './execution.types';
import { parseWorkPhase, validateCompletionNote, validateWorkUpdate } from './execution.validation';

export interface ServiceResult<T> {
  status: number;
  code?: string;
  message?: string;
  data?: T;
}

function fail<T>(status: number, code: string, message: string): ServiceResult<T> {
  return { status, code, message };
}

const PROVIDER_ROLES = ['PROFESSIONAL', 'BUSINESS_OWNER', 'BUSINESS_MANAGER'];

interface ProviderIdentity {
  professionalIds: string[];
  businessIds: string[];
}

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export class ExecutionService {
  constructor(
    private readonly jobs: JobsStore,
    private readonly quotes: QuotesStore,
    private readonly users: UserRepository,
    private readonly execution: ExecutionStore,
    private readonly storage: FileStorage,
    /**
     * Stage 8 — central notification delivery (in-app only). Optional
     * so pre-8 constructions keep compiling. Emissions run AFTER the
     * transition commits and are best-effort.
     */
    private readonly notify?: NotificationService,
  ) {}

  /**
   * Stage 8 — notify the parties that did not perform the action.
   * Recipients resolve server-side; messages carry only the service,
   * reference and outcome already visible to each party on the job.
   */
  private async emitCompletion(job: JobDto, actorUserId: string, kind: 'completed' | 'confirmed'): Promise<void> {
    if (!this.notify) return;
    try {
      const recipients: string[] = [];
      if (kind === 'completed') {
        const customer = await this.jobs.findUserIdByCustomerId(job.customerId).catch(() => null);
        if (customer) recipients.push(customer);
      }
      const numeric = job.provider.id.split('-')[1] ?? '';
      const providers = await this.quotes
        .findUserIdsForProvider(job.provider.providerType, numeric)
        .catch((): string[] => []);
      for (const id of providers) {
        if (id !== actorUserId) recipients.push(id);
      }
      if (recipients.length === 0) return;
      await this.notify.createForUsers(recipients, {
        type: kind === 'completed' ? 'JOB_COMPLETED' : 'JOB_CONFIRMED',
        title: kind === 'completed' ? 'Job completed' : 'Job confirmed',
        message:
          kind === 'completed'
            ? `Work completed on job ${job.reference}. Please review and confirm.`
            : `The customer confirmed completion of job ${job.reference}.`,
        referenceType: 'JOB',
        referenceId: job.id,
      });
    } catch {
      // Best-effort — the committed transition stands.
    }
  }

  /** Resolve the marketplace identities a user may act for, or null when the role has none. */
  private async resolveIdentity(authUserId: string): Promise<{ identity: ProviderIdentity } | { forbidden: string }> {
    const roles = await this.users.getRoles(authUserId);
    if (!roles.some((role) => PROVIDER_ROLES.includes(role))) {
      if (roles.includes('CUSTOMER')) return { forbidden: 'Only service providers can document work on jobs.' };
      if (roles.includes('TECHNICIAN')) return { forbidden: 'Technicians cannot perform marketplace job execution.' };
      return { forbidden: 'Your account cannot document work on jobs.' };
    }
    const identity: ProviderIdentity = { professionalIds: [], businessIds: [] };
    if (roles.includes('PROFESSIONAL')) {
      const professional = await this.quotes.findProfessionalProfileByUserId(authUserId);
      if (professional) identity.professionalIds.push(professional.id);
    }
    if (roles.includes('BUSINESS_OWNER') || roles.includes('BUSINESS_MANAGER')) {
      const businesses = await this.quotes.findBusinessIdsForUser(authUserId);
      identity.businessIds.push(...businesses.map((entry) => entry.businessId));
    }
    return { identity };
  }

  private isAddressedTo(job: JobDto, identity: ProviderIdentity): boolean {
    const numeric = job.provider.id.split('-')[1] ?? '';
    return job.provider.providerType === 'professional'
      ? identity.professionalIds.includes(numeric)
      : identity.businessIds.includes(numeric);
  }

  private validJobId(jobId: string): boolean {
    return /^[1-9][0-9]*$/.test(jobId.trim());
  }

  /**
   * Authorize a provider action on a marketplace job. Another provider's
   * job reads as 404 so job ids cannot be probed across providers;
   * customers, technicians and admins receive 403.
   */
  private async authorizeProviderJob(
    authUserId: string,
    jobId: string,
    action: string,
  ): Promise<{ job: JobDto } | { job: null; status: number; code: string; message: string }> {
    const resolved = await this.resolveIdentity(authUserId);
    if ('forbidden' in resolved) {
      const roles = await this.users.getRoles(authUserId);
      if (roles.includes('CUSTOMER')) {
        return { job: null, status: 403, code: 'FORBIDDEN_ROLE', message: `Only service providers can ${action}.` };
      }
      if (roles.includes('TECHNICIAN')) {
        return { job: null, status: 403, code: 'FORBIDDEN_ROLE', message: 'Technicians cannot perform marketplace job execution.' };
      }
      return { job: null, status: 403, code: 'FORBIDDEN_ROLE', message: resolved.forbidden };
    }
    const job = await this.jobs.getJobById(jobId.trim());
    if (!job || job.source !== 'MARKETPLACE' || !this.isAddressedTo(job, resolved.identity)) {
      return { job: null, status: 404, code: 'NOT_FOUND', message: 'Job not found.' };
    }
    return { job };
  }

  /**
   * Authorize the owning customer on a marketplace job. Another
   * customer's job reads as 404 so job ids cannot be probed.
   */
  private async authorizeCustomerJob(
    authUserId: string,
    jobId: string,
  ): Promise<{ job: JobDto } | { job: null; status: number; code: string; message: string }> {
    const roles = await this.users.getRoles(authUserId);
    if (!roles.includes('CUSTOMER')) {
      if (roles.some((role) => PROVIDER_ROLES.includes(role))) {
        return { job: null, status: 403, code: 'FORBIDDEN_ROLE', message: 'Only the customer who owns the job can perform this action.' };
      }
      if (roles.includes('TECHNICIAN')) {
        return { job: null, status: 403, code: 'FORBIDDEN_ROLE', message: 'Technicians cannot perform this action.' };
      }
      return { job: null, status: 403, code: 'FORBIDDEN_ROLE', message: 'Your account cannot perform this action.' };
    }
    const customer = await this.jobs.findCustomerProfileByUserId(authUserId);
    const job = customer ? await this.jobs.getJobById(jobId.trim()) : null;
    if (!job || job.source !== 'MARKETPLACE' || job.customerId !== customer?.id) {
      return { job: null, status: 404, code: 'NOT_FOUND', message: 'Job not found.' };
    }
    return { job };
  }

  /**
   * Authorize read access (images, updates, timeline, file bytes) for the
   * owning customer or the addressed provider. Unauthorized users must
   * not access private job media.
   */
  private async authorizeJobViewer(
    authUserId: string,
    jobId: string,
  ): Promise<{ job: JobDto } | { job: null; status: number; code: string; message: string }> {
    const roles = await this.users.getRoles(authUserId);
    const job = await this.jobs.getJobById(jobId.trim());
    if (!job || job.source !== 'MARKETPLACE') {
      return { job: null, status: 404, code: 'NOT_FOUND', message: 'Job not found.' };
    }
    if (roles.includes('CUSTOMER')) {
      const customer = await this.jobs.findCustomerProfileByUserId(authUserId);
      if (customer && job.customerId === customer.id) return { job };
      return { job: null, status: 404, code: 'NOT_FOUND', message: 'Job not found.' };
    }
    if (roles.some((role) => PROVIDER_ROLES.includes(role))) {
      const resolved = await this.resolveIdentity(authUserId);
      if (!('forbidden' in resolved) && this.isAddressedTo(job, resolved.identity)) return { job };
      return { job: null, status: 404, code: 'NOT_FOUND', message: 'Job not found.' };
    }
    return { job: null, status: 403, code: 'FORBIDDEN_ROLE', message: 'Your account cannot view this job.' };
  }

  private async withQuotes(job: JobDto): Promise<JobWithQuotes> {
    const quotes = await this.quotes.listQuotesByJobId(job.id);
    return { ...job, quotes };
  }

  private validateUploadFile(file: UploadedFile | null | undefined): { extension: 'jpg' | 'png' | 'webp'; mime: string } | { error: string } {
    if (!file || file.buffer.length === 0) return { error: 'An image file is required.' };
    if (file.size > JOB_IMAGE_MAX_BYTES || file.buffer.length > JOB_IMAGE_MAX_BYTES) {
      return { error: 'Image must be 5MB or smaller.' };
    }
    const claimed = file.mimetype.toLowerCase().trim();
    if (!(JOB_IMAGE_ALLOWED_MIME as readonly string[]).includes(claimed)) {
      return { error: 'Only JPEG, PNG or WebP images are allowed.' };
    }
    // Never trust the client-provided extension/MIME alone: the stored
    // type comes from the actual file content (magic bytes).
    const detected = detectImageType(file.buffer);
    if (!detected) return { error: 'Only JPEG, PNG or WebP images are allowed.' };
    if (detected !== claimed) return { error: 'Only JPEG, PNG or WebP images are allowed.' };
    return { extension: extensionForMime(detected), mime: detected };
  }

  async uploadImage(
    authUserId: string,
    jobId: string,
    phaseRaw: unknown,
    file: UploadedFile | null | undefined,
  ): Promise<ServiceResult<JobImageDto>> {
    if (!this.validJobId(jobId)) return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    const authz = await this.authorizeProviderJob(authUserId, jobId, 'upload job photos');
    if (!authz.job) return fail(authz.status, authz.code, authz.message);
    if (authz.job.status !== 'IN_PROGRESS') {
      return fail(422, 'VALIDATION_ERROR', 'This job is not accepting work documentation in its current state.');
    }
    const phase = parseWorkPhase(phaseRaw);
    if (!phase) return fail(422, 'VALIDATION_ERROR', 'Phase must be BEFORE, DURING or AFTER.');
    const checked = this.validateUploadFile(file);
    if ('error' in checked) return fail(422, 'VALIDATION_ERROR', checked.error);
    const uploaded = file as UploadedFile;
    let stored: { storageKey: string; size: number };
    try {
      stored = await this.storage.save(authz.job.id, uploaded.buffer, checked.extension);
    } catch {
      return fail(500, 'INTERNAL_ERROR', 'Could not store the image. Please try again.');
    }
    try {
      const image = await this.execution.createImage({
        jobId: authz.job.id,
        uploadedBy: authUserId,
        phase,
        storageKey: stored.storageKey,
        originalFilename: sanitizeOriginalFilename(uploaded.originalname),
        mimeType: checked.mime,
        size: stored.size,
      });
      return { status: 201, data: image };
    } catch (err) {
      await this.storage.remove(stored.storageKey);
      if (err instanceof JobNotExecutableError) {
        return fail(err.message === 'Job not found.' ? 404 : 422, err.message === 'Job not found.' ? 'NOT_FOUND' : 'VALIDATION_ERROR', err.message);
      }
      throw err;
    }
  }

  async listImages(authUserId: string, jobId: string): Promise<ServiceResult<{ items: JobImageDto[]; total: number }>> {
    if (!this.validJobId(jobId)) return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    const authz = await this.authorizeJobViewer(authUserId, jobId);
    if (!authz.job) return fail(authz.status, authz.code, authz.message);
    const items = await this.execution.listImagesByJobId(authz.job.id);
    return { status: 200, data: { items, total: items.length } };
  }

  async getImageFile(
    authUserId: string,
    jobId: string,
    imageId: string,
  ): Promise<ServiceResult<{ buffer: Buffer; mimeType: string; filename: string }>> {
    if (!this.validJobId(jobId)) return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    if (!this.validJobId(imageId)) return fail(400, 'VALIDATION_ERROR', 'Invalid image id.');
    const authz = await this.authorizeJobViewer(authUserId, jobId);
    if (!authz.job) return fail(authz.status, authz.code, authz.message);
    const image = await this.execution.getImageById(imageId.trim());
    if (!image || image.jobId !== authz.job.id) return fail(404, 'NOT_FOUND', 'Image not found.');
    const buffer = await this.storage.read(await this.storageKeyFor(imageId.trim(), image));
    if (!buffer) return fail(404, 'NOT_FOUND', 'Image not found.');
    return { status: 200, data: { buffer, mimeType: image.mimeType, filename: image.originalFilename ?? `job-${authz.job.id}-image` } };
  }

  /** Resolve the opaque storage key without ever exposing it via the API. */
  private async storageKeyFor(imageId: string, image: JobImageDto): Promise<string> {
    void image;
    // Memory store helper; MySQL store exposes the key via a dedicated
    // method — both keep the key out of API responses.
    const memoryStore = this.execution as unknown as { debugStorageKey?: (id: string) => string | null };
    if (typeof memoryStore.debugStorageKey === 'function') {
      const key = memoryStore.debugStorageKey(imageId);
      if (key) return key;
    }
    const mysqlStore = this.execution as unknown as { getImageStorageKey?: (id: string) => Promise<string | null> };
    if (typeof mysqlStore.getImageStorageKey === 'function') {
      const key = await mysqlStore.getImageStorageKey(imageId);
      if (key) return key;
    }
    return '';
  }

  async deleteImage(authUserId: string, jobId: string, imageId: string): Promise<ServiceResult<{ deleted: boolean }>> {
    if (!this.validJobId(jobId)) return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    if (!this.validJobId(imageId)) return fail(400, 'VALIDATION_ERROR', 'Invalid image id.');
    const authz = await this.authorizeProviderJob(authUserId, jobId, 'delete job photos');
    if (!authz.job) return fail(authz.status, authz.code, authz.message);
    const image = await this.execution.getImageById(imageId.trim());
    if (!image || image.jobId !== authz.job.id) return fail(404, 'NOT_FOUND', 'Image not found.');
    try {
      const { storageKey } = await this.execution.deleteImage({
        jobId: authz.job.id,
        imageId: image.id,
        deleterId: authUserId,
      });
      await this.storage.remove(storageKey);
      return { status: 200, data: { deleted: true } };
    } catch (err) {
      if (err instanceof JobImageNotDeletableError) {
        if (err.message === 'Image not found.') return fail(404, 'NOT_FOUND', err.message);
        if (err.message === 'You can only delete images you uploaded.') {
          return fail(403, 'FORBIDDEN_ROLE', err.message);
        }
        return fail(422, 'VALIDATION_ERROR', err.message);
      }
      throw err;
    }
  }

  async createUpdate(authUserId: string, jobId: string, body: unknown): Promise<ServiceResult<JobUpdateDto>> {
    if (!this.validJobId(jobId)) return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    const authz = await this.authorizeProviderJob(authUserId, jobId, 'add job updates');
    if (!authz.job) return fail(authz.status, authz.code, authz.message);
    if (authz.job.status !== 'IN_PROGRESS') {
      return fail(422, 'VALIDATION_ERROR', 'This job is not accepting work documentation in its current state.');
    }
    const { phase, note, error } = validateWorkUpdate(body);
    if (!phase || !note || error) {
      const failure = error ?? { status: 422, code: 'VALIDATION_ERROR', message: 'Invalid update.' };
      return fail(failure.status, failure.code, failure.message);
    }
    try {
      const update = await this.execution.createUpdate({
        jobId: authz.job.id,
        authorId: authUserId,
        phase,
        note,
      });
      return { status: 201, data: update };
    } catch (err) {
      if (err instanceof JobNotExecutableError) {
        return fail(err.message === 'Job not found.' ? 404 : 422, err.message === 'Job not found.' ? 'NOT_FOUND' : 'VALIDATION_ERROR', err.message);
      }
      throw err;
    }
  }

  async listUpdates(authUserId: string, jobId: string): Promise<ServiceResult<{ items: JobUpdateDto[]; total: number }>> {
    if (!this.validJobId(jobId)) return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    const authz = await this.authorizeJobViewer(authUserId, jobId);
    if (!authz.job) return fail(authz.status, authz.code, authz.message);
    const items = await this.execution.listUpdatesByJobId(authz.job.id);
    return { status: 200, data: { items, total: items.length } };
  }

  /**
   * Provider completion: IN_PROGRESS → COMPLETED with a required
   * completion note stored as the AFTER record. Only the addressed
   * PROFESSIONAL / BUSINESS_OWNER / BUSINESS_MANAGER may complete.
   */
  async completeJob(authUserId: string, jobId: string, body: unknown): Promise<ServiceResult<CompleteJobResult>> {
    if (!this.validJobId(jobId)) return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    const authz = await this.authorizeProviderJob(authUserId, jobId, 'complete jobs');
    if (!authz.job) return fail(authz.status, authz.code, authz.message);
    const { note, error } = validateCompletionNote(body);
    if (!note || error) {
      const failure = error ?? { status: 422, code: 'VALIDATION_ERROR', message: 'A completion note is required to complete the job.' };
      return fail(failure.status, failure.code, failure.message);
    }
    try {
      const update = await this.execution.completeJob({
        jobId: authz.job.id,
        providerUserId: authUserId,
        note,
      });
      const refreshed = await this.jobs.getJobById(authz.job.id);
      if (!refreshed) return fail(404, 'NOT_FOUND', 'Job not found.');
      await this.emitCompletion(refreshed, authUserId, 'completed');
      return { status: 200, data: { job: await this.withQuotes(refreshed), update } };
    } catch (err) {
      if (err instanceof JobNotCompletableError) {
        return fail(err.message === 'Job not found.' ? 404 : 422, err.message === 'Job not found.' ? 'NOT_FOUND' : 'VALIDATION_ERROR', err.message);
      }
      throw err;
    }
  }

  /**
   * Customer confirmation: COMPLETED → CONFIRMED → CLOSED in one
   * server-side transaction. The customer confirms once; the API returns
   * the final CLOSED job.
   */
  async confirmJob(authUserId: string, jobId: string): Promise<ServiceResult<{ job: JobWithQuotes }>> {
    if (!this.validJobId(jobId)) return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    const authz = await this.authorizeCustomerJob(authUserId, jobId);
    if (!authz.job) return fail(authz.status, authz.code, authz.message);
    try {
      await this.execution.confirmJob({ jobId: authz.job.id, customerUserId: authUserId });
      const refreshed = await this.jobs.getJobById(authz.job.id);
      if (!refreshed) return fail(404, 'NOT_FOUND', 'Job not found.');
      await this.emitCompletion(refreshed, authUserId, 'confirmed');
      return { status: 200, data: { job: await this.withQuotes(refreshed) } };
    } catch (err) {
      if (err instanceof JobNotConfirmableError) {
        return fail(err.message === 'Job not found.' ? 404 : 422, err.message === 'Job not found.' ? 'NOT_FOUND' : 'VALIDATION_ERROR', err.message);
      }
      throw err;
    }
  }

  async getTimeline(authUserId: string, jobId: string): Promise<ServiceResult<JobTimelineDto>> {
    if (!this.validJobId(jobId)) return fail(400, 'VALIDATION_ERROR', 'Invalid job id.');
    const authz = await this.authorizeJobViewer(authUserId, jobId);
    if (!authz.job) return fail(authz.status, authz.code, authz.message);
    const [history, updates, images] = await Promise.all([
      this.execution.listStatusHistory(authz.job.id),
      this.execution.listUpdatesByJobId(authz.job.id),
      this.execution.listImagesByJobId(authz.job.id),
    ]);
    const events: TimelineEventDto[] = this.execution.buildTimelineEvents(history, updates, images);
    return { status: 200, data: { job: await this.withQuotes(authz.job), events } };
  }
}
