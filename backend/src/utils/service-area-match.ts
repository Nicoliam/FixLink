/**
 * Service-area matching for open job requests (Step 14).
 *
 * A customer can post a job request without choosing a professional. The
 * backend then works out which professionals and businesses may quote it, and
 * a provider matches on TWO independent conditions:
 *
 *   1. CATEGORY  the provider offers something in the same platform
 *                service_categories bucket as the job's service
 *   2. AREA      one of the provider's service areas matches the
 *                customer-supplied free-text location
 *
 * Area matching is deliberately NOT a radius calculation. `service_areas` has
 * no latitude, longitude or radius_km and this module does not write any
 * (`docs/MVP-SCOPE.md` section 19 keeps distance matching out of scope;
 * `docs/USER-FLOWS.md` section 2.6.2 records this as a stated limitation).
 *
 * WHY THIS IS A NORMALISED WHOLE-WORD COMPARISON
 *
 * The customer types a location as free text: "Fourways, Johannesburg",
 * "14 Oak Street, Randburg", "near the V&A Waterfront". `service_areas` rows
 * are hand-entered labels: "Fourways & surrounds", "Randburg", "Cape Town
 * CBD". A substring LIKE is wrong in both directions:
 *
 *   LIKE '%burg%'  matches "Randburg" against "Burgersfort" and, worse,
 *                   matches an unrelated "Burgersfontein" area.
 *   LIKE 'Fourways' truncates at the first space, so "Fourways &
 *                   surrounds" fails a prefix match entirely.
 *
 * So both sides are reduced to comparable word sets and tested for word
 * membership in either direction. That handles "Fourways & surrounds" ↔
 * "Fourways, Johannesburg" (share the word "fourways") and also the reverse
 * containment where the customer typed more than the area label.
 *
 * FALSE POSITIVES ARE THE ACCEPTED COST. "Johannesburg" is a big city and a
 * professional who works across it genuinely does service most of it. The
 * false negative is far worse commercially: a missed open request is work the
 * provider never sees. So this errs towards matching, and the customer can
 * always choose a specific professional from the marketplace instead.
 *
 * Shared deliberately: the board query, the notification fan-out at creation
 * time and the quote authorization check must all agree, or a provider would
 * be notified about a request they are then refused to quote.
 */

/** Words carry no place meaning at or below this length ("in", "at", "the"). */
const MIN_TOKEN_LENGTH = 3;

/**
 * Words that appear in almost every South African address and would make
 * every area match every job. "street"/"st" also collide with common service
 * vocabulary, so a job described as "install a street light" must not match a
 * provider just because the customer typed a street address.
 */
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'near', 'from', 'into', 'onto',
  'unit', 'flat', 'room', 'block', 'sect', 'south', 'north', 'east', 'west',
  'central', 'centre', 'center',
  'street', 'road', 'avenue', 'lane', 'drive', 'close', 'court', 'place',
  'building', 'bldg', 'office', 'shop', 'home', 'house',
  'parking', 'gate', 'complex', 'estate', 'township',
  'str', 'rd', 'ave', 'ln', 'dr', 'ctr',
]);

/**
 * Reduce free text to lower-cased, de-punctuated words, with stop words and
 * numeric-only tokens (house numbers) removed.
 *
 * Numbers are dropped on purpose: "14 Oak Street" must match an area named
 * "Oak Street" and nothing should ever match because a street number happens
 * to collide with an area name.
 */
export function tokenizeLocation(value: string): string[] {
  const words = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z]+/)
    .filter((word) => word.length >= MIN_TOKEN_LENGTH)
    .filter((word) => !STOP_WORDS.has(word))
    .filter((word) => !/^\d+$/.test(word));
  // Deduplicate so a repeated word ("Randburg Randburg") costs nothing and
  // cannot make set intersection sizes misleading to a caller.
  return [...new Set(words)];
}

/** One of a provider's published operating areas, as stored in `service_areas`. */
export interface MatchableArea {
  areaName: string;
  city: string | null;
  province: string | null;
}

/**
 * Does this area match the given customer-supplied location?
 *
 * True when any meaningful word of the area label (`area_name`, then `city`,
 * then `province`) appears as a whole word in the location, or when any
 * meaningful word of the location appears as a whole word in the area label.
 * Either direction counts, because the customer may type less detail than the
 * area label ("Fourways") or more ("14 Oak Street, Randburg").
 *
 * An area with no usable words — for example one named only "The" — matches
 * nothing rather than everything. Failing closed here matters: a wildcard area
 * would expose every open request to every provider.
 */
export function areaMatchesLocation(area: MatchableArea, location: string): boolean {
  const locationWords = new Set(tokenizeLocation(location));
  if (locationWords.size === 0) return false;

  const areaWords = new Set([
    ...tokenizeLocation(area.areaName),
    ...tokenizeLocation(area.city ?? ''),
    ...tokenizeLocation(area.province ?? ''),
  ]);
  if (areaWords.size === 0) return false;

  for (const word of areaWords) {
    if (locationWords.has(word)) return true;
  }
  for (const word of locationWords) {
    if (areaWords.has(word)) return true;
  }
  return false;
}

/** Does any of these areas match the location? An empty list matches nothing. */
export function anyAreaMatchesLocation(areas: readonly MatchableArea[], location: string): boolean {
  return areas.some((area) => areaMatchesLocation(area, location));
}