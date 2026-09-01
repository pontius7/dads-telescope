/**
 * The order a person actually wants the list in.
 *
 * The engine ranks by Observability Score, which is the right answer to "which
 * of these is the best opportunity" and the wrong answer to "what do I want to
 * look at". A beginner at the eyepiece wants the Moon and Saturn, and does not
 * want them buried under NGC 6826 because a faint planetary nebula happens to
 * be four points higher tonight.
 *
 * So this reorders — and only reorders. Two things keep it honest:
 *
 *   1. It runs on the AVAILABLE list only. `rank` has already set aside
 *      everything that is not observable tonight, and nothing from that pile
 *      is ever pulled forward. Popularity cannot put an object on screen that
 *      is below the horizon, clouded out, or lost in daylight.
 *
 *   2. A showpiece scoring below SHOWPIECE_FLOOR is not promoted. Leading with
 *      a low, washed-out Mercury ahead of a genuinely good target is the exact
 *      failure the score exists to prevent, and no amount of fame outranks it.
 *
 * Every row still carries its own score, so the ranking is never hidden — the
 * list is ordered by interest and labelled with merit.
 */

/**
 * The amber band. At or above this a target is a reasonable bet, and fame is
 * allowed to break the tie; below it, a showpiece takes its chances on merit.
 */
export const SHOWPIECE_FLOOR = 50

/** How famous an object has to be to lead the deep-sky field. */
const FAMOUS = 0.7

export interface Featurable {
  targetId: string
  type: 'deep-sky' | 'solar-system'
  popularity: number
  finalScore: number
  peakAltitudeDeg: number
  minutesUseful: number
}

/**
 * Three tiers, best first:
 *   0 — the Moon and the planets, the things anyone recognises by name
 *   1 — the famous deep-sky objects
 *   2 — everything else
 */
function tier(r: Featurable): number {
  if (r.finalScore < SHOWPIECE_FLOOR) return 2
  if (r.type === 'solar-system') return 0
  return r.popularity >= FAMOUS ? 1 : 2
}

/** Reorders a copy. The engine's own ranking survives inside each tier. */
export function orderForPeople<T extends Featurable>(rows: readonly T[]): T[] {
  return rows.slice().sort(
    (a, b) =>
      tier(a) - tier(b) ||
      b.finalScore - a.finalScore ||
      b.peakAltitudeDeg - a.peakAltitudeDeg ||
      b.minutesUseful - a.minutesUseful ||
      // Last tiebreaker guarantees the order never shuffles between renders.
      a.targetId.localeCompare(b.targetId),
  )
}
