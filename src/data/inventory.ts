/**
 * Dad's real equipment.
 *
 * Three orthogonal flags, deliberately NOT collapsed into one:
 *   provenance — where the item came from (builtin vs user-added)
 *   verified   — are its specs trustworthy enough to compute recommendations from?
 *   enabled    — does the user currently want it in play?
 *
 * Only `verified && enabled` gear participates in recommendations.
 *
 * BANNED: the Explore Scientific 8.5 mm is not owned and must never appear.
 * See FORBIDDEN_GEAR at the bottom — it is checked on load AND on output.
 */
import { cite, type EvidenceRef, type VerificationStatus } from './evidence'

export type Provenance = 'builtin' | 'user'
export type BarrelMm = 50.8 | 31.75

export interface GearBase {
  id: string
  brand: string
  model: string
  provenance: Provenance
  verified: boolean
  enabled: boolean
  evidence: EvidenceRef[]
}

/** A fixed focal length, or a zoom with an optional set of physical detents. */
export type FocalSpec =
  | { kind: 'fixed'; focalMm: number }
  | { kind: 'zoom'; minMm: number; maxMm: number; clickStopsMm?: readonly number[] }

/**
 * Apparent field. Zooms do not hold a constant apparent field, so they carry
 * endpoints and are interpolated.
 *
 * `status` is per-field on purpose. The SVBONY's focal RANGE is certain (it is
 * printed on the barrel and drives magnification), while its apparent field is
 * not confirmed. Excluding an eyepiece Dad actually owns because one secondary
 * spec is unconfirmed would be worse than using it with a warning.
 */
export type AfovSpec =
  | { kind: 'fixed'; deg: number; status: VerificationStatus }
  | {
      kind: 'range'
      atMinFocalDeg: number
      atMaxFocalDeg: number
      status: VerificationStatus
    }

export interface Eyepiece extends GearBase {
  kind: 'eyepiece'
  focal: FocalSpec
  afov: AfovSpec
  barrelMm: BarrelMm
}

export interface Barlow extends GearBase {
  kind: 'barlow'
  factor: number
  /** Accepts eyepieces of this barrel size or smaller. */
  barrelMm: BarrelMm
}

export type FilterClass = 'narrowband-uhc' | 'colour'

export interface Filter extends GearBase {
  kind: 'filter'
  filterClass: FilterClass
  wratten?: '12' | '21' | '23A' | '56' | '82A'
  threadMm: BarrelMm
}

export interface Camera extends GearBase {
  kind: 'camera'
  suitedTo: readonly ('moon' | 'planet')[]
}

export type Gear = Eyepiece | Barlow | Filter | Camera

// ---------------------------------------------------------------------------
// Eyepieces — the only six that exist
// ---------------------------------------------------------------------------

