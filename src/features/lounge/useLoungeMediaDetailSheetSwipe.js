import { useCallback, useEffect, useRef } from 'react'

const DISMISS_PX = 88
const DISMISS_VELOCITY = 0.55
const AXIS_LOCK_PX = 8
const SNAP_MS = 220

function isSwipeBlockedTarget(target) {
  if (!(target instanceof Element)) return true
  if (target.closest('[data-lounge-media-detail-grab], [data-lounge-media-detail-grab-hit]')) return false
  if (target.closest('[data-lounge-detail-comment-host]')) return true
  if (target.closest('textarea, input, select, [contenteditable="true"]')) return true
  return false
}

function clearSheetDragVisual(el) {
  if (!(el instanceof HTMLElement)) return
  el.style.transition = ''
  el.style.transform = ''
  el.style.willChange = ''
}

/**
 * Swipe down to dismiss the lightbox comments sheet (grab, or list at top).
 * Does not touch the Stream `<video>` node.
 */
export function useLoungeMediaDetailSheetSwipe({ enabled, onDismiss, scrollRef }) {
  const dragRef = useRef(null)
  const onDismissRef = useRef(onDismiss)

  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  const reset = useCallback((el, animate) => {
    dragRef.current = null
    if (!(el instanceof HTMLElement)) return
    if (!animate) {
      clearSheetDragVisual(el)
      return
    }
    el.style.willChange = 'transform'
    el.style.transition = `transform ${SNAP_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`
    el.style.transform = 'translate3d(0, 0, 0)'
    window.setTimeout(() => clearSheetDragVisual(el), SNAP_MS + 20)
  }, [])

  useEffect(() => {
    if (!enabled) {
      const el = document.querySelector('[data-lounge-media-detail-sheet]')
      if (el instanceof HTMLElement) clearSheetDragVisual(el)
      dragRef.current = null
    }
  }, [enabled])

  const onPointerDown = useCallback(
    (e) => {
      if (!enabled || e.button != null && e.button !== 0) return
      const sheet = e.currentTarget
      if (!(sheet instanceof HTMLElement)) return
      const target = e.target
      if (isSwipeBlockedTarget(target)) return
      const onGrab = Boolean(
        target instanceof Element &&
          target.closest('[data-lounge-media-detail-grab], [data-lounge-media-detail-grab-hit]'),
      )
      const scrollEl = scrollRef?.current
      const atTop = !scrollEl || scrollEl.scrollTop <= 1
      if (!onGrab && !atTop) return
      dragRef.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startX: e.clientX,
        lastY: e.clientY,
        lastT: e.timeStamp || Date.now(),
        onGrab,
        engaged: onGrab,
        el: sheet,
      }
      if (onGrab) {
        try {
          sheet.setPointerCapture(e.pointerId)
        } catch {
          // ignore
        }
      }
    },
    [enabled, scrollRef],
  )

  const onPointerMove = useCallback((e) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const dy = e.clientY - d.startY
    const dx = e.clientX - d.startX
    if (!d.engaged) {
      if (Math.abs(dx) > AXIS_LOCK_PX && Math.abs(dx) > Math.abs(dy)) {
        dragRef.current = null
        return
      }
      const scrollEl = scrollRef?.current
      if (scrollEl && scrollEl.scrollTop > 1) {
        dragRef.current = null
        return
      }
      if (dy < AXIS_LOCK_PX) return
      d.engaged = true
      try {
        d.el.setPointerCapture(e.pointerId)
      } catch {
        // ignore
      }
    }
    if (e.cancelable) e.preventDefault()
    const y = Math.max(0, dy)
    d.lastY = e.clientY
    d.lastT = e.timeStamp || Date.now()
    d.el.style.willChange = 'transform'
    d.el.style.transition = 'none'
    d.el.style.transform = `translate3d(0, ${y}px, 0)`
  }, [scrollRef])

  const onPointerUp = useCallback((e) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const el = d.el
    const dy = Math.max(0, e.clientY - d.startY)
    const dt = Math.max(1, (e.timeStamp || Date.now()) - d.lastT)
    const vy = (e.clientY - d.lastY) / dt
    dragRef.current = null
    try {
      el.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    if (!d.engaged) {
      clearSheetDragVisual(el)
      return
    }
    if (dy >= DISMISS_PX || vy >= DISMISS_VELOCITY) {
      el.style.willChange = 'transform'
      el.style.transition = `transform ${SNAP_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`
      el.style.transform = 'translate3d(0, 100%, 0)'
      onDismissRef.current?.()
      return
    }
    reset(el, true)
  }, [reset])

  return {
    sheetSwipeProps: enabled
      ? {
          onPointerDown,
          onPointerMove,
          onPointerUp,
          onPointerCancel: onPointerUp,
        }
      : {},
  }
}
