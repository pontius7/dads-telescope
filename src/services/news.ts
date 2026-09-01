/**
 * Astronomy news, fetched from the Worker that reads the feeds.
 *
 * The same rule the weather follows applies here: nothing is invented and
 * nothing stale is dressed up as current. If the request fails, the screen
 * says the news is unavailable rather than showing an empty list that reads as
 * "nothing has happened".
 */
import type { NewsItem } from './rss'

export type { NewsItem }

export interface NewsResult {
  items: NewsItem[]
  /** Which feeds answered, so the screen can be honest about its coverage. */
  sources: string[]
  silent: string[]
  fetchedAt: Date
}

export async function fetchNews(signal?: AbortSignal): Promise<NewsResult> {
  const res = await fetch('/api/news', { signal })
  if (!res.ok) throw new Error(`news endpoint returned ${res.status}`)
  const json = (await res.json()) as {
    items?: NewsItem[]
    sources?: string[]
    silent?: string[]
    fetchedAt?: string
  }
  const items = json.items ?? []
  if (items.length === 0) throw new Error('no stories returned')
  return {
    items,
    sources: json.sources ?? [],
    silent: json.silent ?? [],
    fetchedAt: json.fetchedAt ? new Date(json.fetchedAt) : new Date(),
  }
}
