/**
 * The observer's dashboard.
 *
 * Everything a serious amateur checks before going out, computed rather than
 * decorative. Nothing here is invented: values that cannot be derived come back
 * null and the UI simply omits the row.
 */
import { Body, Illumination, MakeTime, SearchMoonPhase, SiderealTime } from 'astronomy-engine'
import {
  HOME, bodyHorizontal, moonState, nextRise, nextSet, duskAt, dawnAt, darkWindow,
  TWILIGHT_ALTITUDE_DEG, type GeoLocation,
} from './ephemeris'
import { SOLAR_SYSTEM_TARGETS } from './targets'

export interface MoonReport {
  phaseName: string
  illuminatedPct: number
  /** Days since the last new Moon. */
  ageDays: number
  altitudeDeg: number
  rise: Date | null
  set: Date | null
  nextNew: Date | null
  nextFull: Date | null
  /** True when the Moon is out of the way. */
  favourable: boolean
}

export interface SunReport {
  set: Date | null
  civilDusk: Date | null
  nauticalDusk: Date | null
  astroDusk: Date | null
  astroDawn: Date | null
  rise: Date | null
  /** Hours of true astronomical darkness. */
  darkHours: number | null
}

export interface PlanetRow {
  id: string
  name: string
  altitudeDeg: number
  azimuthDeg: number
  magnitude: number | null
  up: boolean
}

export interface ShowerReport {
  name: string
  peak: string
  zhr: number
  /** True when within a few days of the peak. */
  active: boolean
  note: string
}

/**
 * The Moon's phase name from its age.
 *
 * Named from age rather than illuminated fraction, because illumination alone
 * cannot distinguish waxing from waning — a 50%-lit Moon is either first or
 * last quarter, and which one it is decides whether it is in the evening sky.
 */
function phaseName(ageDays: number): string {
  if (ageDays < 1.0) return 'New Moon'
  if (ageDays < 6.4) return 'Waxing crescent'
  if (ageDays < 8.4) return 'First quarter'
  if (ageDays < 13.8) return 'Waxing gibbous'
  if (ageDays < 15.8) return 'Full Moon'
  if (ageDays < 21.3) return 'Waning gibbous'
  if (ageDays < 23.3) return 'Last quarter'
  if (ageDays < 28.5) return 'Waning crescent'
  return 'New Moon'
}

export function moonReport(when: Date, loc: GeoLocation): MoonReport {
  const m = moonState(when, loc)
  const illum = Illumination(Body.Moon, MakeTime(when))

  // Age = time since the previous new Moon. Search back 30 days to find it.
  const prevNew = SearchMoonPhase(0, MakeTime(new Date(when.getTime() - 30 * 86_400_000)), 32)
  const ageDays = prevNew ? (when.getTime() - prevNew.date.getTime()) / 86_400_000 : 0

  const nextNew = SearchMoonPhase(0, MakeTime(when), 32)
  const nextFull = SearchMoonPhase(180, MakeTime(when), 32)
  const pct = Math.round(illum.phase_fraction * 100)

  return {
    phaseName: phaseName(ageDays),
    illuminatedPct: pct,
    ageDays: Number(ageDays.toFixed(1)),
    altitudeDeg: Number(m.altitudeDeg.toFixed(1)),
    rise: nextRise(Body.Moon, when, loc, 2),
    set: nextSet(Body.Moon, when, loc, 2),
    nextNew: nextNew?.date ?? null,
    nextFull: nextFull?.date ?? null,
    // Out of the way if it is down, or a thin crescent.
    favourable: m.altitudeDeg < 0 || pct < 25,
  }
}

export function sunReport(when: Date, loc: GeoLocation): SunReport {
  // Search from local noon so we always find THIS evening's sequence.
  const noon = new Date(when)
  noon.setHours(12, 0, 0, 0)
  const from = when.getHours() < 12 ? new Date(noon.getTime() - 86_400_000) : noon

  const astroDusk = duskAt(TWILIGHT_ALTITUDE_DEG.astronomical, from, loc, 1)
  const astroDawn = astroDusk ? dawnAt(TWILIGHT_ALTITUDE_DEG.astronomical, astroDusk, loc, 1) : null
  const dw = darkWindow(when, loc)

  return {
    set: nextSet(Body.Sun, from, loc, 1),
    civilDusk: duskAt(TWILIGHT_ALTITUDE_DEG.civil, from, loc, 1),
    nauticalDusk: duskAt(TWILIGHT_ALTITUDE_DEG.nautical, from, loc, 1),
    astroDusk,
    astroDawn,
    rise: nextRise(Body.Sun, from, loc, 2),
    darkHours:
      dw.start && dw.end ? Number(((dw.end.getTime() - dw.start.getTime()) / 3_600_000).toFixed(1)) : null,
  }
}

