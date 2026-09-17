import { useEffect } from 'react'
import { isEdgeiOSShell, setEdgeKeyboardAccessoryVisible } from '../utils/edgeNative.js'

/**
 * Native default is accessory **on**. Only GIF search opts out.
 * Do not set false on blur / non-fields ... that forces false→true on the
 * next focus and re-breaks the iPhone keyboard rise.
 */
function shouldShowAccessory(el) {
  if (!(el instanceof HTMLElement)) return true
  if (el.closest('.klipy-gif-sheet, [data-klipy-gif-picker]')) return false
  return true
}

export default function EdgeKeyboardAccessorySync() {
  useEffect(() => {
    if (typeof window === 'undefined' || !isEdgeiOSShell()) return undefined

    let last = null
    const apply = (visible) => {
      if (last === visible) return
      last = visible
      void setEdgeKeyboardAccessoryVisible(visible)
    }

    const sync = (el) => apply(shouldShowAccessory(el))

    const onFocusIn = (event) => sync(event.target)
    const onFocusOut = () => {
      window.setTimeout(() => {
        sync(document.activeElement)
      }, 0)
    }

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    sync(document.activeElement)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      last = null
    }
  }, [])

  return null
}
