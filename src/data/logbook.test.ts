import { describe, it, expect, beforeEach } from 'vitest'
import { addLogEntry, loadLog, nightsObserved, removeLogEntry, updateLogNote } from './logbook'

/** The module talks to localStorage; give it one that behaves. */
function fakeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage
}

const base = {
  targetId: 'm13',
  targetName: 'Hercules Globular Cluster',
  saw: 'yes' as const,
  note: '',
  eyepiece: 'Astro-Tech 13 mm UWA 82°',
  magnification: 92,
  altitudeDeg: 64,
  cloudCoverPct: 12,
  moonIlluminatedPct: 4,
}

beforeEach(() => {
  globalThis.localStorage = fakeStorage()
})

describe('the logbook', () => {
  it('starts empty', () => {
    expect(loadLog()).toEqual([])
  })

  it('keeps the context the app already knew', () => {
    const [entry] = addLogEntry({ ...base, at: '2026-09-02T02:10:00Z' })
    expect(entry!.eyepiece).toBe('Astro-Tech 13 mm UWA 82°')
    expect(entry!.magnification).toBe(92)
    expect(entry!.altitudeDeg).toBe(64)
    expect(entry!.saw).toBe('yes')
  })

  it('reads back newest first', () => {
    addLogEntry({ ...base, at: '2026-09-01T02:00:00Z', targetId: 'older' })
    addLogEntry({ ...base, at: '2026-09-03T02:00:00Z', targetId: 'newer' })
    expect(loadLog().map((e) => e.targetId)).toEqual(['newer', 'older'])
  })

  it('records that something was NOT seen, which is worth as much', () => {
    const [entry] = addLogEntry({ ...base, at: '2026-09-02T02:00:00Z', saw: 'no' })
    expect(entry!.saw).toBe('no')
  })

  /**
   * The app never measures seeing or transparency, and a night with no
   * forecast has no cloud figure. Storing null keeps an entry honest instead
   * of implying a clear sky nobody recorded.
   */
  it('stores a missing cloud reading as missing, not as zero', () => {
    const [entry] = addLogEntry({ ...base, at: '2026-09-02T02:00:00Z', cloudCoverPct: null })
    expect(entry!.cloudCoverPct).toBeNull()
  })

  it('lets a note be added after the fact, at the eyepiece or later', () => {
    const [made] = addLogEntry({ ...base, at: '2026-09-02T02:00:00Z' })
    const after = updateLogNote(made!.id, 'Resolved to the core at 92x.')
    expect(after[0]!.note).toBe('Resolved to the core at 92x.')
  })

  it('removes an entry', () => {
    const [made] = addLogEntry({ ...base, at: '2026-09-02T02:00:00Z' })
    expect(removeLogEntry(made!.id)).toEqual([])
  })

  it('gives every entry its own id', () => {
    addLogEntry({ ...base, at: '2026-09-02T02:00:00Z' })
    const all = addLogEntry({ ...base, at: '2026-09-02T02:00:00Z' })
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length)
  })

  describe('nights observed', () => {
    it('counts one night, not two, when the session runs past midnight', () => {
      const entries = [
        { ...base, id: 'a', at: '2026-09-02T01:00:00Z' }, // 9pm local, 1 Sep
        { ...base, id: 'b', at: '2026-09-02T05:30:00Z' }, // 1:30am local, still that night
      ]
      expect(nightsObserved(entries)).toBe(1)
    })

    it('counts separate nights separately', () => {
      const entries = [
        { ...base, id: 'a', at: '2026-09-02T02:00:00Z' },
        { ...base, id: 'b', at: '2026-09-05T02:00:00Z' },
      ]
      expect(nightsObserved(entries)).toBe(2)
    })

    it('is zero for an empty log', () => {
      expect(nightsObserved([])).toBe(0)
    })
  })
})
