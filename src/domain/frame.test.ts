import { describe, it, expect } from 'vitest'
import { MakeTime, Observer, Rotation_EQJ_HOR, RotateVector, Vector } from 'astronomy-engine'
import { horizonToWorld, worldToHorizon } from './frame'

/**
 * The scene's world axes, and the bug these tests exist to prevent.
 *
 * Three renderers place their geometry straight from astronomy-engine's
 * horizontal frame, which is x=north, y=west, z=zenith, mapped as
 * (v.y, v.z, v.x) — the star field, the Milky Way and the constellation
 * figures. That makes the world +X WEST, +Y up, +Z north.
 *
 * `altAzToVec3` used to build +X from sin(azimuth), which is the EAST
 * component. Markers, the E/W labels, the meteors and the camera all went
 * through it, so every one of them was mirrored across the meridian relative
 * to the stars behind them — 19.9 deg of error for M57 on 1 Sep 2026, and up
 * to 180 deg due east or west. A marker never sat on its own constellation.
 */

const MAYS_LANDING = new Observer(39.45, -74.72, 10)

describe('world axes', () => {
  it('puts +X west, so east is negative X', () => {
    const [x, y, z] = horizonToWorld(0, 90, 1) // due east, on the horizon
    expect(x).toBeCloseTo(-1, 12)
    expect(y).toBeCloseTo(0, 12)
    expect(z).toBeCloseTo(0, 12)
  })

  it('puts +Z north', () => {
    const [x, y, z] = horizonToWorld(0, 0, 1)
    expect(x).toBeCloseTo(0, 12)
    expect(y).toBeCloseTo(0, 12)
    expect(z).toBeCloseTo(1, 12)
  })

  it('puts +Y up', () => {
    const [x, y, z] = horizonToWorld(90, 0, 1)
    expect(x).toBeCloseTo(0, 12)
    expect(y).toBeCloseTo(1, 12)
    expect(z).toBeCloseTo(0, 12)
  })

  it('scales by radius', () => {
    const [, y] = horizonToWorld(90, 0, 88)
    expect(y).toBeCloseTo(88, 10)
  })
})

describe('agreement with the star field', () => {
  /**
   * The regression guard. Takes a real object at a real time, places it the
   * way the star field does, and requires this module to land in the same
   * spot. Any reintroduced axis flip fails here.
   */
  const cases: Array<[string, number, number]> = [
    ['M57 Ring Nebula', 18.8933, 33.0333],
    ['M31 Andromeda', 0.7123, 41.2687],
    ['M13 Hercules', 16.695, 36.4613],
    ['Polaris', 2.5303, 89.2641],
  ]

  for (const [name, raHours, decDeg] of cases) {
    it(`places ${name} where the star field places it`, () => {
      const time = MakeTime(new Date('2026-09-01T02:00:00Z'))
      const rot = Rotation_EQJ_HOR(time, MAYS_LANDING)
      const ra = (raHours * 15 * Math.PI) / 180
      const dec = (decDeg * Math.PI) / 180
      const v = RotateVector(
        rot,
        new Vector(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec), time),
      )

      // Exactly what SkyScene does for stars: pos.push(v.y, v.z, v.x)
      const starField = [v.y, v.z, v.x]

      const altDeg = (Math.asin(Math.max(-1, Math.min(1, v.z))) * 180) / Math.PI
      const azDeg = (((Math.atan2(-v.y, v.x) * 180) / Math.PI) % 360 + 360) % 360
      const ours = horizonToWorld(altDeg, azDeg, 1)

      expect(ours[0]).toBeCloseTo(starField[0]!, 9)
      expect(ours[1]).toBeCloseTo(starField[1]!, 9)
      expect(ours[2]).toBeCloseTo(starField[2]!, 9)
    })
  }
})

describe('worldToHorizon', () => {
  it('inverts horizonToWorld', () => {
    for (const [alt, az] of [[0, 0], [12, 47], [78.5, 240], [-30, 359], [45, 180]] as const) {
      const back = worldToHorizon(horizonToWorld(alt, az, 88))
      expect(back.altDeg).toBeCloseTo(alt, 9)
      expect(back.azDeg).toBeCloseTo(az, 9)
    }
  })

  it('reports azimuth in [0, 360)', () => {
    expect(worldToHorizon(horizonToWorld(10, -1, 1)).azDeg).toBeCloseTo(359, 9)
  })

  it('survives the zenith, where azimuth is undefined', () => {
    const { altDeg } = worldToHorizon([0, 1, 0])
    expect(altDeg).toBeCloseTo(90, 9)
  })
})
