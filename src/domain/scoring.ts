/**
 * The Observability Score.
 *
 * This is a 0-100 SCORE, not a probability of seeing anything. It expresses
 * "how good is this opportunity, relative to other opportunities tonight".
 *
 * STRUCTURE — deliberately two-tier, not a flat weighted sum:
 *
 *     Base  = SUM(w_i * A_i)   over altitude, duration, magnitude, surface brightness
 *     Sky   = A_cloud^a * A_dark^b * A_moon^g
 *     Score = 100 * Base * Sky      (0 when any gate fails)
 *
 * A flat weighted sum is wrong here. With a 0.25 weight on cloud, a totally
 * overcast target would still score 75. Cloud, darkness and Moon are VETO-like:
 * any one of them at zero makes the object unobservable no matter how well
 * placed it is. Altitude, duration and brightness are genuine trade-offs, so
 * they belong in the additive part.
 *
 * NEVER FABRICATED: seeing and transparency are not measured by any source this
 * app uses, and are not modelled. Missing weather sets a NEUTRAL multiplier and
 * lowers `confidence`; it never invents a number.
 */
import { Body, Illumination, MakeTime } from 'astronomy-engine'
import {
  type GeoLocation,
  airmass,
  bodyHorizontal,
  fixedHorizontal,
  moonState,
  angularSeparationDeg,
  DEFAULT_ZENITH_EXTINCTION_MAG,
} from './ephemeris'
import { limitingMagnitudeOptimistic } from './optics'
import { classify, type DeepSkyTarget, type Target, type TargetClass } from './targets'
import { cite, type EvidenceRef } from '../data/evidence'

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** One hour of forecast. `null` fields mean UNKNOWN, never zero. */
export interface WeatherSample {
  time: Date
  cloudCoverPct: number | null
  visibilityM: number | null
  relativeHumidityPct: number | null
  dewPointC: number | null
  windSpeedKmh: number | null
  temperatureC: number | null
}

export interface ObservingWindow {
  start: Date
  end: Date
  /**
   * 10 minutes. Justified three ways: the fastest an object's altitude can
   * change here is 15.041 deg/hr * cos(39.45) = 11.6 deg/hr, so 10 minutes
   * bounds the change at 1.93 deg; the weather source is only HOURLY, so finer
   * sampling adds no information; and 10 min keeps a full catalogue sweep in
   * the low milliseconds.
   */
  stepMinutes: number
}

export interface ScoringPrefs {
  /** Below this altitude an object is not worth setting up for. */
  minUsefulAltitudeDeg: number
  /** Naked-eye limiting magnitude at the site. null = unknown -> assume suburban. */
  nelm: number | null
  zenithExtinction: number
}

export const DEFAULT_PREFS: ScoringPrefs = {
  minUsefulAltitudeDeg: 15,
  nelm: null,
  zenithExtinction: DEFAULT_ZENITH_EXTINCTION_MAG,
}

export const DEFAULT_STEP_MINUTES = 10

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export type Confidence = 'high' | 'medium' | 'low'

export type FactorId =
  | 'altitude'
  | 'duration'
  | 'magnitude'
  | 'surfaceBrightness'
  | 'cloud'
  | 'darkness'
  | 'moon'

export interface Factor {
  id: FactorId
  label: string
  /** Raw inputs that produced this, so the UI can explain the number. */
  input: Record<string, number | string | null>
  /** Normalised subscore 0-1. */
  value: number
  weight: number
  mode: 'additive' | 'multiplicative'
  /** True when the input was DEFAULTED rather than measured. Caps confidence. */
  assumed: boolean
  /** True when this stands in for something we cannot measure directly. */
  proxy: boolean
  evidence: EvidenceRef[]
  explain: string
}

export type NotTonightReason =
  | 'never-rises'
  | 'below-useful-altitude'
  | 'too-brief'
  | 'no-dark-overlap'
  | 'below-aperture-limit'

export interface Observability {
  targetId: string
  score: number
  confidence: Confidence
  observable: boolean
  reason?: NotTonightReason
  factors: Factor[]
  peakAltitudeDeg: number
  peakAtUtc: Date | null
  peakAzimuthDeg: number
  minutesUseful: number
  bestBlock: { start: Date; end: Date } | null
  popularityBonus: number
  finalScore: number
}

