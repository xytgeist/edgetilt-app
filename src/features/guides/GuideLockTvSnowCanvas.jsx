import { useEffect, useRef } from 'react'

const GRID_X = 22
const GRID_Y = 18
const SHOW_THRESHOLD = 0.78
const SCAN_BAND_COUNT = 3
const MIN_FRAME_MS = 72

function hashNoise(x, y, seed = 0) {
  const v = Math.sin(x * 12.9898 + y * 78.233 + seed * 43.758) * 43758.5453
  return v - Math.floor(v)
}

function pickSnowColor(t, chromaBias) {
  const base = 198 + Math.floor(t * 42)

  if (chromaBias > 0.9) {
    return [base + 5, base - 1, base + 6]
  }
  if (chromaBias > 0.82) {
    return [base + 3, base + 1, base - 2]
  }
  return [base + 2, base + 3, base + 4]
}

function rowIntensity(y, height) {
  const t = y / height
  if (t < 0.08) return 0.38
  return Math.min(1, 0.38 + t * 0.52)
}

function fillBlock(data, width, height, x, y, blockW, blockH, r, g, b, a) {
  const x0 = Math.max(0, x)
  const y0 = Math.max(0, y)
  const xEnd = Math.min(width, x + blockW)
  const yEnd = Math.min(height, y + blockH)
  const alpha = Math.round(Math.min(255, a))

  for (let py = y0; py < yEnd; py++) {
    const row = py * width
    for (let px = x0; px < xEnd; px++) {
      const i = (row + px) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = alpha
    }
  }
}

function paintScanBands(data, width, height, frameSeed) {
  for (let i = 0; i < SCAN_BAND_COUNT; i++) {
    const drift = Math.sin(frameSeed * 0.45 + i * 1.9) * height * 0.06
    const bandY = Math.floor(height * (0.22 + i * 0.3) + drift)
    const thickness = 6 + Math.floor(hashNoise(i, frameSeed, 2.1) * 7)
    const grey = 208 + Math.floor(hashNoise(i, frameSeed, 3.4) * 32)
    const alpha = (0.16 + hashNoise(i, frameSeed, 4.2) * 0.1) * 255

    fillBlock(data, width, height, 0, bandY, width, thickness, grey, grey + 2, grey + 3, alpha)
  }
}

function paintSparseSnow(data, width, height, frameSeed) {
  for (let y = 0; y < height; y += GRID_Y) {
    const intensity = rowIntensity(y, height)
    const rowOffset = Math.floor(hashNoise(y, frameSeed, 0.6) * GRID_X)

    for (let x = rowOffset; x < width; x += GRID_X) {
      const show = hashNoise(x * 0.04, y + frameSeed, 7.1)
      if (show < SHOW_THRESHOLD) continue

      const flakeW = 7 + Math.floor(hashNoise(x, y, frameSeed + 8.2) * 10)
      const flakeH = 6 + Math.floor(hashNoise(x + 1, y, frameSeed + 9.1) * 11)
      const colorT = hashNoise(x * 0.15, y * 0.08 + frameSeed, 5.6)
      const chromaBias = hashNoise(x, y + frameSeed, 6.3)
      const [r, g, b] = pickSnowColor(colorT, chromaBias)
      const flicker = 0.55 + hashNoise(x, y + frameSeed, 7.2) * 0.35
      const alpha = intensity * flicker * (show > 0.92 ? 0.72 : 0.54)

      fillBlock(data, width, height, x, y, flakeW, flakeH, r, g, b, alpha * 255)
    }
  }
}

function paintTvSnow(imageData, width, height, frameSeed) {
  imageData.data.fill(0)
  paintScanBands(imageData.data, width, height, frameSeed)
  paintSparseSnow(imageData.data, width, height, frameSeed)
}

export default function GuideLockTvSnowCanvas({ className = '' }) {
  const rootRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return undefined

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
        frameSeed += dt * 18
      }

      const shouldPaint =
        visible &&
        imageData &&
        imageData.width > 0 &&
        imageData.height > 0 &&
        (reducedMotion || ts - lastPaintTs >= MIN_FRAME_MS)

      if (shouldPaint) {
        paintTvSnow(imageData, imageData.width, imageData.height, frameSeed)
        ctx.putImageData(imageData, 0, 0)
        lastPaintTs = ts
      }

      rafId = window.requestAnimationFrame(tick)
    }

    resize()

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    resizeObserver?.observe(root)

    const intersectionObserver =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              visible = entries.some((entry) => entry.isIntersecting)
            },
            { threshold: 0.05 },
          )
        : null
    intersectionObserver?.observe(root)

    rafId = window.requestAnimationFrame(tick)

    return () => {
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
