/**
 * The live sky.
 *
 * Everything drawn here sits at its real altitude and azimuth for the selected
 * location and time. Nothing is placed for decoration — if an object is below
 * the horizon it is simply not in the scene.
 */
import { useMemo, useRef, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { fixedHorizontal, bodyHorizontal, type GeoLocation } from '../domain/ephemeris'
import type { ScoredTarget } from '../useSky'

/** Place a point on the celestial sphere from altitude/azimuth. */
export function altAzToVec3(altDeg: number, azDeg: number, r = 100): THREE.Vector3 {
  const alt = (altDeg * Math.PI) / 180
  const az = (azDeg * Math.PI) / 180
  // Azimuth is clockwise from north; +Z is north, +X is east, +Y is up.
  return new THREE.Vector3(
    r * Math.cos(alt) * Math.sin(az),
    r * Math.sin(alt),
    r * Math.cos(alt) * Math.cos(az),
  )
}

/**
 * Background star field, drawn with one instanced draw call.
 *
 * These are real bright stars: a compact built-in list of the brightest naked-
 * eye stars, positioned by J2000 coordinates through the same precession-aware
 * path as everything else, plus a scattering of fainter filler placed by a
 * fixed seed. The filler is explicitly DECORATIVE TEXTURE and is never
 * identified, clicked, or named — the app never claims a filler dot is a star.
 */
const BRIGHT_STARS: [name: string, raH: number, decD: number, mag: number][] = [
  ['Sirius', 6.752478, -16.716116, -1.46],
  ['Arcturus', 14.261036, 19.182410, -0.05],
  ['Vega', 18.615649, 38.783689, 0.03],
  ['Capella', 5.278155, 45.997991, 0.08],
  ['Rigel', 5.242298, -8.201638, 0.13],
  ['Procyon', 7.655033, 5.224993, 0.34],
  ['Betelgeuse', 5.919529, 7.407064, 0.5],
  ['Altair', 19.846388, 8.868321, 0.76],
  ['Aldebaran', 4.598677, 16.509301, 0.86],
  ['Antares', 16.490128, -26.432003, 1.09],
  ['Spica', 13.419883, -11.161319, 1.04],
  ['Pollux', 7.755277, 28.026199, 1.14],
  ['Deneb', 20.690532, 45.280339, 1.25],
  ['Regulus', 10.139532, 11.967208, 1.35],
  ['Castor', 7.576634, 31.888276, 1.58],
  ['Polaris', 2.529750, 89.264109, 1.98],
  ['Alphecca', 15.578131, 26.714693, 2.22],
  ['Eltanin', 17.943437, 51.488896, 2.23],
  ['Alderamin', 21.309661, 62.585574, 2.45],
  ['Kochab', 14.845090, 74.155505, 2.08],
  ['Mizar', 13.398761, 54.925362, 2.23],
  ['Dubhe', 11.062130, 61.750991, 1.79],
  ['Alkaid', 13.792344, 49.313265, 1.85],
  ['Vindemiatrix', 13.036279, 10.959149, 2.83],
  ['Rasalhague', 17.582241, 12.560035, 2.08],
  ['Sadr', 20.370472, 40.256679, 2.23],
  ['Albireo', 19.512021, 27.959692, 3.05],
  ['Enif', 21.736433, 9.875010, 2.39],
  ['Markab', 23.079348, 15.205267, 2.49],
  ['Alpheratz', 0.139791, 29.090431, 2.06],
  ['Mirach', 1.162201, 35.620557, 2.05],
  ['Almach', 2.064984, 42.329725, 2.10],
  ['Schedar', 0.675122, 56.537331, 2.24],
  ['Caph', 0.152970, 59.149781, 2.28],
  ['Ruchbah', 1.430216, 60.235283, 2.68],
  ['Algol', 3.136148, 40.955648, 2.12],
  ['Mirfak', 3.405380, 49.861179, 1.79],
  ['Hamal', 2.119556, 23.462423, 2.00],
  ['Fomalhaut', 22.960845, -29.622237, 1.16],
]

function Stars({ loc, when }: { loc: GeoLocation; when: Date }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  const { positions, sizes } = useMemo(() => {
    const pos: THREE.Vector3[] = []
    const sz: number[] = []

    for (const [, ra, dec, mag] of BRIGHT_STARS) {
      const h = fixedHorizontal(ra, dec, when, loc, 'normal')
      if (h.altitudeDeg < -2) continue
      pos.push(altAzToVec3(h.altitudeDeg, h.azimuthDeg, 96))
      // Brightness varies physically: flux scales as 10^(-0.4*mag). Compressed
      // hard, because a linear flux scale would make Sirius absurdly larger
      // than a third-magnitude star.
      sz.push(0.22 + 0.5 * Math.pow(Math.pow(10, -0.4 * mag), 0.3))
    }

    // Deterministic filler. Seeded, so the sky does not shimmer between renders.
    let seed = 20260831
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    for (let i = 0; i < 900; i += 1) {
      // Uniform over the hemisphere. The solid-angle element is
      // cos(alt) d(alt) d(az), so the altitude CDF is sin(alt) and the inverse
      // is asin(u). Using acos(1-u) instead gives a sin(alt) density, which
      // visibly heaps stars around the zenith and thins them near the horizon.
      const alt = Math.asin(rnd()) * (180 / Math.PI)
      const az = rnd() * 360
      if (alt < 1) continue
      pos.push(altAzToVec3(alt, az, 96))
      sz.push(0.08 + rnd() * 0.14)
    }
    return { positions: pos, sizes: sz }
  }, [loc, when])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    for (let i = 0; i < positions.length; i += 1) {
      m.makeTranslation(positions[i]!.x, positions[i]!.y, positions[i]!.z)
      m.scale(new THREE.Vector3(sizes[i]!, sizes[i]!, sizes[i]!))
      mesh.setMatrixAt(i, m)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.count = positions.length
  }, [positions, sizes])

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, Math.max(1, positions.length)]}>
      {/* 12 segments: enough that a bright star reads as a disc rather than a
          visible hexagon, still cheap at ~950 instances in one draw call. */}
      <sphereGeometry args={[1, 12, 12]} />
      <meshBasicMaterial color="#dfe7f5" toneMapped={false} />
    </instancedMesh>
  )
}

