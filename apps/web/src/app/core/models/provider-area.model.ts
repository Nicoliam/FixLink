/**
 * Fixlynk provider service-area models — Step 14.
 *
 * Mirrors MAX_PROVIDER_AREAS / AREA_NAME_MAX / AREA_CITY_MAX /
 * AREA_PROVINCE_MAX in the backend, where they are actually enforced.
 */

/** One published operating area, as stored in `service_areas`. */
export interface ProviderArea {
  areaName: string;
  city: string | null;
  province: string | null;
}

/** Response shape of both `GET` and `PATCH /provider/me/service-areas`. */
export interface ProviderAreaList {
  items: ProviderArea[];
}

/** An area as edited locally: every field still a string, possibly blank. */
export interface ProviderAreaDraft {
  areaName: string;
  city: string;
  province: string;
}

/** Body sent to `PATCH /provider/me/service-areas`. */
export interface ReplaceProviderAreasRequest {
  areas: ProviderAreaDraft[];
}

/** How many areas one provider may publish (backend: MAX_PROVIDER_AREAS). */
export const MAX_PROVIDER_AREAS = 10;

/** Backend `AREA_NAME_MAX`. */
export const AREA_NAME_MAX = 128;

/** Backend `AREA_CITY_MAX`. */
export const AREA_CITY_MAX = 128;

/** Backend `AREA_PROVINCE_MAX`. */
export const AREA_PROVINCE_MAX = 128;