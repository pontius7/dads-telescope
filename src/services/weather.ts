/**
 * Weather, with an honest failure path.
 *
 *   Open-Meteo  ->  api.weather.gov (US only)  ->  null
 *
 * Both endpoints are free, need no API key, and return
 * `access-control-allow-origin: *`, which is why this app needs no backend.
 *
 * THE RULE: if both fail, this returns null. It never invents a forecast, never
 * falls back to "typical for this time of year", and never presents a cached
 * reading as current. Missing weather lowers the score's CONFIDENCE; it does
 * not fabricate a number.
 */
import type { WeatherSample } from '../domain/scoring'
import type { GeoLocation } from '../domain/ephemeris'

export type WeatherProvider = 'open-meteo' | 'nws' | 'none'

export interface WeatherResult {
  samples: WeatherSample[]
  provider: WeatherProvider
  fetchedAt: Date
  /** Set when both providers failed, so the UI can say what went wrong. */
  error?: string
}

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast'
const NWS_POINTS = 'https://api.weather.gov/points'

/** NWS asks for a contact string in place of an API key. */
const NWS_USER_AGENT = "(dads-telescope, personal observing assistant)"

interface OpenMeteoResponse {
  hourly?: {
    time?: string[]
    cloud_cover?: (number | null)[]
    visibility?: (number | null)[]
    relative_humidity_2m?: (number | null)[]
    dew_point_2m?: (number | null)[]
    wind_speed_10m?: (number | null)[]
    temperature_2m?: (number | null)[]
  }
}

