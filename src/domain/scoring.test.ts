import { describe, it, expect } from 'vitest'
import { Body } from 'astronomy-engine'
import { HOME } from './ephemeris'
import {
  scoreTarget,
  rank,
  altitudeSubscore,
  durationSubscore,
  darknessSubscore,
  cloudSubscore,
  moonSubscore,
  FULL_MOON_MAG,
  DEFAULT_STEP_MINUTES,
  type ObservingWindow,
  type WeatherSample,
  type Observability,
} from './scoring'
import type { Target } from './targets'

const WINDOW: ObservingWindow = {
  start: new Date('2026-08-31T01:10:00Z'), // astronomical dusk
  end: new Date('2026-08-31T08:50:00Z'), // astronomical dawn
  stepMinutes: DEFAULT_STEP_MINUTES,
}

const M13: Target = {
  type: 'deep-sky', id: 'm13', name: 'M13', catalogId: 'NGC6205',
  commonName: 'Hercules Globular Cluster', kind: 'globular',
  raHoursJ2000: 16.694897, decDegJ2000: 36.461306, magnitude: 5.8,
  majorAxisArcmin: 16.5, minorAxisArcmin: null, surfaceBrightness: null,
  constellation: 'Her', popularity: 0.95,
}

const M42: Target = {
  type: 'deep-sky', id: 'm42', name: 'M42', catalogId: 'NGC1976',
  commonName: 'Orion Nebula', kind: 'emission-nebula',
  raHoursJ2000: 5.588139, decDegJ2000: -5.389722, magnitude: 4.0,
  majorAxisArcmin: 85, minorAxisArcmin: 60, surfaceBrightness: 13.0,
  constellation: 'Ori', popularity: 1.0,
}

const SATURN: Target = {
  type: 'solar-system', id: 'saturn', name: 'Saturn', kind: 'planet',
  body: Body.Saturn, popularity: 1.0,
}

function clearSky(w: ObservingWindow): WeatherSample[] {
  const out: WeatherSample[] = []
  for (let t = w.start.getTime(); t <= w.end.getTime(); t += 3_600_000) {
    out.push({
      time: new Date(t), cloudCoverPct: 0, visibilityM: 24000,
      relativeHumidityPct: 60, dewPointC: 12, windSpeedKmh: 5, temperatureC: 18,
    })
  }
  return out
}

function overcast(w: ObservingWindow): WeatherSample[] {
  return clearSky(w).map((s) => ({ ...s, cloudCoverPct: 100 }))
}

