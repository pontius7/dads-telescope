import { describe, it, expect } from 'vitest'
import { Body } from 'astronomy-engine'
import { recommend, describeSetup, FILL_RATIO, DEFAULT_RECOMMEND_PREFS } from './equipment'
import type { Target, TargetKind } from './targets'
import {
  DEFAULT_INVENTORY,
  EYEPIECES,
  createUserEyepiece,
  isForbidden,
  participates,
  type Inventory,
} from '../data/inventory'

function dso(kind: TargetKind, over: Partial<Extract<Target, { type: 'deep-sky' }>> = {}): Target {
  return {
    type: 'deep-sky', id: 'x', name: 'X', catalogId: 'NGC0000', commonName: null, kind,
    raHoursJ2000: 16.7, decDegJ2000: 36.5, magnitude: 8, majorAxisArcmin: 10,
    minorAxisArcmin: 10, surfaceBrightness: 12, constellation: 'Her', popularity: 0.5,
    ...over,
  }
}

const M13 = dso('globular', { id: 'm13', name: 'M13', magnitude: 5.8, majorAxisArcmin: 16.5 })
const M42 = dso('emission-nebula', { id: 'm42', name: 'M42', magnitude: 4, majorAxisArcmin: 85 })
const M57 = dso('planetary-nebula', { id: 'm57', name: 'M57', magnitude: 8.8, majorAxisArcmin: 1.4 })
const M31 = dso('galaxy', { id: 'm31', name: 'M31', magnitude: 3.4, majorAxisArcmin: 190 })
const M45 = dso('open-cluster', { id: 'm45', name: 'M45', magnitude: 1.6, majorAxisArcmin: 110 })
const M78 = dso('reflection-nebula', { id: 'm78', name: 'M78', magnitude: 8.3, majorAxisArcmin: 8 })

const SATURN: Target = {
  type: 'solar-system', id: 'saturn', name: 'Saturn', kind: 'planet', body: Body.Saturn, popularity: 1,
}
const MOON: Target = {
  type: 'solar-system', id: 'moon', name: 'Moon', kind: 'moon', body: Body.Moon, popularity: 1,
}

const ALL_TARGETS = [M13, M42, M57, M31, M45, M78, SATURN, MOON]
const DARK = { moonBright: false, suburbanSky: false }
const BRIGHT = { moonBright: true, suburbanSky: true }

// ===========================================================================
// GUARANTEE 1
// ===========================================================================
describe('GUARANTEE 1: the Explore Scientific 8.5 mm never appears', () => {
  const BANNED = /explore\s*scientific/i

  it('the built-in catalogue is exactly the six owned eyepieces', () => {
    expect(EYEPIECES.map((e) => `${e.brand} ${e.model}`)).toEqual([
      'Astro-Tech 28 mm UWA 82°',
      'Astro-Tech 13 mm UWA 82°',
      'Baader Hyperion Zoom Mark IV 8-24 mm',
      'Celestron E-Lux 40 mm',
      'Celestron 25 mm Omni Plössl',
      'SVBONY 7-21 mm Zoom',
    ])
    expect(EYEPIECES).toHaveLength(6)
  })

  it('no built-in eyepiece is an 8.5 mm', () => {
    for (const e of EYEPIECES) {
      if (e.focal.kind === 'fixed') expect(e.focal.focalMm).not.toBe(8.5)
      expect(BANNED.test(e.brand)).toBe(false)
    }
  })

  it('recognises the banned item even if something tries to inject it', () => {
    expect(isForbidden({ brand: 'Explore Scientific', model: '8.5mm 82°' })).toBe(true)
    expect(isForbidden({ brand: 'explore scientific', model: '8.5 mm' })).toBe(true)
    expect(isForbidden({ brand: 'Astro-Tech', model: '13 mm UWA 82°' })).toBe(false)
  })

  it('an injected banned eyepiece never participates', () => {
    const poisoned = createUserEyepiece({ brand: 'Explore Scientific', model: '8.5mm 82°', focalMm: 8.5 })
    // Even if a stale payload marks it verified and enabled:
    const forced = { ...poisoned, verified: true, enabled: true }
    expect(participates(forced)).toBe(false)
  })

  it('never emits it across the whole target matrix', () => {
    const poisoned = { ...createUserEyepiece({ brand: 'Explore Scientific', model: '8.5mm', focalMm: 8.5 }), verified: true }
    const inv: Inventory = { ...DEFAULT_INVENTORY, eyepieces: [...EYEPIECES, poisoned] }
    for (const target of ALL_TARGETS) {
      for (const conditions of [DARK, BRIGHT]) {
        const r = recommend({ target, inventory: inv, conditions })
        for (const rec of [r.primary, ...r.alternatives].filter(Boolean)) {
          expect(BANNED.test(rec!.eyepiece.brand)).toBe(false)
          expect(describeSetup(rec!)).not.toMatch(BANNED)
        }
      }
    }
  })
})

