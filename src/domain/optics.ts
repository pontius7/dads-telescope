/**
 * Optical arithmetic for one specific telescope.
 *
 * PURE MODULE — no React, no DOM, no fetch, no ambient clock.
 *
 * Every formula here is standard observational optics. Where a value is an
 * assumption rather than a measurement (eye pupil, seeing tiers) it is named
 * and documented as such, never presented as measured.
 */

/** Celestron StarSense Explorer 8" Dobsonian. Authoritative — do not alter. */
export const TELESCOPE = {
  name: 'Celestron StarSense Explorer 8" Dobsonian',
  apertureMm: 203,
  focalLengthMm: 1200,
} as const

/**
 * True focal ratio, derived rather than taken from marketing.
 *
 * 1200 / 203 = 5.9113. The scope is sold as "f/6"; the spec repeats that and
 * suggests exit pupil = fl / 6. We use the derived ratio because it is
 * physically correct and, in fact, reproduces the spec's own stated exit
 * pupils more closely (13 mm -> 2.20 mm exactly, vs 2.17 mm using f/6).
 * The difference is ~1.5%, below any practical observing threshold, but there
 * is no reason to carry a rounding error we can simply not introduce.
 */
export const FOCAL_RATIO = TELESCOPE.focalLengthMm / TELESCOPE.apertureMm

// ---------------------------------------------------------------------------
// Assumptions (NOT measurements). Configurable; documented at the call site.
// ---------------------------------------------------------------------------

/**
 * Dark-adapted eye pupil in mm. Governs the LOW-power end: an exit pupil
 * larger than the eye's pupil throws away light (and in a Newtonian can make
 * the secondary-mirror shadow visible).
 *
 * Pupil size shrinks with age — ~7 mm is a young adult, ~5-6 mm is typical for
 * an older adult. 6.0 mm is a deliberate middle default for an adult observer.
 * This is an ASSUMPTION about the observer, not a measurement of one.
 */
export const DEFAULT_EYE_PUPIL_MM = 6.0

/**
 * Exit pupil below which the image is too dim and floaters/diffraction
 * dominate. ~0.5 mm is the conventional practical floor.
 */
export const MIN_USEFUL_EXIT_PUPIL_MM = 0.5

/**
 * Atmospheric steadiness tiers.
 *
 * IMPORTANT: this app has NO measured seeing source. These are named tiers used
 * to cap recommended magnification conservatively. They must never be surfaced
 * as a measured seeing value. `average` is the default assumption.
 */
export type SeeingTier = 'poor' | 'average' | 'good' | 'excellent'

/**
 * Practical magnification ceilings by tier, for a 203 mm aperture.
 *
 * The ABSOLUTE optical ceiling is ~2x aperture in mm (406x), equivalently the
 * 0.5 mm exit-pupil floor (203 / 0.5 = 406x) — the two rules agree exactly.
 * But atmosphere, not optics, is the real limit on most nights from a
 * lowland site. Recommending 400x because the arithmetic allows it produces a
 * dim, boiling, useless image. These caps encode that.
 */
export const MAX_MAGNIFICATION_BY_SEEING: Record<SeeingTier, number> = {
  poor: 120,
  average: 200,
  good: 280,
  excellent: 350,
}

/** Absolute optical ceiling: 2x aperture in mm. Never exceed regardless of tier. */
export const ABSOLUTE_MAX_MAGNIFICATION = 2 * TELESCOPE.apertureMm // 406x

// ---------------------------------------------------------------------------
// Core formulas
// ---------------------------------------------------------------------------

/** Magnification = telescope focal length / eyepiece focal length. */
export function magnification(eyepieceFocalMm: number, barlowFactor = 1): number {
  assertPositive(eyepieceFocalMm, 'eyepieceFocalMm')
  assertPositive(barlowFactor, 'barlowFactor')
  return (TELESCOPE.focalLengthMm * barlowFactor) / eyepieceFocalMm
}

/**
 * Exit pupil in mm — the diameter of the light cone leaving the eyepiece.
 *
 * Equivalent formulations: eyepieceFocal / focalRatio, and aperture /
 * magnification. We use the latter so a Barlow is handled without a special
 * case (a Barlow raises magnification, which shrinks the exit pupil).
 */
export function exitPupilMm(eyepieceFocalMm: number, barlowFactor = 1): number {
  return TELESCOPE.apertureMm / magnification(eyepieceFocalMm, barlowFactor)
}

/**
 * True field of view in degrees, from apparent field of view.
 *
 * TFOV ~= AFOV / magnification. This is the approximation; it slightly
 * OVERSTATES the field for very wide-angle eyepieces because of the angular
 * magnification distortion they deliberately introduce. Prefer
 * `trueFovFromFieldStop` when a field-stop diameter is known.
 */
export function trueFovDegFromAfov(
  apparentFovDeg: number,
  eyepieceFocalMm: number,
  barlowFactor = 1,
): number {
  assertPositive(apparentFovDeg, 'apparentFovDeg')
  return apparentFovDeg / magnification(eyepieceFocalMm, barlowFactor)
}

