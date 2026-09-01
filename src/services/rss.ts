/**
 * A small, forgiving reader for the news feeds.
 *
 * Pure text in, structured items out: no fetch, no DOM. That matters twice
 * over — it runs unchanged in the Cloudflare Worker, which has no DOMParser at
 * all, and it can be tested against the real shapes the feeds actually emit.
 * Every source formats differently: ESO hangs its picture on an `enclosure`,
 * Phys.org on a `media:thumbnail`, Universe Today buries it in an `<img>` in
 * the description, and titles arrive plain or wrapped in CDATA.
 *
 * Forgiving about structure, strict about facts. An item with no link or no
 * readable date is dropped rather than guessed at, and a feed that answers with
 * a block page yields nothing instead of throwing.
 */

export interface NewsItem {
  title: string
  url: string
  source: string
  /** ISO 8601. Items without a readable date are discarded, never defaulted. */
  publishedAt: string
  imageUrl: string | null
  summary: string
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…',
  mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
}

function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
}

function unwrap(s: string): string {
  const cdata = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/)
  return cdata ? cdata[1]! : s
}

/** First occurrence of a tag's text content. */
function tagText(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? decode(unwrap(m[1]!)).trim() : null
}

function attr(block: string, tag: string, name: string): string | null {
  // Attribute order varies between feeds, so match the tag then the attribute.
  const el = block.match(new RegExp(`<${tag}\\b[^>]*>`, 'i'))
  if (!el) return null
  const a = el[0].match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'))
  return a ? decode(a[1]!) : null
}

function stripTags(html: string): string {
  return decode(unwrap(html))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Only https: a secure page cannot display an insecure image, it just breaks. */
function secureImage(url: string | null): string | null {
  return url && url.startsWith('https://') ? url : null
}

function imageFrom(block: string): string | null {
  const enclosure = block.match(/<enclosure\b[^>]*>/i)?.[0]
  if (enclosure && /type\s*=\s*["']image\//i.test(enclosure)) {
    const u = enclosure.match(/url\s*=\s*["']([^"']+)["']/i)?.[1]
    if (u) return secureImage(decode(u))
  }
  for (const tag of ['media:content', 'media:thumbnail', 'itunes:image']) {
    const u = attr(block, tag, 'url') ?? attr(block, tag, 'href')
    if (u) return secureImage(u)
  }
  // Last resort: the first picture inside the body of the item.
  const inline = block.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i)?.[1]
  return inline ? secureImage(decode(inline)) : null
}

/**
 * Article links are upgraded to https.
 *
 * NOIRLab's feed still emits `http://` addresses even though the site serves
 * https, and sending someone from a secure page to a plain-text one to read it
 * is a needless downgrade. Every source in this app's list supports https, so
 * the upgrade is safe here in a way a blanket rule would not be.
 */
function httpsUrl(url: string): string {
  return url.startsWith('http://') ? `https://${url.slice('http://'.length)}` : url
}

function linkFrom(block: string): string | null {
  const plain = tagText(block, 'link')
  if (plain && /^https?:\/\//.test(plain)) return httpsUrl(plain)
  // Atom puts the address in an attribute and may offer several relations.
  const alternate = block.match(/<link\b[^>]*rel\s*=\s*["']alternate["'][^>]*>/i)?.[0]
  const any = alternate ?? block.match(/<link\b[^>]*href\s*=\s*["'][^"']+["'][^>]*>/i)?.[0]
  const href = any?.match(/href\s*=\s*["']([^"']+)["']/i)?.[1]
  return href && /^https?:\/\//.test(href) ? httpsUrl(decode(href)) : null
}

export function parseFeed(xml: string, source: string): NewsItem[] {
  if (!xml) return []
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? []
  const out: NewsItem[] = []

  for (const block of blocks) {
    const url = linkFrom(block)
    const title = tagText(block, 'title')
    if (!url || !title) continue

    const when =
      tagText(block, 'pubDate') ?? tagText(block, 'published') ?? tagText(block, 'updated')
    const at = when ? new Date(when) : null
    // A story with no readable date cannot be placed in a list ordered by
    // recency, and inventing "now" would put the oldest item at the top.
    if (!at || Number.isNaN(at.getTime())) continue

    const body =
      block.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/i)?.[1] ??
      block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ??
      block.match(/<summary(?:\s[^>]*)?>([\s\S]*?)<\/summary>/i)?.[1] ??
      ''

    out.push({
      title,
      url,
      source,
      publishedAt: at.toISOString(),
      imageUrl: imageFrom(block),
      summary: stripTags(body).slice(0, 260),
    })
  }

  return out
}
