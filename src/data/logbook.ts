/**
 * The observing log.
 *
 * What a log is conventionally asked to record is date and time, telescope,
 * eyepiece and magnification, sky conditions, the object, and what was seen.
 * This app already knows every one of those except the last — so it fills them
 * in and asks him only for the thing no instrument can supply: whether he
 * actually saw it, and what it looked like.
 *
 * That is the whole design. A form with nine empty fields does not get filled
 * in at a telescope in the cold; one button and an optional sentence does.
 *
 * TWO HONESTY RULES CARRY OVER. Seeing and transparency are not measured by
 * anything this app reads, so they are never written into an entry as though
 * they were. And the cloud figure is stored only when a forecast actually
 * covered that moment — an entry with no weather says so rather than implying
 * a clear night.
 */

export interface LogEntry {
  id: string
  /** When the observation was made, not when the note was typed. */
  at: string
  targetId: string
  targetName: string
  /** His own verdict. The one field the app cannot fill in. */
  saw: 'yes' | 'no'
  note: string
  /** Captured context, all of it already known at the moment of logging. */
  eyepiece: string | null
  magnification: number | null
  altitudeDeg: number | null
  /** Null when no forecast covered the moment — never a guess. */
  cloudCoverPct: number | null
  moonIlluminatedPct: number | null
}

const KEY = 'dads-telescope.logbook'

function read(): LogEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as LogEntry[]) : []
  } catch {
    return []
  }
}

function write(entries: LogEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries))
  } catch {
    // A log that cannot be written is still worth showing for this session.
  }
}

/** Newest first, which is the order anyone reads a log in. */
export function loadLog(): LogEntry[] {
  return read().sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

export function addLogEntry(entry: Omit<LogEntry, 'id'>): LogEntry[] {
  const full: LogEntry = {
    ...entry,
    // Random enough for a personal log, and stable once written.
    id: `${Date.parse(entry.at)}-${Math.random().toString(36).slice(2, 8)}`,
  }
  const next = [full, ...read()]
  write(next)
  return next.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

export function updateLogNote(id: string, note: string): LogEntry[] {
  const next = read().map((e) => (e.id === id ? { ...e, note } : e))
  write(next)
  return next.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

export function removeLogEntry(id: string): LogEntry[] {
  const next = read().filter((e) => e.id !== id)
  write(next)
  return next.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

/** How many nights he has been out, which is the number people actually want. */
export function nightsObserved(entries: readonly LogEntry[]): number {
  const nights = new Set(
    entries.map((e) => {
      // A session that runs past midnight is one night, not two: shift back so
      // everything before 6am belongs to the evening it started in.
      const d = new Date(e.at)
      d.setHours(d.getHours() - 6)
      return d.toDateString()
    }),
  )
  return nights.size
}
