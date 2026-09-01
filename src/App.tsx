import { useEffect, useMemo, useState, useSyncExternalStore, lazy, Suspense } from 'react'
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
import { describeFreshness } from './services/weather'
import { useOrientation } from './useOrientation'
import { PointingHUD } from './PointingHUD'
import { hasThumb } from './sky/thumbs'
import { t, renderNote, setLang, getLang, subscribe, LANGUAGES, type StringKey } from './i18n'

type Panel =
  | 'hot' | 'detail' | 'notTonight' | 'menu'
  | 'equipment' | 'sources' | 'location' | 'language'
  | 'plan' | 'imaging' | 'tonight' | null

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
  const [zoomNudge, setZoomNudge] = useState(0)
  const [explore, setExplore] = useState(false)
  const [exploreTime, setExploreTime] = useState<Date | null>(null)

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
          zoomNudge={zoomNudge}
          initialView={initialView}
          explore={explore}
          pose={sensorOn ? orient.pose : null}
          accuracy={orient.accuracy}
          guideTo={sensorOn ? guideTo : null}
          guideName={selected ? displayName(selected) : null}
        />
      </Suspense>

      <div className="topbar">
        <button className="place" onClick={() => setPanel('location')}>
          <strong>{sky.loc.latitudeDeg === HOME.latitudeDeg ? 'Mays Landing, NJ' : 'Custom location'}</strong>
          <span>
            {planWindow
              ? `${formatTime(planWindow.start)} – ${formatTime(planWindow.end)}`
              : sky.weather
                ? sky.weather.provider === 'none'
                  ? t('weather.unavailable')
                  : describeFreshness(sky.weather, now)
                : t('weather.checking')}
          </span>
        </button>

        <div className="topbar-right">
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
            <svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true">
              <path d="M0 1h20M0 7h20M0 13h20" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
        </div>
      </div>

      {explore && (
        <ExploreBar
          when={when}
          onChange={setExploreTime}
          onReset={() => setExploreTime(new Date(now))}
        />
      )}

      <div className="zoom">
        <button aria-label="Zoom in" onClick={() => setZoomNudge((z) => z - 6)}>−</button>
        <button aria-label="Zoom out" onClick={() => setZoomNudge((z) => z + 6)}>+</button>
      </div>

      {orient.state !== 'unsupported' && (
        <button
          className={`sensorbtn${sensorOn ? ' on' : ''}`}
          onClick={() => (sensorOn ? orient.stop() : void orient.start())}
        >
          {sensorOn ? t('sensor.exit') : t('sensor.enable')}
        </button>
      )}
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
        />
      )}
      {panel === 'notTonight' && <NotTonightSheet sky={sky} onBack={() => setPanel('hot')} />}
      {panel === 'menu' && <MenuSheet onGo={setPanel} onBack={backToSky} />}
      {panel === 'equipment' && <EquipmentSheet sky={sky} onBack={backToSky} />}
      {panel === 'sources' && <SourcesSheet onBack={backToSky} />}
      {panel === 'language' && <LanguageSheet onBack={backToSky} />}
      {panel === 'imaging' && <ImagingSheet sky={sky} onBack={backToSky} />}
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

function HotSheet({ sky, onSelect, onOpen }: { sky: Sky; onSelect: (id: string) => void; onOpen: (p: Panel) => void }) {
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const list = showAll ? sky.tonight : sky.tonight.slice(0, 8)
  return (
    <Sheet title={t('hot.title')} collapsed={!open} onToggle={() => setOpen((v) => !v)}>
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
        <button className="row" onClick={() => onOpen('notTonight')}>
          <span className="row-main">
            <span className="row-name muted">{t('hot.notTonight', sky.notableMissing.length)} ›</span>
          </span>
        </button>
      )}
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
  s, sky, when, onBack, collapsed, onToggle,
}: {
  s: ScoredTarget
  sky: Sky
  when: Date
  onBack: () => void
  collapsed?: boolean
  onToggle?: () => void
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

function MenuSheet({ onGo, onBack }: { onGo: (p: Panel) => void; onBack: () => void }) {
  const items: [string, Panel][] = [
    [t('menu.liveSky'), null],
    [t('menu.tonight'), 'tonight'],
    [t('menu.plan'), 'plan'],
    [t('menu.imaging'), 'imaging'],
    [t('menu.equipment'), 'equipment'],
    [t('menu.location'), 'location'],
    [t('menu.language'), 'language'],
    [t('menu.sources'), 'sources'],
  ]
  return (
    <Sheet title={t('menu.title')} onBack={onBack}>
      {items.map(([label, p]) => (
        <button key={label} className="row" onClick={() => (p ? onGo(p) : onBack())}>
          <span className="row-main"><span className="row-name">{label}</span></span>
        </button>
      ))}
      <p className="note">{t('explore.note')}</p>
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

function ExploreBar({
  when, onChange, onReset,
}: { when: Date; onChange: (d: Date) => void; onReset: () => void }) {
  // Hours offset from the anchor, so dragging scrubs forward and back in time.
  const [offset, setOffset] = useState(0)
  const base = useMemo(() => new Date(when.getTime() - offset * 3_600_000), [])
  return (
    <div className="explorebar">
      <span className="label">{t('explore.time')}</span>
      <input
        type="range" min={-12} max={12} step={0.25} value={offset}
        aria-label={t('explore.time')}
        onChange={(e) => {
          const v = Number(e.target.value)
          setOffset(v)
          onChange(new Date(base.getTime() + v * 3_600_000))
        }}
      />
      <button className="linkbtn" onClick={() => { setOffset(0); onReset() }}>
        {formatTime(when)}
      </button>
    </div>
  )
}

export { TARGETS_BY_ID }
