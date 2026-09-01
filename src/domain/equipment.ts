/**
 * The equipment recommender — "what exactly do I put in the focuser?"
 *
 * This is the module the whole product exists for, and the one where a
 * plausible-sounding wrong answer does the most damage. Three guarantees are
 * enforced here and tested directly:
 *
 *   1. The Explore Scientific 8.5 mm never appears. It is not owned.
 *   2. Gear that is not BOTH verified AND enabled never participates.
 *      Filtering happens BEFORE enumeration, not after.
 *   3. UHC is recommended only for line-emission objects.
 *
 * Every rule carries an evidence reference. A rule with no source does not ship.
 */
import {
  TELESCOPE,
  magnification,
  exitPupilMm,
  trueFovDegFromAfov,
  isMagnificationSane,
  maxUsefulMagnification,
  snapZoomFocal,
  interpolateZoomAfov,
  DEFAULT_EYE_PUPIL_MM,
  type SeeingTier,
} from './optics'
import { angularSizeArcmin, type DeepSkyTarget, type Target, type TargetKind } from './targets'
import { cite, type EvidenceRef } from '../data/evidence'
import {
  participates,
  isForbidden,
  type Barlow,
  type Eyepiece,
  type Filter,
  type Inventory,
} from '../data/inventory'

export interface Recommendation {
  eyepiece: Eyepiece
  /** The focal length actually used — snapped to a detent for click-stop zooms. */
  eyepieceFocalMm: number
  /** False when the zoom was snapped, so the UI can show "≈". */
  focalIsExact: boolean
  barlow: Barlow | null
  filter: Filter | null
  magnification: number
  exitPupilMm: number
  trueFovDeg: number
  /** trueFOV / target size. Null for point sources. */
  fillRatio: number | null
  /** Seconds before an undriven scope lets the object drift to the field edge. */
  driftHalfFieldSec: number
  /** Below 203 mm when the exit pupil exceeds the observer's eye pupil. */
  effectiveApertureMm: number
  fit: number
  reasoning: string[]
  warnings: string[]
  evidence: EvidenceRef[]
}

export interface RejectionNote {
  eyepieceId: string
  barlowId: string | null
  reason: string
}

export interface RecommendPrefs {
  eyePupilMm: number
  seeing: SeeingTier
  allowColourFilters: boolean
}

export const DEFAULT_RECOMMEND_PREFS: RecommendPrefs = {
  eyePupilMm: DEFAULT_EYE_PUPIL_MM,
  seeing: 'average',
  allowColourFilters: false,
}

/**
 * The object should span at most 40% of the field.
 *
 * Two reasons, and the second is the stronger one. Framing: below about 2x the
 * object crowds the field edge where every eyepiece is at its worst, with no
 * surrounding star field for context. Mechanics: this mount is UNDRIVEN, so
 * the object must have room to drift before it leaves the view.
 */
export const FILL_RATIO = 2.5

/** Minimum seconds an object should stay in the field on an undriven mount. */
export const MIN_DRIFT_DWELL_SEC = 45

/** Sky drift rate in arcseconds per second at the celestial equator. */
const SIDEREAL_ARCSEC_PER_SEC = 15.041

/**
 * Exit-pupil bands by object class.
 *
 * Large exit pupils maximise true field for big faint objects; small ones
 * darken the sky background and magnify detail. Below 0.5 mm the view is
 * simply dim with no added information.
 */
const EXIT_PUPIL_BANDS: Record<TargetKind, [number, number]> = {
  'open-cluster': [3.0, 5.0],
  asterism: [3.5, 5.5],
  'emission-nebula': [2.5, 4.5],
  'reflection-nebula': [2.5, 4.5],
  'supernova-remnant': [2.5, 4.5],
  galaxy: [1.5, 3.5],
  globular: [1.0, 2.2],
  'planetary-nebula': [0.6, 1.6],
  planet: [0.5, 1.1],
  moon: [0.8, 2.5],
  'double-star': [0.7, 1.5],
}

/**
 * Object types that genuinely benefit from a UHC filter.
 *
 * A UHC passes narrow bands around H-beta (486.1 nm) and [O III] (495.9 /
 * 500.7 nm) and blocks nearly everything else. It does not brighten anything —
 * it darkens the SKY far more than it darkens objects that emit in those lines.
 */
const UHC_ALLOWED: ReadonlySet<TargetKind> = new Set<TargetKind>([
  'emission-nebula',
  'planetary-nebula',
  'supernova-remnant',
])

/**
 * Explicitly denied, with the reason, because these are the mistakes that get
 * made. Reflection nebulae are the one people most often get wrong: they shine
 * by SCATTERED starlight, which is broadband continuum, so a UHC only dims them.
 */