export const EYEPIECES: readonly Eyepiece[] = [
  {
    id: 'at-28-uwa',
    kind: 'eyepiece',
    brand: 'Astro-Tech',
    model: '28 mm UWA 82°',
    provenance: 'builtin',
    verified: true,
    enabled: true,
    focal: { kind: 'fixed', focalMm: 28 },
    afov: { kind: 'fixed', deg: 82, status: 'verified' },
    barrelMm: 50.8,
    evidence: [
      cite('mfr.astro-tech.uwa-82', '82 degrees is part of the product designation'),
      cite('owner.inventory-deck', "owner's deck gives 1.91 deg true field at 43x, implying 81.9 deg"),
    ],
  },
  {
    id: 'at-13-uwa',
    kind: 'eyepiece',
    brand: 'Astro-Tech',
    model: '13 mm UWA 82°',
    provenance: 'builtin',
    verified: true,
    enabled: true,
    focal: { kind: 'fixed', focalMm: 13 },
    afov: { kind: 'fixed', deg: 82, status: 'verified' },
    barrelMm: 31.75,
    evidence: [
      cite('mfr.astro-tech.uwa-82'),
      cite('owner.inventory-deck', "owner's deck gives 0.89 deg true field at 92x, implying 82.2 deg"),
    ],
  },
  {
    id: 'baader-hyperion-zoom-mk4',
    kind: 'eyepiece',
    brand: 'Baader',
    model: 'Hyperion Zoom Mark IV 8-24 mm',
    provenance: 'builtin',
    verified: true,
    enabled: true,
    // Click stops matter: "set it to 11.4 mm" is an instruction the observer
    // physically cannot follow on a detented zoom.
    focal: { kind: 'zoom', minMm: 8, maxMm: 24, clickStopsMm: [8, 12, 16, 20, 24] },
    // The owner's deck gives true fields at three zoom positions, which imply
    // 67.5 deg at 8 mm, 63.0 deg at 12 mm and 57.8 deg at 16 mm. Extrapolating
    // that slope to 24 mm lands near 48 deg, close to the 50 deg commonly
    // quoted, so the endpoints below are now corroborated rather than assumed.
    afov: { kind: 'range', atMinFocalDeg: 68, atMaxFocalDeg: 50, status: 'verified' },
    barrelMm: 31.75,
    evidence: [
      cite('mfr.baader.hyperion-zoom-mk4'),
      cite('owner.inventory-deck', 'true fields at 8, 12 and 16 mm imply 67.5, 63.0 and 57.8 deg'),
    ],
  },
  {
    id: 'celestron-elux-40',
    kind: 'eyepiece',
    brand: 'Celestron',
    model: 'E-Lux 40 mm',
    provenance: 'builtin',
    verified: true,
    enabled: true,
    focal: { kind: 'fixed', focalMm: 40 },
    // DISAGREEMENT, deliberately unresolved: the owner's deck gives 1.87 deg
    // true field at 30x, which implies 56 deg apparent field, not 43 deg. Both
    // are physically possible in a 2" barrel (field stops of 39 mm and 30 mm
    // against a 46 mm limit). 43 deg is kept because understating the field is
    // the safe direction — it makes the app MORE likely to warn that an object
    // will not fit, rather than promising a framing it cannot deliver.
    afov: { kind: 'fixed', deg: 43, status: 'needs-verification' },
    barrelMm: 50.8,
    evidence: [
      cite('mfr.celestron.elux-40'),
      cite('owner.inventory-deck', "owner's deck implies 56 deg; unresolved, 43 deg used as the cautious value"),
    ],
  },
  {
    id: 'celestron-plossl-25',
    kind: 'eyepiece',
    brand: 'Celestron',
    model: '25 mm Omni Plössl',
    provenance: 'builtin',
    verified: true,
    enabled: true,
    focal: { kind: 'fixed', focalMm: 25 },
    afov: { kind: 'fixed', deg: 50, status: 'verified' },
    barrelMm: 31.75,
    evidence: [
      cite('mfr.celestron.plossl-25'),
      cite('owner.inventory-deck', "owner's deck gives 1.04 deg true field at 48x, implying 49.9 deg"),
    ],
  },
  {
    id: 'svbony-zoom-7-21',
    kind: 'eyepiece',
    brand: 'SVBONY',
    model: '7-21 mm Zoom',
    provenance: 'builtin',
    verified: true,
    enabled: true,
    // Continuous — no detents, so any focal length in range is settable.
    focal: { kind: 'zoom', minMm: 7, maxMm: 21 },
    afov: { kind: 'range', atMinFocalDeg: 60, atMaxFocalDeg: 40, status: 'needs-verification' },
    barrelMm: 31.75,
    evidence: [cite('mfr.svbony.zoom-7-21', 'focal range certain; apparent field unconfirmed')],
  },
]

// ---------------------------------------------------------------------------
// Barlows — BOTH are 1.25 inch. This has a hard consequence.
// ---------------------------------------------------------------------------

