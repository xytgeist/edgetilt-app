import { useEffect } from 'react'
import { isStaleChunkLoadError, reloadOnceForStaleChunk } from '../utils/lazyImportWithChunkReload.js'

/** Root error boundary fallback: one reload for a stale deploy chunk, else the index.html boot rescue card. */
export default function BootCrashFallback({ error }) {
  useEffect(() => {
    if (isStaleChunkLoadError(error) && reloadOnceForStaleChunk()) return
    window.__edgeShowBootRescue?.(String(error?.message || error || 'App crashed'))
  }, [error])
  return null
}
