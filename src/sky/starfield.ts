/**
 * Star field generation.
 *
 * Two populations, both placed at real positions:
 *
 *   1. NAMED BRIGHT STARS — actual J2000 coordinates and actual magnitudes and
 *      colours, precessed through the same path as everything else.
 *   2. BACKGROUND — procedurally generated, but NOT scattered arbitrarily.
 *      Density follows the real galactic plane, computed through
 *      `Rotation_GAL_EQJ`, so the Milky Way runs where the Milky Way runs.
 *      These are texture, never identified or clickable, and the app never
 *      claims a background dot is a particular star.
 */
import { Rotation_GAL_EQJ, RotateVector, Vector, MakeTime } from 'astronomy-engine'

export interface StarSeed {
  /** Unit vector in J2000 equatorial coordinates. */
  x: number
  y: number
  z: number
  magnitude: number
  /** B-V colour index; drives the rendered colour. */
  bv: number
}

/**
 * The brightest naked-eye stars, with real J2000 positions, magnitudes and
 * B-V colour indices. These are the ones that make constellations legible.
 */
export const BRIGHT_STARS: [name: string, raH: number, decD: number, mag: number, bv: number][] = [
  ['Sirius', 6.752478, -16.716116, -1.46, 0.0],
  ['Canopus', 6.399195, -52.695661, -0.74, 0.15],
  ['Arcturus', 14.261036, 19.18241, -0.05, 1.23],
  ['Vega', 18.615649, 38.783689, 0.03, 0.0],
  ['Capella', 5.278155, 45.997991, 0.08, 0.8],
  ['Rigel', 5.242298, -8.201638, 0.13, -0.03],
  ['Procyon', 7.655033, 5.224993, 0.34, 0.42],
  ['Betelgeuse', 5.919529, 7.407064, 0.5, 1.85],
  ['Altair', 19.846388, 8.868321, 0.76, 0.22],
  ['Aldebaran', 4.598677, 16.509301, 0.86, 1.54],
  ['Antares', 16.490128, -26.432003, 1.09, 1.83],
  ['Spica', 13.419883, -11.161319, 1.04, -0.23],
  ['Pollux', 7.755277, 28.026199, 1.14, 1.0],
  ['Fomalhaut', 22.960845, -29.622237, 1.16, 0.09],
  ['Deneb', 20.690532, 45.280339, 1.25, 0.09],
  ['Regulus', 10.139532, 11.967208, 1.35, -0.11],
  ['Castor', 7.576634, 31.888276, 1.58, 0.03],
  ['Bellatrix', 5.418851, 6.349703, 1.64, -0.22],
  ['Elnath', 5.438198, 28.607452, 1.65, 0.93],
  ['Alnilam', 5.603559, -1.201919, 1.69, -0.18],
  ['Alnitak', 5.679313, -1.942573, 1.77, -0.2],
  ['Alioth', 12.900472, 55.959823, 1.76, -0.02],
  ['Dubhe', 11.06213, 61.750991, 1.79, 1.07],
  ['Mirfak', 3.40538, 49.861179, 1.79, 0.48],
  ['Wezen', 7.139857, -26.393201, 1.83, 0.68],
  ['Alkaid', 13.792344, 49.313265, 1.85, -0.1],
  ['Sargas', 17.62202, -42.997824, 1.86, 0.4],
  ['Menkalinan', 5.99216, 44.947433, 1.9, 0.08],
  ['Alhena', 6.628528, 16.399281, 1.93, 0.0],
  ['Peacock', 20.427459, -56.735090, 1.94, -0.12],
  ['Mirzam', 6.378331, -17.955919, 1.98, -0.24],
  ['Alphard', 9.459789, -8.658602, 1.98, 1.44],
  ['Polaris', 2.52975, 89.264109, 1.98, 0.6],
  ['Hamal', 2.119556, 23.462423, 2.0, 1.15],
  ['Algieba', 10.332875, 19.841489, 2.08, 1.13],
  ['Diphda', 0.726493, -17.986605, 2.04, 1.02],
  ['Mizar', 13.398761, 54.925362, 2.23, 0.06],
  ['Nunki', 18.921091, -26.296724, 2.05, -0.22],
  ['Menkent', 14.111373, -36.369954, 2.06, 1.01],
  ['Alpheratz', 0.139791, 29.090431, 2.06, -0.11],
  ['Mirach', 1.162201, 35.620557, 2.05, 1.58],
  ['Kochab', 14.84509, 74.155505, 2.08, 1.47],
  ['Rasalhague', 17.582241, 12.560035, 2.08, 0.16],
  ['Algol', 3.136148, 40.955648, 2.12, -0.05],
  ['Almach', 2.064984, 42.329725, 2.1, 1.37],
  ['Denebola', 11.817661, 14.572058, 2.14, 0.09],
  ['Cih', 0.945142, 60.716745, 2.15, -0.15],
  ['Muhlifain', 12.691957, -48.959890, 2.2, 0.0],
  ['Naos', 8.059738, -40.003148, 2.25, -0.27],
  ['Alphecca', 15.578131, 26.714693, 2.22, -0.02],
  ['Sadr', 20.370472, 40.256679, 2.23, 0.68],
  ['Eltanin', 17.943437, 51.488896, 2.23, 1.52],
  ['Schedar', 0.675122, 56.537331, 2.24, 1.17],
  ['Caph', 0.15297, 59.149781, 2.28, 0.38],
  ['Izar', 14.749783, 27.074222, 2.35, 0.97],
  ['Enif', 21.736433, 9.87501, 2.39, 1.52],
  ['Scheat', 23.062904, 28.082789, 2.42, 1.65],
  ['Alderamin', 21.309661, 62.585574, 2.45, 0.22],
  ['Markab', 23.079348, 15.205267, 2.49, -0.04],
  ['Algenib', 0.220597, 15.183594, 2.83, -0.19],
  ['Ruchbah', 1.430216, 60.235283, 2.68, 0.16],
  ['Vindemiatrix', 13.036279, 10.959149, 2.83, 0.94],
  ['Albireo', 19.512021, 27.959692, 3.05, 1.09],
  ['Merak', 11.030686, 56.382427, 2.37, -0.02],
  ['Phecda', 11.897179, 53.694758, 2.44, 0.04],
  ['Megrez', 12.257087, 57.032615, 3.31, 0.08],
  ['Mintaka', 5.533445, -0.299092, 2.25, -0.18],
  ['Saiph', 5.795942, -9.669605, 2.07, -0.17],
]

