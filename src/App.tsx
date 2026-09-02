import { useEffect, useMemo, useRef, useState, useSyncExternalStore, lazy, Suspense } from 'react'
// Lazy so the UI shell, catalogue and domain logic land before the 3D stack.
// Three.js is the bulk of the bundle and nothing above it needs to wait.
const SkyScene = lazy(() => import('./sky/SkyScene').then((m) => ({ default: m.SkyScene })))

import {
  useSky, setupFor, compass, formatTime, formatDate, windowForDate,
  toDateInput, fromDateInput, toTimeInput, withTime, TARGETS_BY_ID,
  type ScoredTarget,
} from './useSky'
import { bodyHorizontal, fixedHorizontal, HOME, type GeoLocation } from './domain/ephemeris'
import type { ObservingWindow } from './domain/scoring'
import { sourcesForDisplay } from './data/evidence'
import { setEnabled, addUserEyepiece, removeUserEyepiece } from './data/inventoryStore'
import { imageFor, visualExpectation } from './data/imagery'
import { distanceTo, formatDistance } from './domain/distance'
const ObjectView = lazy(() => import('./sky/ObjectView').then((m) => ({ default: m.ObjectView })))
import { planImaging } from './domain/imaging'
import {
  moonReport, sunReport, planetRows, localSiderealHours, activeShowers, dewRisk,
} from './domain/tonight'
import { TELESCOPE, magnification, exitPupilMm } from './domain/optics'
import { useOrientation } from './useOrientation'
import { useSkyIdle } from './useSkyIdle'
import { PointingHUD } from './PointingHUD'
import { hasThumb } from './sky/thumbs'
import { SHOWPIECE_FLOOR } from './domain/featured'
import { upcomingHighlights } from './domain/upcoming'
import { search, type Searchable, type SearchHit } from './domain/search'
import { CONSTELLATIONS } from './sky/constellations'
import {
  addLogEntry, loadLog, nightsObserved, removeLogEntry, updateLogNote, type LogEntry,
} from './data/logbook'
import { fetchNews, type NewsResult } from './services/news'
import { useWakeLock, type WakeLockState } from './useWakeLock'
import {
  loadNightSettings, saveNightSettings, type NightSettings,
} from './nightSettings'
import { ALL_TARGETS } from './useSky'

/**
 * What the month-ahead scan looks at. The whole catalogue is not worth a
 * thirty-night sweep — this screen exists to surface things worth planning
 * around, and the faint remainder would only ever be noise a month out.
 */
const UPCOMING_CANDIDATES = ALL_TARGETS.filter(
  (t) => t.type === 'solar-system' || t.popularity >= 0.6,
)
import { t, renderNote, setLang, getLang, subscribe, LANGUAGES, type StringKey } from './i18n'

type Panel =
  | 'hot' | 'detail' | 'notTonight' | 'menu'
  | 'equipment' | 'sources' | 'location' | 'language'
  | 'plan' | 'imaging'
  | 'sun' | 'tonight' | 'upcoming' | 'news' | 'night' | 'logbook' | null

/** Re-render everything when the language changes. */
function useLang() {
  return useSyncExternalStore(subscribe, getLang, getLang)
}

