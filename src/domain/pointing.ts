/**
 * Turning a phone's orientation into a direction in the sky, and into an
 * instruction for moving a Dobsonian.
 *
 * WHY THIS EXISTS. The first version read two of the three device angles:
 *
 *     altDeg = clamp(beta - 90, -20, 89)
 *
 * That is only pitch while the phone is perfectly unrolled and upright in
 * portrait. Roll the phone and beta stops being pitch — held on its side at
 * beta 45 the camera is level with the horizon, while the formula claims -45.
 * Tip it back past vertical, toward the overhead sky where tonight's best
 * targets sit, and beta turns back down again, so the reported altitude falls
 * while the phone keeps rising. Rotate to landscape and the mapping is simply
 * void.
 *
 * The fix is to stop approximating and compose the full rotation. The device
 * frame is x=right, y=top, z=out of the screen; the browser reports intrinsic
 * Z-X'-Y'' angles taking the Earth frame (x=east, y=north, z=up) onto it. Turn
 * that into a matrix, ask where the BACK of the phone is looking, and read the
 * altitude and azimuth off the result. No angle is privileged, so no pose is a
 * special case.
 *
 * Everything here is plain numbers: no three.js, no DOM. It is the same
 * arithmetic whether it runs in the render loop or in a test.
 */
import { angularSeparationDeg } from './ephemeris'

const RAD = Math.PI / 180
const DEG = 180 / Math.PI

export interface DevicePose {
  /** Rotation about the vertical. */
  alphaDeg: number
  /** Front-to-back tilt. */
  betaDeg: number
  /** Left-to-right roll. */
  gammaDeg: number
  /** `screen.orientation.angle` — turns the picture, never the telescope. */
  screenAngleDeg: number
}

export interface Aim {
  altDeg: number
  azDeg: number
  /** How far the screen is turned about the view axis, for rolling the sky with the phone. */
  rollDeg: number
}

type Vec3 = [number, number, number]

/**
 * Device axes expressed in the Earth frame (x=east, y=north, z=up), from the
 * intrinsic Z-X'-Y'' angles the browser reports.
 */
function deviceAxes(alphaDeg: number, betaDeg: number, gammaDeg: number): {
  right: Vec3
  top: Vec3
  out: Vec3
} {
  const a = alphaDeg * RAD
  const b = betaDeg * RAD
  const g = gammaDeg * RAD
  const ca = Math.cos(a), sa = Math.sin(a)
  const cb = Math.cos(b), sb = Math.sin(b)
  const cg = Math.cos(g), sg = Math.sin(g)

  // R = Rz(alpha) . Rx(beta) . Ry(gamma), written out so the render loop does
  // no matrix allocation.
  return {
    right: [
      ca * cg - sa * sb * sg,
      sa * cg + ca * sb * sg,
      -cb * sg,
    ],
    top: [
      -sa * cb,
      ca * cb,
      sb,
    ],
    out: [
      ca * sg + sa * sb * cg,
      sa * sg - ca * sb * cg,
      cb * cg,
    ],
  }
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

function normalise(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2])
  return len < 1e-12 ? [0, 0, 0] : [v[0] / len, v[1] / len, v[2] / len]
}

/**
 * Where the back camera is looking, and how far the screen is turned.
 *
 * `headingOffsetDeg` shifts azimuth for a platform that reports magnetic
 * rather than true north. It stays 0 until a real device says otherwise —
 * guessing a declination would be inventing a correction we have not measured.
 */
export function deviceToAim(p: DevicePose, headingOffsetDeg = 0): Aim {
  const { right, top, out } = deviceAxes(p.alphaDeg, p.betaDeg, p.gammaDeg)

  // The camera looks out of the back, opposite the screen normal.
  const forward: Vec3 = [-out[0], -out[1], -out[2]]

  const altDeg = Math.asin(Math.max(-1, Math.min(1, forward[2]))) * DEG
  const rawAz = Math.atan2(forward[0], forward[1]) * DEG
  const azDeg = ((rawAz + headingOffsetDeg) % 360 + 360) % 360

  // Rotating the phone in the hand rotates the picture only, so the screen
  // angle is applied to the screen's up vector and nowhere near the aim.
  const s = p.screenAngleDeg * RAD
  const cs = Math.cos(s), ss = Math.sin(s)
  const screenUp: Vec3 = [
    top[0] * cs - right[0] * ss,
    top[1] * cs - right[1] * ss,
    top[2] * cs - right[2] * ss,
  ]

  // Level reference: world up, flattened into the plane the screen occupies.
  // Looking straight up or down it collapses, and any roll is as good as any
  // other, so fall back to north and keep the value finite.
  const zenith: Vec3 = [0, 0, 1]
  const along = dot(zenith, forward)
  let refUp = normalise([
    zenith[0] - forward[0] * along,
    zenith[1] - forward[1] * along,
    zenith[2] - forward[2] * along,
  ])
  if (refUp[0] === 0 && refUp[1] === 0 && refUp[2] === 0) {
    refUp = normalise(cross(forward, [1, 0, 0]))
  }
  const refRight = cross(forward, refUp)
  const rollDeg = Math.atan2(dot(screenUp, refRight), dot(screenUp, refUp)) * DEG

  return { altDeg, azDeg, rollDeg }
}

export interface Turn {
  /** Positive swings the tube clockwise; negative is a turn to the left. */
  turnRightDeg: number
  /** Positive raises the tube. */
  turnUpDeg: number
  /** Real distance across the sky, which is not the sum of the two above. */
  separationDeg: number
}

/** What to do with the telescope to get from one point of sky to another. */
export function turnFromTo(
  from: { altDeg: number; azDeg: number },
  to: { altDeg: number; azDeg: number },
): Turn {
  return {
    turnRightDeg: (((to.azDeg - from.azDeg) % 360) + 540) % 360 - 180,
    turnUpDeg: to.altDeg - from.altDeg,
    // Azimuth and altitude are a spherical coordinate pair exactly as right
    // ascension and declination are, so the catalogue's own separation applies
    // unchanged — azimuth takes the hour-angle slot at 15 degrees per hour.
    separationDeg: angularSeparationDeg(from.azDeg / 15, from.altDeg, to.azDeg / 15, to.altDeg),
  }
}

export type HeadingQuality = 'unknown' | 'good' | 'coarse' | 'unreliable'

/**
 * How much to trust the compass.
 *
 * A confidently drawn arrow built on an uncalibrated magnetometer is the same
 * class of error as inventing a weather reading: it looks authoritative and
 * sends someone outside pointing at nothing. iOS reports a negative accuracy
 * when the heading is not calibrated at all.
 */
export function headingReliability(accuracyDeg: number | null | undefined): HeadingQuality {
  if (accuracyDeg === null || accuracyDeg === undefined) return 'unknown'
  if (accuracyDeg < 0) return 'unreliable'
  // 4 deg is the Telrad's outer ring: inside that, the target is already in
  // the finder when the arrow says it should be.
  if (accuracyDeg <= 4) return 'good'
  if (accuracyDeg <= 15) return 'coarse'
  return 'unreliable'
}
