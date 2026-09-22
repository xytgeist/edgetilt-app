import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  getLoungePendingPostProgress,
  LOUNGE_CF_PROCESSING_PROGRESS_FLOOR,
  loungeCfStreamProcessingFailureTestEnabled,
  resolveLoungePendingPublishProgress,
  simulateLoungeCfStreamProcessingFailedForTest,
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

/** TEMP CF failure smoke button (see {@link loungeCfStreamProcessingFailureTestEnabled}). */
export const LOUNGE_CF_PROCESSING_FAIL_TEST_LABEL = 'Invoke failure for test'

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
    String(registryProgress?.phase || ''),
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

  const phase = String(registryProgress?.phase || '').trim()
  const isErrorPhase = phase === 'error'
  const pct = isErrorPhase ? 100 : Math.round(publishProgress * 100)
  const status =
    String(registryProgress?.status || '').trim() ||
    (publishProgress >= 0.9 ? 'Processing video…' : 'Preparing video…')
  const detail =
    phase === 'error' ? String(registryProgress?.detail || '').trim() : ''
  const cancelKey = String(pendingKey || '').trim()

  const onCancelClick = (e) => {
    e.stopPropagation()
    e.preventDefault()
    if (!cancelKey) return
    void cancelPendingPublish(cancelKey)
  }

  const showCfFailTestButton =
    loungeCfStreamProcessingFailureTestEnabled() &&
    phase === 'processing' &&
    publishProgress >= LOUNGE_CF_PROCESSING_PROGRESS_FLOOR

  const onCfFailTestClick = (e) => {
    e.stopPropagation()
    e.preventDefault()
    if (!cancelKey) return
    simulateLoungeCfStreamProcessingFailedForTest(cancelKey)
  }

  if (variant === 'chip') {
    return (
      <div
        className="pointer-events-none absolute right-2 top-2 z-[8] flex max-w-[70%] items-center gap-1.5 rounded-full bg-black/55 px-2 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm"
        aria-live="polite"
      >
        <span className="min-w-0 truncate">{isErrorPhase ? 'Upload failed' : status}</span>
        <span className="shrink-0 tabular-nums text-white/70">{pct}%</span>
      </div>
    )
  }

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[7]"
      aria-live="polite"
      role="status"
    >
      <div className="bg-gradient-to-t from-black/75 via-black/25 to-transparent px-2.5 pb-1.5 pt-7">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/95">
            {isErrorPhase ? 'Upload failed' : status}
          </p>
          <span className="shrink-0 tabular-nums text-[11px] font-semibold text-white/70">{pct}%</span>
          <button
            type="button"
            className="pointer-events-auto shrink-0 touch-manipulation text-[12px] font-semibold text-white/80 [-webkit-tap-highlight-color:transparent]"
            onClick={onCancelClick}
          >
            {LOUNGE_PENDING_PUBLISH_CANCEL_LABEL}
          </button>
        </div>
        {detail ? (
          <p className="mt-0.5 truncate text-[11px] leading-snug text-rose-200">{detail}</p>
        ) : null}
        {showCfFailTestButton ? (
          <button
            type="button"
            className="pointer-events-auto mt-1 touch-manipulation text-[10px] font-semibold text-rose-200"
            onClick={onCfFailTestClick}
          >
            {LOUNGE_CF_PROCESSING_FAIL_TEST_LABEL}
          </button>
        ) : null}
      </div>
      <div
        className="h-[2px] bg-white/20"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-cyan-400 transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
