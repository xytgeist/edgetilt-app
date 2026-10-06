import { useRef } from 'react'

const HOLD_MS = 480

/**
 * Keep tap → open book. Hold / right-click → log. If hold fires, the following click is swallowed.
 */
export function useOddsLogPress({ onLog, onOpen, enabled = true } = {}) {
  const hold = useRef({ t: 0, fired: false })

  const clear = () => {
    if (hold.current.t) {
      clearTimeout(hold.current.t)
      hold.current.t = 0
    }
  }

  if (!enabled || !onLog) {
    return {
      onClick: onOpen
        ? (e) => {
            e.stopPropagation()
            onOpen(e)
          }
        : undefined,
    }
  }

  return {
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      hold.current.fired = false
      clear()
      hold.current.t = window.setTimeout(() => {
        hold.current.fired = true
        hold.current.t = 0
        onLog()
      }, HOLD_MS)
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu: (e) => {
      e.preventDefault()
      e.stopPropagation()
      clear()
      hold.current.fired = true
      onLog()
    },
    onClick: (e) => {
      if (hold.current.fired) {
        e.preventDefault()
        e.stopPropagation()
        hold.current.fired = false
        return
      }
      if (!onOpen) return
      e.stopPropagation()
      onOpen(e)
    },
  }
}