function raDecToVec(raHours: number, decDeg: number): [number, number, number] {
  const ra = (raHours * 15 * Math.PI) / 180
  const dec = (decDeg * Math.PI) / 180
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)]
}

/** Deterministic PRNG — the sky must not shimmer between renders. */
function makeRandom(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * Build the full star field.
 *
 * The background population is drawn in GALACTIC coordinates and rotated into
 * equatorial, which is what puts the dense band where the Milky Way actually
 * is rather than in a decorative arc.
 */
export function buildStarField(backgroundCount = 4200): StarSeed[] {
  const out: StarSeed[] = []

  for (const [, ra, dec, mag, bv] of BRIGHT_STARS) {
    const [x, y, z] = raDecToVec(ra, dec)
    out.push({ x, y, z, magnitude: mag, bv })
  }

  const rnd = makeRandom(20260901)
  const galToEqj = Rotation_GAL_EQJ()
  const t = MakeTime(new Date(Date.UTC(2000, 0, 1, 12)))

  for (let i = 0; i < backgroundCount; i += 1) {
    // Two thirds sit in the galactic disc, concentrated toward b = 0; the rest
    // are spread over the whole sphere. That mixture is what produces a real
    // Milky Way band against a sparser general field.
    const inDisc = rnd() < 0.62
    let bDeg: number
    if (inDisc) {
      // Box-Muller, sigma about 9 degrees — a plausible disc thickness on sky.
      const u1 = Math.max(1e-9, rnd())
      const u2 = rnd()
      bDeg = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * 9
    } else {
      bDeg = (Math.asin(2 * rnd() - 1) * 180) / Math.PI
    }
    if (Math.abs(bDeg) > 89) continue

    let lDeg = rnd() * 360
    // The inner galaxy is genuinely richer, so bias disc stars toward l = 0.
    if (inDisc && rnd() < 0.45) lDeg = ((rnd() - 0.5) * 150 + 360) % 360

    const bRad = (bDeg * Math.PI) / 180
    const lRad = (lDeg * Math.PI) / 180
    const gal = new Vector(
      Math.cos(bRad) * Math.cos(lRad),
      Math.cos(bRad) * Math.sin(lRad),
      Math.sin(bRad),
      t,
    )
    const eqj = RotateVector(galToEqj, gal)

    // Faint end of the visible range, weighted toward the faintest.
    const mag = 3.4 + Math.pow(rnd(), 0.55) * 3.4
    // Disc stars skew slightly redder from interstellar reddening.
    const bv = (rnd() - 0.25) * 1.6 + (inDisc ? 0.25 : 0)

    out.push({ x: eqj.x, y: eqj.y, z: eqj.z, magnitude: mag, bv })
  }

  return out
}

/**
 * B-V colour index to RGB.
 *
 * Approximate but physically ordered: negative B-V is a hot blue star, around
 * 0.6 is Sun-like yellow-white, and above 1.4 is a cool red giant.
 */
export function bvToRgb(bv: number): [number, number, number] {
  const t = Math.max(-0.4, Math.min(2.0, bv))
  // Piecewise ramp through blue-white -> white -> yellow -> orange -> red.
  const stops: [number, [number, number, number]][] = [
    [-0.4, [0.61, 0.71, 1.0]],
    [0.0, [0.79, 0.85, 1.0]],
    [0.4, [1.0, 0.98, 0.96]],
    [0.8, [1.0, 0.93, 0.79]],
    [1.2, [1.0, 0.82, 0.63]],
    [1.6, [1.0, 0.71, 0.52]],
    [2.0, [1.0, 0.6, 0.45]],
  ]
  for (let i = 0; i < stops.length - 1; i += 1) {
    const [t0, c0] = stops[i]!
    const [t1, c1] = stops[i + 1]!
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0)
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f]
    }
  }
  return stops[stops.length - 1]![1]
}