const UHC_DENIED_REASON: Partial<Record<TargetKind, string>> = {
  galaxy: 'Galaxies shine by broadband starlight; a UHC blocks most of it and gains nothing.',
  'open-cluster': 'Star clusters emit continuum light; a UHC only makes them dimmer.',
  globular: 'Globular clusters emit continuum light; a UHC costs you the faint outer stars.',
  'reflection-nebula':
    'Reflection nebulae shine by scattered starlight, not line emission — a UHC does not help.',
  'double-star': 'Stars emit continuum; a filter only dims the pair.',
  asterism: 'Stars emit continuum; a filter only dims them.',
  planet: 'Planets shine by reflected sunlight; a UHC destroys brightness and colour.',
  moon: 'The Moon shines by reflected sunlight; a UHC is the wrong tool entirely.',
}

// ---------------------------------------------------------------------------

export function recommend(args: {
  target: Target
  inventory: Inventory
  /** Sky conditions that legitimately change the answer. */
  conditions?: { moonBright?: boolean; suburbanSky?: boolean; peakAltitudeDeg?: number }
  prefs?: RecommendPrefs
}): { primary: Recommendation | null; alternatives: Recommendation[]; rejected: RejectionNote[] } {
  const prefs = args.prefs ?? DEFAULT_RECOMMEND_PREFS
  const cond = args.conditions ?? {}
  const target = args.target
  const kind: TargetKind = target.type === 'deep-sky' ? target.kind : target.kind
  const sizeArcmin = target.type === 'deep-sky' ? angularSizeArcmin(target) : null
  const decDeg = target.type === 'deep-sky' ? target.decDegJ2000 : 0

  // GUARANTEE 2: filter BEFORE enumerating. Unverified or disabled gear never
  // enters the search space at all, so it cannot leak through a later branch.
  const eyepieces = args.inventory.eyepieces.filter(participates)
  const barlows = args.inventory.barlows.filter(participates)
  const filters = args.inventory.filters.filter(participates)

  const rejected: RejectionNote[] = []
  const candidates: Recommendation[] = []

  for (const ep of eyepieces) {
    for (const bl of [null, ...barlows]) {
      // Mechanical gate first: a 1.25" Barlow physically cannot accept a 2"
      // eyepiece. Both owned Barlows are 1.25", so the 28 mm and 40 mm can
      // never be Barlowed at all.
      if (bl && bl.barrelMm < ep.barrelMm) {
        rejected.push({
          eyepieceId: ep.id,
          barlowId: bl.id,
          reason: `${bl.model} is 1.25" and cannot accept the 2" ${ep.model}.`,
        })
        continue
      }

      const focalCandidates = enumerateFocals(ep, bl, prefs, sizeArcmin)
      for (const fc of focalCandidates) {
        const built = build(ep, bl, fc, prefs, kind, sizeArcmin, decDeg)
        if ('reason' in built) {
          rejected.push({ eyepieceId: ep.id, barlowId: bl?.id ?? null, reason: built.reason })
          continue
        }
        candidates.push(built.rec)
      }
    }
  }

  if (candidates.length === 0) return { primary: null, alternatives: [], rejected }

  candidates.sort(
    (a, b) =>
      b.fit - a.fit ||
      // Tie-break TOWARD LOWER MAGNIFICATION. On an undriven Dobsonian more
      // power is a real cost: dimmer image, shorter dwell, more nudging.
      b.exitPupilMm - a.exitPupilMm ||
      b.driftHalfFieldSec - a.driftHalfFieldSec ||
      a.eyepiece.id.localeCompare(b.eyepiece.id),
  )

  const primary = candidates[0]!
  attachFilter(primary, kind, filters, prefs, cond)

  // Alternatives must differ STRUCTURALLY — one wider, one tighter. Never
  // three near-identical combinations.
  const wider = candidates.find((c) => c.magnification < primary.magnification * 0.6)
  const tighter = candidates.find((c) => c.magnification > primary.magnification * 1.6)
  const alternatives = [wider, tighter].filter((x): x is Recommendation => Boolean(x))
  for (const alt of alternatives) attachFilter(alt, kind, filters, prefs, cond)

  // GUARANTEE 1, last line of defence: re-check the ban on the way out, since
  // this is the only path to the screen.
  for (const r of [primary, ...alternatives]) {
    if (isForbidden(r.eyepiece)) {
      throw new Error(`Forbidden gear reached recommendation output: ${r.eyepiece.model}`)
    }
  }

  return { primary, alternatives, rejected }
}

// ---------------------------------------------------------------------------

