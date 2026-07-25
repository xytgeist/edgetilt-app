import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  getLoungePendingPostProgress,
  LOUNGE_CF_PROCESSING_PROGRESS_FLOOR,
  resolveLoungePendingPublishProgress,
  subscribeLoungePendingPostProgress,
} from './loungePendingPostPublish.js'
import { useLoungePendingPublishActions } from './LoungePendingPublishActionsContext.jsx'
import {
  LOUNGE_PENDING_PUBLISH_MAX_PIXEL_SCALE,
  loungePendingPublishRevealStrength,
  loungePendingPublishPixelFactor,
  loungePendingPublishPixelBlockScale,
  LoungePendingPublishDevelopReveal,
  LoungePendingPublishPixelLayer,
  loungePendingPublishFrostStrength,
  LoungePendingPublishFrostVeil,
  LoungePendingPublishSnowLayer,
} from './LoungePendingPublishDevelopReveal.jsx'

/** @deprecated pixel reveal uses {@link LOUNGE_PENDING_PUBLISH_MAX_PIXEL_SCALE} instead */
export const LOUNGE_PENDING_PUBLISH_MAX_BLUR_PX = 28

export {
  LOUNGE_PENDING_PUBLISH_MAX_PIXEL_SCALE,
  loungePendingPublishRevealStrength,
  loungePendingPublishPixelFactor,
  loungePendingPublishPixelBlockScale,
  LoungePendingPublishDevelopReveal,
  LoungePendingPublishPixelLayer,
  loungePendingPublishFrostStrength,
  LoungePendingPublishFrostVeil,
  LoungePendingPublishSnowLayer,
}

export const LOUNGE_PENDING_PUBLISH_KEEP_OPEN_MSG =
  'Keep EdgeTilt open until upload finishes.'

export const LOUNGE_PENDING_PUBLISH_CF_WAIT_MSG =
  'You can switch apps. EdgeTilt will check again when you return.'

export const LOUNGE_PENDING_PUBLISH_CANCEL_LABEL = 'Cancel'

export { resolveLoungePendingPublishProgress }

/** @param {number} progress 0..1 */
export function loungePendingPublishFrostBlurPx(progress) {
  return Math.round(LOUNGE_PENDING_PUBLISH_MAX_BLUR_PX * loungePendingPublishRevealStrength(progress))
}

/** @deprecated */
export function loungePendingPublishFrostVeilStyle(progress) {
  void progress
  return { opacity: 0, pointerEvents: 'none' }
}

/** @deprecated use {@link loungePendingPublishFrostBlurPx} */
export function loungePendingPublishBlurPx(progress) {
  return loungePendingPublishFrostBlurPx(progress)
}

/** @deprecated sharp base poster stays at full opacity */
export function loungePendingPublishPosterOpacity(progress) {
  void progress
  return 1
}

/** @deprecated */
export function loungePendingPublishPosterStyle(progress) {
  return loungePendingPublishFrostVeilStyle(progress)
}

/** @deprecated use {@link loungePendingPublishRevealStrength} */
export function loungePendingPublishBlurredRevealOpacity(progress) {
  return loungePendingPublishRevealStrength(progress)
}

/** @deprecated use {@link LoungePendingPublishDevelopReveal} */
export function LoungePendingPublishBlurredRevealLayer({ progress, className, posterSrc }) {
  return (
    <LoungePendingPublishDevelopReveal progress={progress} posterSrc={posterSrc} className={className} />
  )
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
 * Resolved publish progress + poster overlay visuals (includes CF wait creep tick).
 *
 * @param {string} pendingKey
 * @param {{ cfPlaybackReady?: boolean, fallbackProgress?: number }} [opts]
 */
export function useLoungePendingPublishDisplay(pendingKey, opts = {}) {
  const key = String(pendingKey || '').trim()
  const cfPlaybackReady = opts.cfPlaybackReady === true
  const fallbackProgress = Number(opts.fallbackProgress) || 0
  const registryProgress = useLoungePendingPublishProgress(key)
  const rawProgress =
    registryProgress && typeof registryProgress.progress === 'number'
      ? registryProgress.progress
      : fallbackProgress
  const processingStartedAt =
    typeof registryProgress?.processingStartedAt === 'number'
      ? registryProgress.processingStartedAt
      : null
  const inCfWait =
    Boolean(key) &&
    !cfPlaybackReady &&
    rawProgress >= LOUNGE_CF_PROCESSING_PROGRESS_FLOOR &&
    rawProgress < 1

  const [, setTick] = useState(0)
  useEffect(() => {
    if (!inCfWait) return undefined
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [inCfWait])

  const publishProgress = resolveLoungePendingPublishProgress(
    rawProgress,
    cfPlaybackReady,
    processingStartedAt,
  )

  return {
    registryProgress,
    publishProgress,
    revealStrength: loungePendingPublishRevealStrength(publishProgress),
    pixelBlockScale: loungePendingPublishPixelBlockScale(publishProgress),
    showOverlay: Boolean(key) && publishProgress < 1,
  }
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
  const { cancelPendingPublish } = useLoungePendingPublishActions()
  const { registryProgress, publishProgress, showOverlay } = useLoungePendingPublishDisplay(
    pendingKey,
    { cfPlaybackReady, fallbackProgress },
  )

  if (!showOverlay) return null

  const pct = Math.round(publishProgress * 100)
  const status =
    String(registryProgress?.status || '').trim() ||
    (publishProgress >= 0.9 ? 'Processing video…' : 'Preparing video…')
  const phase = String(registryProgress?.phase || '').trim()
  const detail =
    phase === 'error' ? String(registryProgress?.detail || '').trim() : ''
  const footnote =
    phase === 'error'
      ? ''
      : phase === 'processing' || publishProgress >= LOUNGE_CF_PROCESSING_PROGRESS_FLOOR
        ? LOUNGE_PENDING_PUBLISH_CF_WAIT_MSG
        : LOUNGE_PENDING_PUBLISH_KEEP_OPEN_MSG
  const scrimOpacity = 0.1 + 0.2 * (1 - publishProgress)
  const cancelKey = String(pendingKey || '').trim()

  const onCancelClick = (e) => {
    e.stopPropagation()
    e.preventDefault()
    if (!cancelKey) return
    void cancelPendingPublish(cancelKey)
  }

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
            className="h-1 rounded-full bg-cyan-500 transition-[width] duration-700 ease-out"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        <div className="text-[13px] font-bold tabular-nums text-cyan-200/95">{pct}%</div>
        {footnote ? (
          <p className="mt-1 max-w-[13rem] text-[10px] leading-snug text-amber-100/95">{footnote}</p>
        ) : null}
        <button
          type="button"
          className="pointer-events-auto mt-2 touch-manipulation rounded-lg border border-zinc-500/70 bg-black/50 px-3 py-1.5 text-[11px] font-semibold text-zinc-100 hover:border-zinc-400 hover:bg-black/70"
          onClick={onCancelClick}
        >
          {LOUNGE_PENDING_PUBLISH_CANCEL_LABEL}
        </button>
      </div>
    </div>
  )
}
