/**
 * Whether the person using this has asked for less movement.
 *
 * The CSS honours `prefers-reduced-motion` in a couple of places, but the sky
 * is a WebGL canvas and none of it reached there: the view drifted, markers
 * breathed, meteors fell and the whole thing revealed itself on load whatever
 * the setting said. A canvas is not exempt from an accessibility preference
 * just because the browser cannot enforce it.
 *
 * Live rather than read-once, because the setting can change while the app is
 * open — iOS flips it with Reduce Motion in Accessibility settings.
 */
import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(QUERY).matches === true,
  )

  useEffect(() => {
    const mq = window.matchMedia?.(QUERY)
    if (!mq) return
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}
