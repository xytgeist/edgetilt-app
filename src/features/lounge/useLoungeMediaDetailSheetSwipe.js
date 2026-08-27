import { useCallback, useEffect, useRef } from 'react'
import {
  releaseLoungeMediaSheetPeek,
  setLoungeMediaSheetDragOffsetPx,
  setLoungeMediaSheetDragging,
} from './loungeLightboxDetailSheet.js'

const DISMISS_PX = 88
const DISMISS_VELOCITY = 0.55
const AXIS_LOCK_PX = 4
const SNAP_MS = 280

function isSwipeBlockedTarget(target) {
  if (!(target instanceof Element)) return true
  if (target.closest('[data-lounge-media-detail-grab], [data-lounge-media-detail-grab-hit]')) return false
  if (target.closest('textarea, input, select, [contenteditable="true"]')) return true
  return false
}

function clearSheetDragVisual(el) {
  if (!(el instanceof HTMLElement)) return
  el.style.transition = ''
  el.style.transform = ''
  el.style.willChange = ''
}

function sheetScrollEl() {
  if (typeof document === 'undefined') return null
  const el = document.querySelector('[data-lounge-media-detail-scroll]')
  return el instanceof HTMLElement ? el : null
}

function lockSheetScroll() {
  const el = sheetScrollEl()
  if (!el || el.dataset.loungeSheetScrollLock === '1') return
  el.dataset.loungeSheetScrollLock = '1'
  el.dataset.loungeSheetOverflow = el.style.overflow
  el.style.overflow = 'hidden'
}

function unlockSheetScroll() {
  const el = sheetScrollEl()
  if (!el || el.dataset.loungeSheetScrollLock !== '1') return
  el.style.overflow = el.dataset.loungeSheetOverflow || ''
  delete el.dataset.loungeSheetScrollLock
  delete el.dataset.loungeSheetOverflow
}