describe('sub-scores', () => {
  it('altitude follows real extinction, not an invented curve', () => {
    // Hand-checked at the default k = 0.20 mag/airmass:
    //   alt 30 -> airmass 1.995 -> 0.199 mag lost -> 10^(-0.0796) = 0.832
    //   alt 10 -> airmass 5.586 -> 0.917 mag lost -> 10^(-0.3668) = 0.430
    expect(altitudeSubscore(90)).toBeCloseTo(1.0, 3)
    expect(altitudeSubscore(30)).toBeCloseTo(0.832, 2)
    expect(altitudeSubscore(10)).toBeCloseTo(0.43, 2)
    expect(altitudeSubscore(0)).toBe(0)
    expect(altitudeSubscore(-5)).toBe(0)
  })

  it('altitude decreases monotonically toward the horizon', () => {
    let prev = Infinity
    for (const alt of [90, 70, 50, 30, 20, 15, 10, 5, 1]) {
      const v = altitudeSubscore(alt)
      expect(v).toBeLessThan(prev)
      prev = v
    }
  })

  it('duration saturates at 90 minutes', () => {
    expect(durationSubscore(0)).toBe(0)
    expect(durationSubscore(45)).toBeCloseTo(0.5, 6)
    expect(durationSubscore(90)).toBe(1)
    expect(durationSubscore(300)).toBe(1)
  })

  it('darkness is stricter for faint objects than for planets', () => {
    // Sun 8 deg down: usable for a planet, useless for a galaxy.
    expect(darknessSubscore(-8, 'point')).toBeCloseTo(0.667, 2)
    expect(darknessSubscore(-8, 'extended-faint')).toBeCloseTo(0.167, 2)
    expect(darknessSubscore(-18, 'extended-faint')).toBe(1)
    expect(darknessSubscore(-6, 'extended-faint')).toBe(0)
    expect(darknessSubscore(5, 'point')).toBe(0)
  })

  it('cloud is super-linear and hits exactly zero at full cover', () => {
    expect(cloudSubscore(0)).toBe(1)
    expect(cloudSubscore(40)).toBeCloseTo(0.465, 2)
    expect(cloudSubscore(80)).toBeCloseTo(0.089, 2)
    expect(cloudSubscore(100)).toBe(0)
  })

  it('a half-lit Moon emits far less than half the light of a full Moon', () => {
    // The reason we use the Moon's real magnitude instead of illuminated
    // fraction raised to a guessed power. First quarter is ~50% illuminated
    // but only ~8% as bright.
    const fluxFull = Math.pow(10, -0.4 * (FULL_MOON_MAG - FULL_MOON_MAG))
    const fluxFirstQuarter = Math.pow(10, -0.4 * (-10.0 - FULL_MOON_MAG))
    expect(fluxFull).toBeCloseTo(1.0, 6)
    expect(fluxFirstQuarter).toBeLessThan(0.12)
    expect(fluxFirstQuarter).toBeGreaterThan(0.05)
  })

  it('moon penalty vanishes when the Moon is down', () => {
    expect(
      moonSubscore({ moonMagnitude: FULL_MOON_MAG, moonAltitudeDeg: -10, separationDeg: 20, sensitivity: 0.85 }),
    ).toBe(1)
  })

  it('a full Moon close to a faint target is punishing, and barely touches a planet', () => {
    const faint = moonSubscore({
      moonMagnitude: FULL_MOON_MAG, moonAltitudeDeg: 40, separationDeg: 15, sensitivity: 0.85,
    })
    const planet = moonSubscore({
      moonMagnitude: FULL_MOON_MAG, moonAltitudeDeg: 40, separationDeg: 15, sensitivity: 0.1,
    })
    expect(faint).toBeLessThan(0.4)
    expect(planet).toBeGreaterThan(0.9)
  })

  it('a full Moon still hurts a faint target on the FAR side of the sky', () => {
    // A full Moon brightens the whole sky by about three magnitudes per square
    // arcsecond. Scoring a galaxy as unaffected just because it is 100 deg away
    // would be wrong, and was a real bug caught in end-to-end testing.
    const far = moonSubscore({
      moonMagnitude: FULL_MOON_MAG, moonAltitudeDeg: 40, separationDeg: 110, sensitivity: 0.85,
    })
    expect(far).toBeLessThan(0.7)
    expect(far).toBeGreaterThan(0.4)
  })

  it('but closer is still worse than farther — separation modulates the penalty', () => {
    const near = moonSubscore({
      moonMagnitude: FULL_MOON_MAG, moonAltitudeDeg: 40, separationDeg: 10, sensitivity: 0.85,
    })
    const far = moonSubscore({
      moonMagnitude: FULL_MOON_MAG, moonAltitudeDeg: 40, separationDeg: 110, sensitivity: 0.85,
    })
    expect(near).toBeLessThan(far)
  })

  it('a thin crescent barely matters even nearby', () => {
    // Crescent at magnitude -8: flux is about 1.4% of full.
    const v = moonSubscore({
      moonMagnitude: -8, moonAltitudeDeg: 40, separationDeg: 20, sensitivity: 0.85,
    })
    expect(v).toBeGreaterThan(0.97)
  })
})

