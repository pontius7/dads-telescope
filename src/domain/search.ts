/**
 * Finding anything in the app by typing.
 *
 * One box across three kinds of thing — objects, constellations and the app's
 * own screens — because someone looking for "Andromeda" should not first have
 * to decide whether that is a galaxy, a constellation, or a page.
 *
 * Ranking is deliberately blunt and explainable rather than fuzzy. Nothing
 * here guesses: a result matched because the text it shows contains what was
 * typed. A fuzzy matcher that surfaces "Cassiopeia" for "cat" feels clever
 * once and wrong every time after.
 *
 * Accents are folded, so "Boötes" is reachable from a keyboard that will not
 * produce an ö, and every field a row displays is searchable — catalogue
 * number included, since that is what is printed on a star atlas.
 */

export type HitKind = 'target' | 'constellation' | 'page'

export interface Searchable {
  kind: HitKind
  id: string
  title: string
  subtitle: string
  /** Everything matchable: names, catalogue ids, constellation, type. */
  terms: string[]
  /** Ties break toward the better-known object. */
  weight?: number
}

export interface SearchHit extends Searchable {
  score: number
}

/** Lower-case, strip accents, collapse whitespace. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * How well one term answers the query. Higher is better; 0 is no match.
 * Whole word beats start-of-word beats anywhere-inside, which is the order a
 * person expects when they type three letters.
 */
function scoreTerm(term: string, q: string): number {
  const t = fold(term)
  if (!t) return 0
  if (t === q) return 100
  if (t.startsWith(q)) return 70
  // Start of any word inside the term: "ring" should find "Ring Nebula" and
  // also "The Ring", but rank both above a match buried mid-word.
  if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t)) return 50
  if (t.includes(q)) return 25
  return 0
}

export function search(query: string, items: readonly Searchable[], limit = 20): SearchHit[] {
  const q = fold(query)
  if (q.length === 0) return []

  const hits: SearchHit[] = []
  for (const item of items) {
    let best = 0
    for (const term of item.terms) {
      const s = scoreTerm(term, q)
      if (s > best) best = s
    }
    if (best === 0) continue
    // Fame only breaks ties; it never lifts a worse match above a better one.
    hits.push({ ...item, score: best + (item.weight ?? 0) * 4 })
  }

  return hits
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.title.length - b.title.length ||
        a.title.localeCompare(b.title),
    )
    .slice(0, limit)
}
