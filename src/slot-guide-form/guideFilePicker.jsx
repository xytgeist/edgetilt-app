import { useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

const SCROLL_SELECTOR = '.slot-guide-form-scroll'
const SHELL_SELECTOR = '[data-slot-guide-form]'

function saveScrollPosition() {
  const el = document.querySelector(SCROLL_SELECTOR)
  return el?.scrollTop ?? 0
}

function restoreScrollPosition(top) {
  const el = document.querySelector(SCROLL_SELECTOR)
  if (el) el.scrollTop = top
}

/** Keep shell at full viewport when native file picker shrinks visualViewport (Chrome/Windows). */
function lockShellHeight() {
  const shell = document.querySelector(SHELL_SELECTOR)
  if (!shell) return
  shell.style.height = '100vh'
  shell.style.maxHeight = '100vh'
  document.documentElement.style.height = '100vh'
  document.body.style.height = '100vh'
  const root = document.getElementById('root')
  if (root) {
    root.style.height = '100vh'
    root.style.maxHeight = '100vh'
    root.style.minHeight = '0'
  }
}

/**
 * One hidden file input on document.body - keeps native picker out of the form scroll tree.
 */
export function useGuideFilePicker() {
  const inputRef = useRef(null)
  const onPickRef = useRef(null)
  const scrollTopRef = useRef(0)
  /** True only while native file picker may have moved scroll (avoid restoring on every field focus). */
  const pickingRef = useRef(false)

  useEffect(() => {
    const restoreAfterPicker = () => {
      if (!pickingRef.current) return
      pickingRef.current = false
      lockShellHeight()
      window.requestAnimationFrame(() => {
        restoreScrollPosition(scrollTopRef.current)
      })
    }
    window.addEventListener('focus', restoreAfterPicker)
    window.visualViewport?.addEventListener('resize', lockShellHeight)
    window.addEventListener('resize', lockShellHeight)
    return () => {
      window.removeEventListener('focus', restoreAfterPicker)
      window.visualViewport?.removeEventListener('resize', lockShellHeight)
      window.removeEventListener('resize', lockShellHeight)
    }
  }, [])

  const pickFile = useCallback(({ accept = 'image/*', onPick }) => {
    scrollTopRef.current = saveScrollPosition()
    pickingRef.current = true
    lockShellHeight()
    onPickRef.current = onPick
    const input = inputRef.current
    if (!input) {
      pickingRef.current = false
      return
    }
    input.accept = accept
    input.value = ''
    input.click()
  }, [])

  const portal = createPortal(
    <input
      ref={inputRef}
      type="file"
      tabIndex={-1}
      aria-hidden
      style={{
        position: 'fixed',
        left: -9999,
        top: 0,
        width: 1,
        height: 1,
        opacity: 0,
        pointerEvents: 'none',
      }}
      onChange={(e) => {
        const file = e.target.files?.[0] ?? null
        e.target.value = ''
        onPickRef.current?.(file)
        onPickRef.current = null
        pickingRef.current = false
        lockShellHeight()
        restoreScrollPosition(scrollTopRef.current)
      }}
    />,
    document.body,
  )

  return { pickFile, portal }
}

/** Append cache-bust query so R2/CDN serves fresh hero after overwrite. */
export function cacheBustUrl(url) {
  const u = String(url || '').trim()
  if (!u) return u
  const base = u.split('?')[0]
  return `${base}?v=${Date.now()}`
}
