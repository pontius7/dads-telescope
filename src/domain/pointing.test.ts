import { describe, it, expect } from 'vitest'
import { deviceToAim, turnFromTo, headingReliability, type DevicePose } from './pointing'

/**
 * Poses are described physically, then asserted against what the back camera
 * must be looking at. Every expected number here is derivable by holding a
 * phone and thinking about it, which is the point — none of it is read back
 * off the implementation.
 */
const pose = (
  alphaDeg: number,
  betaDeg: number,
  gammaDeg = 0,
  screenAngleDeg = 0,
): DevicePose => ({ alphaDeg, betaDeg, gammaDeg, screenAngleDeg })

describe('deviceToAim — where the back camera points', () => {
  it('looks straight down when the phone lies flat, screen up', () => {
    expect(deviceToAim(pose(0, 0)).altDeg).toBeCloseTo(-90, 6)
  })

  it('looks at the zenith when the phone lies flat, screen down', () => {
    expect(deviceToAim(pose(0, 180)).altDeg).toBeCloseTo(90, 6)
  })

  it('looks north at the horizon when held upright facing north', () => {
    const aim = deviceToAim(pose(0, 90))
    expect(aim.altDeg).toBeCloseTo(0, 6)
    expect(aim.azDeg).toBeCloseTo(0, 6)
  })

  it('looks west when the phone is turned a quarter anticlockwise', () => {
    expect(deviceToAim(pose(90, 90)).azDeg).toBeCloseTo(270, 6)
  })

  it('looks east when the phone is turned a quarter clockwise', () => {
    expect(deviceToAim(pose(270, 90)).azDeg).toBeCloseTo(90, 6)
  })

  /**
   * The failure that motivated this module. The old code used
   * `altDeg = beta - 90`, which reads -45 for this pose. The phone is rolled
   * fully onto its side, so beta has stopped being pitch entirely and the
   * camera is in fact level with the horizon, looking west.
   */
  it('stays level when the phone is rolled onto its side, where beta - 90 says -45', () => {
    const aim = deviceToAim(pose(0, 45, 90))
    expect(aim.altDeg).toBeCloseTo(0, 6)
    expect(aim.azDeg).toBeCloseTo(270, 6)
    expect(aim.altDeg).not.toBeCloseTo(45 - 90, 1)
  })

  it('reaches the zenith without sticking, where the good targets are', () => {
    // Tipped back past upright: the camera keeps climbing toward overhead
    // instead of turning back down as beta - 90 would have it.
    expect(deviceToAim(pose(0, 175)).altDeg).toBeCloseTo(85, 6)
    expect(deviceToAim(pose(0, 160)).altDeg).toBeCloseTo(70, 6)
  })

  it('does not let screen rotation change where the camera points', () => {
    // Rotating the phone in the hand turns the picture, not the telescope.
    const portrait = deviceToAim(pose(37, 64, 21, 0))
    for (const angle of [90, 180, 270]) {
      const rotated = deviceToAim(pose(37, 64, 21, angle))
      expect(rotated.altDeg).toBeCloseTo(portrait.altDeg, 9)
      expect(rotated.azDeg).toBeCloseTo(portrait.azDeg, 9)
    }
  })

  it('holds the screen upright when the phone is held upright', () => {
    expect(deviceToAim(pose(0, 90)).rollDeg).toBeCloseTo(0, 6)
  })

  it('reports azimuth in [0, 360)', () => {
    for (const alpha of [0, 45, 179, 180, 181, 359]) {
      const { azDeg } = deviceToAim(pose(alpha, 90))
      expect(azDeg).toBeGreaterThanOrEqual(0)
      expect(azDeg).toBeLessThan(360)
    }
  })

  it('shifts azimuth by a heading offset without touching altitude', () => {
    const plain = deviceToAim(pose(0, 90))
    const shifted = deviceToAim(pose(0, 90), 12)
    expect(shifted.azDeg).toBeCloseTo(12, 6)
    expect(shifted.altDeg).toBeCloseTo(plain.altDeg, 9)
  })
})

describe('turnFromTo — how to move a Dobsonian', () => {
  it('asks for a right turn when the target is clockwise of here', () => {
    const t = turnFromTo({ altDeg: 20, azDeg: 10 }, { altDeg: 20, azDeg: 50 })
    expect(t.turnRightDeg).toBeCloseTo(40, 6)
  })

  it('asks for a left turn when the target is anticlockwise of here', () => {
    const t = turnFromTo({ altDeg: 20, azDeg: 50 }, { altDeg: 20, azDeg: 10 })
    expect(t.turnRightDeg).toBeCloseTo(-40, 6)
  })

  it('takes the short way round past north', () => {
    const t = turnFromTo({ altDeg: 0, azDeg: 350 }, { altDeg: 0, azDeg: 10 })
    expect(t.turnRightDeg).toBeCloseTo(20, 6)
  })

  it('asks to raise the tube when the target is higher', () => {
    expect(turnFromTo({ altDeg: 20, azDeg: 0 }, { altDeg: 55, azDeg: 0 }).turnUpDeg).toBeCloseTo(35, 6)
  })

  it('asks to lower the tube when the target is lower', () => {
    expect(turnFromTo({ altDeg: 55, azDeg: 0 }, { altDeg: 20, azDeg: 0 }).turnUpDeg).toBeCloseTo(-35, 6)
  })

  it('measures separation across the sky, not along the axes', () => {
    // 90 deg of azimuth at 60 deg altitude is far less than 90 deg of sky.
    const t = turnFromTo({ altDeg: 60, azDeg: 0 }, { altDeg: 60, azDeg: 90 })
    expect(t.separationDeg).toBeCloseTo(41.4096, 3)
  })

  it('reports zero separation for the same point', () => {
    expect(turnFromTo({ altDeg: 33, azDeg: 210 }, { altDeg: 33, azDeg: 210 }).separationDeg).toBeCloseTo(0, 6)
  })

  it('collapses azimuth near the zenith, where a big turn is a small move', () => {
    const t = turnFromTo({ altDeg: 89, azDeg: 0 }, { altDeg: 89, azDeg: 180 })
    expect(t.separationDeg).toBeCloseTo(2, 3)
  })
})

describe('headingReliability — never point confidently on a bad compass', () => {
  it('treats a missing accuracy as unknown rather than good', () => {
    expect(headingReliability(null)).toBe('unknown')
  })

  it('treats a negative accuracy as unreliable, which is how iOS says uncalibrated', () => {
    expect(headingReliability(-1)).toBe('unreliable')
  })

  it('accepts a heading tight enough to land inside the Telrad outer ring', () => {
    expect(headingReliability(3)).toBe('good')
  })

  it('calls a heading coarse once it exceeds that 4 deg ring', () => {
    expect(headingReliability(8)).toBe('coarse')
  })

  it('calls a heading unreliable once it exceeds the eyepiece field entirely', () => {
    expect(headingReliability(20)).toBe('unreliable')
  })
})
