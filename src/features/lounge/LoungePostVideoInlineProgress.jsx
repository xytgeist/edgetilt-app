import { useSyncExternalStore } from 'react'
import {
  getLoungePendingPostProgress,
  subscribeLoungePendingPostProgress,
} from './loungePendingPostPublish.js'

/** Max CSS blur on the poster at 0% publish progress. */
export const LOUNGE_PENDING_PUBLISH_MAX_BLUR_PX = 28

export const LOUNGE_PENDING_PUBLISH_KEEP_OPEN_MSG =
  'Keep EdgeTilt open until processing finishes.'

/**
 * @param {number} progress 0..1
 * @returns {number} blur px for poster filter
 */
export function loungePendingPublishBlurPx(progress) {
  const p = Math.max(0, Math.min(1, Number(progress) || 0))
  return Math.round(LOUNGE_PENDING_PUBLISH_MAX_BLUR_PX * (1 - p))
}

/**
 * @param {number | null | undefined} progress
 * @param {boolean} [cfPlaybackReady]
 */
export function resolveLoungePendingPublishProgress(progress, cfPlaybackReady = false) {
  if (cfPlaybackReady) return 1
  if (typeof progress === 'number' && Number.isFinite(progress)) {
    return Math.max(0, Math.min(1, progress))
  }
  return 0
}

/** @param {string} pendingKey */
export function useLoungePendingPublishProgress(pendingKey) {
  const key = String(pendingKey || '').trim()
  return useSyncExternalStore(
    subscribeLoungePendingPostProgress,
    () => (key ? getLoungePendingPostProgress(key) : null),
    () => null,
  )
}

/**
 * Blur + progress copy overlay for author pending Stream publish.
 *
 * @param {object} props
 * @param {string} props.pendingKey
 * @param {'tile' | 'chip'} [props.variant]
 * @param {boolean} [props.cfPlaybackReady] When true, overlay hides (video revealed).
 * @param {number} [props.fallbackProgress] Used when registry is empty but tile is still pending.
 */
export default function LoungePostVideoInlineProgress({
  pendingKey,
  variant = 'tile',
  cfPlaybackReady = false,
  fallbackProgress = 0,
}) {
  const key = String(pendingKey || '').trim()
  const registryProgress = useLoungePendingPublishProgress(key)
  const rawProgress =
    registryProgress && typeof registryProgress.progress === 'number'
      ? registryProgress.progress
      : fallbackProgress
  const publishProgress = resolveLoungePendingPublishProgress(rawProgress, cfPlaybackReady)

  if (!key || publishProgress >= 1) return null

  const pct = Math.round(publishProgress * 100)
  const status =
    String(registryProgress?.status || '').trim() ||
    (publishProgress >= 0.9 ? 'Processing video…' : 'Preparing video…')
  const detail = String(registryProgress?.detail || '').trim()
  const scrimOpacity = 0.22 + 0.38 * (1 - publishProgress)

  if (variant === 'chip') {
    return (
      <div
        className="pointer-events-none absolute right-2 top-2 z-[8] flex items-center gap-1.5 rounded-full border border-cyan-500/40 bg-black/70 px-2 py-1 text-[10px] font-semibold text-cyan-100 backdrop-blur-sm"
        aria-live="polite"
      >
        <span
          className="inline-block h-3 w-3 rounded-full border-2 border-cyan-400/30 border-t-cyan-300 animate-spin"
          aria-hidden
        />
        <span className="max-w-[8rem] truncate">{status}</span>
        <span className="tabular-nums text-cyan-200/90">{pct}%</span>
      </div>
    )
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[7] flex flex-col items-center justify-center px-3 py-4 text-center"
      style={{ backgroundColor: `rgba(0,0,0,${scrimOpacity.toFixed(3)})` }}
      aria-live="polite"
      role="status"
    >
      <div className="flex w-full max-w-[14rem] flex-col items-center gap-1.5">
        <div className="text-[12px] font-semibold leading-snug text-zinc-50">{status}</div>
        {detail ? (
          <div className="max-w-full truncate text-[11px] leading-snug text-zinc-200/90">{detail}</div>
        ) : null}
        <div className="mt-0.5 w-full overflow-hidden rounded-full bg-zinc-800/90">
          <div
            className="h-1 rounded-full bg-cyan-500 transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        <div className="text-[13px] font-bold tabular-nums text-cyan-200/95">{pct}%</div>
        <p className="mt-1 max-w-[13rem] text-[10px] leading-snug text-amber-100/95">
          {LOUNGE_PENDING_PUBLISH_KEEP_OPEN_MSG}
        </p>
      </div>
    </div>
  )
}
