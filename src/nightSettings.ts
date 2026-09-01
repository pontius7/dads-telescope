/**
 * The two settings that survive closing the app.
 *
 * Both are set once at the start of a night and should still be set the next
 * time the telescope comes out, so they are persisted rather than defaulted.
 * `localStorage` throws outright in a locked-down Safari, so every access is
 * guarded — a preference that cannot be saved is not worth crashing over.
 */
export interface NightSettings {
  /** Red-on-black, to protect dark adaptation. */
  nightVision: boolean
  /** Hold the screen awake while observing. */
  keepAwake: boolean
}

const KEY = 'dads-telescope.night'

export const DEFAULT_NIGHT_SETTINGS: NightSettings = {
  nightVision: false,
  // On by default: someone standing at a telescope wants the screen to stay
  // on, and the browser drops the lock the moment the app is hidden anyway.
  keepAwake: true,
}

export function loadNightSettings(): NightSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_NIGHT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<NightSettings>
    return {
      nightVision: parsed.nightVision === true,
      keepAwake: parsed.keepAwake !== false,
    }
  } catch {
    return DEFAULT_NIGHT_SETTINGS
  }
}

export function saveNightSettings(s: NightSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // A preference that cannot be stored still applies for this session.
  }
}
