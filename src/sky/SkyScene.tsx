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
import {
  fixedHorizontal, bodyHorizontal, makeObserver, type GeoLocation,
} from '../domain/ephemeris'
import { MakeTime, RotateVector, Rotation_EQJ_HOR, Rotation_GAL_EQJ, Vector } from 'astronomy-engine'
import { buildStarField, bvToRgb, magnitudeToSize } from './starfield'
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
/**
 * The star field, drawn as one Points object with a soft glow sprite.
 *
 * Points beat instanced spheres here on both counts: a radial-gradient sprite
 * reads as a glowing star rather than a faceted ball, and 4000+ of them cost
 * one draw call instead of thousands of triangles.
 */
function Stars({ loc, when, explore }: { loc: GeoLocation; when: Date; explore: boolean }) {
  const seeds = useMemo(() => buildStarField(4200), [])

  const { positions, colors, sizes } = useMemo(() => {
    const observer = makeObserver(loc)
    const time = MakeTime(when)
    const rot = Rotation_EQJ_HOR(time, observer)

    const pos: number[] = []
    const col: number[] = []
    const siz: number[] = []

    for (const st of seeds) {
      // One rotation matrix, applied by hand to every star. Calling the
      // library per star would be thousands of redundant matrix builds.
      const v = RotateVector(rot, new Vector(st.x, st.y, st.z, time))
      const alt = Math.asin(Math.max(-1, Math.min(1, v.z)))
      if (alt < -0.06 && !explore) continue // below the horizon: simply not there

      pos.push(v.y * 96, v.z * 96, v.x * 96)

      const [r, g, b] = bvToRgb(st.bv)
      // Extinction: stars genuinely dim and redden toward the horizon. The
      // same physics the scoring engine uses, applied to the picture.
      const altDeg = (alt * 180) / Math.PI
      const dim = Math.max(0.18, Math.min(1, Math.pow(Math.sin(Math.max(0.02, alt)), 0.28)))
      const warm = 1 - 0.22 * (1 - Math.min(1, altDeg / 35))
      col.push(r * dim, g * dim * warm, b * dim * warm * warm)
      siz.push(magnitudeToSize(st.magnitude) * (0.75 + 0.25 * dim))
    }
    return {
      positions: new Float32Array(pos),
      colors: new Float32Array(col),
      sizes: new Float32Array(siz),
    }
  }, [seeds, loc, when, explore])

  const texture = useMemo(() => glowTexture(), [])

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
      </bufferGeometry>
      <shaderMaterial
        transparent
        vertexColors
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{
          map: { value: texture },
          uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
          uScale: { value: 5.0 },
        }}
        vertexShader={STAR_VERT}
        fragmentShader={STAR_FRAG}
      />
    </points>
  )
}

/**
 * Size is set in the vertex shader so stars stay the same apparent size as the
 * field of view changes — zooming in must not inflate them into blobs.
 */
const STAR_VERT = /* glsl */ `
  attribute float size;
  uniform float uPixelRatio;
  uniform float uScale;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // gl_PointSize is in PHYSICAL pixels, so it must be scaled by the device
    // pixel ratio or every star renders at half size on a Retina display.
    gl_PointSize = size * uScale * uPixelRatio * (100.0 / -mv.z);
  }
`

const STAR_FRAG = /* glsl */ `
  uniform sampler2D map;
  varying vec3 vColor;
  void main() {
    vec4 t = texture2D(map, gl_PointCoord);
    if (t.a < 0.01) discard;
    gl_FragColor = vec4(vColor, 1.0) * t;
  }
`

/** A soft radial falloff, with a slight core, so a star reads as a glow. */
let cachedGlow: THREE.CanvasTexture | null = null
function glowTexture(): THREE.CanvasTexture {
  if (cachedGlow) return cachedGlow
  const S = 64
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0.0, 'rgba(255,255,255,1)')
  g.addColorStop(0.18, 'rgba(255,255,255,1)')
  g.addColorStop(0.32, 'rgba(255,255,255,0.62)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.20)')
  g.addColorStop(0.78, 'rgba(255,255,255,0.05)')
  g.addColorStop(1.0, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  cachedGlow = new THREE.CanvasTexture(c)
  return cachedGlow
}

/**
 * The Milky Way.
 *
 * A luminous band, not a point cloud — the real thing is unresolved
 * nebulosity, and no number of dots reads like it. Orientation comes from
 * `Rotation_GAL_EQJ`, so the band lies on the ACTUAL galactic plane and
 * therefore rises, sets and tilts correctly through the night.
 */
