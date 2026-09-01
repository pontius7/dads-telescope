/**
 * Point at Sky — device-orientation driven view.
 *
 * THE RULE: permission is requested ONLY when the user explicitly taps the
 * button. iOS 13+ requires a user gesture for
 * `DeviceOrientationEvent.requestPermission()` anyway, but the important part
 * is that nothing here runs on launch. An app that asks for motion access the
 * moment it opens teaches people to dismiss the prompt.
 *
 * If the device cannot report orientation, the control is hidden rather than
 * offered and then failing.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export type OrientationState = 'unsupported' | 'idle' | 'granted' | 'denied'

interface IOSDeviceOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number
}
type PermissionCapable = {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>
}

export function isOrientationSupported(): boolean {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window
}

export function useOrientation() {
  const [state, setState] = useState<OrientationState>(() =>
    isOrientationSupported() ? 'idle' : 'unsupported',
  )
  // Written by the event, read by the render loop — a ref avoids re-rendering
  // React 60 times a second for a value only the 3D camera consumes.
  const heading = useRef<{ azDeg: number; altDeg: number } | null>(null)

  const handler = useCallback((e: DeviceOrientationEvent) => {
    const ev = e as IOSDeviceOrientationEvent

    // Safari gives a true-north compass heading directly. Elsewhere, `alpha`
    // is relative to an arbitrary starting orientation unless `absolute` is
    // set, so the view can be rotated but is not guaranteed north-aligned.
    const compass = ev.webkitCompassHeading
    const alpha = e.alpha ?? 0
    const azDeg = compass !== undefined ? compass : (360 - alpha) % 360

    // beta is front-to-back tilt: 0 = flat on a table, 90 = held upright.
    // Held upright and pointed at the horizon is altitude 0; pointing straight
    // up is altitude 90.
    const beta = e.beta ?? 0
    const altDeg = Math.max(-20, Math.min(89, beta - 90))

    heading.current = { azDeg, altDeg }
  }, [])

  const start = useCallback(async () => {
    if (!isOrientationSupported()) {
      setState('unsupported')
      return
    }
    const DOE = window.DeviceOrientationEvent as unknown as PermissionCapable
    try {
      if (typeof DOE?.requestPermission === 'function') {
        // iOS: must be called from inside the tap handler.
        const res = await DOE.requestPermission()
        if (res !== 'granted') {
          setState('denied')
          return
        }
      }
      window.addEventListener('deviceorientation', handler, true)
      setState('granted')
    } catch {
      setState('denied')
    }
  }, [handler])

  const stop = useCallback(() => {
    window.removeEventListener('deviceorientation', handler, true)
    heading.current = null
    setState(isOrientationSupported() ? 'idle' : 'unsupported')
  }, [handler])

  useEffect(() => () => window.removeEventListener('deviceorientation', handler, true), [handler])

  return { state, heading, start, stop }
}
