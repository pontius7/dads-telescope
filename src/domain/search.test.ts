import { describe, it, expect } from 'vitest'
import { fold, search, type Searchable } from './search'

const ITEMS: Searchable[] = [
  {
    kind: 'target', id: 'm31', title: 'Andromeda Galaxy', subtitle: 'M31 · Galaxy',
    terms: ['Andromeda Galaxy', 'M31', 'NGC224', 'galaxy', 'And'], weight: 1,
  },
  {
    kind: 'constellation', id: 'And', title: 'Andromeda', subtitle: 'Constellation',
    terms: ['Andromeda'], weight: 0.4,
  },
  {
    kind: 'target', id: 'm57', title: 'Ring Nebula', subtitle: 'M57 · Planetary nebula',
    terms: ['Ring Nebula', 'M57', 'NGC6720', 'planetary nebula', 'Lyr'], weight: 0.9,
  },
  {
    kind: 'target', id: 'm13', title: 'Hercules Globular Cluster', subtitle: 'M13 · Globular',
    terms: ['Hercules Globular Cluster', 'M13', 'globular', 'Her'], weight: 0.95,
  },
  {
    kind: 'constellation', id: 'Boo', title: 'Boötes', subtitle: 'Constellation',
    terms: ['Boötes'], weight: 0.3,
  },
  { kind: 'page', id: 'equipment', title: 'Equipment', subtitle: 'Screen', terms: ['Equipment'] },
]

const ids = (q: string) => search(q, ITEMS).map((h) => h.id)

describe('search', () => {
  it('finds nothing for an empty query rather than everything', () => {
    expect(search('', ITEMS)).toEqual([])
    expect(search('   ', ITEMS)).toEqual([])
  })

  it('finds an object by its catalogue number, which is what atlases print', () => {
    expect(ids('m57')[0]).toBe('m57')
    expect(ids('ngc6720')[0]).toBe('m57')
  })

  it('finds an object by its common name', () => {
    expect(ids('ring')[0]).toBe('m57')
  })

  it('searches objects, constellations and screens from one box', () => {
    expect(ids('equipment')).toContain('equipment')
    expect(ids('andromeda')).toEqual(expect.arrayContaining(['m31', 'And']))
  })

  /** Someone typing "andromeda" more often wants the galaxy than the region. */
  it('puts an exact title above a partial one', () => {
    expect(ids('andromeda')[0]).toBe('And')
    expect(ids('andromeda galaxy')[0]).toBe('m31')
  })

  it('reaches accented names from an unaccented keyboard', () => {
    expect(ids('bootes')).toContain('Boo')
    expect(fold('Boötes')).toBe('bootes')
  })

  it('is case-insensitive', () => {
    expect(ids('RING')[0]).toBe('m57')
  })

  it('matches the start of a word inside a name', () => {
    expect(ids('globular')).toContain('m13')
  })

  it('ranks a whole-word match above one buried mid-word', () => {
    const items: Searchable[] = [
      { kind: 'page', id: 'buried', title: 'x', subtitle: '', terms: ['unringed'] },
      { kind: 'page', id: 'word', title: 'y', subtitle: '', terms: ['ring finder'] },
    ]
    expect(search('ring', items).map((h) => h.id)).toEqual(['word', 'buried'])
  })

  it('lets fame break a tie but never beat a better match', () => {
    // "m13" matches M13 exactly; nothing famous should displace it.
    expect(ids('m13')[0]).toBe('m13')
  })

  it('honours the limit', () => {
    expect(search('a', ITEMS, 2).length).toBeLessThanOrEqual(2)
  })

  it('never invents a hit for text that appears nowhere', () => {
    expect(ids('zzzquux')).toEqual([])
  })
})
