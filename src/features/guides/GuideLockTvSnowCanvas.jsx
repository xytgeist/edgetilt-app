import { useEffect, useRef } from 'react'

function hashNoise(x, y, seed = 0) {
  const v = Math.sin(x * 12.9898 + y * 78.233 + seed * 43.758) * 43758.5453
  return v - Math.floor(v)
}

function pickSnowColor(t) {
  if (t < 0.1) return [255, 255, 255]
  if (t < 0.2) return [120, 255, 255]
  if (t < 0.32) return [255, 56, 96]
  if (t < 0.44) return [56, 255, 112]
  if (t < 0.56) return [48, 120, 255]
  if (t < 0.68) return [210, 64, 255]
  if (t < 0.8) return [255, 72, 180]
  if (t < 0.9) return [170, 170, 255]
  return [255, 255, 255]
}

function rowIntensity(y, height) {
  const t = y / height
  if (t < 0.08) return 0.18
  return Math.min(0.82, 0.18 + t * 0.72)
}

function paintTvSnow(imageData, width, height, frameSeed, reducedMotion) {
  const data = imageData.data

  for (let y = 0; y < height; y++) {
    const intensity = rowIntensity(y, height)
    const scanBand = 0.72 + 0.28 * Math.sin(y * 0.07 + frameSeed * 0.11)
    const rowSeed = hashNoise(0, y + frameSeed, 1.7)

    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const density = 0.32 + intensity * 0.58
      const grain = hashNoise(x * 0.12 + rowSeed * 6, y + frameSeed, 0.4)

      if (grain > density) {
        data[i + 3] = 0
        continue
      }

      const colorT = hashNoise(x * 0.37 + rowSeed * 4, y * 0.23 + frameSeed, 5.6)
      const [r, g, b] = pickSnowColor(colorT)
      const flicker = 0.5 + hashNoise(x, y + frameSeed, 7.2) * 0.5
      const bright = hashNoise(x * 1.9 + rowShift, y * 0.6 + frameSeed, 3.1)
      const alpha = intensity * scanBand * flicker * (bright > 0.78 ? 0.98 : 0.72)

      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = Math.round(Math.min(255, alpha * 255))
    }
  }
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

    let width = 0
    let height = 0
    let imageData = null
    let rafId = 0
    let lastTs = 0
    let frameSeed = 0

    const resize = () => {
      const rect = root.getBoundingClientRect()
      width = Math.max(1, Math.round(rect.width))
      height = Math.max(1, Math.round(rect.height))
      const dpr = Math.min(2, window.devicePixelRatio || 1)

      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      imageData = ctx.createImageData(width, height)
    }

    const tick = (ts) => {
      if (!lastTs) lastTs = ts
      const dt = Math.min(0.05, (ts - lastTs) / 1000)
      lastTs = ts

      if (!reducedMotion) {
        frameSeed += dt * 28
      }

      if (imageData) {
        paintTvSnow(imageData, width, height, frameSeed, reducedMotion)
        ctx.putImageData(imageData, 0, 0)
      }

      rafId = window.requestAnimationFrame(tick)
    }

    resize()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    observer?.observe(root)

    rafId = window.requestAnimationFrame(tick)

    return () => {
      observer?.disconnect()
      window.cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <div ref={rootRef} className={className} aria-hidden>
      <canvas ref={canvasRef} className="guide-lock-glitch__tv-snow-canvas h-full w-full" />
    </div>
  )
}
