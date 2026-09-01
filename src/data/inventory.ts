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
    evidence: [cite('mfr.astro-tech.uwa-82', '82 degrees is part of the product designation')],
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
    evidence: [cite('mfr.astro-tech.uwa-82')],
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
    afov: { kind: 'range', atMinFocalDeg: 68, atMaxFocalDeg: 50, status: 'needs-verification' },
    barrelMm: 31.75,
    evidence: [cite('mfr.baader.hyperion-zoom-mk4')],
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
    afov: { kind: 'fixed', deg: 43, status: 'needs-verification' },
    barrelMm: 50.8,
    evidence: [cite('mfr.celestron.elux-40')],
  },
  {
    id: 'celestron-plossl-25',
    kind: 'eyepiece',
    brand: 'Celestron',
    model: '25 mm Plössl',
    provenance: 'builtin',
    verified: true,
    enabled: true,
    focal: { kind: 'fixed', focalMm: 25 },
    afov: { kind: 'fixed', deg: 50, status: 'needs-verification' },
    barrelMm: 31.75,
    evidence: [cite('mfr.celestron.plossl-25')],
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
    evidence: [cite('mfr.baader.barlow-2.25x')],
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
    evidence: [cite('mfr.celestron.omni-2x')],
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