describe('scoreTarget', () => {
  it('rates M13 highly on a clear night — it is well placed and far from the Moon', () => {
    const r = scoreTarget({ target: M13, loc: HOME, window: WINDOW, weather: clearSky(WINDOW) })
    expect(r.observable).toBe(true)
    expect(r.score).toBeGreaterThan(85)
    expect(r.minutesUseful).toBeGreaterThan(120)
  })

  it('reports peak altitude WITHIN the window, not the day-maximum', () => {
    // M13 transits near the zenith (86.96 deg) but does so at about 23:30 UTC,
    // BEFORE this window opens at 01:10. Inside the window it is already
    // descending and tops out at ~65 deg. Reporting the day-maximum here would
    // promise Dad an overhead object that is actually well down the west.
    const r = scoreTarget({ target: M13, loc: HOME, window: WINDOW, weather: clearSky(WINDOW) })
    expect(r.peakAltitudeDeg).toBeGreaterThan(60)
    expect(r.peakAltitudeDeg).toBeLessThan(70)
    expect(r.peakAtUtc!.toISOString()).toBe(WINDOW.start.toISOString())
  })

  it('applies a real but modest Moon penalty to M13 at 109 degrees separation', () => {
    // The Moon is 91% lit on this date but only ~6 deg up at the best moment,
    // and 109 deg from M13. So: a genuine penalty (the sky is brighter
    // everywhere) that is nonetheless small (the Moon is barely above the
    // horizon and nowhere near the target).
    const r = scoreTarget({ target: M13, loc: HOME, window: WINDOW, weather: clearSky(WINDOW) })
    const moon = r.factors.find((f) => f.id === 'moon')!
    expect(moon.value).toBeGreaterThan(0.85)
    expect(moon.value).toBeLessThanOrEqual(1)
    expect(Number(moon.input.separationDeg)).toBeGreaterThan(60)
    expect(moon.explain).toMatch(/moon/i)
  })

  it('total overcast forces the score to exactly zero, whatever else is perfect', () => {
    // The reason for the multiplicative tier. A flat weighted sum would still
    // return ~75 here.
    const r = scoreTarget({ target: M13, loc: HOME, window: WINDOW, weather: overcast(WINDOW) })
    expect(r.score).toBe(0)
  })

  it('gates M42 out of an EVENING window — it has not risen yet', () => {
    // Verified positions: M42 sits at -52 deg at dusk and is still -14 deg at
    // 05:00Z. Not available before midnight in late August.
    const evening: ObservingWindow = {
      start: new Date('2026-08-31T01:10:00Z'),
      end: new Date('2026-08-31T05:00:00Z'),
      stepMinutes: 10,
    }
    const r = scoreTarget({ target: M42, loc: HOME, window: evening, weather: clearSky(evening) })
    expect(r.observable).toBe(false)
    expect(r.reason).toBe('below-useful-altitude')
    expect(r.score).toBe(0)
  })

  it('but DOES offer M42 pre-dawn, when Orion has actually risen', () => {
    // Verified: M42 reaches +27.8 deg by 08:50Z (4:50 am EDT) with the Sun
    // still 18 deg down. Orion returns before dawn in late August, and hiding
    // it would be wrong. This is the counterpart to the gate above.
    const r = scoreTarget({ target: M42, loc: HOME, window: WINDOW, weather: clearSky(WINDOW) })
    expect(r.observable).toBe(true)
    expect(r.peakAltitudeDeg).toBeGreaterThan(25)
    expect(r.peakAtUtc!.getUTCHours()).toBeGreaterThanOrEqual(8)
  })

  it('SANITY CHECK: Saturn low in the east is not an opportunity at all', () => {
    // JPL ground truth: Saturn is at 10.28 deg altitude at 2026-08-31T02:00Z.
    // That is deep in thick, turbulent air, below the useful-altitude gate.
    // The plan demands this rank poorly; scoring it 92% would be fabrication.
    const earlyWindow: ObservingWindow = {
      start: new Date('2026-08-31T01:00:00Z'),
      end: new Date('2026-08-31T02:00:00Z'),
      stepMinutes: 10,
    }
    const r = scoreTarget({ target: SATURN, loc: HOME, window: earlyWindow, weather: clearSky(earlyWindow) })
    expect(r.peakAltitudeDeg).toBeLessThan(12) // matches the JPL golden value
    expect(r.observable).toBe(false)
    expect(r.reason).toBe('below-useful-altitude')
    expect(r.score).toBe(0)
  })

  it('Saturn scores better later in the night as it climbs', () => {
    const early: ObservingWindow = {
      start: new Date('2026-08-31T01:30:00Z'), end: new Date('2026-08-31T02:30:00Z'), stepMinutes: 10,
    }
    const late: ObservingWindow = {
      start: new Date('2026-08-31T06:00:00Z'), end: new Date('2026-08-31T08:00:00Z'), stepMinutes: 10,
    }
    const a = scoreTarget({ target: SATURN, loc: HOME, window: early, weather: clearSky(early) })
    const b = scoreTarget({ target: SATURN, loc: HOME, window: late, weather: clearSky(late) })
    expect(b.peakAltitudeDeg).toBeGreaterThan(a.peakAltitudeDeg)
    expect(b.score).toBeGreaterThan(a.score)
  })

  it('takes the BEST moment in the window, not the average', () => {
    // Cloudy first half, pristine second half. A mean-based implementation
    // would roughly halve the score; the observer just goes out later.
    const split = clearSky(WINDOW).map((s, i, arr) =>
      i < arr.length / 2 ? { ...s, cloudCoverPct: 100 } : s,
    )
    const r = scoreTarget({ target: M13, loc: HOME, window: WINDOW, weather: split })
    const allClear = scoreTarget({ target: M13, loc: HOME, window: WINDOW, weather: clearSky(WINDOW) })
    expect(r.score).toBeGreaterThan(allClear.score * 0.75)
  })
})

