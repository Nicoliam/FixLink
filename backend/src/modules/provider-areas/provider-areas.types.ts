/**
 * Fixlynk Step 14 — provider service areas.
 *
 * A provider declares the areas they service. Those areas are what open-request
 * matching keys on, so this is not a cosmetic profile field: a profile with no
 * areas receives no open requests at all.
 *
 * Ownership follows the existing convention on `service_areas` — nullable
 * `professional_id` / `business_id` with the exactly-one-owner rule enforced by
 * this service, never by a check constraint. The owner is resolved from the
 * session user id, so a provider can never address another provider's areas.
 *
 * The read AND the write both go through `MarketplaceStore`: open-request
 * matching already reads `service_areas` there, and a second writer would need
 * a second reader to stay in step with it.
 *
 * REPLACE, NOT PATCH
 *
 * `PUT`/`PATCH` semantics here replace the caller's WHOLE list in one
 * transaction rather than adding and removing individual rows. Two reasons:
 *
 *   1. A profile's area list is one value the user edits as a unit in the UI
 *      ("I moved from Randburg to Sandton"), and replace semantics are the only
 *      shape that cannot be left half-applied.
 *   2. It removes the need for an add endpoint, a delete endpoint and a
 *      delete-one endpoint, each of which would need its own authorization,
 *      validation and rate-limit story for no extra capability.
 *
 * Unlike `service_offerings`, service areas need no soft delete: nothing
 * references an area row. Closed jobs keep no link to where a provider worked,
 * and `job_status_history` records status changes, not area references.
 */

/** One published operating area, as stored in `service_areas`. */
export interface ProviderAreaDto {
  areaName: string;
  city: string | null;
  province: string | null;
}

/** One area as supplied by the client. */
export interface ProviderAreaInput {
  areaName: string;
  city: string | null;
  province: string | null;
}

/**
 * The caller's own provider references. Structural rather than imported from
 * the quotes module so this module has no dependency on quote machinery — it
 * only needs to know "which providers may this user act as".
 */
export interface AreaOwnerResolver {
  findProfessionalProfileByUserId(userId: string): Promise<{ id: string } | null>;
  findBusinessIdsForUser(userId: string): Promise<Array<{ businessId: string; role: 'OWNER' | 'MANAGER' }>>;
}

/** A profile that owns areas. Exactly one of the two ids is ever meaningful. */
export interface ProviderAreaOwner {
  ownerType: 'professional' | 'business';
  ownerId: string;
}

/**
 * How many areas one provider may publish.
 *
 * A bound, not a preference: matching loads every area of every candidate
 * provider for each open request, and `service_areas` has no unique index, so
 * an unbounded list is an unbounded amount of work per posted job. Ten covers
 * any real South African operating footprint ("Gauteng North", "Cape Town
 * CBD", "Surroundings").
 */
export const MAX_PROVIDER_AREAS = 10;

export const AREA_NAME_MAX = 128;
export const AREA_CITY_MAX = 128;
export const AREA_PROVINCE_MAX = 128;