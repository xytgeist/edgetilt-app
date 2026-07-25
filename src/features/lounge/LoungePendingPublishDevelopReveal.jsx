/** Max pixel block scale at 0% progress (1 = sharp, higher = chunkier). */
export const LOUNGE_PENDING_PUBLISH_MAX_PIXEL_SCALE = 48

/**
 * Remaining reveal effect at this progress (1 at 0% → 0 at 100%).
 * @param {number} progress 0..1
 */
export function loungePendingPublishRevealStrength(progress) {
  const p = Math.max(0, Math.min(1, Number(progress) || 0))
  return 1 - p
}

/** @param {number} progress 0..1 */
export function loungePendingPublishPixelBlockScale(progress) {
  const strength = loungePendingPublishRevealStrength(progress)
  if (strength <= 0.01) return 1
  return 1 + LOUNGE_PENDING_PUBLISH_MAX_PIXEL_SCALE * strength
}

/**
 * Super-pixelated duplicate over the sharp poster; block size shrinks 1:1 with progress.
 *
 * @param {object} props
 * @param {string} props.posterSrc
 * @param {number} props.progress 0..1
 * @param {string} [props.className]
 * @param {string} [props.imgClassName] Match the sharp poster layout classes when provided.
 */
export function LoungePendingPublishPixelLayer({
  posterSrc,
  progress,
  className = 'absolute inset-0 z-[3] pointer-events-none overflow-hidden',
  imgClassName = 'absolute inset-0 h-full w-full object-contain select-none',
}) {
  const strength = loungePendingPublishRevealStrength(progress)
  const blockScale = loungePendingPublishPixelBlockScale(progress)
  if (strength <= 0.01 || !posterSrc) return null

  const usePixelation = blockScale > 1.05
  const fadeOut = strength <= 0.08 ? strength / 0.08 : 1

  return (
    <div className={className} aria-hidden>
      <img
        src={posterSrc}
        alt=""
        decoding="async"
        draggable={false}
        className={imgClassName}
        style={
          usePixelation
            ? {
                imageRendering: 'pixelated',
                transform: `scale(${blockScale})`,
                transformOrigin: 'center center',
                width: `${100 / blockScale}%`,
                height: `${100 / blockScale}%`,
                left: `${(100 - 100 / blockScale) / 2}%`,
                top: `${(100 - 100 / blockScale) / 2}%`,
                position: 'absolute',
                opacity: fadeOut,
              }
            : { opacity: fadeOut }
        }
      />
    </div>
  )
}

/**
 * Sharp poster stays underneath; chunky pixel duplicate on top resolves to clear as progress rises.
 *
 * @param {object} props
 * @param {number} props.progress 0..1
 * @param {string} props.posterSrc
 * @param {string} [props.className]
 * @param {string} [props.imgClassName]
 */
export function LoungePendingPublishDevelopReveal({
  progress,
  posterSrc,
  className,
  imgClassName,
}) {
  const strength = loungePendingPublishRevealStrength(progress)
  if (strength <= 0.01 || !posterSrc) return null

  return (
    <LoungePendingPublishPixelLayer
      posterSrc={posterSrc}
      progress={progress}
      className={className}
      imgClassName={imgClassName}
    />
  )
}

/** @deprecated use {@link loungePendingPublishRevealStrength} */
export function loungePendingPublishFrostStrength(progress) {
  return loungePendingPublishRevealStrength(progress)
}

/** @deprecated use {@link LoungePendingPublishDevelopReveal} */
export function LoungePendingPublishFrostVeil({ progress, className }) {
  void progress
  void className
  return null
}

/** @deprecated pixel-only reveal; snow layer removed */
export function LoungePendingPublishSnowLayer({ progress, className }) {
  void progress
  void className
  return null
}
