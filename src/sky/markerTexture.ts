/**
 * What a target looks like in the sky.
 *
 * Two treatments, and the difference between them carries meaning:
 *
 *   A DISC — the object's own verified photograph, feathered into the star
 *   field, wearing its score on a badge. The halo behind it is the average
 *   colour of that photograph, so a nebula glows the colour it actually is
 *   rather than a colour someone picked.
 *
 *   A RING — the plain circle and number, exactly as before. It now means
 *   something specific: no verified photograph exists for this object. The app
 *   would rather show nothing than a stand-in, so the ring IS the honest answer
 *   and not a fallback to be dressed up.
 *
 * Everything is composited once into a canvas and cached. One sprite, one draw
 * call, and the badge cannot drift away from the disc it belongs to — which it
 * would as a second billboarded sprite, since a screen-space offset changes
 * with distance and field of view.
 */
import * as THREE from 'three'

const S = 256
const CENTRE = S / 2

const INK = '#e8ecf4'
const FONT = '"Avenir Next", system-ui, sans-serif'

/** Colour reinforces; the NUMBER carries the meaning, for anyone who cannot separate these hues. */
export function scoreColour(score: number): string {
  return score >= 75 ? '#6ee7a8' : score >= 50 ? '#e8c468' : '#e8806b'
}

const cache = new Map<string, THREE.CanvasTexture>()

function finish(key: string, canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  cache.set(key, tex)
  return tex
}

/** Average colour of the photograph, for the halo. One pixel, read once. */
const averages = new Map<HTMLImageElement, [number, number, number]>()
function averageColour(img: HTMLImageElement): [number, number, number] {
  const hit = averages.get(img)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = c.height = 1
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  // Photographs of faint things average out almost black, which makes no glow
  // at all. Lift toward the object's hue while keeping its character.
  const peak = Math.max(r!, g!, b!, 1)
  const gain = Math.min(3.4, 150 / peak)
  const out: [number, number, number] = [
    Math.min(255, r! * gain),
    Math.min(255, g! * gain),
    Math.min(255, b! * gain),
  ]
  averages.set(img, out)
  return out
}

function drawBadge(ctx: CanvasRenderingContext2D, score: number, selected: boolean) {
  const colour = scoreColour(score)
  const r = selected ? 38 : 34
  const cx = S - r - 10
  const cy = S - r - 10

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(6, 9, 15, 0.88)'
  ctx.fill()
  ctx.lineWidth = selected ? 3 : 2
  ctx.strokeStyle = colour
  ctx.globalAlpha = selected ? 1 : 0.85
  ctx.stroke()
  ctx.globalAlpha = 1

  ctx.fillStyle = INK
  ctx.font = `500 ${selected ? 38 : 34}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(score), cx, cy + 2)
  ctx.restore()
}

/** The photograph treatment. */
export function discTexture(
  targetId: string,
  img: HTMLImageElement,
  score: number,
  selected: boolean,
): THREE.CanvasTexture {
  const key = `disc:${targetId}:${score}:${selected}`
  const hit = cache.get(key)
  if (hit) return hit

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const ctx = canvas.getContext('2d')!

  const [r, g, b] = averageColour(img)
  const discR = 86

  // Halo first, so the photograph sits inside its own light.
  const halo = ctx.createRadialGradient(CENTRE, CENTRE, discR * 0.55, CENTRE, CENTRE, discR * 1.42)
  halo.addColorStop(0, `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${selected ? 0.5 : 0.34})`)
  halo.addColorStop(0.55, `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${selected ? 0.16 : 0.1})`)
  halo.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, S, S)

  // The photograph. Its alpha feather is baked into the file, so it dissolves
  // into the sky instead of sitting on it as a square.
  ctx.drawImage(img, CENTRE - discR, CENTRE - discR, discR * 2, discR * 2)

  // A thin rim in the score colour: enough to read as a marker, not enough to
  // become a frame around the picture.
  ctx.beginPath()
  ctx.arc(CENTRE, CENTRE, discR * 0.94, 0, Math.PI * 2)
  ctx.strokeStyle = scoreColour(score)
  ctx.globalAlpha = selected ? 0.9 : 0.42
  ctx.lineWidth = selected ? 3 : 1.6
  ctx.stroke()
  ctx.globalAlpha = 1

  drawBadge(ctx, score, selected)
  return finish(key, canvas)
}

/** The honest empty-handed treatment: no photograph exists for this object. */
export function ringTexture(score: number, selected: boolean): THREE.CanvasTexture {
  const key = `ring:${score}:${selected}`
  const hit = cache.get(key)
  if (hit) return hit

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const ctx = canvas.getContext('2d')!
  const colour = scoreColour(score)

  ctx.beginPath()
  ctx.arc(CENTRE, CENTRE, 74, 0, Math.PI * 2)
  ctx.strokeStyle = colour
  ctx.globalAlpha = selected ? 1 : 0.75
  ctx.lineWidth = selected ? 7 : 4.5
  ctx.stroke()
  ctx.globalAlpha = 1

  ctx.fillStyle = INK
  ctx.font = `500 74px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(score), CENTRE, CENTRE + 4)

  return finish(key, canvas)
}

/**
 * A globe needs no picture drawn for it — it is a real lit sphere — but it
 * still needs its score. This is the badge alone, on a transparent field.
 */
export function badgeTexture(score: number, selected: boolean): THREE.CanvasTexture {
  const key = `badge:${score}:${selected}`
  const hit = cache.get(key)
  if (hit) return hit

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const ctx = canvas.getContext('2d')!
  drawBadge(ctx, score, selected)
  return finish(key, canvas)
}