describe('no fabrication', () => {
  it('missing weather lowers confidence instead of inventing a cloud value', () => {
    const r = scoreTarget({ target: M13, loc: HOME, window: WINDOW, weather: null })
    expect(r.confidence).toBe('low')
    const cloud = r.factors.find((f) => f.id === 'cloud')!
    expect(cloud.assumed).toBe(true)
    expect(cloud.value).toBe(1) // neutral, not fabricated
    expect(cloud.input.cloudCoverPct).toBeNull()
    expect(cloud.explain).toMatch(/no forecast/i)
  })

  it('missing weather does not change the RANKING, only the confidence', () => {
    // Every target gets the same neutral multiplier, so relative order holds.
    const withW = [M13, M42, SATURN].map((t) =>
      scoreTarget({ target: t, loc: HOME, window: WINDOW, weather: clearSky(WINDOW) }),
    )
    const without = [M13, M42, SATURN].map((t) =>
      scoreTarget({ target: t, loc: HOME, window: WINDOW, weather: null }),
    )
    expect(rank(withW).tonight.map((o) => o.targetId)).toEqual(
      rank(without).tonight.map((o) => o.targetId),
    )
  })

  it('every factor carries resolvable evidence or is explicitly assumed', () => {
    const r = scoreTarget({ target: M13, loc: HOME, window: WINDOW, weather: clearSky(WINDOW) })
    for (const f of r.factors) {
      expect(f.evidence.length > 0 || f.assumed).toBe(true)
    }
  })

  it('never reports a seeing or transparency measurement', () => {
    const r = scoreTarget({ target: M13, loc: HOME, window: WINDOW, weather: clearSky(WINDOW) })
    const ids = r.factors.map((f) => f.id)
    expect(ids).not.toContain('seeing')
    expect(ids).not.toContain('transparency')
    for (const f of r.factors) {
      expect(Object.keys(f.input)).not.toContain('seeing')
      expect(Object.keys(f.input)).not.toContain('transparency')
    }
  })

  it('assumed inputs cap confidence below high', () => {
    const r = scoreTarget({ target: M13, loc: HOME, window: WINDOW, weather: clearSky(WINDOW) })
    if (r.factors.some((f) => f.assumed)) expect(r.confidence).not.toBe('high')
  })
})