// ---------------------------------------------------------------------------
// Weight profiles
// ---------------------------------------------------------------------------

interface Profile {
  wAlt: number
  wTime: number
  wMag: number
  wSb: number
  aCloud: number
  bDark: number
  gMoon: number
  /** How much the Moon hurts this class of object. */
  moonSensitivity: number
}

const PROFILES: Record<TargetClass, Profile> = {
  // Planets, the Moon, double stars: bright, point-like, barely care about
  // twilight or moonlight.
  point: { wAlt: 0.6, wTime: 0.15, wMag: 0.25, wSb: 0, aCloud: 1, bDark: 0.15, gMoon: 0.3, moonSensitivity: 0.1 },
  // Clusters and bright planetary nebulae: some tolerance for imperfect skies.
  'extended-bright': {
    wAlt: 0.45, wTime: 0.2, wMag: 0.2, wSb: 0.15, aCloud: 1, bDark: 0.6, gMoon: 1, moonSensitivity: 0.45,
  },
  // Galaxies and faint nebulae: darkness is everything.
  'extended-faint': {
    wAlt: 0.45, wTime: 0.2, wMag: 0.2, wSb: 0.15, aCloud: 1, bDark: 0.8, gMoon: 1, moonSensitivity: 0.85,
  },
}

// ---------------------------------------------------------------------------
// Sub-scores
// ---------------------------------------------------------------------------

/**
 * Altitude, expressed through actual atmospheric extinction rather than an
 * invented curve. An object at 10 deg has lost over a magnitude before it
 * reaches the eyepiece; at the zenith it has lost 0.2.
 */
export function altitudeSubscore(altitudeDeg: number, k = DEFAULT_ZENITH_EXTINCTION_MAG): number {
  if (altitudeDeg <= 0) return 0
  const x = airmass(altitudeDeg)
  if (!Number.isFinite(x)) return 0
  return clamp01(Math.pow(10, -0.4 * k * (x - 1)))
}

/** Duration, saturating at 90 minutes of useful availability. */
export function durationSubscore(minutesUseful: number): number {
  return clamp01(minutesUseful / 90)
}

/**
 * Darkness from the Sun's altitude, interpolated between the standard twilight
 * definitions. Linear rather than stepped, so two targets cannot swap places
 * because of a one-minute timing difference.
 */
export function darknessSubscore(sunAltitudeDeg: number, cls: TargetClass): number {
  const h = sunAltitudeDeg
  if (cls === 'point') return clamp01(-h / 12) // usable from sunset, full by nautical
  return clamp01((-h - 6) / 12) // 0 at civil dusk, 1 at astronomical dark
}

/**
 * Cloud. Super-linear because partial cloud is disproportionately destructive
 * to a POINTED instrument: 40% cover does not mean 60% of a good session, it
 * means cloud keeps crossing the one spot you are looking at.
 */
export function cloudSubscore(cloudCoverPct: number): number {
  return clamp01(Math.pow(1 - clamp01(cloudCoverPct / 100), 1.5))
}

/** Full-Moon apparent magnitude, used as the flux reference. */
export const FULL_MOON_MAG = -12.74

/**
 * Fraction of the Moon's damage that applies to the WHOLE sky, regardless of
 * how far the target is from it.
 *
 * A full Moon raises sky brightness by roughly three magnitudes per square
 * arcsecond everywhere, not just in its own neighbourhood. An earlier version
 * of this function applied the penalty only within 60 degrees, which let a
 * nearly-full Moon score a faint galaxy at 95% simply because it happened to
 * be on the other side of the sky. Any observer knows that is wrong.
 */
const MOON_GLOBAL_SHARE = 0.5

/**
 * Moon interference.
 *
 * Uses the Moon's REAL computed magnitude converted to relative flux, rather
 * than raising illuminated fraction to a hand-picked power. This matters: a
 * first-quarter Moon is 50% illuminated but emits only about 8% of full-Moon
 * light. No simple phase heuristic captures that; the magnitude does, and it
 * comes from a citable computation.
 *
 * The penalty has two parts. The GLOBAL part depends only on how much light
 * the Moon is putting into the sky. The LOCAL part adds to it as the target
 * gets closer than about 60 degrees, where the Moon's glare gradient bites.
 * Separation modulates a real penalty; it does not decide whether one exists.
 */
