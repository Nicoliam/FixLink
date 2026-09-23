/**
 * FixLink Stage 6B — customer job request service.
 *
 * Owns the marketplace job-creation rules. The authenticated customer is
 * derived server-side from the session user id — any `customer_id`,
 * `status`, `source` or timestamp supplied by the browser is ignored.
 * Customer profiles are auto-provisioned on first request because Stage 5A
 * registration creates only `users` + `user_roles` rows.
 */
import type { MarketplaceStore } from '../marketplace/marketplace.store';
import type { UserRepository } from '../users/user.repository';
import type { JobsStore } from './jobs.store';
import type { JobDto } from './jobs.types';
import { validateCreateJob } from './jobs.validation';

export interface ServiceResult<T> {
  status: number;
  code?: string;
  message?: string;
  data?: T;
}

function fail<T>(status: number, code: string, message: string): ServiceResult<T> {
  return { status, code, message };
}

function toScheduledAt(preferredDate: string | null, preferredTime: string | null): string | null {
  if (preferredDate === null) return null;
  // Default site-visit hour when the customer picks a date without a time.
  const time = preferredTime ?? '09:00';
  return `${preferredDate} ${time}:00`;
}

/** Derive a presentable customer name from the account email for first-request provisioning. */
export function provisionNames(email: string): { firstName: string; lastName: string } {
  const local = email.split('@')[0] ?? '';
  const parts = local
    .split(/[._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const capitalise = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);
  if (parts.length === 0) return { firstName: 'FixLink', lastName: 'Customer' };
  if (parts.length === 1) return { firstName: capitalise(parts[0] as string), lastName: 'Customer' };
  return {
    firstName: capitalise(parts[0] as string),
    lastName: parts
      .slice(1)
      .map(capitalise)
      .join(' '),
  };
}

export class JobsService {
  constructor(
    private readonly jobs: JobsStore,
    private readonly marketplace: MarketplaceStore,
    private readonly users: UserRepository,
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
      const names = provisionNames(authEmail);
      customer = await this.jobs.createCustomerProfile(authUserId, {
        firstName: names.firstName,
        lastName: names.lastName,
        email: authEmail,
      });
    }

    const providerId = `${input.providerType}-${input.providerNumericId}`;
    const provider = await this.marketplace.getProviderById(providerId);
    if (!provider) {
      return fail(404, 'NOT_FOUND', 'Provider not found.');
    }

    const service = await this.jobs.findActiveService(input.serviceId);
    if (!service) {
      return fail(404, 'NOT_FOUND', 'Service not found.');
    }

    const offersService = provider.services.some((tag) => tag.id === input.serviceId);
    if (!offersService) {
      return fail(422, 'VALIDATION_ERROR', 'The selected provider does not offer this service.');
    }

    const year = new Date().getFullYear();
    const reference = `FL-${year}-${Date.now().toString().slice(-6)}`;
    const job = await this.jobs.createJob({
      reference,
      customerId: customer.id,
      providerType: input.providerType,
      providerNumericId: input.providerNumericId,
      providerName: provider.name,
      serviceId: input.serviceId,
      description: input.description,
      location: input.location,
      scheduledAt: toScheduledAt(input.preferredDate, input.preferredTime),
      createdBy: authUserId,
    });
    return { status: 201, data: job };
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
      return fail(422, 'VALIDATION_ERROR', 'Invalid pagination. Use page 1–1000 and pageSize 1–50.');
    }
    const customer = await this.jobs.findCustomerProfileByUserId(authUserId);
    if (!customer) return { status: 200, data: { items: [], total: 0, page, pageSize } };
    const result = await this.jobs.listJobsByCustomerId(customer.id, page, pageSize);
    return { status: 200, data: { ...result, page, pageSize } };
  }

  async getMyJobById(authUserId: string, jobId: string): Promise<ServiceResult<JobDto>> {
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
    if (!job || job.customerId !== customer?.id) {
      return fail(404, 'NOT_FOUND', 'Job not found.');
    }
    return { status: 200, data: job };
  }
}

function readPage(value: unknown, fallback: number, max: number): number | null {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const num = Number(String(value).trim());
  if (!Number.isInteger(num) || num < 1 || num > max) return null;
  return num;
}
