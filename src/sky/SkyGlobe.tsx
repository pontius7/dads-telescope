/**
 * A planet or the Moon, hanging in the sky as an actual sphere.
 *
 * WHY ITS OWN SHADER RATHER THAN A LIGHT. Lights in three.js are scene-wide.
 * Give each body its own directional light, as the detail card does with the
 * single globe it draws, and every body in the sky ends up lit by every other
 * body's sun — so Saturn would wear Venus's phase. A two-line Lambert shader
 * keeps each terminator private to the sphere it belongs to, costs no lights
 * at all, and puts the phase exactly where the ephemeris says it is.
 *
 * The phase is the honest part. This is the one class of object whose
 * appearance changes night to night, and a Moon drawn full when it is a
 * crescent would be a picture of a different night.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { AXIAL_TILT, BODY_TEXTURES } from './bodies'
import { saturnRingGeometry, saturnRingTexture } from './saturnRings'

const VERT = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uSun;
  uniform float uAmbient;
  uniform float uGain;
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  void main() {
    float lambert = max(dot(normalize(vWorldNormal), normalize(uSun)), 0.0);
    // A soft edge on the terminator: a razor line reads as a rendering error
    // rather than as sunlight falling across a curved surface.
    float lit = smoothstep(0.0, 0.22, lambert) * lambert;
    vec3 surface = texture2D(uMap, vUv).rgb;
    gl_FragColor = vec4(surface * (uAmbient + lit) * uGain, 1.0);
  }
`

export function SkyGlobe({
  targetId, phaseAngleDeg, radius, brightness = 1,
}: {
  targetId: string
  /** Real phase angle, so the terminator falls where it actually falls tonight. */
  phaseAngleDeg: number
  radius: number
  brightness?: number
}) {
  const url = BODY_TEXTURES[targetId]!
  const texture = useLoader(THREE.TextureLoader, url)
  const spin = useRef(0)
  const mesh = useRef<THREE.Mesh>(null)

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
  }, [texture])

  const uniforms = useMemo(
    () => ({
      uMap: { value: texture },
      uSun: { value: new THREE.Vector3(1, 0, 0) },
      uAmbient: { value: 0.06 },
      uGain: { value: brightness },
    }),
    // Rebuilt only when the texture object itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [texture],
  )

  useEffect(() => {
    const a = (phaseAngleDeg * Math.PI) / 180
    uniforms.uSun.value.set(Math.cos(a), 0.28, Math.sin(a)).normalize()
    uniforms.uGain.value = brightness
  }, [phaseAngleDeg, brightness, uniforms])

  useFrame((_, dt) => {
    if (!mesh.current) return
    // Slow enough to read as "this is a sphere", not as a spinning novelty.
    spin.current += dt * 0.05
    mesh.current.rotation.y = spin.current
  })

  const tilt = ((AXIAL_TILT[targetId] ?? 0) * Math.PI) / 180
  const rings = useMemo(
    () =>
      targetId === 'saturn'
        ? { texture: saturnRingTexture(), geometry: saturnRingGeometry() }
        : null,
    [targetId],
  )

  return (
    <group rotation={[0, 0, tilt]} scale={radius}>
      <mesh ref={mesh}>
        <sphereGeometry args={[1, 32, 32]} />
        <shaderMaterial vertexShader={VERT} fragmentShader={FRAG} uniforms={uniforms} />
      </mesh>
      {rings && (
        <mesh rotation={[Math.PI / 2, 0, 0]} geometry={rings.geometry}>
          <meshBasicMaterial
            map={rings.texture}
            side={THREE.DoubleSide}
            transparent
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  )
}
