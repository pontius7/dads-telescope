/**
 * Keep the screen on while the telescope is out.
 *
 * The phone locking itself is a real problem at the eyepiece: it happens
 * exactly when both hands are on the tube, and it is fixed by unlocking a
 * cold phone in the dark. The Screen Wake Lock API exists for this.
 *
 * WHAT IT CANNOT PROMISE. Safari has supported it since iOS 16.4, but a
 * long-standing bug broke it inside INSTALLED web apps until iOS 18.4 — which
 * is the very way this app is meant to be used. So the hook reports what
 * actually happened rather than assuming success, and the menu says "not
 * supported on this phone" instead of quietly leaving him to discover it in a
 * field. The browser also drops the lock whenever the page is hidden, by
 * design, so it is re-acquired when the app comes back.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export type WakeLockState = 'unsupported' | 'off' | 'on' | 'failed'

interface WakeLockSentinelLike {
  released: boolean
  release: () => Promise<void>
  addEventListener: (type: 'release', fn: () => void) => void
}

function api(): { request: (type: 'screen') => Promise<WakeLockSentinelLike> } | null {
  const nav = navigator as Navigator & {
    wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
  }
  return nav.wakeLock ?? null
}

export function isWakeLockSupported(): boolean {
  return api() !== null
}

export function useWakeLock(enabled: boolean) {
  const [state, setState] = useState<WakeLockState>(() =>
    isWakeLockSupported() ? 'off' : 'unsupported',
  )
  const sentinel = useRef<WakeLockSentinelLike | null>(null)

  const acquire = useCallback(async () => {
    const wakeLock = api()
    if (!wakeLock) {
      setState('unsupported')
      return
    }
    if (sentinel.current && !sentinel.current.released) return
    try {
      const lock = await wakeLock.request('screen')
      sentinel.current = lock
      setState('on')
      // The browser releases the lock on its own when the page is hidden;
      // reflect that rather than continuing to claim the screen is held.
      lock.addEventListener('release', () => setState((s) => (s === 'on' ? 'off' : s)))
    } catch {
      // Denied, or the installed-PWA bug on iOS before 18.4.
      setState('failed')
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      void sentinel.current?.release().catch(() => {})
      sentinel.current = null
      setState(isWakeLockSupported() ? 'off' : 'unsupported')
      return
    }

    void acquire()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel.current?.release().catch(() => {})
      sentinel.current = null
    }
  }, [enabled, acquire])

  return state
}
