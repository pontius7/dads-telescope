/**
 * The month ahead: when each object is at its best, and whether anyone can
 * say what the weather will be doing.
 *
 * WHAT IS REAL HERE, AND WHAT CANNOT BE.
 *
 * The astronomy is real for the whole month and always will be. Where an
 * object sits at midnight three weeks from now, how long it stays up, how much
 * of the Moon is lit and how close it passes — all of that is arithmetic on
 * orbits, computed by the same engine that scores tonight.
 *
 * The weather is not. A forecast reaches days, not a month. Open-Meteo tops
 * out at sixteen; past that there is no data in the world to fetch, and this
 * app does not invent numbers. So every night is marked with whether a
 * forecast reached it. Nights it did not reach are scored on astronomy alone
 * and SAY SO — the alternative is a screen that quietly implies a clear sky a
 * fortnight out, which is precisely the failure the whole app is built to
 * avoid.
 *
 * That split is not a shortcoming to apologise for. "M31 is highest at 2am on
 * the 24th, on a night with no Moon" is a fact you can plan around. "It will
 * be clear" is not something anyone knows.
 */
import { bodyHorizontal, darkWindow, fixedHorizontal, type GeoLocation } from './ephemeris'
import { moonReport } from './tonight'
import { scoreTarget, type ObservingWindow, type WeatherSample } from './scoring'
import type { Target } from './targets'

export interface UpcomingPick {
  targetId: string
  /** The night it is best on, keyed to that night's darkness starting. */
  night: Date
  /** When during that night it peaks, inside darkness. */
  bestTime: Date
  /** The usable stretch, which is what he actually plans around. */
  bestBlock: { start: Date; end: Date } | null
  peakAltitudeDeg: number
  peakAzimuthDeg: number
  minutesUseful: number
  score: number
  /** Whether a forecast reached this night at all. */
  forecast: 'included' | 'none'
  /** The night's cloud, or null where no forecast reached it. */
  cloudCoverPct: number | null
  moonIlluminatedPct: number
}

export interface UpcomingRequest {
  from: Date
  nights: number
  loc: GeoLocation
  targets: readonly Target[]
  weather: readonly WeatherSample[] | null
  limit: number
  /**
   * How many objects may share one night. Without a cap the whole list
   * collapses onto the darkest night of the month — which is the correct
   * answer to "when is each object best" and a useless answer to "what is
   * coming up", because it is one night and twelve rows.
   */
  maxPerNight?: number
}

const DAY_MS = 24 * 3600_000

/**
 * A coarser stride than the nightly window uses. Thirty nights of full
 * ten-minute sampling is tens of thousands of ephemeris evaluations for a
 * screen that only needs to rank nights against each other, and half an hour
 * moves an object by at most six degrees.
 */
const SCAN_STEP_MINUTES = 30

/**
 * Below this the object is in thick air and is not what anyone means by a good
 * night, so the pre-pass drops it before the expensive scoring runs.
 */
const WORTH_SCORING_ALT_DEG = 18

/**
 * Cheap proxy for how good a night is for one object: how high it climbs, and
 * how dark the Moon leaves the sky.
 *
 * Three altitude samples instead of seventeen, and no scoring at all. Scoring
 * every object on every night of a month is thousands of ephemeris evaluations
 * for a screen that mostly needs to know which nights are worth a closer look
 * — the first version of this took the better part of a second on a desktop,
 * which is not a budget a phone has.
 */
function nightProxy(
  target: Target,
  loc: GeoLocation,
  window: ObservingWindow,
  moonIlluminatedPct: number,
): number {
  const mid = new Date((window.start.getTime() + window.end.getTime()) / 2)
  let peak = -90
  for (const t of [window.start, mid, window.end]) {
    const h =
      target.type === 'deep-sky'
        ? fixedHorizontal(target.raHoursJ2000, target.decDegJ2000, t, loc, 'normal')
        : bodyHorizontal(target.body, t, loc, 'normal')
    if (h.altitudeDeg > peak) peak = h.altitudeDeg
  }
  if (peak < WORTH_SCORING_ALT_DEG) return -1
  // Altitude decides most of it; a bright Moon takes the edge off any night.
  return peak - moonIlluminatedPct * 0.25
}

/** How many nights per object get the full, exact treatment. */
const SHORTLIST = 4

/**
 * The first nights are always scored properly whatever the proxy thinks: they
 * are the ones with a real forecast attached, and the ones he can act on
 * without waiting.
 */
const ALWAYS_SCORE_FIRST = 3

