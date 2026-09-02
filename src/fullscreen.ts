// Fullscreen for the "Generate video" flows. The recorder captures the tab, so
// the captured frame is exactly the page viewport: going fullscreen first drops
// the browser's own toolbars out of that viewport, which means a clean 16:9 at
// the screen's full height instead of a letterboxed slice of it.

/** Vendor-prefixed shapes, still needed for Safari. */
interface FsElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void
}
interface FsDocument extends Document {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}

export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false
  const d = document as FsDocument
  return !!(d.fullscreenElement ?? d.webkitFullscreenElement)
}

/**
 * Ask for fullscreen on the whole page.
 *
 * Must be called straight from the click that starts the recording — browsers
 * only grant this while a user gesture is live, and the capture picker that
 * follows will have consumed it. Failure is not worth reporting: the episode
 * records fine in a window, it just doesn't fill the screen.
 */
export function enterFullscreen(): void {
  if (typeof document === 'undefined' || isFullscreen()) return
  const el = document.documentElement as FsElement
  try {
    const req = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el)
    void Promise.resolve(req?.()).catch(() => {})
  } catch {
    // Blocked by permissions policy or an unsupported browser — carry on.
  }
}

/** Drop back out of fullscreen once the recording is done. */
export function exitFullscreen(): void {
  if (typeof document === 'undefined' || !isFullscreen()) return
  const d = document as FsDocument
  try {
    const exit = d.exitFullscreen?.bind(d) ?? d.webkitExitFullscreen?.bind(d)
    void Promise.resolve(exit?.()).catch(() => {})
  } catch {
    // Nothing to do — the user can always leave fullscreen themselves.
  }
}
