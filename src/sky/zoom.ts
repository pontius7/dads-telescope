/**
 * The zoom buttons, as arithmetic.
 *
 * The control sends a RUNNING TOTAL, not a step — every press adds to a
 * counter that only goes up or down. Treating that total as though it were the
 * step made each press bigger than the last: from 64 degrees, three presses
 * went to 58, then 46, then 28, accelerating away from the sky you were
 * looking at. Taking the difference since the last press makes every press the
 * same size, which is the only thing a zoom button has to promise.
 */

/** The field of view the camera is allowed to reach, in degrees. */
export const FOV_MIN = 18
export const FOV_MAX = 78

export function clampFov(fov: number): number {
  return Math.min(FOV_MAX, Math.max(FOV_MIN, fov))
}

/**
 * Where the zoom should head after the button total changed.
 * Returns the new target and the total to remember for next time.
 */
export function applyZoomNudge(
  fovTarget: number,
  previousTotal: number,
  nextTotal: number,
): { fovTarget: number; total: number } {
  const step = nextTotal - previousTotal
  return { fovTarget: clampFov(fovTarget + step), total: nextTotal }
}