/** A faint band at the horizon so "down" is legible without drawing a landscape. */
function Horizon() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]}>
        <ringGeometry args={[97, 130, 96]} />
        <meshBasicMaterial color="#0a0f18" side={THREE.DoubleSide} transparent opacity={0.96} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[95.6, 97, 96]} />
        <meshBasicMaterial color="#243040" side={THREE.DoubleSide} transparent opacity={0.85} />
      </mesh>
    </>
  )
}

/** Cardinal letters, built as sprites so they always face the viewer. */
function Cardinals() {
  const marks: [string, number][] = [['N', 0], ['E', 90], ['S', 180], ['W', 270]]
  return (
    <>
      {marks.map(([label, az]) => {
        const p = altAzToVec3(1.5, az, 94)
        return (
          <sprite key={label} position={[p.x, p.y, p.z]} scale={[6, 6, 1]}>
            <spriteMaterial map={useTextTexture(label)} transparent depthTest={false} />
          </sprite>
        )
      })}
    </>
  )
}

const textureCache = new Map<string, THREE.CanvasTexture>()
function useTextTexture(text: string): THREE.CanvasTexture {
  const cached = textureCache.get(text)
  if (cached) return cached
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#7d8798'
  ctx.font = '500 30px "Avenir Next", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 32, 34)
  const tex = new THREE.CanvasTexture(c)
  textureCache.set(text, tex)
  return tex
}

