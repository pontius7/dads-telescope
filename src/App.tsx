import { useEffect, useMemo, useState } from 'react'
import { SkyScene } from './sky/SkyScene'
import { useSky, setupFor, compass, formatTime, type ScoredTarget } from './useSky'
import { bodyHorizontal, fixedHorizontal, HOME } from './domain/ephemeris'
import { sourcesForDisplay } from './data/evidence'
import { DEFAULT_INVENTORY } from './data/inventory'
import { describeFreshness } from './services/weather'
import { t } from './i18n'

type Panel = 'hot' | 'detail' | 'notTonight' | 'menu' | 'equipment' | 'sources' | 'location' | null

export default function App() {
  // One clock for the whole app, ticking slowly. The sky moves; weather does not
  // refetch on every tick.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const sky = useSky(now)
  const [panel, setPanel] = useState<Panel>('hot')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoomNudge, setZoomNudge] = useState(0)

  const selected = useMemo(
    () => sky.tonight.find((s) => s.target.id === selectedId) ?? null,
    [sky.tonight, selectedId],
  )

  const flyTo = useMemo(() => {
    if (!selected) return null
    const tt = selected.target
    const h =
      tt.type === 'deep-sky'
        ? fixedHorizontal(tt.raHoursJ2000, tt.decDegJ2000, now, sky.loc, 'normal')
        : bodyHorizontal(tt.body, now, sky.loc, 'normal')
    return { altDeg: h.altitudeDeg, azDeg: h.azimuthDeg }
  }, [selected, now, sky.loc])

  // Where to look when the app opens: at the best target available.
  const initialView = useMemo(() => {
    const best = sky.markers[0]
    if (!best) return null
    const tt = best.target
    const h =
      tt.type === 'deep-sky'
        ? fixedHorizontal(tt.raHoursJ2000, tt.decDegJ2000, now, sky.loc, 'normal')
        : bodyHorizontal(tt.body, now, sky.loc, 'normal')
    return { altDeg: h.altitudeDeg, azDeg: h.azimuthDeg }
    // Intentionally computed once, from the first non-empty marker list, so the
    // view does not jump every time the clock ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sky.markers.length > 0])

  const select = (id: string | null) => {
    setSelectedId(id)
    setPanel(id ? 'detail' : 'hot')
  }

  const backToSky = () => {
    setSelectedId(null)
    setPanel('hot')
  }

  // ESC closes secondary panels on desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') backToSky()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <SkyScene
        loc={sky.loc}
        when={now}
        targets={sky.markers}
        selectedId={selectedId}
        onSelect={select}
        flyTo={flyTo}
        zoomNudge={zoomNudge}
        initialView={initialView}
      />

      <div className="topbar">
        <button className="place" onClick={() => setPanel('location')}>
          <strong>{sky.loc === HOME || sky.loc.latitudeDeg === HOME.latitudeDeg ? 'Mays Landing, NJ' : 'Custom location'}</strong>
          <span>
            {sky.weather
              ? sky.weather.provider === 'none'
                ? t('weather.unavailable')
                : describeFreshness(sky.weather, now)
              : 'Checking sky…'}
          </span>
        </button>
        <button className="iconbtn" aria-label="Menu" onClick={() => setPanel('menu')}>
          <svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true">
            <path d="M0 1h20M0 7h20M0 13h20" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
      </div>

      <div className="zoom">
        <button aria-label="Zoom in" onClick={() => setZoomNudge((z) => z - 6)}>−</button>
        <button aria-label="Zoom out" onClick={() => setZoomNudge((z) => z + 6)}>+</button>
      </div>

      {panel === 'hot' && <HotSheet sky={sky} onSelect={select} onOpen={setPanel} />}
      {panel === 'detail' && selected && (
        <DetailSheet s={selected} now={now} onBack={backToSky} />
      )}
      {panel === 'notTonight' && <NotTonightSheet sky={sky} onBack={() => setPanel('hot')} />}
      {panel === 'menu' && <MenuSheet onGo={setPanel} onBack={backToSky} />}
      {panel === 'equipment' && <EquipmentSheet onBack={backToSky} />}
      {panel === 'sources' && <SourcesSheet onBack={backToSky} />}
      {panel === 'location' && (
        <LocationSheet
          onBack={backToSky}
          onHome={() => {
            sky.setLoc(HOME)
            backToSky()
          }}
          onUseMine={() => {
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
          }}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------

function Ring({ score }: { score: number }) {
  const s = Math.round(score)
  const colour = s >= 75 ? 'var(--good)' : s >= 50 ? 'var(--fair)' : 'var(--poor)'
  return (
    <svg className="ring" width="42" height="42" viewBox="0 0 42 42" aria-hidden="true">
      <circle cx="21" cy="21" r="18" fill="none" stroke={colour} strokeWidth="1.4" opacity="0.85" />
      <text className="ring-num" x="21" y="22" textAnchor="middle" dominantBaseline="middle">
        {s}
      </text>
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
    <section
      className={`sheet${collapsed ? ' collapsed' : ''}`}
      role="dialog"
      aria-label={title}
      aria-expanded={collapsed ? false : true}
    >
      <button className="grabber" onClick={onToggle ?? onBack} aria-label={`${collapsed ? 'Open' : 'Close'} ${title}`}>
        <span className="label">{title}</span>
        <span className="label" aria-hidden="true">{onBack ? '✕' : collapsed ? '↑' : '↓'}</span>
      </button>
      <hr className="hairline" />
      <div className="sheet-body">
        {children}
        {onBack && (
          <button className="backtosky" onClick={onBack}>
            {t('back.toSky')}
          </button>
        )}
      </div>
    </section>
  )
}

function TargetRow({ s, onSelect }: { s: ScoredTarget; onSelect: (id: string) => void }) {
  const name = ('commonName' in s.target && s.target.commonName) || s.target.name
  const sub =
    'commonName' in s.target && s.target.commonName ? `${s.target.name} · ${kindLabel(s)}` : kindLabel(s)
  return (
    <button className="row" onClick={() => onSelect(s.target.id)}>
      <Ring score={s.observability.finalScore} />
      <span className="row-main">
        <span className="row-name">{name}</span>
        <span className="row-sub">
          {sub} · {Math.round(s.observability.peakAltitudeDeg)}° {compass(s.observability.peakAzimuthDeg)}
        </span>
      </span>
    </button>
  )
}

function kindLabel(s: ScoredTarget): string {
  const k = s.target.kind
  return k.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

function HotSheet({
  sky, onSelect, onOpen,
}: {
  sky: ReturnType<typeof useSky>
  onSelect: (id: string) => void
  onOpen: (p: Panel) => void
}) {
  // Starts CLOSED: the sky is the application, and this is a handle over it.
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const list = showAll ? sky.tonight : sky.tonight.slice(0, 8)
  return (
    <Sheet title={t('hot.title')} collapsed={!open} onToggle={() => setOpen((v) => !v)}>
      {sky.tonight.length === 0 && (
        <p className="note">Nothing is above the horizon during tonight's dark window.</p>
      )}
      {list.map((s) => (
        <TargetRow key={s.target.id} s={s} onSelect={onSelect} />
      ))}
      {!showAll && sky.tonight.length > 8 && (
        <button className="row" onClick={() => setShowAll(true)}>
          <span className="row-main">
            <span className="row-name" style={{ color: 'var(--muted)' }}>
              {t('hot.seeAll')} ({sky.tonight.length}) ›
            </span>
          </span>
        </button>
      )}
      {sky.notableMissing.length > 0 && (
        <button className="row" onClick={() => onOpen('notTonight')}>
          <span className="row-main">
            <span className="row-name" style={{ color: 'var(--muted)' }}>
              {t('hot.notTonight', sky.notableMissing.length)} ›
            </span>
          </span>
        </button>
      )}
    </Sheet>
  )
}

function NotTonightSheet({
  sky, onBack,
}: {
  sky: ReturnType<typeof useSky>
  onBack: () => void
}) {
  return (
    <Sheet title={t('notTonight.title')} onBack={onBack}>
      <p className="note">
        These are worth knowing about, but not available during tonight's window. They are kept out
        of the main list rather than shown at 0%.
      </p>
      {sky.notTonight.slice(0, 24).map((s) => (
        <div key={s.target.id} className="row" style={{ cursor: 'default' }}>
          <span className="row-main">
            <span className="row-name">
              {('commonName' in s.target && s.target.commonName) || s.target.name}
            </span>
            <span className="row-sub">
              {s.observability.reason ? t(`reason.${s.observability.reason}` as never) : '—'}
            </span>
          </span>
        </div>
      ))}
    </Sheet>
  )
}

function DetailSheet({ s, now, onBack }: { s: ScoredTarget; now: Date; onBack: () => void }) {
  const setup = useMemo(() => setupFor(s), [s])
  const o = s.observability
  const name = ('commonName' in s.target && s.target.commonName) || s.target.name
  const conf = t(`confidence.${o.confidence}` as never)

  return (
    <Sheet title={s.target.name} onBack={onBack}>
      <h2 className="detail-title">{name}</h2>
      <p className="detail-sub">
        {kindLabel(s)}
        {'constellation' in s.target && s.target.constellation ? ` · ${s.target.constellation}` : ''}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
        <Ring score={o.finalScore} />
        <div>
          <div className="label">{t('detail.score')}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{conf}</div>
        </div>
      </div>

      <div className="facts">
        <div className="fact">
          <span className="label">{t('detail.best')}</span>
          <span className="fact-v">
            {o.bestBlock
              ? `${formatTime(o.bestBlock.start)} – ${formatTime(o.bestBlock.end)}`
              : formatTime(o.peakAtUtc)}
            <em>{o.minutesUseful} minutes usable tonight</em>
          </span>
        </div>
        <div className="fact">
          <span className="label">{t('detail.look')}</span>
          <span className="fact-v">
            {compass(o.peakAzimuthDeg)} · {Math.round(o.peakAltitudeDeg)}° up
            <em>at {formatTime(o.peakAtUtc)}</em>
          </span>
        </div>
        <div className="fact">
          <span className="label">{t('detail.use')}</span>
          <span className="fact-v">
            {setup.rec ? (
              <>
                {setup.rec.eyepiece.brand} {setup.rec.eyepiece.model}
                {setup.rec.eyepiece.focal.kind === 'zoom' && ` at ${setup.rec.eyepieceFocalMm} mm`}
                {setup.rec.barlow && ` + ${setup.rec.barlow.model}`}
                <em>
                  {Math.round(setup.rec.magnification)}× · {setup.rec.exitPupilMm.toFixed(1)} mm exit
                  pupil · {(setup.rec.trueFovDeg * 60).toFixed(0)}′ field
                </em>
              </>
            ) : (
              'No suitable eyepiece'
            )}
          </span>
        </div>
        <div className="fact">
          <span className="label">{t('detail.filter')}</span>
          <span className="fact-v">{setup.rec?.filter ? setup.rec.filter.model : t('detail.noFilter')}</span>
        </div>
      </div>

      {setup.rec?.reasoning.map((r, i) => (
        <p key={i} className="note">{r}</p>
      ))}
      {setup.rec?.warnings.map((w, i) => (
        <p key={i} className="note warn">{w}</p>
      ))}

      <hr className="hairline" style={{ margin: '16px 0 12px' }} />
      <div className="label" style={{ marginBottom: 8 }}>Why this score</div>
      {o.factors
        .filter((f) => f.weight > 0)
        .map((f) => (
          <div key={f.id} className="fact">
            <span className="label">{f.label}</span>
            <span className="fact-v">
              {Math.round(f.value * 100)}%
              {f.proxy && <span className="chip" style={{ marginLeft: 8 }}>proxy</span>}
              {f.assumed && <span className="chip" style={{ marginLeft: 8 }}>assumed</span>}
              <em>{f.explain}</em>
            </span>
          </div>
        ))}
      <p className="note">
        An observability score, not a probability of seeing something. Time shown for {formatTime(now)}.
      </p>
    </Sheet>
  )
}

function MenuSheet({ onGo, onBack }: { onGo: (p: Panel) => void; onBack: () => void }) {
  const items: [string, Panel][] = [
    [t('menu.liveSky'), null],
    [t('menu.equipment'), 'equipment'],
    [t('menu.location'), 'location'],
    [t('menu.sources'), 'sources'],
  ]
  return (
    <Sheet title="Menu" onBack={onBack}>
      {items.map(([label, p]) => (
        <button key={label} className="row" onClick={() => (p ? onGo(p) : onBack())}>
          <span className="row-main"><span className="row-name">{label}</span></span>
        </button>
      ))}
      <p className="note">
        Plan Observing, Explore Sky, Imaging and Crnogorski are not built yet.
      </p>
    </Sheet>
  )
}

function EquipmentSheet({ onBack }: { onBack: () => void }) {
  const all = [
    ...DEFAULT_INVENTORY.eyepieces,
    ...DEFAULT_INVENTORY.barlows,
    ...DEFAULT_INVENTORY.filters,
  ]
  return (
    <Sheet title={t('menu.equipment')} onBack={onBack}>
      {all.map((g) => (
        <div key={g.id} className="row" style={{ cursor: 'default' }}>
          <span className="row-main">
            <span className="row-name">{g.brand} {g.model}</span>
            <span className="row-sub">
              {g.verified ? t('equipment.verified') : t('equipment.unverified')}
              {g.verified && ' ✓'}
            </span>
          </span>
        </div>
      ))}
      <p className="note">{t('equipment.unverifiedNote')}</p>
    </Sheet>
  )
}

function SourcesSheet({ onBack }: { onBack: () => void }) {
  const sources = sourcesForDisplay()
  const assumptions = sources.filter((s) => s.kind === 'assumption')
  const rest = sources.filter((s) => s.kind !== 'assumption')
  return (
    <Sheet title={t('menu.sources')} onBack={onBack}>
      <p className="note">{t('sources.note')}</p>
      <div className="label" style={{ margin: '16px 0 6px' }}>{t('sources.assumptions')}</div>
      {assumptions.map((s) => (
        <div key={s.id} className="fact">
          <span className="label">{s.status}</span>
          <span className="fact-v">{s.title}<em>{s.citation}</em></span>
        </div>
      ))}
      <div className="label" style={{ margin: '18px 0 6px' }}>Data and formulas</div>
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

function LocationSheet({
  onBack, onHome, onUseMine,
}: {
  onBack: () => void
  onHome: () => void
  onUseMine: () => void
}) {
  return (
    <Sheet title={t('menu.location')} onBack={onBack}>
      <button className="row" onClick={onUseMine}>
        <span className="row-main"><span className="row-name">{t('location.use')}</span></span>
      </button>
      <button className="row" onClick={onHome}>
        <span className="row-main"><span className="row-name">{t('location.home')}</span></span>
      </button>
      <p className="note">
        Your location is stored only on this device and is never sent anywhere. The home setting is
        the 08330 ZIP centroid, not a street address.
      </p>
    </Sheet>
  )
}
