import { useEffect, useRef } from 'react'
import {
  paintTvSnowFrame,
  TV_SNOW_FRAME_SEED_RATE,
  TV_SNOW_MIN_FRAME_MS,
} from '../../utils/tvSnowCanvasPaint.js'

export default function GuideLockTvSnowCanvas({ className = '' }) {
  const rootRef = useRef(null)
  const canvasRef = useRef(null)
  const grayishRef = useRef(
    typeof document !== 'undefined' && document.documentElement.classList.contains('light'),
  )

  useEffect(() => {
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
  }, [])

  return (
    <div ref={rootRef} className={className} aria-hidden>
      <canvas ref={canvasRef} className="guide-lock-glitch__tv-snow-canvas h-full w-full" />
    </div>
  )
}
