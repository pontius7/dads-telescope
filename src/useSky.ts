/**
 * The bridge between the pure domain and React.
 *
 * All astronomy stays in `domain/`; this file only orchestrates: pick a window,
 * fetch weather, score, rank, and recommend gear. Nothing here computes an
 * astronomical quantity itself.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { HOME, darkWindow, type GeoLocation } from './domain/ephemeris'
import {
  scoreTarget, rank, DEFAULT_STEP_MINUTES,
  type Observability, type ObservingWindow, type WeatherSample,
} from './domain/scoring'
import { recommend, describeSetup, type Recommendation } from './domain/equipment'
import { SOLAR_SYSTEM_TARGETS, type Target } from './domain/targets'
import { DEEP_SKY_TARGETS } from './data/targets'
import { DEFAULT_INVENTORY } from './data/inventory'
import { fetchWeather, type WeatherResult } from './services/weather'

export interface ScoredTarget {
  target: Target
  observability: Observability
}

const LOC_KEY = 'dt.location.v1'

export function loadLocation(): GeoLocation {
  try {
    const raw = localStorage.getItem(LOC_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<GeoLocation> & { label?: string }
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

const ALL_TARGETS: Target[] = [
  ...SOLAR_SYSTEM_TARGETS.map((t) => ({ type: 'solar-system' as const, ...t })),
  ...DEEP_SKY_TARGETS.map((t) => ({ type: 'deep-sky' as const, ...t })),
]

/**
 * Choose tonight's observing window.
 *
 * Falls back to a sensible evening block when the Sun never reaches -18 deg,
 * rather than failing or inventing full darkness that does not occur.
 */
export function tonightWindow(now: Date, loc: GeoLocation): ObservingWindow {
  const dw = darkWindow(now, loc)
  if (dw.start && dw.end) {
    const start = new Date(Math.max(dw.start.getTime(), now.getTime()))
    const end = dw.end.getTime() > start.getTime() ? dw.end : new Date(start.getTime() + 3 * 3_600_000)
    return { start, end, stepMinutes: DEFAULT_STEP_MINUTES }
  }
  const start = new Date(now.getTime())
  return { start, end: new Date(start.getTime() + 4 * 3_600_000), stepMinutes: DEFAULT_STEP_MINUTES }
}

export function useSky(now: Date) {
  const [loc, setLoc] = useState<GeoLocation>(() => loadLocation())
  const [weather, setWeather] = useState<WeatherResult | null>(null)
  const [loadingWeather, setLoadingWeather] = useState(true)

  const window_ = useMemo(() => tonightWindow(now, loc), [now, loc])

  const refresh = useCallback(() => {
    let cancelled = false
    setLoadingWeather(true)
    fetchWeather(loc)
      .then((r) => {
        if (!cancelled) setWeather(r)
      })
      .finally(() => {
        if (!cancelled) setLoadingWeather(false)
      })
    return () => {
      cancelled = true
    }
  }, [loc])

  useEffect(() => refresh(), [refresh])

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
   * Markers drawn on the sky. Curated to roughly a dozen: the sky stays clean,
   * and everything else is reachable through the sheet.
   */
  const markers = useMemo(() => ranked.tonight.slice(0, 12), [ranked.tonight])

  /** Popular objects that are genuinely unavailable — shown with a reason. */
  const notableMissing = useMemo(
    () => ranked.notTonight.filter((s) => s.target.popularity >= 0.6).slice(0, 8),
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
    loadingWeather,
    refresh,
    tonight: ranked.tonight,
    notTonight: ranked.notTonight,
    notableMissing,
    markers,
  }
}

/** Gear advice for one target, given tonight's actual conditions. */
export function setupFor(
  s: ScoredTarget,
): { rec: Recommendation | null; text: string; alternatives: Recommendation[] } {
  const moonFactor = s.observability.factors.find((f) => f.id === 'moon')
  const r = recommend({
    target: s.target,
    inventory: DEFAULT_INVENTORY,
    conditions: {
      moonBright: (moonFactor?.value ?? 1) < 0.9,
      suburbanSky: true,
      peakAltitudeDeg: s.observability.peakAltitudeDeg,
    },
  })
  return {
    rec: r.primary,
    alternatives: r.alternatives,
    text: r.primary ? describeSetup(r.primary) : 'No suitable eyepiece available',
  }
}

/** Compass direction from an azimuth, for "where to look". */
export function compass(azDeg: number): string {
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  return names[Math.round(((azDeg % 360) + 360) % 360 / 22.5) % 16]!
}

export function formatTime(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