// ===========================================================================
// GUARANTEE 2
// ===========================================================================
describe('GUARANTEE 2: unverified or disabled gear never participates', () => {
  it('user-added gear defaults to unverified', () => {
    const ep = createUserEyepiece({ brand: 'Tele Vue', model: '7 mm', focalMm: 7 })
    expect(ep.verified).toBe(false)
    expect(ep.provenance).toBe('user')
    expect(participates(ep)).toBe(false)
  })

  it('an unverified eyepiece is never recommended, even when it would fit best', () => {
    // A 9 mm would be an excellent globular-cluster choice at 133x. It must
    // still be excluded, because we cannot trust its specs.
    const unverified = createUserEyepiece({ brand: 'Generic', model: '9 mm', focalMm: 9 })
    const inv: Inventory = { ...DEFAULT_INVENTORY, eyepieces: [...EYEPIECES, unverified] }
    for (const target of ALL_TARGETS) {
      const r = recommend({ target, inventory: inv, conditions: DARK })
      for (const rec of [r.primary, ...r.alternatives].filter(Boolean)) {
        expect(rec!.eyepiece.verified).toBe(true)
        expect(rec!.eyepiece.enabled).toBe(true)
        expect(rec!.barlow?.verified ?? true).toBe(true)
        expect(rec!.filter?.verified ?? true).toBe(true)
      }
    }
  })

  it('a disabled eyepiece is never recommended', () => {
    const inv: Inventory = {
      ...DEFAULT_INVENTORY,
      eyepieces: EYEPIECES.map((e) => (e.id === 'at-13-uwa' ? { ...e, enabled: false } : e)),
    }
    for (const target of ALL_TARGETS) {
      const r = recommend({ target, inventory: inv, conditions: DARK })
      for (const rec of [r.primary, ...r.alternatives].filter(Boolean)) {
        expect(rec!.eyepiece.id).not.toBe('at-13-uwa')
      }
    }
  })

  it('returns null rather than reaching for unverified gear when nothing is verified', () => {
    const inv: Inventory = {
      ...DEFAULT_INVENTORY,
      eyepieces: EYEPIECES.map((e) => ({ ...e, enabled: false })),
    }
    const r = recommend({ target: M13, inventory: inv, conditions: DARK })
    expect(r.primary).toBeNull()
    expect(r.alternatives).toHaveLength(0)
  })
})

