import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const SHIELD_Z = 10000
const SWALLOW = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend', 'touchmove']

/**
 * Invisible full-screen layer while the first-run tour opens the menu / expands the FAB.
 * Native listeners so the tap never reaches AppShell's document "click outside closes menu".
 * `maxMs` drops the shield even if the step never advances, so the app cannot wedge.
 */
export default function ChromeTourTapShield({ active, stepKey, maxMs }) {
  const ref = useRef(null)
  const [expiredKey, setExpiredKey] = useState('')
  const on = active && expiredKey !== stepKey

  useEffect(() => {
    if (!active) return undefined
    const timer = window.setTimeout(() => setExpiredKey(stepKey), maxMs)
    return () => window.clearTimeout(timer)
  }, [active, stepKey, maxMs])

  useEffect(() => {
    const el = ref.current
    if (!on || !el) return undefined
    const swallow = (e) => {
      e.stopPropagation()
      if (e.cancelable) e.preventDefault()
    }
    for (const type of SWALLOW) el.addEventListener(type, swallow, { passive: false })
    return () => {
      for (const type of SWALLOW) el.removeEventListener(type, swallow)
    }
  }, [on])

  if (!on || typeof document === 'undefined') return null
  return createPortal(
    <div ref={ref} data-chrome-tour-tap-shield aria-hidden className="fixed inset-0" style={{ zIndex: SHIELD_Z }} />,
    document.body,
  )
}
