/**
 * Ephemeris — a thin, testable wrapper over astronomy-engine.
 *
 * PURE MODULE — no React, no DOM, no fetch, no ambient clock. Time is always
 * passed in explicitly so every result is reproducible and comparable against
 * an external reference (JPL Horizons).
 *
 * TWO COORDINATE PATHS, deliberately separate:
 *
 *   Solar-system bodies  -> Equator(ofdate, aberration) -> Horizon()
 *   Fixed catalog objects -> Rotation_EQJ_HOR -> HorizonFromVector()
 *
 * The second path exists because deep-sky catalogue coordinates are J2000.
 * Precession between J2000 and 2026 is roughly 0.36 deg (~22 arcmin) — far
 * larger than the 1 arcmin accuracy we hold ourselves to. Feeding J2000
 * coordinates straight into an of-date routine silently misplaces every galaxy
 * and nebula by more than the width of a high-power field.
 */
import {
  Body,
  Observer,
  MakeTime,
  Equator,
  Horizon,
  HorizonFromVector,
  VectorFromSphere,
  RotateVector,
  Rotation_EQJ_HOR,
  SearchRiseSet,
  SearchAltitude,
  SearchHourAngle,
  Illumination,
  Spherical,
  type AstroTime,
} from 'astronomy-engine'

/** Refraction model. `none` matches JPL Horizons' AIRLESS output. */
export type RefractionMode = 'none' | 'normal' | 'jplhor'

/** astronomy-engine takes '' for "no refraction". */
function refractionArg(mode: RefractionMode): string {
  return mode === 'none' ? '' : mode
}

export interface GeoLocation {
  /** Degrees north, positive. */
  latitudeDeg: number
  /** Degrees east, negative for the Americas. */
  longitudeDeg: number
  /** Metres above sea level. */
  elevationM: number
}

/** Mays Landing, NJ 08330 — ZIP centroid. Never a street address. */
export const HOME: GeoLocation = {
  latitudeDeg: 39.4521,
  longitudeDeg: -74.7277,
  elevationM: 8,
}

export interface HorizontalPosition {
  altitudeDeg: number
  /** Degrees clockwise from true north. */
  azimuthDeg: number
}

export function makeObserver(loc: GeoLocation): Observer {
  return new Observer(loc.latitudeDeg, loc.longitudeDeg, loc.elevationM)
}

// ---------------------------------------------------------------------------
// Position
// ---------------------------------------------------------------------------

/**
 * Apparent horizontal position of a solar-system body.
 *
 * `ofdate: true` + `aberration: true` reproduces what JPL Horizons calls
 * "apparent" — corrected for light-time, aberration, precession and nutation.
 */
export function bodyHorizontal(
  body: Body,
  date: Date,
  loc: GeoLocation,
  refraction: RefractionMode = 'normal',
): HorizontalPosition & { raHours: number; decDeg: number } {
  const observer = makeObserver(loc)
  const time = MakeTime(date)
  const eq = Equator(body, time, observer, /* ofdate */ true, /* aberration */ true)
  const hor = Horizon(time, observer, eq.ra, eq.dec, refractionArg(refraction))
  return {
    altitudeDeg: hor.altitude,
    azimuthDeg: hor.azimuth,
    raHours: eq.ra,
    decDeg: eq.dec,
  }
}

/**
 * Apparent horizontal position of a FIXED object from J2000 catalogue
 * coordinates (deep-sky objects, stars).
 *
 * @param raHoursJ2000 right ascension in HOURS (catalogue convention)
 * @param decDegJ2000  declination in degrees
 */
export function fixedHorizontal(
  raHoursJ2000: number,
  decDegJ2000: number,
  date: Date,
  loc: GeoLocation,
  refraction: RefractionMode = 'normal',
): HorizontalPosition {
  const observer = makeObserver(loc)
  const time = MakeTime(date)
  // Spherical takes degrees, so RA hours must be multiplied by 15.
  const sphere = new Spherical(decDegJ2000, raHoursJ2000 * 15, 1)
  const vecEqj = VectorFromSphere(sphere, time)
  const vecHor = RotateVector(Rotation_EQJ_HOR(time, observer), vecEqj)
  const hor = HorizonFromVector(vecHor, refractionArg(refraction))
  return { altitudeDeg: hor.lat, azimuthDeg: hor.lon }
}

