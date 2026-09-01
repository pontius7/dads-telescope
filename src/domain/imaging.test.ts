import { describe, it, expect } from 'vitest'
import { Body } from 'astronomy-engine'
import { planImaging } from './imaging'
import { DEFAULT_INVENTORY } from '../data/inventory'
import type { Target } from './targets'

const MOON: Target = { type: 'solar-system', id: 'moon', name: 'Moon', kind: 'moon', body: Body.Moon, popularity: 1 }
const JUPITER: Target = { type: 'solar-system', id: 'jupiter', name: 'Jupiter', kind: 'planet', body: Body.Jupiter, popularity: 1 }
const SATURN: Target = { type: 'solar-system', id: 'saturn', name: 'Saturn', kind: 'planet', body: Body.Saturn, popularity: 1 }

function dso(kind: Extract<Target, { type: 'deep-sky' }>['kind'], id: string): Target {
  return {
    type: 'deep-sky', id, name: id.toUpperCase(), catalogId: 'NGC0000', commonName: null,
    kind, raHoursJ2000: 16.7, decDegJ2000: 36.5, magnitude: 8, majorAxisArcmin: 10,
    minorAxisArcmin: 10, surfaceBrightness: 12, constellation: 'Her', popularity: 0.5,
  }
}

const inv = DEFAULT_INVENTORY

describe('imaging with the NexImage 10', () => {
  it('never claims a galaxy is suited to this camera', () => {
    const p = planImaging({ target: dso('galaxy', 'm31'), inventory: inv })
    expect(p.suitable).toBe(false)
    expect(p.reason).toMatch(/exposures of minutes/i)
  })

  it('explains that the undriven mount is part of the problem, not just the camera', () => {
    // Blaming only the camera would imply a different camera fixes it. It does
    // not: the mount cannot track.
    const p = planImaging({ target: dso('emission-nebula', 'm42'), inventory: inv })
    expect(p.suitable).toBe(false)
    expect(`${p.reason} ${p.notes.join(' ')}`).toMatch(/undriven|mount/i)
  })

  it.each([
    ['galaxy', 'm51'],
    ['emission-nebula', 'm8'],
    ['planetary-nebula', 'm57'],
    ['globular', 'm13'],
    ['open-cluster', 'm45'],
  ] as const)('rejects %s', (kind, id) => {
    expect(planImaging({ target: dso(kind, id), inventory: inv }).suitable).toBe(false)
  })

  it.each([
    ['the Moon', MOON],
    ['Jupiter', JUPITER],
    ['Saturn', SATURN],
  ])('accepts %s', (_n, target) => {
    expect(planImaging({ target, inventory: inv }).suitable).toBe(true)
  })

  it('lands the focal ratio in the lucky-imaging band', () => {
    for (const target of [MOON, JUPITER, SATURN]) {
      const p = planImaging({ target, inventory: inv })
      expect(p.effectiveFocalRatio).toBeGreaterThanOrEqual(10)
      expect(p.effectiveFocalRatio).toBeLessThanOrEqual(20)
    }
  })

  it('reaches the band with a Barlow, since native f/5.9 is too fast', () => {
    // 1200 mm / 203 mm = f/5.91 natively, well below the f/10 floor, so a
    // Barlow is required rather than optional.
    const p = planImaging({ target: JUPITER, inventory: inv })
    expect(p.barlow).not.toBeNull()
    expect(p.effectiveFocalLengthMm).toBeGreaterThan(1200)
  })

  it('prefers the gentler Barlow when both reach the band', () => {
    // Omni 2x -> f/11.8; Baader 2.25x -> f/13.3. Both are in band, so the
    // gentler one wins: fewer elements, brighter image, shorter frames.
    const p = planImaging({ target: SATURN, inventory: inv })
    expect(p.barlow!.factor).toBe(2)
  })

  it('only ever uses verified, enabled gear', () => {
    const noBarlows = { ...inv, barlows: inv.barlows.map((b) => ({ ...b, enabled: false })) }
    const p = planImaging({ target: JUPITER, inventory: noBarlows })
    expect(p.barlow).toBeNull()
    // and it says the scale is wrong rather than pretending it is fine
    expect(p.notes.join(' ')).toMatch(/undersample/i)
  })

  it('gives Moon-specific advice about mosaicking', () => {
    expect(planImaging({ target: MOON, inventory: inv }).notes.join(' ')).toMatch(/mosaic/i)
  })

  it('carries evidence on every plan', () => {
    for (const target of [MOON, JUPITER, dso('galaxy', 'm31')]) {
      expect(planImaging({ target, inventory: inv }).evidence.length).toBeGreaterThan(0)
    }
  })
})
