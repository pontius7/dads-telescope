# Dad's Telescope

An observing assistant for one specific telescope: a **Celestron StarSense
Explorer 8" Dobsonian** (203 mm, 1200 mm, f/6) and Dad's real eyepiece case.

It answers one question:

> Tonight, from Mays Landing NJ, what is actually worth pointing this telescope
> at, how good is the opportunity, when and where do I look, and **exactly which
> eyepiece do I put in the focuser?**

## Run it

```sh
cd ~/Projects/dads-telescope
npm install     # first time only
npm run dev
```

Then open **http://localhost:5173** on this Mac, or the printed
`Network: http://<your-lan-ip>:5173` address on an iPhone on the same Wi-Fi.

> **Home Screen install does not work yet.** iOS only allows installing a web
> app to the Home Screen over HTTPS, and this is currently served over plain
> HTTP on the LAN. The manifest and service worker are built and ready, so
> hosting it (GitHub Pages, Cloudflare Pages, anything static) is the only
> remaining step.

```sh
npm test        # 193 tests, all pure logic
npm run deploy  # build + ship to Cloudflare
npm run build   # production build + service worker
```

## What it does

- **Live Sky** — a full-bleed 3D sky at the real altitude and azimuth for your
  location and time. Nothing is placed decoratively.
- **What's Hot Tonight** — a collapsed handle over the sky; open it for the top
  eight targets ranked by observability.
- **Not Tonight** — popular objects that genuinely are not available, each with
  the reason, instead of cluttering the main list with zeros.
- **Object card** — score, best time, where to look, the exact eyepiece, the
  magnification, whether to use a filter, a real NASA photograph where one could
  be verified, and an honest note on what the eyepiece will actually show.
- **Plan Observing** — pick any date; the window is derived from that night's
  astronomical twilight, then fed to the same scoring engine.
- **Explore Sky** — free look, including below the horizon, with a time scrubber
  for seeing what rises later.
- **Point at Sky** — the view follows the phone. Motion permission is requested
  only when you tap it, never on launch.
- **Imaging** — what suits the NexImage 10, and plainly why deep sky does not.
- **Equipment** — switch gear on and off, add your own. Anything you add is
  unverified and therefore excluded from recommendations.
- **English and Crnogorski** — latinica, ijekavica.
- **Sources** — every formula, catalogue and assumption behind the numbers.

## How it is built

```
src/domain/     PURE logic. No React, no DOM, no fetch, no ambient clock.
  optics.ts       magnification, exit pupil, true field, Barlow maths, sane limits
  ephemeris.ts    astronomy-engine wrapper: alt/az, rise/set, twilight, Moon
  scoring.ts      the Observability Score over a sampled observing window
  equipment.ts    the recommendation engine
  targets.ts      target taxonomy
src/data/       catalogue, inventory, evidence registry
src/services/   weather (Open-Meteo -> NWS -> nothing)
src/sky/        the React Three Fiber scene
```

The domain layer is deliberately separate from React so the astronomy can be
tested against an independent reference. It is validated against **JPL
Horizons**: Saturn from 39.4521 N, 74.7277 W at 2026-08-31T02:00Z must come out
at azimuth 94.644358°, altitude 10.283626°, within one arcminute. Same for the
Moon, Jupiter, the Sun, and a below-horizon Mars.

## What it will not do

- It never reports a **seeing** or **transparency** measurement, because no free
  data source provides one.
- If the weather cannot be fetched, it says **"Weather unavailable"** and lowers
  its confidence. It never invents a forecast or presents cached data as current.
- It calls the number an **Observability Score**, not a probability of seeing
  anything.
- It never shows a synthetic "what you'll see through the eyepiece" image.
- The **Explore Scientific 8.5 mm is not owned** and can never be recommended.
- **Unverified equipment never enters a recommendation.** Anything you add is
  unverified until its specifications are confirmed from a real source.

## Known limitations

- **13 of 37 candidate images were kept.** Every one had to be verified: the
  NASA library's own title must independently name the object. Matching on
  description text let a "History of Chandra" page pass as a picture of M31, so
  it was rejected. Objects without a verified image show no image.
- **Some equipment specs are unconfirmed** and marked `needs-verification` in
  the Sources screen — the Baader zoom's apparent-field curve, the SVBONY's
  apparent field, the UHC passband. They are used with a visible warning rather
  than silently trusted.
- **The Montenegrin translation is not native-reviewed.** It is written as
  ijekavian latinica and tested against ekavian spellings, but a native speaker
  should read it before it is considered final.

## Data and licences

Astronomy Engine (MIT) · OpenNGC (CC-BY-SA-4.0) · Open-Meteo (CC-BY-4.0) ·
NOAA/NWS (public domain) · JPL Horizons. Full list in the app under
**Menu → About & sources**.
