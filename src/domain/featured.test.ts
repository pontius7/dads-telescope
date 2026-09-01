import { describe, it, expect } from 'vitest'
import { orderForPeople, SHOWPIECE_FLOOR, type Featurable } from './featured'

const row = (
  targetId: string,
  type: 'deep-sky' | 'solar-system',
  popularity: number,
  finalScore: number,
): Featurable => ({
  targetId,
  type,
  popularity,
  finalScore,
  peakAltitudeDeg: 50,
  minutesUseful: 120,
})

const ids = (rows: readonly Featurable[]) => orderForPeople(rows).map((r) => r.targetId)

describe('orderForPeople', () => {
  it('puts the Moon and the planets above a better-scoring faint smudge', () => {
    expect(
      ids([row('m92', 'deep-sky', 0.3, 86), row('saturn', 'solar-system', 1, 80), row('moon', 'solar-system', 1, 82)]),
    ).toEqual(['moon', 'saturn', 'm92'])
  })

  it('puts the famous deep-sky objects above the obscure ones', () => {
    // M108 has the best score of the three and still comes last, because
    // nobody asks to be shown M108. Among the famous two, the engine's own
    // ranking decides: M13 is better placed tonight than M31.
    expect(
      ids([row('m108', 'deep-sky', 0.3, 88), row('m31', 'deep-sky', 1, 70), row('m13', 'deep-sky', 0.8, 72)]),
    ).toEqual(['m13', 'm31', 'm108'])
  })

  it('orders within a tier by score, keeping the engine’s own ranking', () => {
    expect(
      ids([row('mars', 'solar-system', 1, 61), row('jupiter', 'solar-system', 1, 90)]),
    ).toEqual(['jupiter', 'mars'])
  })

  /**
   * The guard that keeps this honest. Promoting a showpiece that is a bad bet
   * tonight would send someone out to a low, washed-out planet ahead of a
   * genuinely good target — which is exactly the failure the score exists to
   * prevent. Below the floor, a showpiece takes its chances on merit.
   */
  it('does not promote a showpiece that is scoring poorly', () => {
    const poor = SHOWPIECE_FLOOR - 1
    expect(
      ids([row('m92', 'deep-sky', 0.3, 86), row('mercury', 'solar-system', 1, poor)]),
    ).toEqual(['m92', 'mercury'])
  })

  it('promotes a showpiece that is exactly at the floor', () => {
    expect(
      ids([row('m92', 'deep-sky', 0.3, 86), row('venus', 'solar-system', 1, SHOWPIECE_FLOOR)]),
    ).toEqual(['venus', 'm92'])
  })

  it('is a stable total order — equal rows never shuffle between calls', () => {
    const rows = [row('b', 'deep-sky', 0.3, 70), row('a', 'deep-sky', 0.3, 70)]
    expect(ids(rows)).toEqual(ids(rows))
    expect(ids(rows)).toEqual(['a', 'b'])
  })

  it('leaves the input array alone', () => {
    const rows = [row('m92', 'deep-sky', 0.3, 86), row('moon', 'solar-system', 1, 80)]
    const before = rows.map((r) => r.targetId)
    orderForPeople(rows)
    expect(rows.map((r) => r.targetId)).toEqual(before)
  })
})

/**
 * Against the real catalogue, not hand-built rows: the thing the user asked
 * for is that the Moon and the planets lead the list, and this is what would
 * actually catch a regression in the wiring rather than in the comparator.
 */
describe('the real catalogue, on a night with no weather to gate it', () => {
  it('leads with the Moon and the planets', async () => {
    const { SOLAR_SYSTEM_TARGETS } = await import('./targets')
    const { DEEP_SKY_TARGETS } = await import('../data/targets')
    const { scoreTarget } = await import('./scoring')
    const { HOME, darkWindow } = await import('./ephemeris')

    // `type` is stamped on when the two catalogues are combined, exactly as
    // `useSky` does it; the raw data files do not carry it.
    const catalogue = [
      ...SOLAR_SYSTEM_TARGETS.map((t) => ({ type: 'solar-system' as const, ...t })),
      ...DEEP_SKY_TARGETS.map((t) => ({ type: 'deep-sky' as const, ...t })),
    ]
    const dark = darkWindow(new Date('2026-09-06T12:00:00Z'), HOME)
    const window = { start: dark.start!, end: dark.end!, stepMinutes: 10 }
    const rows = catalogue
      .map((target) => ({ target, o: scoreTarget({ target, loc: HOME, window, weather: null }) }))
      .filter((r) => r.o.observable)
      .map((r) => ({
        targetId: r.target.id,
        type: r.target.type,
        popularity: r.target.popularity,
        finalScore: r.o.finalScore,
        peakAltitudeDeg: r.o.peakAltitudeDeg,
        minutesUseful: r.o.minutesUseful,
      }))

    expect(rows.length).toBeGreaterThan(5)
    const ordered = orderForPeople(rows)
    const solarUp = rows.filter((r) => r.type === 'solar-system' && r.finalScore >= SHOWPIECE_FLOOR)
    // However many bodies are up and worth it, they occupy the top slots.
    expect(ordered.slice(0, solarUp.length).every((r) => r.type === 'solar-system')).toBe(true)
  })
})
