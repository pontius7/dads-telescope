/**
 * The words that go with the arrow.
 *
 * A Dobsonian moves in exactly two directions, so the instruction is exactly
 * two numbers: swing it left or right, and raise or lower it. That is the
 * whole vocabulary, and it is the same vocabulary as the mount, which is why
 * it beats "azimuth 214, altitude 61" for someone standing in a field in the
 * dark.
 *
 * Updated straight from the render loop's scratchpad on an animation frame.
 * Routing sixty numbers a second through React state would re-render the app
 * continuously to move a couple of digits, so the nodes are written by hand.
 */
import { useEffect, useRef } from 'react'
import { guidance } from './sky/guidanceState'
import { compass } from './useSky'
import { t } from './i18n'

export function PointingHUD({ active }: { active: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const turnEl = useRef<HTMLDivElement>(null)
  const subEl = useRef<HTMLDivElement>(null)
  const nameEl = useRef<HTMLDivElement>(null)


  useEffect(() => {
    if (!active) return
    let frame = 0
    let lastPhase = ''
    let seen = -1

    const tick = () => {
      frame = requestAnimationFrame(tick)
      if (guidance.revision === seen) return
      seen = guidance.revision

      const g = guidance
      if (root.current && g.phase !== lastPhase) {
        root.current.dataset.phase = g.phase
        lastPhase = g.phase
      }
      // The banner is gone — it was a paragraph of warning over the sky every
      // time the compass was less than perfect, which is most of the time. The
      // claim it made still has to be made, so it is made on the number
      // itself: a rough heading is marked approximate and coloured, which is
      // exactly as true and takes no room.
      if (root.current) root.current.dataset.quality = g.quality

      if (nameEl.current) {
        nameEl.current.textContent = g.targetName ?? ''
      }

      if (turnEl.current) {
        if (!g.targetName) {
          const rough = g.quality === 'unreliable' || g.quality === 'coarse'
          const here = `${Math.round(g.altDeg)}° ${compass(g.azDeg)}`
          turnEl.current.textContent = rough ? `≈ ${here}` : here
        } else if (g.phase === 'locked') {
          turnEl.current.textContent = t('guide.centred')
        } else {
          // Below a degree the number stops meaning anything a person can act
          // on, so that axis simply drops out of the instruction.
          const parts: string[] = []
          const lr = Math.round(Math.abs(g.turnRightDeg))
          const ud = Math.round(Math.abs(g.turnUpDeg))
          if (lr >= 1) parts.push(g.turnRightDeg > 0 ? t('guide.right', lr) : t('guide.left', lr))
          if (ud >= 1) parts.push(g.turnUpDeg > 0 ? t('guide.up', ud) : t('guide.down', ud))
          const rough = g.quality === 'unreliable' || g.quality === 'coarse'
          const text = parts.join('  ·  ') || t('guide.almost')
          turnEl.current.textContent = rough ? `≈ ${text}` : text
        }
      }

      if (subEl.current) {
        subEl.current.textContent = !g.targetName
          ? t('guide.sweep')
          : g.phase === 'locked'
            ? t('guide.eyepiece')
            : t('guide.away', g.separationDeg)
      }

    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active])

  if (!active) return null

  return (
    <div className="hud" ref={root} data-phase="searching" role="status" aria-live="polite">
      <div className="hud-name" ref={nameEl} />
      <div className="hud-turn" ref={turnEl} />
      <div className="hud-sub" ref={subEl} />
    </div>
  )
}
