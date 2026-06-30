import { useEffect, useRef } from 'react'

const MEDIUM_GRID_X = 18
const MEDIUM_GRID_Y = 15
const MEDIUM_SHOW = 0.74
const FINE_GRID_X = 7
const FINE_GRID_Y = 5
const FINE_SHOW = 0.36
const FLAT_GRID_X = 9
const FLAT_GRID_Y = 6
const FLAT_SHOW = 0.34
const MICRO_GRID_X = 6
const MICRO_GRID_Y = 4
const MICRO_SHOW = 0.3
const MIN_FRAME_MS = 96
const FRAME_SEED_RATE = 10

function hashNoise(x, y, seed = 0) {
  const v = Math.sin(x * 12.9898 + y * 78.233 + seed * 43.758) * 43758.5453
  return v - Math.floor(v)
}

function pickSnowColor(t, chromaBias, grayish = false) {
  if (grayish) {
    const base = 56 + Math.floor(t * 54)
    if (chromaBias > 0.88) return [base - 10, base + 5, base + 8]
    if (chromaBias > 0.76) return [base + 8, base - 6, base + 3]
    if (chromaBias > 0.64) return [base - 4, base + 7, base - 5]
    if (chromaBias > 0.52) return [base + 5, base + 2, base - 7]
    return [base + 1, base, base - 2]
  }

  const base = 192 + Math.floor(t * 48)

  if (chromaBias > 0.92) {
    return [base - 18, base + 14, base + 32]
  }
  if (chromaBias > 0.84) {
    return [base + 28, base - 12, base + 8]
  }
  if (chromaBias > 0.76) {
    return [base - 14, base + 22, base - 8]
  }
  if (chromaBias > 0.68) {
    return [base + 12, base - 6, base + 24]
  }
  if (chromaBias > 0.58) {
    return [base + 18, base + 8, base + 20]
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

function paintSnowLayer(
  data,
  width,
  height,
  frameSeed,
  { gridX, gridY, showThreshold, flakeWRange, flakeHRange, alphaScale, seedOffset, grayish = false },
) {
  for (let y = 0; y < height; y += gridY) {
    const intensity = rowIntensity(y, height)
    const rowOffset = Math.floor(hashNoise(y, frameSeed, seedOffset) * gridX)

    for (let x = rowOffset; x < width; x += gridX) {
      const show = hashNoise(x * 0.04, y + frameSeed, seedOffset + 7.1)
      if (show < showThreshold) continue

      const flakeW = flakeWRange[0] + Math.floor(hashNoise(x, y, frameSeed + seedOffset + 8.2) * flakeWRange[1])
      const flakeH = flakeHRange[0] + Math.floor(hashNoise(x + 1, y, frameSeed + seedOffset + 9.1) * flakeHRange[1])
      const colorT = hashNoise(x * 0.15, y * 0.08 + frameSeed, seedOffset + 5.6)
      const chromaBias = hashNoise(x, y + frameSeed, seedOffset + 6.3)
      const [r, g, b] = pickSnowColor(colorT, chromaBias, grayish)
      const flicker = 0.55 + hashNoise(x, y + frameSeed, seedOffset + 7.2) * 0.35
      const alpha = intensity * flicker * alphaScale * (show > 0.92 ? 1.08 : 1)

      fillBlock(data, width, height, x, y, flakeW, flakeH, r, g, b, alpha * 255)
    }
  }
}

function paintMediumSnow(data, width, height, frameSeed, grayish = false) {
  paintSnowLayer(data, width, height, frameSeed, {
    gridX: MEDIUM_GRID_X,
    gridY: MEDIUM_GRID_Y,
    showThreshold: MEDIUM_SHOW,
    flakeWRange: [3, 3],
    flakeHRange: [2, 3],
    alphaScale: grayish ? 0.62 : 0.5,
    seedOffset: 0.6,
    grayish,
  })
}

function paintFineSnow(data, width, height, frameSeed, grayish = false) {
  paintSnowLayer(data, width, height, frameSeed, {
    gridX: FINE_GRID_X,
    gridY: FINE_GRID_Y,
    showThreshold: FINE_SHOW,
    flakeWRange: [2, 1],
    flakeHRange: [2, 1],
    alphaScale: grayish ? 0.54 : 0.44,
    seedOffset: 14.8,
    grayish,
  })
}

function paintFlatSnow(data, width, height, frameSeed, grayish = false) {
  paintSnowLayer(data, width, height, frameSeed, {
    gridX: FLAT_GRID_X,
    gridY: FLAT_GRID_Y,
    showThreshold: FLAT_SHOW,
    flakeWRange: [2, 3],
    flakeHRange: [1, 0],
    alphaScale: grayish ? 0.52 : 0.42,
    seedOffset: 22.4,
    grayish,
  })
}

function paintMicroFlatSnow(data, width, height, frameSeed, grayish = false) {
  paintSnowLayer(data, width, height, frameSeed, {
    gridX: MICRO_GRID_X,
    gridY: MICRO_GRID_Y,
    showThreshold: MICRO_SHOW,
    flakeWRange: [2, 2],
    flakeHRange: [1, 0],
    alphaScale: grayish ? 0.46 : 0.36,
    seedOffset: 31.6,
    grayish,
  })
}

function paintTvSnow(imageData, width, height, frameSeed, grayish = false) {
  imageData.data.fill(0)
  paintMediumSnow(imageData.data, width, height, frameSeed, grayish)
  paintFineSnow(imageData.data, width, height, frameSeed, grayish)
  paintFlatSnow(imageData.data, width, height, frameSeed, grayish)
  paintMicroFlatSnow(imageData.data, width, height, frameSeed, grayish)
}

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
        frameSeed += dt * FRAME_SEED_RATE
      }

      const shouldPaint =
        visible &&
        imageData &&
        imageData.width > 0 &&
        imageData.height > 0 &&
        (reducedMotion || ts - lastPaintTs >= MIN_FRAME_MS)

      if (shouldPaint) {
        paintTvSnow(imageData, imageData.width, imageData.height, frameSeed, grayishRef.current)
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
