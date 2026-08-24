import { useCallback, useEffect, useState } from 'react'
import {
  APP_UPDATE_AVAILABLE_EVENT,
  dismissAppUpdateNotice,
  isStandalonePwa,
} from '../utils/appDeployVersion.js'

/**
 * Top banner when a newer Vercel deploy is detected (usually on tab refocus after background).
 * Soft reload does not reliably pick up the new build (especially PWA) ... tell people to fully close + reopen.
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

  if (!update) return null

  const standalone = isStandalonePwa()
  const body = standalone
    ? 'A new version of Edge is ready. Fully close the app (swipe it away), then open it again to load the latest features and improvements.'
    : 'A new version of Edge is ready. Fully close this tab, then open Edge again to load the latest features and improvements.'

  return (
    <div
      role="status"
      aria-live="polite"
      data-app-update-banner
      className="pointer-events-none fixed inset-x-0 top-0 z-[94] flex justify-center px-3 pt-[max(0.5rem,max(env(safe-area-inset-top, 0px), var(--edge-sat, 0px)))]"
    >
      <div className="pointer-events-auto w-[min(calc(100vw-1.5rem),28rem)] rounded-2xl border border-cyan-500/45 bg-zinc-950/95 px-3 py-2.5 shadow-[0_8px_28px_rgba(0,0,0,0.45)] backdrop-blur-md">
        <div className="text-cyan-100 text-[12px] font-semibold leading-snug">Update available</div>
        <div className="mt-1 text-zinc-300 text-[11px] leading-relaxed">{body}</div>
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={handleDismiss}
            className="min-h-9 flex-1 rounded-xl bg-gradient-to-r from-cyan-600 to-violet-600 px-3 text-white text-xs font-bold touch-manipulation hover:from-cyan-500 hover:to-violet-500"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
