/**
 * Translation plumbing, built now so Montenegrin is a data drop later rather
 * than a refactor. Every user-facing string goes through t().
 *
 * Crnogorski will use LATINICA and ijekavian forms — natural Montenegrin, not
 * machine-translated Serbian ekavian. It is deliberately NOT stubbed with
 * machine output here: a wrong translation shipped as real is worse than an
 * absent one, so the language only appears once a human-checked file exists.
 */
export type Lang = 'en' | 'me'

export const LANGUAGES: { code: Lang; label: string; flag: string; available: boolean }[] = [
  { code: 'en', label: 'English', flag: '🇺🇸', available: true },
  { code: 'me', label: 'Crnogorski', flag: '🇲🇪', available: false },
]

const en = {
  'app.title': "Dad's Telescope",
  'hot.title': "What's hot tonight",
  'hot.seeAll': 'See all available',
  'hot.notTonight': (n: number) => `${n} popular targets unavailable tonight`,
  'notTonight.title': 'Not tonight',
  'back.toSky': '↑ Back to sky',
  'detail.best': 'Best',
  'detail.look': 'Look',
  'detail.use': 'Use',
  'detail.filter': 'Filter',
  'detail.expect': 'Expect',
  'detail.noFilter': 'None',
  'detail.score': 'Observability score',
  'weather.unavailable': 'Weather unavailable',
  'confidence.high': 'High confidence',
  'confidence.medium': 'Medium confidence',
  'confidence.low': 'Low confidence',
  'menu.liveSky': 'Live sky',
  'menu.equipment': 'Equipment',
  'menu.location': 'Location',
  'menu.language': 'Language',
  'menu.sources': 'About & sources',
  'equipment.verified': 'Verified',
  'equipment.unverified': 'Unverified',
  'equipment.unverifiedNote':
    'Unverified equipment is never used in recommendations. Its specifications have not been confirmed, and a wrong figure would produce advice you could not check.',
  'location.use': 'Use my location',
  'location.home': 'Reset to home — 08330',
  'sources.assumptions': 'Our judgement calls',
  'sources.note':
    'This app never reports a seeing or transparency measurement, because no free data source provides one. Where a value is our own assumption, it is listed here.',
  'reason.never-rises': 'Never rises from here',
  'reason.below-useful-altitude': 'Too low during your window',
  'reason.too-brief': 'Up too briefly to be worth it',
  'reason.no-dark-overlap': 'No dark sky during your window',
  'reason.below-aperture-limit': 'Too faint for a 203 mm telescope',
} as const

export type StringKey = keyof typeof en

const DICTS: Record<Lang, Partial<Record<StringKey, unknown>>> = { en, me: {} }

let current: Lang = 'en'

export function setLang(l: Lang): void {
  current = DICTS[l] && Object.keys(DICTS[l]).length > 0 ? l : 'en'
  try {
    localStorage.setItem('dt.lang', current)
  } catch {
    /* storage unavailable (private mode) — language just does not persist */
  }
}

export function getLang(): Lang {
  return current
}

export function loadLang(): void {
  try {
    const s = localStorage.getItem('dt.lang')
    if (s === 'en' || s === 'me') setLang(s)
  } catch {
    /* ignore */
  }
}

/** Look up a string, falling back to English rather than showing a raw key. */
export function t(key: StringKey): string
export function t(key: StringKey, arg: number): string
export function t(key: StringKey, arg?: number): string {
  const v = (DICTS[current][key] ?? en[key]) as string | ((n: number) => string)
  return typeof v === 'function' ? v(arg ?? 0) : v
}
