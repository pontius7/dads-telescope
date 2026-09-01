/**
 * Inventory persistence.
 *
 * THE CRITICAL RULE: built-in item *definitions* are never persisted — only the
 * user's overrides (which items are switched off) and any items they added
 * themselves.
 *
 * That is not a size optimisation. If definitions were stored, a stale payload
 * written by an older build could resurrect a removed item — exactly how the
 * banned Explore Scientific 8.5 mm could come back on a device that ran an
 * earlier version. Storing only override *keys* makes that structurally
 * impossible: an orphaned key for an item that no longer exists is dropped on
 * load.
 */
import {
  DEFAULT_INVENTORY,
  isForbidden,
  createUserEyepiece,
  type Eyepiece,
  type Inventory,
  type BarrelMm,
} from './inventory'

const KEY = 'dt.inventory.v1'
const SCHEMA_VERSION = 1

interface StoredUserEyepiece {
  id: string
  brand: string
  model: string
  focalMm: number
  afovDeg: number
  barrelMm: BarrelMm
  enabled: boolean
}

interface Stored {
  schemaVersion: number
  /** id -> enabled. Only ids that differ from the default are worth keeping. */
  disabledIds: string[]
  userEyepieces: StoredUserEyepiece[]
}

function readRaw(): Stored {
  const empty: Stored = { schemaVersion: SCHEMA_VERSION, disabledIds: [], userEyepieces: [] }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return empty
    const p = JSON.parse(raw) as Partial<Stored>
    if (p.schemaVersion !== SCHEMA_VERSION) return empty // never blind-cast across versions
    return {
      schemaVersion: SCHEMA_VERSION,
      disabledIds: Array.isArray(p.disabledIds) ? p.disabledIds.filter((x) => typeof x === 'string') : [],
      userEyepieces: Array.isArray(p.userEyepieces) ? p.userEyepieces.filter(isPlausibleUserEyepiece) : [],
    }
  } catch {
    return empty
  }
}

function isPlausibleUserEyepiece(x: unknown): x is StoredUserEyepiece {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  return (
    typeof o.brand === 'string' &&
    typeof o.model === 'string' &&
    typeof o.focalMm === 'number' &&
    Number.isFinite(o.focalMm) &&
    o.focalMm > 0
  )
}

function write(s: Stored): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* private mode or quota — the app still works, it just will not remember */
  }
}

/**
 * Build the live inventory: built-in definitions from source, with stored
 * enable/disable applied, plus any user-added items (always unverified).
 */
export function loadInventory(): Inventory {
  const s = readRaw()
  const disabled = new Set(s.disabledIds)

  const apply = <T extends { id: string; enabled: boolean }>(items: readonly T[]): T[] =>
    items.map((i) => ({ ...i, enabled: !disabled.has(i.id) }))

  const userEyepieces: Eyepiece[] = s.userEyepieces
    .map((u) => ({
      ...createUserEyepiece({
        brand: u.brand,
        model: u.model,
        focalMm: u.focalMm,
        afovDeg: u.afovDeg,
        barrelMm: u.barrelMm,
      }),
      id: u.id,
      enabled: u.enabled,
    }))
    // Last line of defence on the way OUT of storage.
    .filter((e) => !isForbidden(e))

  return {
    eyepieces: [...apply(DEFAULT_INVENTORY.eyepieces), ...userEyepieces],
    barlows: apply(DEFAULT_INVENTORY.barlows),
    filters: apply(DEFAULT_INVENTORY.filters),
    cameras: apply(DEFAULT_INVENTORY.cameras),
  }
}

export function setEnabled(id: string, enabled: boolean): void {
  const s = readRaw()
  const set = new Set(s.disabledIds)
  if (enabled) set.delete(id)
  else set.add(id)

  // A user-added item carries its own flag rather than an override key.
  const userEyepieces = s.userEyepieces.map((u) => (u.id === id ? { ...u, enabled } : u))

  write({ ...s, disabledIds: [...set], userEyepieces })
}

export function addUserEyepiece(input: {
  brand: string
  model: string
  focalMm: number
  afovDeg?: number
  barrelMm?: BarrelMm
}): { ok: true } | { ok: false; reason: string } {
  const brand = input.brand.trim()
  const model = input.model.trim()
  if (!brand || !model) return { ok: false, reason: 'Brand and model are both needed.' }
  if (!Number.isFinite(input.focalMm) || input.focalMm <= 0 || input.focalMm > 80) {
    return { ok: false, reason: 'Focal length should be between 1 and 80 mm.' }
  }
  if (isForbidden({ brand, model })) {
    return { ok: false, reason: 'That item is on the excluded list and cannot be added.' }
  }

  const s = readRaw()
  const id = `user-${brand}-${model}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  if (s.userEyepieces.some((u) => u.id === id)) {
    return { ok: false, reason: 'You have already added that eyepiece.' }
  }

  write({
    ...s,
    userEyepieces: [
      ...s.userEyepieces,
      {
        id,
        brand,
        model,
        focalMm: input.focalMm,
        afovDeg: input.afovDeg ?? 50,
        barrelMm: input.barrelMm ?? 31.75,
        enabled: true,
      },
    ],
  })
  return { ok: true }
}

export function removeUserEyepiece(id: string): void {
  const s = readRaw()
  write({ ...s, userEyepieces: s.userEyepieces.filter((u) => u.id !== id) })
}

export function resetInventory(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
