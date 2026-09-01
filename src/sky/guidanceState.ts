/**
 * The handoff between the render loop and the instruction on screen.
 *
 * The 3D scene knows where the phone is looking sixty times a second; the text
 * that says "LEFT 40 · UP 12" lives in the DOM outside the canvas. Pushing
 * that through React state would re-render the whole app on every frame for a
 * number that changes by a fraction of a degree, so the loop writes here and
 * the overlay reads here on its own animation frame.
 *
 * This is a scratchpad for one live gesture, not application state. Nothing is
 * persisted, nothing is derived from it, and it is meaningless the moment
 * pointing stops.
 */
import type { HeadingQuality } from '../domain/pointing'

export type GuidancePhase =
  /** Not pointing, or nothing chosen: sweep and see what you find. */
  | 'searching'
  /** Chosen but off screen: follow the trail. */
  | 'guiding'
  /** On screen, not yet centred: close the last few degrees. */
  | 'closing'
  /** Inside the Telrad's inner ring. Put your eye to the eyepiece. */
  | 'locked'

export interface GuidanceState {
  phase: GuidancePhase
  targetName: string | null
  /** Positive swings the tube clockwise; negative is a turn to the left. */
  turnRightDeg: number
  /** Positive raises the tube. */
  turnUpDeg: number
  separationDeg: number
  quality: HeadingQuality
  /** Where the phone is actually looking, for the heading readout. */
  altDeg: number
  azDeg: number
  /** Bumped every time the loop writes, so the overlay can skip dead frames. */
  revision: number
}

export const guidance: GuidanceState = {
  phase: 'searching',
  targetName: null,
  turnRightDeg: 0,
  turnUpDeg: 0,
  separationDeg: 0,
  quality: 'unknown',
  altDeg: 0,
  azDeg: 0,
  revision: 0,
}

export function resetGuidance(): void {
  guidance.phase = 'searching'
  guidance.targetName = null
  guidance.turnRightDeg = 0
  guidance.turnUpDeg = 0
  guidance.separationDeg = 0
  guidance.quality = 'unknown'
  guidance.revision += 1
}

/** The Telrad's real rings, in degrees of radius. */
export const TELRAD_RINGS = [0.5, 2, 4] as const

/** Inside the inner ring the object is already in the finder. */
export const LOCK_DEG = TELRAD_RINGS[0]
