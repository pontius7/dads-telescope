/**
 * The live sky.
 *
 * Everything drawn here sits at its real altitude and azimuth for the selected
 * location and time. Nothing is placed for decoration — if an object is below
 * the horizon it is simply not in the scene.
 */
import { Suspense, useMemo, useRef, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import {
  fixedHorizontal, bodyHorizontal, makeObserver, type GeoLocation,
} from '../domain/ephemeris'
import { horizonToWorld } from '../domain/frame'
import { deviceToAim, type DevicePose } from '../domain/pointing'
import { daylightPhase, skyPalette, starVisibility } from '../domain/daylight'
import { Guidance } from './Guidance'
import { Body, Illumination, MakeTime, RotateVector, Rotation_EQJ_HOR, Vector } from 'astronomy-engine'
import { badgeTexture, discTexture, ringTexture } from './markerTexture'
import { hasThumb, loadThumb, peekThumb } from './thumbs'
import { hasBodyTexture } from './bodies'
import { SkyGlobe } from './SkyGlobe'
import { buildStarField, buildMilkyWay, bvToRgb, magnitudeToSize } from './starfield'
import { CONSTELLATIONS, figureStarVector } from './constellations'
import type { ScoredTarget } from '../useSky'

/**
 * Place a point on the celestial sphere from altitude/azimuth.
 *
 * The axes live in `domain/frame`, which is also what the star field, the
 * Milky Way and the constellation figures are drawn in. This used to build its
 * own vector with +X east, mirroring every marker, cardinal label, meteor and
 * the camera itself across the meridian relative to the stars behind them.
 */
export function altAzToVec3(altDeg: number, azDeg: number, r = 100): THREE.Vector3 {
  const [x, y, z] = horizonToWorld(altDeg, azDeg, r)
  return new THREE.Vector3(x, y, z)
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
function Stars({ loc, when, explore, visible }: { loc: GeoLocation; when: Date; explore: boolean; visible: number }) {
  const seeds = useMemo(() => buildStarField(4200), [])

  const { positions, colors, sizes, twinkle, phase } = useMemo(() => {
    const observer = makeObserver(loc)
    const time = MakeTime(when)
    const rot = Rotation_EQJ_HOR(time, observer)

    const pos: number[] = []
    const col: number[] = []
    const siz: number[] = []
    const tw: number[] = []
    const ph: number[] = []

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
      // Scintillation is genuinely stronger low down, where you are looking
      // through more turbulent air — so twinkle amplitude follows altitude.
      const lowness = 1 - Math.min(1, Math.max(0, altDeg / 55))
      tw.push(0.06 + lowness * 0.42)
      ph.push((st.x * 37.1 + st.y * 71.3 + st.z * 13.7) * 10 % 6.283)
    }
    return {
      positions: new Float32Array(pos),
      colors: new Float32Array(col),
      sizes: new Float32Array(siz),
      twinkle: new Float32Array(tw),
      phase: new Float32Array(ph),
    }
  }, [seeds, loc, when, explore])

  const texture = useMemo(() => glowTexture(), [])
  const matRef = useRef<THREE.ShaderMaterial>(null)

  // Drive the twinkle. One uniform update per frame, not a React re-render.
  useFrame((state) => {
    if (!matRef.current) return
    matRef.current.uniforms.uTime!.value = state.clock.elapsedTime
    // Eased rather than set, so scrubbing the clock through sunset dissolves
    // the star field instead of snapping it on.
    const u = matRef.current.uniforms.uVisible!
    u.value += (visible - u.value) * 0.08
  })

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
        <bufferAttribute attach="attributes-twinkle" args={[twinkle, 1]} />
        <bufferAttribute attach="attributes-phase" args={[phase, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        transparent
        vertexColors
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{
          map: { value: texture },
          uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
          uScale: { value: 3.1 },
          uTime: { value: 0 },
          uVisible: { value: visible },
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
  attribute float twinkle;
  attribute float phase;
  uniform float uPixelRatio;
  uniform float uScale;
  uniform float uTime;
  varying vec3 vColor;
  varying float vTw;
  void main() {
    // Scintillation: two incommensurate frequencies so it never looks like a
    // repeating blink. Amplitude comes from altitude, since low stars really
    // do twinkle harder.
    float f = sin(uTime * 2.7 + phase) * 0.6 + sin(uTime * 6.1 + phase * 1.7) * 0.4;
    float amp = 1.0 + twinkle * f;
    vTw = amp;
    vColor = color * (0.82 + 0.18 * amp);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // gl_PointSize is in PHYSICAL pixels, so it must be scaled by the device
    // pixel ratio or every star renders at half size on a Retina display.
    gl_PointSize = size * uScale * uPixelRatio * (100.0 / -mv.z) * (0.88 + 0.12 * amp);
  }
`

const STAR_FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform float uVisible;
  varying vec3 vColor;
  varying float vTw;
  void main() {
    if (uVisible <= 0.001) discard;
    vec4 t = texture2D(map, gl_PointCoord);
    if (t.a < 0.01) discard;
    // Stars do not go out at dawn, they are washed out by a brighter sky.
    gl_FragColor = vec4(vColor * vTw, 1.0) * t * uVisible;
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
  g.addColorStop(0.10, 'rgba(255,255,255,1)')
  g.addColorStop(0.17, 'rgba(255,255,255,0.55)')
  g.addColorStop(0.28, 'rgba(255,255,255,0.16)')
  g.addColorStop(0.48, 'rgba(255,255,255,0.045)')
  g.addColorStop(1.0, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  cachedGlow = new THREE.CanvasTexture(c)
  return cachedGlow
}

/**
 * The Milky Way, as additive nebulosity.
 *
 * An earlier version stretched a canvas texture across a ring and looked
 * wrong — a 1024x128 image over a 32-degree band produced visible diagonal
 * striping and read as a grey smear. Hundreds of soft overlapping blobs at
 * real galactic coordinates give organic structure with no UV stretching, and
 * the Great Rift emerges from simply not placing blobs in the dust lanes.
 */
function MilkyWay({ loc, when, visible }: { loc: GeoLocation; when: Date; visible: number }) {
  const seeds = useMemo(() => buildMilkyWay(1100), [])
  const texture = useMemo(() => cloudTexture(), [])

  const { positions, sizes, alphas } = useMemo(() => {
    const rot = Rotation_EQJ_HOR(MakeTime(when), makeObserver(loc))
    const time = MakeTime(when)
    const pos: number[] = []
    const siz: number[] = []
    const alp: number[] = []
    for (const c of seeds) {
      const v = RotateVector(rot, new Vector(c.x, c.y, c.z, time))
      if (v.z < -0.05) continue
      pos.push(v.y * 92, v.z * 92, v.x * 92)
      siz.push(c.size)
      // Fades out near the horizon, where extinction genuinely kills it.
      const alt = Math.asin(Math.max(-1, Math.min(1, v.z)))
      alp.push(c.alpha * Math.max(0, Math.min(1, Math.sin(alt) * 2.6)) * visible)
    }
    return {
      positions: new Float32Array(pos),
      sizes: new Float32Array(siz),
      alphas: new Float32Array(alp),
    }
    // `visible` is itself a function of `when` and `loc` — the sun's altitude
    // at that place and moment — so it can never change without one of them
    // changing, and listing it would only rebuild the cloud twice.
  }, [seeds, loc, when])

  if (positions.length === 0) return null

  return (
    <points renderOrder={-2}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
        <bufferAttribute attach="attributes-alpha" args={[alphas, 1]} />
      </bufferGeometry>
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{
          map: { value: texture },
          uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        }}
        vertexShader={CLOUD_VERT}
        fragmentShader={CLOUD_FRAG}
      />
    </points>
  )
}

const CLOUD_VERT = /* glsl */ `
  attribute float size;
  attribute float alpha;
  uniform float uPixelRatio;
  varying float vAlpha;
  void main() {
    vAlpha = alpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * uPixelRatio * (620.0 / -mv.z);
  }
`

const CLOUD_FRAG = /* glsl */ `
  uniform sampler2D map;
  varying float vAlpha;
  void main() {
    vec4 t = texture2D(map, gl_PointCoord);
    gl_FragColor = vec4(vec3(0.70, 0.76, 0.94), t.a * vAlpha * 0.55);
  }
`

let cachedCloud: THREE.CanvasTexture | null = null
function cloudTexture(): THREE.CanvasTexture {
  if (cachedCloud) return cachedCloud
  const S = 128
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  // A very soft falloff, so overlapping blobs blend into cloud rather than
  // reading as individual circles.
  g.addColorStop(0.0, 'rgba(255,255,255,0.55)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.22)')
  g.addColorStop(0.7, 'rgba(255,255,255,0.05)')
  g.addColorStop(1.0, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  cachedCloud = new THREE.CanvasTexture(c)
  return cachedCloud
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

/**
 * Constellation figures.
 *
 * Hairline additive lines connecting real stars, with two independent fades so
 * they help rather than clutter:
 *
 *   ALTITUDE — a figure lying on the horizon fades out, because its stars are
 *              extinguished anyway and the lines would just be noise.
 *   ZOOM     — they fade out as the field narrows past about 40 degrees. When
 *              you have flown in on one object you are no longer navigating,
 *              and the lines would sit on top of the thing you came to see.
 */
function Figures({ loc, when, fovRef, visible }: { loc: GeoLocation; when: Date; fovRef: React.RefObject<number>; visible: number }) {
  const lineRef = useRef<THREE.LineSegments>(null)
  const groupRef = useRef<THREE.Group>(null)

  const { geometry, labels } = useMemo(() => {
    const rot = Rotation_EQJ_HOR(MakeTime(when), makeObserver(loc))
    const time = MakeTime(when)

    const toHor = (name: string) => {
      const v = figureStarVector(name)
      if (!v) return null
      const h = RotateVector(rot, new Vector(v[0], v[1], v[2], time))
      return h
    }

    const pts: number[] = []
    const cols: number[] = []
    const labs: { name: string; common?: string; pos: THREE.Vector3; alt: number }[] = []

    for (const c of CONSTELLATIONS) {
      let sumX = 0, sumY = 0, sumZ = 0, n = 0, anyUp = false

      for (const [a, b] of c.lines) {
        const ha = toHor(a)
        const hb = toHor(b)
        if (!ha || !hb) continue
        // Skip a segment if either end is below the horizon: half a figure
        // drawn into the ground is worse than none of it.
        if (ha.z < 0.02 || hb.z < 0.02) continue
        anyUp = true

        pts.push(ha.y * 90, ha.z * 90, ha.x * 90, hb.y * 90, hb.z * 90, hb.x * 90)
        // Fade each vertex by its own altitude.
        for (const h of [ha, hb]) {
          const f = Math.max(0, Math.min(1, (Math.asin(Math.min(1, h.z)) * 180) / Math.PI / 28))
          cols.push(0.42 * f, 0.55 * f, 0.78 * f)
        }
      }

      for (const [a, b] of c.lines) {
        for (const nm of [a, b]) {
          const h = toHor(nm)
          if (!h) continue
          sumX += h.y; sumY += h.z; sumZ += h.x; n += 1
        }
      }
      if (anyUp && n > 0) {
        const centre = new THREE.Vector3(sumX / n, sumY / n, sumZ / n).normalize()
        labs.push({
          name: c.name,
          common: c.common,
          pos: centre.multiplyScalar(88),
          alt: (Math.asin(Math.min(1, centre.y / 88)) * 180) / Math.PI,
        })
      }
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
    return { geometry: g, labels: labs }
  }, [loc, when])

  // Fade the whole layer with field of view, read each frame from the camera
  // rig rather than through React state.
  useFrame(() => {
    const fov = fovRef.current ?? 60
    // Full strength at a wide field, gone by about 32 degrees.
    const k = Math.max(0, Math.min(1, (fov - 32) / 22))
    const mat = lineRef.current?.material as THREE.LineBasicMaterial | undefined
    if (mat) mat.opacity = 0.5 * k * visible
    if (groupRef.current) groupRef.current.visible = k > 0.05 && visible > 0.05
  })

  return (
    <group ref={groupRef}>
      <lineSegments ref={lineRef} geometry={geometry} renderOrder={-1}>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.5}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>
      {labels.map((l) => {
        const text = l.common ? `${l.name} · ${l.common}` : l.name
        const map = labelTexture(text)
        const aspect = labelAspect.get(text) ?? 4
        const h = 3.4
        return (
          <sprite key={l.name} position={[l.pos.x, l.pos.y, l.pos.z]} scale={[h * aspect, h, 1]}>
            <spriteMaterial map={map} transparent opacity={0.46} depthTest={false} />
          </sprite>
        )
      })}
    </group>
  )
}

const labelCache = new Map<string, THREE.CanvasTexture>()
const labelAspect = new Map<string, number>()
function labelTexture(text: string): THREE.CanvasTexture {
  const hit = labelCache.get(text)
  if (hit) return hit
  const FONT = '500 40px "Avenir Next", system-ui, sans-serif'
  const upper = text.toUpperCase()

  // Measure first. A fixed 512px canvas clipped longer names to
  // "GASUS · GREAT SQUA", so the canvas is sized to the text instead.
  const probe = document.createElement('canvas').getContext('2d')!
  probe.font = FONT
  probe.letterSpacing = '6px'
  const W = Math.ceil(probe.measureText(upper).width) + 48
  const H = 96

  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  ctx.font = FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.letterSpacing = '6px'
  ctx.fillStyle = '#93a6c4'
  ctx.fillText(upper, W / 2, H / 2)
  const tex = new THREE.CanvasTexture(c)
  labelCache.set(text, tex)
  labelAspect.set(text, W / H)
  return tex
}

/**
 * Occasional meteors.
 *
 * Sporadic meteors are real and frequent — a handful an hour on any clear
 * night. They are the one thing in this scene that is genuinely random rather
 * than computed, and they are drawn as transient streaks, never labelled or
 * clickable, so nothing about them can be mistaken for data.
 */
function Meteors() {
  const ref = useRef<THREE.LineSegments>(null)
  const state = useRef({ next: 2.5, active: [] as { t: number; life: number; a: THREE.Vector3; b: THREE.Vector3 }[] })

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6 * 8), 3))
    return g
  }, [])

  useFrame((_, dt) => {
    const st = state.current
    st.next -= dt
    if (st.next <= 0 && st.active.length < 3) {
      // Somewhere in the upper sky, travelling a few degrees.
      const alt = 25 + Math.random() * 55
      const az = Math.random() * 360
      const a = altAzToVec3(alt, az, 90)
      const dAlt = -6 - Math.random() * 12
      const dAz = (Math.random() - 0.5) * 26
      const b = altAzToVec3(alt + dAlt, az + dAz, 90)
      st.active.push({ t: 0, life: 0.5 + Math.random() * 0.5, a, b })
      st.next = 5 + Math.random() * 16
    }

    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    const arr = pos.array as Float32Array
    arr.fill(0)
    let i = 0
    for (const m of st.active) {
      m.t += dt
      const f = m.t / m.life
      if (f >= 1) continue
      // The streak head runs ahead of the tail, so it reads as motion.
      const head = Math.min(1, f * 1.5)
      const tail = Math.max(0, f * 1.5 - 0.35)
      const h = m.a.clone().lerp(m.b, head)
      const tl = m.a.clone().lerp(m.b, tail)
      arr.set([tl.x, tl.y, tl.z, h.x, h.y, h.z], i * 6)
      i += 1
    }
    st.active = st.active.filter((m) => m.t / m.life < 1)
    pos.needsUpdate = true
    if (ref.current) ref.current.visible = i > 0
  })

  return (
    <lineSegments ref={ref} geometry={geo} renderOrder={2}>
      <lineBasicMaterial color="#dce6ff" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
    </lineSegments>
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


/**
 * The Sun.
 *
 * Drawn so you can see where it is — and, during the day, so the scene is not
 * lying about what is overhead. It is deliberately NOT a target: it is absent
 * from the catalogue, so it cannot be scored, recommended, listed or guided
 * to. Tapping it produces a warning and nothing else.
 *
 * This is not squeamishness. The inventory contains no solar filter, and the
 * app is only ever allowed to recommend gear that is owned and verified. With
 * a 203 mm aperture and no filter, a moment at the eyepiece is permanent
 * blindness, so the only honest answer the app can give about the Sun is "do
 * not".
 */
function SunDisc({
  loc, when, onWarn,
}: {
  loc: GeoLocation
  when: Date
  onWarn: () => void
}) {
  const pos = useMemo(() => {
    const h = bodyHorizontal(Body.Sun, when, loc, 'normal')
    return { vec: altAzToVec3(h.altitudeDeg, h.azimuthDeg, 86), alt: h.altitudeDeg }
  }, [loc, when])

  const texture = useMemo(() => {
    const S = 256
    const c = document.createElement('canvas')
    c.width = c.height = S
    const ctx = c.getContext('2d')!
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
    // A hard disc inside a wide glare, which is what the eye actually sees.
    g.addColorStop(0.0, 'rgba(255,255,250,1)')
    g.addColorStop(0.16, 'rgba(255,246,214,1)')
    g.addColorStop(0.2, 'rgba(255,224,150,0.72)')
    g.addColorStop(0.36, 'rgba(255,196,104,0.26)')
    g.addColorStop(0.62, 'rgba(255,180,90,0.08)')
    g.addColorStop(1.0, 'rgba(255,170,80,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])

  // Below the horizon there is nothing to draw; the glow it throws along the
  // horizon is the palette's job, not a sprite's.
  if (pos.alt < -3) return null

  return (
    <sprite
      position={[pos.vec.x, pos.vec.y, pos.vec.z]}
      scale={[26, 26, 1]}
      onClick={(e) => {
        e.stopPropagation()
        onWarn()
      }}
    >
      <spriteMaterial map={texture} transparent depthTest={false} blending={THREE.AdditiveBlending} />
    </sprite>
  )
}

/**
 * A target in the sky.
 *
 * Three treatments, and which one you get says something true about the object:
 *
 *   A LIT GLOBE for the Moon and the planets, turned to tonight's real phase.
 *   These are the objects whose appearance actually changes night to night, and
 *   we have their real surfaces, so drawing a sphere is not embellishment.
 *
 *   A PHOTOGRAPH for a deep-sky object with a verified image, feathered into
 *   the star field and wearing its score on a badge.
 *
 *   A PLAIN RING otherwise. Not a placeholder — it means no verified
 *   photograph of this object exists, and the app will not invent one.
 */
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
  const t = target.target
  const id = t.id
  const score = Math.round(target.observability.finalScore)

  const pos = useMemo(() => {
    const h =
      t.type === 'deep-sky'
        ? fixedHorizontal(t.raHoursJ2000, t.decDegJ2000, when, loc, 'normal')
        : bodyHorizontal(t.body, when, loc, 'normal')
    return { vec: altAzToVec3(h.altitudeDeg, h.azimuthDeg, 88), alt: h.altitudeDeg }
  }, [t, loc, when])

  // The photograph arrives after the first frame. Until it does the target
  // wears its ring, and swaps when the image is decoded.
  const [thumb, setThumb] = useState<HTMLImageElement | null>(() => peekThumb(id))
  useEffect(() => {
    if (thumb || !hasThumb(id)) return
    let live = true
    void loadThumb(id).then((img) => {
      if (live && img) setThumb(img)
    })
    return () => {
      live = false
    }
  }, [id, thumb])

  const isBody = t.type === 'solar-system' && hasBodyTexture(id)

  const phaseAngleDeg = useMemo(() => {
    if (t.type !== 'solar-system') return 0
    try {
      return Illumination(t.body as Body, MakeTime(when)).phase_angle
    } catch {
      return 0
    }
  }, [t, when])

  const texture = useMemo(() => {
    if (isBody) return badgeTexture(score, selected)
    if (thumb) return discTexture(id, thumb, score, selected)
    return ringTexture(score, selected)
  }, [isBody, thumb, id, score, selected])

  // In Live mode a marker below the horizon is hidden — the object is not
  // there to look at. Explore mode shows it, dimmed, so you can see what is
  // coming up later.
  if (pos.alt < 2 && !explore) return null

  // A photograph earns more room than a bare number, and a better opportunity
  // earns more room than a worse one.
  const size = isBody ? 5.6 : thumb ? 11 + (score / 100) * 4 : 7.4

  return (
    <AnimatedMarker
      position={pos.vec}
      selected={selected}
      texture={texture}
      size={size}
      onSelect={() => onSelect(id)}
      globe={
        isBody ? (
          <Suspense fallback={null}>
            <SkyGlobe
              targetId={id}
              phaseAngleDeg={phaseAngleDeg}
              radius={(selected ? 4.4 : 3.5) * (id === 'saturn' ? 0.72 : 1)}
            />
          </Suspense>
        ) : null
      }
    />
  )
}

/**
 * A marker that breathes, and pulses harder when selected.
 *
 * The motion is deliberately small — a star chart that wobbles is annoying, but
 * something completely static reads as a screenshot rather than a live sky.
 */
function AnimatedMarker({
  position, selected, texture, size, onSelect, globe,
}: {
  position: THREE.Vector3
  selected: boolean
  texture: THREE.CanvasTexture
  size: number
  onSelect: () => void
  globe: React.ReactNode
}) {
  const ref = useRef<THREE.Sprite>(null)
  const group = useRef<THREE.Group>(null)
  const born = useRef(0)

  useFrame((state, dt) => {
    born.current = Math.min(1, born.current + dt * 2.6)
    // Ease-out entry, so markers arrive rather than appear.
    const entry = 1 - Math.pow(1 - born.current, 3)
    const time = state.clock.elapsedTime
    const breathe = selected
      ? 1 + Math.sin(time * 2.4) * 0.06
      : 1 + Math.sin(time * 1.1 + position.x) * 0.022

    if (ref.current) {
      const k = size * entry * breathe
      ref.current.scale.set(k, k, 1)
      ;(ref.current.material as THREE.SpriteMaterial).opacity = entry
    }
    if (group.current) group.current.scale.setScalar(entry * breathe)
  })

  return (
    <group position={[position.x, position.y, position.z]}>
      {globe && <group ref={group}>{globe}</group>}
      <sprite
        ref={ref}
        scale={[0.01, 0.01, 1]}
        // A globe carries its badge beside it rather than across its face:
        // `center` shifts the sprite in screen space, so the badge stays put
        // however the camera turns.
        center={globe ? [-0.15, 1.1] : [0.5, 0.5]}
        onClick={(e) => {
          e.stopPropagation()
          onSelect()
        }}
      >
        <spriteMaterial
          map={texture}
          transparent
          depthTest={false}
          opacity={0}
          // Photographs are objects, not light sources. Held under the bloom
          // threshold they stay crisp instead of blooming into a smear.
          color={globe ? '#ffffff' : '#d8dde6'}
        />
      </sprite>
    </group>
  )
}

/**
 * Drag to look around, pinch or wheel to zoom, and a smooth flight when a
 * target is chosen. Written directly rather than using OrbitControls because
 * the fly-to needs to interpolate the same state the gestures write.
 */
function CameraRig({
  flyTo, zoomNudge, initialView, explore, pose, fovOut,
}: {
  fovOut?: React.RefObject<number>
  flyTo: { altDeg: number; azDeg: number } | null
  zoomNudge: number
  initialView: { altDeg: number; azDeg: number } | null
  /** Explore mode lets the view go below the horizon. */
  explore: boolean
  /** When set, the device's own orientation drives the camera. */
  pose: React.RefObject<DevicePose | null> | null
}) {
  const { camera, gl } = useThree()
  // Open looking at the best target rather than an arbitrary bearing. Note the
  // fov here is VERTICAL, so on a portrait phone the horizontal field is only
  // about 28 deg — pointing at nothing in particular shows nothing.
  const state = useRef({
    az: initialView?.azDeg ?? 180,
    alt: Math.min(70, Math.max(18, initialView?.altDeg ?? 40)),
    fov: 64,
    /** Only the sensor writes this: the sky leans when the phone leans. */
    roll: 0,
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
    const sensor = pose?.current
    if (sensor) {
      // The full three-angle conversion. Doing this here rather than in the
      // hook keeps the sensor path and the gesture path writing the same
      // az/alt state, so a fly-to and a hand movement cannot fight.
      const aim = deviceToAim(sensor)
      // Light smoothing: raw orientation readings jitter enough to make the
      // sky visibly shake if applied directly.
      const k = 1 - Math.exp(-dt * 8)
      s.az = wrap360(s.az + shortestAngle(s.az, aim.azDeg) * k)
      s.alt += (aim.altDeg - s.alt) * k
      s.roll += shortestAngle(s.roll, aim.rollDeg) * k
      target.current = null
    } else if (s.roll !== 0) {
      // Let the horizon settle back to level when pointing stops.
      s.roll += (0 - s.roll) * (1 - Math.exp(-dt * 6))
      if (Math.abs(s.roll) < 0.05) s.roll = 0
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
    // Idle drift: a very slow pan when nothing else is driving the camera, so
    // the scene is never completely frozen. Cancelled by any interaction.
    if (!target.current && !sensor && !drag.current) {
      s.az = wrap360(s.az + dt * 0.35)
    }

    const dir = altAzToVec3(s.alt, s.az, 1)
    camera.position.set(0, 0, 0)
    camera.lookAt(dir)
    // `lookAt` always levels the horizon. Leaning the camera back by the
    // phone's own roll is what makes the screen match the sky when the phone
    // is held at an angle, instead of showing a level picture of a tilted view.
    if (s.roll !== 0) camera.rotateZ((-s.roll * Math.PI) / 180)
    if (fovOut) fovOut.current = s.fov
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
  explore = false, pose = null, accuracy = null, guideTo = null, guideName = null,
  showFigures = true, onSunWarning,
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
  pose?: React.RefObject<DevicePose | null> | null
  accuracy?: React.RefObject<number | null> | null
  /** Where the chosen target is right now, for the guidance trail. */
  guideTo?: { altDeg: number; azDeg: number } | null
  guideName?: string | null
  showFigures?: boolean
  /** Tapping the Sun warns; it is never a target. */
  onSunWarning?: () => void
}) {
  const [dpr, setDpr] = useState(1.5)
  const fovRef = useRef(64)

  /**
   * The sky is drawn for the time being shown. Rendering a black, star-filled
   * night at four in the afternoon was the app claiming something plainly
   * false about what is overhead.
   */
  const daylight = useMemo(() => {
    const sunAltDeg = bodyHorizontal(Body.Sun, when, loc, 'normal').altitudeDeg
    const palette = skyPalette(sunAltDeg)
    const hex = (c: readonly [number, number, number]) =>
      new THREE.Color(c[0], c[1], c[2]).getHexString()
    return {
      sunAltDeg,
      phase: daylightPhase(sunAltDeg),
      stars: starVisibility(sunAltDeg),
      zenith: `#${hex(palette.zenith)}`,
      horizon: `#${hex(palette.horizon)}`,
    }
  }, [when, loc])
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
      <color attach="background" args={[daylight.zenith]} />
      <fog attach="fog" args={[daylight.horizon, 120, 260]} />
      {daylight.stars > 0.02 && <MilkyWay loc={loc} when={when} visible={daylight.stars} />}
      {showFigures && daylight.stars > 0.15 && (
        <Figures loc={loc} when={when} fovRef={fovRef} visible={daylight.stars} />
      )}
      <Stars loc={loc} when={when} explore={explore} visible={daylight.stars} />
      <SunDisc loc={loc} when={when} onWarn={() => onSunWarning?.()} />
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
      <Meteors />
      <EffectComposer>
        {/* Bloom is what turns bright points into something that reads as
            LIGHT rather than as dots. Threshold kept high so only genuinely
            bright stars and the markers bloom, not the whole field. */}
        <Bloom intensity={0.85} luminanceThreshold={0.55} luminanceSmoothing={0.22} mipmapBlur radius={0.42} />
        <Vignette offset={0.28} darkness={0.62} eskil={false} />
      </EffectComposer>
      <CameraRig
        flyTo={flyTo}
        zoomNudge={zoomNudge}
        initialView={initialView}
        explore={explore}
        pose={pose}
        fovOut={fovRef}
      />
      {accuracy && (
        <Guidance
          target={guideTo}
          targetName={guideName}
          accuracy={accuracy}
          active={pose !== null}
        />
      )}
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
