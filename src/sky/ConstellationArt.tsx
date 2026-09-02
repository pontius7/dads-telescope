/**
 * The figure behind the stick figure.
 *
 * Tap a constellation and its painting rises out of the dark for a few
 * seconds, in light blue, then goes again. The lines stay as they are — this
 * is a reveal, not a permanent overlay, because a sky full of painted animals
 * is a poster and this is still an instrument.
 *
 * HOW IT LANDS IN THE RIGHT PLACE. Each painting ships with three anchors: a
 * pixel in the image paired with the star it belongs on. Resolving those stars
 * gives three directions in the sky, and three point pairs are exactly what an
 * affine map needs — so the image is not placed near the constellation, it is
 * SOLVED onto it. Orion's belt lands on Orion's belt.
 *
 * The quad is subdivided rather than flat because the sky is a sphere: a
 * single rectangle would bulge away from the stars at its corners, which is
 * most visible on the big figures where it matters most.
 *
 * Artwork by Johan Meuris for Stellarium, used under the Free Art License.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { fixedHorizontal, type GeoLocation } from '../domain/ephemeris'
import { horizonToWorld } from '../domain/frame'
import { solvePlacement } from './figurePlacement'
import ART from '../data/constellationArt.json'

interface Anchor {
  x: number
  y: number
  raHoursJ2000: number
  decDegJ2000: number
}
interface Figure {
  file: string
  imageSize: [number, number]
  anchors: Anchor[]
}

const FIGURES = ART as unknown as Record<string, Figure>

export function hasFigure(name: string): boolean {
  return FIGURES[name] !== undefined
}

/** Where the painting sits: outside the markers, inside the stars. */
const RADIUS = 92
/** Grid resolution across the image. Enough to follow the curve, cheap to build. */
const STEPS = 10

const TINT = new THREE.Color('#7ec8ff')

/** Seconds: rise, hold, then a quicker fall. */
const FADE_IN = 0.75
const HOLD = 3
const FADE_OUT = 0.45

function directionOf(a: Anchor, when: Date, loc: GeoLocation): THREE.Vector3 {
  const h = fixedHorizontal(a.raHoursJ2000, a.decDegJ2000, when, loc, 'normal')
  const [x, y, z] = horizonToWorld(h.altitudeDeg, h.azimuthDeg, 1)
  return new THREE.Vector3(x, y, z)
}

/**
 * Builds the warped quad for one figure, or null when the anchors are
 * degenerate. The placement maths lives in `figurePlacement` so it can be
 * tested; this only turns it into triangles.
 */
function buildGeometry(fig: Figure, when: Date, loc: GeoLocation): THREE.BufferGeometry | null {
  const dirs = fig.anchors.map((a) => directionOf(a, when, loc))
  const place = solvePlacement(fig.anchors, dirs)
  if (!place) return null

  const [w, h] = fig.imageSize
  const positions: number[] = []
  const uvs: number[] = []

  for (let iy = 0; iy <= STEPS; iy += 1) {
    for (let ix = 0; ix <= STEPS; ix += 1) {
      const d = place((ix / STEPS) * w, (iy / STEPS) * h).multiplyScalar(RADIUS)
      positions.push(d.x, d.y, d.z)
      // Image space runs top-down, texture space bottom-up.
      uvs.push(ix / STEPS, 1 - iy / STEPS)
    }
  }

  const indices: number[] = []
  for (let iy = 0; iy < STEPS; iy += 1) {
    for (let ix = 0; ix < STEPS; ix += 1) {
      const a = iy * (STEPS + 1) + ix
      const b = a + 1
      const c = a + STEPS + 1
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(indices)
  return g
}

export function ConstellationArt({
  name, when, loc, onDone,
}: {
  name: string | null
  when: Date
  loc: GeoLocation
  onDone: () => void
}) {
  const fig = name ? FIGURES[name] : undefined
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  const material = useRef<THREE.MeshBasicMaterial>(null)
  const age = useRef(0)

  useEffect(() => {
    age.current = 0
    if (!fig) {
      setTexture(null)
      return
    }
    let live = true
    new THREE.TextureLoader().load(`/figures/${fig.file}`, (tex) => {
      if (!live) {
        tex.dispose()
        return
      }
      tex.colorSpace = THREE.SRGBColorSpace
      setTexture(tex)
    })
    return () => {
      live = false
    }
  }, [fig])

  const geometry = useMemo(
    () => (fig ? buildGeometry(fig, when, loc) : null),
    [fig, when, loc],
  )

  useFrame((_, dt) => {
    if (!material.current || !fig) return
    age.current += dt
    const a = age.current
    const opacity =
      a < FADE_IN
        ? a / FADE_IN
        : a < FADE_IN + HOLD
          ? 1
          : Math.max(0, 1 - (a - FADE_IN - HOLD) / FADE_OUT)
    material.current.opacity = opacity * 0.85
    if (a > FADE_IN + HOLD + FADE_OUT) onDone()
  })

  if (!fig || !geometry || !texture) return null

  return (
    <mesh geometry={geometry} renderOrder={-1} frustumCulled={false}>
      <meshBasicMaterial
        ref={material}
        map={texture}
        color={TINT}
        transparent
        opacity={0}
        depthTest={false}
        depthWrite={false}
        side={THREE.DoubleSide}
        // The paintings are greyscale on black, so adding them to the sky
        // lights the figure and leaves the background untouched — no
        // rectangle, no box, just the shape glowing over the stars.
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}
