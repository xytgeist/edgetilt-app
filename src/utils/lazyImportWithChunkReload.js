import { lazy } from 'react'

/** Session flag: one hard reload per tab session when a lazy chunk 404s into index.html. */
export const STALE_CHUNK_RELOAD_KEY = 'lvsp_stale_chunk_reload'

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
    msg.includes('chunkloaderror') ||
    // React.lazy after a mid-deploy stale chunk (Safari / Chrome wording)
    msg.includes('_result.default') ||
    msg.includes("reading 'default'") ||
    msg.includes('reading "default"') ||
    msg.includes('missing default export') ||
    msg.includes('element type is invalid')
  )
}

/**
 * One hard reload for a stale deploy. Returns true if reload was triggered.
 * @param {string} [reloadKey]
 */
export function reloadOnceForStaleChunk(reloadKey = STALE_CHUNK_RELOAD_KEY) {
  try {
    if (typeof sessionStorage === 'undefined') return false
    if (sessionStorage.getItem(reloadKey)) return false
    sessionStorage.setItem(reloadKey, '1')
    window.location.reload()
    return true
  } catch {
    return false
  }
}

/**
 * Wrap dynamic import() so a stale deploy (missing hashed chunk → HTML fallback) triggers one reload.
 * Use for prefetch `void importRoute(...)` as well as lazy routes.
 * @param {() => Promise<unknown>} importFn
 * @param {string} [reloadKey]
 */
export function importRoute(importFn, reloadKey = STALE_CHUNK_RELOAD_KEY) {
  return importFn()
    .then((mod) => {
      // React.lazy requires `{ default: Component }`. A missing default usually means the
      // browser got HTML (SPA fallback) or a mismatched chunk after deploy.
      if (mod == null || typeof /** @type {{ default?: unknown }} */ (mod).default === 'undefined') {
        throw new Error('Lazy route module missing default export')
      }
      return /** @type {{ default: import('react').ComponentType<any> }} */ (mod)
    })
    .catch((err) => {
      if (isStaleChunkLoadError(err) && reloadOnceForStaleChunk(reloadKey)) {
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

/** Install once at app boot — catches any dynamic import failure (nested lazy, prefetch, etc.). */
export function installStaleChunkReloadListener(reloadKey = STALE_CHUNK_RELOAD_KEY) {
  if (typeof window === 'undefined') return

  const maybeReload = (reason) => {
    if (!isStaleChunkLoadError(reason)) return
    if (reloadOnceForStaleChunk(reloadKey)) {
      // Prevent duplicate handlers from also treating this as fatal.
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