function MilkyWay({ loc, when, explore }: { loc: GeoLocation; when: Date; explore: boolean }) {
  const texture = useMemo(() => milkyWayTexture(), [])

  // Build a strip of quads following the galactic equator.
  const geometry = useMemo(() => {
    const observer = makeObserver(loc)
    const time = MakeTime(when)
    const rotGalEqj = Rotation_GAL_EQJ()
    const rotEqjHor = Rotation_EQJ_HOR(time, observer)

    const SEGMENTS = 180
    const HALF_WIDTH_DEG = 16
    const R = 93
    const pos: number[] = []
    const uv: number[] = []

    const point = (lDeg: number, bDeg: number) => {
      const b = (bDeg * Math.PI) / 180
      const l = (lDeg * Math.PI) / 180
      const gal = new Vector(Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b), time)
      const hor = RotateVector(rotEqjHor, RotateVector(rotGalEqj, gal))
      return [hor.y * R, hor.z * R, hor.x * R] as const
    }

    for (let i = 0; i < SEGMENTS; i += 1) {
      const l0 = (i / SEGMENTS) * 360
      const l1 = ((i + 1) / SEGMENTS) * 360
      const [ax, ay, az] = point(l0, -HALF_WIDTH_DEG)
      const [bx, by, bz] = point(l0, HALF_WIDTH_DEG)
      const [cx, cy, cz] = point(l1, HALF_WIDTH_DEG)
      const [dx, dy, dz] = point(l1, -HALF_WIDTH_DEG)
      const u0 = i / SEGMENTS
      const u1 = (i + 1) / SEGMENTS
      pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, ax, ay, az, cx, cy, cz, dx, dy, dz)
      uv.push(u0, 0, u0, 1, u1, 1, u0, 0, u1, 1, u1, 0)
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    return g
  }, [loc, when])

  return (
    <mesh geometry={geometry} renderOrder={-1}>
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={explore ? 0.5 : 0.85}
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}

/**
 * A soft, mottled band. Brightest toward galactic longitude 0 (the direction
 * of the galactic centre, in Sagittarius) and split by a dark rift, which is
 * what the naked eye actually shows.
 */
let cachedMw: THREE.CanvasTexture | null = null
function milkyWayTexture(): THREE.CanvasTexture {
  if (cachedMw) return cachedMw
  const W = 1024
  const H = 128
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, W, H)

  // Deterministic mottling.
  let seed = 987654321
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }

  for (let i = 0; i < 2600; i += 1) {
    const x = rnd() * W
    // Longitude 0 sits at u = 0; brightness falls away toward the anticentre.
    const lon = (x / W) * 360
    const toCentre = Math.min(lon, 360 - lon) / 180
    const richness = Math.pow(1 - toCentre, 1.7)
    if (rnd() > 0.18 + richness * 0.82) continue

    const spread = 12 + rnd() * 22
    const y = H / 2 + (rnd() + rnd() + rnd() - 1.5) * spread
    const r = 6 + rnd() * 30
    const a = (0.012 + rnd() * 0.05) * (0.35 + richness)
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(214,226,255,${a})`)
    g.addColorStop(1, 'rgba(214,226,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // The Great Rift: dust lanes darkening the band's middle.
  ctx.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 240; i += 1) {
    const x = rnd() * W
    const lon = (x / W) * 360
    const toCentre = Math.min(lon, 360 - lon) / 180
    if (rnd() > 1 - toCentre * 0.75) continue
    const y = H / 2 + (rnd() - 0.5) * 26
    const r = 8 + rnd() * 26
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(0,0,0,${0.25 + rnd() * 0.45})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'

  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = THREE.RepeatWrapping
  cachedMw = tex
  return tex
}

/** A faint band at the horizon so "down" is legible without drawing a landscape. */
function Horizon({ explore }: { explore: boolean }) {
  // A graded band just above the horizon: airglow and distant light domes are
  // real, and they also make "down" legible without drawing a fake landscape.
  const glow = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 4
    c.height = 128
    const ctx = c.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, 0, 128)
    g.addColorStop(0.0, 'rgba(9,14,24,0)')
    g.addColorStop(0.55, 'rgba(20,32,48,0.30)')
    g.addColorStop(0.86, 'rgba(38,54,72,0.62)')
    g.addColorStop(1.0, 'rgba(46,64,84,0.85)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 4, 128)
    const tex = new THREE.CanvasTexture(c)
    tex.wrapS = THREE.RepeatWrapping
    return tex
  }, [])

  return (
    <>
      {/* The airglow band, standing on the horizon */}
      <mesh position={[0, 7, 0]}>
        <cylinderGeometry args={[94, 94, 15, 128, 1, true]} />
        <meshBasicMaterial
          map={glow}
          side={THREE.BackSide}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* The ground. Opaque in Live mode so nothing below the horizon shows
          through; nearly transparent in Explore, where looking down through it
          at objects that have not risen is the entire point. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]}>
        <circleGeometry args={[120, 128]} />
        <meshBasicMaterial
          color="#05070c"
          side={THREE.DoubleSide}
          transparent
          opacity={explore ? 0.35 : 1}
          depthWrite={!explore}
        />
      </mesh>
      {/* A hairline where sky meets ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[93.4, 94.2, 128]} />
        <meshBasicMaterial color="#33465e" side={THREE.DoubleSide} transparent opacity={0.7} />
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
      <MilkyWay loc={loc} when={when} explore={explore} />
      <Stars loc={loc} when={when} explore={explore} />
      <Horizon explore={explore} />
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
