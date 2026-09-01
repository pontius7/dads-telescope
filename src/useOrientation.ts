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
 *
 * This hook does no astronomy. It publishes the raw pose — all three angles
 * plus the screen's own rotation — and lets `domain/pointing` work out where
 * that is looking. It used to do the conversion here, with two of the three
 * angles, and got the answer wrong wherever the phone was rolled or aimed near
 * the zenith.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DevicePose } from './domain/pointing'

export type OrientationState = 'unsupported' | 'idle' | 'granted' | 'denied'

interface IOSDeviceOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number
  webkitCompassAccuracy?: number
}
type PermissionCapable = {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>
}

export function isOrientationSupported(): boolean {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window
}

/** The screen's own rotation, which turns the picture but never the telescope. */
function screenAngle(): number {
  if (typeof window === 'undefined') return 0
  return window.screen?.orientation?.angle ?? 0
}

export function useOrientation() {
  const [state, setState] = useState<OrientationState>(() =>
    isOrientationSupported() ? 'idle' : 'unsupported',
  )
  // Written by the event, read by the render loop — a ref avoids re-rendering
  // React 60 times a second for a value only the 3D camera consumes.
  const pose = useRef<DevicePose | null>(null)
  /**
   * How far the compass may be out, in degrees. iOS reports this directly and
   * uses a NEGATIVE value to mean "not calibrated at all". Null means the
   * platform never said, which is not the same as saying it is fine.
   */
  const accuracy = useRef<number | null>(null)

  const handler = useCallback((e: DeviceOrientationEvent) => {
    const ev = e as IOSDeviceOrientationEvent

    // Safari gives a true compass heading directly, and it is the only value
    // here that is tied to north. Elsewhere `alpha` is relative to an
    // arbitrary starting orientation unless `absolute` is set, so the view can
    // be turned but is not guaranteed to be north-aligned.
    const compass = ev.webkitCompassHeading
    const alphaDeg = compass !== undefined ? 360 - compass : (e.alpha ?? 0)

    pose.current = {
      alphaDeg,
      betaDeg: e.beta ?? 0,
      gammaDeg: e.gamma ?? 0,
      screenAngleDeg: screenAngle(),
    }

    if (ev.webkitCompassAccuracy !== undefined) {
      accuracy.current = ev.webkitCompassAccuracy
    } else if (compass === undefined && !e.absolute) {
      // No compass and no absolute frame: the heading is not referenced to
      // north at all. Saying so is better than drawing a confident arrow.
      accuracy.current = -1
    }
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
      // `deviceorientationabsolute` is north-referenced where it exists, which
      // is what Android needs; Safari has none and answers the plain event
      // with a compass heading attached.
      window.addEventListener('deviceorientationabsolute', handler, true)
      window.addEventListener('deviceorientation', handler, true)
      setState('granted')
    } catch {
      setState('denied')
    }
  }, [handler])

  const stop = useCallback(() => {
    window.removeEventListener('deviceorientationabsolute', handler, true)
    window.removeEventListener('deviceorientation', handler, true)
    pose.current = null
    accuracy.current = null
    setState(isOrientationSupported() ? 'idle' : 'unsupported')
  }, [handler])

  useEffect(
    () => () => {
      window.removeEventListener('deviceorientationabsolute', handler, true)
      window.removeEventListener('deviceorientation', handler, true)
    },
    [handler],
  )

  return { state, pose, accuracy, start, stop }
}
