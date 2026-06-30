import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const EXPORT = 512

/** Width/height of axis-aligned bounding box of a `w×h` rectangle rotated by `deg`. */
function rotatedExtents(w, h, deg) {
  const rad = (deg * Math.PI) / 180
  const c = Math.abs(Math.cos(rad))
  const s = Math.abs(Math.sin(rad))
  return { rw: w * c + h * s, rh: w * s + h * c }
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
}

/**
 * Full-screen modal: circular crop preview, pan, pinch/wheel zoom, 90° rotate, Apply → `File` (WebP).
 */
export default function ProfileAvatarCropModal({ open, file, onCancel, onApply }) {
  const canvasRef = useRef(null)
  const bitmapRef = useRef(null)
  const [rotationDeg, setRotationDeg] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [loadErr, setLoadErr] = useState('')
  const [applyBusy, setApplyBusy] = useState(false)
  /** Last distance between two touches; incremental pinch zoom. */
  const pinchRef = useRef(null)
  /** True while two fingers on surface - blocks pointer-drag pan so pinch does not fight pan. */
  const pinchLockRef = useRef(false)
  const paint = useCallback(() => {
    const canvas = canvasRef.current
    const bmp = bitmapRef.current
    if (!canvas || !bmp) return
    const iw = bmp.width
    const ih = bmp.height
    const s = EXPORT
    canvas.width = s
    canvas.height = s
    canvas.style.width = '288px'
    canvas.style.height = '288px'
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, s, s)
    ctx.fillStyle = '#09090b'
    ctx.fillRect(0, 0, s, s)

    const { rw, rh } = rotatedExtents(iw, ih, rotationDeg)
    const cover = Math.max(s / Math.max(rw, 1e-6), s / Math.max(rh, 1e-6))
    const scale = cover * zoom
    const rad = (rotationDeg * Math.PI) / 180

    ctx.save()
    ctx.beginPath()
    ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.translate(s / 2, s / 2)
    ctx.rotate(rad)
    ctx.scale(scale, scale)
    ctx.translate(pan.x, pan.y)
    ctx.drawImage(bmp, -iw / 2, -ih / 2)
    ctx.restore()

    // ring
    ctx.save()
    ctx.beginPath()
    ctx.arc(s / 2, s / 2, s / 2 - 1.5, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.restore()
  }, [rotationDeg, zoom, pan])

  useEffect(() => {
    if (!open || !file) {
      bitmapRef.current?.close?.()
      bitmapRef.current = null
      setLoadErr('')
      setRotationDeg(0)
      setZoom(1)
      setPan({ x: 0, y: 0 })
      pinchRef.current = null
      pinchLockRef.current = false
      return
    }
    let cancelled = false
    setLoadErr('')
    setRotationDeg(0)
    setZoom(1)
    setPan({ x: 0, y: 0 })
    ;(async () => {
      try {
        const b = await createImageBitmap(file)
        if (cancelled) {
          b.close?.()
          return
        }
        bitmapRef.current?.close?.()
        bitmapRef.current = b
        requestAnimationFrame(() => paint())
      } catch {
        if (!cancelled) setLoadErr('Could not load this image.')
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-load when dialog opens or file changes; paint() uses latest state from useCallback
  }, [open, file])

  useEffect(() => {
    if (!open || !bitmapRef.current) return
    requestAnimationFrame(() => paint())
  }, [open, paint, rotationDeg, zoom, pan])

  const pointerDragRef = useRef({ active: false, lastX: 0, lastY: 0 })

  const onPointerDown = (e) => {
    if (e.button !== 0) return
    if (pinchLockRef.current) return
    ;(e.currentTarget).setPointerCapture(e.pointerId)
    pointerDragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY }
  }

  const onPointerMove = (e) => {
    if (pinchLockRef.current) return
    if (!pointerDragRef.current.active) return
    const dx = e.clientX - pointerDragRef.current.lastX
    const dy = e.clientY - pointerDragRef.current.lastY
    pointerDragRef.current.lastX = e.clientX
    pointerDragRef.current.lastY = e.clientY
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scaleToExport = EXPORT / Math.max(rect.width, 1)
    setPan((p) => ({ x: p.x + dx * scaleToExport, y: p.y + dy * scaleToExport }))
  }

  const onPointerUp = (e) => {
    try {
      ;(e.currentTarget).releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    pointerDragRef.current.active = false
  }

  const onWheel = (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.94 : 1.06
    setZoom((z) => clamp(z * delta, 1, 4.5))
  }

  const onTouchStart = (e) => {
    if (e.touches.length >= 2) {
      const [a, b] = [e.touches[0], e.touches[1]]
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      pinchRef.current = { lastDist: Math.max(dist, 8) }
      pinchLockRef.current = true
      pointerDragRef.current.active = false
    }
  }

  const onTouchMove = (e) => {
    if (e.touches.length !== 2 || !pinchRef.current) return
    e.preventDefault()
    const [a, b] = [e.touches[0], e.touches[1]]
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    const last = pinchRef.current.lastDist
    const rawRatio = dist / Math.max(last, 8)
    // Dampen pinch so small finger jitter does not spike zoom (was: zoom = z0 * dist/d0 → jumpy).
    const ratio = Math.pow(rawRatio, 0.52)
    setZoom((z) => clamp(z * ratio, 1, 4.5))
    pinchRef.current = { lastDist: Math.max(dist, 8) }
  }

  const onTouchEnd = (e) => {
    if (e.touches.length < 2) {
      pinchRef.current = null
      pinchLockRef.current = false
    }
  }

  const handleApply = async () => {
    const canvas = canvasRef.current
    if (!canvas || applyBusy) return
    setApplyBusy(true)
    try {
      const blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/webp', 0.88)
      })
      if (!blob) {
        window.alert('Could not create image from crop.')
        return
      }
      const name = String(file?.name || 'avatar').replace(/\.[^.]+$/, '') || 'avatar'
      const out = new File([blob], `${name}-crop.webp`, { type: 'image/webp', lastModified: Date.now() })
      await onApply(out)
    } finally {
      setApplyBusy(false)
    }
  }

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex flex-col bg-black/88 backdrop-blur-[2px] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-crop-title"
    >
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-default touch-manipulation"
        aria-label="Dismiss"
        disabled={applyBusy}
        onClick={() => {
          if (applyBusy) return
          onCancel?.()
        }}
      />
      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col">
        <h2 id="avatar-crop-title" className="text-center text-[17px] font-bold text-white">
          Adjust photo
        </h2>

        <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-4">
          {loadErr ? (
            <p className="text-center text-[14px] text-rose-300">{loadErr}</p>
          ) : (
            <canvas
              ref={canvasRef}
              className="max-h-[min(72vmin,420px)] max-w-[min(92vw,420px)] touch-none rounded-full shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={onWheel}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              style={{ touchAction: 'none' }}
            />
          )}

          <div className="flex w-full max-w-sm flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              disabled={applyBusy || !!loadErr}
              onClick={() => setRotationDeg((d) => (d - 90 + 360) % 360)}
              className="min-h-10 min-w-[5.5rem] rounded-xl border border-zinc-600 bg-zinc-800/90 text-[14px] font-semibold text-zinc-100 touch-manipulation hover:bg-zinc-700 disabled:opacity-45"
            >
              ⟲ 90°
            </button>
            <button
              type="button"
              disabled={applyBusy || !!loadErr}
              onClick={() => setRotationDeg((d) => (d + 90) % 360)}
              className="min-h-10 min-w-[5.5rem] rounded-xl border border-zinc-600 bg-zinc-800/90 text-[14px] font-semibold text-zinc-100 touch-manipulation hover:bg-zinc-700 disabled:opacity-45"
            >
              90° ⟳
            </button>
            <button
              type="button"
              disabled={applyBusy || !!loadErr}
              onClick={() => {
                setZoom(1)
                setPan({ x: 0, y: 0 })
              }}
              className="min-h-10 min-w-[5.5rem] rounded-xl border border-zinc-600 bg-zinc-800/90 text-[14px] font-semibold text-zinc-100 touch-manipulation hover:bg-zinc-700 disabled:opacity-45"
            >
              Reset
            </button>
          </div>

          <div className="flex w-full max-w-sm items-center gap-3 px-1">
            <span className="shrink-0 text-[12px] text-zinc-500">Zoom</span>
            <input
              type="range"
              min={1}
              max={4.5}
              step={0.02}
              value={zoom}
              disabled={applyBusy || !!loadErr}
              onChange={(e) => setZoom(clamp(Number(e.target.value), 1, 4.5))}
              className="min-w-0 flex-1 accent-cyan-500 disabled:opacity-45"
              aria-label="Zoom"
            />
          </div>
        </div>

        <div className="mt-auto flex gap-3 pt-2">
          <button
            type="button"
            disabled={applyBusy}
            onClick={() => {
              if (applyBusy) return
              onCancel?.()
            }}
            className="min-h-12 flex-1 rounded-xl border border-zinc-600 bg-zinc-800/90 text-[15px] font-semibold text-zinc-100 touch-manipulation hover:bg-zinc-700 disabled:opacity-45"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={applyBusy || !!loadErr}
            onClick={() => void handleApply()}
            className="min-h-12 flex-1 rounded-xl border border-cyan-500/60 bg-cyan-600 text-[15px] font-semibold text-white touch-manipulation hover:bg-cyan-500 disabled:opacity-45"
          >
            {applyBusy ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
