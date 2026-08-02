import { useCallback, useMemo, useRef } from 'react'

/** Movement beyond this counts as scroll/drag, not a row tap. */
export const POKER_STABLE_PICKER_TAP_SLOP_PX = 12

/**
 * Tap-to-select for scrollable Stable picker lists.
 * Select on pointerup when the gesture did not scroll or move past slop.
 *
 * @param {React.RefObject<HTMLElement | null>} listRef
 */
export function usePickerListTapSelect(listRef) {
  const gestureRef = useRef(
    /** @type {{ pointerId: number, x: number, y: number, scrollTop: number, moved: boolean, onSelect: () => void } | null} */ (
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
        gestureRef.current = {
          pointerId: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          scrollTop: listRef.current?.scrollTop ?? 0,
          moved: false,
          onSelect,
        }
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
        const wasTap = !g.moved
        const select = g.onSelect
        gestureRef.current = null
        if (wasTap) {
          e.preventDefault()
          select()
        }
      },
      onPointerCancelCapture: () => {
        gestureRef.current = null
      },
    }),
    [markMovedIfNeeded],
  )

  return { bindRowSelect, listPointerProps }
}
