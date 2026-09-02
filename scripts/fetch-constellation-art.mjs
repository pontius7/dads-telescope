/**
 * Fetch the constellation figures, once, into files that get committed.
 *
 * THE ART is Johan Meuris's illustrations for Stellarium, released under the
 * Free Art License. That licence permits use and modification and REQUIRES
 * attribution, which the app carries on its Sources screen. Nothing here is
 * redrawn or passed off as ours.
 *
 * WHY IT LINES UP. Stellarium ships three anchors per figure: a pixel position
 * in the image paired with the Hipparcos number of the star it belongs on.
 * Resolving those stars to real coordinates turns "a painting of a hunter" into
 * a painting whose belt sits on Orion's actual belt stars. Without the anchors
 * this would be hand-placement and would drift as the sky rotates.
 *
 * The images are 8-bit greyscale on black, which is ideal: the renderer uses
 * the luminance as its own mask and tints it, so a figure glows in light blue
 * over the stars rather than covering them with a rectangle.
 *
 *     node scripts/fetch-constellation-art.mjs [--force]
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public', 'figures')
const OUT_JSON = join(ROOT, 'src', 'data', 'constellationArt.json')

const STELLARIUM =
  'https://raw.githubusercontent.com/Stellarium/stellarium/master/skycultures/modern'
const VIZIER = 'https://vizier.cds.unistra.fr/viz-bin/asu-tsv'
const UA = 'dads-telescope/0.1 (personal observing app)'
const FORCE = process.argv.includes('--force')

/** The constellations this app draws, mapped to their IAU abbreviations. */
const WANTED = {
  'Ursa Major': 'UMa', 'Ursa Minor': 'UMi', Cassiopeia: 'Cas', Orion: 'Ori',
  Cygnus: 'Cyg', Lyra: 'Lyr', Aquila: 'Aql', Leo: 'Leo', 'Boötes': 'Boo',
  Gemini: 'Gem', Taurus: 'Tau', Auriga: 'Aur', Perseus: 'Per',
  Andromeda: 'And', Pegasus: 'Peg', 'Canis Major': 'CMa', 'Canis Minor': 'CMi',
  'Corona Borealis': 'CrB', Draco: 'Dra', Cepheus: 'Cep', Scorpius: 'Sco',
  Cancer: 'Cnc',
}

/** Longest side of the stored figure. The source is 512; half is plenty. */
const SIZE = 256

async function hipCoordinates(hips) {
  const url =
    `${VIZIER}?-source=I/239/hip_main&-out=HIP,_RAJ2000,_DEJ2000&HIP=${[...hips].join(',')}`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`VizieR returned ${res.status}`)
  const out = new Map()
  for (const line of (await res.text()).split('\n')) {
    // Data rows only: three whitespace-separated numbers, no leading marker.
    const m = /^\s*(\d+)\s+([\d.+-]+)\s+([+-][\d.]+)\s*$/.exec(line)
    if (!m) continue
    out.set(Number(m[1]), {
      raHoursJ2000: Number(m[2]) / 15,
      decDegJ2000: Number(m[3]),
    })
  }
  return out
}

async function main() {
  const index = await (await fetch(`${STELLARIUM}/index.json`, { headers: { 'User-Agent': UA } })).json()
  await mkdir(OUT_DIR, { recursive: true })

  const byAbbr = new Map()
  for (const c of index.constellations ?? []) {
    const abbr = String(c.id).split(' ').pop()
    if (c.image) byAbbr.set(abbr, c)
  }

  // One VizieR round trip for every anchor star in one go.
  const hips = new Set()
  for (const abbr of Object.values(WANTED)) {
    for (const a of byAbbr.get(abbr)?.image?.anchors ?? []) hips.add(a.hip)
  }
  process.stdout.write(`resolving ${hips.size} anchor stars…\n`)
  const coords = await hipCoordinates(hips)

  const manifest = {}
  const missing = []

  for (const [name, abbr] of Object.entries(WANTED)) {
    const c = byAbbr.get(abbr)
    if (!c?.image) {
      missing.push(`${name}: no artwork in the sky culture`)
      continue
    }
    const anchors = c.image.anchors.map((a) => {
      const star = coords.get(a.hip)
      return star ? { x: a.pos[0], y: a.pos[1], ...star } : null
    })
    if (anchors.some((a) => a === null) || anchors.length < 3) {
      missing.push(`${name}: could not resolve all three anchor stars`)
      continue
    }

    const out = join(OUT_DIR, `${abbr.toLowerCase()}.webp`)
    if (FORCE || !existsSync(out)) {
      const url = `${STELLARIUM}/${c.image.file}`
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (!res.ok) {
        missing.push(`${name}: image ${res.status}`)
        continue
      }
      await sharp(Buffer.from(await res.arrayBuffer()))
        .resize(SIZE, SIZE, { fit: 'fill' })
        .webp({ quality: 80, effort: 6 })
        .toFile(out)
    }

    manifest[name] = {
      file: `${abbr.toLowerCase()}.webp`,
      // Anchors are in SOURCE pixel space; store that so the renderer can work
      // in fractions and stay independent of whatever size we saved.
      imageSize: c.image.size,
      anchors,
    }
    process.stdout.write(`  + ${name} (${abbr})\n`)
  }

  await writeFile(OUT_JSON, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.log(`\n${Object.keys(manifest).length}/${Object.keys(WANTED).length} figures written`)
  if (missing.length) {
    console.log('\nNot included — these keep lines only:')
    for (const m of missing) console.log(`  ${m}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
