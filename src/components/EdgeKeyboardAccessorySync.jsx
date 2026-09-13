import { useEffect } from 'react'
import { isEdgeiOSShell, setEdgeKeyboardAccessoryVisible } from '../utils/edgeNative.js'

const SKIP_INPUT_TYPES = new Set([
  'button',
  'submit',
  'reset',
  'checkbox',
  'radio',
  'file',
  'hidden',
  'image',
  'range',
  'color',
])

function isKeyboardField(el) {
  if (!(el instanceof HTMLElement) || el.disabled) return false
  if (el instanceof HTMLTextAreaElement) return !el.readOnly
  if (el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLInputElement) {
    if (el.readOnly) return false
    return !SKIP_INPUT_TYPES.has(String(el.type || 'text').toLowerCase())
  }
  return Boolean(el.isContentEditable)
}

function shouldShowAccessory(el) {
  if (!isKeyboardField(el)) return false
  if (el.closest('.klipy-gif-sheet, [data-klipy-gif-picker]')) return false
  return true
}

/**
 * IPA hides the WK Done / prev-next bar by default. Turn the **system**
 * accessory back on while a real field is focused. GIF search stays hidden.
 */
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
      void setEdgeKeyboardAccessoryVisible(false)
    }
  }, [])

  return null
}
