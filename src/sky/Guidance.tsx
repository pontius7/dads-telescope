/**
 * Finding the thing, with the telescope.
 *
 * Drawn INSIDE the scene rather than as chrome over it, because every angle
 * here is a real angle. The reticle's rings are the Telrad's actual 0.5, 2 and
 * 4 degrees, so what is inside the middle ring on the phone is inside the
 * middle ring on the finder. Painting fixed-size circles on top of the canvas
 * would look the same and mean nothing — they would drift out of agreement the
 * moment the field of view changed.
 *
 * The trail is a great circle: the shortest way across the sky from where the
 * phone is pointing to where the object is. Its dots run toward the target and
 * quicken as the gap closes, so "getting warmer" is legible without reading a
 * number.
 */
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { horizonToWorld, worldToHorizon } from '../domain/frame'
import { headingReliability, turnFromTo } from '../domain/pointing'
import { guidance, LOCK_DEG, TELRAD_RINGS } from './guidanceState'

/** Distance in front of the camera. Everything else in the sky is further out. */
const RETICLE_DIST = 20
const TRAIL_DOTS = 34
const TRAIL_RADIUS = 84

const CALM = new THREE.Color('#8fa4c4')
const CLOSE = new THREE.Color('#e8c468')
const LOCKED = new THREE.Color('#6ee7a8')

/**
 * The Telrad, at true angular size.
 *
 * Sits on a plane held in front of the camera. `depthTest` is off so it draws
 * over the sky rather than being swallowed by the star sphere behind it.
 */
