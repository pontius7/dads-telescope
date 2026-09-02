import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { solvePlacement } from './figurePlacement'
import { horizonToWorld } from '../domain/frame'
import { fixedHorizontal, HOME } from '../domain/ephemeris'
import ART from '../data/constellationArt.json'

interface Anchor { x: number; y: number; raHoursJ2000: number; decDegJ2000: number }
const FIGURES = ART as unknown as Record<
  string,
  { file: string; imageSize: [number, number]; anchors: Anchor[] }
>

const WHEN = new Date('2026-09-02T02:00:00Z')

function directionOf(a: Anchor): THREE.Vector3 {
  const h = fixedHorizontal(a.raHoursJ2000, a.decDegJ2000, WHEN, HOME, 'normal')
  const [x, y, z] = horizonToWorld(h.altitudeDeg, h.azimuthDeg, 1)
  return new THREE.Vector3(x, y, z)
}

describe('solvePlacement', () => {
  /**
   * The whole point of the anchors. If a figure's own anchor pixels do not
   * come back out pointing at the stars they name, the painting is sitting in
   * the wrong part of the sky — which looks like a bug nobody can describe
   * rather than an error anybody can see.
   */
  it('lands every anchor pixel back on its own star, for all 22 figures', () => {
    const names = Object.keys(FIGURES)
    expect(names.length).toBe(22)

    for (const name of names) {
      const fig = FIGURES[name]!
      const dirs = fig.anchors.map(directionOf)
      const place = solvePlacement(fig.anchors, dirs)
      expect(place, `${name}: anchors are degenerate`).not.toBeNull()

      fig.anchors.forEach((a, i) => {
        const got = place!(a.x, a.y)
        const want = dirs[i]!
        const arcsec = got.angleTo(want) * (180 / Math.PI) * 3600
        // Sub-arcsecond: this is an exact solve, not a fit.
        expect(arcsec, `${name} anchor ${i}`).toBeLessThan(1)
      })
    }
  })

  it('keeps the figure the right way round', () => {
    // Three anchors forming a clockwise triangle in image space must still be
    // clockwise on the sky, or the painting comes out mirrored.
    const fig = FIGURES['Orion']!
    const dirs = fig.anchors.map(directionOf)
    const place = solvePlacement(fig.anchors, dirs)!

    const [w, h] = fig.imageSize
    const tl = place(0, 0)
    const tr = place(w, 0)
    const bl = place(0, h)
    // The cross product of the two edges should point back toward the viewer
    // consistently; a mirrored solve flips its sign.
    const across = new THREE.Vector3().subVectors(tr, tl)
    const down = new THREE.Vector3().subVectors(bl, tl)
    const normal = new THREE.Vector3().crossVectors(across, down)
    expect(normal.dot(tl)).toBeGreaterThan(0)
  })

  it('refuses collinear anchors rather than smearing the figure', () => {
    const dirs = [
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0.01, 0, 1).normalize(),
      new THREE.Vector3(0.02, 0, 1).normalize(),
    ]
    const collinear = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]
    expect(solvePlacement(collinear, dirs)).toBeNull()
  })

  it('needs three anchors', () => {
    expect(solvePlacement([{ x: 0, y: 0 }], [new THREE.Vector3(0, 0, 1)])).toBeNull()
  })

  it('names one distinct picture per figure', () => {
    const files = Object.values(FIGURES).map((f) => f.file)
    expect(files.every((f) => /^[a-z]+\.webp$/.test(f))).toBe(true)
    // A duplicate here would mean two constellations sharing one painting,
    // which is always a mistake in the fetch script rather than a choice.
    expect(new Set(files).size).toBe(files.length)
  })
})
