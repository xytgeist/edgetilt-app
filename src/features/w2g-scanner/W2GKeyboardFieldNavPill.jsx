import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Z_APP_ALERT } from '../../constants/appZIndex.js'
import { dismissEdgeKeyboard, isEdgeiOSShell } from '../../utils/edgeNative.js'

function taxFieldInputs() {
  if (typeof document === 'undefined') return []
  return [...document.querySelectorAll('[data-w2g-ocr] input:not([disabled])')].filter(
    (el) => el instanceof HTMLInputElement,
  )
}

/**
 * IPA hides the WK Done / prev-next accessory. Recreate it as a hover pill
 * above the keys on the W-2G extract / verify field list.
 */
export default function W2GKeyboardFieldNavPill() {
  const onIpa = typeof window !== 'undefined' && isEdgeiOSShell()
  const [focused, setFocused] = useState(false)
  const [index, setIndex] = useState(-1)
  const [count, setCount] = useState(0)
  const [overlapPx, setOverlapPx] = useState(0)

  useEffect(() => {
    if (!onIpa || typeof document === 'undefined') return undefined

    const sync = (el) => {
      const inputs = taxFieldInputs()
      const idx = el instanceof HTMLInputElement ? inputs.indexOf(el) : -1
      setCount(inputs.length)
      setIndex(idx)
      setFocused(idx >= 0)
    }

    const onFocusIn = (event) => sync(event.target)
    const onFocusOut = (event) => {
      const next = event.relatedTarget
      if (next instanceof HTMLElement && next.closest('[data-w2g-kb-pill]')) return
      window.setTimeout(() => {
        const active = document.activeElement
        if (active instanceof HTMLInputElement && active.closest('[data-w2g-ocr]')) {
          sync(active)
          return
        }
        setFocused(false)
        setIndex(-1)
      }, 0)
    }

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    sync(document.activeElement)

    const vv = window.visualViewport
    const syncKb = () => {
      if (!vv) {
        setOverlapPx(0)
        return
      }
      const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      setOverlapPx(Number.isFinite(overlap) ? overlap : 0)
    }
    syncKb()
    vv?.addEventListener('resize', syncKb)
    vv?.addEventListener('scroll', syncKb)

    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      vv?.removeEventListener('resize', syncKb)
      vv?.removeEventListener('scroll', syncKb)
    }
  }, [onIpa])

  if (!onIpa || !focused || typeof document === 'undefined') return null

  const go = (delta) => {
    const inputs = taxFieldInputs()
    const next = inputs[index + delta]
    if (!next) return
    next.focus()
    try {
      next.scrollIntoView({ block: 'center', behavior: 'smooth' })
    } catch {
      /* ignore */
    }
  }

  const lift = Math.max(overlapPx, 8) + 8

  return createPortal(
    <div
      data-w2g-kb-pill
      className="pointer-events-none fixed inset-x-0 flex justify-center px-3"
      style={{
        zIndex: Z_APP_ALERT + 8,
        bottom: lift,
      }}
    >
      <div className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-zinc-800/95 px-1.5 py-1 shadow-lg ring-1 ring-zinc-600/80 backdrop-blur-md">
        <button
          type="button"
          disabled={index <= 0}
          aria-label="Previous field"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-100 touch-manipulation disabled:opacity-30"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => go(-1)}
        >
          <ChevronLeft size={20} className="pointer-events-none" aria-hidden />
        </button>
        <button
          type="button"
          disabled={index < 0 || index >= count - 1}
          aria-label="Next field"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-100 touch-manipulation disabled:opacity-30"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => go(1)}
        >
          <ChevronRight size={20} className="pointer-events-none" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Done"
          className="inline-flex min-h-10 min-w-[4.25rem] items-center justify-center rounded-full bg-amber-500 px-3 text-sm font-bold text-zinc-950 touch-manipulation"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => dismissEdgeKeyboard()}
        >
          Done
        </button>
      </div>
    </div>,
    document.body,
  )
}
