import { useCallback, useEffect, useRef, useState } from 'react'

const MIN_SCALE = 1
const MAX_SCALE = 4
const SNAP_SCALE = 1.02

function pointerDistance(a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.hypot(dx, dy)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function clampPan(tx, ty, scale, containerEl, imageEl) {
  if (!containerEl || !imageEl || scale <= MIN_SCALE) return { x: 0, y: 0 }
  const cw = containerEl.clientWidth
  const ch = containerEl.clientHeight
  const iw = imageEl.clientWidth
  const ih = imageEl.clientHeight
  if (!cw || !ch || !iw || !ih) return { x: tx, y: ty }
  const maxX = Math.max(0, (iw * scale - cw) / 2)
  const maxY = Math.max(0, (ih * scale - ch) / 2)
  return { x: clamp(tx, -maxX, maxX), y: clamp(ty, -maxY, maxY) }
}

/**
 * Pinch-to-zoom + one-finger pan for {@link LoungeImageLightbox}.
 * At scale 1, single-finger gestures fall through so swipe-dismiss can handle them.
 */
export function useLoungeLightboxImageZoom({ containerRef, imageRef, resetKey }) {
  const pointersRef = useRef(new Map())
  const pinchRef = useRef(null)
  const panRef = useRef(null)
  const gestureRef = useRef({ scale: MIN_SCALE, x: 0, y: 0 })
  const [gesture, setGesture] = useState({ scale: MIN_SCALE, x: 0, y: 0 })
  const [pinching, setPinching] = useState(false)

  const isZoomed = gesture.scale > SNAP_SCALE

  const applyGesture = useCallback((next) => {
    const containerEl = containerRef.current
    const imageEl = imageRef.current
    const clamped = {
      scale: clamp(next.scale, MIN_SCALE, MAX_SCALE),
      ...clampPan(next.x, next.y, clamp(next.scale, MIN_SCALE, MAX_SCALE), containerEl, imageEl),
    }
    if (clamped.scale <= MIN_SCALE) {
      clamped.scale = MIN_SCALE
      clamped.x = 0
      clamped.y = 0
    }
    gestureRef.current = clamped
    setGesture(clamped)
    return clamped
  }, [containerRef, imageRef])

  const resetZoom = useCallback(() => {
    pinchRef.current = null
    panRef.current = null
    pointersRef.current.clear()
    setPinching(false)
    gestureRef.current = { scale: MIN_SCALE, x: 0, y: 0 }
    setGesture({ scale: MIN_SCALE, x: 0, y: 0 })
  }, [])

  useEffect(() => {
    resetZoom()
  }, [resetKey, resetZoom])

  const onPointerDown = useCallback(
    (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return false
      if (e.target instanceof Element && e.target.closest('[data-lounge-lightbox-no-swipe]')) return false

      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (pointersRef.current.size === 2) {
        const pts = [...pointersRef.current.values()]
        const startDist = pointerDistance(pts[0], pts[1])
        if (startDist < 8) return true
        const current = gestureRef.current
        pinchRef.current = {
          startDist,
          startScale: current.scale,
          startX: current.x,
          startY: current.y,
        }
        panRef.current = null
        setPinching(true)
        e.currentTarget.setPointerCapture(e.pointerId)
        return true
      }

      if (pointersRef.current.size === 1 && gestureRef.current.scale > SNAP_SCALE) {
        panRef.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          startTx: gestureRef.current.x,
          startTy: gestureRef.current.y,
        }
        e.currentTarget.setPointerCapture(e.pointerId)
        return true
      }

      return false
    },
    [],
  )

  const onPointerMove = useCallback(
    (e) => {
      if (pointersRef.current.has(e.pointerId)) {
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      }

      const pinch = pinchRef.current
      if (pinch && pointersRef.current.size >= 2) {
        const updated = [...pointersRef.current.values()]
        if (updated.length < 2) return
        const dist = pointerDistance(updated[0], updated[1])
        if (dist < 1) return
        const nextScale = pinch.startScale * (dist / pinch.startDist)
        applyGesture({ scale: nextScale, x: pinch.startX, y: pinch.startY })
        return
      }

      const pan = panRef.current
      if (!pan || pan.pointerId !== e.pointerId) return
      const dx = e.clientX - pan.startX
      const dy = e.clientY - pan.startY
      applyGesture({
        scale: gestureRef.current.scale,
        x: pan.startTx + dx,
        y: pan.startTy + dy,
      })
    },
    [applyGesture],
  )

  const finishPointer = useCallback(
    (e) => {
      pointersRef.current.delete(e.pointerId)
      if (panRef.current?.pointerId === e.pointerId) panRef.current = null

      if (pointersRef.current.size < 2) {
        pinchRef.current = null
        setPinching(false)
      }

      if (pointersRef.current.size === 0) {
        if (gestureRef.current.scale <= SNAP_SCALE) {
          applyGesture({ scale: MIN_SCALE, x: 0, y: 0 })
        } else {
          applyGesture(gestureRef.current)
        }
      }
    },
    [applyGesture],
  )

  // Swipe-dismiss capture retargets pointerup to the chrome shell, so this hook's
  // element listeners never see the end of a scale-1 finger. Stale pointers then
  // make the next one-finger drag look like a pinch (scale in/out).
  useEffect(() => {
    const onLost = (e) => {
      if (
        !pointersRef.current.has(e.pointerId) &&
        panRef.current?.pointerId !== e.pointerId &&
        !pinchRef.current
      ) {
        return
      }
      finishPointer(e)
    }
    window.addEventListener('pointerup', onLost)
    window.addEventListener('pointercancel', onLost)
    return () => {
      window.removeEventListener('pointerup', onLost)
      window.removeEventListener('pointercancel', onLost)
    }
  }, [finishPointer])

  const onPointerUp = useCallback(
    (e) => {
      const tracked = pointersRef.current.has(e.pointerId)
      const panning = panRef.current?.pointerId === e.pointerId
      const pinching = Boolean(pinchRef.current)
      if (!tracked && !panning && !pinching) return
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId)
        }
      } catch {
        // ignore
      }
      finishPointer(e)
    },
    [finishPointer],
  )

  const onPointerCancel = useCallback(
    (e) => {
      finishPointer(e)
    },
    [finishPointer],
  )

  const mediaTransformStyle =
    gesture.scale > MIN_SCALE || gesture.x !== 0 || gesture.y !== 0
      ? {
          transform: `translate3d(${gesture.x}px, ${gesture.y}px, 0) scale(${gesture.scale})`,
          transition: pinching ? 'none' : 'transform 0.18s ease-out',
          willChange: pinching ? 'transform' : undefined,
        }
      : undefined

  return {
    isZoomed,
    isPinching: pinching,
    resetZoom,
    zoomPointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
    mediaTransformStyle,
  }
}
