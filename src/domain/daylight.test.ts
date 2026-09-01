import { describe, it, expect } from 'vitest'
import { daylightPhase, starVisibility, skyPalette, SUN_SET_ALT_DEG } from './daylight'

describe('daylightPhase — the standard twilight bands', () => {
  it('calls the sun above the horizon day', () => {
    expect(daylightPhase(45)).toBe('day')
    expect(daylightPhase(0.5)).toBe('day')
  })

  it('uses the refracted horizon, not the geometric one', () => {
    // The Sun's disc is still up when its centre is 0.833 deg below level,
    // which is why sunset is later than geometry alone predicts.
    expect(SUN_SET_ALT_DEG).toBeCloseTo(-0.833, 3)
    expect(daylightPhase(-0.5)).toBe('day')
    expect(daylightPhase(-1)).toBe('civil')
  })

  it('walks down through civil, nautical and astronomical twilight', () => {
    expect(daylightPhase(-3)).toBe('civil')
    expect(daylightPhase(-8)).toBe('nautical')
    expect(daylightPhase(-15)).toBe('astronomical')
  })

  it('calls it night once the sun is 18 degrees down', () => {
    expect(daylightPhase(-18.1)).toBe('night')
    expect(daylightPhase(-40)).toBe('night')
  })
})

describe('starVisibility', () => {
  it('shows no stars in daylight', () => {
    expect(starVisibility(20)).toBe(0)
    expect(starVisibility(0)).toBe(0)
  })

  it('shows every star in full darkness', () => {
    expect(starVisibility(-18)).toBe(1)
    expect(starVisibility(-50)).toBe(1)
  })

  it('brings them out gradually through twilight', () => {
    const dusk = starVisibility(-8)
    expect(dusk).toBeGreaterThan(0)
    expect(dusk).toBeLessThan(1)
  })

  it('never goes backwards as the sun sinks', () => {
    let previous = -1
    for (let alt = 5; alt >= -25; alt -= 0.5) {
      const v = starVisibility(alt)
      expect(v).toBeGreaterThanOrEqual(previous)
      previous = v
    }
  })
})

describe('skyPalette', () => {
  it('is blue overhead at midday', () => {
    const [r, , b] = skyPalette(50).zenith
    expect(b).toBeGreaterThan(r)
    expect(b).toBeGreaterThan(0.35)
  })

  it('is essentially black at night', () => {
    const [r, g, b] = skyPalette(-30).zenith
    expect(Math.max(r, g, b)).toBeLessThan(0.08)
  })

  it('keeps the horizon lighter than the zenith while the sun is near it', () => {
    const p = skyPalette(-2)
    const lum = ([r, g, b]: readonly [number, number, number]) => r + g + b
    expect(lum(p.horizon)).toBeGreaterThan(lum(p.zenith))
  })

  it('returns channels in range at every sun altitude', () => {
    for (let alt = 90; alt >= -40; alt -= 1) {
      for (const c of [...skyPalette(alt).zenith, ...skyPalette(alt).horizon]) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(1)
      }
    }
  })
})