/**
 * True field of view in degrees, from the eyepiece field stop. Exact.
 *
 * TFOV = (fieldStop / telescopeFocalLength) * (180/pi)
 *
 * A Barlow effectively lengthens the telescope's focal length by its factor,
 * which is why it divides here.
 */
export function trueFovDegFromFieldStop(fieldStopMm: number, barlowFactor = 1): number {
  assertPositive(fieldStopMm, 'fieldStopMm')
  assertPositive(barlowFactor, 'barlowFactor')
  return (fieldStopMm / (TELESCOPE.focalLengthMm * barlowFactor)) * (180 / Math.PI)
}

/** Dawes limit in arcseconds — empirical double-star resolution: 116 / D(mm). */
export function dawesLimitArcsec(): number {
  return 116 / TELESCOPE.apertureMm
}

/** Rayleigh criterion in arcseconds at ~550 nm: 138 / D(mm). */
export function rayleighLimitArcsec(): number {
  return 138 / TELESCOPE.apertureMm
}

/**
 * Approximate limiting visual magnitude for this aperture under dark skies.
 *
 * 7.7 + 5*log10(D_cm) is a widely used estimate. It assumes a dark,
 * transparent sky and an experienced observer; real suburban skies fall well
 * short. Treated downstream as an OPTIMISTIC BOUND, not a promise.
 */
export function limitingMagnitudeOptimistic(): number {
  return 7.7 + 5 * Math.log10(TELESCOPE.apertureMm / 10)
}

/** Lowest magnification that still uses the full aperture, given an eye pupil. */
export function minUsefulMagnification(eyePupilMm = DEFAULT_EYE_PUPIL_MM): number {
  assertPositive(eyePupilMm, 'eyePupilMm')
  return TELESCOPE.apertureMm / eyePupilMm
}

/** Practical high-power ceiling for a seeing tier, never above the optical limit. */
export function maxUsefulMagnification(seeing: SeeingTier = 'average'): number {
  return Math.min(MAX_MAGNIFICATION_BY_SEEING[seeing], ABSOLUTE_MAX_MAGNIFICATION)
}

/**
 * Is this magnification sane to actually recommend?
 *
 * Guards the spec requirement: "Do not recommend extreme magnification simply
 * because the arithmetic allows it."
 */
export function isMagnificationSane(
  mag: number,
  seeing: SeeingTier = 'average',
  eyePupilMm = DEFAULT_EYE_PUPIL_MM,
): boolean {
  if (!Number.isFinite(mag) || mag <= 0) return false
  if (mag > maxUsefulMagnification(seeing)) return false
  if (TELESCOPE.apertureMm / mag < MIN_USEFUL_EXIT_PUPIL_MM) return false
  // Below min-useful just wastes aperture; it is not unsafe, so allow a margin.
  if (mag < minUsefulMagnification(eyePupilMm) * 0.8) return false
  return true
}

// ---------------------------------------------------------------------------
// Zoom eyepieces
// ---------------------------------------------------------------------------

/**
 * Snap a desired focal length to a position the observer can physically set.
 *
 * Click-stop zooms (the Baader Hyperion Mk IV detents at 24/20/16/12/8 mm)
 * cannot be set to arbitrary values. Recommending "9.3 mm" on such an eyepiece
 * is an instruction Dad cannot follow. Continuous zooms (SVBONY 7-21) have no
 * stops, so the desired value is returned clamped to the barrel's range.
 */
export function snapZoomFocal(
  desiredMm: number,
  range: { minMm: number; maxMm: number; clickStopsMm?: readonly number[] },
): number {
  const clamped = Math.min(Math.max(desiredMm, range.minMm), range.maxMm)
  if (!range.clickStopsMm || range.clickStopsMm.length === 0) return clamped
  let best = range.clickStopsMm[0]!
  for (const stop of range.clickStopsMm) {
    if (Math.abs(stop - clamped) < Math.abs(best - clamped)) best = stop
  }
  return best
}

/**
 * Linearly interpolate a zoom's apparent field of view at a given focal length.
 *
 * Zoom eyepieces do not hold a constant AFOV: the Baader Mk IV runs ~68 deg at
 * 8 mm down to ~50 deg at 24 mm. Linear interpolation between the endpoints is
 * an APPROXIMATION of a mildly non-linear curve; it is accurate enough for
 * framing decisions and is flagged as approximate wherever it is surfaced.
 */
export function interpolateZoomAfov(
  focalMm: number,
  spec: { minMm: number; maxMm: number; afovAtMinDeg: number; afovAtMaxDeg: number },
): number {
  const { minMm, maxMm, afovAtMinDeg, afovAtMaxDeg } = spec
  if (maxMm === minMm) return afovAtMinDeg
  const clamped = Math.min(Math.max(focalMm, minMm), maxMm)
  const t = (clamped - minMm) / (maxMm - minMm)
  return afovAtMinDeg + t * (afovAtMaxDeg - afovAtMinDeg)
}

// ---------------------------------------------------------------------------

function assertPositive(v: number, name: string): void {
  if (!Number.isFinite(v) || v <= 0) {
    throw new RangeError(`${name} must be a positive finite number, got ${v}`)
  }
}
