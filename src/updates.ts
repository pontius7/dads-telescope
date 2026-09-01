/**
 * Making a new version actually arrive.
 *
 * The service worker was registered and then never asked about again. Workbox
 * was configured to take over immediately once it found a new build — but
 * nothing on the page side ever went looking, and nothing reloaded when the
 * handover happened. So a phone that had opened the app once kept serving the
 * bundle it cached that day, indefinitely. Deploys were correct and invisible.
 *
 * Three things fix it, and all three are needed:
 *
 *   1. Ask on a timer. A phone left on the telescope all evening never
 *      navigates, so without this it never learns there is a new version.
 *   2. Ask when the app comes back to the foreground. This is the one that
 *      matters on iOS, where an installed web app is suspended and resumed far
 *      more often than it is launched.
 *   3. Reload when the new worker takes control, once and only once.
 *
 * The reload is safe here because this app holds no unsaved work: settings and
 * location are already written to storage as they change.
 */
import { registerSW } from 'virtual:pwa-register'

/** Hourly. Often enough to catch a deploy in one evening, rare enough to ignore. */
const CHECK_INTERVAL_MS = 60 * 60 * 1000

export function watchForUpdates(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Fires once per handover, but guard anyway: a reload loop on a phone in a
    // field would be worse than a stale version.
    if (reloading) return
    reloading = true
    window.location.reload()
  })

  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      const check = () => {
        void registration.update().catch(() => {
          // Offline, which is the normal case in a dark field. Try again later.
        })
      }
      setInterval(check, CHECK_INTERVAL_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })
}
