/**
 * Fixlynk — provider service offering store contract.
 *
 * Identity resolution lives here because it is persistence-specific:
 * production reads `professional_profiles` / `business_profiles` /
 * `business_members`, tests use explicit links.
 *
 * Ownership is never accepted from a request. The service layer resolves the
 * caller's identities from the session and only ever passes those ids here.
 */
import type {
  BusinessIdentity,
  OfferingMutationInput,
  OfferingOwner,
  ProfessionalIdentity,
  ServiceCategoryRef,
  ServiceOfferingDto,
} from './offerings.types';

/**
 * Store-level failure. `CONFLICT` covers the per-owner duplicate offering
 * name (uq_service_offerings_professional_name / uq_service_offerings_business_name).
 */
export class OfferingsStoreError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL',
    message: string,
  ) {
    super(message);
    this.name = 'OfferingsStoreError';
  }
}

export interface ServiceOfferingsStore {
  /** Professional profile owned by the user, or null when never onboarded. */
  findProfessionalProfileByUserId(userId: string): Promise<ProfessionalIdentity | null>;
  /** Businesses the user may act for. TECHNICIAN members are ignored. */
  findBusinessesForUser(userId: string): Promise<BusinessIdentity[]>;
  /** Active platform category, or null when unknown/inactive. */
  getActiveCategory(categoryId: string): Promise<ServiceCategoryRef | null>;
  /** Live offerings across every owner the caller may act for. */
  listOfferings(owners: OfferingOwner[]): Promise<ServiceOfferingDto[]>;
  /** Any offering by id, including removed ones. Ownership is the caller's job. */
  getOfferingById(id: string): Promise<ServiceOfferingDto | null>;
  createOffering(owner: OfferingOwner, input: OfferingMutationInput): Promise<ServiceOfferingDto>;
  /** Returns null when the offering does not exist. */
  updateOffering(id: string, input: Partial<OfferingMutationInput>): Promise<ServiceOfferingDto | null>;
  /** Soft delete plus is_active = 0. Returns null when the offering is unknown. */
  removeOffering(id: string): Promise<ServiceOfferingDto | null>;
  /** Non-terminal jobs still referencing the offering. Drives the 409 guard. */
  countOpenJobsForOffering(id: string): Promise<number>;
}