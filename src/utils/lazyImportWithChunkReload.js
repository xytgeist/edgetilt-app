import { lazy } from 'react'

/** Session flag: one hard reload per tab session when a lazy chunk 404s into index.html. */
export const STALE_CHUNK_RELOAD_KEY = 'lvsp_stale_chunk_reload'

/** @param {unknown} err */
function rejectionMessage(err) {
  if (err == null) return ''
  if (typeof err === 'string') return err
  return String(err.message || err)
}

/**
 * Safari / WebKit aborted a dynamic import on purpose (tab hide, remount, nav).
 * Not a stale deploy. Do not hard-reload the page … but DO retry the import.
 * Returning a never-settling promise left React.lazy on the black Suspense forever
 * (iPhone Chrome / Safari refresh after deploy).
 * @param {unknown} err
 */
export function isCanceledModuleImport(err) {
  const msg = rejectionMessage(err).toLowerCase()
  if (!msg) return false
  if (msg.includes('importing a module script') && msg.includes('cancel')) return true
  return (
    msg.includes('module script is canceled') ||
    msg.includes('module script was canceled') ||
    msg.includes('module script is cancelled') ||
    msg.includes('module script was cancelled')
  )
}

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
    // Safari / WebKit: failed dynamic import or fetch during boot (often "TypeError: Load failed")
    msg.includes('load failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror when attempting to fetch') ||
    msg.includes('network request failed') ||
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
 * @param {() => Promise<unknown>} importFn
 * @returns {Promise<{ default: import('react').ComponentType<any> }>}
 */
function loadLazyModule(importFn) {
  return importFn().then((mod) => {
    // React.lazy requires `{ default: Component }`. A missing default usually means the
    // browser got HTML (SPA fallback) or a mismatched chunk after deploy.
    if (mod == null || typeof /** @type {{ default?: unknown }} */ (mod).default === 'undefined') {
      throw new Error('Lazy route module missing default export')
    }
    return /** @type {{ default: import('react').ComponentType<any> }} */ (mod)
  })
}

/**
 * Wrap dynamic import() so a stale deploy (missing hashed chunk → HTML fallback) triggers one reload.
 * WebKit cancel on refresh → retry a few times instead of hanging Suspense on zinc-950.
 * Use for prefetch `void importRoute(...)` as well as lazy routes.
 * @param {() => Promise<unknown>} importFn
 * @param {string} [reloadKey]
 */
export function importRoute(importFn, reloadKey = STALE_CHUNK_RELOAD_KEY) {
  const MAX_CANCEL_ATTEMPTS = 3

  const attempt = (cancelAttempt) =>
    loadLazyModule(importFn).catch((err) => {
      if (isCanceledModuleImport(err) && cancelAttempt < MAX_CANCEL_ATTEMPTS) {
        const waitMs = 32 * (cancelAttempt + 1)
        return new Promise((resolve, reject) => {
          window.setTimeout(() => {
            attempt(cancelAttempt + 1).then(resolve, reject)
          }, waitMs)
        })
      }
      if (isStaleChunkLoadError(err) && reloadOnceForStaleChunk(reloadKey)) {
        return new Promise(() => {})
      }
      throw err
    })

  return attempt(0)
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

  /** @param {unknown} reason @returns {boolean} true when a reload was started */
  const maybeReload = (reason) => {
    if (!isStaleChunkLoadError(reason)) return false
    return reloadOnceForStaleChunk(reloadKey)
  }

  window.addEventListener('vite:preloadError', (event) => {
    maybeReload(event?.payload)
    event.preventDefault()
  })

  window.addEventListener('unhandledrejection', (event) => {
    if (isCanceledModuleImport(event.reason)) {
      event.preventDefault()
      return
    }
    if (!isStaleChunkLoadError(event.reason)) return
    // One hard reload for Safari "Load failed" / stale chunk. Swallow only when we
    // are recovering so the tab does not look like a crash mid-reload.
    if (maybeReload(event.reason)) {
      event.preventDefault()
    }
  })
}
