import { useEffect, useState, useSyncExternalStore } from 'react'
import { isEdgeiOSShell } from './edgeNative.js'
import { isIosDevice } from './pwaNotificationPrompt.js'

function needsWebkitImageResumeRepair() {
  if (typeof navigator === 'undefined') return false
  if (isEdgeiOSShell()) return true
  if (isIosDevice()) return true
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1
}

let resumeGen = 0
const resumeListeners = new Set()

export function getWebkitImageResumeGen() {
  return resumeGen
}

export function subscribeWebkitImageResume(cb) {
  resumeListeners.add(cb)
  return () => resumeListeners.delete(cb)
}

function emitWebkitImageResume() {
  resumeGen += 1
  resumeListeners.forEach((cb) => {
    try {
      cb()
    } catch {
      /* listener threw */
    }
  })
}

async function objectUrlFromCachedSrc(src) {
  let abs
  try {
    abs = new URL(src, window.location.href)
  } catch {
    return null
  }
  if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return null
  const same = abs.origin === window.location.origin
  const res = await fetch(abs.href, {
    cache: 'force-cache',
    credentials: same ? 'same-origin' : 'omit',
    mode: same ? 'same-origin' : 'cors',
  })
  if (!res.ok) return null
  const blob = await res.blob()
  if (!blob || !blob.size) return null
  return URL.createObjectURL(blob)
}

/**
 * React-owned src that remints a blob URL on WKWebView resume.
 * Mutating `img.src` from a global walker fights React (ticker pills re-render
 * and snap back to the dumped PNG cache … blue ? marks).
 */
export function useWebkitResumeSrc(src) {
  const path = String(src || '').trim()
  const gen = useSyncExternalStore(
    subscribeWebkitImageResume,
    getWebkitImageResumeGen,
    () => 0,
  )
  const [href, setHref] = useState(path)

  useEffect(() => {
    if (!path) {
      setHref('')
      return undefined
    }
    if (!needsWebkitImageResumeRepair() || gen === 0) {
      setHref(path)
      return undefined
    }
    let cancelled = false
    let created = ''
    void objectUrlFromCachedSrc(path).then((url) => {
      if (cancelled) {
        if (url) {
          try {
            URL.revokeObjectURL(url)
          } catch {
            /* ignore */
          }
        }
        return
      }
      created = url || ''
      setHref(url || path)
    })
    return () => {
      cancelled = true
      if (created) {
        try {
          URL.revokeObjectURL(created)
        } catch {
          /* ignore */
        }
      }
    }
  }, [path, gen])

  return href || path
}

/**
 * WKWebView dumps decoded bitmaps when the app backgrounds. Tell React surfaces
 * to remint blob URLs. Do **not** walk `document.images` and overwrite `src`
 * (1.4.993 cleared src; 1.4.997 wrote blobs that React then replaced).
 */
export function installWebkitImageResumeRepair() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (window.__edgeWebkitImageResumeRepairInstalled) return
  window.__edgeWebkitImageResumeRepairInstalled = true
  if (!needsWebkitImageResumeRepair()) return

  let debounceTimer = 0
  const onResume = () => {
    if (document.visibilityState === 'hidden') return
    window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => {
      if (document.visibilityState === 'hidden') return
      emitWebkitImageResume()
    }, 40)
  }
  const onVis = () => {
    if (document.visibilityState === 'visible') onResume()
  }

  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('pageshow', onResume)
  document.addEventListener('resume', onResume)
}
