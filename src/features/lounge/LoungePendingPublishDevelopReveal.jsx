import { useEffect, useRef } from 'react'
import {
  paintTvSnowFrame,
  TV_SNOW_FRAME_SEED_RATE,
  TV_SNOW_MIN_FRAME_MS,
} from '../../utils/tvSnowCanvasPaint.js'

/** Max pixel block scale at 0% progress (1 = sharp, higher = chunkier). */
export const LOUNGE_PENDING_PUBLISH_MAX_PIXEL_SCALE = 22

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
  return Math.max(1, Math.round(1 + LOUNGE_PENDING_PUBLISH_MAX_PIXEL_SCALE * strength))
}

/**
 * Chunky pixel duplicate over the sharp poster; block size shrinks 1:1 with progress.
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

  const usePixelation = blockScale > 1
  const pixelOpacity = Math.min(1, 0.35 + strength * 0.65)

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
                opacity: pixelOpacity,
              }
            : { opacity: strength }
        }
      />
    </div>
  )
}

/**
 * Animated TV snow / static overlay; opacity tied 1:1 to remaining reveal strength.
 *
 * @param {object} props
 * @param {number} props.progress 0..1
 * @param {string} [props.className]
 */
export function LoungePendingPublishSnowLayer({
  progress,
  className = 'absolute inset-0 z-[4] pointer-events-none overflow-hidden lounge-pending-publish-snow',
}) {
  const strength = loungePendingPublishRevealStrength(progress)
  const rootRef = useRef(null)
  const canvasRef = useRef(null)
  const grayishRef = useRef(
    typeof document !== 'undefined' && document.documentElement.classList.contains('light'),
  )

  useEffect(() => {
    if (strength <= 0.01) return undefined
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return undefined

    const syncGrayishSnow = () => {
      grayishRef.current = document.documentElement.classList.contains('light')
    }
    syncGrayishSnow()

    const themeObserver = new MutationObserver(syncGrayishSnow)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return undefined

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true

    let imageData = null
    let rafId = 0
    let lastTs = 0
    let lastPaintTs = 0
    let frameSeed = 0
    let visible = true

    const resize = () => {
      const rect = root.getBoundingClientRect()
      const width = Math.max(1, Math.round(rect.width))
      const height = Math.max(1, Math.round(rect.height))
      const dpr = Math.min(1.25, window.devicePixelRatio || 1)
      const pixelWidth = Math.round(width * dpr)
      const pixelHeight = Math.round(height * dpr)

      canvas.width = pixelWidth
      canvas.height = pixelHeight
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      imageData = ctx.createImageData(pixelWidth, pixelHeight)
    }

    const tick = (ts) => {
      if (!lastTs) lastTs = ts
      const dt = Math.min(0.05, (ts - lastTs) / 1000)
      lastTs = ts

      if (!reducedMotion) {
        frameSeed += dt * TV_SNOW_FRAME_SEED_RATE
      }

      const shouldPaint =
        visible &&
        imageData &&
        imageData.width > 0 &&
        imageData.height > 0 &&
        (reducedMotion || ts - lastPaintTs >= TV_SNOW_MIN_FRAME_MS)

      if (shouldPaint) {
        paintTvSnowFrame(imageData, frameSeed, grayishRef.current)
        ctx.putImageData(imageData, 0, 0)
        lastPaintTs = ts
      }

      if (visible) {
        rafId = window.requestAnimationFrame(tick)
      } else {
        rafId = 0
        lastTs = 0
      }
    }

    resize()

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    resizeObserver?.observe(root)

    const scheduleTick = () => {
      if (rafId) return
      rafId = window.requestAnimationFrame(tick)
    }

    const intersectionObserver =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              const nextVisible = entries.some((entry) => entry.isIntersecting)
              if (nextVisible === visible) return
              visible = nextVisible
              if (visible) scheduleTick()
            },
            { threshold: 0.05 },
          )
        : null
    intersectionObserver?.observe(root)

    scheduleTick()

    return () => {
      themeObserver.disconnect()
      resizeObserver?.disconnect()
      intersectionObserver?.disconnect()
      window.cancelAnimationFrame(rafId)
    }
  }, [strength])

  if (strength <= 0.01) return null

  const snowOpacity = Math.min(0.96, 0.22 + strength * 0.74)

  return (
    <div
      ref={rootRef}
      className={className}
      aria-hidden
      style={{ opacity: snowOpacity }}
    >
      <canvas ref={canvasRef} className="lounge-pending-publish-snow__canvas h-full w-full" />
    </div>
  )
}

/**
 * Sharp poster stays underneath; pixel mosaic + TV snow on top dissipate with upload progress.
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
    <>
      <LoungePendingPublishPixelLayer
        posterSrc={posterSrc}
        progress={progress}
        className={className}
        imgClassName={imgClassName}
      />
      <LoungePendingPublishSnowLayer progress={progress} />
    </>
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