// ===========================================================================
// GUARANTEE 3
// ===========================================================================
describe('GUARANTEE 3: UHC is never applied indiscriminately', () => {
  const uhcUsed = (t: Target, conditions = BRIGHT) => {
    const r = recommend({ target: t, inventory: DEFAULT_INVENTORY, conditions })
    return [r.primary, ...r.alternatives]
      .filter(Boolean)
      .some((rec) => rec!.filter?.filterClass === 'narrowband-uhc')
  }

  it.each([
    ['M31 (galaxy)', M31],
    ['M13 (globular cluster)', M13],
    ['M45 (open cluster)', M45],
    ['M78 (reflection nebula)', M78],
    ['Saturn (planet)', SATURN],
    ['the Moon', MOON],
  ])('never suggests a UHC for %s', (_name, target) => {
    expect(uhcUsed(target)).toBe(false)
  })

  it('explains WHY a galaxy gets no UHC, rather than silently omitting it', () => {
    const r = recommend({ target: M31, inventory: DEFAULT_INVENTORY, conditions: BRIGHT })
    expect(r.primary!.reasoning.map((n) => n.key)).toContain('deny.galaxy')
  })

  it('gets the reflection-nebula case right — the one most often confused', () => {
    const r = recommend({ target: M78, inventory: DEFAULT_INVENTORY, conditions: BRIGHT })
    expect(r.primary!.filter).toBeNull()
    expect(r.primary!.reasoning.map((n) => n.key)).toContain('deny.reflectionNebula')
  })

  it('DOES suggest a UHC for an emission nebula under a bright sky', () => {
    expect(uhcUsed(M42, BRIGHT)).toBe(true)
  })

  it('does NOT suggest a UHC for the same nebula under a dark, moonless sky', () => {
    expect(uhcUsed(M42, DARK)).toBe(false)
    const r = recommend({ target: M42, inventory: DEFAULT_INVENTORY, conditions: DARK })
    expect(r.primary!.reasoning.map((n) => n.key)).toContain('note.noFilterNeeded')
  })

  it('colour filters are off by default, even for planets', () => {
    const r = recommend({ target: SATURN, inventory: DEFAULT_INVENTORY, conditions: DARK })
    expect(r.primary!.filter).toBeNull()
  })

  it('colour filters never land on a deep-sky object even when opted in', () => {
    const prefs = { ...DEFAULT_RECOMMEND_PREFS, allowColourFilters: true }
    for (const t of [M13, M42, M57, M31, M45, M78]) {
      const r = recommend({ target: t, inventory: DEFAULT_INVENTORY, conditions: DARK, prefs })
      for (const rec of [r.primary, ...r.alternatives].filter(Boolean)) {
        expect(rec!.filter?.filterClass).not.toBe('colour')
      }
    }
  })
})

