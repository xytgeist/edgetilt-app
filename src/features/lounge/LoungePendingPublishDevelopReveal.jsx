import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

/** Max pixelation factor at 0% progress (1 = sharp, higher = chunkier blocks). */
export const LOUNGE_PENDING_PUBLISH_MAX_PIXEL_SCALE = 48

/**
 * Remaining reveal effect at this progress (1 at 0% → 0 at 100%).
 * @param {number} progress 0..1
 */
export function loungePendingPublishRevealStrength(progress) {
  const p = Math.max(0, Math.min(1, Number(progress) || 0))
  return 1 - p
}

/**
 * Integer pixelation factor tied 1:1 to upload progress (stable steps, no subpixel jitter).
 * @param {number} progress 0..1
 */
export function loungePendingPublishPixelFactor(progress) {
  const strength = loungePendingPublishRevealStrength(progress)
  if (strength <= 0.01) return 1
  return Math.max(1, Math.round(1 + LOUNGE_PENDING_PUBLISH_MAX_PIXEL_SCALE * strength))
}

/** @param {number} progress 0..1 */
export function loungePendingPublishPixelBlockScale(progress) {
  return loungePendingPublishPixelFactor(progress)
}

/** @param {number} containerW @param {number} containerH @param {number} imgW @param {number} imgH */
function loungePendingPublishObjectContainRect(containerW, containerH, imgW, imgH) {
  if (!containerW || !containerH || !imgW || !imgH) {
    return { x: 0, y: 0, w: 0, h: 0 }
  }
  const containerAspect = containerW / containerH
  const imgAspect = imgW / imgH
  if (imgAspect > containerAspect) {
    const w = containerW
    const h = containerW / imgAspect
    return { x: 0, y: (containerH - h) / 2, w, h }
  }
  const h = containerH
  const w = containerH * imgAspect
  return { x: (containerW - w) / 2, y: 0, w, h }
}

/**
 * Canvas downscale + crisp upscale — real pixel blocks, not CSS transform jitter.
 *
 * @param {object} props
 * @param {string} props.posterSrc
 * @param {number} props.pixelFactor
 * @param {number} props.opacity
 * @param {string} [props.className]
 */
function LoungePendingPublishPixelCanvas({ posterSrc, pixelFactor, opacity, className }) {
  const shellRef = useRef(null)
  const canvasRef = useRef(null)
  const imgRef = useRef(null)

  const paint = useCallback(() => {
    const shell = shellRef.current
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!shell || !canvas || !img?.naturalWidth || !img?.naturalHeight) return

    const { width: containerW, height: containerH } = shell.getBoundingClientRect()
    const fit = loungePendingPublishObjectContainRect(
      containerW,
      containerH,
      img.naturalWidth,
      img.naturalHeight,
    )
    if (fit.w < 1 || fit.h < 1) return

    const factor = Math.max(1, Math.round(pixelFactor))
    const pixelW = Math.max(1, Math.round(fit.w / factor))
    const pixelH = Math.max(1, Math.round(fit.h / factor))

    canvas.width = pixelW
    canvas.height = pixelH
    canvas.style.width = `${fit.w}px`
    canvas.style.height = `${fit.h}px`
    canvas.style.left = `${fit.x}px`
    canvas.style.top = `${fit.y}px`

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, pixelW, pixelH)
    ctx.drawImage(img, 0, 0, pixelW, pixelH)
  }, [pixelFactor])

  useLayoutEffect(() => {
    paint()
  }, [paint, posterSrc])

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return undefined
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => paint()) : null
    ro?.observe(shell)
    return () => ro?.disconnect()
  }, [paint])

  return (
    <div
      ref={shellRef}
      className={className}
      aria-hidden
      style={{ opacity }}
    >
      <img
        ref={imgRef}
        src={posterSrc}
        alt=""
        decoding="async"
        draggable={false}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        onLoad={paint}
      />
      <canvas
        ref={canvasRef}
        className="lounge-pending-publish-pixel-canvas pointer-events-none absolute select-none"
      />
    </div>
  )
}

/**
 * Super-pixelated duplicate over the sharp poster; block size shrinks 1:1 with progress.
 *
 * @param {object} props
 * @param {string} props.posterSrc
 * @param {number} props.progress 0..1
 * @param {string} [props.className]
 */
export function LoungePendingPublishPixelLayer({
  posterSrc,
  progress,
  className = 'absolute inset-0 z-[3] pointer-events-none overflow-hidden',
}) {
  const strength = loungePendingPublishRevealStrength(progress)
  const pixelFactor = loungePendingPublishPixelFactor(progress)
  if (strength <= 0.01 || !posterSrc || pixelFactor <= 1) return null

  const fadeOut = strength <= 0.08 ? strength / 0.08 : 1

  return (
    <LoungePendingPublishPixelCanvas
      posterSrc={posterSrc}
      pixelFactor={pixelFactor}
      opacity={fadeOut}
      className={className}
    />
  )
}

/**
 * Sharp poster stays underneath; chunky pixel duplicate on top resolves to clear as progress rises.
 *
 * @param {object} props
 * @param {number} props.progress 0..1
 * @param {string} props.posterSrc
 * @param {string} [props.className]
 */
export function LoungePendingPublishDevelopReveal({ progress, posterSrc, className }) {
  const strength = loungePendingPublishRevealStrength(progress)
  if (strength <= 0.01 || !posterSrc) return null

  return (
    <LoungePendingPublishPixelLayer
      posterSrc={posterSrc}
      progress={progress}
      className={className}
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
