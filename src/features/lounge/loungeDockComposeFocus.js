import {
  isRichComposerElement,
  plainTextFromComposerRoot,
  setCaretTextOffset,
} from './loungeRichComposerDom.js'

/**
 * Focus caption and place caret at end. Call synchronously from a click/pointer handler when
 * possible so mobile Safari keeps the tap “user activation” and shows the keyboard.
 *
 * @param {() => HTMLElement | null} getTextarea
 * @param {{ scrollFeedToTop?: () => void }} [opts]
 * @returns {boolean} whether the field was found and focus was attempted
 */
export function focusLoungeComposerCaption(getTextarea, opts = {}) {
  opts.scrollFeedToTop?.()
  const el = getTextarea?.()
  if (!el) return false
  try {
    el.focus({ preventScroll: true })
  } catch {
    try {
      el.focus()
    } catch {
      return false
    }
  }
  if (isRichComposerElement(el)) {
    setCaretTextOffset(el, plainTextFromComposerRoot(el).length)
    return true
  }
  const len = typeof el.value === 'string' ? el.value.length : 0
  try {
    el.setSelectionRange(len, len)
  } catch {
    // ignore
  }
  return true
}

/**
 * Try to raise the software keyboard - must run synchronously inside a user-activation handler
 * (e.g. file input `change` right after the user taps Add in Photos). Delayed `focus()` only moves
 * the caret; iOS will not show the keyboard without a fresh tap.
 *
 * @returns {boolean} whether the textarea is the active element after the attempt
 */
export function invokeLoungeComposerCaptionKeyboard(getTextarea, opts = {}) {
  opts.scrollFeedToTop?.()
  const el = getTextarea?.()
  if (!el) return false
  try {
    el.focus({ preventScroll: true })
  } catch {
    try {
      el.focus()
    } catch {
      return false
    }
  }
  if (!isRichComposerElement(el)) {
    try {
      el.readOnly = true
      el.readOnly = false
    } catch {
      // ignore
    }
  }
  try {
    el.click()
  } catch {
    // ignore
  }
  if (isRichComposerElement(el)) {
    setCaretTextOffset(el, plainTextFromComposerRoot(el).length)
    return document.activeElement === el
  }
  const len = typeof el.value === 'string' ? el.value.length : 0
  try {
    el.setSelectionRange(len, len)
  } catch {
    // ignore
  }
  return document.activeElement === el
}

/** Dismiss the software keyboard before a full-screen picker (e.g. Klipy) opens. */
export function blurLoungeComposerCaption(getTextarea) {
  const el = getTextarea?.()
  if (!el) return
  try {
    el.blur()
  } catch {
    // ignore
  }
}

/** Extra retries after image carousel mounts / previews decode (iOS often blurs again). */
export const LOUNGE_COMPOSER_FOCUS_AFTER_MEDIA_DELAYS_MS = [600, 1000, 1500]

/**
 * Spread onto toolbar buttons beside a focused composer <textarea>. Prevents the button from
 * taking focus on press so iOS keeps the software keyboard up until the picker/modal opens.
 *
 * @param {() => void} onActivate
 */
export function loungeComposerToolbarKeepFocusHandlers(onActivate) {
  let activatedFromTouch = false
  return {
    onMouseDown: (e) => {
      e.preventDefault()
    },
    onTouchStart: (e) => {
      e.preventDefault()
      activatedFromTouch = true
      onActivate?.()
    },
    onClick: (e) => {
      e.preventDefault()
      if (activatedFromTouch) {
        activatedFromTouch = false
        return
      }
      onActivate?.()
    },
  }
}

/**
 * Focus the Lounge composer textarea after expand - retries cover panel close + lazy layout.
 *
 * @param {{ extraDelaysMs?: number[] }} [opts]
 */
export function scheduleLoungeComposerTextareaFocus({
  getTextarea,
  scrollFeedToTop,
  isBlocked,
  extraDelaysMs = [],
}) {
  const run = () => {
    if (isBlocked?.()) return
    focusLoungeComposerCaption(getTextarea, { scrollFeedToTop })
  }

  run()
  const baseDelays = [50, 150, 340]
  const delays = [...baseDelays, ...extraDelaysMs]
  const timers = delays.map((ms) => window.setTimeout(run, ms))
  const raf = typeof window.requestAnimationFrame === 'function' ? window.requestAnimationFrame(run) : 0

  return () => {
    for (const id of timers) window.clearTimeout(id)
    if (raf) window.cancelAnimationFrame(raf)
  }
}
