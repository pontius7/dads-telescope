/**
 * Whether the sky is being handled right now.
 *
 * While someone is dragging or zooming, the controls over the sky are just
 * things in the way of the thing they are moving — so they step aside and come
 * back when the hands stop. The delay before returning is deliberately longer
 * than the gesture's own pauses, or the chrome would flicker back between a
 * pinch and the next drag.
 *
 * Only gestures ON THE SKY count. A tap on a button is not handling the sky,
 * and hiding the controls the moment one is pressed would make them disappear
 * under the finger.
 */
import { useEffect, useRef, useState } from 'react'

/** Long enough to bridge the pause between two drags, short enough to feel prompt. */
const SETTLE_MS = 550

export function useSkyIdle(): boolean {
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const onSky = (target: EventTarget | null) =>
      target instanceof HTMLElement && target.tagName === 'CANVAS'

    const touch = (e: Event) => {
      if (!onSky(e.target)) return
      setBusy(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setBusy(false), SETTLE_MS)
    }

    // `pointermove` alone would fire for a hovering mouse; the button state
    // keeps it to actual dragging.
    const move = (e: PointerEvent) => {
      if (e.buttons === 0) return
      touch(e)
    }

    window.addEventListener('pointerdown', touch, { passive: true })
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('wheel', touch, { passive: true })
    window.addEventListener('touchmove', touch, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', touch)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('wheel', touch)
      window.removeEventListener('touchmove', touch)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  return busy
}
