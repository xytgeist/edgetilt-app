import { useCallback, useEffect, useState } from 'react'
import {
  APP_UPDATE_AVAILABLE_EVENT,
  dismissAppUpdateNotice,
  isStandalonePwa,
  reloadForAppUpdate,
} from '../utils/appDeployVersion.js'

/**
 * Top banner when a newer Vercel deploy is detected (usually on tab refocus after background).
 */
export default function AppUpdateAvailableBanner() {
  const [update, setUpdate] = useState(null)

  useEffect(() => {
    const onUpdate = (event) => {
      const detail = event?.detail
      if (!detail?.remoteToken) return
      setUpdate(detail)
    }
    window.addEventListener(APP_UPDATE_AVAILABLE_EVENT, onUpdate)
    return () => window.removeEventListener(APP_UPDATE_AVAILABLE_EVENT, onUpdate)
  }, [])

  const handleDismiss = useCallback(() => {
    if (update?.remoteToken) dismissAppUpdateNotice(update.remoteToken)
    setUpdate(null)
  }, [update?.remoteToken])

  const handleRefresh = useCallback(() => {
    reloadForAppUpdate()
  }, [])

  if (!update) return null

  const standalone = isStandalonePwa()
  const autoReloadMs = Number(update.autoReloadMs) || 0
  const body = standalone
    ? 'A new version of Edge is ready. Refresh now, or close the app completely and open it again.'
    : 'A new version of Edge is ready. Refresh to get the latest fixes.'
  const autoHint =
    autoReloadMs > 0
      ? `Refreshing automatically in about ${Math.round(autoReloadMs / 1000)} seconds…`
      : null

  return (
    <div
      role="status"
      aria-live="polite"
      data-app-update-banner
      className="pointer-events-none fixed inset-x-0 top-0 z-[94] flex justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))]"
    >
      <div className="pointer-events-auto w-[min(calc(100vw-1.5rem),28rem)] rounded-2xl border border-cyan-500/45 bg-zinc-950/95 px-3 py-2.5 shadow-[0_8px_28px_rgba(0,0,0,0.45)] backdrop-blur-md">
        <div className="text-cyan-100 text-[12px] font-semibold leading-snug">Update available</div>
        <div className="mt-1 text-zinc-300 text-[11px] leading-relaxed">{body}</div>
        {autoHint ? <div className="mt-1 text-zinc-500 text-[10px]">{autoHint}</div> : null}
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            className="min-h-9 flex-1 rounded-xl bg-gradient-to-r from-cyan-600 to-violet-600 px-3 text-white text-xs font-bold touch-manipulation hover:from-cyan-500 hover:to-violet-500"
          >
            Refresh now
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="min-h-9 rounded-xl border border-zinc-600 bg-zinc-900 px-3 text-zinc-300 text-xs font-semibold touch-manipulation hover:bg-zinc-800"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
