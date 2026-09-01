/**
 * The 3D object view.
 *
 * Reached by tapping a target in What's Hot. Two very different treatments,
 * because the honest answer differs:
 *
 *   SOLAR-SYSTEM BODIES get a real, rotatable globe built from an actual
 *   surface map, lit from the true direction of the Sun and turned to the real
 *   phase. Drag it. This is legitimate: we know what these surfaces look like.
 *
 *   DEEP-SKY OBJECTS get their verified photograph on a slowly drifting plane
 *   with a parallax star layer behind. There is no honest 3D model of a galaxy
 *   from Earth's viewpoint, and inventing one would be exactly the fabrication
 *   this app refuses everywhere else.
 */
import { Component, Suspense, useMemo, useRef, useState, useEffect, type ReactNode } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Body, Illumination, MakeTime } from 'astronomy-engine'
import type { Target } from '../domain/targets'
import { imageFor } from '../data/imagery'

const TEXTURES: Record<string, string> = {
  moon: '/textures/moon.jpg',
  mars: '/textures/mars.jpg',
  jupiter: '/textures/jupiter.jpg',
  saturn: '/textures/saturn.jpg',
  venus: '/textures/venus.jpg',
  mercury: '/textures/mercury.jpg',
  uranus: '/textures/uranus.jpg',
  neptune: '/textures/neptune.jpg',
}

/** Axial tilt in degrees. Real values — Uranus really is on its side. */
const AXIAL_TILT: Record<string, number> = {
  moon: 6.7, mercury: 0.03, venus: 177.4, mars: 25.2,
  jupiter: 3.1, saturn: 26.7, uranus: 97.8, neptune: 28.3,
}

function Globe({
  targetId, phaseAngleDeg, spin,
}: {
  targetId: string
  phaseAngleDeg: number
  spin: React.RefObject<number>
}) {
  const url = TEXTURES[targetId]!
  const texture = useLoader(THREE.TextureLoader, url)
  const mesh = useRef<THREE.Mesh>(null)

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
  }, [texture])

  useFrame((_, dt) => {
    if (!mesh.current) return
    // Idle drift plus whatever the user has dragged. Slow enough to read as
    // "this is a sphere" rather than a spinning novelty.
    spin.current += dt * 0.06
    mesh.current.rotation.y = spin.current
  })

  const tilt = ((AXIAL_TILT[targetId] ?? 0) * Math.PI) / 180

  return (
    <group rotation={[0, 0, tilt]}>
      <mesh ref={mesh}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial map={texture} roughness={1} metalness={0} />
      </mesh>
      {targetId === 'saturn' && <SaturnRings />}
      {/* The Sun, placed at the real phase angle, so the terminator falls
          where it actually falls tonight. */}
      <directionalLight
        position={[
          Math.cos((phaseAngleDeg * Math.PI) / 180) * 5,
          0.6,
          Math.sin((phaseAngleDeg * Math.PI) / 180) * 5,
        ]}
        intensity={3.1}
      />
      <ambientLight intensity={0.05} />
    </group>
  )
}

/** Saturn without rings would be a lie of omission. */
function SaturnRings() {
  const tex = useMemo(() => {
    const W = 256
    const c = document.createElement('canvas')
    c.width = W
    c.height = 1
    const ctx = c.getContext('2d')!
    // Banding roughly follows the real structure: C ring faint, B ring bright,
    // Cassini division dark, A ring moderate.
    const bands: [number, number, string][] = [
      [0.0, 0.16, 'rgba(150,140,120,0.10)'],
      [0.16, 0.30, 'rgba(190,175,150,0.42)'],
      [0.30, 0.62, 'rgba(226,212,186,0.86)'],
      [0.62, 0.68, 'rgba(90,84,74,0.16)'],
      [0.68, 0.93, 'rgba(206,193,170,0.62)'],
      [0.93, 1.0, 'rgba(150,140,120,0.10)'],
    ]
    for (const [a, b, colour] of bands) {
      ctx.fillStyle = colour
      ctx.fillRect(a * W, 0, (b - a) * W, 1)
    }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])

  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[1.24, 2.28, 128]} />
      <meshBasicMaterial map={tex} side={THREE.DoubleSide} transparent depthWrite={false} />
    </mesh>
  )
}