function scrollAtTop(scrollRef) {
  const scrollEl = sheetScrollEl() || scrollRef?.current
  if (!scrollEl) return true
  return scrollEl.scrollTop <= 0
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

  const endDrag = useCallback((el, { dismiss, animate }) => {
    dragRef.current = null
    unlockSheetScroll()
    setLoungeMediaSheetDragging(false)
    if (dismiss) {
      if (el instanceof HTMLElement) {
        el.style.willChange = 'transform'
        el.style.transition = `transform ${SNAP_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`
        el.style.transform = 'translate3d(0, 100%, 0)'
      }
      releaseLoungeMediaSheetPeek()
      onDismissRef.current?.()
      return
    }
    setLoungeMediaSheetDragOffsetPx(0)
    if (!(el instanceof HTMLElement)) return
    if (!animate) {
      clearSheetDragVisual(el)
      return
    }
    el.style.willChange = 'transform'
    el.style.transition = `transform ${SNAP_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`
    const baseTy = Number.parseFloat(
      document.documentElement.style.getPropertyValue('--lounge-media-sheet-translate-y') || '0',
    ) || 0
    el.style.transform = `translate3d(0, ${baseTy}px, 0)`
    window.setTimeout(() => clearSheetDragVisual(el), SNAP_MS + 20)
  }, [])

  useEffect(() => {
    if (enabled) return undefined
    const el = document.querySelector('[data-lounge-media-detail-sheet]')
    if (el instanceof HTMLElement) clearSheetDragVisual(el)
    dragRef.current = null
    setLoungeMediaSheetDragging(false)
    setLoungeMediaSheetDragOffsetPx(0)
    return undefined
  }, [enabled])

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return undefined
    const el = document.querySelector('[data-lounge-media-detail-scroll]')
    if (!(el instanceof HTMLElement)) return undefined
    const syncAtTop = () => {
      if (el.scrollTop <= 0) el.setAttribute('data-at-top', '')
      else el.removeAttribute('data-at-top')
    }
    syncAtTop()
    el.addEventListener('scroll', syncAtTop, { passive: true })
    return () => {
      el.removeEventListener('scroll', syncAtTop)
      el.removeAttribute('data-at-top')
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return undefined
    const sheet = document.querySelector('[data-lounge-media-detail-sheet]')
    if (!(sheet instanceof HTMLElement)) return undefined

    const applyOffset = (el, y) => {
      el.style.willChange = 'transform'
      el.style.transition = 'none'
      const baseTy = Number.parseFloat(
        document.documentElement.style.getPropertyValue('--lounge-media-sheet-translate-y') || '0',
      ) || 0
      el.style.transform = `translate3d(0, ${baseTy + y}px, 0)`
      setLoungeMediaSheetDragOffsetPx(y)
    }

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      const target = e.target
      if (isSwipeBlockedTarget(target)) return
      const onGrab = Boolean(
        target instanceof Element &&
          target.closest('[data-lounge-media-detail-grab], [data-lounge-media-detail-grab-hit]'),
      )
      if (!onGrab && !scrollAtTop(scrollRef)) return
      dragRef.current = {
        pointerId: 'touch',
        startY: t.clientY,
        startX: t.clientX,
        lastY: t.clientY,
        lastT: e.timeStamp || Date.now(),
        onGrab,
        engaged: onGrab,
        el: sheet,
      }
      if (onGrab) {
        setLoungeMediaSheetDragging(true)
        lockSheetScroll()
      }
    }

    const onTouchMove = (e) => {
      const d = dragRef.current
      if (!d || d.pointerId !== 'touch') return
      const t = e.touches[0]
      if (!t) return
      const dy = t.clientY - d.startY
      const dx = t.clientX - d.startX
      if (!d.engaged) {
        if (Math.abs(dx) > AXIS_LOCK_PX && Math.abs(dx) > Math.abs(dy)) {
          dragRef.current = null
          return
        }
        if (!scrollAtTop(scrollRef)) {
          dragRef.current = null
          return
        }
        if (dy < AXIS_LOCK_PX) return
        d.engaged = true
        setLoungeMediaSheetDragging(true)
        lockSheetScroll()
      }
      if (e.cancelable) e.preventDefault()
      const y = Math.max(0, dy)
      d.lastY = t.clientY
      d.lastT = e.timeStamp || Date.now()
      applyOffset(d.el, y)
    }

    const onTouchEnd = (e) => {
      const d = dragRef.current
      if (!d || d.pointerId !== 'touch') return
      const t = e.changedTouches?.[0]
      const clientY = t?.clientY ?? d.lastY
      const dy = Math.max(0, clientY - d.startY)
      const dt = Math.max(1, (e.timeStamp || Date.now()) - d.lastT)
      const vy = (clientY - d.lastY) / dt
      const el = d.el
      if (!d.engaged) {
        dragRef.current = null
        setLoungeMediaSheetDragging(false)
        unlockSheetScroll()
        return
      }
      const dismiss = dy >= DISMISS_PX || vy >= DISMISS_VELOCITY
      endDrag(el, { dismiss, animate: !dismiss })
    }

    sheet.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
    sheet.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
    sheet.addEventListener('touchend', onTouchEnd, { capture: true })
    sheet.addEventListener('touchcancel', onTouchEnd, { capture: true })
    return () => {
      sheet.removeEventListener('touchstart', onTouchStart, { capture: true })
      sheet.removeEventListener('touchmove', onTouchMove, { capture: true })
      sheet.removeEventListener('touchend', onTouchEnd, { capture: true })
      sheet.removeEventListener('touchcancel', onTouchEnd, { capture: true })
    }
  }, [enabled, endDrag, scrollRef])

  const onPointerDown = useCallback(
    (e) => {
      if (!enabled) return
      if (e.pointerType === 'touch') return
      if (e.button != null && e.button !== 0) return
      const sheet = e.currentTarget
      if (!(sheet instanceof HTMLElement)) return
      const target = e.target
      if (isSwipeBlockedTarget(target)) return
      const onGrab = Boolean(
        target instanceof Element &&
          target.closest('[data-lounge-media-detail-grab], [data-lounge-media-detail-grab-hit]'),
      )
      if (!onGrab && !scrollAtTop(scrollRef)) return
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
        setLoungeMediaSheetDragging(true)
        lockSheetScroll()
        try {
          sheet.setPointerCapture(e.pointerId)
        } catch {
          // ignore
        }
      }
    },
    [enabled, scrollRef],
  )

  const onPointerMove = useCallback(
    (e) => {
      if (e.pointerType === 'touch') return
      const d = dragRef.current
      if (!d || d.pointerId !== e.pointerId) return
      const dy = e.clientY - d.startY
      const dx = e.clientX - d.startX
      if (!d.engaged) {
        if (Math.abs(dx) > AXIS_LOCK_PX && Math.abs(dx) > Math.abs(dy)) {
          dragRef.current = null
          return
        }
        if (!scrollAtTop(scrollRef)) {
          dragRef.current = null
          return
        }
        if (dy < AXIS_LOCK_PX) return
        d.engaged = true
        setLoungeMediaSheetDragging(true)
        lockSheetScroll()
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
      const baseTy = Number.parseFloat(
        document.documentElement.style.getPropertyValue('--lounge-media-sheet-translate-y') || '0',
      ) || 0
      d.el.style.transform = `translate3d(0, ${baseTy + y}px, 0)`
      setLoungeMediaSheetDragOffsetPx(y)
    },
    [scrollRef],
  )

  const onPointerUp = useCallback(
    (e) => {
      if (e.pointerType === 'touch') return
      const d = dragRef.current
      if (!d || d.pointerId !== e.pointerId) return
      const el = d.el
      const dy = Math.max(0, e.clientY - d.startY)
      const dt = Math.max(1, (e.timeStamp || Date.now()) - d.lastT)
      const vy = (e.clientY - d.lastY) / dt
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      if (!d.engaged) {
        dragRef.current = null
        setLoungeMediaSheetDragging(false)
        unlockSheetScroll()
        return
      }
      const dismiss = dy >= DISMISS_PX || vy >= DISMISS_VELOCITY
      endDrag(el, { dismiss, animate: !dismiss })
    },
    [endDrag],
  )

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
