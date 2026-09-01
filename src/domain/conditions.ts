/**
 * What the weather actually allows tonight, in one sentence.
 *
 * The scores already fold cloud in, but a column of numbers does not answer
 * the question someone asks standing at the back door: is it worth carrying
 * the telescope out at all?
 *
 * NEVER FABRICATED. Hours with no cloud reading stay missing — they are
 * counted and reported, never averaged away or filled in. With no readings at
 * all the verdict is `unknown`, and the UI says the scores leave cloud out
 * rather than implying a clear night.
 *
 * The verdict follows the BEST hour, not the average, because that is how
 * `scoreTarget` judges a night: an observer needs one gap, not a good mean.
 * A summary that disagreed with the scores printed beneath it would be worse
 * than no summary. The typical hour is reported alongside so a single gap in
 * an otherwise solid deck is not oversold.
 *
 * Only the hours INSIDE the observing window count. The forecast runs well
 * past it, and a clear afternoon says nothing about a clouded-out midnight —
 * reading the whole feed had the summary announcing a clear night above a list
 * that cloud had emptied.
 */
import type { ObservingWindow, WeatherSample } from './scoring'

export type SkyVerdict = 'clear' | 'broken' | 'mostly-cloudy' | 'overcast' | 'unknown'

export interface Conditions {
  sky: SkyVerdict
  /** The clearest hour in the window. Null when nothing was measured. */
  bestCloudPct: number | null
  /** The middle hour, so one gap in a solid deck is not mistaken for a clear night. */
  medianCloudPct: number | null
  hoursMeasured: number
  hoursTotal: number
}

function verdict(bestCloudPct: number): SkyVerdict {
  if (bestCloudPct <= 25) return 'clear'
  if (bestCloudPct <= 65) return 'broken'
  if (bestCloudPct <= 90) return 'mostly-cloudy'
  return 'overcast'
}

export function assessConditions(
  samples: readonly WeatherSample[] | null,
  window?: ObservingWindow,
): Conditions {
  const inWindow = (samples ?? []).filter(
    (s) =>
      !window ||
      (s.time.getTime() >= window.start.getTime() && s.time.getTime() <= window.end.getTime()),
  )
  const hoursTotal = inWindow.length
  const measured = inWindow
    .map((s) => s.cloudCoverPct)
    .filter((c): c is number => c !== null)

  if (measured.length === 0) {
    return {
      sky: 'unknown',
      bestCloudPct: null,
      medianCloudPct: null,
      hoursMeasured: 0,
      hoursTotal,
    }
  }

  const sorted = measured.slice().sort((a, b) => a - b)
  const best = sorted[0]!
  const median = sorted[Math.floor(sorted.length / 2)]!

  return {
    sky: verdict(best),
    bestCloudPct: best,
    medianCloudPct: median,
    hoursMeasured: measured.length,
    hoursTotal,
  }
}
