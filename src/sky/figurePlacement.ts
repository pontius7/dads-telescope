/**
 * Solving a painting onto the sky.
 *
 * Stellarium ships three anchors per figure: a pixel in the image paired with
 * the star it belongs on. Three point pairs are exactly what an affine map
 * needs, so the artwork is not positioned near its constellation — it is
 * solved onto it, and Orion's belt lands on Orion's belt.
 *
 * The trick is doing it on a sphere. Gnomonic projection about the figure's
 * own centre is the one projection that keeps great circles straight, which is
 * what makes a flat affine map the correct tool rather than an approximation.
 * Points are mapped in that plane and pushed back out to the sphere, so the
 * painting curves with the sky instead of cutting through it.
 *
 * Kept apart from the component so the arithmetic can be tested: a silent
 * error here does not crash, it just smears a hunter across the wrong stars.
 */
import * as THREE from 'three'

export interface PixelAnchor {
  x: number
  y: number
}

/** Maps a pixel in the source image to a unit direction in the sky. */
export type Placement = (px: number, py: number) => THREE.Vector3

/**
 * Returns null when the three anchors are collinear — there is no unique
 * affine map through them, and inventing one would stretch the figure across
 * the sky rather than fail visibly.
 */
export function solvePlacement(
  anchors: readonly PixelAnchor[],
  directions: readonly THREE.Vector3[],
): Placement | null {
  if (anchors.length < 3 || directions.length < 3) return null

  const centre = directions
    .slice(0, 3)
    .reduce((acc, d) => acc.add(d), new THREE.Vector3())
    .normalize()
  if (centre.lengthSq() < 1e-9) return null

  // A tangent frame at the centre of the figure.
  const up = Math.abs(centre.y) > 0.95 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)
  const e1 = new THREE.Vector3().crossVectors(up, centre).normalize()
  const e2 = new THREE.Vector3().crossVectors(centre, e1).normalize()

  const project = (d: THREE.Vector3): [number, number] => {
    const along = d.dot(centre)
    return [d.dot(e1) / along, d.dot(e2) / along]
  }

  const p = anchors.slice(0, 3).map((a) => [a.x, a.y] as [number, number])
  const q = directions.slice(0, 3).map(project)

  const m00 = p[1]![0] - p[0]![0], m01 = p[2]![0] - p[0]![0]
  const m10 = p[1]![1] - p[0]![1], m11 = p[2]![1] - p[0]![1]
  const det = m00 * m11 - m01 * m10
  if (Math.abs(det) < 1e-6) return null

  const n00 = q[1]![0] - q[0]![0], n01 = q[2]![0] - q[0]![0]
  const n10 = q[1]![1] - q[0]![1], n11 = q[2]![1] - q[0]![1]

  // A = N · M⁻¹, then the offset that pins the first anchor exactly.
  const i00 = m11 / det, i01 = -m01 / det, i10 = -m10 / det, i11 = m00 / det
  const a00 = n00 * i00 + n01 * i10, a01 = n00 * i01 + n01 * i11
  const a10 = n10 * i00 + n11 * i10, a11 = n10 * i01 + n11 * i11
  const t0 = q[0]![0] - (a00 * p[0]![0] + a01 * p[0]![1])
  const t1 = q[0]![1] - (a10 * p[0]![0] + a11 * p[0]![1])

  return (px, py) => {
    const u = a00 * px + a01 * py + t0
    const v = a10 * px + a11 * py + t1
    return new THREE.Vector3()
      .copy(centre)
      .addScaledVector(e1, u)
      .addScaledVector(e2, v)
      .normalize()
  }
}