function enumerateFocals(
  ep: Eyepiece,
  bl: Barlow | null,
  prefs: RecommendPrefs,
  sizeArcmin: number | null,
): { focalMm: number; exact: boolean }[] {
  if (ep.focal.kind === 'fixed') return [{ focalMm: ep.focal.focalMm, exact: true }]
  const { minMm, maxMm, clickStopsMm } = ep.focal
  if (clickStopsMm && clickStopsMm.length > 0) {
    // Only positions the observer can physically set.
    return clickStopsMm.map((f) => ({ focalMm: f, exact: true }))
  }
  // Continuous zoom: sample, then report the value directly.
  const out: { focalMm: number; exact: boolean }[] = []
  for (let f = minMm; f <= maxMm + 1e-9; f += 0.5) {
    out.push({ focalMm: Math.round(f * 10) / 10, exact: true })
  }
  void bl
  void prefs
  void sizeArcmin
  return out
}

function afovFor(ep: Eyepiece, focalMm: number): number {
  if (ep.afov.kind === 'fixed') return ep.afov.deg
  const spec =
    ep.focal.kind === 'zoom'
      ? { minMm: ep.focal.minMm, maxMm: ep.focal.maxMm }
      : { minMm: focalMm, maxMm: focalMm }
  return interpolateZoomAfov(focalMm, {
    ...spec,
    afovAtMinDeg: ep.afov.atMinFocalDeg,
    afovAtMaxDeg: ep.afov.atMaxFocalDeg,
  })
}

function build(
  ep: Eyepiece,
  bl: Barlow | null,
  fc: { focalMm: number; exact: boolean },
  prefs: RecommendPrefs,
  kind: TargetKind,
  sizeArcmin: number | null,
  decDeg: number,
): { rec: Recommendation } | { reason: string } {
  const factor = bl?.factor ?? 1
  const mag = magnification(fc.focalMm, factor)
  const exitPupil = exitPupilMm(fc.focalMm, factor)

  if (exitPupil < 0.5) {
    return { reason: `${label(ep, bl, fc.focalMm)} gives a ${exitPupil.toFixed(2)} mm exit pupil — too dim to be useful.` }
  }
  if (!isMagnificationSane(mag, prefs.seeing, prefs.eyePupilMm)) {
    return {
      reason:
        mag > maxUsefulMagnification(prefs.seeing)
          ? `${label(ep, bl, fc.focalMm)} gives ${Math.round(mag)}x, beyond what ${prefs.seeing} seeing supports.`
          : `${label(ep, bl, fc.focalMm)} gives only ${Math.round(mag)}x, which wastes the aperture.`,
    }
  }

  const afov = afovFor(ep, fc.focalMm)
  const tfov = trueFovDegFromAfov(afov, fc.focalMm, factor)
  const drift = (((tfov * 3600) / 2) / (SIDEREAL_ARCSEC_PER_SEC * Math.cos((decDeg * Math.PI) / 180)))

  if (drift < MIN_DRIFT_DWELL_SEC) {
    return { reason: `${label(ep, bl, fc.focalMm)} lets the object cross the field in ${Math.round(drift)}s — too much nudging.` }
  }

  const warnings: string[] = []
  const reasoning: string[] = []
  const evidence: EvidenceRef[] = [cite('formula.magnification'), cite('formula.exit-pupil')]

  let fillRatio: number | null = null
  if (sizeArcmin !== null && sizeArcmin > 0) {
    fillRatio = (tfov * 60) / sizeArcmin
    if (fillRatio < FILL_RATIO) {
      // Not an automatic rejection: some objects are simply larger than any
      // field this telescope can produce, and the honest answer is to say so.
      warnings.push(
        `This object spans ${sizeArcmin.toFixed(0)}′ and the field here is ${(tfov * 60).toFixed(0)}′ — you will see part of it, not all of it.`,
      )
    }
  }

  // Effective aperture loss when the exit pupil exceeds the eye's pupil.
  let effectiveAperture = TELESCOPE.apertureMm
  if (exitPupil > prefs.eyePupilMm) {
    effectiveAperture = (TELESCOPE.apertureMm * prefs.eyePupilMm) / exitPupil
    warnings.push(
      `The ${exitPupil.toFixed(1)} mm exit pupil is wider than a ${prefs.eyePupilMm} mm dark-adapted pupil, so you are effectively using ${effectiveAperture.toFixed(0)} mm of the 203 mm.`,
    )
  }

  if (ep.afov.kind === 'range' && ep.afov.status !== 'verified') {
    warnings.push(`Field-of-view figures for the ${ep.model} are unconfirmed, so framing advice is approximate.`)
  }

  reasoning.push(`${Math.round(mag)}× at a ${exitPupil.toFixed(1)} mm exit pupil, ${(tfov * 60).toFixed(0)}′ of true field.`)
  if (bl) reasoning.push(`The ${bl.model} multiplies the ${fc.focalMm} mm eyepiece to an effective ${(fc.focalMm / factor).toFixed(1)} mm.`)

  const fit = scoreFit(kind, exitPupil, fillRatio, afov, drift)

  return {
    rec: {
      eyepiece: ep,
      eyepieceFocalMm: fc.focalMm,
      focalIsExact: fc.exact,
      barlow: bl,
      filter: null,
      magnification: round2(mag),
      exitPupilMm: round2(exitPupil),
      trueFovDeg: round4(tfov),
      fillRatio: fillRatio === null ? null : round2(fillRatio),
      driftHalfFieldSec: Math.round(drift),
      effectiveApertureMm: Math.round(effectiveAperture),
      fit,
      reasoning,
      warnings,
      evidence,
    },
  }
}

