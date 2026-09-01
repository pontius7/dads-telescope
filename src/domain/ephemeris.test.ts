import { describe, it, expect } from 'vitest'
import { Body, DefineStar, Equator, Horizon, MakeTime, Observer } from 'astronomy-engine'
import {
  HOME,
  bodyHorizontal,
  fixedHorizontal,
  twilightPhase,
  darkWindow,
  duskAt,
  nextRise,
  nextSet,
  moonState,
  angularSeparationDeg,
  moonSeparationFromTarget,
  airmass,
  extinctionMag,
  TWILIGHT_ALTITUDE_DEG,
} from './ephemeris'

/**
 * GROUND TRUTH — JPL Horizons API, queried live for this exact site.
 *
 *   CENTER='coord@399'  COORD_TYPE='GEODETIC'
 *   SITE_COORD='-74.7277,39.4521,0.008'   (Mays Landing, NJ 08330)
 *   QUANTITIES='4'                        (apparent azimuth & elevation)
 *   Atmos refraction: NO (AIRLESS)  <-- so we compare with refraction 'none'
 *
 * Azimuth is clockwise from true north in both systems.
 */
const JPL_CASES = [
  { name: 'Saturn', body: Body.Saturn, utc: '2026-08-31T02:00:00Z', az: 94.644358, alt: 10.283626 },
  { name: 'Moon', body: Body.Moon, utc: '2026-08-31T02:00:00Z', az: 92.295559, alt: 15.235946 },
  { name: 'Jupiter', body: Body.Jupiter, utc: '2026-08-31T09:00:00Z', az: 72.663291, alt: 6.130268 },
  { name: 'Sun', body: Body.Sun, utc: '2026-08-31T16:00:00Z', az: 152.916522, alt: 56.302148 },
  // Below the horizon — an object that is simply not up.
  { name: 'Mars', body: Body.Mars, utc: '2026-08-31T23:00:00Z', az: 326.797362, alt: -19.60031 },
] as const

/** The accuracy astronomy-engine claims for itself: +/- 1 arcminute. */
const ONE_ARCMIN_DEG = 1 / 60

describe('ephemeris vs JPL Horizons (independent reference)', () => {
  it.each(JPL_CASES)(
    '$name at $utc matches Horizons within 1 arcmin',
    ({ body, utc, az, alt }) => {
      const pos = bodyHorizontal(body, new Date(utc), HOME, 'none')
      expect(Math.abs(pos.altitudeDeg - alt)).toBeLessThan(ONE_ARCMIN_DEG)
      expect(Math.abs(pos.azimuthDeg - az)).toBeLessThan(ONE_ARCMIN_DEG)
    },
  )

  it('reports Mars as below the horizon, not as a visible target', () => {
    const mars = bodyHorizontal(Body.Mars, new Date('2026-08-31T23:00:00Z'), HOME, 'none')
    expect(mars.altitudeDeg).toBeLessThan(0)
  })

  it('refraction lifts a low object and barely moves a high one', () => {
    const d = new Date('2026-08-31T02:00:00Z')
    const lowNone = bodyHorizontal(Body.Saturn, d, HOME, 'none').altitudeDeg
    const lowRefr = bodyHorizontal(Body.Saturn, d, HOME, 'normal').altitudeDeg
    // Saturn at ~10 deg: refraction is real and worth several arcminutes.
    expect(lowRefr).toBeGreaterThan(lowNone)
    expect(lowRefr - lowNone).toBeGreaterThan(0.05)

    const hi = new Date('2026-08-31T16:00:00Z')
    const hiNone = bodyHorizontal(Body.Sun, hi, HOME, 'none').altitudeDeg
    const hiRefr = bodyHorizontal(Body.Sun, hi, HOME, 'normal').altitudeDeg
    expect(hiRefr - hiNone).toBeLessThan(0.02) // ~56 deg up: negligible
  })
})

