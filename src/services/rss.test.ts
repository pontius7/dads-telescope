import { describe, it, expect } from 'vitest'
import { parseFeed } from './rss'

/** Shapes taken from the real feeds, trimmed. Each source formats differently. */
const ESO = `<?xml version="1.0"?><rss><channel>
<item><title>Milky Way's fastest star</title><link>https://www.eso.org/public/news/eso2612/</link>
<description>Astronomers have discovered the fastest known star.</description>
<pubDate>Wed, 19 Aug 2026 17:00:00 +0200</pubDate>
<enclosure url="https://cdn.eso.org/images/screen/eso2612a.jpg" length="0" type="image/jpeg"></enclosure></item>
</channel></rss>`

const UNIVERSE_TODAY = `<rss><channel>
<item><title><![CDATA[Meet ASTRID, the New Simulation]]></title>
<link>https://www.universetoday.com/articles/meet-astrid</link>
<pubDate>Tue, 01 Sep 2026 19:31:27 +0000</pubDate>
<description><![CDATA[<p><img src="https://www.universetoday.com/article_images/astrid.jpg" alt="x" />A visualisation of dark matter.</p>]]></description></item>
</channel></rss>`

const PHYS = `<rss><channel>
<item><title>MeerKAT detects faint hydrogen</title>
<description>Astronomers measured radio emissions from South Africa&#039;s MeerKAT &amp; friends.</description>
<link>https://phys.org/news/2026-09-meerkat.html</link>
<pubDate>Tue, 01 Sep 2026 14:20:08 EDT</pubDate>
<media:thumbnail url="https://scx1.b-cdn.net/csz/news/tmb/2026/meerkat.jpg" /></item>
</channel></rss>`

const ATOM = `<feed><entry><title>An Atom entry</title>
<link rel="alternate" href="https://example.org/atom-story"/>
<published>2026-08-30T12:00:00Z</published>
<summary>Short summary.</summary></entry></feed>`

describe('parseFeed', () => {
  it('reads title, link and date from a plain RSS item', () => {
    const [item] = parseFeed(ESO, 'ESO')
    expect(item!.title).toBe("Milky Way's fastest star")
    expect(item!.url).toBe('https://www.eso.org/public/news/eso2612/')
    expect(item!.source).toBe('ESO')
    expect(new Date(item!.publishedAt).toISOString()).toBe('2026-08-19T15:00:00.000Z')
  })

  it('takes the image from an enclosure', () => {
    expect(parseFeed(ESO, 'ESO')[0]!.imageUrl).toBe('https://cdn.eso.org/images/screen/eso2612a.jpg')
  })

  it('takes the image from media:thumbnail', () => {
    expect(parseFeed(PHYS, 'Phys.org')[0]!.imageUrl).toBe(
      'https://scx1.b-cdn.net/csz/news/tmb/2026/meerkat.jpg',
    )
  })

  it('falls back to the first image inside the description', () => {
    expect(parseFeed(UNIVERSE_TODAY, 'Universe Today')[0]!.imageUrl).toBe(
      'https://www.universetoday.com/article_images/astrid.jpg',
    )
  })

  it('unwraps CDATA in titles', () => {
    expect(parseFeed(UNIVERSE_TODAY, 'Universe Today')[0]!.title).toBe('Meet ASTRID, the New Simulation')
  })

  it('strips the markup out of a summary and leaves readable text', () => {
    const [item] = parseFeed(UNIVERSE_TODAY, 'Universe Today')
    expect(item!.summary).toBe('A visualisation of dark matter.')
    expect(item!.summary).not.toContain('<')
  })

  it('decodes the entities a feed escapes', () => {
    expect(parseFeed(PHYS, 'Phys.org')[0]!.summary).toBe(
      "Astronomers measured radio emissions from South Africa's MeerKAT & friends.",
    )
  })

  it('reads Atom entries as well as RSS items', () => {
    const [item] = parseFeed(ATOM, 'Example')
    expect(item!.title).toBe('An Atom entry')
    expect(item!.url).toBe('https://example.org/atom-story')
    expect(new Date(item!.publishedAt).toISOString()).toBe('2026-08-30T12:00:00.000Z')
  })

  /**
   * A page served over https cannot load an http image: the browser blocks it
   * and the row shows a broken slot. Dropping the URL leaves the row without a
   * picture, which is the honest outcome.
   */
  it('refuses insecure image URLs rather than shipping a broken one', () => {
    const insecure = ESO.replace('https://cdn.eso.org', 'http://cdn.eso.org')
    expect(parseFeed(insecure, 'ESO')[0]!.imageUrl).toBeNull()
  })

  it('upgrades an http article link to https', () => {
    // NOIRLab's feed still emits http addresses for a site that serves https.
    const insecure = ESO.replace(
      '<link>https://www.eso.org/public/news/eso2612/</link>',
      '<link>http://www.eso.org/public/news/eso2612/</link>',
    )
    expect(parseFeed(insecure, 'ESO')[0]!.url).toBe('https://www.eso.org/public/news/eso2612/')
  })

  it('skips items with no usable link', () => {
    expect(parseFeed('<rss><channel><item><title>Nowhere</title></item></channel></rss>', 'X')).toEqual([])
  })

  it('returns nothing for junk rather than throwing', () => {
    expect(parseFeed('<html><body>Just a moment...</body></html>', 'X')).toEqual([])
    expect(parseFeed('', 'X')).toEqual([])
  })

  it('drops an item whose date cannot be read, rather than inventing one', () => {
    const bad = ESO.replace('Wed, 19 Aug 2026 17:00:00 +0200', 'not a date')
    expect(parseFeed(bad, 'ESO')).toEqual([])
  })
})
