/**
 * Marker thumbnails: the small, local, offline-safe copies of the verified
 * photographs, built by `scripts/fetch-thumbs.mjs`.
 *
 * The manifest is the authority on which targets can have a disc at all. It is
 * generated from the same `images.json` the detail card reads, minus anything
 * the script judged unfit for a caption-less marker, so a target that is not
 * listed here keeps the plain ring and nothing ever requests a missing file.
 */
import manifest from '../data/thumbs.json'

const IDS = new Set(manifest as string[])

/** Whether a verified photograph exists that is usable as a marker. */
export function hasThumb(targetId: string): boolean {
  return IDS.has(targetId)
}

export function thumbCount(): number {
  return IDS.size
}

const loaded = new Map<string, HTMLImageElement>()
const failed = new Set<string>()
const inFlight = new Map<string, Promise<HTMLImageElement | null>>()

/** The image if it is already decoded, without starting a load. */
export function peekThumb(targetId: string): HTMLImageElement | null {
  return loaded.get(targetId) ?? null
}

/**
 * Load a thumbnail once. Repeat calls share one request, and a failure is
 * remembered so a broken file cannot be retried on every frame.
 */
export function loadThumb(targetId: string): Promise<HTMLImageElement | null> {
  const have = loaded.get(targetId)
  if (have) return Promise.resolve(have)
  if (failed.has(targetId) || !IDS.has(targetId)) return Promise.resolve(null)

  const running = inFlight.get(targetId)
  if (running) return running

  const p = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      loaded.set(targetId, img)
      inFlight.delete(targetId)
      resolve(img)
    }
    img.onerror = () => {
      failed.add(targetId)
      inFlight.delete(targetId)
      resolve(null)
    }
    img.src = `/thumbs/${targetId}.webp`
  })
  inFlight.set(targetId, p)
  return p
}
