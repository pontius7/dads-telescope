import { describe, it, expect } from 'vitest'
import { applyZoomNudge, clampFov, FOV_MAX, FOV_MIN } from './zoom'

/** Presses the button `n` times the way the control does: one running total. */
function press(startFov: number, perPress: number, times: number): number[] {
  let fovTarget = startFov
  let total = 0
  let counter = 0
  const seen: number[] = []
  for (let i = 0; i < times; i += 1) {
    counter += perPress
    const next = applyZoomNudge(fovTarget, total, counter)
    fovTarget = next.fovTarget
    total = next.total
    seen.push(fovTarget)
  }
  return seen
}

describe('the zoom buttons', () => {
  /**
   * The regression this file exists for. The control sends a running total,
   * and adding that total instead of the difference made every press larger
   * than the one before it — 64 to 58 to 46 to 28.
   */
  it('moves the same amount on every press', () => {
    expect(press(64, -6, 3)).toEqual([58, 52, 46])
  })

  it('moves the same amount pressing the other way', () => {
    expect(press(40, 6, 3)).toEqual([46, 52, 58])
  })

  it('returns to where it started when you undo every press', () => {
    let fovTarget = 64
    let total = 0
    for (const counter of [-6, -12, -18, -12, -6, 0]) {
      const next = applyZoomNudge(fovTarget, total, counter)
      fovTarget = next.fovTarget
      total = next.total
    }
    expect(fovTarget).toBe(64)
  })

  it('stops at the limits instead of running past them', () => {
    expect(press(24, -6, 5).at(-1)).toBe(FOV_MIN)
    expect(press(70, 6, 5).at(-1)).toBe(FOV_MAX)
  })

  it('ignores a total that has not changed', () => {
    expect(applyZoomNudge(50, -12, -12)).toEqual({ fovTarget: 50, total: -12 })
  })

  it('clamps anything handed to it', () => {
    expect(clampFov(5)).toBe(FOV_MIN)
    expect(clampFov(200)).toBe(FOV_MAX)
    expect(clampFov(42)).toBe(42)
  })
})
