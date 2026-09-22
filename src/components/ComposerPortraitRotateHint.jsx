import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Z_COMPOSER_PORTRAIT_HINT } from '../constants/appZIndex.js'
import { isEdgeiOSShell } from '../utils/edgeNative.js'
import {
  isComposerKeyboardField,
  shouldBlockComposerKeyboard,
  useComposerPortraitWanted,
  usePhoneLandscapeNotTablet,
} from '../utils/edgeiOSComposerPortraitLock.js'

function blurComposerKeyboard() {
  const el = typeof document !== 'undefined' ? document.activeElement : null
  if (!isComposerKeyboardField(el)) return
  try {
    el.blur()
  } catch {
    /* ignore */
  }
}

/**
 * Safari / PWA / Android cannot force-rotate. While a composer is open on a
 * landscape phone, show a rotate-to-portrait icon and keep the software
 * keyboard down (it would cover the hint). IPA already locks, so this stays off.
 */
export default function ComposerPortraitRotateHint() {
  const wanted = useComposerPortraitWanted()
  const phoneLandscape = usePhoneLandscapeNotTablet()
  const showHint = wanted && phoneLandscape && !isEdgeiOSShell()

  useEffect(() => {
    if (typeof document === 'undefined' || isEdgeiOSShell()) return undefined

    const blockPointer = (event) => {
      if (!shouldBlockComposerKeyboard()) return
      if (!isComposerKeyboardField(event.target)) return
      event.preventDefault()
    }
    const blockFocus = (event) => {
      if (!shouldBlockComposerKeyboard()) return
      if (!isComposerKeyboardField(event.target)) return
      try {
        event.target.blur()
      } catch {
        /* ignore */
      }
    }

    document.addEventListener('pointerdown', blockPointer, true)
    document.addEventListener('touchstart', blockPointer, { capture: true, passive: false })
    document.addEventListener('focusin', blockFocus, true)
    return () => {
      document.removeEventListener('pointerdown', blockPointer, true)
      document.removeEventListener('touchstart', blockPointer, true)
      document.removeEventListener('focusin', blockFocus, true)
    }
  }, [])

  useEffect(() => {
    if (!showHint) return
    blurComposerKeyboard()
  }, [showHint])

  if (!showHint || typeof document === 'undefined') return null

  return createPortal(
    <div
      data-composer-portrait-hint
      className="pointer-events-none fixed inset-0 flex items-center justify-center"
      style={{ zIndex: Z_COMPOSER_PORTRAIT_HINT }}
      aria-hidden
    >
      <div
        data-composer-portrait-hint-plate
        className="flex flex-col items-center gap-2 rounded-[1.75rem] border border-zinc-700/70 bg-zinc-900/88 px-6 py-5 text-white shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md"
      >
        <span data-composer-portrait-hint-phone className="block h-14 w-14">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-full w-full">
            <rect
              x="8"
              y="2.5"
              width="8"
              height="19"
              rx="2.25"
              stroke="currentColor"
              strokeWidth="1.7"
            />
            <path
              d="M11 4.6h2"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="text-[13px] font-semibold tracking-wide text-white/90">
          Rotate to portrait
        </span>
      </div>
    </div>,
    document.body,
  )
}
