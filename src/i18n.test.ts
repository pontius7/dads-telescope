import { describe, it, expect, beforeEach } from 'vitest'
import { t, renderNote, setLang, getLang, LANGUAGES, __dicts, __dictText } from './i18n'

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
  setLang('en')
})

const enKeys = Object.keys(__dicts.en)
const meKeys = Object.keys(__dicts.me)

describe('translation completeness', () => {
  it('every English key has a Montenegrin translation', () => {
    const missing = enKeys.filter((k) => !meKeys.includes(k))
    expect(missing).toEqual([])
  })

  it('has no Montenegrin key that English does not have', () => {
    const extra = meKeys.filter((k) => !enKeys.includes(k))
    expect(extra).toEqual([])
  })

  it('covers a meaningful number of strings', () => {
    expect(enKeys.length).toBeGreaterThan(80)
  })
})

describe('Montenegrin is ijekavian latinica, not Serbian ekavian', () => {
  const meText = __dictText('me')

  it('uses latinica only — no cyrillic anywhere', () => {
    expect(/[Ѐ-ӿ]/.test(meText)).toBe(false)
  })

  it('uses ijekavian forms', () => {
    // These appear in the translated strings and are the clearest markers.
    for (const w of ['vrijeme', 'svjetlost', 'vidjeti', 'Mjesec']) {
      expect(meText.toLowerCase()).toContain(w.toLowerCase())
    }
  })

  it('avoids the ekavian spellings of those same words', () => {
    // Word-boundary matched so "vremenu" inside a longer ijekavian word does
    // not produce a false positive.
    for (const bad of [/\bvreme\b/i, /\bsvetlost\b/i, /\bvideti\b/i, /\bMesec\b/]) {
      expect(bad.test(meText)).toBe(false)
    }
  })
})

describe('t()', () => {
  it('returns English by default', () => {
    expect(t('detail.best')).toBe('Best')
  })

  it('switches language and persists the choice', () => {
    setLang('me')
    expect(getLang()).toBe('me')
    expect(t('detail.best')).toBe('Najbolje')
    expect(localStorage.getItem('dt.lang')).toBe('me')
  })

  it('interpolates counts', () => {
    expect(t('detail.minutes', 90)).toContain('90')
    setLang('me')
    expect(t('detail.minutes', 90)).toContain('90')
  })

  it('never returns a raw key', () => {
    for (const lang of LANGUAGES) {
      setLang(lang.code)
      for (const k of enKeys) {
        const v = t(k as never, 1 as never)
        expect(typeof v).toBe('string')
        expect(v).not.toBe(k)
        expect(v.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('renderNote — the domain stays language-agnostic', () => {
  const note = {
    key: 'note.optics',
    params: { mag: 92, exitPupil: '2.2', field: '53' },
  }

  it('renders a domain note in English', () => {
    const s = renderNote(note)
    expect(s).toContain('92')
    expect(s).toContain('2.2')
    expect(s).toMatch(/exit pupil/i)
  })

  it('renders the same note in Montenegrin', () => {
    setLang('me')
    const s = renderNote(note)
    expect(s).toContain('92')
    expect(s).toContain('2.2')
    expect(s).toMatch(/izlaznu zjenicu/i)
  })

  it('translates the filter denial reasons', () => {
    setLang('me')
    expect(renderNote({ key: 'deny.galaxy' })).toMatch(/galaksije/i)
    expect(renderNote({ key: 'deny.reflectionNebula' })).toMatch(/refleksione/i)
  })
})
