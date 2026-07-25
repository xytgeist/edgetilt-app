import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  getLoungePendingPostProgress,
  LOUNGE_CF_PROCESSING_PROGRESS_FLOOR,
  resolveLoungePendingPublishProgress,
  subscribeLoungePendingPostProgress,
} from './loungePendingPostPublish.js'
import { useLoungePendingPublishActions } from './LoungePendingPublishActionsContext.jsx'

/** Max frosted veil blur at 0% publish progress (dissipates to 0 by 100%). */
export const LOUNGE_PENDING_PUBLISH_MAX_BLUR_PX = 28

export const LOUNGE_PENDING_PUBLISH_KEEP_OPEN_MSG =
  'Keep EdgeTilt open until upload finishes.'

export const LOUNGE_PENDING_PUBLISH_CF_WAIT_MSG =
  'You can switch apps. EdgeTilt will check again when you return.'

export const LOUNGE_PENDING_PUBLISH_CANCEL_LABEL = 'Cancel'

export { resolveLoungePendingPublishProgress }

/**
 * Remaining frost at this progress (1 at 0% → 0 at 100%). Blur and veil opacity track this 1:1.
 * @param {number} progress 0..1
 */
export function loungePendingPublishFrostStrength(progress) {
  const p = Math.max(0, Math.min(1, Number(progress) || 0))
  return 1 - p
}

/** @param {number} progress 0..1 */
export function loungePendingPublishFrostBlurPx(progress) {
  return Math.round(LOUNGE_PENDING_PUBLISH_MAX_BLUR_PX * loungePendingPublishFrostStrength(progress))
}

/**
 * Frosted veil over a sharp poster — backdrop blur + tint dissipate with upload progress.
 * @param {number} progress 0..1
 * @returns {import('react').CSSProperties}
 */
export function loungePendingPublishFrostVeilStyle(progress) {
  const strength = loungePendingPublishFrostStrength(progress)
  if (strength <= 0.01) return { opacity: 0, pointerEvents: 'none' }
  const blurPx = loungePendingPublishFrostBlurPx(progress)
  return {
    opacity: strength,
    backdropFilter: `blur(${blurPx}px)`,
    WebkitBackdropFilter: `blur(${blurPx}px)`,
    backgroundColor: `rgba(9, 9, 11, ${(0.32 * strength).toFixed(3)})`,
    pointerEvents: 'none',
  }
}

/**
 * Sharp poster underneath; frosted veil on top — blur and opacity fall as progress rises.
 *
 * @param {object} props
 * @param {number} props.progress 0..1
 * @param {string} [props.className]
 */
export function LoungePendingPublishFrostVeil({ progress, className = 'absolute inset-0 z-[3]' }) {
  const strength = loungePendingPublishFrostStrength(progress)
  if (strength <= 0.01) return null
  return (
    <div
      className={`pointer-events-none ${className}`}
      aria-hidden
      style={loungePendingPublishFrostVeilStyle(progress)}
    />
  )
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

/** @deprecated use {@link loungePendingPublishFrostVeilStyle} */
export function loungePendingPublishPosterStyle(progress) {
  return loungePendingPublishFrostVeilStyle(progress)
}

/** @deprecated use {@link loungePendingPublishFrostStrength} */
export function loungePendingPublishBlurredRevealOpacity(progress) {
  return loungePendingPublishFrostStrength(progress)
}

/** @deprecated use {@link LoungePendingPublishFrostVeil} */
export function LoungePendingPublishBlurredRevealLayer({ progress, className }) {
  return <LoungePendingPublishFrostVeil progress={progress} className={className} />
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
    frostStrength: loungePendingPublishFrostStrength(publishProgress),
    frostBlurPx: loungePendingPublishFrostBlurPx(publishProgress),
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
  const scrimOpacity = 0.18 + 0.32 * (1 - publishProgress)
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
