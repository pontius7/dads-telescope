/**
 * The limits the field of view is held inside.
 *
 * The zoom buttons that used to live here are gone — pinch and wheel already
 * did the job, and two more rectangles over the sky bought nothing. What
 * remains is the clamp, which every path that changes zoom still goes through.
 */

/** The field of view the camera is allowed to reach, in degrees. */
export const FOV_MIN = 18
export const FOV_MAX = 78

export function clampFov(fov: number): number {
  return Math.min(FOV_MAX, Math.max(FOV_MIN, fov))
}
