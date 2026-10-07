/**
 * Fixlynk homepage — photography manifest.
 *
 * SINGLE SOURCE OF TRUTH for every image slot on the public homepage.
 * Templates never hard-code an image path: they reference a slot here and
 * the component decides how to render it.
 *
 * ── Where the photographs live ───────────────────────────────────
 * The homepage photography is a set of LOCAL, licensed assets committed to
 * the repository under:
 *
 *   apps/web/public/images/homepage/
 *
 * Because they sit in `public/`, they are served from the public path
 * `/images/homepage/` and require no build step, no import and no bundler
 * configuration. `src` below is that public path.
 *
 * ── Replacing a photograph ───────────────────────────────────────
 * 1. Add the new file to `apps/web/public/images/homepage/`, keeping the
 *    existing `fixlynk-<slot>.jpg` filename convention. Do not add nested
 *    folders, timestamped filenames or `.DS_Store` to this directory.
 * 2. Point the slot's `src` at its public path.
 * 3. Update `alt` if the subject changed.
 * 4. Nothing else changes — the component, the approved Stitch layout and
 *    the responsive rules all already target the declared `width`/`height`.
 *
 * ── Why `width`/`height` are declared, not measured ──────────────
 * These are the APPROVED display ratios from the Stitch / Oceanic Modern
 * design. They mirror the `aspect-ratio` rules in `src/styles.scss`, so the
 * photograph occupies exactly the box the design intends and rendering it
 * causes no layout shift.
 *
 * Note the two ways that box is established, so these numbers are not
 * casually "corrected" to match the source files:
 *  - Hero, split and South Africa slots have no `aspect-ratio` on
 *    `.fl-media-img`, so their rendered ratio comes from these attributes.
 *  - The Before/During/After slots are pinned to 4:3 by
 *    `.fl-bda-item .fl-media-img`, which matches these attributes anyway.
 *
 * The approved box is a fixed design constraint, so a source photograph
 * with a different intrinsic ratio is scaled and centre-cropped by
 * `object-fit: cover` rather than stretched. Cropping is the intended
 * trade-off; the photograph is never distorted. If a slot crops badly,
 * replace the asset with one framed for the declared ratio rather than
 * changing the ratio.
 *
 * `alt` text describes the photograph of South African homeowners,
 * tradespeople and completed work, and is used verbatim as the accessible
 * name, so it must be updated together with the image if the subject
 * changes. The photographs carry no text, captions or badges, and none are
 * layered over them; all page copy lives in the markup outside the image.
 *
 * Do not reference remote/hotlinked stock: imagery must be licensed, local
 * and replaceable. Do not imply verification, certification or ratings for
 * any real person via an image choice (AGENTS.md §13, §29).
 */

export type HomeImageTone = 'primary' | 'deep' | 'trust' | 'slate' | 'warm';

export interface HomeImageSlot {
  /** Public path to the local photograph. Always set; there is no placeholder fallback. */
  readonly src: string;
  /** Display width, used to reserve layout space and prevent layout shift. */
  readonly width: number;
  /** Display height, used to reserve layout space and prevent layout shift. */
  readonly height: number;
  /** Accessible description of the photograph. */
  readonly alt: string;
  /** Colour treatment applied alongside the photograph. */
  readonly tone: HomeImageTone;
  /** Short on-block caption describing the slot's subject. */
  readonly label: string;
}

export const HOME_IMAGES = {
  hero: {
    src: '/images/homepage/fixlynk-hero.jpg',
    width: 1200,
    height: 1500,
    alt: 'A friendly South African handyman in a clean work shirt smiling while carefully assembling a modern kitchen cabinet.',
    tone: 'primary',
    label: 'Home service professional',
  },
  customer: {
    src: '/images/homepage/fixlynk-customer.jpg',
    width: 1400,
    height: 1000,
    alt: 'A South African homeowner at home reviewing completed repair work with a trusted professional.',
    tone: 'warm',
    label: 'Homeowner and professional',
  },
  professional: {
    src: '/images/homepage/fixlynk-professional.jpg',
    width: 1200,
    height: 1500,
    alt: 'A South African electrician in branded work clothing holding tools on a residential job site.',
    tone: 'deep',
    label: 'Skilled professional at work',
  },
  before: {
    src: '/images/homepage/fixlynk-before.jpg',
    width: 1200,
    height: 900,
    alt: 'A leaking kitchen pipe and damaged cabinet photographed before repair as part of a Fixlynk job.',
    tone: 'slate',
    label: 'Before - document the problem',
  },
  during: {
    src: '/images/homepage/fixlynk-during.jpg',
    width: 1200,
    height: 900,
    alt: 'A technician part-way through an electrical installation, wiring in progress, photographed during a Fixlynk job.',
    tone: 'primary',
    label: 'During - keep track of the work',
  },
  after: {
    src: '/images/homepage/fixlynk-after.jpg',
    width: 1200,
    height: 900,
    alt: 'A completed, neatly installed kitchen tap and counter photographed after a Fixlynk job.',
    tone: 'trust',
    label: 'After - show what was completed',
  },
  trust: {
    src: '/images/homepage/fixlynk-trust.jpg',
    width: 1200,
    height: 1500,
    alt: 'A South African homeowner checking a professional’s profile and work history on a phone before hiring.',
    tone: 'trust',
    label: 'Choosing with confidence',
  },
  business: {
    src: '/images/homepage/fixlynk-business.jpg',
    width: 1400,
    height: 1000,
    alt: 'A South African service business owner reviewing job schedules and team assignments with technicians.',
    tone: 'deep',
    label: 'Service business and team',
  },
  southAfrica: {
    src: '/images/homepage/fixlynk-south-africa.jpg',
    width: 1600,
    height: 900,
    alt: 'A residential neighbourhood in Johannesburg, South Africa, with local homes and a service van parked outside.',
    tone: 'warm',
    label: 'Local South African communities',
  },
} as const satisfies Record<string, HomeImageSlot>;

export type HomeImageKey = keyof typeof HOME_IMAGES;
