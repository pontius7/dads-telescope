import { describe, it, expect } from 'vitest'
import { clampFov, FOV_MAX, FOV_MIN } from './zoom'

describe('the field of view clamp', () => {
  it('holds the view inside its limits', () => {
    expect(clampFov(5)).toBe(FOV_MIN)
    expect(clampFov(200)).toBe(FOV_MAX)
    expect(clampFov(42)).toBe(42)
  })

  it('leaves the limits themselves alone', () => {
    expect(clampFov(FOV_MIN)).toBe(FOV_MIN)
    expect(clampFov(FOV_MAX)).toBe(FOV_MAX)
  })
})
