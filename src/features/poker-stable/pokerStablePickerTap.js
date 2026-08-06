import { useCallback, useMemo, useRef } from 'react'

/** Movement beyond this counts as scroll/drag, not a row tap. */
export const POKER_STABLE_PICKER_TAP_SLOP_PX = 12

/** Absorb any leftover pointer/mouse events after the list unmounts. */
const POKER_STABLE_PICKER_GHOST_CLICK_MS = 500

const GHOST_CLICK_EVENT_TYPES = [
  'click',
  'auxclick',
  'mousedown',
  'mouseup',
  'pointerdown',
  'pointerup',
  'touchstart',
  'touchend',
]

/**
 * Physical + capture shield: after a row select unmounts the dropdown, mobile
 * browsers often retarget the trailing click onto form controls that were under
 * the list. Block those events briefly.
 */
function armPickerGhostClickGuard(durationMs = POKER_STABLE_PICKER_GHOST_CLICK_MS) {
  const block = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation()
  }

  for (const type of GHOST_CLICK_EVENT_TYPES) {
    document.addEventListener(type, block, true)
  }

  const shield = document.createElement('div')
  shield.setAttribute('data-stable-picker-click-shield', '')
  Object.assign(shield.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    touchAction: 'none',
    cursor: 'default',
    background: 'transparent',
  })
  for (const type of GHOST_CLICK_EVENT_TYPES) {
    shield.addEventListener(type, block, true)
  }
  document.body.appendChild(shield)

  window.setTimeout(() => {
    for (const type of GHOST_CLICK_EVENT_TYPES) {
      document.removeEventListener(type, block, true)
      shield.removeEventListener(type, block, true)
    }
    shield.remove()
  }, durationMs)
}

/**
 * Tap-to-select for scrollable Stable picker lists.
 * Track move/scroll on pointer events; commit the select on click so the row is
 * still mounted as the click target (avoids click-through after pointerup unmount).
 *
 * @param {React.RefObject<HTMLElement | null>} listRef
 */
export function usePickerListTapSelect(listRef) {
  const gestureRef = useRef(
    /** @type {{ pointerId: number, x: number, y: number, scrollTop: number, moved: boolean } | null} */ (
      null
    ),
  )

  const markMovedIfNeeded = useCallback(
    (clientX, clientY) => {
      const g = gestureRef.current
      if (!g) return
      if (
        Math.abs(clientX - g.x) > POKER_STABLE_PICKER_TAP_SLOP_PX ||
        Math.abs(clientY - g.y) > POKER_STABLE_PICKER_TAP_SLOP_PX
      ) {
        g.moved = true
      }
      const list = listRef.current
      if (list && Math.abs(list.scrollTop - g.scrollTop) > 0) {
        g.moved = true
      }
    },
    [listRef],
  )

  const bindRowSelect = useCallback(
    (onSelect) => ({
      onPointerDown: (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        gestureRef.current = {
          pointerId: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          scrollTop: listRef.current?.scrollTop ?? 0,
          moved: false,
        }
      },
      onClick: (e) => {
        e.preventDefault()
        e.stopPropagation()
        const g = gestureRef.current
        gestureRef.current = null
        // Keyboard Enter/Space: no pointer gesture → allow select.
        // Pointer scroll/drag: moved → ignore.
        if (g?.moved) return
        armPickerGhostClickGuard()
        onSelect()
      },
    }),
    [listRef],
  )

  const listPointerProps = useMemo(
    () => ({
      onPointerMoveCapture: (e) => {
        if (gestureRef.current?.pointerId !== e.pointerId) return
        markMovedIfNeeded(e.clientX, e.clientY)
      },
      onPointerUpCapture: (e) => {
        const g = gestureRef.current
        if (!g || g.pointerId !== e.pointerId) return
        markMovedIfNeeded(e.clientX, e.clientY)
        // Keep gesture until click so moved taps can be ignored there.
      },
      onPointerCancelCapture: () => {
        gestureRef.current = null
      },
    }),
    [markMovedIfNeeded],
  )

  return { bindRowSelect, listPointerProps }
}