export const BARLOWS: readonly Barlow[] = [
  {
    id: 'baader-barlow-225',
    kind: 'barlow',
    brand: 'Baader',
    model: '2.25x Barlow',
    provenance: 'builtin',
    verified: true,
    enabled: true,
    factor: 2.25,
    barrelMm: 31.75,
    evidence: [
      cite('mfr.baader.barlow-2.25x'),
      cite('owner.inventory-deck', 'all five quoted zoom+Barlow magnifications match 2.25x exactly'),
    ],
  },
  {
    id: 'celestron-omni-2x',
    kind: 'barlow',
    brand: 'Celestron',
    model: 'Omni 2x Barlow',
    provenance: 'builtin',
    verified: true,
    enabled: true,
    factor: 2,
    barrelMm: 31.75,
    evidence: [
      cite('mfr.celestron.omni-2x'),
      cite('owner.inventory-deck', 'quoted 96x at 25 mm and 185x at 13 mm both match 2x exactly'),
    ],
  },
]

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export const FILTERS: readonly Filter[] = [
  {
    id: 'svbony-uhc-2in',
    kind: 'filter',
    brand: 'SVBONY',
    model: '2" UHC',
    provenance: 'builtin',
    verified: true,
    enabled: true,
    filterClass: 'narrowband-uhc',
    threadMm: 50.8,
    evidence: [cite('mfr.svbony.uhc-2in'), cite('convention.uhc-line-emission-only')],
  },
  ...(['12', '21', '23A', '56', '82A'] as const).map((w) => ({
    id: `sv155-${w.toLowerCase()}`,
    kind: 'filter' as const,
    brand: 'SVBONY',
    model: `SV155 #${w}`,
    provenance: 'builtin' as const,
    verified: true,
    enabled: true,
    filterClass: 'colour' as const,
    wratten: w,
    threadMm: 31.75 as const,
    evidence: [cite('mfr.svbony.sv155-colour-set'), cite('convention.wratten-planetary')],
  })),
]

export const CAMERAS: readonly Camera[] = [
  {
    id: 'celestron-neximage-10',
    kind: 'camera',
    brand: 'Celestron',
    model: 'NexImage 10',
    provenance: 'builtin',
    verified: true,
    enabled: true,
    // Small sensor, high frame rate: a lucky-imaging planetary camera.
    // Deliberately NOT claimed as a general deep-sky camera.
    suitedTo: ['moon', 'planet'],
    evidence: [cite('mfr.celestron.neximage-10')],
  },
]

// ---------------------------------------------------------------------------
// The ban
// ---------------------------------------------------------------------------

/**
 * Gear that must never appear, whatever a stored payload claims.
 *
 * The Explore Scientific 8.5 mm was recommended in earlier, incorrect advice.
 * It is not owned. Checked when inventory loads AND again on recommendation
 * output, because a stale localStorage blob from an older build is exactly how
 * a removed item resurrects itself.
 */
export const FORBIDDEN_GEAR: readonly { brandRe: RegExp; modelRe: RegExp; reason: string }[] =
  Object.freeze([
    {
      brandRe: /explore\s*scientific/i,
      modelRe: /\b8\.5\s*mm\b/i,
      reason: 'Not in the inventory. Previously recommended in error.',
    },
  ])

export function isForbidden(g: { brand: string; model: string }): boolean {
  return FORBIDDEN_GEAR.some((f) => f.brandRe.test(g.brand) && f.modelRe.test(g.model))
}

/** Only verified AND enabled gear may drive a recommendation. */
export function participates(g: GearBase): boolean {
  return g.verified && g.enabled && !isForbidden(g)
}

export interface Inventory {
  eyepieces: readonly Eyepiece[]
  barlows: readonly Barlow[]
  filters: readonly Filter[]
  cameras: readonly Camera[]
}

export const DEFAULT_INVENTORY: Inventory = {
  eyepieces: EYEPIECES,
  barlows: BARLOWS,
  filters: FILTERS,
  cameras: CAMERAS,
}

/**
 * Create a user-added eyepiece. ALWAYS unverified — there is no in-app
 * research service, so a new item's specs are unconfirmed by construction.
 */
export function createUserEyepiece(input: {
  brand: string
  model: string
  focalMm: number
  afovDeg?: number
  barrelMm?: BarrelMm
}): Eyepiece {
  return {
    id: `user-${input.brand}-${input.model}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    kind: 'eyepiece',
    brand: input.brand,
    model: input.model,
    provenance: 'user',
    verified: false, // <- the whole point
    enabled: true,
    focal: { kind: 'fixed', focalMm: input.focalMm },
    afov: { kind: 'fixed', deg: input.afovDeg ?? 50, status: 'unverified' },
    barrelMm: input.barrelMm ?? 31.75,
    evidence: [],
  }
}
