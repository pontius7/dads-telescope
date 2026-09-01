/**
 * What the sky actually looks like right now.
 *
 * The scene used to render a black, star-filled night at every hour of the
 * day, so pointing the phone at a blue sky at four in the afternoon showed
 * Cygnus. That is the same class of error as a fabricated weather reading: it
 * looks authoritative and it is not true.
 *
 * The bands are the standard ones astronomers already use, so the picture
 * agrees with the observing window the rest of the app computes:
 *
 *   day            sun above the refracted horizon
 *   civil          0 to -6      still bright; only the Moon and planets show
 *   nautical      -6 to -12     horizon still visible, bright stars out
 *   astronomical -12 to -18     nearly dark, faint objects still washed
 *   night         below -18     the dark window the scoring engine uses
 */

/**
 * Sunset is when the sun's CENTRE is 0.833 deg below level: half a degree of
 * disc plus about a third of a degree of refraction lifting it back into view.
 */
export const SUN_SET_ALT_DEG = -0.833

export type DaylightPhase = 'day' | 'civil' | 'nautical' | 'astronomical' | 'night'

export function daylightPhase(sunAltDeg: number): DaylightPhase {
  if (sunAltDeg > SUN_SET_ALT_DEG) return 'day'
  if (sunAltDeg > -6) return 'civil'
  if (sunAltDeg > -12) return 'nautical'
  if (sunAltDeg > -18) return 'astronomical'
  return 'night'
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

/** Smooth 0..1 ramp, so nothing pops as the sun crosses a threshold. */
function ramp(v: number, from: number, to: number): number {
  const t = clamp01((v - from) / (to - from))
  return t * t * (3 - 2 * t)
}

/**
 * How much of the star field to show, 0 in daylight to 1 in full darkness.
 *
 * Ramped from the horizon down to -18 rather than switched at a threshold: the
 * real sky does not snap on, and a hard cut would flick the whole field into
 * existence between two frames.
 */
export function starVisibility(sunAltDeg: number): number {
  return ramp(-sunAltDeg, -SUN_SET_ALT_DEG, 18)
}

type RGB = readonly [number, number, number]

const DAY_ZENITH: RGB = [0.16, 0.38, 0.72]
const DAY_HORIZON: RGB = [0.55, 0.7, 0.88]
/** The low sun's own colour, thrown along the horizon. */
const DUSK_HORIZON: RGB = [0.75, 0.36, 0.18]
const DUSK_ZENITH: RGB = [0.1, 0.14, 0.3]
const NIGHT_ZENITH: RGB = [0.02, 0.027, 0.047]
const NIGHT_HORIZON: RGB = [0.04, 0.06, 0.1]

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/**
 * Zenith and horizon colours for the current sun altitude.
 *
 * Two stops rather than one flat colour, because the thing that reads as
 * "dusk" is the gradient: a warm band low down under a cold sky. A single
 * average colour looks like a tinted night.
 */
export function skyPalette(sunAltDeg: number): { zenith: RGB; horizon: RGB } {
  // Daylight fading into twilight as the sun approaches the horizon.
  const day = ramp(sunAltDeg, -6, 8)
  // Twilight fading into night.
  const lit = ramp(sunAltDeg, -18, -1)

  const zenith = mix(mix(NIGHT_ZENITH, DUSK_ZENITH, lit), DAY_ZENITH, day)
  const horizon = mix(mix(NIGHT_HORIZON, DUSK_HORIZON, lit), DAY_HORIZON, day)

  return {
    zenith: zenith.map(clamp01) as unknown as RGB,
    horizon: horizon.map(clamp01) as unknown as RGB,
  }
}
