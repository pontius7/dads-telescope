/**
 * The solar-system bodies this app can draw as real spheres, and the numbers
 * that make them themselves.
 *
 * Shared by the detail card's rotatable globe and the sky marker, so the two
 * cannot drift apart — the Moon in the sky and the Moon on the card show the
 * same phase of the same surface.
 */

/** Real surface maps, local and precached. */
export const BODY_TEXTURES: Record<string, string> = {
  moon: '/textures/moon.jpg',
  mars: '/textures/mars.jpg',
  jupiter: '/textures/jupiter.jpg',
  saturn: '/textures/saturn.jpg',
  venus: '/textures/venus.jpg',
  mercury: '/textures/mercury.jpg',
  uranus: '/textures/uranus.jpg',
  neptune: '/textures/neptune.jpg',
}

/** Axial tilt in degrees. Real values — Uranus really is on its side. */
export const AXIAL_TILT: Record<string, number> = {
  moon: 6.7, mercury: 0.03, venus: 177.4, mars: 25.2,
  jupiter: 3.1, saturn: 26.7, uranus: 97.8, neptune: 28.3,
}

export function hasBodyTexture(targetId: string): boolean {
  return BODY_TEXTURES[targetId] !== undefined
}