export function moonSubscore(args: {
  moonMagnitude: number
  moonAltitudeDeg: number
  separationDeg: number
  sensitivity: number
}): number {
  const flux = clamp01(Math.pow(10, -0.4 * (args.moonMagnitude - FULL_MOON_MAG)))
  // Ramps in from -2 deg: refraction and scattering keep a just-set Moon
  // brightening the sky.
  const up = clamp01((args.moonAltitudeDeg + 2) / 10)
  const local = clamp01(1 - args.separationDeg / 60)
  const shape = MOON_GLOBAL_SHARE + (1 - MOON_GLOBAL_SHARE) * local
  return clamp01(1 - args.sensitivity * flux * up * shape)
}

/** Brightness headroom against what this aperture can reach. */
export function magnitudeSubscore(
  targetMag: number | null,
  limitingMag: number,
): { value: number; assumed: boolean } {
  if (targetMag === null) return { value: 0.5, assumed: true }
  return { value: clamp01((limitingMag - targetMag + 1) / 3), assumed: false }
}

/**
 * Surface brightness. A KNOWN-WEAK proxy, weighted lowest for that reason.
 *
 * Catalogue surface brightness is a MEAN over the whole object, which averages
 * a brilliant core with a vast faint halo. M42 and M31 both score badly here
 * despite being the finest objects in the sky. `brightCore` corrects the worst
 * offenders; the weight is small so this can never sink a target on its own.
 */
const BRIGHT_CORE = new Set([
  'M42', 'M31', 'M27', 'M57', 'M8', 'M17', 'M13', 'M5', 'M22', 'M104', 'M82', 'M97', 'M1', 'M20',
])

export function surfaceBrightnessSubscore(
  target: DeepSkyTarget,
  skyBrightnessMagArcmin2: number,
): { value: number; assumed: boolean; proxy: boolean } {
  if (BRIGHT_CORE.has(target.name)) {
    return { value: 0.75, assumed: true, proxy: true }
  }
  if (target.surfaceBrightness === null) {
    return { value: 0.5, assumed: true, proxy: true }
  }
  const delta = skyBrightnessMagArcmin2 - target.surfaceBrightness
  return { value: clamp01((delta + 1) / 4), assumed: false, proxy: true }
}

// ---------------------------------------------------------------------------
// Window sampling
// ---------------------------------------------------------------------------

interface Sample {
  time: Date
  altitudeDeg: number
  azimuthDeg: number
  sunAltitudeDeg: number
  cloudPct: number | null
  moonMag: number
  moonAltDeg: number
  moonSepDeg: number
}

function sampleTimes(w: ObservingWindow): Date[] {
  const out: Date[] = []
  const stepMs = w.stepMinutes * 60_000
  for (let t = w.start.getTime(); t <= w.end.getTime(); t += stepMs) out.push(new Date(t))
  return out
}