async function fetchOpenMeteo(loc: GeoLocation, signal?: AbortSignal): Promise<WeatherSample[]> {
  const url = new URL(OPEN_METEO)
  url.searchParams.set('latitude', loc.latitudeDeg.toFixed(4))
  url.searchParams.set('longitude', loc.longitudeDeg.toFixed(4))
  url.searchParams.set(
    'hourly',
    'cloud_cover,visibility,relative_humidity_2m,dew_point_2m,wind_speed_10m,temperature_2m',
  )
  /**
   * Sixteen days is Open-Meteo's maximum, and the maximum is the honest
   * request: the Upcoming screen looks a month ahead, so the further the real
   * forecast reaches, the fewer nights it has to mark as unforecast. Beyond
   * sixteen days no provider has an answer, and the app says so rather than
   * filling the gap.
   */
  url.searchParams.set('forecast_days', '16')
  url.searchParams.set('timezone', 'UTC')

  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`)
  const json = (await res.json()) as OpenMeteoResponse
  const h = json.hourly
  if (!h?.time?.length) throw new Error('Open-Meteo returned no hourly data')

  return h.time.map((iso, i) => ({
    // Open-Meteo timestamps are naive ISO in the requested timezone (UTC here).
    time: new Date(iso.endsWith('Z') ? iso : `${iso}:00Z`.replace(/:00:00Z$/, ':00Z')),
    cloudCoverPct: pick(h.cloud_cover, i),
    visibilityM: pick(h.visibility, i),
    relativeHumidityPct: pick(h.relative_humidity_2m, i),
    dewPointC: pick(h.dew_point_2m, i),
    windSpeedKmh: pick(h.wind_speed_10m, i),
    temperatureC: pick(h.temperature_2m, i),
  }))
}

interface NwsPoints {
  properties?: { forecastGridData?: string }
}
interface NwsGrid {
  properties?: {
    skyCover?: { values?: { validTime: string; value: number | null }[] }
    visibility?: { values?: { validTime: string; value: number | null }[] }
    relativeHumidity?: { values?: { validTime: string; value: number | null }[] }
    dewpoint?: { values?: { validTime: string; value: number | null }[] }
    windSpeed?: { values?: { validTime: string; value: number | null }[] }
    temperature?: { values?: { validTime: string; value: number | null }[] }
  }
}

/**
 * NWS gridpoint data. Two hops: coordinates -> grid URL -> the forecast.
 *
 * Values arrive as ISO8601 intervals ("2026-08-31T02:00:00+00:00/PT3H"), so a
 * single entry can cover several hours and must be expanded.
 */
async function fetchNws(loc: GeoLocation, signal?: AbortSignal): Promise<WeatherSample[]> {
  const headers = { 'User-Agent': NWS_USER_AGENT, Accept: 'application/geo+json' }
  const pointsUrl = `${NWS_POINTS}/${loc.latitudeDeg.toFixed(4)},${loc.longitudeDeg.toFixed(4)}`
  const pRes = await fetch(pointsUrl, { headers, signal })
  if (!pRes.ok) throw new Error(`NWS points returned ${pRes.status}`)
  const points = (await pRes.json()) as NwsPoints
  const gridUrl = points.properties?.forecastGridData
  if (!gridUrl) throw new Error('NWS returned no grid URL (likely outside the United States)')

  const gRes = await fetch(gridUrl, { headers, signal })
  if (!gRes.ok) throw new Error(`NWS grid returned ${gRes.status}`)
  const grid = (await gRes.json()) as NwsGrid
  const props = grid.properties
  if (!props?.skyCover?.values?.length) throw new Error('NWS returned no sky cover')

  const byHour = new Map<number, WeatherSample>()
  const put = (t: number, patch: Partial<WeatherSample>) => {
    const cur = byHour.get(t) ?? {
      time: new Date(t), cloudCoverPct: null, visibilityM: null,
      relativeHumidityPct: null, dewPointC: null, windSpeedKmh: null, temperatureC: null,
    }
    byHour.set(t, { ...cur, ...patch })
  }

  const expand = (
    values: { validTime: string; value: number | null }[] | undefined,
    apply: (v: number | null) => Partial<WeatherSample>,
  ) => {
    for (const entry of values ?? []) {
      for (const t of expandInterval(entry.validTime)) put(t, apply(entry.value))
    }
  }

  expand(props.skyCover?.values, (v) => ({ cloudCoverPct: v }))
  expand(props.visibility?.values, (v) => ({ visibilityM: v }))
  expand(props.relativeHumidity?.values, (v) => ({ relativeHumidityPct: v }))
  expand(props.dewpoint?.values, (v) => ({ dewPointC: v }))
  // NWS reports wind in km/h already for this endpoint.
  expand(props.windSpeed?.values, (v) => ({ windSpeedKmh: v }))
  expand(props.temperature?.values, (v) => ({ temperatureC: v }))

  return [...byHour.values()].sort((a, b) => a.time.getTime() - b.time.getTime())
}

/** "2026-08-31T02:00:00+00:00/PT3H" -> one timestamp per covered hour. */
export function expandInterval(validTime: string): number[] {
  const [startIso, duration] = validTime.split('/')
  if (!startIso) return []
  const start = Date.parse(startIso)
  if (Number.isNaN(start)) return []
  const hours = duration ? parseIsoDurationHours(duration) : 1
  const out: number[] = []
  for (let i = 0; i < Math.max(1, hours); i += 1) out.push(start + i * 3_600_000)
  return out
}

function parseIsoDurationHours(d: string): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(d)
  if (!m) return 1
  return (Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0)) || 1
}

/**
 * Fetch the forecast, trying each provider in turn.
 *
 * Never throws. A total failure returns `provider: 'none'` with an empty
 * sample list and an error message, which the scoring engine treats as
 * "unknown" — lowering confidence rather than assuming clear skies are real.
 */
export async function fetchWeather(
  loc: GeoLocation,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<WeatherResult> {
  const errors: string[] = []

  for (const [provider, fn] of [
    ['open-meteo', fetchOpenMeteo],
    ['nws', fetchNws],
  ] as const) {
    try {
      const samples = await withTimeout(fn(loc, opts.signal), opts.timeoutMs ?? 8000)
      if (samples.length > 0) {
        return { samples, provider, fetchedAt: new Date() }
      }
      errors.push(`${provider}: empty response`)
    } catch (e) {
      errors.push(`${provider}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return {
    samples: [],
    provider: 'none',
    fetchedAt: new Date(),
    error: errors.join('; '),
  }
}

/** How the UI should describe the data's trustworthiness. */
export function describeFreshness(result: WeatherResult, now: Date): string {
  if (result.provider === 'none') return 'Weather unavailable'
  const minutes = Math.floor((now.getTime() - result.fetchedAt.getTime()) / 60_000)
  if (minutes < 1) return 'Updated just now'
  return `Updated ${minutes} min ago`
}

function pick(arr: (number | null)[] | undefined, i: number): number | null {
  const v = arr?.[i]
  return v === undefined ? null : v
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
    p.then(
      (v) => {
        clearTimeout(id)
        resolve(v)
      },
      (e) => {
        clearTimeout(id)
        reject(e)
      },
    )
  })
}
