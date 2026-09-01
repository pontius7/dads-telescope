/**
 * Source registry.
 *
 * Every rule, constant and recommendation in this app cites a source from here.
 * `cite()` THROWS on an unknown id — that is the mechanism that makes
 * "a rule with no source does not ship" structural rather than aspirational.
 *
 * The most important field is `kind: 'assumption'`. Those are OUR judgement
 * calls, not measurements or citations. The Sources screen renders them FIRST,
 * under "Our judgement calls", because burying them would defeat the point.
 */

export type SourceKind =
  | 'formula' // standard optics/astronomy maths
  | 'library' // computed output of a named library
  | 'manufacturer' // a spec sheet
  | 'catalog' // OpenNGC, HYG
  | 'api' // Open-Meteo, NWS
  | 'convention' // established amateur practice, no single authority
  | 'curation' // an editorial choice by us
  | 'assumption' // our own constant; the honest bucket

/**
 * `verified`           — we are confident in this value.
 * `needs-verification` — plausible and in use, but not confirmed against a
 *                        primary source. Surfaced in the UI as such.
 * `unverified`         — we have no figure we trust. Excluded from anything
 *                        that would present it as fact.
 */
export type VerificationStatus = 'verified' | 'needs-verification' | 'unverified'

export interface Source {
  id: string
  kind: SourceKind
  title: string
  citation: string
  url?: string
  license?: string
  status: VerificationStatus
  note?: string
}

export interface EvidenceRef {
  sourceId: string
  detail?: string
}