/** A score marker: the number inside a thin ring. */
function Marker({
  target, loc, when, selected, onSelect, explore,
}: {
  target: ScoredTarget
  loc: GeoLocation
  when: Date
  selected: boolean
  onSelect: (id: string) => void
  explore: boolean
}) {
  const pos = useMemo(() => {
    const t = target.target
    const h =
      t.type === 'deep-sky'
        ? fixedHorizontal(t.raHoursJ2000, t.decDegJ2000, when, loc, 'normal')
        : bodyHorizontal(t.body, when, loc, 'normal')
    return { vec: altAzToVec3(h.altitudeDeg, h.azimuthDeg, 88), alt: h.altitudeDeg }
  }, [target, loc, when])

  const tex = useMemo(
    () => markerTexture(Math.round(target.observability.finalScore), selected),
    [target.observability.finalScore, selected],
  )

  // In Live mode a marker below the horizon is hidden — the object is not
  // there to look at. Explore mode shows it, dimmed, so you can see what is
  // coming up later.
  if (pos.alt < 2 && !explore) return null

  return (
    <sprite
      position={[pos.vec.x, pos.vec.y, pos.vec.z]}
      scale={selected ? [11, 11, 1] : [8.5, 8.5, 1]}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(target.target.id)
      }}
    >
      <spriteMaterial map={tex} transparent depthTest={false} />
    </sprite>
  )
}

const markerCache = new Map<string, THREE.CanvasTexture>()
function markerTexture(score: number, selected: boolean): THREE.CanvasTexture {
  const key = `${score}-${selected}`
  const hit = markerCache.get(key)
  if (hit) return hit

  const S = 128
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  // Colour reinforces; the NUMBER carries the meaning, so this stays readable
  // for anyone who cannot separate these hues.
  const colour = score >= 75 ? '#6ee7a8' : score >= 50 ? '#e8c468' : '#e8806b'

  ctx.beginPath()
  ctx.arc(S / 2, S / 2, 40, 0, Math.PI * 2)
  ctx.strokeStyle = colour
  ctx.globalAlpha = selected ? 1 : 0.75
  ctx.lineWidth = selected ? 4 : 2.5
  ctx.stroke()

  ctx.globalAlpha = 1
  ctx.fillStyle = '#e8ecf4'
  ctx.font = '500 40px "Avenir Next", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(score), S / 2, S / 2 + 2)

  const tex = new THREE.CanvasTexture(c)
  markerCache.set(key, tex)
  return tex
}

/**
 * Drag to look around, pinch or wheel to zoom, and a smooth flight when a
 * target is chosen. Written directly rather than using OrbitControls because
 * the fly-to needs to interpolate the same state the gestures write.
 */
