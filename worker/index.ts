/**
 * The only server code in this project, and it exists for one reason: news
 * feeds cannot be read from a browser.
 *
 * Four of the seven sources send no `Access-Control-Allow-Origin`, so a page
 * fetching them directly is blocked. The alternatives were a third-party CORS
 * proxy — another stranger in the path, for a request made from a user's phone
 * — or twenty lines here. Cloudflare is already serving the site; it can read
 * the feeds too, cache the result at the edge for everyone, and hand the page
 * one small JSON document.
 *
 * Everything else is still static: any request that is not `/api/news` goes
 * straight to the asset store, exactly as before.
 *
 * SOURCES. Every one is free to read with no subscription and no registration,
 * which is the whole selection rule — a story Dad taps and cannot read is
 * worse than no story. Sky & Telescope is deliberately absent: its feed
 * answers a bot check with a 403, and parts of the site are members-only.
 */
import { parseFeed, type NewsItem } from '../src/services/rss'

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

/**
 * `caches.default` is Cloudflare's own edge cache and is not part of the DOM
 * lib this project typechecks against. Declared narrowly here rather than
 * pulling the whole workers-types package in for one property.
 */
declare const caches: {
  default: {
    match: (request: Request) => Promise<Response | undefined>
    put: (request: Request, response: Response) => Promise<void>
  }
}

const SOURCES: { name: string; url: string; home: string }[] = [
  { name: 'NASA', url: 'https://www.nasa.gov/feed/', home: 'https://www.nasa.gov/' },
  { name: 'ESA', url: 'https://www.esa.int/rssfeed/Our_Activities/Space_Science', home: 'https://www.esa.int/' },
  { name: 'ESO', url: 'https://www.eso.org/public/news/feed/', home: 'https://www.eso.org/public/news/' },
  { name: 'NOIRLab', url: 'https://noirlab.edu/public/news/feed/', home: 'https://noirlab.edu/public/news/' },
  { name: 'EarthSky', url: 'https://earthsky.org/feed/', home: 'https://earthsky.org/' },
  { name: 'Phys.org', url: 'https://phys.org/rss-feed/space-news/astronomy/', home: 'https://phys.org/space-news/astronomy/' },
  { name: 'Universe Today', url: 'https://www.universetoday.com/feed/', home: 'https://www.universetoday.com/' },
]

const USER_AGENT = 'dads-telescope/0.1 (personal observing app; https://github.com/pontius7/dads-telescope)'

/** Long enough for a slow feed, short enough that one bad host cannot hang the screen. */
const FEED_TIMEOUT_MS = 6000
const MAX_ITEMS = 40
const MAX_AGE_DAYS = 45
/** Fifteen minutes. News is not weather; nobody needs it to the second. */
const EDGE_TTL_SECONDS = 900

async function readFeed(source: { name: string; url: string }): Promise<NewsItem[]> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), FEED_TIMEOUT_MS)
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
      signal: abort.signal,
    })
    if (!res.ok) return []
    return parseFeed(await res.text(), source.name)
  } catch {
    // One unreachable feed is not a failed screen. The response reports which
    // sources answered, so the UI can be honest about what it is showing.
    return []
  } finally {
    clearTimeout(timer)
  }
}

async function buildNews(): Promise<Response> {
  const results = await Promise.all(SOURCES.map(readFeed))

  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 3600_000
  const seen = new Set<string>()
  const items: NewsItem[] = []

  for (const list of results) {
    for (const item of list) {
      if (new Date(item.publishedAt).getTime() < cutoff) continue
      // Wire stories get syndicated; the same URL from two feeds is one story.
      if (seen.has(item.url)) continue
      seen.add(item.url)
      items.push(item)
    }
  }

  items.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))

  const answered = SOURCES.filter((_, i) => results[i]!.length > 0).map((s) => s.name)
  const body = {
    items: items.slice(0, MAX_ITEMS),
    sources: answered,
    silent: SOURCES.filter((s) => !answered.includes(s.name)).map((s) => s.name),
    fetchedAt: new Date().toISOString(),
  }

  return new Response(JSON.stringify(body), {
    // Every source silent means no news, not empty news: the client says so
    // rather than showing a blank list as though nothing had happened lately.
    status: answered.length > 0 ? 200 : 503,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${EDGE_TTL_SECONDS}`,
    },
  })
}

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil: (p: Promise<unknown>) => void }) {
    const url = new URL(request.url)
    if (url.pathname !== '/api/news') return env.ASSETS.fetch(request)

    // One fetch of the feeds serves everyone until it expires, rather than
    // seven outbound requests per phone that opens the screen.
    const cache = caches.default
    const hit = await cache.match(request)
    if (hit) return hit

    const res = await buildNews()
    if (res.status === 200) ctx.waitUntil(cache.put(request, res.clone()))
    return res
  },
}
