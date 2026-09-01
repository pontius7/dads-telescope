/**
 * Distance to a target.
 *
 * Solar-system distances are COMPUTED for the exact moment, from
 * astronomy-engine's geocentric vectors — they change by millions of kilometres
 * over weeks, so a fixed number would be wrong most of the time.
 *
 * Deep-sky distances are CURATED. They cannot be computed here and vary between
 * sources, sometimes substantially, so each carries an explicit uncertainty and
 * anything not in the table returns null rather than a guess.
 */
import { Body, GeoVector, MakeTime } from 'astronomy-engine'
import type { Target } from './targets'

const AU_KM = 149_597_870.7
const LIGHT_YEAR_KM = 9.4607e12
const LIGHT_SECONDS_PER_AU = 499.005

export interface Distance {
  /** Rendered value, already unit-appropriate. */
  value: number
  unit: 'km' | 'AU' | 'ly' | 'Mly'
  /** How long the light you are seeing has been travelling. */
  lightTravel: string
  /** True for solar-system bodies, where the figure is exact for this instant. */
  computed: boolean
  /** Set for curated values, which are approximate. */
  uncertaintyNote?: string
}

/**
 * Curated deep-sky distances in light years.
 *
 * These are widely-agreed values, but "widely agreed" is not "precise" — galaxy
 * distances in particular differ by 10-20% between methods. The uncertainty is
 * carried through to the UI rather than presenting a single confident number.
 */
const DEEP_SKY_LY: Record<string, [ly: number, note: string]> = {
  m1: [6500, 'about 6,500 ly; supernova remnant distances are uncertain'],
  m2: [55000, 'about 55,000 ly'],
  m3: [33900, 'about 33,900 ly'],
  m4: [7200, 'about 7,200 ly; one of the closest globulars'],
  m5: [24500, 'about 24,500 ly'],
  m6: [1600, 'about 1,600 ly'],
  m7: [980, 'about 980 ly'],
  m8: [4100, 'about 4,100 ly'],
  m11: [6200, 'about 6,200 ly'],
  m13: [22200, 'about 22,200 ly'],
  m15: [33600, 'about 33,600 ly'],
  m16: [5700, 'about 5,700 ly'],
  m17: [5500, 'about 5,500 ly'],
  m20: [5200, 'about 5,200 ly; estimates range widely'],
  m22: [10600, 'about 10,600 ly'],
  m27: [1360, 'about 1,360 ly'],
  m31: [2540000, 'about 2.54 million ly'],
  m32: [2650000, 'about 2.65 million ly'],
  m33: [2730000, 'about 2.73 million ly'],
  m34: [1500, 'about 1,500 ly'],
  m35: [2800, 'about 2,800 ly'],
  m36: [4100, 'about 4,100 ly'],
  m37: [4500, 'about 4,500 ly'],
  m38: [3500, 'about 3,500 ly'],
  m39: [800, 'about 800 ly'],
  m42: [1344, 'about 1,344 ly'],
  m44: [577, 'about 577 ly'],
  m45: [444, 'about 444 ly'],
  m46: [5500, 'about 5,500 ly'],
  m51: [23000000, 'about 23 million ly'],
  m56: [32900, 'about 32,900 ly'],
  m57: [2570, 'about 2,570 ly'],
  m63: [29300000, 'about 29.3 million ly'],
  m64: [17300000, 'about 17.3 million ly'],
  m65: [35000000, 'about 35 million ly'],
  m66: [36000000, 'about 36 million ly'],
  m71: [13000, 'about 13,000 ly'],
  m76: [2500, 'about 2,500 ly'],
  m78: [1600, 'about 1,600 ly'],
  m81: [11800000, 'about 11.8 million ly'],
  m82: [11500000, 'about 11.5 million ly'],
  m87: [53500000, 'about 53.5 million ly'],
  m92: [26700, 'about 26,700 ly'],
  m94: [16000000, 'about 16 million ly'],
  m95: [33000000, 'about 33 million ly'],
  m96: [31000000, 'about 31 million ly'],
  m97: [2030, 'about 2,030 ly'],
  m101: [20900000, 'about 20.9 million ly'],
  m103: [8500, 'about 8,500 ly'],
  m104: [29300000, 'about 29.3 million ly'],
  m106: [23500000, 'about 23.5 million ly'],
  m110: [2690000, 'about 2.69 million ly'],
  ngc0253: [11400000, 'about 11.4 million ly'],
  ngc0457: [7900, 'about 7,900 ly'],
  ngc0869: [7500, 'about 7,500 ly'],
  ngc0884: [7500, 'about 7,500 ly'],
  ngc2392: [6500, 'about 6,500 ly; revised sharply downward in recent work'],
  ngc6543: [3300, 'about 3,300 ly'],
  ngc6826: [4200, 'about 4,200 ly'],
  ngc7000: [2600, 'about 2,600 ly'],
  ngc7009: [4200, 'about 4,200 ly'],
  ngc7662: [5700, 'about 5,700 ly'],
}

export function distanceTo(target: Target, when: Date): Distance | null {
  if (target.type === 'solar-system') {
    const v = GeoVector(target.body as Body, MakeTime(when), true)
    const au = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
    const seconds = au * LIGHT_SECONDS_PER_AU

    // The Moon is close enough that AU is a useless unit for it.
    if (target.id === 'moon') {
      return {
        value: Math.round(au * AU_KM),
        unit: 'km',
        lightTravel: `${seconds.toFixed(1)} light-seconds`,
        computed: true,
      }
    }
    return {
      value: Number(au.toFixed(3)),
      unit: 'AU',
      lightTravel: formatLightTime(seconds),
      computed: true,
    }
  }

  const entry = DEEP_SKY_LY[target.id]
  if (!entry) return null
  const [ly, note] = entry
  if (ly >= 1_000_000) {
    return {
      value: Number((ly / 1_000_000).toFixed(2)),
      unit: 'Mly',
      lightTravel: `${(ly / 1_000_000).toFixed(2)} million years`,
      computed: false,
      uncertaintyNote: note,
    }
  }
  return {
    value: Math.round(ly),
    unit: 'ly',
    lightTravel: `${formatThousands(Math.round(ly))} years`,
    computed: false,
    uncertaintyNote: note,
  }
}

function formatLightTime(seconds: number): string {
  if (seconds < 90) return `${seconds.toFixed(1)} light-seconds`
  const minutes = seconds / 60
  if (minutes < 90) return `${minutes.toFixed(1)} light-minutes`
  return `${(minutes / 60).toFixed(1)} light-hours`
}

function formatThousands(n: number): string {
  return n.toLocaleString('en-US')
}

/** Formatted for display, without inventing precision the value does not have. */
export function formatDistance(d: Distance): string {
  switch (d.unit) {
    case 'km':
      return `${formatThousands(d.value)} km`
    case 'AU':
      return `${d.value} AU`
    case 'ly':
      return `${formatThousands(d.value)} light years`
    case 'Mly':
      return `${d.value} million light years`
  }
}

export { LIGHT_YEAR_KM }
