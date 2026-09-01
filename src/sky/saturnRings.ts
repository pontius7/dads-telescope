/**
 * Saturn's rings, drawn as rings.
 *
 * THE BUG THIS FIXES. `THREE.RingGeometry` lays its UVs out across the
 * bounding SQUARE, not radially — so a one-pixel-tall stripe texture, which is
 * the natural way to describe ring structure, came out as straight bars
 * running across the disc. Saturn is the most recognisable thing in the sky
 * and it was wearing a barcode.
 *
 * Rewriting u as normalised radius makes each band a circle at its real
 * distance from the planet, so the Cassini division reads as the gap it is.
 */
import * as THREE from 'three'

/** Real proportions, in planet radii. */
export const RING_INNER = 1.24
export const RING_OUTER = 2.28

/**
 * A ring whose texture runs from the inner edge outward, rather than left to
 * right across a square.
 */
export function saturnRingGeometry(segments = 96): THREE.RingGeometry {
  const geometry = new THREE.RingGeometry(RING_INNER, RING_OUTER, segments)
  const position = geometry.attributes.position!
  const uv = geometry.attributes.uv!
  const v = new THREE.Vector3()

  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i)
    const t = (v.length() - RING_INNER) / (RING_OUTER - RING_INNER)
    uv.setXY(i, Math.min(1, Math.max(0, t)), 0.5)
  }
  uv.needsUpdate = true
  return geometry
}

/**
 * The banding, roughly to the real structure: C faint, B bright, the Cassini
 * division dark, A moderate. One pixel tall because only the radius matters.
 */
export function saturnRingTexture(): THREE.CanvasTexture {
  const W = 256
  const c = document.createElement('canvas')
  c.width = W
  c.height = 1
  const ctx = c.getContext('2d')!
  const bands: [number, number, string][] = [
    [0.0, 0.16, 'rgba(150,140,120,0.10)'],
    [0.16, 0.3, 'rgba(190,175,150,0.42)'],
    [0.3, 0.62, 'rgba(226,212,186,0.86)'],
    [0.62, 0.68, 'rgba(90,84,74,0.16)'],
    [0.68, 0.93, 'rgba(206,193,170,0.62)'],
    [0.93, 1.0, 'rgba(150,140,120,0.10)'],
  ]
  for (const [a, b, colour] of bands) {
    ctx.fillStyle = colour
    ctx.fillRect(a * W, 0, (b - a) * W, 1)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