export default function App() {
  useLang()

  // One clock for the whole app, ticking slowly. The sky moves; weather does
  // not refetch on every tick.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const [planWindow, setPlanWindow] = useState<ObservingWindow | null>(null)
  const sky = useSky(now, planWindow)

  const [panel, setPanel] = useState<Panel>('hot')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [explore, setExplore] = useState(false)
  const [exploreTime, setExploreTime] = useState<Date | null>(null)

  const [night, setNight] = useState<NightSettings>(loadNightSettings)
  const wakeLock = useWakeLock(night.keepAwake)
  const changeNight = (next: NightSettings) => {
    setNight(next)
    saveNightSettings(next)
  }
  useEffect(() => {
    // The film is a blend layer and cannot change what it is blending. Marking
    // the root lets the palette compensate for what red multiply removes.
    document.documentElement.dataset.night = String(night.nightVision)
  }, [night.nightVision])

  // The controls over the sky step aside while it is being handled.
  const chromeHidden = useSkyIdle()

  const [log, setLog] = useState<LogEntry[]>(loadLog)
  /** Set from search, so the figures are reachable without hunting for a tap. */
  const [revealConstellation, setRevealConstellation] = useState<string | null>(null)

  /**
   * One index over everything findable. Built once: the catalogue does not
   * change while the app is open, and rebuilding it per keystroke would be
   * work for nothing.
   */
  const searchIndex = useMemo<Searchable[]>(() => {
    const targets: Searchable[] = ALL_TARGETS.map((tg) => ({
      kind: 'target',
      id: tg.id,
      title: ('commonName' in tg && tg.commonName) || tg.name,
      subtitle: [tg.name, tg.kind.replace(/-/g, ' ')].join(' · '),
      terms: [
        tg.name,
        ('commonName' in tg && tg.commonName) || '',
        ('catalogId' in tg && tg.catalogId) || '',
        ('constellation' in tg && tg.constellation) || '',
        tg.kind.replace(/-/g, ' '),
      ].filter(Boolean) as string[],
      weight: tg.popularity,
    }))
    const constellations: Searchable[] = CONSTELLATIONS.map((c) => ({
      kind: 'constellation',
      id: c.name,
      title: c.name,
      subtitle: c.common ?? t('search.constellation'),
      terms: [c.name, c.common ?? ''].filter(Boolean),
      weight: 0.5,
    }))
    const pages: Searchable[] = ([
      ['tonight', t('menu.tonight')], ['news', t('menu.news')], ['logbook', t('menu.logbook')],
      ['night', t('menu.night')], ['plan', t('menu.plan')], ['imaging', t('menu.imaging')],
      ['equipment', t('menu.equipment')], ['location', t('menu.location')],
      ['language', t('menu.language')], ['sources', t('menu.sources')],
      ['upcoming', t('upcoming.title')],
    ] as [Panel, string][]).map(([id, title]) => ({
      kind: 'page',
      id: String(id),
      title,
      subtitle: t('menu.title'),
      terms: [title],
    }))
    return [...targets, ...constellations, ...pages]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const orient = useOrientation()
  const sensorOn = orient.state === 'granted'

  // In Explore mode the scrubbed time drives the sky; otherwise it is now.
  const when = explore && exploreTime ? exploreTime : now

  const selected = useMemo(
    () => [...sky.tonight, ...sky.notTonight].find((s) => s.target.id === selectedId) ?? null,
    [sky.tonight, sky.notTonight, selectedId],
  )

  // Where the chosen target is right now. In gesture mode the camera flies
  // there; while pointing, the camera belongs to the phone and this becomes
  // the thing being guided TO rather than jumped to.
  const guideTo = useMemo(
    () => (selected ? positionOf(selected, when, sky.loc) : null),
    [selected, when, sky.loc],
  )
  const flyTo = sensorOn ? null : guideTo

  const initialView = useMemo(() => {
    const best = sky.markers[0]
    return best ? positionOf(best, when, sky.loc) : null
    // Computed once from the first non-empty marker list so the view does not
    // jump every time the clock ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sky.markers.length > 0])

  // Pointing at the sky means looking at the SKY. A full-height card over it
  // hides the reticle and the trail, which are the whole point, so the card
  // drops to its header and the user can pull it back up.
  const [detailOpen, setDetailOpen] = useState(true)
  useEffect(() => {
    if (sensorOn) setDetailOpen(false)
  }, [sensorOn])

  const select = (id: string | null) => {
    setSelectedId(id)
    setPanel(id ? 'detail' : 'hot')
    setDetailOpen(!sensorOn)
  }
  const backToSky = () => {
    setSelectedId(null)
    setPanel('hot')
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && backToSky()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const markers = explore ? [...sky.tonight, ...sky.notTonight].slice(0, 18) : sky.markers

  return (
    <>
      <Suspense fallback={<div className="stage sky-loading" aria-hidden="true" />}>
        <SkyScene
          loc={sky.loc}
          when={when}
          targets={markers}
          selectedId={selectedId}
          onSelect={select}
          flyTo={flyTo}
          initialView={initialView}
          explore={explore}
          pose={sensorOn ? orient.pose : null}
          accuracy={orient.accuracy}
          guideTo={sensorOn ? guideTo : null}
          guideName={selected ? displayName(selected) : null}
          revealConstellation={revealConstellation}
          onRevealed={() => setRevealConstellation(null)}
          onSunWarning={() => {
            setSelectedId(null)
            setPanel('sun')
          }}
        />
      </Suspense>

      <div className="topbar" data-idle={chromeHidden}>
        {/* A pin, not a place name. Which town it is never changes and never
            needed the width; what matters is that the setting is reachable. */}
        <button className="pinbtn" aria-label={t('menu.location')} onClick={() => setPanel('location')}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path
              d="M9 16.5s6-5.2 6-9.2A6 6 0 0 0 3 7.3c0 4 6 9.2 6 9.2Z"
              fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"
            />
            <circle cx="9" cy="7.2" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>

        {/* Centred, because it is the one control that changes what the whole
            screen means. */}
        <div className="segmented" role="group" aria-label={t('explore.title')}>
          <button
            className={!explore ? 'on' : ''}
            aria-pressed={!explore}
            onClick={() => {
              setExplore(false)
              setExploreTime(null)
            }}
          >
            {t('explore.live')}
          </button>
          <button
            className={explore ? 'on' : ''}
            aria-pressed={explore}
            onClick={() => {
              setExplore(true)
              setExploreTime(new Date(now))
            }}
          >
            {t('explore.explore')}
          </button>
        </div>

        <button className="iconbtn" aria-label={t('menu.title')} onClick={() => setPanel('menu')}>
          <svg width="24" height="18" viewBox="0 0 24 18" aria-hidden="true">
            <path d="M0 1.5h24M0 9h24M0 16.5h24" stroke="currentColor" strokeWidth="1.7" />
          </svg>
        </button>
      </div>

      {explore && (
        <ExploreBar
          when={when}
          onChange={setExploreTime}
          onReset={() => setExploreTime(new Date(now))}
        />
      )}


      {/* One stack of round controls, bottom right, in thumb reach. The zoom
          buttons are gone — pinch and wheel already do it, and two more
          rectangles over the sky bought nothing. */}
      <div className="skydock">
        <button
          className="dockbtn"
          aria-pressed={night.nightVision}
          aria-label={t('night.red')}
          onClick={() => changeNight({ ...night, nightVision: !night.nightVision })}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
            <path
              d="M14.6 3.2a8 8 0 1 0 4.2 10.4A6.4 6.4 0 0 1 14.6 3.2Z"
              fill={night.nightVision ? 'currentColor' : 'none'}
              stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"
            />
          </svg>
        </button>

        {orient.state !== 'unsupported' && (
          <button
            className="dockbtn"
            aria-pressed={sensorOn}
            aria-label={sensorOn ? t('sensor.exit') : t('sensor.enable')}
            onClick={() => (sensorOn ? orient.stop() : void orient.start())}
          >
            {/* A reticle, which is what the mode actually does — not a word
                in a box the width of the screen. */}
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="12" cy="12" r="1.9" fill={sensorOn ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" />
              <path d="M12 1.5v3.5M12 19v3.5M1.5 12h3.5M19 12h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {orient.state === 'denied' && <p className="toast">{t('sensor.denied')}</p>}

      <PointingHUD active={sensorOn} />

      {panel === 'hot' && <HotSheet sky={sky} onSelect={select} onOpen={setPanel} />}
      {panel === 'detail' && selected && (
        <DetailSheet
          s={selected}
          sky={sky}
          when={when}
          onBack={backToSky}
          collapsed={!detailOpen}
          onToggle={() => setDetailOpen((v) => !v)}
          logged={log.some((e) => e.targetId === selected.target.id && Date.now() - Date.parse(e.at) < 6 * 3600_000)}
          onLog={(saw, setup) => {
            const o = selected.observability
            setLog(
              addLogEntry({
                at: new Date().toISOString(),
                targetId: selected.target.id,
                targetName: displayName(selected),
                saw,
                note: '',
                eyepiece: setup?.rec
                  ? `${setup.rec.eyepiece.brand} ${setup.rec.eyepiece.model}`
                  : null,
                magnification: setup?.rec?.magnification
                  ? Math.round(setup.rec.magnification)
                  : null,
                altitudeDeg: o.peakAltitudeDeg,
                // Only when a forecast actually covered the window.
                cloudCoverPct: sky.conditions.bestCloudPct,
                moonIlluminatedPct: null,
              }),
            )
          }}
        />
      )}
      {panel === 'notTonight' && <NotTonightSheet sky={sky} onBack={() => setPanel('hot')} />}
      {panel === 'menu' && (
        <MenuSheet
          onGo={setPanel}
          onBack={backToSky}
          index={searchIndex}
          onPick={(hit) => {
            if (hit.kind === 'target') select(hit.id)
            else if (hit.kind === 'constellation') {
              setRevealConstellation(hit.id)
              backToSky()
            } else setPanel(hit.id as Panel)
          }}
        />
      )}
      {panel === 'equipment' && <EquipmentSheet sky={sky} onBack={backToSky} />}
      {panel === 'sources' && <SourcesSheet onBack={backToSky} />}
      {panel === 'language' && <LanguageSheet onBack={backToSky} />}
      {panel === 'imaging' && <ImagingSheet sky={sky} onBack={backToSky} />}
      {panel === 'sun' && <SunSheet onBack={backToSky} />}
      {panel === 'upcoming' && <UpcomingSheet sky={sky} now={now} onBack={backToSky} />}
      {panel === 'news' && <NewsSheet onBack={backToSky} />}
      {panel === 'logbook' && (
        <LogbookSheet entries={log} onChange={setLog} onBack={backToSky} />
      )}
      {panel === 'night' && (
        <NightSheet
          settings={night}
          onChange={changeNight}
          wakeLock={wakeLock}
          onBack={backToSky}
        />
      )}

      {/* Last in the tree and highest in the stack: the film goes over
          everything, the sky included. */}
      <div className="nightshade-dim" data-on={night.nightVision} aria-hidden="true" />
      <div className="nightshade" data-on={night.nightVision} aria-hidden="true" />
      {panel === 'tonight' && <TonightSheet sky={sky} when={when} onBack={backToSky} />}
      {panel === 'plan' && (
        <PlanSheet
          loc={sky.loc}
          now={now}
          active={planWindow}
          onApply={(w) => {
            setPlanWindow(w)
            setPanel('hot')
          }}
          onClear={() => {
            setPlanWindow(null)
            setPanel('hot')
          }}
          onBack={backToSky}
        />
      )}
      {panel === 'location' && (
        <LocationSheet
          onBack={backToSky}
          onHome={() => {
            sky.setLoc(HOME)
            backToSky()
          }}
          onUseMine={() =>
            navigator.geolocation?.getCurrentPosition(
              (p) => {
                sky.setLoc({
                  latitudeDeg: p.coords.latitude,
                  longitudeDeg: p.coords.longitude,
                  elevationM: p.coords.altitude ?? 0,
                })
                backToSky()
              },
              () => {
                /* denied — keep the previous location, per the error philosophy */
              },
            )
          }
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------

function positionOf(s: ScoredTarget, when: Date, loc: GeoLocation) {
  const tt = s.target
  const h =
    tt.type === 'deep-sky'
      ? fixedHorizontal(tt.raHoursJ2000, tt.decDegJ2000, when, loc, 'normal')
      : bodyHorizontal(tt.body, when, loc, 'normal')
  return { altDeg: h.altitudeDeg, azDeg: h.azimuthDeg }
}

function Ring({ score }: { score: number }) {
  const s = Math.round(score)
  const colour = s >= 75 ? 'var(--good)' : s >= 50 ? 'var(--fair)' : 'var(--poor)'
  return (
    // Matches the photograph bead's footprint, so a row with no verified
    // picture still lines up with the rows that have one.
    <svg className="ring" width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="21" fill="none" stroke={colour} strokeWidth="1.5" opacity="0.85" />
      <text className="ring-num" x="24" y="25" textAnchor="middle" dominantBaseline="middle">{s}</text>
    </svg>
  )
}

function Sheet({
  title, onBack, children, collapsed, onToggle,
}: {
  title: string
  onBack?: () => void
  collapsed?: boolean
  onToggle?: () => void
  children: React.ReactNode
}) {
  return (
    <section className={`sheet${collapsed ? ' collapsed' : ''}`} role="dialog" aria-label={title}>
      <button
        className="grabber"
        onClick={onToggle ?? onBack}
        aria-label={`${collapsed ? 'Open' : 'Close'} ${title}`}
      >
        <span className="label">{title}</span>
        <span className="label" aria-hidden="true">
          {onToggle ? (collapsed ? '↑' : '↓') : onBack ? '✕' : collapsed ? '↑' : '↓'}
        </span>
      </button>
      <hr className="hairline" />
      <div className="sheet-body">
        {children}
        {onBack && <button className="backtosky" onClick={onBack}>{t('back.toSky')}</button>}
      </div>
    </section>
  )
}

function kindLabel(s: ScoredTarget): string {
  return s.target.kind.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}
function displayName(s: ScoredTarget): string {
  return ('commonName' in s.target && s.target.commonName) || s.target.name
}

/**
 * The object's own photograph, leading its row.
 *
 * A target with no verified photograph gets an EMPTY slot of the same size,
 * not a stand-in image. Holding the space keeps every name on the same left
 * edge; filling it with a generic picture would be the fabrication the app
 * refuses everywhere else.
 */
function RowThumb({ s }: { s: ScoredTarget }) {
  if (!hasThumb(s.target.id)) return <span className="row-thumb row-thumb-none" aria-hidden="true" />
  return (
    <img
      className="row-thumb"
      src={`/thumbs/${s.target.id}.webp`}
      alt=""
      loading="lazy"
      decoding="async"
    />
  )
}

function TargetRow({ s, onSelect }: { s: ScoredTarget; onSelect: (id: string) => void }) {
  const hasCommon = 'commonName' in s.target && s.target.commonName
  return (
    <button className="row" onClick={() => onSelect(s.target.id)}>
      <RowThumb s={s} />
      <span className="row-main">
        <span className="row-name">{displayName(s)}</span>
        <span className="row-sub">
          {hasCommon ? `${s.target.name} · ` : ''}{kindLabel(s)} ·{' '}
          {Math.round(s.observability.peakAltitudeDeg)}° {compass(s.observability.peakAzimuthDeg)}
        </span>
      </span>
      <Ring score={s.observability.finalScore} />
    </button>
  )
}

type Sky = ReturnType<typeof useSky>

/**
 * One line answering the question asked at the back door: is it worth taking
 * the telescope out?
 *
 * Deliberately one line. The scores below already carry the detail, and a
 * weather panel on top of them would be two ways of saying the same thing.
 * When no cloud reading exists it says so — it never implies a clear night by
 * staying quiet.
 */

/**
 * The only thing the app will ever say about the Sun.
 *
 * There is no solar filter in the inventory, and the app may only recommend
 * gear that is owned and verified — so there is no version of this screen that
 * offers a way to observe it. It exists to say no, clearly, once.
 */
function SunSheet({ onBack }: { onBack: () => void }) {
  return (
    <Sheet title={t('sun.title')} onBack={onBack}>
      <h2 className="detail-title warn">{t('sun.never')}</h2>
      <p className="note">{t('sun.why')}</p>
      <hr className="hairline sp" />
      <p className="note">{t('sun.finder')}</p>
      <p className="note">{t('sun.shown')}</p>
    </Sheet>
  )
}


/**
 * The month ahead.
 *
 * Computed on open rather than with the rest of the sky: it is a month of
 * nights against the showpiece catalogue, and nobody needs it until they ask
 * for it.
 *
 * The screen is careful about one thing. The positions and timings are exact
 * for the whole month, because orbits are; the weather is only real as far as
 * a forecast reaches. Every row says which it got, so a night three weeks out
 * is never mistaken for a night somebody has actually forecast.
 */
function UpcomingSheet({ sky, now, onBack }: { sky: Sky; now: Date; onBack: () => void }) {
  const picks = useMemo(
    () =>
      upcomingHighlights({
        from: now,
        nights: 30,
        loc: sky.loc,
        targets: UPCOMING_CANDIDATES,
        weather: sky.weather?.samples ?? null,
        limit: 12,
      }),
    [now, sky.loc, sky.weather],
  )

  return (
    <Sheet title={t('upcoming.title')} onBack={onBack}>
      <p className="note mb">{t('upcoming.intro')}</p>
      <hr className="hairline sp" />
      {picks.length === 0 && <p className="note">{t('upcoming.empty')}</p>}
      {picks.map((p) => {
        const target = TARGETS_BY_ID.get(p.targetId)
        if (!target) return null
        const name = ('commonName' in target && target.commonName) || target.name
        return (
          <div className="row static" key={p.targetId}>
            {hasThumb(p.targetId) ? (
              <img className="row-thumb" src={`/thumbs/${p.targetId}.webp`} alt="" loading="lazy" />
            ) : (
              <span className="row-thumb row-thumb-none" aria-hidden="true" />
            )}
            <span className="row-main">
              <span className="row-name">{name}</span>
              <span className="row-sub wrap">
                {formatDate(p.night)} · {formatTime(p.bestTime)} ·{' '}
                {Math.round(p.peakAltitudeDeg)}° {compass(p.peakAzimuthDeg)}
              </span>
              <span className="row-sub wrap">
                {t('upcoming.usable', p.minutesUseful)} · {t('upcoming.moon', p.moonIlluminatedPct)}
                {' · '}
                {p.forecast === 'included' && p.cloudCoverPct !== null ? (
                  t('upcoming.cloud', p.cloudCoverPct)
                ) : (
                  <em className="muted">{t('upcoming.noForecast')}</em>
                )}
              </span>
            </span>
            <Ring score={p.score} />
          </div>
        )
      })}
    </Sheet>
  )
}


/** Today, yesterday, or the date — a timestamp nobody has to decode. */
function whenPublished(iso: string, now: Date): string {
  const then = new Date(iso)
  const days = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime()) /
      86_400_000,
  )
  if (days <= 0) return t('news.today')
  if (days === 1) return t('news.yesterday')
  return formatDate(then)
}

/**
 * Astronomy news.
 *
 * The feeds are read by the Worker, because most of them send no CORS header
 * and a browser cannot fetch them. Every source is free with no subscription:
 * a headline Dad taps and then cannot read would be worse than no headline.
 *
 * Failure is stated, not hidden. An empty list would read as "nothing has
 * happened lately", which is a different claim from "we could not reach the
 * feeds", so the two are never shown the same way.
 */
function NewsSheet({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<'loading' | 'ok' | 'failed'>('loading')
  const [result, setResult] = useState<NewsResult | null>(null)
  const [attempt, setAttempt] = useState(0)
  const now = useMemo(() => new Date(), [result])

  useEffect(() => {
    const abort = new AbortController()
    setState('loading')
    fetchNews(abort.signal)
      .then((r) => {
        setResult(r)
        setState('ok')
      })
      .catch((e) => {
        if (e?.name !== 'AbortError') setState('failed')
      })
    return () => abort.abort()
  }, [attempt])

  return (
    <Sheet title={t('news.title')} onBack={onBack}>
      {state === 'loading' && <p className="note">{t('news.loading')}</p>}

      {state === 'failed' && (
        <>
          <p className="note warn">{t('news.unavailable')}</p>
          <button className="backtosky" onClick={() => setAttempt((a) => a + 1)}>
            {t('news.retry')}
          </button>
        </>
      )}

      {state === 'ok' && result && (
        <>
          <p className="note mb">{t('news.free')} {t('news.opens')}</p>
          <hr className="hairline sp" />
          {result.items.map((item) => (
            <a
              key={item.url}
              className="row news-row"
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {item.imageUrl ? (
                <img className="news-thumb" src={item.imageUrl} alt="" loading="lazy" decoding="async" />
              ) : (
                <span className="news-thumb news-thumb-none" aria-hidden="true" />
              )}
              <span className="row-main">
                <span className="news-headline">{item.title}</span>
                <span className="row-sub">
                  {item.source} · {whenPublished(item.publishedAt, now)}
                </span>
              </span>
            </a>
          ))}
        </>
      )}
    </Sheet>
  )
}


/**
 * Night vision and the screen lock.
 *
 * Two settings that decide whether the app helps or hinders at the eyepiece.
 * Both state their limits plainly: a red screen is better than a white one but
 * worse than red film, and the wake lock depends on an iOS version the app
 * cannot control. Saying so here is cheaper than him finding out in a field.
 */
function NightSheet({
  settings, onChange, wakeLock, onBack,
}: {
  settings: NightSettings
  onChange: (next: NightSettings) => void
  wakeLock: WakeLockState
  onBack: () => void
}) {
  const awakeValue =
    wakeLock === 'unsupported'
      ? t('night.unsupported')
      : wakeLock === 'failed'
        ? t('night.failed')
        : settings.keepAwake
          ? t('night.on')
          : t('night.off')

  return (
    <Sheet title={t('night.title')} onBack={onBack}>
      <button
        className="row"
        aria-pressed={settings.nightVision}
        onClick={() => onChange({ ...settings, nightVision: !settings.nightVision })}
      >
        <span className="row-main">
          <span className="row-name">{t('night.red')}</span>
          <span className="row-sub wrap">{t('night.redWhy')}</span>
        </span>
        <span className="setting-v" data-on={settings.nightVision}>
          {settings.nightVision ? t('night.on') : t('night.off')}
        </span>
      </button>
      <p className="note">{t('night.redLimit')}</p>

      <hr className="hairline sp" />

      <button
        className="row"
        aria-pressed={settings.keepAwake && wakeLock === 'on'}
        disabled={wakeLock === 'unsupported'}
        onClick={() => onChange({ ...settings, keepAwake: !settings.keepAwake })}
      >
        <span className="row-main">
          <span className="row-name">{t('night.awake')}</span>
          <span className="row-sub wrap">{t('night.awakeWhy')}</span>
        </span>
        <span
          className="setting-v"
          data-on={wakeLock === 'on'}
          data-warn={wakeLock === 'unsupported' || wakeLock === 'failed'}
        >
          {awakeValue}
        </span>
      </button>
      <p className="note">{t('night.awakeNote')}</p>
    </Sheet>
  )
}


/**
 * The logbook.
 *
 * A conventional observing log wants date, telescope, eyepiece, magnification,
 * conditions, object and notes. This app already knows all but one of those,
 * so it writes them itself and asks only for the part no instrument supplies:
 * whether he saw it, and what it looked like. A form with nine empty fields
 * does not get filled in at a telescope in the cold.
 *
 * Misses are worth recording too — "looked, could not find it" is a real
 * result and the thing you want to read back before trying again.
 */
function LogbookSheet({
  entries, onChange, onBack,
}: {
  entries: LogEntry[]
  onChange: (next: LogEntry[]) => void
  onBack: () => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  return (
    <Sheet title={t('log.title')} onBack={onBack}>
      {entries.length === 0 ? (
        <p className="note">{t('log.empty')}</p>
      ) : (
        <p className="note mb">
          {t('log.nights', nightsObserved(entries))} · {t('log.entries', entries.length)}
        </p>
      )}

      {entries.map((e) => (
        <div key={e.id} className="row static logrow">
          {hasThumb(e.targetId) ? (
            <img className="row-thumb" src={`/thumbs/${e.targetId}.webp`} alt="" loading="lazy" />
          ) : (
            <span className="row-thumb row-thumb-none" aria-hidden="true" />
          )}
          <span className="row-main">
            <span className="row-name">{e.targetName}</span>
            <span className="row-sub wrap">
              {formatDate(new Date(e.at))} · {formatTime(new Date(e.at))}
              {e.saw === 'no' ? ` · ${t('log.notSeen')}` : ''}
            </span>
            <span className="row-sub wrap">
              {[
                e.eyepiece,
                e.magnification ? `${e.magnification}×` : null,
                e.altitudeDeg !== null ? `${Math.round(e.altitudeDeg)}°` : null,
                e.cloudCoverPct !== null
                  ? t('upcoming.cloud', e.cloudCoverPct)
                  : t('log.noCloud'),
                e.moonIlluminatedPct !== null ? t('upcoming.moon', e.moonIlluminatedPct) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>

            {editing === e.id ? (
              <>
                <textarea
                  className="logdraft"
                  value={draft}
                  autoFocus
                  placeholder={t('log.notePlaceholder')}
                  onChange={(ev) => setDraft(ev.target.value)}
                />
                <span className="logactions">
                  <button
                    className="linkbtn"
                    onClick={() => {
                      onChange(updateLogNote(e.id, draft.trim()))
                      setEditing(null)
                    }}
                  >
                    {t('log.saved')}
                  </button>
                  <button className="linkbtn" onClick={() => onChange(removeLogEntry(e.id))}>
                    {t('log.remove')}
                  </button>
                </span>
              </>
            ) : (
              <button
                className="linkbtn logedit"
                onClick={() => {
                  setEditing(e.id)
                  setDraft(e.note)
                }}
              >
                {e.note !== '' ? e.note : t('log.note')}
              </button>
            )}
          </span>
        </div>
      ))}
    </Sheet>
  )
}

function ConditionsLine({ sky }: { sky: Sky }) {
  const c = sky.conditions
  const label =
    c.sky === 'clear' ? t('sky.clear')
      : c.sky === 'broken' ? t('sky.broken')
        : c.sky === 'mostly-cloudy' ? t('sky.mostlyCloudy')
          : c.sky === 'overcast' ? t('sky.overcast')
            : t('sky.unknown')

  const worth = sky.tonight.filter((s) => s.observability.finalScore >= SHOWPIECE_FLOOR).length
  const tail =
    c.sky === 'unknown'
      ? t('sky.noCloud')
      : worth === 0
        ? t('sky.worthNone')
        : t('sky.worth', worth)

  return (
    <p className="conditions" data-sky={c.sky}>
      <span className="conditions-dot" aria-hidden="true" />
      <span>{label} — {tail}</span>
    </p>
  )
}

function HotSheet({ sky, onSelect, onOpen }: { sky: Sky; onSelect: (id: string) => void; onOpen: (p: Panel) => void }) {
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const list = showAll ? sky.tonight : sky.tonight.slice(0, 8)
  return (
    <Sheet title={t('hot.title')} collapsed={!open} onToggle={() => setOpen((v) => !v)}>
      <ConditionsLine sky={sky} />
      {sky.tonight.length === 0 && <p className="note">{t('hot.empty')}</p>}
      {list.map((s) => <TargetRow key={s.target.id} s={s} onSelect={onSelect} />)}
      {!showAll && sky.tonight.length > 8 && (
        <button className="row" onClick={() => setShowAll(true)}>
          <span className="row-main">
            <span className="row-name muted">{t('hot.seeAll')} ({sky.tonight.length}) ›</span>
          </span>
        </button>
      )}
      {sky.notableMissing.length > 0 && (
        <>
          {/* Shown here rather than hidden behind a link: "what can I not see
              tonight, and why" is the same question as "what can I see", and
              splitting it across two screens made the answer feel arbitrary.
              Dimmed and unclickable, so they read as context, not choices. */}
          <div className="listhead">{t('notTonight.title')}</div>
          {sky.notableMissing.map((s) => (
            <div key={s.target.id} className="row static row-out">
              <RowThumb s={s} />
              <span className="row-main">
                <span className="row-name">{displayName(s)}</span>
                <span className="row-sub wrap">
                  {s.observability.reason
                    ? t(`reason.${s.observability.reason}` as StringKey)
                    : t('notTonight.title')}
                </span>
              </span>
            </div>
          ))}
        </>
      )}
      <button className="row" onClick={() => onOpen('upcoming')}>
        <span className="row-main">
          <span className="row-name muted">{t('upcoming.open')} ›</span>
        </span>
      </button>
    </Sheet>
  )
}

function NotTonightSheet({ sky, onBack }: { sky: Sky; onBack: () => void }) {
  return (
    <Sheet title={t('notTonight.title')} onBack={onBack}>
      <p className="note">{t('notTonight.intro')}</p>
      {sky.notTonight.slice(0, 30).map((s) => (
        <div key={s.target.id} className="row static">
          <span className="row-main">
            <span className="row-name">{displayName(s)}</span>
            <span className="row-sub">
              {s.observability.reason ? t(`reason.${s.observability.reason}` as StringKey) : '—'}
            </span>
          </span>
        </div>
      ))}
    </Sheet>
  )
}

function DetailSheet({
  s, sky, when, onBack, collapsed, onToggle, onLog, logged,
}: {
  s: ScoredTarget
  sky: Sky
  when: Date
  onBack: () => void
  collapsed?: boolean
  onToggle?: () => void
  onLog: (saw: 'yes' | 'no', setup: ReturnType<typeof setupFor>) => void
  logged: boolean
}) {
  const setup = useMemo(() => setupFor(s, sky.inventory), [s, sky.inventory])
  const o = s.observability
  const img = imageFor(s.target.id)
  const dist = useMemo(() => distanceTo(s.target, when), [s.target, when])

  return (
    <Sheet title={s.target.name} onBack={onBack} collapsed={collapsed} onToggle={onToggle}>
      <h2 className="detail-title">{displayName(s)}</h2>
      <p className="detail-sub">
        {kindLabel(s)}
        {'constellation' in s.target && s.target.constellation ? ` · ${s.target.constellation}` : ''}
      </p>

      <Suspense fallback={<div className="objview objview-skeleton" aria-hidden="true" />}>
        <ObjectView target={s.target} when={when} />
      </Suspense>

      {dist && (
        <div className="distance">
          <span className="distance-v">{formatDistance(dist)}</span>
          <span className="distance-sub">
            {t('detail.lightLeft')} {dist.lightTravel}
            {dist.uncertaintyNote ? ` · ${dist.uncertaintyNote}` : ''}
          </span>
        </div>
      )}

      {img && (
        <p className="credit">
          {img.title} · {img.credit} · {img.license} — {t('detail.imageNote')}
        </p>
      )}

      <div className="scoreline">
        <Ring score={o.finalScore} />
        <div>
          <div className="label">{t('detail.score')}</div>
          <div className="conf">{t(`confidence.${o.confidence}` as StringKey)}</div>
        </div>
      </div>

      <div className="facts">
        <Fact k={t('detail.best')}
          v={o.bestBlock ? `${formatTime(o.bestBlock.start)} – ${formatTime(o.bestBlock.end)}` : formatTime(o.peakAtUtc)}
          sub={t('detail.minutes', o.minutesUseful)} />
        <Fact k={t('detail.look')}
          v={`${compass(o.peakAzimuthDeg)} · ${Math.round(o.peakAltitudeDeg)}° ${t('detail.up')}`}
          sub={formatTime(o.peakAtUtc)} />
        <Fact k={t('detail.use')}
          v={setup.rec
            ? `${setup.rec.eyepiece.brand} ${setup.rec.eyepiece.model}` +
              (setup.rec.eyepiece.focal.kind === 'zoom' ? ` @ ${setup.rec.eyepieceFocalMm} mm` : '') +
              (setup.rec.barlow ? ` + ${setup.rec.barlow.model}` : '')
            : t('detail.noEyepiece')}
          sub={setup.rec
            ? `${Math.round(setup.rec.magnification)}× · ${setup.rec.exitPupilMm.toFixed(1)} mm · ${(setup.rec.trueFovDeg * 60).toFixed(0)}′`
            : undefined} />
        <Fact k={t('detail.filter')} v={setup.rec?.filter ? setup.rec.filter.model : t('detail.noFilter')} />
        <Fact k={t('detail.expect')} v={visualExpectation(s.target.id, s.target.kind)} />
      </div>

      {setup.rec?.reasoning.map((r, i) => <p key={i} className="note">{renderNote(r)}</p>)}
      {setup.rec?.warnings.map((w, i) => <p key={i} className="note warn">{renderNote(w)}</p>)}

      <hr className="hairline sp" />
      <div className="label mb">{t('detail.why')}</div>
      {o.factors.filter((f) => f.weight > 0).map((f) => (
        <div key={f.id} className="fact">
          <span className="label">{t(`factor.${f.id}` as StringKey)}</span>
          <span className="fact-v">
            {Math.round(f.value * 100)}%
            {f.proxy && <span className="chip">{t('chip.proxy')}</span>}
            {f.assumed && <span className="chip">{t('chip.assumed')}</span>}
            <em>{f.explain}</em>
          </span>
        </div>
      ))}
      <p className="note">{t('detail.notAProbability')}</p>

      {/* The app knows the time, the telescope, the eyepiece, the
          magnification, the altitude, the cloud and the Moon. It does not know
          whether he actually saw it — so that is the only thing it asks. A
          miss is worth recording too: "looked, could not find it" is the note
          you want to read before trying again. */}
      <div className="logbtns">
        <button className="logbtn" data-done={logged} onClick={() => onLog('yes', setup)}>
          {logged ? t('log.saved') : t('log.sawIt')}
        </button>
        <button className="logbtn ghost" onClick={() => onLog('no', setup)}>
          {t('log.missedIt')}
        </button>
      </div>
    </Sheet>
  )
}

function Fact({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="fact">
      <span className="label">{k}</span>
      <span className="fact-v">{v}{sub && <em>{sub}</em>}</span>
    </div>
  )
}

/**
 * The menu, and the way into everything else.
 *
 * Two things it was missing. It arrived all at once as a flat list, which read
 * as a settings screen rather than a way in — so the rows now come in one
 * after another, quickly, which costs nothing and makes the sheet feel like it
 * opened rather than appeared. And there was no way to ask for a thing by
 * name: the search grows out of the magnifier rather than sitting there as an
 * empty box, so it is invisible until wanted and immediate once it is.
 */
function MenuSheet({
  onGo, onBack, index, onPick,
}: {
  onGo: (p: Panel) => void
  onBack: () => void
  index: Searchable[]
  onPick: (hit: SearchHit) => void
}) {
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searching) input.current?.focus()
  }, [searching])

  const hits = useMemo(() => search(query, index), [query, index])

  const items: [string, Panel][] = [
    [t('menu.liveSky'), null],
    [t('menu.tonight'), 'tonight'],
    [t('menu.news'), 'news'],
    [t('menu.logbook'), 'logbook'],
    [t('menu.night'), 'night'],
    [t('menu.plan'), 'plan'],
    [t('menu.imaging'), 'imaging'],
    [t('menu.equipment'), 'equipment'],
    [t('menu.location'), 'location'],
    [t('menu.language'), 'language'],
    [t('menu.sources'), 'sources'],
  ]

  return (
    <Sheet title={t('menu.title')} onBack={onBack}>
      <div className="searchrow" data-open={searching}>
        <button
          className="searchbtn"
          aria-label={t('search.open')}
          aria-expanded={searching}
          onClick={() => {
            if (searching && query === '') setSearching(false)
            else setSearching(true)
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
            <path d="M12.8 12.8 17 17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
        <input
          ref={input}
          className="searchinput"
          type="search"
          value={query}
          placeholder={t('search.placeholder')}
          aria-label={t('search.open')}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setSearching(true)}
        />
        {query !== '' && (
          <button className="searchclear" aria-label={t('search.clear')} onClick={() => setQuery('')}>
            ✕
          </button>
        )}
      </div>

      {query !== '' ? (
        <>
          {hits.length === 0 && <p className="note">{t('search.none')}</p>}
          {hits.map((h, i) => (
            <button
              key={`${h.kind}-${h.id}`}
              className="row menurow"
              style={{ animationDelay: `${Math.min(i, 8) * 26}ms` }}
              onClick={() => onPick(h)}
            >
              <span className="row-main">
                <span className="row-name">{h.title}</span>
                <span className="row-sub">{h.subtitle}</span>
              </span>
            </button>
          ))}
        </>
      ) : (
        <>
          {items.map(([label, p], i) => (
            <button
              key={label}
              className="row menurow"
              style={{ animationDelay: `${i * 26}ms` }}
              onClick={() => (p ? onGo(p) : onBack())}
            >
              <span className="row-main"><span className="row-name">{label}</span></span>
              <span className="row-go" aria-hidden="true">›</span>
            </button>
          ))}
          <p className="note">{t('explore.note')}</p>
        </>
      )}
    </Sheet>
  )
}
function EquipmentSheet({ sky, onBack }: { sky: Sky; onBack: () => void }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ brand: '', model: '', focalMm: '' })
  const [err, setErr] = useState<string | null>(null)

  type GearRow = {
    id: string; brand: string; model: string
    verified: boolean; enabled: boolean; provenance: string
  }
  const groups: [string, readonly GearRow[]][] = [
    ['Eyepieces', sky.inventory.eyepieces],
    ['Barlows', sky.inventory.barlows],
    ['Filters', sky.inventory.filters],
  ]

  return (
    <Sheet title={t('menu.equipment')} onBack={onBack}>
      {groups.map(([heading, items]) => (
        <div key={heading}>
          <div className="label mb sp">{heading}</div>
          {items.map((g) => (
            <div key={g.id} className="row static">
              <span className="row-main">
                <span className="row-name">{g.brand} {g.model}</span>
                <span className="row-sub">
                  {g.verified ? `${t('equipment.verified')} ✓` : t('equipment.unverified')}
                </span>
              </span>
              {g.provenance === 'user' && (
                <button
                  className="linkbtn"
                  onClick={() => { removeUserEyepiece(g.id); sky.reloadInventory() }}
                >
                  {t('equipment.remove')}
                </button>
              )}
              <label className="switch">
                <input
                  type="checkbox"
                  checked={g.enabled}
                  onChange={(e) => { setEnabled(g.id, e.target.checked); sky.reloadInventory() }}
                  aria-label={`${g.brand} ${g.model} — ${g.enabled ? t('equipment.on') : t('equipment.off')}`}
                />
                <span aria-hidden="true" />
              </label>
            </div>
          ))}
        </div>
      ))}

      {!adding ? (
        <button className="row" onClick={() => setAdding(true)}>
          <span className="row-main"><span className="row-name muted">{t('equipment.add')} ›</span></span>
        </button>
      ) : (
        <div className="form">
          <div className="label mb sp">{t('equipment.addTitle')}</div>
          <label className="field">
            <span className="label">{t('equipment.brand')}</span>
            <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">{t('equipment.model')}</span>
            <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">{t('equipment.focal')}</span>
            <input inputMode="decimal" value={form.focalMm}
              onChange={(e) => setForm({ ...form, focalMm: e.target.value })} />
          </label>
          {err && <p className="note warn">{err}</p>}
          <p className="note">{t('equipment.newIsUnverified')}</p>
          <button
            className="primary"
            onClick={() => {
              const r = addUserEyepiece({
                brand: form.brand, model: form.model, focalMm: Number(form.focalMm),
              })
              if (r.ok) {
                setAdding(false)
                setForm({ brand: '', model: '', focalMm: '' })
                setErr(null)
                sky.reloadInventory()
              } else setErr(r.reason)
            }}
          >
            {t('equipment.save')}
          </button>
        </div>
      )}

      <p className="note">{t('equipment.unverifiedNote')}</p>
    </Sheet>
  )
}

function PlanSheet({
  loc, now, active, onApply, onClear, onBack,
}: {
  loc: GeoLocation
  now: Date
  active: ObservingWindow | null
  onApply: (w: ObservingWindow) => void
  onClear: () => void
  onBack: () => void
}) {
  const [dateStr, setDateStr] = useState(() => toDateInput(active?.start ?? now))
  const date = useMemo(() => fromDateInput(dateStr), [dateStr])
  const suggested = useMemo(() => windowForDate(date, loc), [date, loc])
  const [fromStr, setFromStr] = useState(() => toTimeInput(active?.start ?? suggested.start))
  const [toStr, setToStr] = useState(() => toTimeInput(active?.end ?? suggested.end))

  // When the date changes, re-suggest sensible times for THAT night rather than
  // keeping clock times that may no longer overlap darkness.
  useEffect(() => {
    setFromStr(toTimeInput(suggested.start))
    setToStr(toTimeInput(suggested.end))
  }, [suggested.start, suggested.end])

  const build = (): ObservingWindow => {
    const start = withTime(suggested.start, fromStr)
    let end = withTime(suggested.end, toStr)
    // An end time earlier than the start means the user meant after midnight.
    if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + 86_400_000)
    return { start, end, stepMinutes: 10 }
  }

  return (
    <Sheet title={t('plan.title')} onBack={onBack}>
      <div className="facts">
        <label className="fact">
          <span className="label">{t('plan.date')}</span>
          <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
        </label>
        <label className="fact">
          <span className="label">{t('plan.from')}</span>
          <input type="time" value={fromStr} onChange={(e) => setFromStr(e.target.value)} />
        </label>
        <label className="fact">
          <span className="label">{t('plan.to')}</span>
          <input type="time" value={toStr} onChange={(e) => setToStr(e.target.value)} />
        </label>
      </div>

      <p className="note">
        {formatDate(date)} · {t('plan.window')} {formatTime(suggested.start)} – {formatTime(suggested.end)}
      </p>
      {!suggested.hasDarkness && <p className="note warn">{t('plan.noDarkness')}</p>}

      <button className="primary" onClick={() => onApply(build())}>{t('plan.show')}</button>
      {active && <button className="linkbtn wide" onClick={onClear}>{t('plan.reset')}</button>}
    </Sheet>
  )
}

function ImagingSheet({ sky, onBack }: { sky: Sky; onBack: () => void }) {
  const plans = useMemo(
    () =>
      sky.tonight
        .map((s) => ({ s, plan: planImaging({ target: s.target, inventory: sky.inventory }) }))
        .sort((a, b) => Number(b.plan.suitable) - Number(a.plan.suitable)),
    [sky.tonight, sky.inventory],
  )
  const suitable = plans.filter((p) => p.plan.suitable)
  const not = plans.filter((p) => !p.plan.suitable).slice(0, 6)

  return (
    <Sheet title={t('imaging.title')} onBack={onBack}>
      <p className="note">{t('imaging.intro')}</p>

      <div className="label mb sp">{t('imaging.suitable')}</div>
      {suitable.length === 0 && <p className="note">{t('hot.empty')}</p>}
      {suitable.map(({ s, plan }) => (
        <div key={s.target.id} className="row static">
          <span className="row-main">
            <span className="row-name">{plan.targetName}</span>
            <span className="row-sub">
              {plan.barlow ? plan.barlow.model : t('imaging.native')} · {plan.effectiveFocalLengthMm} mm · f/{plan.effectiveFocalRatio}
            </span>
          </span>
        </div>
      ))}
      {suitable[0]?.plan.notes.map((n, i) => <p key={i} className="note">{n}</p>)}

      <div className="label mb sp">{t('imaging.notSuitable')}</div>
      {not.map(({ s, plan }) => (
        <div key={s.target.id} className="row static">
          <span className="row-main">
            <span className="row-name">{plan.targetName}</span>
            <span className="row-sub wrap">{plan.reason}</span>
          </span>
        </div>
      ))}
    </Sheet>
  )
}

/**
 * The observer's dashboard: everything checked before going out, in one place.
 *
 * Kept to hairline rules and tabular figures rather than cards and icons —
 * this is a reference panel, and an enthusiast reads it by scanning columns.
 */
function TonightSheet({ sky, when, onBack }: { sky: Sky; when: Date; onBack: () => void }) {
  const moon = useMemo(() => moonReport(when, sky.loc), [when, sky.loc])
  const sun = useMemo(() => sunReport(when, sky.loc), [when, sky.loc])
  const planets = useMemo(() => planetRows(when, sky.loc), [when, sky.loc])
  const lst = useMemo(() => localSiderealHours(when, sky.loc), [when, sky.loc])
  const showers = useMemo(() => activeShowers(when), [when])

  const wx = sky.weather?.samples?.[0] ?? null
  const dew = dewRisk(wx?.temperatureC ?? null, wx?.dewPointC ?? null)

  const lstH = Math.floor(lst)
  const lstM = Math.floor((lst - lstH) * 60)

  return (
    <Sheet title={t('menu.tonight')} onBack={onBack}>
      {/* ---------------------------------------------------------- Moon */}
      <div className="label mb sp">{t('tonight.moon')}</div>
      <div className="dash">
        <Cell k={t('tonight.phase')} v={moon.phaseName} />
        <Cell k={t('tonight.illum')} v={`${moon.illuminatedPct}%`} />
        <Cell k={t('tonight.age')} v={`${moon.ageDays} d`} />
        <Cell k={t('detail.up')} v={`${moon.altitudeDeg}°`} />
        <Cell k={t('tonight.moonrise')} v={formatTime(moon.rise)} />
        <Cell k={t('tonight.moonset')} v={formatTime(moon.set)} />
        <Cell k={t('tonight.newMoon')} v={moon.nextNew ? formatDate(moon.nextNew) : '—'} />
        <Cell k={t('tonight.fullMoon')} v={moon.nextFull ? formatDate(moon.nextFull) : '—'} />
      </div>
      <p className="note">
        {moon.favourable ? t('tonight.moonGood') : t('tonight.moonBad')}
      </p>

      {/* -------------------------------------------------------- Darkness */}
      <div className="label mb sp">{t('tonight.darkness')}</div>
      <div className="dash">
        <Cell k={t('tonight.sunset')} v={formatTime(sun.set)} />
        <Cell k={t('tonight.civil')} v={formatTime(sun.civilDusk)} />
        <Cell k={t('tonight.nautical')} v={formatTime(sun.nauticalDusk)} />
        <Cell k={t('tonight.astro')} v={formatTime(sun.astroDusk)} />
        <Cell k={t('tonight.dawn')} v={formatTime(sun.astroDawn)} />
        <Cell k={t('tonight.sunrise')} v={formatTime(sun.rise)} />
      </div>
      {sun.darkHours !== null && (
        <p className="note">{t('tonight.darkFor')} <strong>{sun.darkHours} h</strong></p>
      )}
      {/* The one place the Sun is discussed is the one place it must be
          refused. Reachable deliberately, not only by tapping it in the sky. */}
      <p className="note warn">{t('sun.never')} {t('sun.why')}</p>

      {/* ------------------------------------------------------------- Sky */}
      <div className="label mb sp">{t('tonight.sky')}</div>
      <div className="dash">
        <Cell k={t('tonight.lst')} v={`${String(lstH).padStart(2, '0')}h ${String(lstM).padStart(2, '0')}m`} />
        <Cell
          k={t('tonight.cloud')}
          v={wx?.cloudCoverPct !== null && wx?.cloudCoverPct !== undefined ? `${wx.cloudCoverPct}%` : '—'}
        />
        <Cell k={t('tonight.humidity')} v={wx?.relativeHumidityPct !== null && wx?.relativeHumidityPct !== undefined ? `${wx.relativeHumidityPct}%` : '—'} />
        <Cell k={t('tonight.temp')} v={wx?.temperatureC !== null && wx?.temperatureC !== undefined ? `${wx.temperatureC}°C` : '—'} />
      </div>
      <p className="note">{t('tonight.lstNote')}</p>
      {dew && (
        <p className={`note${dew.level === 'high' ? ' warn' : ''}`}>
          {t(`tonight.dew.${dew.level}` as StringKey)} ({dew.spreadC}°C)
        </p>
      )}
      {!wx && <p className="note">{t('weather.unavailable')}</p>}

      {/* --------------------------------------------------------- Planets */}
      <div className="label mb sp">{t('tonight.planets')}</div>
      {planets.map((p) => (
        <div key={p.id} className="dashrow">
          <span className="dashrow-n">{p.name}</span>
          <span className="dashrow-v">
            {p.up ? `${p.altitudeDeg}° ${compass(p.azimuthDeg)}` : t('tonight.down')}
          </span>
          <span className="dashrow-m">{p.magnitude !== null ? `m ${p.magnitude}` : ''}</span>
        </div>
      ))}

      {/* --------------------------------------------------------- Showers */}
      {showers.length > 0 && (
        <>
          <div className="label mb sp">{t('tonight.showers')}</div>
          {showers.map((sh) => (
            <div key={sh.name} className="dashrow">
              <span className="dashrow-n">{sh.name}</span>
              <span className="dashrow-v">{sh.peak}</span>
              <span className="dashrow-m">ZHR {sh.zhr}</span>
            </div>
          ))}
          <p className="note">{t('tonight.zhrNote')}</p>
        </>
      )}

      {/* ------------------------------------------------------- Eyepieces */}
      <div className="label mb sp">{t('tonight.eyepieces')}</div>
      {sky.inventory.eyepieces
        .filter((e) => e.enabled && e.verified)
        .map((e) => {
          const fl = e.focal.kind === 'fixed' ? e.focal.focalMm : e.focal.minMm
          const fl2 = e.focal.kind === 'zoom' ? e.focal.maxMm : null
          const m1 = Math.round(magnification(fl))
          const m2 = fl2 ? Math.round(magnification(fl2)) : null
          return (
            <div key={e.id} className="dashrow">
              <span className="dashrow-n">{e.model}</span>
              <span className="dashrow-v">{m2 ? `${m2}–${m1}×` : `${m1}×`}</span>
              <span className="dashrow-m">{exitPupilMm(fl).toFixed(1)} mm</span>
            </div>
          )
        })}
      <p className="note">
        {TELESCOPE.name} · {TELESCOPE.apertureMm} mm · {TELESCOPE.focalLengthMm} mm
      </p>
    </Sheet>
  )
}

function Cell({ k, v }: { k: string; v: string }) {
  return (
    <div className="cell">
      <span className="cell-k">{k}</span>
      <span className="cell-v">{v}</span>
    </div>
  )
}

function SourcesSheet({ onBack }: { onBack: () => void }) {
  const sources = sourcesForDisplay()
  const assumptions = sources.filter((s) => s.kind === 'assumption')
  const rest = sources.filter((s) => s.kind !== 'assumption')
  return (
    <Sheet title={t('sources.title')} onBack={onBack}>
      <p className="note">{t('sources.note')}</p>
      {/* The Free Art License permits use and modification and REQUIRES
          attribution. This is that attribution, not a courtesy. */}
      <p className="note">{t('sources.figures')}</p>
      <div className="label mb sp">{t('sources.assumptions')}</div>
      {assumptions.map((s) => (
        <div key={s.id} className="fact">
          <span className="label">{s.status}</span>
          <span className="fact-v">{s.title}<em>{s.citation}</em></span>
        </div>
      ))}
      <div className="label mb sp">{t('sources.data')}</div>
      {rest.map((s) => (
        <div key={s.id} className="fact">
          <span className="label">{s.kind}</span>
          <span className="fact-v">
            {s.title}
            <em>{s.citation}{s.license ? ` · ${s.license}` : ''}</em>
          </span>
        </div>
      ))}
    </Sheet>
  )
}

function LanguageSheet({ onBack }: { onBack: () => void }) {
  const cur = getLang()
  return (
    <Sheet title={t('menu.language')} onBack={onBack}>
      {LANGUAGES.map((l) => (
        <button key={l.code} className="row" onClick={() => setLang(l.code)} aria-pressed={cur === l.code}>
          <span className="flag" aria-hidden="true">{l.flag}</span>
          <span className="row-main"><span className="row-name">{l.label}</span></span>
          {cur === l.code && <span aria-hidden="true">✓</span>}
        </button>
      ))}
    </Sheet>
  )
}

function LocationSheet({
  onBack, onHome, onUseMine,
}: { onBack: () => void; onHome: () => void; onUseMine: () => void }) {
  return (
    <Sheet title={t('location.title')} onBack={onBack}>
      <button className="row" onClick={onUseMine}>
        <span className="row-main"><span className="row-name">{t('location.use')}</span></span>
      </button>
      <button className="row" onClick={onHome}>
        <span className="row-main"><span className="row-name">{t('location.home')}</span></span>
      </button>
      <p className="note">{t('location.note')}</p>
    </Sheet>
  )
}

/**
 * Scrubbing time, without a slider.
 *
 * The old control was a labelled track with a thumb across the bottom of the
 * sky — three elements and a lot of chrome to move one number. Here the number
 * IS the control: drag it sideways to move through the night, tap it to come
 * back to now. Nothing is drawn that is not the answer.
 */
function ExploreBar({
  when, onChange, onReset,
}: { when: Date; onChange: (d: Date) => void; onReset: () => void }) {
  // Hours from the anchor, so dragging scrubs forward and back through it.
  const [offset, setOffset] = useState(0)
  const base = useMemo(() => new Date(when.getTime() - offset * 3_600_000), [])
  const drag = useRef<{ x: number; from: number; moved: boolean } | null>(null)
  const [dragging, setDragging] = useState(false)

  const apply = (hours: number) => {
    const clamped = Math.max(-12, Math.min(12, hours))
    setOffset(clamped)
    onChange(new Date(base.getTime() + clamped * 3_600_000))
  }

  return (
    <div className="timepill-wrap">
      <button
        className="timepill"
        data-dragging={dragging}
        aria-label={t('explore.time')}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, from: offset, moved: false }
          setDragging(true)
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          const dx = e.clientX - d.x
          if (Math.abs(dx) > 3) d.moved = true
          // A full screen width is about eight hours: fine enough to land on a
          // minute, coarse enough to cross the night in one gesture.
          apply(d.from + (dx / Math.max(240, window.innerWidth)) * 8)
        }}
        onPointerUp={() => {
          const moved = drag.current?.moved
          drag.current = null
          setDragging(false)
          // A tap, not a drag, means "back to now".
          if (!moved) {
            setOffset(0)
            onReset()
          }
        }}
      >
        <span className="timepill-v">{formatTime(when)}</span>
        <span className="timepill-hint" aria-hidden="true">
          {offset === 0 ? t('explore.scrub') : t('explore.now')}
        </span>
      </button>
    </div>
  )
}

export { TARGETS_BY_ID }
