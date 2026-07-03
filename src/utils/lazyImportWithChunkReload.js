import { lazy } from 'react'
import { APP_BUILD_SHA } from './appBuildInfo.js'

/** Session flag: one hard reload per tab session when a lazy chunk 404s into index.html. */
export const STALE_CHUNK_RELOAD_KEY = 'lvsp_stale_chunk_reload'

const DEPLOY_POLL_MS = 5 * 60 * 1000
const BUILD_SHA_META = 'edge-build-sha'

/** @param {unknown} err */
export function isStaleChunkLoadError(err) {
  const msg = String(err?.message || err || '').toLowerCase()
  return (
    msg.includes('text/html') ||
    msg.includes('mime type') ||
    msg.includes('dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('failed to load module script') ||
    msg.includes('loading chunk') ||
    msg.includes('chunkloaderror')
  )
}

/**
 * Wrap dynamic import() so a stale deploy (missing hashed chunk → HTML fallback) triggers one reload.
 * Use for prefetch `void importRoute(...)` as well as lazy routes.
 * @param {() => Promise<unknown>} importFn
 * @param {string} [reloadKey]
 */
export function importRoute(importFn, reloadKey = STALE_CHUNK_RELOAD_KEY) {
  return importFn().catch((err) => {
    if (
      typeof sessionStorage !== 'undefined' &&
      isStaleChunkLoadError(err) &&
      !sessionStorage.getItem(reloadKey)
    ) {
      sessionStorage.setItem(reloadKey, '1')
      window.location.reload()
      return new Promise(() => {})
    }
    throw err
  })
}

/** @deprecated Prefer importRoute — kept as alias for existing call sites. */
export const lazyImportWithChunkReload = importRoute

/**
 * Canonical React.lazy wrapper for route/tab chunks. Always use this instead of raw lazy(() => import(...)).
 * @param {() => Promise<{ default: import('react').ComponentType<any> }>} importFn
 */
export function lazyRoute(importFn) {
  return lazy(() => importRoute(importFn))
}

/** Clear reload guard after a tab chunk loads successfully. */
export function clearStaleChunkReloadGuard(reloadKey = STALE_CHUNK_RELOAD_KEY) {
  try {
    sessionStorage.removeItem(reloadKey)
  } catch {
    /* ignore */
  }
}

function readBuildShaFromHtml(html) {
  if (!html) return null
  const meta = html.match(
    new RegExp(`<meta\\s+name=["']${BUILD_SHA_META}["']\\s+content=["']([^"']+)["']`, 'i'),
  )
  if (meta?.[1]) return meta[1].trim()
  const main = html.match(/\/assets\/main-[A-Za-z0-9_-]+\.js/)
  return main ? main[0] : null
}

function readLiveBuildToken() {
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

/** Install once at app boot — catches any dynamic import failure (nested lazy, prefetch, etc.). */
export function installStaleChunkReloadListener(reloadKey = STALE_CHUNK_RELOAD_KEY) {
  if (typeof window === 'undefined') return

  const maybeReload = (reason) => {
    if (!isStaleChunkLoadError(reason)) return
    try {
      if (sessionStorage.getItem(reloadKey)) return
      sessionStorage.setItem(reloadKey, '1')
      window.location.reload()
    } catch {
      /* ignore */
    }
  }

  window.addEventListener('vite:preloadError', (event) => {
    maybeReload(event?.payload)
    event.preventDefault()
  })

  window.addEventListener('unhandledrejection', (event) => {
    maybeReload(event.reason)
  })
}

/**
 * Poll live index.html while the tab is open. Reload before the user hits a missing lazy chunk
 * after a Vercel deploy (proactive layer on top of importRoute / global listeners).
 */
export function installDeployVersionWatch() {
  if (typeof window === 'undefined') return undefined

  const liveToken = readLiveBuildToken()

  const check = async () => {
    if (document.visibilityState === 'hidden') return
    try {
      const res = await fetch(`${window.location.origin}/index.html?_=${Date.now()}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      })
      if (!res.ok) return
      const remoteToken = readBuildShaFromHtml(await res.text())
      if (!remoteToken || remoteToken === liveToken) return
      window.location.reload()
    } catch {
      /* offline / transient — ignore */
    }
  }

  const intervalId = window.setInterval(() => void check(), DEPLOY_POLL_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check()
  })
  return () => window.clearInterval(intervalId)
}
