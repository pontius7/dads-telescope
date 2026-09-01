import { describe, it, expect } from 'vitest'
import { upcomingHighlights } from './upcoming'
import { HOME } from './ephemeris'
import { SOLAR_SYSTEM_TARGETS } from './targets'
import { DEEP_SKY_TARGETS } from '../data/targets'
import type { Target } from './targets'
import type { WeatherSample } from './scoring'

/**
 * The candidate set the app actually passes: everything in the sky is not
 * worth scanning a month for, and the screen exists to surface things worth
 * planning around.
 */
const CATALOGUE: Target[] = [
  ...SOLAR_SYSTEM_TARGETS.map((t) => ({ type: 'solar-system' as const, ...t })),
  ...DEEP_SKY_TARGETS.filter((t) => t.popularity >= 0.6).map((t) => ({ type: 'deep-sky' as const, ...t })),
]

const FROM = new Date('2026-09-01T18:00:00Z')

/** A forecast that covers the first three days and then simply stops. */
function shortForecast(): WeatherSample[] {
  const out: WeatherSample[] = []
  for (let h = 0; h < 72; h += 1) {
    out.push({
      time: new Date(FROM.getTime() + h * 3600_000),
      cloudCoverPct: 5,
      visibilityM: null,
      relativeHumidityPct: null,
      dewPointC: null,
      windSpeedKmh: null,
      temperatureC: null,
    })
  }
  return out
}

describe('upcomingHighlights', () => {
  const run = (over: Partial<Parameters<typeof upcomingHighlights>[0]> = {}) =>
    upcomingHighlights({
      from: FROM,
      nights: 30,
      loc: HOME,
      targets: CATALOGUE,
      weather: null,
      limit: 12,
      ...over,
    })

  it('finds at least ten things worth planning for in a month', () => {
    expect(run().length).toBeGreaterThanOrEqual(10)
  })

  it('never lists the same object twice', () => {
    const ids = run().map((p) => p.targetId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('reads as a calendar — earliest night first', () => {
    const nights = run().map((p) => p.night.getTime())
    expect(nights).toEqual([...nights].sort((a, b) => a - b))
  })

  it('stays inside the month it was asked for', () => {
    const last = FROM.getTime() + 31 * 24 * 3600_000
    for (const p of run()) {
      expect(p.night.getTime()).toBeGreaterThanOrEqual(FROM.getTime() - 24 * 3600_000)
      expect(p.night.getTime()).toBeLessThanOrEqual(last)
    }
  })

  it('puts every pick genuinely above the horizon in the dark', () => {
    for (const p of run()) {
      expect(p.peakAltitudeDeg).toBeGreaterThan(0)
      expect(p.minutesUseful).toBeGreaterThan(0)
    }
  })

  it('reports the moon, because a month out it is what decides the night', () => {
    for (const p of run()) {
      expect(p.moonIlluminatedPct).toBeGreaterThanOrEqual(0)
      expect(p.moonIlluminatedPct).toBeLessThanOrEqual(100)
    }
  })

  it('spreads the picks across nights instead of stacking the darkest one', () => {
    const nights = new Set(run().map((p) => p.night.getTime()))
    expect(nights.size).toBeGreaterThanOrEqual(5)
  })

  it('never puts more than the allowed number on one night', () => {
    const count = new Map<number, number>()
    for (const p of run({ maxPerNight: 2 })) {
      const k = p.night.getTime()
      count.set(k, (count.get(k) ?? 0) + 1)
    }
    expect(Math.max(...count.values())).toBeLessThanOrEqual(2)
  })

  it('honours the limit', () => {
    expect(run({ limit: 6 }).length).toBe(6)
  })

  it('is deterministic', () => {
    expect(run().map((p) => p.targetId)).toEqual(run().map((p) => p.targetId))
  })

  /**
   * The honesty rule for this screen. A forecast reaches days, not a month, so
   * every night beyond it is marked as having none — the score for those
   * nights is astronomy alone and says so, rather than quietly implying a
   * clear sky a fortnight out.
   */
  describe('weather beyond the forecast', () => {
    it('marks nights the forecast does not reach', () => {
      const picks = run({ weather: shortForecast() })
      const covered = picks.filter((p) => p.forecast === 'included')
      const beyond = picks.filter((p) => p.forecast === 'none')
      expect(beyond.length).toBeGreaterThan(0)
      for (const p of beyond) {
        expect(p.night.getTime()).toBeGreaterThan(FROM.getTime() + 2 * 24 * 3600_000)
      }
      for (const p of covered) {
        expect(p.cloudCoverPct).not.toBeNull()
      }
    })

    it('reports no cloud figure at all where there is no forecast', () => {
      for (const p of run({ weather: shortForecast() }).filter((p) => p.forecast === 'none')) {
        expect(p.cloudCoverPct).toBeNull()
      }
    })

    it('says none for every night when there is no forecast at all', () => {
      expect(run().every((p) => p.forecast === 'none')).toBe(true)
    })
  })

  /**
   * A month of nights against the showpiece catalogue has to stay inside the
   * budget of a screen opening on a phone, not a desktop. The first version
   * scored every target on every night and took seconds.
   */
  it('completes inside the budget for opening a sheet', () => {
    const t0 = performance.now()
    run()
    expect(performance.now() - t0).toBeLessThan(600)
  })
})
