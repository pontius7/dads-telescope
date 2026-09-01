/**
 * The bridge between the pure domain and React.
 *
 * All astronomy stays in `domain/`; this file only orchestrates: pick a window,
 * fetch weather, score, rank, and recommend gear. Nothing here computes an
 * astronomical quantity itself.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { HOME, darkWindow, duskAt, dawnAt, TWILIGHT_ALTITUDE_DEG, type GeoLocation } from './domain/ephemeris'
import {
  scoreTarget, rank, DEFAULT_STEP_MINUTES,
  type Observability, type ObservingWindow, type WeatherSample,
} from './domain/scoring'
import { recommend, describeSetup, type Recommendation } from './domain/equipment'
import { SOLAR_SYSTEM_TARGETS, type Target } from './domain/targets'
import { DEEP_SKY_TARGETS } from './data/targets'
import { loadInventory } from './data/inventoryStore'
import type { Inventory } from './data/inventory'
import { fetchWeather, type WeatherResult } from './services/weather'
import { orderForPeople } from './domain/featured'
import { assessConditions } from './domain/conditions'

export interface ScoredTarget {
  target: Target
  observability: Observability
}

const LOC_KEY = 'dt.location.v1'

export function loadLocation(): GeoLocation {
  try {
    const raw = localStorage.getItem(LOC_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<GeoLocation>
      if (typeof p.latitudeDeg === 'number' && typeof p.longitudeDeg === 'number') {
        return { latitudeDeg: p.latitudeDeg, longitudeDeg: p.longitudeDeg, elevationM: p.elevationM ?? 0 }
      }
    }
  } catch {
    /* storage unavailable — fall back to home */
  }
  return HOME
}

export function saveLocation(loc: GeoLocation): void {
  try {
    localStorage.setItem(LOC_KEY, JSON.stringify(loc))
  } catch {
    /* ignore */
  }
}

export const ALL_TARGETS: Target[] = [
  ...SOLAR_SYSTEM_TARGETS.map((t) => ({ type: 'solar-system' as const, ...t })),
  ...DEEP_SKY_TARGETS.map((t) => ({ type: 'deep-sky' as const, ...t })),
]

export const TARGETS_BY_ID = new Map(ALL_TARGETS.map((t) => [t.id, t]))

/**
 * Tonight's window: from now (or from dusk, if it is still light) to dawn.
 *
 * `darkWindow` already handles the case where the app is opened after dark, so
 * this only has to cope with the polar case where full darkness never arrives.
 */
export function tonightWindow(now: Date, loc: GeoLocation): ObservingWindow {
  const dw = darkWindow(now, loc)
  if (dw.start && dw.end) {
    const start = new Date(Math.max(dw.start.getTime(), now.getTime()))
    const end = dw.end.getTime() > start.getTime() ? dw.end : new Date(start.getTime() + 3 * 3_600_000)
    return { start, end, stepMinutes: DEFAULT_STEP_MINUTES }
  }
  return { start: now, end: new Date(now.getTime() + 4 * 3_600_000), stepMinutes: DEFAULT_STEP_MINUTES }
}

/**
 * A sensible default window for an arbitrary DATE, used by Plan Observing.
 *
 * Anchors on that evening's astronomical dusk and the following dawn, rather
 * than an arbitrary clock time, so the suggestion is actually useful.
 */
export function windowForDate(date: Date, loc: GeoLocation): ObservingWindow & { hasDarkness: boolean } {
  // Start the search from local noon so we always find that evening's dusk.
  const noon = new Date(date)
  noon.setHours(12, 0, 0, 0)
  const dusk = duskAt(TWILIGHT_ALTITUDE_DEG.astronomical, noon, loc, 1)
  const dawn = dusk ? dawnAt(TWILIGHT_ALTITUDE_DEG.astronomical, dusk, loc, 1) : null
  if (dusk && dawn) {
    return { start: dusk, end: dawn, stepMinutes: DEFAULT_STEP_MINUTES, hasDarkness: true }
  }
  // No astronomical darkness: fall back to sunset-ish and say so.
  const start = new Date(noon.getTime() + 9 * 3_600_000)
  return {
    start,
    end: new Date(start.getTime() + 4 * 3_600_000),
    stepMinutes: DEFAULT_STEP_MINUTES,
    hasDarkness: false,
  }
}