function scoreFit(
  kind: TargetKind,
  exitPupil: number,
  fillRatio: number | null,
  afov: number,
  driftSec: number,
): number {
  const [lo, hi] = EXIT_PUPIL_BANDS[kind]
  const pupilFit =
    exitPupil >= lo && exitPupil <= hi
      ? 1
      : Math.max(0, 1 - (exitPupil < lo ? (lo - exitPupil) / lo : (exitPupil - hi) / hi))

  // Peaks around 3x fill; a 20' galaxy inside a 115' field is a dot.
  const framing =
    fillRatio === null
      ? 0.7
      : fillRatio < FILL_RATIO
        ? Math.max(0, fillRatio / FILL_RATIO) * 0.7
        : Math.max(0, 1 - Math.abs(Math.log(fillRatio / 3)) / 1.6)

  const comfort = Math.min(1, afov / 82) * 0.6 + Math.min(1, driftSec / 120) * 0.4

  return round4(0.4 * pupilFit + 0.3 * framing + 0.2 * pupilFit + 0.1 * comfort)
}

/**
 * GUARANTEE 3. Filters are chosen AFTER the eyepiece so they never distort
 * framing, and only when there is a real reason.
 */
function attachFilter(
  rec: Recommendation,
  kind: TargetKind,
  filters: readonly Filter[],
  prefs: RecommendPrefs,
  cond: { moonBright?: boolean; suburbanSky?: boolean },
): void {
  const uhc = filters.find((f) => f.filterClass === 'narrowband-uhc')

  if (uhc && UHC_ALLOWED.has(kind)) {
    // Even for eligible objects, only when it will actually help. On a dark,
    // moonless night a bright emission nebula needs no filter, and saying so
    // builds more trust than reflexively suggesting one.
    const worthIt = Boolean(cond.moonBright) || Boolean(cond.suburbanSky)
    // A UHC costs light; do not stack it with an already-small exit pupil.
    if (worthIt && rec.exitPupilMm >= 2.0 && uhc.threadMm >= rec.eyepiece.barrelMm) {
      rec.filter = uhc
      rec.reasoning.push(
        'The UHC passes the oxygen and hydrogen lines this object emits while blocking the rest of the sky glow.',
      )
      rec.evidence.push(cite('convention.uhc-line-emission-only'))
      return
    }
    rec.reasoning.push('No filter needed — the sky is dark enough that a UHC would only cost you light.')
    return
  }

  const denial = UHC_DENIED_REASON[kind]
  if (denial) {
    rec.reasoning.push(`No filter. ${denial}`)
    rec.evidence.push(cite('convention.uhc-line-emission-only'))
  }

  // Colour filters: planets only, opt-in, and never a default.
  if (prefs.allowColourFilters && kind === 'planet' && rec.magnification >= 100) {
    const orange = filters.find((f) => f.wratten === '21')
    if (orange) {
      rec.filter = orange
      rec.reasoning.push('Optional: the #21 orange filter can lift belt and surface contrast.')
      rec.evidence.push(cite('convention.wratten-planetary'))
    }
  }
}

// ---------------------------------------------------------------------------

function label(ep: Eyepiece, bl: Barlow | null, focalMm: number): string {
  const base = ep.focal.kind === 'zoom' ? `${ep.model} at ${focalMm} mm` : ep.model
  return bl ? `${base} + ${bl.model}` : base
}

/** Human-readable summary of what to physically assemble. */
export function describeSetup(rec: Recommendation): string {
  const parts = [
    rec.eyepiece.focal.kind === 'zoom'
      ? `${rec.eyepiece.brand} ${rec.eyepiece.model} set to ${rec.focalIsExact ? '' : '≈'}${rec.eyepieceFocalMm} mm`
      : `${rec.eyepiece.brand} ${rec.eyepiece.model}`,
  ]
  if (rec.barlow) parts.push(`+ ${rec.barlow.model}`)
  if (rec.filter) parts.push(`+ ${rec.filter.model}`)
  return parts.join(' ')
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}
function round4(v: number): number {
  return Math.round(v * 10000) / 10000
}

export { snapZoomFocal }
export type { DeepSkyTarget }
