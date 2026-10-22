import { useRef } from 'react'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import { markOddsHoldLearned } from './oddsHoldHint.js'

const HOLD_MS = 480

/** `data-odds-holding` drives the CSS fill ring for the length of the hold (see index.css). */
function setHolding(el, on) {
  if (!el?.dataset) return
  if (on) el.dataset.oddsHolding = ''
  else delete el.dataset.oddsHolding
}

/**
 * Keep tap → open book. Hold / right-click → log. If hold fires, the following click is swallowed.
 * Holdable targets carry `data-odds-hold` so the game hub tip can anchor to one.
 */
export function useOddsLogPress({ onLog, onOpen, enabled = true } = {}) {
  const hold = useRef({ t: 0, fired: false, el: null })

  const clear = () => {
    if (hold.current.t) {
      clearTimeout(hold.current.t)
      hold.current.t = 0
    }
    setHolding(hold.current.el, false)
    hold.current.el = null
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
    'data-odds-hold': '',
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      hold.current.fired = false
      clear()
      hold.current.el = e.currentTarget
      setHolding(hold.current.el, true)
      hold.current.t = window.setTimeout(() => {
        hold.current.fired = true
        hold.current.t = 0
        setHolding(hold.current.el, false)
        hold.current.el = null
        triggerTapHapticLight()
        markOddsHoldLearned()
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
      markOddsHoldLearned()
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