export function useSky(now: Date, overrideWindow?: ObservingWindow | null) {
  const [loc, setLoc] = useState<GeoLocation>(() => loadLocation())
  const [weather, setWeather] = useState<WeatherResult | null>(null)
  const [inventory, setInventory] = useState<Inventory>(() => loadInventory())

  const autoWindow = useMemo(() => tonightWindow(now, loc), [now, loc])
  const window_ = overrideWindow ?? autoWindow

  const refresh = useCallback(() => {
    let cancelled = false
    fetchWeather(loc).then((r) => {
      if (!cancelled) setWeather(r)
    })
    return () => {
      cancelled = true
    }
  }, [loc])

  useEffect(() => refresh(), [refresh])

  const reloadInventory = useCallback(() => setInventory(loadInventory()), [])

  const samples: WeatherSample[] | null = weather && weather.samples.length > 0 ? weather.samples : null

  const scored = useMemo<ScoredTarget[]>(
    () =>
      ALL_TARGETS.map((target) => ({
        target,
        observability: scoreTarget({ target, loc, window: window_, weather: samples }),
      })),
    [loc, window_, samples],
  )

  const ranked = useMemo(() => {
    const byId = new Map(scored.map((s) => [s.target.id, s]))
    const { tonight, notTonight } = rank(scored.map((s) => s.observability))
    return {
      tonight: tonight.map((o) => byId.get(o.targetId)!).filter(Boolean),
      notTonight: notTonight.map((o) => byId.get(o.targetId)!).filter(Boolean),
    }
  }, [scored])

  /**
   * The list a person reads, ordered by what they want to look at rather than
   * strictly by score. Only ever a reordering of what is already available —
   * see `domain/featured`.
   */
  const tonight = useMemo(
    () =>
      orderForPeople(
        ranked.tonight.map((s) => ({
          targetId: s.target.id,
          type: s.target.type,
          popularity: s.target.popularity,
          finalScore: s.observability.finalScore,
          peakAltitudeDeg: s.observability.peakAltitudeDeg,
          minutesUseful: s.observability.minutesUseful,
          scored: s,
        })),
      ).map((r) => r.scored),
    [ranked.tonight],
  )

  /** What the forecast allows tonight, in one verdict. */
  const conditions = useMemo(() => assessConditions(samples, window_), [samples, window_])

  /** Markers on the sky: curated to a dozen so the view stays clean. */
  const markers = useMemo(() => tonight.slice(0, 12), [tonight])

  const notableMissing = useMemo(
    () => ranked.notTonight.filter((s) => s.target.popularity >= 0.6).slice(0, 10),
    [ranked.notTonight],
  )

  return {
    loc,
    setLoc: (l: GeoLocation) => {
      saveLocation(l)
      setLoc(l)
    },
    window: window_,
    weather,
    refresh,
    inventory,
    reloadInventory,
    tonight,
    conditions,
    notTonight: ranked.notTonight,
    notableMissing,
    markers,
  }
}

/** Gear advice for one target, given the conditions actually computed for it. */
export function setupFor(
  s: ScoredTarget,
  inventory: Inventory,
): { rec: Recommendation | null; text: string; alternatives: Recommendation[] } {
  const moonFactor = s.observability.factors.find((f) => f.id === 'moon')
  const r = recommend({
    target: s.target,
    inventory,
    conditions: {
      moonBright: (moonFactor?.value ?? 1) < 0.9,
      suburbanSky: true,
      peakAltitudeDeg: s.observability.peakAltitudeDeg,
    },
  })
  return {
    rec: r.primary,
    alternatives: r.alternatives,
    text: r.primary ? describeSetup(r.primary) : '',
  }
}

export function compass(azDeg: number): string {
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  return names[Math.round((((azDeg % 360) + 360) % 360) / 22.5) % 16]!
}

export function formatTime(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

/** yyyy-mm-dd in LOCAL time, for <input type="date">. */
export function toDateInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function fromDateInput(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0)
}

/** hh:mm local, for <input type="time">. */
export function toTimeInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

export function withTime(base: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(base)
  d.setHours(h ?? 0, m ?? 0, 0, 0)
  return d
}