function samplesInside(
  weather: readonly WeatherSample[] | null,
  window: ObservingWindow,
): WeatherSample[] | null {
  if (!weather || weather.length === 0) return null
  const inside = weather.filter(
    (s) =>
      s.time.getTime() >= window.start.getTime() - 3600_000 &&
      s.time.getTime() <= window.end.getTime() + 3600_000,
  )
  return inside.length > 0 ? inside : null
}

/** The night's cloud, taken at its clearest hour, matching how nights are scored. */
function cloudOf(samples: readonly WeatherSample[] | null): number | null {
  if (!samples) return null
  const known = samples.map((s) => s.cloudCoverPct).filter((c): c is number => c !== null)
  return known.length ? Math.min(...known) : null
}

interface NightContext {
  index: number
  window: ObservingWindow
  weather: WeatherSample[] | null
  cloudCoverPct: number | null
  moonIlluminatedPct: number
}

export function upcomingHighlights(req: UpcomingRequest): UpcomingPick[] {
  // ---- Every night's shared facts, computed once rather than per target ----
  const nights: NightContext[] = []
  for (let d = 0; d < req.nights; d += 1) {
    const dark = darkWindow(new Date(req.from.getTime() + d * DAY_MS), req.loc)
    // A night with no astronomical darkness is not a night to plan for.
    if (!dark.start || !dark.end) continue
    const window: ObservingWindow = {
      start: dark.start,
      end: dark.end,
      stepMinutes: SCAN_STEP_MINUTES,
    }
    const weather = samplesInside(req.weather, window)
    nights.push({
      index: d,
      window,
      weather,
      cloudCoverPct: cloudOf(weather),
      moonIlluminatedPct: moonReport(dark.start, req.loc).illuminatedPct,
    })
  }

  const picks: UpcomingPick[] = []

  for (const target of req.targets) {
    // ---- Pass one: rank the month's nights cheaply ----
    const ranked = nights
      .map((n) => ({ n, proxy: nightProxy(target, req.loc, n.window, n.moonIlluminatedPct) }))
      .filter((r) => r.proxy > 0)
    if (ranked.length === 0) continue

    const shortlist = new Set(
      ranked
        .slice()
        .sort((a, b) => b.proxy - a.proxy)
        .slice(0, SHORTLIST)
        .map((r) => r.n.index),
    )
    for (const r of ranked.slice(0, ALWAYS_SCORE_FIRST)) shortlist.add(r.n.index)

    // ---- Pass two: the real engine, on the few nights that earned it ----
    // Every scored night is kept, not just the winner. Selection needs the
    // runners-up: a dozen objects all peak on the month's darkest night, and
    // without an alternative to offer them the list collapses onto it.
    for (const { n } of ranked) {
      if (!shortlist.has(n.index)) continue
      const o = scoreTarget({ target, loc: req.loc, window: n.window, weather: n.weather })
      // Real visibility is the bar, not the score: this screen is about what
      // he can go outside and actually see.
      if (!o.observable || o.minutesUseful <= 0 || o.peakAltitudeDeg <= 0) continue

      picks.push({
        targetId: target.id,
        night: n.window.start,
        bestTime: o.peakAtUtc ?? n.window.start,
        bestBlock: o.bestBlock,
        peakAltitudeDeg: o.peakAltitudeDeg,
        peakAzimuthDeg: o.peakAzimuthDeg,
        minutesUseful: o.minutesUseful,
        score: o.finalScore,
        forecast: n.weather ? 'included' : 'none',
        cloudCoverPct: n.weather ? n.cloudCoverPct : null,
        moonIlluminatedPct: n.moonIlluminatedPct,
      })
    }
  }

  const perNight = req.maxPerNight ?? 2
  // Best first, so the strongest opportunity for each object claims its night
  // before a weaker one can take the slot.
  const byScore = picks
    .slice()
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.night.getTime() - b.night.getTime() ||
        a.targetId.localeCompare(b.targetId),
    )

  const chosen: UpcomingPick[] = []
  const taken = new Set<string>()
  const perNightCount = new Map<number, number>()

  // Two passes over the same candidates: the first honours the night cap, and
  // the second fills any remaining slots with each object's own best night. A
  // month with few usable nights still returns a full list.
  for (const cap of [perNight, Number.POSITIVE_INFINITY]) {
    for (const p of byScore) {
      if (chosen.length >= req.limit) break
      if (taken.has(p.targetId)) continue
      const key = p.night.getTime()
      if ((perNightCount.get(key) ?? 0) >= cap) continue
      perNightCount.set(key, (perNightCount.get(key) ?? 0) + 1)
      taken.add(p.targetId)
      chosen.push(p)
    }
  }

  return chosen.sort(
    (a, b) => a.night.getTime() - b.night.getTime() || a.targetId.localeCompare(b.targetId),
  )
}