function CameraRig({
  flyTo, zoomNudge, initialView, explore, orientation,
}: {
  flyTo: { altDeg: number; azDeg: number } | null
  zoomNudge: number
  initialView: { altDeg: number; azDeg: number } | null
  /** Explore mode lets the view go below the horizon. */
  explore: boolean
  /** When set, the device's own orientation drives the camera. */
  orientation: React.RefObject<{ azDeg: number; altDeg: number } | null> | null
}) {
  const { camera, gl } = useThree()
  // Open looking at the best target rather than an arbitrary bearing. Note the
  // fov here is VERTICAL, so on a portrait phone the horizontal field is only
  // about 28 deg — pointing at nothing in particular shows nothing.
  const state = useRef({
    az: initialView?.azDeg ?? 180,
    alt: Math.min(70, Math.max(18, initialView?.altDeg ?? 40)),
    fov: 64,
  })
  const target = useRef<{ az: number; alt: number } | null>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const pinch = useRef<number | null>(null)
  // Read inside the gesture listener, which is registered once — a ref keeps it
  // current without re-binding events on every mode change.
  const exploreRef = useRef(explore)
  exploreRef.current = explore

  useEffect(() => {
    if (flyTo) target.current = { az: flyTo.azDeg, alt: flyTo.altDeg }
  }, [flyTo])

  useEffect(() => {
    state.current.fov = clamp(state.current.fov + zoomNudge, 18, 78)
  }, [zoomNudge])

  useEffect(() => {
    const el = gl.domElement
    const down = (e: PointerEvent) => {
      drag.current = { x: e.clientX, y: e.clientY }
      target.current = null // a deliberate gesture cancels an in-flight move
    }
    const move = (e: PointerEvent) => {
      if (!drag.current) return
      const dx = e.clientX - drag.current.x
      const dy = e.clientY - drag.current.y
      drag.current = { x: e.clientX, y: e.clientY }
      const k = state.current.fov / 60
      state.current.az = wrap360(state.current.az - dx * 0.16 * k)
      // Live mode stops just below the horizon; Explore lets you look right
      // down through the ground at objects that have not risen.
      state.current.alt = clamp(state.current.alt + dy * 0.16 * k, exploreRef.current ? -89 : -8, 89)
    }
    const up = () => {
      drag.current = null
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      state.current.fov = clamp(state.current.fov + e.deltaY * 0.05, 18, 78)
    }
    const touchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      const d = Math.hypot(
        e.touches[0]!.clientX - e.touches[1]!.clientX,
        e.touches[0]!.clientY - e.touches[1]!.clientY,
      )
      if (pinch.current !== null) {
        state.current.fov = clamp(state.current.fov * (pinch.current / d), 18, 78)
      }
      pinch.current = d
    }
    const touchEnd = () => {
      pinch.current = null
    }

    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('touchmove', touchMove, { passive: true })
    el.addEventListener('touchend', touchEnd)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('touchmove', touchMove)
      el.removeEventListener('touchend', touchEnd)
    }
  }, [gl])

  useFrame((_, dt) => {
    const s = state.current

    // Sensor mode overrides gestures entirely while active.
    const sensor = orientation?.current
    if (sensor) {
      // Light smoothing: raw orientation readings jitter enough to make the
      // sky visibly shake if applied directly.
      const k = 1 - Math.exp(-dt * 8)
      s.az = wrap360(s.az + shortestAngle(s.az, sensor.azDeg) * k)
      s.alt += (sensor.altDeg - s.alt) * k
      target.current = null
    }

    if (target.current) {
      // Critically-damped ease toward the target: fast, then settles. No
      // overshoot, which would read as gimmicky on a star chart.
      const k = 1 - Math.exp(-dt * 4.2)
      const wantFov = 34
      // Aim BELOW the target so it lands in the strip of sky still visible
      // above the detail sheet. Centring it would park the object behind the
      // panel that describes it.
      const lift = Math.min(12, wantFov * 0.3)
      s.az = wrap360(s.az + shortestAngle(s.az, target.current.az) * k)
      s.alt += (target.current.alt - lift - s.alt) * k
      s.fov += (wantFov - s.fov) * k
      if (Math.abs(shortestAngle(s.az, target.current.az)) < 0.25) target.current = null
    }
    const dir = altAzToVec3(s.alt, s.az, 1)
    camera.position.set(0, 0, 0)
    camera.lookAt(dir)
    const cam = camera as THREE.PerspectiveCamera
    if (Math.abs(cam.fov - s.fov) > 0.01) {
      cam.fov = s.fov
      cam.updateProjectionMatrix()
    }
  })

  return null
}

export function SkyScene({
  loc, when, targets, selectedId, onSelect, flyTo, zoomNudge, initialView,
  explore = false, orientation = null,
}: {
  loc: GeoLocation
  when: Date
  targets: ScoredTarget[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  flyTo: { altDeg: number; azDeg: number } | null
  zoomNudge: number
  initialView: { altDeg: number; azDeg: number } | null
  explore?: boolean
  orientation?: React.RefObject<{ azDeg: number; altDeg: number } | null> | null
}) {
  const [dpr, setDpr] = useState(1.5)
  useEffect(() => {
    // Cap pixel ratio: a 3x Retina phone gains nothing visible here and pays
    // for it in frame time.
    setDpr(Math.min(window.devicePixelRatio || 1, 2))
  }, [])

  return (
    <Canvas
      className="stage"
      dpr={dpr}
      camera={{ fov: 60, near: 0.1, far: 400, position: [0, 0, 0] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={['#05070c']} />
      <fog attach="fog" args={['#05070c', 120, 260]} />
      <Stars loc={loc} when={when} />
      <Horizon />
      <Cardinals />
      {targets.map((t) => (
        <Marker
          key={t.target.id}
          target={t}
          loc={loc}
          when={when}
          selected={t.target.id === selectedId}
          onSelect={onSelect}
          explore={explore}
        />
      ))}
      <CameraRig
        flyTo={flyTo}
        zoomNudge={zoomNudge}
        initialView={initialView}
        explore={explore}
        orientation={orientation}
      />
    </Canvas>
  )
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
function wrap360(v: number): number {
  return ((v % 360) + 360) % 360
}
function shortestAngle(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180
}