// ---------------------------------------------------------------------------
// Rise, set, transit
// ---------------------------------------------------------------------------

export const DIRECTION_RISE = 1
export const DIRECTION_SET = -1

/** Next rise of a solar-system body, or null if it does not rise within the window. */
export function nextRise(body: Body, date: Date, loc: GeoLocation, limitDays = 1): Date | null {
  return toDate(SearchRiseSet(body, makeObserver(loc), DIRECTION_RISE, MakeTime(date), limitDays))
}

/** Next set of a solar-system body, or null if it does not set within the window. */
export function nextSet(body: Body, date: Date, loc: GeoLocation, limitDays = 1): Date | null {
  return toDate(SearchRiseSet(body, makeObserver(loc), DIRECTION_SET, MakeTime(date), limitDays))
}

/** Next upper transit (culmination) — the moment of maximum altitude. */
export function nextTransit(body: Body, date: Date, loc: GeoLocation): Date | null {
  try {
    const ev = SearchHourAngle(body, makeObserver(loc), 0, MakeTime(date), 1)
    return ev.time.date
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Twilight
// ---------------------------------------------------------------------------

/**
 * Sun-altitude thresholds defining each twilight phase.
 * Astronomical darkness (Sun below -18 deg) is when faint deep-sky objects
 * become genuinely observable.
 */
export const TWILIGHT_ALTITUDE_DEG = {
  sunrise: -0.833, // includes standard refraction + solar semidiameter
  civil: -6,
  nautical: -12,
  astronomical: -18,
} as const

export type TwilightPhase = 'day' | 'civil' | 'nautical' | 'astronomical' | 'night'

/** Classify the current sky darkness from the Sun's true altitude. */
export function twilightPhase(date: Date, loc: GeoLocation): TwilightPhase {
  const sun = bodyHorizontal(Body.Sun, date, loc, 'normal')
  const a = sun.altitudeDeg
  if (a > TWILIGHT_ALTITUDE_DEG.sunrise) return 'day'
  if (a > TWILIGHT_ALTITUDE_DEG.civil) return 'civil'
  if (a > TWILIGHT_ALTITUDE_DEG.nautical) return 'nautical'
  if (a > TWILIGHT_ALTITUDE_DEG.astronomical) return 'astronomical'
  return 'night'
}

/**
 * Evening descent of the Sun through a given altitude (dusk), or null if the
 * Sun never gets that low within the window (e.g. high-latitude summer).
 */
export function duskAt(altitudeDeg: number, date: Date, loc: GeoLocation, limitDays = 1): Date | null {
  return toDate(
    SearchAltitude(Body.Sun, makeObserver(loc), DIRECTION_SET, MakeTime(date), limitDays, altitudeDeg),
  )
}

/** Morning ascent of the Sun through a given altitude (dawn). */
export function dawnAt(altitudeDeg: number, date: Date, loc: GeoLocation, limitDays = 1): Date | null {
  return toDate(
    SearchAltitude(Body.Sun, makeObserver(loc), DIRECTION_RISE, MakeTime(date), limitDays, altitudeDeg),
  )
}

/**
 * The useful dark window for an evening: astronomical dusk to astronomical dawn.
 *
 * Returns nulls rather than guessing when the Sun does not reach -18 deg.
 * Callers must degrade gracefully rather than substitute a value.
 */
export function darkWindow(
  date: Date,
  loc: GeoLocation,
): { start: Date | null; end: Date | null; hasFullDarkness: boolean } {
  // If it is ALREADY dark, the window starts now and runs to the coming dawn.
  //
  // Without this branch, searching for the next descent through -18 deg finds
  // TOMORROW evening whenever the app is opened after astronomical dusk — so
  // someone standing outside at 10 pm would be shown the wrong night. That is
  // precisely when this app gets used.
  const sunAltNow = bodyHorizontal(Body.Sun, date, loc, 'none').altitudeDeg
  if (sunAltNow <= TWILIGHT_ALTITUDE_DEG.astronomical) {
    const end = dawnAt(TWILIGHT_ALTITUDE_DEG.astronomical, date, loc, 1)
    return { start: date, end, hasFullDarkness: end !== null }
  }

  const start = duskAt(TWILIGHT_ALTITUDE_DEG.astronomical, date, loc, 1)
  const end = start ? dawnAt(TWILIGHT_ALTITUDE_DEG.astronomical, start, loc, 1) : null
  return { start, end, hasFullDarkness: start !== null && end !== null }
}

// ---------------------------------------------------------------------------
// Moon
// ---------------------------------------------------------------------------

export interface MoonState {
  /** 0 = new, 1 = full. */
  illuminatedFraction: number
  altitudeDeg: number
  azimuthDeg: number
  raHours: number
  decDeg: number
  /** True when the Moon is below the horizon and therefore not brightening the sky. */
  isBelowHorizon: boolean
}

export function moonState(date: Date, loc: GeoLocation): MoonState {
  const pos = bodyHorizontal(Body.Moon, date, loc, 'normal')
  const illum = Illumination(Body.Moon, MakeTime(date))
  return {
    illuminatedFraction: illum.phase_fraction,
    altitudeDeg: pos.altitudeDeg,
    azimuthDeg: pos.azimuthDeg,
    raHours: pos.raHours,
    decDeg: pos.decDeg,
    isBelowHorizon: pos.altitudeDeg < 0,
  }
}

/**
 * Great-circle angular separation between two equatorial positions, in degrees.
 *
 * Uses the HAVERSINE formula, not the spherical law of cosines. The law of
 * cosines needs acos(x) with x -> 1 for close pairs, where the cosine curve is
 * flat and precision collapses: two identical positions came back as 8.5e-7 deg
 * instead of 0. Haversine is numerically stable at small angles, which is
 * exactly the regime that matters here — deciding whether the Moon is sitting
 * close enough to a target to wash it out.
 */
export function angularSeparationDeg(
  raHoursA: number,
  decDegA: number,
  raHoursB: number,
  decDegB: number,
): number {
  const d1 = deg2rad(decDegA)
  const d2 = deg2rad(decDegB)
  const dDec = d2 - d1
  const dRa = deg2rad((raHoursB - raHoursA) * 15)
  const sinHalfDec = Math.sin(dDec / 2)
  const sinHalfRa = Math.sin(dRa / 2)
  const a = sinHalfDec * sinHalfDec + Math.cos(d1) * Math.cos(d2) * sinHalfRa * sinHalfRa
  const clamped = Math.min(1, Math.max(0, a))
  return rad2deg(2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped)))
}