describe('fixed catalogue objects (J2000 -> horizontal)', () => {
  // Vega, J2000: 18h 36m 56.34s / +38 47 01.3
  const VEGA = { ra: 18.61565, dec: 38.7837 }
  // M13, J2000: 16h 41m 41.24s / +36 27 35.5
  const M13 = { ra: 16.69479, dec: 36.46042 }

  it('agrees with astronomy-engine own DefineStar path', () => {
    const date = new Date('2026-08-31T02:00:00Z')
    const observer = new Observer(HOME.latitudeDeg, HOME.longitudeDeg, HOME.elevationM)
    const time = MakeTime(date)

    // Independent code path inside the library: register a star, then use the
    // standard Equator/Horizon route. Aberration off, because our rotation
    // path does not apply annual aberration (max ~20.5", well inside our
    // 1 arcmin tolerance, but excluded here to isolate the precession maths).
    DefineStar(Body.Star1, VEGA.ra, VEGA.dec, 1000)
    const eq = Equator(Body.Star1, time, observer, true, false)
    const viaStar = Horizon(time, observer, eq.ra, eq.dec, '')

    const viaRotation = fixedHorizontal(VEGA.ra, VEGA.dec, date, HOME, 'none')

    expect(Math.abs(viaRotation.altitudeDeg - viaStar.altitude)).toBeLessThan(ONE_ARCMIN_DEG)
    expect(Math.abs(viaRotation.azimuthDeg - viaStar.azimuth)).toBeLessThan(ONE_ARCMIN_DEG)
  })

  it('precession from J2000 is applied, not ignored', () => {
    // Naively treating J2000 coordinates as of-date misplaces objects by
    // ~0.36 deg over 26 years. Confirm we are NOT doing that: our result must
    // differ measurably from the unprecessed shortcut.
    const date = new Date('2026-08-31T02:00:00Z')
    const observer = new Observer(HOME.latitudeDeg, HOME.longitudeDeg, HOME.elevationM)
    const naive = Horizon(MakeTime(date), observer, VEGA.ra, VEGA.dec, '')
    const correct = fixedHorizontal(VEGA.ra, VEGA.dec, date, HOME, 'none')

    const delta = Math.hypot(
      correct.altitudeDeg - naive.altitude,
      (correct.azimuthDeg - naive.azimuth) * Math.cos((correct.altitudeDeg * Math.PI) / 180),
    )
    // Measured across six objects from this site, the naive shortcut is wrong
    // by 9.0' (Polaris) to 22.5' (M7). Guard well above the noise floor so a
    // future "simplification" back to the naive call fails loudly.
    expect(delta).toBeGreaterThan(5 * ONE_ARCMIN_DEG)
  })

  it('Vega altitude matches the independently computed reference', () => {
    // Cross-checked via astronomy-engine's DefineStar route in a separate run:
    // Vega from Mays Landing at 2026-08-31T02:00:00Z -> alt 78.3013 deg.
    const v = fixedHorizontal(VEGA.ra, VEGA.dec, new Date('2026-08-31T02:00:00Z'), HOME, 'none')
    expect(Math.abs(v.altitudeDeg - 78.3013)).toBeLessThan(0.5 / 60)
  })

  it('M13 culminates near the zenith from New Jersey (geometric identity)', () => {
    // At transit, altitude = 90 - |latitude - declination|. This identity is
    // pure spherical geometry and owes nothing to the library, so it is a real
    // independent check. Using of-date declination, M13 sits ~86.96 deg up.
    let maxAlt = -90
    const start = Date.parse('2026-08-31T00:00:00Z')
    for (let m = 0; m < 24 * 60; m += 1) {
      const alt = fixedHorizontal(M13.ra, M13.dec, new Date(start + m * 60_000), HOME, 'none')
        .altitudeDeg
      if (alt > maxAlt) maxAlt = alt
    }
    const expected = 90 - Math.abs(HOME.latitudeDeg - M13.dec) // 87.008 using J2000 dec
    expect(maxAlt).toBeGreaterThan(expected - 0.15) // allow for precession in dec
    expect(maxAlt).toBeLessThan(expected + 0.05)
  })
})