function nearestWeather(samples: readonly WeatherSample[], t: Date): WeatherSample | null {
  if (samples.length === 0) return null
  let best: WeatherSample | null = null
  let bestDt = Infinity
  for (const s of samples) {
    const dt = Math.abs(s.time.getTime() - t.getTime())
    if (dt < bestDt) {
      bestDt = dt
      best = s
    }
  }
  // More than 90 minutes from any forecast hour: treat as no data.
  return bestDt <= 90 * 60_000 ? best : null
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function scoreTarget(args: {
  target: Target
  loc: GeoLocation
  window: ObservingWindow
  weather: readonly WeatherSample[] | null
  prefs?: ScoringPrefs
}): Observability {
  const prefs = args.prefs ?? DEFAULT_PREFS
  const { target, loc, window } = args
  const isDeepSky = target.type === 'deep-sky'

  const cls: TargetClass = isDeepSky
    ? classify(target.kind, target.surfaceBrightness)
    : 'point'
  const profile = PROFILES[cls]

  // --- sample the whole window ------------------------------------------
  const times = sampleTimes(window)

  /**
   * Narrow the forecast to this window ONCE, rather than scanning the whole
   * feed for every time bucket of every target. The feed is sixteen days long
   * so the Upcoming screen has real weather to work with, and rescanning all
   * of it per bucket was quadratic in the length of a forecast that only ever
   * gets longer.
   */
  const nearby = args.weather
    ? args.weather.filter(
        (s) =>
          s.time.getTime() >= window.start.getTime() - 2 * 3600_000 &&
          s.time.getTime() <= window.end.getTime() + 2 * 3600_000,
      )
    : null
  const samples: Sample[] = times.map((t) => {
    const pos = isDeepSky
      ? fixedHorizontal(target.raHoursJ2000, target.decDegJ2000, t, loc, 'normal')
      : bodyHorizontal(target.body, t, loc, 'normal')
    const sun = bodyHorizontal(Body.Sun, t, loc, 'none')
    const moon = moonState(t, loc)
    const moonIllum = moonMagnitudeAt(t)
    const sep = isDeepSky
      ? angularSeparationDeg(target.raHoursJ2000, target.decDegJ2000, moon.raHours, moon.decDeg)
      : separationFromBody(target.body, t, loc)
    const w = nearby && nearby.length > 0 ? nearestWeather(nearby, t) : null
    return {
      time: t,
      altitudeDeg: pos.altitudeDeg,
      azimuthDeg: pos.azimuthDeg,
      sunAltitudeDeg: sun.altitudeDeg,
      cloudPct: w?.cloudCoverPct ?? null,
      moonMag: moonIllum,
      moonAltDeg: moon.altitudeDeg,
      moonSepDeg: sep,
    }
  })

  // --- per-sample quality, then take the BEST moment ---------------------
  // The observer only needs one good moment. Averaging a night that is cloudy
  // at 21:00 and pristine at 01:00 would give a mediocre score to what is
  // actually a fine target — you simply go out later.
  let best: Sample | null = null
  let bestQ = -1
  let peakAlt = -90
  let peakSample: Sample | null = null

  for (const s of samples) {
    if (s.altitudeDeg > peakAlt) {
      peakAlt = s.altitudeDeg
      peakSample = s
    }
    const q =
      altitudeSubscore(s.altitudeDeg, prefs.zenithExtinction) *
      darknessSubscore(s.sunAltitudeDeg, cls) *
      (s.cloudPct === null ? 1 : cloudSubscore(s.cloudPct)) *
      moonSubscore({
        moonMagnitude: s.moonMag,
        moonAltitudeDeg: s.moonAltDeg,
        separationDeg: s.moonSepDeg,
        sensitivity: profile.moonSensitivity,
      })
    if (q > bestQ) {
      bestQ = q
      best = s
    }
  }

  const usable = samples.filter(
    (s) =>
      s.altitudeDeg >= prefs.minUsefulAltitudeDeg &&
      darknessSubscore(s.sunAltitudeDeg, cls) > 0.25 &&
      (s.cloudPct === null || cloudSubscore(s.cloudPct) > 0.15),
  )
  const minutesUseful = usable.length * window.stepMinutes
  const bestBlock = longestRun(samples, usable, window.stepMinutes)

  // --- gates -------------------------------------------------------------
  const nelm = prefs.nelm
  const limitingMag =
    (nelm ?? 5.0) + 5 * Math.log10(203 / 6) - 0.5 - prefs.zenithExtinction * (airmassSafe(peakAlt) - 1)

  const targetMag = isDeepSky ? target.magnitude : null
  let reason: NotTonightReason | undefined
  if (peakAlt < prefs.minUsefulAltitudeDeg) reason = 'below-useful-altitude'
  else if (minutesUseful < 20) reason = 'too-brief'
  else if (cls !== 'point' && samples.every((s) => darknessSubscore(s.sunAltitudeDeg, cls) === 0))
    reason = 'no-dark-overlap'
  else if (targetMag !== null && targetMag > limitingMag + 0.5) reason = 'below-aperture-limit'

  // --- factors -----------------------------------------------------------
  const b = best ?? samples[0]!
  const skyBrightness = nelm === null ? 20.5 + 8.89 : nelm * 2 + 10.5 + 8.89

  const aAlt = altitudeSubscore(peakAlt, prefs.zenithExtinction)
  const aTime = durationSubscore(minutesUseful)
  const magSub = magnitudeSubscore(targetMag, limitingMag)
  const sbSub = isDeepSky
    ? surfaceBrightnessSubscore(target, skyBrightness)
    : { value: 0, assumed: false, proxy: false }
  const aDark = darknessSubscore(b.sunAltitudeDeg, cls)
  const hasCloud = b.cloudPct !== null
  const aCloud = hasCloud ? cloudSubscore(b.cloudPct!) : 1
  const aMoon = moonSubscore({
    moonMagnitude: b.moonMag,
    moonAltitudeDeg: b.moonAltDeg,
    separationDeg: b.moonSepDeg,
    sensitivity: profile.moonSensitivity,
  })

  const factors: Factor[] = [
    {
      id: 'altitude', label: 'Peak altitude', value: aAlt, weight: profile.wAlt, mode: 'additive',
      input: { peakAltitudeDeg: round(peakAlt, 2), airmass: round(airmassSafe(peakAlt), 3) },
      assumed: false, proxy: false,
      evidence: [cite('formula.kasten-young-airmass'), cite('formula.bouguer-extinction')],
      explain: `Peaks at ${round(peakAlt, 0)}°, costing ${round(prefs.zenithExtinction * (airmassSafe(peakAlt) - 1), 2)} magnitudes to the atmosphere.`,
    },
    {
      id: 'duration', label: 'Time available', value: aTime, weight: profile.wTime, mode: 'additive',
      input: { minutesUseful },
      assumed: false, proxy: false,
      evidence: [cite('assumption.session-block-minutes')],
      explain: `${minutesUseful} minutes above ${prefs.minUsefulAltitudeDeg}° in a dark sky.`,
    },
    {
      id: 'magnitude', label: 'Brightness', value: magSub.value, weight: profile.wMag, mode: 'additive',
      input: { magnitude: targetMag, limitingMagnitude: round(limitingMag, 2) },
      assumed: magSub.assumed, proxy: false,
      evidence: [cite('catalog.openngc'), cite('assumption.sky-brightness-default')],
      explain: targetMag === null
        ? 'No magnitude in the catalogue for this object.'
        : `Magnitude ${targetMag} against an estimated limit of ${round(limitingMag, 1)}.`,
    },
    {
      id: 'surfaceBrightness', label: 'Surface brightness', value: sbSub.value, weight: profile.wSb,
      mode: 'additive',
      input: { surfaceBrightness: isDeepSky ? target.surfaceBrightness : null },
      assumed: sbSub.assumed, proxy: sbSub.proxy,
      evidence: [cite('catalog.openngc')],
      explain:
        'Mean surface brightness. Objects with bright cores score low here, so the brightest showpieces are corrected by hand.',
    },
    {
      id: 'cloud', label: 'Cloud cover', value: aCloud, weight: profile.aCloud, mode: 'multiplicative',
      input: { cloudCoverPct: b.cloudPct },
      assumed: !hasCloud, proxy: false,
      evidence: hasCloud ? [cite('api.open-meteo'), cite('assumption.cloud-exponent')] : [],
      explain: hasCloud
        ? `${b.cloudPct}% cloud at the best moment.`
        : 'No forecast available — sky assumed clear. Check outside.',
    },
    {
      id: 'darkness', label: 'Sky darkness', value: aDark, weight: profile.bDark, mode: 'multiplicative',
      input: { sunAltitudeDeg: round(b.sunAltitudeDeg, 2) },
      assumed: false, proxy: false,
      evidence: [cite('library.astronomy-engine')],
      explain: `Sun ${round(-b.sunAltitudeDeg, 0)}° below the horizon at the best moment.`,
    },
    {
      id: 'moon', label: 'Moonlight', value: aMoon, weight: profile.gMoon, mode: 'multiplicative',
      input: {
        moonAltitudeDeg: round(b.moonAltDeg, 1),
        separationDeg: round(b.moonSepDeg, 1),
        moonMagnitude: round(b.moonMag, 2),
      },
      assumed: false, proxy: true,
      evidence: [cite('formula.moon-flux-from-magnitude')],
      explain:
        b.moonAltDeg < -2
          ? 'Moon is below the horizon.'
          : `Moon ${round(b.moonSepDeg, 0)}° away and ${round(b.moonAltDeg, 0)}° up.`,
    },
  ]

  // --- combine -----------------------------------------------------------
  const base =
    profile.wAlt * aAlt + profile.wTime * aTime + profile.wMag * magSub.value + profile.wSb * sbSub.value
  const sky =
    Math.pow(aCloud, profile.aCloud) * Math.pow(aDark, profile.bDark) * Math.pow(aMoon, profile.gMoon)

  const observable = reason === undefined
  const score = observable ? round(100 * base * sky, 2) : 0

  // Confidence is the FLOOR across all factors: any assumed input caps it at
  // medium, and missing weather drops it to low.
  let confidence: Confidence = 'high'
  if (factors.some((f) => f.assumed)) confidence = 'medium'
  if (!hasCloud || args.weather === null) confidence = 'low'
  if (prefs.nelm === null && confidence === 'high') confidence = 'medium'

  const popularity = target.popularity
  const popularityBonus = round(popularity * 4, 2)

  return {
    targetId: target.id,
    score,
    confidence,
    observable,
    reason,
    factors,
    peakAltitudeDeg: round(peakAlt, 3),
    peakAtUtc: peakSample?.time ?? null,
    peakAzimuthDeg: round(peakSample?.azimuthDeg ?? 0, 1),
    minutesUseful,
    bestBlock,
    popularityBonus,
    finalScore: observable ? Math.min(99.9, round(score + popularityBonus, 2)) : 0,
  }
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/**
 * Split into tonight / not-tonight, then rank.
 *
 * THE POPULARITY GUARANTEE IS STRUCTURAL, NOT NUMERIC. Observability is the
 * PARTITION KEY; the popularity bonus is applied only inside the observable
 * half. There is no arithmetic path by which a bonus can carry an unobservable
 * object across the partition. A bounds argument ("+4 is too small to matter")
 * would be fragile; a partition cannot be crossed at all.
 */
export function rank(all: readonly Observability[]): {
  tonight: Observability[]
  notTonight: Observability[]
} {
  const tonight = all.filter((o) => o.observable).slice()
  const notTonight = all.filter((o) => !o.observable).slice()
  tonight.sort(compareObservable)
  notTonight.sort(
    (a, b) => b.peakAltitudeDeg - a.peakAltitudeDeg || a.targetId.localeCompare(b.targetId),
  )
  return { tonight, notTonight }
}

/** Total order. Every tiebreaker is exact; the last one guarantees determinism. */
function compareObservable(a: Observability, b: Observability): number {
  return (
    b.finalScore - a.finalScore ||
    round(b.peakAltitudeDeg, 3) - round(a.peakAltitudeDeg, 3) ||
    b.minutesUseful - a.minutesUseful ||
    a.targetId.localeCompare(b.targetId)
  )
}

// ---------------------------------------------------------------------------

/** The Moon's apparent magnitude. Geocentric, so no observer is needed. */
function moonMagnitudeAt(t: Date): number {
  return Illumination(Body.Moon, MakeTime(t)).mag
}

function separationFromBody(body: Body, t: Date, loc: GeoLocation): number {
  const target = bodyHorizontal(body, t, loc, 'none')
  const moon = moonState(t, loc)
  return angularSeparationDeg(target.raHours, target.decDeg, moon.raHours, moon.decDeg)
}

function longestRun(
  all: readonly Sample[],
  usable: readonly Sample[],
  stepMinutes: number,
): { start: Date; end: Date } | null {
  if (usable.length === 0) return null
  const usableSet = new Set(usable.map((s) => s.time.getTime()))
  let bestStart: Date | null = null
  let bestLen = 0
  let curStart: Date | null = null
  let curLen = 0
  for (const s of all) {
    if (usableSet.has(s.time.getTime())) {
      if (curStart === null) curStart = s.time
      curLen += 1
      if (curLen > bestLen) {
        bestLen = curLen
        bestStart = curStart
      }
    } else {
      curStart = null
      curLen = 0
    }
  }
  if (bestStart === null) return null
  return { start: bestStart, end: new Date(bestStart.getTime() + bestLen * stepMinutes * 60_000) }
}

function airmassSafe(altDeg: number): number {
  const x = airmass(altDeg)
  return Number.isFinite(x) ? x : 40
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

function round(v: number, dp: number): number {
  const f = Math.pow(10, dp)
  return Math.round(v * f) / f
}

export { limitingMagnitudeOptimistic }
