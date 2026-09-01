/**
 * The one place that decides where a horizon coordinate lands in the scene.
 *
 * WORLD AXES: +X west, +Y up, +Z north. That is not a free choice — the star
 * field, the Milky Way and the constellation figures all place their geometry
 * directly from astronomy-engine's horizontal frame (x=north, y=west,
 * z=zenith) as (v.y, v.z, v.x). Anything drawn in a different frame is drawn
 * in the wrong place, and the sky stops agreeing with itself.
 *
 * The axes are right-handed as written: facing north, east falls on your
 * right, the way it does outdoors. Building +X from +sin(azimuth) — the EAST
 * component — mirrors the entire sky across the meridian, which is the bug
 * `frame.test.ts` exists to keep out.
 */

/** Where an object at this altitude and azimuth sits, `r` from the observer. */
export function horizonToWorld(altDeg: number, azDeg: number, r = 1): [number, number, number] {
  const alt = (altDeg * Math.PI) / 180
  const az = (azDeg * Math.PI) / 180
  const cosAlt = Math.cos(alt)
  return [
    // Azimuth runs clockwise from north, so its EAST component is +sin(az) and
    // the west axis therefore takes the negative.
    -r * cosAlt * Math.sin(az),
    r * Math.sin(alt),
    r * cosAlt * Math.cos(az),
  ]
}

/** The inverse. Azimuth comes back in [0, 360); at the zenith it is arbitrary. */
export function worldToHorizon([x, y, z]: readonly [number, number, number]): {
  altDeg: number
  azDeg: number
} {
  const len = Math.hypot(x, y, z) || 1
  const altDeg = (Math.asin(Math.max(-1, Math.min(1, y / len))) * 180) / Math.PI
  const azDeg = (((Math.atan2(-x, z) * 180) / Math.PI) % 360 + 360) % 360
  return { altDeg, azDeg }
}