describe('rise, set and twilight', () => {
  it('finds a sunset and it precedes astronomical dusk', () => {
    const noonUtc = new Date('2026-08-31T16:00:00Z') // ~noon EDT
    const sunset = nextSet(Body.Sun, noonUtc, HOME)
    const astroDusk = duskAt(TWILIGHT_ALTITUDE_DEG.astronomical, noonUtc, HOME)
    expect(sunset).not.toBeNull()
    expect(astroDusk).not.toBeNull()
    expect(sunset!.getTime()).toBeLessThan(astroDusk!.getTime())
  })

  it('orders the twilight phases correctly through the evening', () => {
    const noonUtc = new Date('2026-08-31T16:00:00Z')
    const civil = duskAt(TWILIGHT_ALTITUDE_DEG.civil, noonUtc, HOME)!
    const nautical = duskAt(TWILIGHT_ALTITUDE_DEG.nautical, noonUtc, HOME)!
    const astro = duskAt(TWILIGHT_ALTITUDE_DEG.astronomical, noonUtc, HOME)!
    expect(civil.getTime()).toBeLessThan(nautical.getTime())
    expect(nautical.getTime()).toBeLessThan(astro.getTime())
  })

  it('classifies daylight and deep night correctly', () => {
    expect(twilightPhase(new Date('2026-08-31T16:00:00Z'), HOME)).toBe('day')
    expect(twilightPhase(new Date('2026-08-31T05:00:00Z'), HOME)).toBe('night')
  })

  it('produces a usable dark window for a New Jersey summer night', () => {
    const w = darkWindow(new Date('2026-08-31T16:00:00Z'), HOME)
    expect(w.hasFullDarkness).toBe(true)
    const hours = (w.end!.getTime() - w.start!.getTime()) / 3_600_000
    expect(hours).toBeGreaterThan(4)
    expect(hours).toBeLessThan(10)
  })

  it('plans TONIGHT, not tomorrow, when opened after dark', () => {
    // 02:38 UTC is about 10:38 pm EDT — already astronomically dark. The window
    // must start immediately, not skip forward to the next evening's dusk.
    // This was a real bug: it planned the wrong night for anyone already outside.
    const midNight = new Date('2026-09-01T02:38:00Z')
    const w = darkWindow(midNight, HOME)
    expect(w.hasFullDarkness).toBe(true)
    expect(w.start!.getTime()).toBe(midNight.getTime())
    // ends at the coming dawn, within hours — not 24+ hours away
    const hoursAhead = (w.end!.getTime() - midNight.getTime()) / 3_600_000
    expect(hoursAhead).toBeGreaterThan(0)
    expect(hoursAhead).toBeLessThan(12)
  })

  it('still waits for dusk when opened during the day', () => {
    const noon = new Date('2026-08-31T16:00:00Z')
    const w = darkWindow(noon, HOME)
    expect(w.start!.getTime()).toBeGreaterThan(noon.getTime())
  })

  it('reports no full darkness above the Arctic circle in midsummer, rather than guessing', () => {
    const tromso = { latitudeDeg: 69.65, longitudeDeg: 18.96, elevationM: 10 }
    const w = darkWindow(new Date('2026-06-21T12:00:00Z'), tromso)
    expect(w.hasFullDarkness).toBe(false)
    expect(w.start).toBeNull()
  })

  it('finds Moon rise and set', () => {
    const d = new Date('2026-08-31T02:00:00Z')
    expect(nextRise(Body.Moon, d, HOME, 2)).not.toBeNull()
    expect(nextSet(Body.Moon, d, HOME, 2)).not.toBeNull()
  })
})

