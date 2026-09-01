/**
 * Target taxonomy.
 *
 * Two kinds of thing get observed, and they need different maths:
 *   - FIXED targets carry J2000 RA/Dec and go through the precession-aware
 *     vector route in ephemeris.ts.
 *   - SOLAR-SYSTEM targets move, and are resolved by name through
 *     astronomy-engine each time they are queried.
 */
import { Body } from 'astronomy-engine'

export type TargetKind =
  | 'planet'
  | 'moon'
  | 'globular'
  | 'open-cluster'
  | 'emission-nebula'
  | 'planetary-nebula'
  | 'reflection-nebula'
  | 'supernova-remnant'
  | 'galaxy'
  | 'double-star'
  | 'asterism'

/**
 * Broad behaviour class used by the scoring and equipment engines.
 * Point-like objects tolerate moonlight and twilight; extended faint ones do not.
 */
export type TargetClass = 'point' | 'extended-bright' | 'extended-faint'

export interface DeepSkyTarget {
  id: string
  /** Catalogue label shown to the user, e.g. "M13". */
  name: string
  /** OpenNGC row identifier, e.g. "NGC6205". */
  catalogId: string
  commonName: string | null
  kind: TargetKind
  raHoursJ2000: number
  decDegJ2000: number
  /** V magnitude where available, else B. */
  magnitude: number | null
  majorAxisArcmin: number | null
  minorAxisArcmin: number | null
  /** mag/arcmin^2. NULL MEANS UNKNOWN — never substitute a value. */
  surfaceBrightness: number | null
  constellation: string | null
  /** Editorial recognition weighting 0-1. Curation, not measurement. */
  popularity: number
}

export interface SolarSystemTarget {
  id: string
  name: string
  kind: 'planet' | 'moon'
  body: Body
  popularity: number
}

export type Target =
  | ({ type: 'deep-sky' } & DeepSkyTarget)
  | ({ type: 'solar-system' } & SolarSystemTarget)

/**
 * The solar-system targets worth offering.
 *
 * Mercury is included but is genuinely hard from a lowland site — it never
 * strays far from the Sun, so the scoring engine will usually gate it out on
 * altitude and twilight rather than us hiding it by hand.
 *
 * Uranus and Neptune are included: at 203 mm they are real, if small, targets.
 * Pluto is NOT — it is around magnitude 14.4, at the very edge of this
 * aperture's optimistic limit under a perfect sky, and offering it would be
 * setting up a failure.
 */
export const SOLAR_SYSTEM_TARGETS: readonly SolarSystemTarget[] = [
  { id: 'moon', name: 'Moon', kind: 'moon', body: Body.Moon, popularity: 1.0 },
  { id: 'jupiter', name: 'Jupiter', kind: 'planet', body: Body.Jupiter, popularity: 1.0 },
  { id: 'saturn', name: 'Saturn', kind: 'planet', body: Body.Saturn, popularity: 1.0 },
  { id: 'mars', name: 'Mars', kind: 'planet', body: Body.Mars, popularity: 0.95 },
  { id: 'venus', name: 'Venus', kind: 'planet', body: Body.Venus, popularity: 0.9 },
  { id: 'mercury', name: 'Mercury', kind: 'planet', body: Body.Mercury, popularity: 0.6 },
  { id: 'uranus', name: 'Uranus', kind: 'planet', body: Body.Uranus, popularity: 0.5 },
  { id: 'neptune', name: 'Neptune', kind: 'planet', body: Body.Neptune, popularity: 0.45 },
]

/** Which broad class a target behaves as, for scoring and filter rules. */
export function classify(kind: TargetKind, surfaceBrightness: number | null): TargetClass {
  switch (kind) {
    case 'planet':
    case 'moon':
    case 'double-star':
      return 'point'
    case 'globular':
    case 'open-cluster':
    case 'asterism':
    case 'planetary-nebula':
      return 'extended-bright'
    case 'galaxy':
    case 'emission-nebula':
    case 'reflection-nebula':
    case 'supernova-remnant':
      // Surface brightness refines this where known; unknown defaults to faint,
      // which is the conservative assumption (it demands darker conditions).
      return surfaceBrightness !== null && surfaceBrightness < 12 ? 'extended-bright' : 'extended-faint'
  }
}

/** Largest angular dimension in arcminutes, or null when the catalogue has none. */
export function angularSizeArcmin(t: DeepSkyTarget): number | null {
  return t.majorAxisArcmin ?? t.minorAxisArcmin ?? null
}