/**
 * Rendered size for a magnitude.
 *
 * Flux scales as 10^(-0.4 m), a range of thousands between Sirius and a
 * sixth-magnitude star. Rendering that linearly would make Sirius a dinner
 * plate, so it is compressed hard — the ORDER is physical, the scale is not.
 */
export function magnitudeToSize(mag: number): number {
  const flux = Math.pow(10, -0.4 * mag)
  return 0.55 + 2.6 * Math.pow(flux, 0.185)
}


// ---------------------------------------------------------------------------
// Milky Way nebulosity
// ---------------------------------------------------------------------------

export interface CloudSeed {
  x: number
  y: number
  z: number
  /** Rendered radius. */
  size: number
  /** Additive brightness. */
  alpha: number
}

/**
 * The Milky Way, built from many soft overlapping sprites rather than a
 * texture stretched across a band.
 *
 * The textured-band approach was tried first and looked wrong: a 1024x128
 * canvas stretched over a 32-degree-tall ring produced visible diagonal
 * striping and read as a grey smear rather than a star cloud. Hundreds of
 * additive blobs at real galactic coordinates give organic mottling with no UV
 * stretching at all, and the dark rift falls out of simply not placing blobs
 * where the dust lanes are.
 */
export function buildMilkyWay(count = 900): CloudSeed[] {
  const out: CloudSeed[] = []
  const rnd = makeRandom(778899)
  const galToEqj = Rotation_GAL_EQJ()
  const t = MakeTime(new Date(Date.UTC(2000, 0, 1, 12)))

  for (let i = 0; i < count; i += 1) {
    const lDeg = rnd() * 360
    // Richness rises steeply toward the galactic centre at l = 0.
    const toCentre = Math.min(lDeg, 360 - lDeg) / 180
    const richness = Math.pow(1 - toCentre, 1.9)
    if (rnd() > 0.16 + richness * 0.84) continue

    // Gaussian scatter about the galactic equator.
    const u1 = Math.max(1e-9, rnd())
    const u2 = rnd()
    const bDeg = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * 6.5

    // The Great Rift: a dust lane that darkens the middle of the band toward
    // the centre. Modelled by simply omitting blobs there.
    const inRift = Math.abs(bDeg) < 2.2 && richness > 0.35 && rnd() < 0.55
    if (inRift) continue

    const bRad = (bDeg * Math.PI) / 180
    const lRad = (lDeg * Math.PI) / 180
    const gal = new Vector(
      Math.cos(bRad) * Math.cos(lRad),
      Math.cos(bRad) * Math.sin(lRad),
      Math.sin(bRad),
      t,
    )
    const e = RotateVector(galToEqj, gal)

    out.push({
      x: e.x,
      y: e.y,
      z: e.z,
      size: 5 + rnd() * 16,
      alpha: (0.05 + rnd() * 0.16) * (0.35 + richness * 0.9),
    })
  }
  return out
}