/**
 * A deep-sky object: its verified photograph, drifting slowly, with a parallax
 * star layer behind it. Deliberately NOT a 3D model — there isn't an honest one.
 */
function DeepSkyCard({ url }: { url: string }) {
  const texture = useLoader(THREE.TextureLoader, url)
  const group = useRef<THREE.Group>(null)
  const stars = useRef<THREE.Points>(null)

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace
  }, [texture])

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    if (group.current) {
      // Very slight breathing and drift — enough to feel alive, not enough to
      // distract from the picture.
      group.current.rotation.z = Math.sin(t * 0.08) * 0.012
      group.current.position.x = Math.sin(t * 0.11) * 0.02
      group.current.scale.setScalar(1 + Math.sin(t * 0.13) * 0.006)
    }
    if (stars.current) stars.current.rotation.z -= dt * 0.006
  })

  const starGeo = useMemo(() => {
    let seed = 4242
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
    const pos: number[] = []
    for (let i = 0; i < 260; i += 1) {
      pos.push((rnd() - 0.5) * 9, (rnd() - 0.5) * 9, -2.2 - rnd() * 2)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    return g
  }, [])

  const aspect = texture.image ? texture.image.width / texture.image.height : 1.5
  const h = 2.1
  const w = h * aspect

  return (
    <>
      <points ref={stars} geometry={starGeo}>
        <pointsMaterial size={0.022} color="#8fa4c4" transparent opacity={0.75} />
      </points>
      <group ref={group}>
        <mesh>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      </group>
    </>
  )
}

/** Drag to spin a globe; the deep-sky card ignores it. */
function DragSpin({ spin, enabled }: { spin: React.RefObject<number>; enabled: boolean }) {
  const { gl } = useThree()
  useEffect(() => {
    if (!enabled) return
    const el = gl.domElement
    let last: number | null = null
    const down = (e: PointerEvent) => (last = e.clientX)
    const move = (e: PointerEvent) => {
      if (last === null) return
      spin.current -= (e.clientX - last) * 0.008
      last = e.clientX
    }
    const up = () => (last = null)
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [gl, spin, enabled])
  return null
}

export function ObjectView({ target, when }: { target: Target; when: Date }) {
  const spin = useRef(0)
  const [failed, setFailed] = useState(false)

  const isBody = target.type === 'solar-system' && TEXTURES[target.id] !== undefined
  const img = imageFor(target.id)

  // Real phase angle, so the lit fraction shown matches what is in the sky.
  const phaseAngleDeg = useMemo(() => {
    if (target.type !== 'solar-system') return 0
    try {
      return Illumination(target.body as Body, MakeTime(when)).phase_angle
    } catch {
      return 0
    }
  }, [target, when])

  // Nothing verified to show is not a failure state worth dressing up.
  if (!isBody && !img) return null
  if (failed) return null

  return (
    <div className="objview" data-kind={isBody ? 'body' : 'deep-sky'}>
      <Canvas
        camera={{ fov: 40, position: [0, 0, isBody ? 3.4 : 3.0] }}
        dpr={Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2)}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      >
        <SceneBoundary onError={() => setFailed(true)}>
          {/* useLoader suspends, so the boundary needs a Suspense inside it. */}
          <Suspense fallback={null}>
            {isBody ? (
              <Globe targetId={target.id} phaseAngleDeg={phaseAngleDeg} spin={spin} />
            ) : (
              <DeepSkyCard url={img!.url} />
            )}
          </Suspense>
        </SceneBoundary>
        <DragSpin spin={spin} enabled={isBody} />
      </Canvas>
      {isBody && <span className="objview-hint">Drag to rotate</span>}
    </div>
  )
}

/**
 * A texture that fails to load must not take the whole card down. R3F throws
 * inside the render tree, so this catches it and lets the card disappear
 * quietly rather than showing a broken scene.
 */
class SceneBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { dead: boolean }
> {
  state = { dead: false }
  static getDerivedStateFromError() {
    return { dead: true }
  }
  componentDidCatch() {
    this.props.onError()
  }
  render() {
    return this.state.dead ? null : this.props.children
  }
}
