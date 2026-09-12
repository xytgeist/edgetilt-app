import { useEffect } from 'react'
import { isEdgeiOSShell, setEdgeKeyboardAccessoryVisible } from '../../utils/edgeNative.js'

function isW2GTaxField(el) {
  return el instanceof HTMLInputElement && Boolean(el.closest('[data-w2g-ocr]')) && !el.disabled
}

/**
 * IPA hides the system WK Done / prev-next bar everywhere. Turn that **system**
 * accessory back on while a W-2G tax field is focused. No custom web chrome.
 */
export default function W2GKeyboardFieldNavPill() {
  useEffect(() => {
    if (typeof window === 'undefined' || !isEdgeiOSShell()) return undefined

    const sync = (el) => {
      void setEdgeKeyboardAccessoryVisible(isW2GTaxField(el))
    }

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
      void setEdgeKeyboardAccessoryVisible(false)
    }
  }, [])

  return null
}
