import { describe, it, expect } from 'vitest'
import { assessConditions } from './conditions'
import type { ObservingWindow, WeatherSample } from './scoring'

const at = (h: number, cloud: number | null): WeatherSample => ({
  time: new Date(`2026-09-01T0${h}:00:00Z`),
  cloudCoverPct: cloud,
  visibilityM: null,
  relativeHumidityPct: null,
  dewPointC: null,
  windSpeedKmh: null,
  temperatureC: null,
})

const window: ObservingWindow = {
  start: new Date('2026-09-01T01:00:00Z'),
  end: new Date('2026-09-01T03:00:00Z'),
  stepMinutes: 10,
}

describe('assessConditions', () => {
  /**
   * The forecast runs well past the dark window. A clear afternoon says
   * nothing about a clouded-out midnight, and reading the whole feed had the
   * summary announcing a clear night directly above a list that cloud had
   * emptied.
   */
  it('ignores hours outside the observing window', () => {
    const c = assessConditions([at(0, 0), at(1, 95), at(2, 98), at(4, 0)], window)
    expect(c.sky).toBe('overcast')
    expect(c.bestCloudPct).toBe(95)
    expect(c.hoursTotal).toBe(2)
  })

  it('says nothing at all when there is no forecast', () => {
    const c = assessConditions(null)
    expect(c.sky).toBe('unknown')
    expect(c.bestCloudPct).toBeNull()
  })

  it('says nothing at all when every hour is missing its cloud reading', () => {
    const c = assessConditions([at(1, null), at(2, null)])
    expect(c.sky).toBe('unknown')
    expect(c.bestCloudPct).toBeNull()
  })

  it('never invents a reading from the hours that do have one', () => {
    // Two of three hours are unknown. The known hour is reported as itself,
    // and the gaps stay gaps rather than being averaged away.
    const c = assessConditions([at(1, null), at(2, 10), at(3, null)])
    expect(c.bestCloudPct).toBe(10)
    expect(c.hoursMeasured).toBe(1)
    expect(c.hoursTotal).toBe(3)
  })

  it('calls a clear night clear', () => {
    expect(assessConditions([at(1, 4), at(2, 0), at(3, 8)]).sky).toBe('clear')
  })

  it('calls a broken night broken', () => {
    expect(assessConditions([at(1, 55), at(2, 40), at(3, 60)]).sky).toBe('broken')
  })

  it('calls a mostly clouded night mostly cloudy', () => {
    expect(assessConditions([at(1, 80), at(2, 78), at(3, 85)]).sky).toBe('mostly-cloudy')
  })

  it('calls a fully overcast night overcast', () => {
    expect(assessConditions([at(1, 99), at(2, 100), at(3, 97)]).sky).toBe('overcast')
  })

  /**
   * The scoring engine judges a night by its BEST moment, because an observer
   * only needs one gap. The summary has to agree with the scores it sits above,
   * or the two will contradict each other on the same screen.
   */
  it('judges the night by its best hour, not its average', () => {
    const c = assessConditions([at(1, 100), at(2, 5), at(3, 100)])
    expect(c.bestCloudPct).toBe(5)
    expect(c.sky).toBe('clear')
  })

  it('reports the typical hour too, so a single gap is not oversold', () => {
    const c = assessConditions([at(1, 100), at(2, 5), at(3, 100)])
    expect(c.medianCloudPct).toBe(100)
  })
})
