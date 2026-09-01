import { describe, it, expect } from 'vitest'
import {
  TELESCOPE,
  FOCAL_RATIO,
  ABSOLUTE_MAX_MAGNIFICATION,
  DEFAULT_EYE_PUPIL_MM,
  magnification,
  exitPupilMm,
  trueFovDegFromAfov,
  trueFovDegFromFieldStop,
  dawesLimitArcsec,
  rayleighLimitArcsec,
  limitingMagnitudeOptimistic,
  minUsefulMagnification,
  maxUsefulMagnification,
  isMagnificationSane,
  snapZoomFocal,
  interpolateZoomAfov,
} from './optics'

describe('telescope constants', () => {
  it('matches the authoritative spec', () => {
    expect(TELESCOPE.apertureMm).toBe(203)
    expect(TELESCOPE.focalLengthMm).toBe(1200)
  })

  it('derives f/5.91, not the marketed f/6', () => {
    expect(FOCAL_RATIO).toBeCloseTo(5.9113, 4)
  })
})

describe('magnification — 1200 / eyepiece focal length', () => {
  // Hand-computed. Right column is the spec's own stated approximation.
  const cases: Array<[string, number, number, number]> = [
    ['Celestron E-Lux 40 mm', 40, 30.0, 30],
    ['Astro-Tech 28 mm UWA', 28, 42.8571, 43],
    ['Celestron 25 mm Plossl', 25, 48.0, 48],
    ['Astro-Tech 13 mm UWA', 13, 92.3077, 92],
    ['Baader Zoom @ 24 mm', 24, 50.0, 50],
    ['Baader Zoom @ 8 mm', 8, 150.0, 150],
    ['SVBONY Zoom @ 21 mm', 21, 57.1429, 57],
    ['SVBONY Zoom @ 7 mm', 7, 171.4286, 171],
  ]

  it.each(cases)('%s -> %fx', (_name, focal, expected, specApprox) => {
    expect(magnification(focal)).toBeCloseTo(expected, 3)
    // Conformance: our exact value must round to the figure the spec states.
    expect(Math.round(magnification(focal))).toBe(specApprox)
  })

  it('applies Barlow factors multiplicatively', () => {
    expect(magnification(13, 2)).toBeCloseTo(184.6154, 3)
    expect(magnification(13, 2.25)).toBeCloseTo(207.6923, 3)
    expect(magnification(8, 2)).toBeCloseTo(300.0, 3)
    expect(magnification(25, 2)).toBeCloseTo(96.0, 3)
  })

  it('rejects nonsense input rather than returning Infinity', () => {
    expect(() => magnification(0)).toThrow(RangeError)
    expect(() => magnification(-13)).toThrow(RangeError)
    expect(() => magnification(13, 0)).toThrow(RangeError)
    expect(() => magnification(Number.NaN)).toThrow(RangeError)
  })
})

describe('exit pupil — aperture / magnification', () => {
  const cases: Array<[string, number, number]> = [
    ['E-Lux 40 mm', 40, 6.7667],
    ['AT 28 mm UWA', 28, 4.7367],
    ['25 mm Plossl', 25, 4.2292],
    ['AT 13 mm UWA', 13, 2.1992],
    ['Baader @ 24 mm', 24, 4.06],
    ['Baader @ 8 mm', 8, 1.3533],
    ['SVBONY @ 21 mm', 21, 3.5525],
    ['SVBONY @ 7 mm', 7, 1.1842],
  ]

  it.each(cases)('%s -> %f mm', (_name, focal, expected) => {
    expect(exitPupilMm(focal)).toBeCloseTo(expected, 3)
  })

  it('agrees with the eyepieceFocal / focalRatio formulation', () => {
    for (const f of [40, 28, 25, 13, 24, 8, 21, 7]) {
      expect(exitPupilMm(f)).toBeCloseTo(f / FOCAL_RATIO, 9)
    }
  })

  it("reproduces the spec's stated exit pupils to 1 decimal", () => {
    expect(exitPupilMm(28)).toBeCloseTo(4.7, 1) // spec: ~4.7 mm
    expect(exitPupilMm(13)).toBeCloseTo(2.2, 1) // spec: ~2.2 mm
    expect(exitPupilMm(24)).toBeCloseTo(4.1, 1) // spec: ~4.0 mm (Baader wide end)
    expect(exitPupilMm(8)).toBeCloseTo(1.4, 1) // spec: ~1.3 mm (Baader tight end)
  })

  it('shrinks the exit pupil when a Barlow is used', () => {
    expect(exitPupilMm(13, 2)).toBeCloseTo(1.0996, 3)
    expect(exitPupilMm(13, 2.25)).toBeCloseTo(0.9774, 3)
    expect(exitPupilMm(8, 2)).toBeCloseTo(0.6767, 3)
  })
})

