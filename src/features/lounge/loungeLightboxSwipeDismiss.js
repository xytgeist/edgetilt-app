import { useCallback, useEffect, useRef, useState } from 'react'

const DISMISS_DRAG_PX = 72
const TAP_SLOP_PX = 12

function shouldIgnoreSwipeTarget(target, { allowSwipeOnVideo = false } = {}) {
  if (!(target instanceof Element)) return true
  const blockers = ['button', 'a', 'input', 'textarea', 'select', '[data-lounge-lightbox-no-swipe]']
  if (!allowSwipeOnVideo) blockers.push('video')
  return Boolean(target.closest(blockers.join(', ')))
}

/**
 * Vertical swipe (or drag) to dismiss fullscreen Lounge media.
 * Optional horizontal swipe when `onSwipeHorizontal` is set (e.g. carousel in image lightbox).
 * @param {boolean} [allowSwipeOnVideo] - when true, swipes starting on `<video>` count (fullscreen video lightbox).
 */
export function useLoungeLightboxSwipeDismiss({
  onClose,
  onSwipeHorizontal,
  /** Fired on pointer up when movement stayed within tap slop (e.g. play/pause on hero video). */
  onTap,
  className = '',
  allowSwipeOnVideo = false,
  /** When false, pointer handlers no-op (e.g. image lightbox while pinch-zoomed). */
  enabled = true,
}) {
  const dragRef = useRef(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)

  const resetDrag = useCallback(() => {
    dragRef.current = null
    setDragging(false)
    setOffset({ x: 0, y: 0 })
  }, [])

  useEffect(() => {
    if (!enabled) resetDrag()
  }, [enabled, resetDrag])

  const onPointerDown = useCallback((e) => {
    if (!enabled) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    if (shouldIgnoreSwipeTarget(e.target, { allowSwipeOnVideo })) return
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
    }
    setDragging(true)
    setOffset({ x: 0, y: 0 })
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [allowSwipeOnVideo, enabled])

  const onPointerMove = useCallback((e) => {
    if (!enabled) return
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (Math.abs(dy) >= Math.abs(dx)) {
      setOffset({ x: 0, y: dy })
    } else if (onSwipeHorizontal) {
      setOffset({ x: dx, y: 0 })
    } else {
      setOffset({ x: 0, y: dy })
    }
  }, [onSwipeHorizontal, enabled])

  const finishDrag = useCallback(
    (e) => {
      if (!enabled) return
      const drag = dragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY

      if (Math.abs(dy) >= Math.abs(dx) && Math.abs(dy) >= DISMISS_DRAG_PX) {
        onClose()
        resetDrag()
        return
      }
      resetDrag()
      if (onSwipeHorizontal && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) >= DISMISS_DRAG_PX) {
        onSwipeHorizontal(dx < 0 ? 1 : -1)
        return
      }
      if (onTap && Math.abs(dx) <= TAP_SLOP_PX && Math.abs(dy) <= TAP_SLOP_PX) {
        onTap(e)
      }
    },
    [onClose, onSwipeHorizontal, onTap, resetDrag, enabled],
  )

  const onPointerUp = useCallback(
    (e) => {
      finishDrag(e)
    },
    [finishDrag],
  )

  const onPointerCancel = useCallback(
    (e) => {
      if (dragRef.current?.pointerId === e.pointerId) resetDrag()
    },
    [resetDrag],
  )

  const dragStyle =
    dragging && (offset.x !== 0 || offset.y !== 0)
      ? {
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
          transition: 'none',
          opacity: 1 - Math.min(0.45, (Math.abs(offset.y) + Math.abs(offset.x) * 0.35) / 420),
        }
      : undefined

  /** Video lightbox: keep touch-action none so vertical dismiss is not eaten by pan-y. */
  const touchClass = dragging || allowSwipeOnVideo ? 'touch-none' : 'touch-pan-y'
  const mergedClass = [className, touchClass].filter(Boolean).join(' ')

  return {
    swipeSurfaceProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      style: dragStyle,
      className: mergedClass,
    },
  }
}