function Reticle({ colour }: { colour: THREE.Color }) {
  const group = useRef<THREE.Group>(null)
  const { camera } = useThree()

  const rings = useMemo(
    () =>
      TELRAD_RINGS.map((deg) => {
        const r = RETICLE_DIST * Math.tan((deg * Math.PI) / 180)
        // A hairline annulus. Width scales with the ring so the outer one does
        // not turn into a thread while the inner is a band.
        const w = Math.max(r * 0.012, 0.012)
        return { deg, geometry: new THREE.RingGeometry(r - w, r + w, 128) }
      }),
    [],
  )

  const mats = useRef<THREE.MeshBasicMaterial[]>([])

  useFrame((state) => {
    if (!group.current) return
    // Ride the camera: one distance out along the view axis, square to it.
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    group.current.position.copy(dir.multiplyScalar(RETICLE_DIST))
    group.current.quaternion.copy(camera.quaternion)

    // A slow breath on the outer ring only, so the reticle reads as live
    // without any of it drifting off its true angle — the RINGS never change
    // size, only their opacity does.
    const t = state.clock.elapsedTime
    mats.current.forEach((m, i) => {
      if (!m) return
      m.color.copy(colour)
      m.opacity = (i === 0 ? 0.9 : i === 1 ? 0.5 : 0.32) * (0.82 + 0.18 * Math.sin(t * 1.6))
    })
  })

  return (
    // Drawn last, always. `depthTest: false` alone is not enough: the horizon
    // plane is transparent too, and sorts NEARER than the reticle, so it was
    // painting over the aiming device exactly when the view dropped below the
    // horizon — which is precisely when you need to know where you are aimed.
    <group ref={group} renderOrder={20}>
      {rings.map((r, i) => (
        <mesh key={r.deg} geometry={r.geometry} renderOrder={20}>
          <meshBasicMaterial
            ref={(m) => {
              if (m) mats.current[i] = m
            }}
            color={colour}
            transparent
            opacity={0.5}
            depthTest={false}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}

/**
 * The shortest path across the sky, as running dots.
 *
 * Interpolated along the great circle rather than in altitude and azimuth
 * separately: those two are not a straight line on a sphere, and near the
 * zenith an azimuth-first path swings absurdly wide of the direct route.
 */
function Trail({ target }: { target: { altDeg: number; azDeg: number } }) {
  const points = useRef<THREE.Points>(null)
  const { camera } = useThree()

  // Same shape as the star field: attributes declared as children, so the
  // buffers are bound the way the one working Points in this scene binds them.
  const { positions, alphas } = useMemo(
    () => ({ positions: new Float32Array(TRAIL_DOTS * 3), alphas: new Float32Array(TRAIL_DOTS) }),
    [],
  )

  const to = useMemo(() => {
    const [x, y, z] = horizonToWorld(target.altDeg, target.azDeg, 1)
    return new THREE.Vector3(x, y, z)
  }, [target.altDeg, target.azDeg])

  useFrame((state) => {
    const geom = points.current?.geometry
    if (!geom) return
    const from = new THREE.Vector3()
    camera.getWorldDirection(from)

    const pos = geom.getAttribute('position') as THREE.BufferAttribute
    const alpha = geom.getAttribute('alpha') as THREE.BufferAttribute
    if (!pos || !alpha) return

    const gap = from.angleTo(to)
    // Below a couple of degrees the trail is shorter than the reticle and only
    // adds clutter; the rings take over.
    const visible = gap > (LOCK_DEG * 4 * Math.PI) / 180

    const t = state.clock.elapsedTime
    // Dots chase toward the target, faster as the gap closes.
    const speed = 0.35 + (1 - Math.min(1, gap / Math.PI)) * 1.5
    const v = new THREE.Vector3()

    for (let i = 0; i < TRAIL_DOTS; i += 1) {
      const f = i / (TRAIL_DOTS - 1)
      // Slerp gives the great circle for free and stays stable when the two
      // directions are nearly identical.
      v.copy(from).lerp(to, f)
      if (v.lengthSq() < 1e-8) v.copy(to)
      v.normalize().multiplyScalar(TRAIL_RADIUS)
      positions[i * 3] = v.x
      positions[i * 3 + 1] = v.y
      positions[i * 3 + 2] = v.z

      const chase = (f - t * speed) % 1
      const wave = Math.pow(Math.max(0, 1 - Math.abs(((chase + 1) % 1) - 0.5) * 2), 3)
      // Brightest at the reticle and fading outward. The far end is the end
      // that goes off screen when the target is a long way round, so fading
      // the NEAR end — the only part actually visible then — would leave
      // nothing to follow.
      alphas[i] = visible ? (0.38 + 0.62 * wave) * (1 - 0.45 * f) : 0
    }
    pos.needsUpdate = true
    alpha.needsUpdate = true
  })

  return (
    <points ref={points} frustumCulled={false} renderOrder={19}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-alpha" args={[alphas, 1]} />
      </bufferGeometry>
      <shaderMaterial
        transparent
        depthTest={false}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={useMemo(() => ({ uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) } }), [])}
        vertexShader={/* glsl */ `
          attribute float alpha;
          varying float vAlpha;
          uniform float uPixelRatio;
          void main() {
            vAlpha = alpha;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = 9.0 * uPixelRatio;
          }
        `}
        fragmentShader={/* glsl */ `
          varying float vAlpha;
          void main() {
            vec2 d = gl_PointCoord - vec2(0.5);
            float r = length(d);
            if (r > 0.5) discard;
            float soft = smoothstep(0.5, 0.05, r);
            gl_FragColor = vec4(vec3(0.72, 0.92, 1.0) * soft, soft * vAlpha);
          }
        `}
      />
    </points>
  )
}

/**
 * Watches where the camera points, works out the turn, and publishes it for
 * the text overlay. Rendering nothing itself except the reticle and the trail.
 */
export function Guidance({
  target, targetName, accuracy, active,
}: {
  target: { altDeg: number; azDeg: number } | null
  targetName: string | null
  accuracy: React.RefObject<number | null>
  active: boolean
}) {
  const { camera } = useThree()
  const colour = useRef(new THREE.Color().copy(CALM))
  const dir = useRef(new THREE.Vector3())

  useFrame(() => {
    camera.getWorldDirection(dir.current)
    const here = worldToHorizon([dir.current.x, dir.current.y, dir.current.z])

    guidance.altDeg = here.altDeg
    guidance.azDeg = here.azDeg
    guidance.quality = headingReliability(accuracy.current)

    if (!target) {
      guidance.phase = 'searching'
      guidance.targetName = null
      guidance.separationDeg = 0
      colour.current.lerp(CALM, 0.06)
    } else {
      const turn = turnFromTo(here, target)
      guidance.targetName = targetName
      guidance.turnRightDeg = turn.turnRightDeg
      guidance.turnUpDeg = turn.turnUpDeg
      guidance.separationDeg = turn.separationDeg
      guidance.phase =
        turn.separationDeg <= LOCK_DEG ? 'locked' : turn.separationDeg <= 12 ? 'closing' : 'guiding'
      colour.current.lerp(
        guidance.phase === 'locked' ? LOCKED : guidance.phase === 'closing' ? CLOSE : CALM,
        0.08,
      )
    }
    guidance.revision += 1
  })

  if (!active) return null

  return (
    <>
      <Reticle colour={colour.current} />
      {target && <Trail target={target} />}
    </>
  )
}
