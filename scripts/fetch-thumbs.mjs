/**
 * Build the sky-marker thumbnails, once, into files that get committed.
 *
 * WHY LOCAL. The verified photographs live on wikimedia and NASA at around
 * 960 px. Pulling a dozen of those into the scene every night would cost
 * several megabytes over cellular and would fail completely in a dark field
 * with no signal — which is the normal case for this app. A 192 px WebP is
 * about 8 KB, the whole set is well under a megabyte, and `globPatterns` in
 * vite.config.ts already precaches `webp`, so the markers simply work offline.
 *
 * WHY IT IS NOT A BUILD STEP. A build that reaches out to the network is a
 * build that breaks when a remote host has a bad day. This runs by hand, its
 * output is committed, and `npm run build` stays hermetic.
 *
 * The alpha feather is baked in here rather than done in a shader: the disc
 * has to dissolve into the star field instead of sitting on it like a sticker,
 * and a gradient burnt into the file costs nothing at runtime.
 *
 *     node scripts/fetch-thumbs.mjs [--force]
 */
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public', 'thumbs')
const IMAGES = join(ROOT, 'src', 'data', 'images.json')
const MANIFEST = join(ROOT, 'src', 'data', 'thumbs.json')

const SIZE = 192
const FORCE = process.argv.includes('--force')

/** Wikimedia rejects anonymous bulk requests, and is entitled to. */
const USER_AGENT =
  "dads-telescope/0.1 (personal observing app; https://github.com/pontius7/dads-telescope)"

/**
 * Hand-chosen crops, as fractions of the source image.
 *
 * Automatic cropping cannot know that a picture is a figure rather than a
 * photograph. Five of the verified images are laid out for a paper, not for a
 * marker, and cropping them by area of interest produced nonsense: M57 came
 * out as a four-panel plate with wavelength captions, M92 as half a starfield
 * and half a black gutter, M87 and M16 with their annotation insets, and Mars
 * as three separate globes. Each rectangle below was chosen by looking at the
 * source, which is the same human verification `images.json` already demands.
 */
const CROPS = {
  m57: { left: 0.149, top: 0.13, width: 0.24, height: 0.299 },   // the lambda-6300 panel alone
  m92: { left: 0.0, top: 0.0, width: 0.42, height: 1.0 },        // left half, before the gutter
  m87: { left: 0.02, top: 0.02, width: 0.52, height: 0.93 },
  m16: { left: 0.0, top: 0.069, width: 0.556, height: 0.486 },   // the nebula, not the Pillars inset
  mars: { left: 0.047, top: 0.016, width: 0.3125, height: 0.543 },// one globe of the three
}

/**
 * Verified images that still do not make an honest marker.
 *
 * M87's photograph annotates the core with a white box that cannot be cropped
 * away without cropping away the galaxy, and it stays legible even at 90 px.
 * A marker has no caption to explain a diagram, so M87 keeps the plain ring
 * and its picture appears only on the detail card, where the credit and the
 * caption sit beside it.
 */
const NOT_MARKER_MATERIAL = new Set(['m87'])

/** Opaque to 62% of the radius, then faded to nothing by the rim. */
const FEATHER = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
     <defs>
       <radialGradient id="g" cx="50%" cy="50%" r="50%">
         <stop offset="0%"   stop-color="#fff" stop-opacity="1"/>
         <stop offset="62%"  stop-color="#fff" stop-opacity="1"/>
         <stop offset="86%"  stop-color="#fff" stop-opacity="0.55"/>
         <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
       </radialGradient>
     </defs>
     <rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>
   </svg>`,
)

async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  return Buffer.from(await res.arrayBuffer())
}

async function main() {
  const images = JSON.parse(await readFile(IMAGES, 'utf8'))
  const ids = Object.keys(images).sort()
  await mkdir(OUT_DIR, { recursive: true })

  const done = []
  const failed = []

  for (const id of ids) {
    if (NOT_MARKER_MATERIAL.has(id)) {
      process.stdout.write(`  - ${id}  (keeps the plain ring, see NOT_MARKER_MATERIAL)\n`)
      continue
    }
    const out = join(OUT_DIR, `${id}.webp`)
    if (!FORCE && existsSync(out)) {
      done.push(id)
      process.stdout.write(`  = ${id}\n`)
      continue
    }
    try {
      const raw = await download(images[id].url)
      let pipeline = sharp(raw)
      const crop = CROPS[id]
      if (crop) {
        const { width, height } = await pipeline.metadata()
        pipeline = sharp(raw).extract({
          left: Math.round(width * crop.left),
          top: Math.round(height * crop.top),
          width: Math.round(width * crop.width),
          height: Math.round(height * crop.height),
        })
      }
      await pipeline
        .resize(SIZE, SIZE, { fit: 'cover', position: crop ? 'centre' : 'attention' })
        .composite([{ input: FEATHER, blend: 'dest-in' }])
        .webp({ quality: 82, alphaQuality: 90, effort: 6 })
        .toFile(out)
      done.push(id)
      process.stdout.write(`  + ${id}\n`)
    } catch (err) {
      failed.push([id, err.message])
      process.stdout.write(`  ! ${id}  ${err.message}\n`)
    }
  }

  // The renderer reads this to decide whether a target can have a disc at all.
  // Without it every ringed target would fire a 404 on every render.
  await writeFile(MANIFEST, `${JSON.stringify(done.sort(), null, 2)}\n`, 'utf8')

  let bytes = 0
  for (const f of await readdir(OUT_DIR)) bytes += (await stat(join(OUT_DIR, f))).size

  console.log(
    `\n${done.length}/${ids.length} thumbnails, ${(bytes / 1024).toFixed(0)} KB total, ` +
      `manifest written to src/data/thumbs.json`,
  )
  if (failed.length) {
    console.log(`\n${failed.length} could not be fetched — these keep the plain ring:`)
    for (const [id, msg] of failed) console.log(`  ${id}: ${msg}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