/** Angular separation between the Moon and a fixed J2000 catalogue target. */
export function moonSeparationFromTarget(
  raHoursJ2000: number,
  decDegJ2000: number,
  date: Date,
  loc: GeoLocation,
): number {
  const moon = moonState(date, loc)
  return angularSeparationDeg(raHoursJ2000, decDegJ2000, moon.raHours, moon.decDeg)
}

// ---------------------------------------------------------------------------
// Airmass / extinction geometry
// ---------------------------------------------------------------------------

/**
 * Airmass by Kasten & Young (1989) — accurate to the horizon, unlike sec(z),
 * which diverges to infinity and is unusable below about 20 deg altitude.
 *
 * Returns Infinity below the horizon: an object you cannot see has no
 * meaningful airmass, and callers must handle that rather than get a number.
 */
export function airmass(altitudeDeg: number): number {
  if (altitudeDeg <= 0) return Number.POSITIVE_INFINITY
  const z = 90 - altitudeDeg
  return 1 / (Math.cos(deg2rad(z)) + 0.50572 * Math.pow(96.07995 - z, -1.6364))
}

/**
 * Magnitudes of atmospheric extinction at a given altitude.
 *
 * `zenithExtinction` is the extinction coefficient in mag/airmass. 0.20 is a
 * reasonable clear-lowland-site default. This is an ASSUMPTION, not a
 * measurement of transparency, and must never be presented as one.
 */
export const DEFAULT_ZENITH_EXTINCTION_MAG = 0.2

export function extinctionMag(altitudeDeg: number, zenithExtinction = DEFAULT_ZENITH_EXTINCTION_MAG): number {
  const x = airmass(altitudeDeg)
  if (!Number.isFinite(x)) return Number.POSITIVE_INFINITY
  return zenithExtinction * x
}

// ---------------------------------------------------------------------------

function toDate(t: AstroTime | null): Date | null {
  return t ? t.date : null
}

function deg2rad(d: number): number {
  return (d * Math.PI) / 180
}

function rad2deg(r: number): number {
  return (r * 180) / Math.PI
}

export { Body }