describe('true field of view', () => {
  it('computes TFOV from apparent FOV', () => {
    expect(trueFovDegFromAfov(82, 28)).toBeCloseTo(1.9133, 3)
    expect(trueFovDegFromAfov(82, 13)).toBeCloseTo(0.8883, 3)
    expect(trueFovDegFromAfov(50, 25)).toBeCloseTo(1.0417, 3)
  })

  it('computes TFOV from field stop (exact method)', () => {
    // 46 mm is about the largest field stop a 2" barrel can pass.
    expect(trueFovDegFromFieldStop(46)).toBeCloseTo(2.1963, 3)
    expect(trueFovDegFromFieldStop(27)).toBeCloseTo(1.2892, 3)
  })

  it('a Barlow narrows the true field', () => {
    expect(trueFovDegFromAfov(82, 13, 2)).toBeCloseTo(0.4442, 3)
    expect(trueFovDegFromFieldStop(46, 2)).toBeCloseTo(1.0981, 3)
  })
})

describe('resolution and limiting magnitude', () => {
  it('Dawes limit = 116 / 203 mm', () => {
    expect(dawesLimitArcsec()).toBeCloseTo(0.5714, 4)
  })

  it('Rayleigh limit = 138 / 203 mm', () => {
    expect(rayleighLimitArcsec()).toBeCloseTo(0.6798, 4)
  })

  it('Rayleigh is the more conservative of the two', () => {
    expect(rayleighLimitArcsec()).toBeGreaterThan(dawesLimitArcsec())
  })

  it('optimistic limiting magnitude for 203 mm', () => {
    expect(limitingMagnitudeOptimistic()).toBeCloseTo(14.2375, 3)
  })
})

describe('practical magnification limits', () => {
  it('absolute ceiling is 2x aperture in mm', () => {
    expect(ABSOLUTE_MAX_MAGNIFICATION).toBe(406)
  })

  it('the 0.5 mm exit-pupil floor agrees with the 2x-aperture rule', () => {
    // Two independent rules, same number — a useful cross-check.
    expect(TELESCOPE.apertureMm / 0.5).toBe(ABSOLUTE_MAX_MAGNIFICATION)
  })

  it('min useful magnification depends on eye pupil', () => {
    expect(minUsefulMagnification(6.0)).toBeCloseTo(33.833, 3)
    expect(minUsefulMagnification(7.0)).toBeCloseTo(29.0, 3)
    expect(minUsefulMagnification()).toBeCloseTo(203 / DEFAULT_EYE_PUPIL_MM, 9)
  })

  it('seeing tiers cap magnification well below the optical limit', () => {
    expect(maxUsefulMagnification('poor')).toBe(120)
    expect(maxUsefulMagnification('average')).toBe(200)
    expect(maxUsefulMagnification('good')).toBe(280)
    expect(maxUsefulMagnification('excellent')).toBe(350)
    expect(maxUsefulMagnification()).toBe(200) // default assumption
  })

  it('never allows a tier above the absolute optical ceiling', () => {
    for (const tier of ['poor', 'average', 'good', 'excellent'] as const) {
      expect(maxUsefulMagnification(tier)).toBeLessThanOrEqual(ABSOLUTE_MAX_MAGNIFICATION)
    }
  })
})

