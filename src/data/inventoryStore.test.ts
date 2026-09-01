import { describe, it, expect, beforeEach } from 'vitest'
import { loadInventory, setEnabled, addUserEyepiece, removeUserEyepiece, resetInventory } from './inventoryStore'
import { participates, EYEPIECES } from './inventory'

// Minimal localStorage for the node test environment.
beforeEach(() => {
  let store: Record<string, string> = {}
  globalThis.localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => void (store[k] = v),
    removeItem: (k: string) => void delete store[k],
    clear: () => void (store = {}),
    key: () => null,
    length: 0,
  } as Storage
  resetInventory()
})

describe('inventory persistence', () => {
  it('starts with every built-in item enabled', () => {
    const inv = loadInventory()
    expect(inv.eyepieces).toHaveLength(EYEPIECES.length)
    expect(inv.eyepieces.every((e) => e.enabled)).toBe(true)
    expect(inv.eyepieces.every((e) => e.verified)).toBe(true)
  })

  it('remembers that an item was switched off', () => {
    setEnabled('at-13-uwa', false)
    const inv = loadInventory()
    expect(inv.eyepieces.find((e) => e.id === 'at-13-uwa')!.enabled).toBe(false)
    expect(participates(inv.eyepieces.find((e) => e.id === 'at-13-uwa')!)).toBe(false)
    // and the rest are untouched
    expect(inv.eyepieces.filter((e) => e.enabled)).toHaveLength(EYEPIECES.length - 1)
  })

  it('switches an item back on', () => {
    setEnabled('at-13-uwa', false)
    setEnabled('at-13-uwa', true)
    expect(loadInventory().eyepieces.find((e) => e.id === 'at-13-uwa')!.enabled).toBe(true)
  })

  it('NEVER persists built-in definitions, only override keys', () => {
    // This is what stops a removed built-in resurrecting from a stale payload
    // written by an older build.
    setEnabled('at-13-uwa', false)
    const raw = localStorage.getItem('dt.inventory.v1')!
    expect(raw).toContain('at-13-uwa')
    expect(raw).not.toContain('Astro-Tech') // no brand strings
    expect(raw).not.toContain('focalMm":13') // no specs
  })

  it('drops an override for an item that no longer exists', () => {
    setEnabled('some-eyepiece-we-deleted', false)
    const inv = loadInventory()
    expect(inv.eyepieces).toHaveLength(EYEPIECES.length)
  })

  it('ignores a payload written by a different schema version', () => {
    localStorage.setItem('dt.inventory.v1', JSON.stringify({ schemaVersion: 99, disabledIds: ['at-13-uwa'] }))
    expect(loadInventory().eyepieces.every((e) => e.enabled)).toBe(true)
  })

  it('survives corrupt storage rather than crashing', () => {
    localStorage.setItem('dt.inventory.v1', 'not json at all {{{')
    expect(() => loadInventory()).not.toThrow()
    expect(loadInventory().eyepieces).toHaveLength(EYEPIECES.length)
  })
})

describe('user-added equipment', () => {
  it('is always unverified, so it never reaches a recommendation', () => {
    expect(addUserEyepiece({ brand: 'Tele Vue', model: 'Delos 10mm', focalMm: 10 })).toEqual({ ok: true })
    const added = loadInventory().eyepieces.find((e) => e.brand === 'Tele Vue')!
    expect(added.verified).toBe(false)
    expect(added.provenance).toBe('user')
    expect(participates(added)).toBe(false)
  })

  it('can be switched off and removed', () => {
    addUserEyepiece({ brand: 'Generic', model: '9mm', focalMm: 9 })
    const id = loadInventory().eyepieces.find((e) => e.brand === 'Generic')!.id
    setEnabled(id, false)
    expect(loadInventory().eyepieces.find((e) => e.id === id)!.enabled).toBe(false)
    removeUserEyepiece(id)
    expect(loadInventory().eyepieces.find((e) => e.id === id)).toBeUndefined()
  })

  it('rejects nonsense input rather than storing it', () => {
    expect(addUserEyepiece({ brand: '', model: 'x', focalMm: 10 }).ok).toBe(false)
    expect(addUserEyepiece({ brand: 'x', model: '', focalMm: 10 }).ok).toBe(false)
    expect(addUserEyepiece({ brand: 'x', model: 'y', focalMm: 0 }).ok).toBe(false)
    expect(addUserEyepiece({ brand: 'x', model: 'y', focalMm: -5 }).ok).toBe(false)
    expect(addUserEyepiece({ brand: 'x', model: 'y', focalMm: 500 }).ok).toBe(false)
    expect(addUserEyepiece({ brand: 'x', model: 'y', focalMm: NaN }).ok).toBe(false)
  })

  it('refuses duplicates', () => {
    addUserEyepiece({ brand: 'Tele Vue', model: '7mm', focalMm: 7 })
    expect(addUserEyepiece({ brand: 'Tele Vue', model: '7mm', focalMm: 7 }).ok).toBe(false)
  })
})

describe('the banned eyepiece cannot get in by any route', () => {
  it('is refused when added through the form', () => {
    const r = addUserEyepiece({ brand: 'Explore Scientific', model: '8.5mm 82°', focalMm: 8.5 })
    expect(r.ok).toBe(false)
    expect(loadInventory().eyepieces.some((e) => /explore scientific/i.test(e.brand))).toBe(false)
  })

  it('is stripped when it appears in a stale stored payload', () => {
    // Simulates a device that ran an older build in which it was listed.
    localStorage.setItem(
      'dt.inventory.v1',
      JSON.stringify({
        schemaVersion: 1,
        disabledIds: [],
        userEyepieces: [{
          id: 'user-explore-scientific-8-5mm', brand: 'Explore Scientific', model: '8.5mm 82°',
          focalMm: 8.5, afovDeg: 82, barrelMm: 31.75, enabled: true,
        }],
      }),
    )
    const inv = loadInventory()
    expect(inv.eyepieces.some((e) => /explore scientific/i.test(e.brand))).toBe(false)
  })
})
