/**
 * FixLink Stage 6B — in-memory jobs store for automated tests.
 *
 * Mirrors the MySQL implementation's rules (server-side ownership,
 * MARKETPLACE source, REQUESTED status, active-service check) without
 * requiring a database. Fixture services mirror the marketplace catalogue
 * ids so provider/service eligibility matches production seed data.
 */
import type { CustomerProvision, JobsStore } from './jobs.store';
import type { ActiveServiceRef, CustomerProfileRef, JobDto, PersistJobInput } from './jobs.types';

const ACTIVE_SERVICES: ActiveServiceRef[] = [
  { id: '1', name: 'Leak Repair & Pipe Fixes', slug: 'leak-repair' },
  { id: '2', name: 'Geyser Installation & Repair', slug: 'geyser-install-repair' },
  { id: '3', name: 'Drain Unblocking', slug: 'drain-unblocking' },
  { id: '4', name: 'DB Board & Wiring Repairs', slug: 'db-board-wiring' },
  { id: '5', name: 'Lighting Installation', slug: 'lighting-installation' },
  { id: '6', name: 'Interior Painting', slug: 'interior-painting' },
  { id: '7', name: 'Exterior Painting', slug: 'exterior-painting' },
  { id: '8', name: 'Wall Crack & Plaster Repair', slug: 'wall-crack-plaster-repair' },
  { id: '9', name: 'General Handyman', slug: 'general-handyman' },
  { id: '10', name: 'Appliance Repair', slug: 'appliance-repair' },
  { id: '11', name: 'Aircon Service & Install', slug: 'aircon-service-install' },
  { id: '12', name: 'Garden Cleanup & Maintenance', slug: 'garden-cleanup-maintenance' },
  { id: '13', name: 'Home Deep Cleaning', slug: 'home-deep-cleaning' },
];

function nowIso(): string {
  return new Date().toISOString();
}

export class MemoryJobsStore implements JobsStore {
  private jobSeq = 0;
  private customerSeq = 0;
  private readonly jobs = new Map<string, JobDto>();
  private readonly customerByUserId = new Map<string, CustomerProfileRef>();

  async findCustomerProfileByUserId(userId: string): Promise<CustomerProfileRef | null> {
    return this.customerByUserId.get(userId) ?? null;
  }

  async createCustomerProfile(userId: string, _provision: CustomerProvision): Promise<CustomerProfileRef> {
    const existing = this.customerByUserId.get(userId);
    if (existing) return existing;
    this.customerSeq += 1;
    const profile: CustomerProfileRef = { id: String(this.customerSeq) };
    this.customerByUserId.set(userId, profile);
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
      provider: {
        id: `${input.providerType}-${input.providerNumericId}`,
        providerType: input.providerType,
        name: input.providerName,
      },
      service: {
        id: input.serviceId,
        name: service?.name ?? 'Service',
        slug: service?.slug ?? 'service',
      },
      description: input.description,
      location: input.location,
      city: null,
      province: null,
      preferredDate,
      // Wall-clock echo of the submitted date/time (no timezone shift), so
      // the preferred slot the customer picked is what the API reports.
      scheduledAt: input.scheduledAt === null ? null : input.scheduledAt.replace(' ', 'T'),
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  async getJobById(jobId: string): Promise<JobDto | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async listJobsByCustomerId(
    customerId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: JobDto[]; total: number }> {
    const owned = [...this.jobs.values()]
      .filter((job) => job.customerId === customerId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const start = (page - 1) * pageSize;
    return { items: owned.slice(start, start + pageSize), total: owned.length };
  }
}

function toIso(scheduledAt: string): string {
  // `YYYY-MM-DD HH:MM:SS` (local server time) -> ISO for API consumers.
  return new Date(scheduledAt.replace(' ', 'T')).toISOString();
}
