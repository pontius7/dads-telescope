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
// Shared with the sky marker, so the Moon on this card and the Moon overhead
// are the same body with the same tilt.
import { AXIAL_TILT, BODY_TEXTURES as TEXTURES } from './bodies'
import { saturnRingGeometry, saturnRingTexture } from './saturnRings'


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
  // Same geometry and banding as the sky marker, so the card and the sky show
  // the same planet.
  const rings = useMemo(
    () => ({ texture: saturnRingTexture(), geometry: saturnRingGeometry() }),
    [],
  )
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} geometry={rings.geometry}>
      <meshBasicMaterial
        map={rings.texture}
        side={THREE.DoubleSide}
        transparent
        depthWrite={false}
      />
    </mesh>
  )
}

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