// ===========================================================================
// Mechanical and optical correctness
// ===========================================================================
describe('mechanical constraints', () => {
  it('never Barlows a 2-inch eyepiece — both Barlows are 1.25 inch', () => {
    for (const target of ALL_TARGETS) {
      const r = recommend({ target, inventory: DEFAULT_INVENTORY, conditions: DARK })
      for (const rec of [r.primary, ...r.alternatives].filter(Boolean)) {
        if (rec!.barlow) expect(rec!.eyepiece.barrelMm).toBeLessThanOrEqual(rec!.barlow.barrelMm)
      }
    }
  })

  it('records WHY the 2-inch eyepieces were rejected with a Barlow', () => {
    const r = recommend({ target: M13, inventory: DEFAULT_INVENTORY, conditions: DARK })
    const notes = r.rejected.filter((n) => n.eyepieceId === 'at-28-uwa' && n.barlowId !== null)
    expect(notes.length).toBeGreaterThan(0)
    expect(notes[0]!.reason).toMatch(/1\.25"/)
  })

  it('never recommends an exit pupil below 0.5 mm', () => {
    for (const target of ALL_TARGETS) {
      const r = recommend({ target, inventory: DEFAULT_INVENTORY, conditions: DARK })
      for (const rec of [r.primary, ...r.alternatives].filter(Boolean)) {
        expect(rec!.exitPupilMm).toBeGreaterThanOrEqual(0.5)
      }
    }
  })

  it('never exceeds what the assumed seeing supports', () => {
    for (const target of ALL_TARGETS) {
      const r = recommend({ target, inventory: DEFAULT_INVENTORY, conditions: DARK })
      for (const rec of [r.primary, ...r.alternatives].filter(Boolean)) {
        expect(rec!.magnification).toBeLessThanOrEqual(200) // 'average' tier
      }
    }
  })

  it('snaps the click-stop zoom to a settable position', () => {
    for (const target of ALL_TARGETS) {
      const r = recommend({ target, inventory: DEFAULT_INVENTORY, conditions: DARK })
      for (const rec of [r.primary, ...r.alternatives].filter(Boolean)) {
        if (rec!.eyepiece.id === 'baader-hyperion-zoom-mk4') {
          expect([8, 12, 16, 20, 24]).toContain(rec!.eyepieceFocalMm)
        }
      }
    }
  })

  it('keeps the object in the field long enough to be worth finding', () => {
    for (const target of ALL_TARGETS) {
      const r = recommend({ target, inventory: DEFAULT_INVENTORY, conditions: DARK })
      for (const rec of [r.primary, ...r.alternatives].filter(Boolean)) {
        expect(rec!.driftHalfFieldSec).toBeGreaterThanOrEqual(45)
      }
    }
  })
})

describe('framing and honesty', () => {
  it('warns rather than lies when an object is larger than any available field', () => {
    // M31 spans 190'; the widest field this kit produces is about 115'.
    const r = recommend({ target: M31, inventory: DEFAULT_INVENTORY, conditions: DARK })
    expect(r.primary!.warnings.map((n) => n.key)).toContain('warn.largerThanField')
  })

  it('flags the 40 mm eyepiece losing aperture to a 6 mm eye pupil', () => {
    // The E-Lux 40 mm gives a 6.77 mm exit pupil — wider than a dark-adapted
    // adult pupil, so some of the 203 mm is thrown away.
    const inv: Inventory = { ...DEFAULT_INVENTORY, eyepieces: EYEPIECES.filter((e) => e.id === 'celestron-elux-40') }
    const r = recommend({ target: M45, inventory: inv, conditions: DARK })
    expect(r.primary!.effectiveApertureMm).toBeLessThan(203)
    expect(r.primary!.warnings.map((n) => n.key)).toContain('warn.exitPupilExceedsEye')
  })

  it('picks a high-power combination for a tiny planetary nebula', () => {
    const r = recommend({ target: M57, inventory: DEFAULT_INVENTORY, conditions: DARK })
    expect(r.primary!.magnification).toBeGreaterThan(100)
  })

  it('picks a low-power wide field for a big open cluster', () => {
    const r = recommend({ target: M45, inventory: DEFAULT_INVENTORY, conditions: DARK })
    expect(r.primary!.magnification).toBeLessThan(60)
  })

  it('offers at most two alternatives and they differ structurally', () => {
    const r = recommend({ target: M13, inventory: DEFAULT_INVENTORY, conditions: DARK })
    expect(r.alternatives.length).toBeLessThanOrEqual(2)
    for (const alt of r.alternatives) {
      const ratio = alt.magnification / r.primary!.magnification
      expect(ratio < 0.6 || ratio > 1.6).toBe(true)
    }
  })

  it('produces an instruction a person can actually follow', () => {
    const r = recommend({ target: M13, inventory: DEFAULT_INVENTORY, conditions: DARK })
    const s = describeSetup(r.primary!)
    expect(s.length).toBeGreaterThan(5)
    expect(s).not.toMatch(/undefined|NaN/)
  })

  it('is deterministic', () => {
    const a = recommend({ target: M13, inventory: DEFAULT_INVENTORY, conditions: DARK })
    const b = recommend({ target: M13, inventory: DEFAULT_INVENTORY, conditions: DARK })
    expect(describeSetup(a.primary!)).toBe(describeSetup(b.primary!))
    expect(a.primary!.magnification).toBe(b.primary!.magnification)
  })

  it('every recommendation carries evidence', () => {
    for (const target of ALL_TARGETS) {
      const r = recommend({ target, inventory: DEFAULT_INVENTORY, conditions: DARK })
      for (const rec of [r.primary, ...r.alternatives].filter(Boolean)) {
        expect(rec!.evidence.length).toBeGreaterThan(0)
      }
    }
  })

  it('FILL_RATIO is the documented 2.5', () => {
    expect(FILL_RATIO).toBe(2.5)
  })
})
