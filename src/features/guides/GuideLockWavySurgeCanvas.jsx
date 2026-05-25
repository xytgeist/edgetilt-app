import { useEffect, useRef } from 'react'

const BAND_PRESETS = [
  { heightRatio: 0.3, speed: 42, phase: 0, palette: 'cyan', delay: 0 },
  { heightRatio: 0.34, speed: 36, phase: 2.4, palette: 'rgb', delay: 1.6 },
  { heightRatio: 0.26, speed: 48, phase: 4.1, palette: 'magenta', delay: 3.1 },
]

const PALETTES = {
  cyan: {
    core: [120, 255, 180],
    mid: [6, 206, 252],
    hi: [255, 255, 255],
  },
  rgb: {
    core: [255, 64, 96],
    mid: [6, 206, 252],
    hi: [255, 255, 255],
  },
  magenta: {
    core: [157, 0, 255],
    mid: [255, 64, 96],
    hi: [120, 255, 180],
  },
}

function createBands(height) {
  return BAND_PRESETS.map((preset) => ({
    ...preset,
    height: Math.max(48, height * preset.heightRatio),
    y: height + preset.delay * preset.speed * 0.35,
  }))
}

function waveOffset(y, time, phase) {
  return (
    Math.sin(y * 0.048 + time * 1.75 + phase) * 18 +
    Math.sin(y * 0.016 + time * 0.62 + phase * 1.3) * 32 +
    Math.sin(y * 0.092 + time * 2.4 + phase * 0.7) * 8
  )
}

function rowJitter(y, time, bandPhase) {
  return Math.sin(y * 0.31 + time * 14 + bandPhase * 3.7) * 6 + Math.sin(y * 0.83 + time * 23) * 3
}

function drawWavyBand(ctx, width, band, time, reducedMotion) {
  const bandTop = band.y
  const bandBottom = band.y + band.height
  const palette = PALETTES[band.palette]
  const rowStep = reducedMotion ? 3 : 2

  for (let y = Math.floor(bandTop); y < bandBottom; y += rowStep) {
    if (y < -4 || y > ctx.canvas.height + 4) continue

    const rel = (y - bandTop) / band.height
    if (rel < 0 || rel > 1) continue

    const envelope = Math.sin(Math.min(1, Math.max(0, rel)) * Math.PI)
    const waveX = waveOffset(y, time, band.phase)
    const jitter = reducedMotion ? 0 : rowJitter(y, time, band.phase)
    const xShift = waveX + jitter

    const scanBright = Math.floor(y / rowStep) % 3 === 0
    const coreAlpha = envelope * (scanBright ? 0.34 : 0.18)
    const hiAlpha = envelope * (scanBright ? 0.22 : 0.1)
    const fringeAlpha = envelope * 0.14

    const [cr, cg, cb] = palette.core
    const [mr, mg, mb] = palette.mid
    const mix = 0.45 + 0.55 * Math.sin(rel * Math.PI * 2 + time * 0.8 + band.phase)

    ctx.strokeStyle = `rgba(${Math.round(cr * mix + mr * (1 - mix))}, ${Math.round(cg * mix + mg * (1 - mix))}, ${Math.round(cb * mix + mb * (1 - mix))}, ${coreAlpha})`
    ctx.lineWidth = rowStep
    ctx.beginPath()
    ctx.moveTo(-24 + xShift, y)
    ctx.lineTo(width + 24 + xShift, y)
    ctx.stroke()

    if (scanBright) {
      const [hr, hg, hb] = palette.hi
      ctx.strokeStyle = `rgba(${hr}, ${hg}, ${hb}, ${hiAlpha})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(-24 + xShift, y)
      ctx.lineTo(width + 24 + xShift, y)
      ctx.stroke()
    }

    if (!reducedMotion && scanBright) {
      ctx.strokeStyle = `rgba(255, 64, 96, ${fringeAlpha})`
      ctx.beginPath()
      ctx.moveTo(-26 + xShift - 3, y)
      ctx.lineTo(width + 22 + xShift - 3, y)
      ctx.stroke()

      ctx.strokeStyle = `rgba(6, 206, 252, ${fringeAlpha})`
      ctx.beginPath()
      ctx.moveTo(-22 + xShift + 3, y)
      ctx.lineTo(width + 26 + xShift + 3, y)
      ctx.stroke()
    }
  }
}

function paintFrame(ctx, width, height, bands, time, reducedMotion) {
  ctx.clearRect(0, 0, width, height)

  for (const band of bands) {
    drawWavyBand(ctx, width, band, time, reducedMotion)
  }
}

export default function GuideLockWavySurgeCanvas({ className = '' }) {
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
    let dpr = 1
    let bands = []
    let rafId = 0
    let lastTs = 0
    let time = 0

    const resize = () => {
      const rect = root.getBoundingClientRect()
      width = Math.max(1, Math.round(rect.width))
      height = Math.max(1, Math.round(rect.height))
      dpr = Math.min(2, window.devicePixelRatio || 1)

      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      bands = createBands(height)
    }

    const tick = (ts) => {
      if (!lastTs) lastTs = ts
      const dt = Math.min(0.05, (ts - lastTs) / 1000)
      lastTs = ts

      if (!reducedMotion) {
        time += dt
        for (const band of bands) {
          band.y -= band.speed * dt
          if (band.y + band.height < -height * 0.08) {
            band.y = height + band.height * 0.15
          }
        }
      } else if (bands.length === 3) {
        bands[0].y = height * 0.52
        bands[1].y = height * 0.66
        bands[2].y = height * 0.78
      }

      paintFrame(ctx, width, height, bands, time, reducedMotion)
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
      <canvas ref={canvasRef} className="guide-lock-glitch__wavy-canvas h-full w-full" />
    </div>
  )
}