describe('isMagnificationSane — the anti-absurdity guard', () => {
  it('accepts ordinary working magnifications', () => {
    expect(isMagnificationSane(30)).toBe(true) // 40 mm
    expect(isMagnificationSane(43)).toBe(true) // 28 mm
    expect(isMagnificationSane(92)).toBe(true) // 13 mm
    expect(isMagnificationSane(150)).toBe(true) // Baader @ 8 mm
  })

  it('REJECTS 300x on an average night even though the arithmetic allows it', () => {
    // Baader 8 mm + Celestron Omni 2x = 300x. Optically legal, atmospherically
    // useless on a typical night. This is the spec's core anti-absurdity rule.
    expect(magnification(8, 2)).toBe(300)
    expect(isMagnificationSane(300, 'average')).toBe(false)
    expect(isMagnificationSane(300, 'excellent')).toBe(true)
  })

  it('rejects magnification past the absolute optical ceiling on any tier', () => {
    expect(isMagnificationSane(406, 'excellent')).toBe(false)
    expect(isMagnificationSane(500, 'excellent')).toBe(false)
  })

  it('rejects magnification so low it wastes aperture', () => {
    expect(isMagnificationSane(20)).toBe(false)
  })

  it('rejects non-finite and non-positive values', () => {
    expect(isMagnificationSane(Number.NaN)).toBe(false)
    expect(isMagnificationSane(Number.POSITIVE_INFINITY)).toBe(false)
    expect(isMagnificationSane(0)).toBe(false)
    expect(isMagnificationSane(-92)).toBe(false)
  })
})

describe('zoom eyepieces', () => {
  const BAADER = { minMm: 8, maxMm: 24, clickStopsMm: [24, 20, 16, 12, 8] as const }
  const SVBONY = { minMm: 7, maxMm: 21 }

  it('snaps a click-stop zoom to a position Dad can physically set', () => {
    expect(snapZoomFocal(9.3, BAADER)).toBe(8)
    expect(snapZoomFocal(11.4, BAADER)).toBe(12)
    expect(snapZoomFocal(23.9, BAADER)).toBe(24)
  })

  it('resolves click-stop ties deterministically', () => {
    // 14 is exactly between the 12 and 16 detents; must not be random.
    expect(snapZoomFocal(14, BAADER)).toBe(16)
    expect(snapZoomFocal(14, BAADER)).toBe(snapZoomFocal(14, BAADER))
  })

  it('clamps to the barrel range', () => {
    expect(snapZoomFocal(2, BAADER)).toBe(8)
    expect(snapZoomFocal(99, BAADER)).toBe(24)
  })

  it('leaves a continuous zoom unsnapped', () => {
    expect(snapZoomFocal(9.3, SVBONY)).toBeCloseTo(9.3, 6)
    expect(snapZoomFocal(30, SVBONY)).toBe(21)
    expect(snapZoomFocal(3, SVBONY)).toBe(7)
  })

  it('interpolates apparent FOV across a zoom range', () => {
    const spec = { minMm: 8, maxMm: 24, afovAtMinDeg: 68, afovAtMaxDeg: 50 }
    expect(interpolateZoomAfov(8, spec)).toBeCloseTo(68, 6)
    expect(interpolateZoomAfov(24, spec)).toBeCloseTo(50, 6)
    expect(interpolateZoomAfov(16, spec)).toBeCloseTo(59, 6)
    // clamped outside the range
    expect(interpolateZoomAfov(4, spec)).toBeCloseTo(68, 6)
    expect(interpolateZoomAfov(40, spec)).toBeCloseTo(50, 6)
  })
})