describe('ranking', () => {
  const score = (t: Target) =>
    scoreTarget({ target: t, loc: HOME, window: WINDOW, weather: clearSky(WINDOW) })

  // An evening-only window, where M42 genuinely has not risen.
  const EVENING: ObservingWindow = {
    start: new Date('2026-08-31T01:10:00Z'),
    end: new Date('2026-08-31T05:00:00Z'),
    stepMinutes: 10,
  }
  const scoreEvening = (t: Target) =>
    scoreTarget({ target: t, loc: HOME, window: EVENING, weather: clearSky(EVENING) })

  it('separates observable from unobservable targets', () => {
    const { tonight, notTonight } = rank([M13, M42, SATURN].map(scoreEvening))
    expect(tonight.every((o) => o.observable)).toBe(true)
    expect(notTonight.every((o) => !o.observable)).toBe(true)
    expect(notTonight.map((o) => o.targetId)).toContain('m42')
  })

  it('THE POPULARITY GUARANTEE: a famous unobservable object never outranks an observable one', () => {
    // M42 carries the highest popularity in the catalogue (1.0 -> +4 bonus)
    // and has not risen during this evening window. It must not appear in
    // `tonight` at ANY position. That holds because observability is the
    // PARTITION KEY — there is no arithmetic path across it.
    const { tonight, notTonight } = rank([M13, M42, SATURN].map(scoreEvening))
    expect(tonight.map((o) => o.targetId)).not.toContain('m42')
    expect(notTonight.map((o) => o.targetId)).toContain('m42')
    for (const a of tonight) for (const b of notTonight) expect(a.finalScore).toBeGreaterThan(b.finalScore)
  })

  it('holds even when a synthetic unobservable target is given a huge bonus', () => {
    const fake: Observability = {
      targetId: 'zzz-fake', score: 0, confidence: 'low', observable: false,
      reason: 'never-rises', factors: [], peakAltitudeDeg: -50, peakAtUtc: null,
      peakAzimuthDeg: 0, minutesUseful: 0, bestBlock: null,
      popularityBonus: 4, finalScore: 0,
    }
    const barely: Observability = { ...fake, targetId: 'aaa-real', observable: true, reason: undefined, score: 0.5, peakAltitudeDeg: 20, popularityBonus: 0, finalScore: 0.5 }
    const { tonight, notTonight } = rank([fake, barely])
    expect(tonight.map((o) => o.targetId)).toEqual(['aaa-real'])
    expect(notTonight.map((o) => o.targetId)).toEqual(['zzz-fake'])
  })

  it('is deterministic regardless of input order', () => {
    const results = [M13, M42, SATURN].map(score)
    const forward = rank(results).tonight.map((o) => o.targetId)
    const reversed = rank(results.slice().reverse()).tonight.map((o) => o.targetId)
    expect(reversed).toEqual(forward)
  })

  it('breaks exact ties by id, so ordering can never wobble', () => {
    const base: Observability = {
      targetId: '', score: 50, confidence: 'high', observable: true, factors: [],
      peakAltitudeDeg: 45, peakAtUtc: null, peakAzimuthDeg: 180, minutesUseful: 120,
      bestBlock: null, popularityBonus: 0, finalScore: 50,
    }
    const out = rank([
      { ...base, targetId: 'ngc-c' },
      { ...base, targetId: 'ngc-a' },
      { ...base, targetId: 'ngc-b' },
    ]).tonight.map((o) => o.targetId)
    expect(out).toEqual(['ngc-a', 'ngc-b', 'ngc-c'])
  })

  it('caps the popularity bonus at 4 points', () => {
    for (const t of [M13, M42, SATURN]) expect(score(t).popularityBonus).toBeLessThanOrEqual(4)
  })
})