export function planetRows(when: Date, loc: GeoLocation): PlanetRow[] {
  return SOLAR_SYSTEM_TARGETS.filter((t) => t.kind === 'planet').map((t) => {
    const pos = bodyHorizontal(t.body, when, loc, 'normal')
    let mag: number | null = null
    try {
      mag = Number(Illumination(t.body, MakeTime(when)).mag.toFixed(1))
    } catch {
      mag = null
    }
    return {
      id: t.id,
      name: t.name,
      altitudeDeg: Number(pos.altitudeDeg.toFixed(0)),
      azimuthDeg: Number(pos.azimuthDeg.toFixed(0)),
      magnitude: mag,
      up: pos.altitudeDeg > 0,
    }
  })
}

/**
 * Local sidereal time — which right ascension is on your meridian right now.
 *
 * The single most useful number for planning: an object culminates when its RA
 * equals the local sidereal time, so this tells you at a glance what is best
 * placed.
 */
export function localSiderealHours(when: Date, loc: GeoLocation): number {
  const gst = SiderealTime(MakeTime(when))
  const lst = (gst + loc.longitudeDeg / 15) % 24
  return lst < 0 ? lst + 24 : lst
}

/**
 * The major annual meteor showers.
 *
 * Peak dates shift by a day between years; ZHR is the idealised rate under a
 * perfect dark sky at the zenith, and real observed counts are always lower.
 * Both caveats are carried into the UI rather than presenting the number as a
 * promise.
 */
const SHOWERS: { name: string; month: number; day: number; zhr: number; note: string }[] = [
  { name: 'Quadrantids', month: 1, day: 3, zhr: 110, note: 'Sharp peak, only a few hours wide' },
  { name: 'Lyrids', month: 4, day: 22, zhr: 18, note: 'Modest but reliable' },
  { name: 'Eta Aquariids', month: 5, day: 6, zhr: 50, note: 'Favours the pre-dawn hours' },
  { name: 'Perseids', month: 8, day: 12, zhr: 100, note: 'The best of the year from the north' },
  { name: 'Orionids', month: 10, day: 21, zhr: 20, note: 'Debris from Halley' },
  { name: 'Leonids', month: 11, day: 17, zhr: 15, note: 'Occasional storm years' },
  { name: 'Geminids', month: 12, day: 14, zhr: 150, note: 'The richest shower of the year' },
  { name: 'Ursids', month: 12, day: 22, zhr: 10, note: 'Sparse, circumpolar radiant' },
]

export function activeShowers(when: Date): ShowerReport[] {
  const year = when.getFullYear()
  return SHOWERS.map((s) => {
    const peak = new Date(year, s.month - 1, s.day, 2, 0, 0)
    const days = Math.abs((peak.getTime() - when.getTime()) / 86_400_000)
    return {
      name: s.name,
      peak: peak.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      zhr: s.zhr,
      active: days <= 6,
      note: s.note,
    }
  })
    .filter((s) => s.active)
    .sort((a, b) => b.zhr - a.zhr)
}

/**
 * Dew risk from the temperature/dew-point spread.
 *
 * This is genuinely actionable and genuinely derivable — unlike seeing or
 * transparency, which this app refuses to estimate. When the air cools to
 * within a couple of degrees of the dew point, optics fog.
 */
export function dewRisk(temperatureC: number | null, dewPointC: number | null):
  { level: 'high' | 'moderate' | 'low'; spreadC: number } | null {
  if (temperatureC === null || dewPointC === null) return null
  const spread = Number((temperatureC - dewPointC).toFixed(1))
  if (spread <= 2) return { level: 'high', spreadC: spread }
  if (spread <= 5) return { level: 'moderate', spreadC: spread }
  return { level: 'low', spreadC: spread }
}

export { HOME }
