/**
 * Imaging with the Celestron NexImage 10.
 *
 * Deliberately separate from visual observing, because the answer is different
 * and much narrower.
 *
 * WHAT THIS CAMERA IS: a small-sensor, high-frame-rate planetary imager. It
 * works by "lucky imaging" — capturing thousands of frames, then stacking the
 * sharpest few percent to beat atmospheric blurring. That technique needs a
 * BRIGHT subject, because each frame is exposed for a few milliseconds.
 *
 * WHAT IT IS NOT: a deep-sky camera. Galaxies and nebulae need exposures of
 * minutes, which requires cooling, low read noise, and — critically — a driven
 * equatorial mount. This telescope is an undriven Dobsonian: the sky drifts
 * through the field continuously, and the field also rotates. Long exposures
 * are not possible on this mount regardless of the camera.
 *
 * So this module recommends the Moon, the planets, and bright double stars, and
 * says plainly why everything else is excluded rather than quietly omitting it.
 */
import { TELESCOPE, magnification, exitPupilMm } from './optics'
import type { Target } from './targets'
import { cite, type EvidenceRef } from '../data/evidence'
import { participates, type Barlow, type Inventory } from '../data/inventory'

export interface ImagingPlan {
  targetId: string
  targetName: string
  suitable: boolean
  /** Why not, when unsuitable. Shown to the user rather than hiding the target. */
  reason?: string
  barlow: Barlow | null
  effectiveFocalLengthMm: number
  effectiveFocalRatio: number
  notes: string[]
  evidence: EvidenceRef[]
}

/**
 * Focal ratio band for lucky imaging.
 *
 * Too fast and the image scale undersamples what the aperture can resolve; too
 * slow and each frame is too dim for the short exposures the technique needs.
 * f/10 to f/20 is the conventional working range for planetary work.
 */
const MIN_RATIO = 10
const MAX_RATIO = 20

export function planImaging(args: {
  target: Target
  inventory: Inventory
}): ImagingPlan {
  const { target } = args
  const name = ('commonName' in target && target.commonName) || target.name
  const barlows = args.inventory.barlows.filter(participates)

  const base: Omit<ImagingPlan, 'suitable'> = {
    targetId: target.id,
    targetName: name,
    barlow: null,
    effectiveFocalLengthMm: TELESCOPE.focalLengthMm,
    effectiveFocalRatio: TELESCOPE.focalLengthMm / TELESCOPE.apertureMm,
    notes: [],
    evidence: [cite('mfr.celestron.neximage-10')],
  }

  if (target.type === 'deep-sky') {
    const kindWord =
      target.kind === 'galaxy'
        ? 'Galaxies'
        : target.kind.includes('nebula')
          ? 'Nebulae'
          : target.kind.includes('cluster')
            ? 'Star clusters'
            : 'Deep-sky objects'
    return {
      ...base,
      suitable: false,
      reason:
        `${kindWord} need exposures of minutes. The NexImage 10 captures short frames for stacking, and this ` +
        `Dobsonian is undriven, so the sky drifts and the field rotates during any long exposure. ` +
        `Neither the camera nor the mount suits this target.`,
      notes: [
        'This is a limitation of the mount as much as the camera. A driven equatorial mount would be needed before a different camera would help.',
      ],
    }
  }

  // Solar-system: find the Barlow that lands the focal ratio in the useful band.
  const options = [null, ...barlows].map((bl) => {
    const factor = bl?.factor ?? 1
    const fl = TELESCOPE.focalLengthMm * factor
    return { bl, fl, ratio: fl / TELESCOPE.apertureMm }
  })

  const inBand = options.filter((o) => o.ratio >= MIN_RATIO && o.ratio <= MAX_RATIO)
  // Prefer the gentlest amplification that reaches the band — fewer glass
  // elements, and a brighter image means shorter frames.
  const chosen =
    inBand.sort((a, b) => a.ratio - b.ratio)[0] ??
    options.sort((a, b) => Math.abs(a.ratio - 13) - Math.abs(b.ratio - 13))[0]!

  const notes: string[] = []
  if (chosen.ratio < MIN_RATIO) {
    notes.push(
      `At f/${chosen.ratio.toFixed(1)} the image scale undersamples what a 203 mm aperture can resolve. A stronger Barlow would help.`,
    )
  }
  if (target.kind === 'moon') {
    notes.push(
      'The Moon is bright enough that native focal length often works well, and a full disc will not fit on this sensor at high amplification — expect to shoot regions and mosaic them.',
    )
  } else {
    notes.push(
      'Capture a few thousand frames and stack the sharpest 5–10%. Steadiness of the air matters far more than how many frames you take.',
    )
  }
  notes.push('Shoot near the meridian, when the object is highest and you are looking through the least air.')

  return {
    ...base,
    suitable: true,
    barlow: chosen.bl,
    effectiveFocalLengthMm: Math.round(chosen.fl),
    effectiveFocalRatio: Number(chosen.ratio.toFixed(1)),
    notes,
    evidence: [cite('mfr.celestron.neximage-10'), cite('formula.magnification')],
  }
}

/** Convenience: the eyepiece-equivalent power, for intuition only. */
export function equivalentPower(barlowFactor: number, eyepieceFocalMm = 10): number {
  return magnification(eyepieceFocalMm, barlowFactor)
}

export { exitPupilMm }