const REGISTRY: Record<string, Source> = {
  // --- Formulas -----------------------------------------------------------
  'formula.magnification': {
    id: 'formula.magnification',
    kind: 'formula',
    title: 'Magnification = telescope focal length / eyepiece focal length',
    citation: 'Standard geometric optics.',
    status: 'verified',
  },
  'formula.exit-pupil': {
    id: 'formula.exit-pupil',
    kind: 'formula',
    title: 'Exit pupil = aperture / magnification',
    citation: 'Standard geometric optics. Equivalent to eyepieceFocal / focalRatio.',
    status: 'verified',
  },
  'formula.true-field': {
    id: 'formula.true-field',
    kind: 'formula',
    title: 'True field of view',
    citation:
      'Exact: TFOV = 57.29578 x fieldStop / telescopeFocalLength. Approximate: TFOV = AFOV / magnification.',
    status: 'verified',
    note: 'The AFOV approximation overstates the field for very wide-angle eyepieces.',
  },
  'formula.dawes-limit': {
    id: 'formula.dawes-limit',
    kind: 'formula',
    title: 'Dawes limit = 116 / aperture(mm) arcseconds',
    citation: 'W. R. Dawes, empirical double-star resolution criterion.',
    status: 'verified',
  },
  'formula.rayleigh-criterion': {
    id: 'formula.rayleigh-criterion',
    kind: 'formula',
    title: 'Rayleigh criterion',
    citation: '1.22 x lambda / D, expressed in arcseconds; ~138/D(mm) at 550 nm.',
    status: 'verified',
  },
  'formula.kasten-young-airmass': {
    id: 'formula.kasten-young-airmass',
    kind: 'formula',
    title: 'Kasten & Young (1989) airmass',
    citation: 'F. Kasten and A. T. Young, "Revised optical air mass tables and approximation formula", Applied Optics 28(22), 1989.',
    status: 'verified',
    note: 'Used instead of sec(z), which diverges near the horizon and is unusable below ~20 deg.',
  },
  'formula.bouguer-extinction': {
    id: 'formula.bouguer-extinction',
    kind: 'formula',
    title: 'Atmospheric extinction',
    citation: 'Bouguer-Lambert law: extinction in magnitudes = k x airmass.',
    status: 'verified',
  },
  'formula.haversine-separation': {
    id: 'formula.haversine-separation',
    kind: 'formula',
    title: 'Haversine great-circle separation',
    citation: 'Standard spherical trigonometry; numerically stable at small angles.',
    status: 'verified',
    note: 'Chosen over the law of cosines, which loses precision as the separation approaches zero.',
  },
  'formula.moon-flux-from-magnitude': {
    id: 'formula.moon-flux-from-magnitude',
    kind: 'formula',
    title: 'Relative lunar flux from apparent magnitude',
    citation: 'Pogson ratio: flux = 10^(-0.4 x (m - m_full)), with m_full = -12.74.',
    status: 'verified',
    note: 'Uses the Moon\'s real computed magnitude rather than a hand-picked power of illuminated fraction. A first-quarter Moon emits roughly 8% of full-Moon light, not 50%.',
  },

  // --- Libraries and catalogues -------------------------------------------
  'library.astronomy-engine': {
    id: 'library.astronomy-engine',
    kind: 'library',
    title: 'Astronomy Engine v2.1.19',
    citation: 'Don Cross, cosinekitty/astronomy. Claimed accuracy +/- 1 arcminute.',
    url: 'https://github.com/cosinekitty/astronomy',
    license: 'MIT',
    status: 'verified',
  },
  'reference.jpl-horizons': {
    id: 'reference.jpl-horizons',
    kind: 'library',
    title: 'JPL Horizons ephemeris system',
    citation:
      'NASA/JPL Solar System Dynamics. Used as the independent reference for validating positions. Golden case: Saturn from 39.4521 N, 74.7277 W at 2026-08-31T02:00Z -> az 94.644358, alt 10.283626 (AIRLESS).',
    url: 'https://ssd.jpl.nasa.gov/horizons/',
    status: 'verified',
  },
  'catalog.openngc': {
    id: 'catalog.openngc',
    kind: 'catalog',
    title: 'OpenNGC deep-sky catalogue',
    citation: 'Mattia Verga, OpenNGC. Source of all RA/Dec, magnitude, angular size and surface brightness in this app.',
    url: 'https://github.com/mattiaverga/OpenNGC',
    license: 'CC-BY-SA-4.0',
    status: 'verified',
  },

  // --- Weather APIs -------------------------------------------------------
  'api.open-meteo': {
    id: 'api.open-meteo',
    kind: 'api',
    title: 'Open-Meteo forecast API',
    citation: 'Hourly cloud cover, visibility, humidity, dew point, wind. No API key required.',
    url: 'https://open-meteo.com/',
    license: 'CC-BY-4.0',
    status: 'verified',
  },
  'api.nws': {
    id: 'api.nws',
    kind: 'api',
    title: 'US National Weather Service API',
    citation: 'api.weather.gov gridpoint forecast. Free, no key, United States only. Used as fallback.',
    url: 'https://www.weather.gov/documentation/services-web-api',
    status: 'verified',
  },

  // --- Equipment ----------------------------------------------------------
  'mfr.celestron.starsense-8-dob': {
    id: 'mfr.celestron.starsense-8-dob',
    kind: 'manufacturer',
    title: 'Celestron StarSense Explorer 8" Dobsonian',
    citation: 'Aperture 203 mm, focal length 1200 mm. Marketed as f/6; derived ratio is f/5.911.',
    status: 'verified',
  },
  'mfr.astro-tech.uwa-82': {
    id: 'mfr.astro-tech.uwa-82',
    kind: 'manufacturer',
    title: 'Astro-Tech UWA 82-degree eyepieces',
    citation: 'The 82-degree apparent field is part of the product designation.',
    status: 'verified',
    note: 'Field stop diameters are NOT known; true field is computed from apparent field, which slightly overstates it.',
  },
  'mfr.baader.hyperion-zoom-mk4': {
    id: 'mfr.baader.hyperion-zoom-mk4',
    kind: 'manufacturer',
    title: 'Baader Hyperion Zoom Mark IV 8-24 mm',
    citation: 'Click-stopped zoom. Apparent field varies with focal length.',
    status: 'verified',
    note: "Corroborated by the owner's deck, whose true fields at 8, 12 and 16 mm imply 67.5, 63.0 and 57.8 degrees — consistent with the 68-to-50 degree curve used here. The deck also quotes all five detent positions (8/12/16/20/24 mm).",
  },
  'mfr.baader.barlow-2.25x': {
    id: 'mfr.baader.barlow-2.25x',
    kind: 'manufacturer',
    title: 'Baader 2.25x Barlow',
    citation: 'Amplification factor 2.25x.',
    status: 'verified',
    note: "Confirmed by the owner's deck: all five quoted zoom-plus-Barlow magnifications (113x, 135x, 169x, 225x, 338x) match 2.25x exactly.",
  },
  'mfr.celestron.omni-2x': {
    id: 'mfr.celestron.omni-2x',
    kind: 'manufacturer',
    title: 'Celestron Omni 2x Barlow',
    citation: '1.25-inch, 2x amplification.',
    status: 'verified',
    note: "Confirmed by the owner's deck: 96x at 25 mm and 185x at 13 mm both match 2x exactly.",
  },
  'mfr.celestron.elux-40': {
    id: 'mfr.celestron.elux-40',
    kind: 'manufacturer',
    title: 'Celestron E-Lux 40 mm (2-inch)',
    citation: 'Apparent field believed to be 43 degrees.',
    status: 'needs-verification',
    note: "The owner's deck implies 56 degrees instead (1.87 degrees of true field at 30x). Unresolved; 43 degrees is used because understating the field errs toward warning rather than over-promising.",
  },
  'mfr.celestron.plossl-25': {
    id: 'mfr.celestron.plossl-25',
    kind: 'manufacturer',
    title: 'Celestron 25 mm Plossl',
    citation: 'Plossl designs conventionally provide about 50 degrees apparent field.',
    status: 'verified',
    note: "Corroborated by the owner's deck: 1.04 degrees of true field at 48x implies 49.9 degrees.",
  },
  'mfr.svbony.zoom-7-21': {
    id: 'mfr.svbony.zoom-7-21',
    kind: 'manufacturer',
    title: 'SVBONY 7-21 mm Zoom',
    citation: 'Focal range 7-21 mm, giving 171x down to 57x on this telescope.',
    status: 'needs-verification',
    note: 'The focal range is certain and drives magnification and exit pupil. The apparent field (believed ~40 deg at 21 mm to ~60 deg at 7 mm) is NOT confirmed, so framing advice using this eyepiece carries a warning.',
  },
  'mfr.svbony.uhc-2in': {
    id: 'mfr.svbony.uhc-2in',
    kind: 'manufacturer',
    title: 'SVBONY 2-inch UHC filter',
    citation: 'Ultra High Contrast nebula filter.',
    status: 'needs-verification',
    note: '"UHC" is a marketing term, not a standard. The actual passband varies widely between makers and has not been confirmed for this unit.',
  },
  'mfr.svbony.sv155-colour-set': {
    id: 'mfr.svbony.sv155-colour-set',
    kind: 'manufacturer',
    title: 'SVBONY SV155 1.25-inch colour filter set',
    citation: 'Wratten-numbered planetary filters: #12, #21, #23A, #56, #82A.',
    status: 'needs-verification',
  },
  'mfr.celestron.neximage-10': {
    id: 'mfr.celestron.neximage-10',
    kind: 'manufacturer',
    title: 'Celestron NexImage 10 planetary camera',
    citation: 'High-frame-rate colour camera intended for lunar and planetary imaging.',
    status: 'needs-verification',
  },

  'owner.inventory-deck': {
    id: 'owner.inventory-deck',
    kind: 'manufacturer',
    title: "Owner's own equipment deck (Moj teleskopski inventory)",
    citation:
      'A slide deck written by the telescope owner listing every item with magnification, exit pupil and true field. Its true-field figures allow apparent field to be back-calculated, which independently corroborates several specifications.',
    status: 'verified',
    note:
      'ONE CONFLICT, deliberately not resolved in the app: this deck lists an Explore Scientific 8.5 mm as owned, while the build specification states it is NOT owned and that recommendations using it must not be copied. The eyepiece remains excluded. Also disagrees on the 40 mm apparent field (implies 56 deg against the 43 deg used here).',
  },

  // --- Conventions --------------------------------------------------------
  'convention.uhc-line-emission-only': {
    id: 'convention.uhc-line-emission-only',
    kind: 'convention',
    title: 'UHC filters help only line-emission objects',
    citation:
      'A UHC passes narrow bands around H-beta (486.1 nm) and [O III] (495.9 / 500.7 nm) and blocks the rest. It darkens the sky far more than it darkens objects that emit in those lines, and it dims everything else.',
    status: 'verified',
    note: 'Consequence: emission nebulae, planetary nebulae and supernova remnants benefit. Galaxies, open and globular clusters, planets and the Moon shine by broadband continuum light and are only made dimmer. Reflection nebulae are the case most often got wrong: they shine by SCATTERED starlight, which is continuum, so a UHC does not help.',
  },
  'convention.exit-pupil-bands': {
    id: 'convention.exit-pupil-bands',
    kind: 'convention',
    title: 'Exit-pupil ranges by object class',
    citation: 'Established amateur observing practice.',
    status: 'needs-verification',
    note: 'The general practice is well established; the specific numeric bands should be attributed to a named guide before being cited as authoritative.',
  },
  'convention.wratten-planetary': {
    id: 'convention.wratten-planetary',
    kind: 'convention',
    title: 'Wratten colour filters for planetary detail',
    citation: 'Long-standing amateur practice: orange/red for Martian surface markings, light blue for Jovian belt contrast, yellow for Saturn.',
    status: 'needs-verification',
  },

  // --- Curation -----------------------------------------------------------
  'curation.popularity': {
    id: 'curation.popularity',
    kind: 'curation',
    title: 'Object recognition weighting',
    citation: 'An editorial judgement by this app about which objects a person is likely to have heard of and want to see.',
    status: 'verified',
    note: 'Not measured data. It can reorder objects that are ALREADY observable; it can never make an unobservable object outrank an observable one.',
  },

  // --- Assumptions (rendered first in the Sources screen) -----------------
  'assumption.eye-pupil': {
    id: 'assumption.eye-pupil',
    kind: 'assumption',
    title: 'Dark-adapted eye pupil = 6.0 mm',
    citation: 'Our default. Pupil size falls with age, from about 7 mm in a young adult to about 5 mm past sixty.',
    status: 'needs-verification',
    note: 'Should be a user setting. It decides when a long eyepiece stops using the full aperture.',
  },
  'assumption.magnification-ceiling': {
    id: 'assumption.magnification-ceiling',
    kind: 'assumption',
    title: 'Practical magnification ceilings by seeing tier',
    citation: 'Our heuristic: 120x poor, 200x average, 280x good, 350x excellent. Hard optical ceiling 406x.',
    status: 'needs-verification',
    note: 'We have NO measured seeing input. These tiers cap recommendations conservatively; the app never claims to know the seeing.',
  },
  'assumption.extinction-coefficient': {
    id: 'assumption.extinction-coefficient',
    kind: 'assumption',
    title: 'Zenith extinction k = 0.20 mag/airmass',
    citation: 'Our default for a clear lowland site.',
    status: 'needs-verification',
    note: 'Coastal southern New Jersey carries more aerosol than an inland site. This is an assumption, not a transparency measurement.',
  },
  'assumption.session-block-minutes': {
    id: 'assumption.session-block-minutes',
    kind: 'assumption',
    title: 'A comfortable slot for one object is 90 minutes',
    citation: 'Our heuristic. On an undriven Dobsonian, finding, framing and observing one object realistically takes 20-40 minutes.',
    status: 'needs-verification',
  },
  'assumption.fill-ratio': {
    id: 'assumption.fill-ratio',
    kind: 'assumption',
    title: 'Target should span at most 40% of the field (fill ratio 2.5x)',
    citation: 'Our heuristic, with a mechanical justification: the mount is undriven, so the object must have room to drift before leaving the field.',
    status: 'needs-verification',
  },
  'assumption.cloud-exponent': {
    id: 'assumption.cloud-exponent',
    kind: 'assumption',
    title: 'Cloud penalty is super-linear (exponent 1.5)',
    citation: 'Our heuristic. Partial cloud is disproportionately destructive to a pointed instrument, because cloud repeatedly crosses the one spot you are looking at.',
    status: 'needs-verification',
  },
  'assumption.sky-brightness-default': {
    id: 'assumption.sky-brightness-default',
    kind: 'assumption',
    title: 'Default sky darkness assumed suburban',
    citation: 'Used when the user has not told us how dark their sky is.',
    status: 'needs-verification',
    note: 'Assuming a dark site the user does not have would inflate every score. Assuming suburban is the conservative direction, and the assumption lowers confidence.',
  },
}

