# Dad's Telescope — standing rules

An observing assistant for ONE specific telescope. These rules are not style
preferences; each one exists because violating it produces output that looks
authoritative and is wrong. Wrong astronomy sends a person outside at the wrong
time pointing at the wrong patch of sky.

## The telescope (authoritative — never alter)

Celestron StarSense Explorer 8" Dobsonian
- aperture 203 mm · focal length 1200 mm · f/6
- 2" focuser with 1.25" adapter
- StarSense dock, Telrad, laser collimator
- camera: Celestron NexImage 10

## The inventory (the ONLY gear that may be recommended)

Eyepieces: Astro-Tech 28 mm UWA 82° (2") · Astro-Tech 13 mm UWA 82° ·
Baader Hyperion Zoom Mk IV 8–24 mm · Celestron E-Lux 40 mm (2") ·
Celestron 25 mm Plössl · SVBONY 7–21 mm Zoom

Barlows: Baader 2.25× · Celestron Omni 2×
Filters: SVBONY 2" UHC · SV155 1.25" colour set (#12, #21, #23A, #56, #82A)

### BANNED
**Explore Scientific 8.5 mm is NOT owned.** It must never appear in code,
data, comments, tests, or output. A test asserts its absence. If you find it,
that is a bug, not a typo.

## The three hard guarantees (each has an enforcing test)

1. ES 8.5 mm never appears anywhere.
2. Equipment that is not BOTH `verified` AND `enabled` never participates in a
   recommendation. Filtering happens *before* the recommender runs.
3. UHC is recommended only for emission and planetary nebulae. Never for
   galaxies, open clusters, globular clusters, or planets — a UHC passband
   rejects most of the broadband light those objects emit, making them dimmer
   with no contrast gain.

New user-added gear defaults to `verified: false` and is therefore excluded.
There is no in-app research service. Verification is a human act: research the
item externally, then add a profile with sources to the verified catalog.

## Never fabricate

- **Seeing and transparency are not measured** by any data source this app
  uses. Do not output them as measurements. If a proxy is derived, name it
  `proxy_*` and keep it internal.
- **Missing weather lowers `confidence`. It never substitutes a value.**
- **Offline shows "Weather unavailable"** — never a cached number presented as
  current.
- **No synthetic "what you'll see through the eyepiece" images.** Real
  NASA/ESA/ESO imagery only, with credit. Do not auto-search for imagery: a
  live test of the NASA images API returned a *Helix Nebula* photo as the top
  hit for "Ring Nebula M57". Images are hand-verified in `data/images.json`.
  No verified image ⇒ **no image**. Never a substitute.
- The number is an **Observability Score (0–100)**, never a probability of
  seeing something.
- Every recommendation rule carries an `evidenceRef` into `data/evidence.ts`.
  **A rule with no source does not ship.**

## Architecture rule

`src/domain/` is pure: no React, no DOM, no fetch, no `Date.now()` reached for
implicitly — time is always passed in. This is what makes the astronomy
testable against JPL Horizons. Do not import React into it.

## Ground truth

Validate ephemeris against the JPL Horizons API (free, no key):
```
Saturn · 39.4521 N, −74.7277 W · 2026-08-31 02:00 UTC
→ azimuth 94.644358°   altitude 10.283626°
```
Tolerance ≤ 1 arcmin. Saturn at 10° altitude must also *score poorly* — it sits
in thick, turbulent air. A high score there is a failing test, not a nice number.

## Home location

Mays Landing, NJ 08330 — use the ZIP centroid (39.4521, −74.7277).
Never store or display a street address.
