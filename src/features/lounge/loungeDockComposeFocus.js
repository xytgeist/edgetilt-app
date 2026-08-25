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

/**
 * iOS will often keep the software keyboard after `contenteditable.blur()`. Park focus on a
 * read-only `inputmode=none` sink in the same user gesture, then drop it.
 */
export function dismissLoungeSoftwareKeyboard() {
  try {
    const active = document.activeElement
    if (
      active instanceof HTMLElement &&
      active !== document.body &&
      typeof active.blur === 'function'
    ) {
      active.blur()
    }
  } catch {
    // ignore
  }
  if (typeof document === 'undefined') return
  try {
    const sink = document.createElement('input')
    sink.setAttribute('readonly', 'true')
    sink.setAttribute('inputmode', 'none')
    sink.setAttribute('aria-hidden', 'true')
    sink.tabIndex = -1
    sink.style.cssText =
      'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;border:0;padding:0;font-size:16px;pointer-events:none'
    document.body.appendChild(sink)
    sink.focus()
    // Do not blur in this turn ... iOS restores the previous contenteditable keyboard if we
    // focus-then-immediately-blur. Callers that need the keyboard gone (scroll dismiss) hold this
    // node until the timeout; do not use this on GIF open (search focus should keep the keyboard).
    window.setTimeout(() => {
      try {
        if (document.activeElement === sink) sink.blur()
        sink.remove()
      } catch {
        // ignore
      }
    }, 480)
  } catch {
    // ignore
  }
}

/** Dismiss the software keyboard (file inputs / scroll-dismiss). GIF open should focus search instead. */
export function blurLoungeComposerCaption(getTextarea) {
  const el = getTextarea?.()
  if (el) {
    try {
      el.blur()
    } catch {
      // ignore
    }
  }
  dismissLoungeSoftwareKeyboard()
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
