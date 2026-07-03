import { APP_BUILD_SHA } from './appBuildInfo.js'
import { clearStaleChunkReloadGuard } from './lazyImportWithChunkReload.js'

/** Dispatched when live index.html reports a newer build than this session. */
export const APP_UPDATE_AVAILABLE_EVENT = 'edge-app-update-available'

const APP_UPDATE_DISMISS_KEY = 'lvsp_app_update_dismissed_token'
const DEPLOY_POLL_MS = 5 * 60 * 1000
const BUILD_SHA_META = 'edge-build-sha'
/** Refocus path: show banner briefly, then silent reload. */
export const APP_UPDATE_VISIBILITY_RELOAD_MS = 3000

/** @type {number | null} */
let pendingReloadId = null

function readBuildShaFromHtml(html) {
  if (!html) return null
  const meta = html.match(
    new RegExp(`<meta\\s+name=["']${BUILD_SHA_META}["']\\s+content=["']([^"']+)["']`, 'i'),
  )
  if (meta?.[1]) return meta[1].trim()
  const main = html.match(/\/assets\/main-[A-Za-z0-9_-]+\.js/)
  return main ? main[0] : null
}

/** Token for the build currently running in this tab. */
export function readLiveBuildToken() {
  if (typeof document === 'undefined') return APP_BUILD_SHA
  const meta = document.querySelector(`meta[name="${BUILD_SHA_META}"]`)
  const fromMeta = meta?.getAttribute('content')?.trim()
  if (fromMeta) return fromMeta
  const script = document.querySelector('script[type="module"][src*="/assets/main-"]')
  if (!script) return APP_BUILD_SHA
  try {
    return new URL(script.getAttribute('src') || '', window.location.origin).pathname
  } catch {
    return APP_BUILD_SHA
  }
}

/** Fetch build token from live index.html (no-store). */
export async function fetchRemoteBuildToken() {
  if (typeof window === 'undefined') return null
  try {
    const res = await fetch(`${window.location.origin}/index.html?_=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    })
    if (!res.ok) return null
    return readBuildShaFromHtml(await res.text())
  } catch {
    return null
  }
}

/**
 * @returns {Promise<{ updateAvailable: boolean, liveToken: string, remoteToken: string | null }>}
 */
export async function checkForAppUpdate() {
  const liveToken = readLiveBuildToken()
  const remoteToken = await fetchRemoteBuildToken()
  return {
    updateAvailable: Boolean(remoteToken && remoteToken !== liveToken),
    liveToken,
    remoteToken,
  }
}

/** @param {{ liveToken: string, remoteToken: string, source?: string, autoReloadMs?: number }} detail */
export function dispatchAppUpdateAvailable(detail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(APP_UPDATE_AVAILABLE_EVENT, { detail }))
}

export function cancelScheduledAppUpdateReload() {
  if (pendingReloadId == null) return
  window.clearTimeout(pendingReloadId)
  pendingReloadId = null
}

/** @param {number} [delayMs] */
export function scheduleSilentAppUpdateReload(delayMs = 0) {
  cancelScheduledAppUpdateReload()
  pendingReloadId = window.setTimeout(() => {
    pendingReloadId = null
    reloadForAppUpdate()
  }, Math.max(0, delayMs))
}

export function isAppUpdateDismissed(remoteToken) {
  if (!remoteToken) return false
  try {
    return sessionStorage.getItem(APP_UPDATE_DISMISS_KEY) === remoteToken
  } catch {
    return false
  }
}

export function dismissAppUpdateNotice(remoteToken) {
  if (!remoteToken) return
  cancelScheduledAppUpdateReload()
  try {
    sessionStorage.setItem(APP_UPDATE_DISMISS_KEY, remoteToken)
  } catch {
    /* ignore */
  }
}

export function reloadForAppUpdate() {
  cancelScheduledAppUpdateReload()
  clearStaleChunkReloadGuard()
  window.location.reload()
}

export function isStandalonePwa() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    window.navigator.standalone === true
  )
}

/**
 * Poll live deploy while the tab is open.
 * - Refocus: banner + silent reload after ~3s (cancelable via Not now).
 * - Interval (foreground): immediate silent reload (chunk safety if they never backgrounded).
 */
export function installDeployVersionWatch() {
  if (typeof window === 'undefined') return undefined

  const runCheck = async (source) => {
    if (document.visibilityState === 'hidden') return
    const result = await checkForAppUpdate()
    if (!result.updateAvailable || !result.remoteToken) return
    if (isAppUpdateDismissed(result.remoteToken)) return

    if (source === 'visibility') {
      dispatchAppUpdateAvailable({
        ...result,
        source,
        autoReloadMs: APP_UPDATE_VISIBILITY_RELOAD_MS,
      })
      scheduleSilentAppUpdateReload(APP_UPDATE_VISIBILITY_RELOAD_MS)
      return
    }

    scheduleSilentAppUpdateReload(0)
  }

  const intervalId = window.setInterval(() => void runCheck('interval'), DEPLOY_POLL_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void runCheck('visibility')
  })
  return () => {
    cancelScheduledAppUpdateReload()
    window.clearInterval(intervalId)
  }
}