export const SOURCES: Readonly<Record<string, Source>> = Object.freeze(REGISTRY)

/**
 * Build an evidence reference, failing loudly on an unregistered source.
 * This is what stops an uncited rule from ever shipping.
 */
export function cite(sourceId: string, detail?: string): EvidenceRef {
  if (!(sourceId in REGISTRY)) {
    throw new Error(
      `cite(): unknown source "${sourceId}". Register it in data/evidence.ts before citing it.`,
    )
  }
  return detail === undefined ? { sourceId } : { sourceId, detail }
}

export function resolve(ref: EvidenceRef): Source {
  const s = REGISTRY[ref.sourceId]
  if (!s) throw new Error(`resolve(): unknown source "${ref.sourceId}"`)
  return s
}

export function resolveAll(refs: readonly EvidenceRef[]): Source[] {
  const seen = new Set<string>()
  const out: Source[] = []
  for (const r of refs) {
    if (seen.has(r.sourceId)) continue
    seen.add(r.sourceId)
    out.push(resolve(r))
  }
  return out
}

/** Assumptions first — they are the ones a reader most needs to see. */
export function sourcesForDisplay(): Source[] {
  const order: SourceKind[] = [
    'assumption',
    'convention',
    'curation',
    'manufacturer',
    'formula',
    'library',
    'catalog',
    'api',
  ]
  return Object.values(REGISTRY).sort(
    (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.title.localeCompare(b.title),
  )
}
