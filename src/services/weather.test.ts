import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchWeather, expandInterval, describeFreshness } from './weather'
import { HOME } from '../domain/ephemeris'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
  vi.restoreAllMocks()
})

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}
function fail(status: number) {
  return { ok: false, status, json: async () => ({}) } as unknown as Response
}

const OPEN_METEO_OK = {
  hourly: {
    time: ['2026-08-31T01:00', '2026-08-31T02:00'],
    cloud_cover: [12, 40],
    visibility: [24000, 20000],
    relative_humidity_2m: [70, 75],
    dew_point_2m: [11, 12],
    wind_speed_10m: [8, 9],
    temperature_2m: [19, 18],
  },
}

describe('provider chain', () => {
  it('uses Open-Meteo when it works', async () => {
    globalThis.fetch = vi.fn(async () => okJson(OPEN_METEO_OK)) as unknown as typeof fetch
    const r = await fetchWeather(HOME)
    expect(r.provider).toBe('open-meteo')
    expect(r.samples).toHaveLength(2)
    expect(r.samples[0]!.cloudCoverPct).toBe(12)
    expect(r.error).toBeUndefined()
  })

  it('falls back to the NWS when Open-Meteo fails', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('open-meteo')) return fail(503)
      if (url.includes('/points/')) {
        return okJson({ properties: { forecastGridData: 'https://api.weather.gov/gridpoints/PHI/40,60' } })
      }
      return okJson({
        properties: {
          skyCover: { values: [{ validTime: '2026-08-31T01:00:00+00:00/PT2H', value: 25 }] },
          temperature: { values: [{ validTime: '2026-08-31T01:00:00+00:00/PT2H', value: 18 }] },
        },
      })
    }) as unknown as typeof fetch

    const r = await fetchWeather(HOME)
    expect(r.provider).toBe('nws')
    expect(r.samples.length).toBeGreaterThan(0)
    expect(r.samples[0]!.cloudCoverPct).toBe(25)
  })

  it('THE HONEST FAILURE PATH: returns null-equivalent, never a fabricated forecast', async () => {
    globalThis.fetch = vi.fn(async () => fail(500)) as unknown as typeof fetch
    const r = await fetchWeather(HOME)
    expect(r.provider).toBe('none')
    expect(r.samples).toEqual([])
    expect(r.error).toBeTruthy()
    // Crucially: no invented cloud cover anywhere.
    expect(JSON.stringify(r)).not.toMatch(/cloudCoverPct":\s*\d/)
  })

  it('does not throw when the network is entirely dead', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    await expect(fetchWeather(HOME)).resolves.toMatchObject({ provider: 'none' })
  })

  it('treats an empty Open-Meteo response as a failure, not as clear skies', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('open-meteo') ? okJson({ hourly: { time: [] } }) : fail(500),
    ) as unknown as typeof fetch
    const r = await fetchWeather(HOME)
    expect(r.provider).toBe('none')
  })

  it('reports when the NWS has no grid, which is what happens outside the US', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('open-meteo') ? fail(500) : okJson({ properties: {} }),
    ) as unknown as typeof fetch
    const r = await fetchWeather({ latitudeDeg: 42.44, longitudeDeg: 19.35, elevationM: 900 })
    expect(r.provider).toBe('none')
    expect(r.error).toMatch(/outside the United States/i)
  })
})

describe('NWS interval expansion', () => {
  it('expands a multi-hour interval into one sample per hour', () => {
    const hours = expandInterval('2026-08-31T02:00:00+00:00/PT3H')
    expect(hours).toHaveLength(3)
    expect(new Date(hours[0]!).toISOString()).toBe('2026-08-31T02:00:00.000Z')
    expect(new Date(hours[2]!).toISOString()).toBe('2026-08-31T04:00:00.000Z')
  })

  it('handles a single-hour interval and a day-length one', () => {
    expect(expandInterval('2026-08-31T02:00:00+00:00/PT1H')).toHaveLength(1)
    expect(expandInterval('2026-08-31T02:00:00+00:00/P1D')).toHaveLength(24)
  })

  it('returns nothing for malformed input rather than guessing', () => {
    expect(expandInterval('not-a-time')).toEqual([])
    expect(expandInterval('')).toEqual([])
  })
})

describe('freshness messaging', () => {
  it('says "unavailable" rather than implying stale data is current', () => {
    const r = { samples: [], provider: 'none' as const, fetchedAt: new Date('2026-08-31T02:00:00Z') }
    expect(describeFreshness(r, new Date('2026-08-31T03:00:00Z'))).toBe('Weather unavailable')
  })

  it('reports age in minutes when data is real', () => {
    const r = {
      samples: [], provider: 'open-meteo' as const, fetchedAt: new Date('2026-08-31T02:00:00Z'),
    }
    expect(describeFreshness(r, new Date('2026-08-31T02:04:00Z'))).toBe('Updated 4 min ago')
    expect(describeFreshness(r, new Date('2026-08-31T02:00:20Z'))).toBe('Updated just now')
  })
})
