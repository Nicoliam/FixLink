/**
 * FixLink Stage 6B — jobs data-access contract.
 *
 * The MySQL implementation serves production; the memory implementation
 * serves automated tests (no database required). Provider catalogue reads
 * (existence, active status, offered services) come from the existing
 * `MarketplaceStore` — this store owns only job persistence plus the
 * minimal customer-profile lookup/provisioning needed to establish
 * server-side customer ownership.
 */
import type { ActiveServiceRef, CustomerProfileRef, JobDto, PersistJobInput } from './jobs.types';

export interface CustomerProvision {
  firstName: string;
  lastName: string;
  email: string | null;
}

export interface JobsStore {
  findCustomerProfileByUserId(userId: string): Promise<CustomerProfileRef | null>;
  /**
   * Stage 8 — reverse lookup for notification recipients: the login
   * user id that owns a marketplace customer profile, or null for
   * business-managed (`user_id = NULL`) profiles. Server-side only.
   */
  findUserIdByCustomerId(customerId: string): Promise<string | null>;
  createCustomerProfile(userId: string, provision: CustomerProvision): Promise<CustomerProfileRef>;
  findActiveService(serviceId: string): Promise<ActiveServiceRef | null>;
  createJob(input: PersistJobInput): Promise<JobDto>;
  getJobById(jobId: string): Promise<JobDto | null>;
  listJobsByCustomerId(
    customerId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: JobDto[]; total: number }>;
}