describe('Moon state and separation', () => {
  it('reports illumination in [0,1] and a consistent below-horizon flag', () => {
    const m = moonState(new Date('2026-08-31T02:00:00Z'), HOME)
    expect(m.illuminatedFraction).toBeGreaterThanOrEqual(0)
    expect(m.illuminatedFraction).toBeLessThanOrEqual(1)
    expect(m.isBelowHorizon).toBe(m.altitudeDeg < 0)

    // Cross-check against the JPL golden case. moonState() reports the
    // REFRACTED altitude (what you actually see), while the JPL figure is
    // airless, so the two must NOT be equal — the refracted value must sit
    // slightly higher by a physically plausible amount. Refraction at ~15 deg
    // elevation is roughly 3.5 arcmin.
    const JPL_AIRLESS_ALT = 15.235946
    const lift = m.altitudeDeg - JPL_AIRLESS_ALT
    expect(lift).toBeGreaterThan(0.02) // > ~1.2 arcmin
    expect(lift).toBeLessThan(0.12) // < ~7 arcmin
  })

  it('computes great-circle separation correctly', () => {
    expect(angularSeparationDeg(0, 0, 0, 0)).toBeCloseTo(0, 9)
    expect(angularSeparationDeg(0, 0, 12, 0)).toBeCloseTo(180, 6)
    expect(angularSeparationDeg(0, 90, 0, -90)).toBeCloseTo(180, 6)
    expect(angularSeparationDeg(0, 0, 6, 0)).toBeCloseTo(90, 6)
    // 1 hour of RA at the equator is 15 degrees.
    expect(angularSeparationDeg(0, 0, 1, 0)).toBeCloseTo(15, 6)
  })

  it('is numerically stable at very small separations (haversine, not law of cosines)', () => {
    // The law-of-cosines form returned 8.5e-7 deg here instead of 0, because
    // acos loses precision as its argument approaches 1. Haversine holds up.
    const s = angularSeparationDeg(16.69479, 36.46042, 16.69479, 36.46042)
    expect(Number.isNaN(s)).toBe(false)
    expect(s).toBe(0)

    // A genuinely tiny but non-zero separation must still resolve correctly:
    // 1 arcsecond of declination.
    const oneArcsec = 1 / 3600
    const tiny = angularSeparationDeg(16.69479, 36.46042, 16.69479, 36.46042 + oneArcsec)
    expect(tiny).toBeCloseTo(oneArcsec, 10)
  })

  it('measures Moon separation from a real target', () => {
    const sep = moonSeparationFromTarget(16.69479, 36.46042, new Date('2026-08-31T02:00:00Z'), HOME)
    expect(sep).toBeGreaterThanOrEqual(0)
    expect(sep).toBeLessThanOrEqual(180)
  })
})

describe('airmass and extinction', () => {
  it('is 1.0 at the zenith', () => {
    expect(airmass(90)).toBeCloseTo(1.0, 3)
  })

  it('grows realistically toward the horizon (Kasten & Young)', () => {
    expect(airmass(30)).toBeCloseTo(1.995, 2) // ~2 airmasses at 30 deg
    expect(airmass(10)).toBeCloseTo(5.6, 1)
    // Stays finite at the horizon, unlike sec(z) which diverges.
    expect(Number.isFinite(airmass(0.5))).toBe(true)
    expect(airmass(0.5)).toBeLessThan(50)
  })

  it('is Infinity below the horizon rather than a misleading number', () => {
    expect(airmass(0)).toBe(Number.POSITIVE_INFINITY)
    expect(airmass(-10)).toBe(Number.POSITIVE_INFINITY)
    expect(extinctionMag(-10)).toBe(Number.POSITIVE_INFINITY)
  })

  it('costs about 0.2 mag at the zenith and much more low down', () => {
    expect(extinctionMag(90)).toBeCloseTo(0.2, 2)
    expect(extinctionMag(10)).toBeGreaterThan(1.0) // Saturn at 10 deg loses >1 mag
  })

  it('Saturn at 10 degrees is heavily extinguished — the product sanity check', () => {
    // The plan requires that a 10 deg target be treated as a poor opportunity.
    // Here is the physical reason, quantified.
    const alt = 10.283626 // the JPL golden value
    expect(airmass(alt)).toBeGreaterThan(5)
    expect(extinctionMag(alt)).toBeGreaterThan(1.0)
  })
})
