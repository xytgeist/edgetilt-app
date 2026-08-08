import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import {
  getCaretTextOffset,
  insertComposerLineBreakViaExecCommand,
  insertComposerNewlineByPlainSync,
  insertPlainTextAtSelection,
  LOUNGE_ANDROID,
  LOUNGE_IOS,
  plainTextFromComposerRoot,
  syncComposerFieldAutoHeight,
  syncComposerHtml,
} from './loungeRichComposerDom.js'

/** Debounce rich HTML rewrite while typing … Android Chrome is especially sensitive to innerHTML+caret. */
const RICH_SYNC_DEBOUNCE_MS = LOUNGE_ANDROID ? 180 : 90
const SELECTION_NOTIFY_THROTTLE_MS = LOUNGE_ANDROID ? 120 : 0
import { LOUNGE_CAPTION_MAX } from '../../utils/loungeCommentLimits.js'
import { normalizeCashtagsInCaption } from '../../utils/loungeMarketCaptionParse.js'
import { detectCashtagAtCursor } from './loungeCashtagAutocomplete.js'
import { LOUNGE_RICH_COMPOSER_VARIANTS } from './loungeRichComposerVariants.js'
import {
  clipboardEventHasHtml,
  imageFilesFromClipboardEvent,
  imageFilesFromNavigatorClipboardRead,
} from '../../utils/clipboardImagePaste.js'

function isEnterKeyEvent(e) {
  if (!e) return false
  return e.key === 'Enter' || e.keyCode === 13
}

/**
 * Contenteditable Lounge caption field with live @ / # / link styling.
 * Enter uses execCommand insertLineBreak (X-style); rich HTML sync waits for the next keystroke.
 */
const LoungeRichComposerField = forwardRef(function LoungeRichComposerField(
  {
    value = '',
    onChange,
    maxLength = LOUNGE_CAPTION_MAX,
    variant = 'feed',
    className = '',
    ariaLabel = 'Lounge post caption',
    placeholder = '',
    id,
    onKeyDown,
    onKeyUp,
    onMouseUp,
    onBlur,
    onFocus,
    onInput,
    disabled = false,
    autoGrow = false,
    enterInsertsNewline = true,
    cashtagStyleContext = null,
    /** When set, pasted clipboard images are routed here instead of inserting text. */
    onPasteImageFiles = null,
  },
  ref,
) {
  const rootRef = useRef(null)
  const lastValueRef = useRef(value)
  const caretRef = useRef(0)
  const composingRef = useRef(false)
  const enterHandledRef = useRef(false)
  /** Skip one readAndEmit rich HTML rebuild right after Enter (DOM rewrite races mobile caret). */
  const skipRichSyncRef = useRef(false)
  const richSyncTimerRef = useRef(0)
  const lastStyleCtxRef = useRef(cashtagStyleContext)
  const lastSelectionNotifyAtRef = useRef(0)
  const cashtagStyleContextRef = useRef(cashtagStyleContext)
  cashtagStyleContextRef.current = cashtagStyleContext
  const onInputRef = useRef(onInput)
  onInputRef.current = onInput
  const onPasteImageFilesRef = useRef(onPasteImageFiles)
  onPasteImageFilesRef.current = onPasteImageFiles
  const preset = LOUNGE_RICH_COMPOSER_VARIANTS[variant] || LOUNGE_RICH_COMPOSER_VARIANTS.feed
  /** iOS nested composers: native textarea avoids WebKit caret paint bugs in fixed/transformed footers. */
  const iosNativeTextarea = LOUNGE_IOS && variant !== 'feed'
  /** Grow to a viewport cap, then scroll internally (feed contenteditable included). */
  const manageFieldHeight = true
  /** Android: DOM text can lead React value by a keystroke; do not overlay placeholder on typed chars. */
  const [domHasText, setDomHasText] = useState(() => String(value ?? '').length > 0)
  const [isComposing, setIsComposing] = useState(false)

  useImperativeHandle(ref, () => rootRef.current, [])

  const syncPlaceholderFromDom = useCallback(() => {
    const el = rootRef.current
    const domLen = el
      ? iosNativeTextarea
        ? (el.value?.length ?? 0)
        : plainTextFromComposerRoot(el).length
      : 0
    setDomHasText(Boolean(String(value ?? '').length) || domLen > 0)
  }, [value, iosNativeTextarea])

  const notifyComposerInput = useCallback((el, text, caret, { sync = false } = {}) => {
    caretRef.current = caret
    const payload = { target: el, text, caret }
    if (sync) {
      onInputRef.current?.(payload)
      // Android: sync path is enough … a second rAF refresh doubles cashtag/mention work per key.
      if (LOUNGE_ANDROID) return
    }
    requestAnimationFrame(() => {
      onInputRef.current?.(payload)
    })
  }, [])

  const flushRichComposerSync = useCallback(() => {
    if (richSyncTimerRef.current) {
      window.clearTimeout(richSyncTimerRef.current)
      richSyncTimerRef.current = 0
    }
    const el = rootRef.current
    if (!el || composingRef.current || iosNativeTextarea) return
    const caret = getCaretTextOffset(el)
    let text = plainTextFromComposerRoot(el)
    text = normalizeCashtagsInCaption(text)
    const capped =
      maxLength != null && text.length > maxLength ? text.slice(0, maxLength) : text
    const nextCaret = maxLength != null ? Math.min(caret, capped.length) : caret
    if (detectCashtagAtCursor(capped, nextCaret)?.query) return
    syncComposerHtml(el, capped, nextCaret, cashtagStyleContextRef.current)
    lastStyleCtxRef.current = cashtagStyleContextRef.current
  }, [iosNativeTextarea, maxLength])

  const scheduleRichComposerSync = useCallback(() => {
    if (richSyncTimerRef.current) window.clearTimeout(richSyncTimerRef.current)
    richSyncTimerRef.current = window.setTimeout(() => {
      richSyncTimerRef.current = 0
      flushRichComposerSync()
    }, RICH_SYNC_DEBOUNCE_MS)
  }, [flushRichComposerSync])

  useEffect(
    () => () => {
      if (richSyncTimerRef.current) window.clearTimeout(richSyncTimerRef.current)
    },
    [],
  )

  const readAndEmit = useCallback(() => {
    const el = rootRef.current
    if (!el || composingRef.current) return
    const caret = getCaretTextOffset(el)
    let text = plainTextFromComposerRoot(el)
    text = normalizeCashtagsInCaption(text)
    const capped =
      maxLength != null && text.length > maxLength ? text.slice(0, maxLength) : text
    const nextCaret =
      maxLength != null ? Math.min(caret, capped.length) : caret
    lastValueRef.current = capped
    caretRef.current = nextCaret
    notifyComposerInput(el, capped, nextCaret, { sync: true })
    const skipRichForCashtag = detectCashtagAtCursor(capped, nextCaret)?.query
    if (skipRichSyncRef.current || skipRichForCashtag) {
      if (skipRichSyncRef.current) skipRichSyncRef.current = false
      if (richSyncTimerRef.current) {
        window.clearTimeout(richSyncTimerRef.current)
        richSyncTimerRef.current = 0
      }
    } else {
      // Debounce innerHTML rewrite … immediate sync + parent re-render used to do it twice/key.
      scheduleRichComposerSync()
    }
    if (capped !== value) onChange?.(capped)
    setDomHasText(capped.length > 0)
    requestAnimationFrame(() => syncComposerFieldAutoHeight(el))
  }, [maxLength, notifyComposerInput, onChange, scheduleRichComposerSync, value])

  const insertEnterNewline = useCallback(() => {
    if (enterHandledRef.current) return true
    const el = rootRef.current
    if (!el) return false

    enterHandledRef.current = true
    queueMicrotask(() => {
      enterHandledRef.current = false
    })

    if (LOUNGE_IOS && variant !== 'feed') {
      if (composingRef.current) return true
      const result = insertComposerNewlineByPlainSync(el, {
        maxLength,
        normalize: normalizeCashtagsInCaption,
        caretRefFallback: caretRef.current,
        rich: true,
      })
      if (!result) return false
      const { text, caret: nextCaret } = result
      lastValueRef.current = text
      caretRef.current = nextCaret
      notifyComposerInput(el, text, nextCaret, { sync: true })
      if (text !== value) onChange?.(text)
      setDomHasText(text.length > 0)
      requestAnimationFrame(() => syncComposerFieldAutoHeight(el))
      return true
    }

    skipRichSyncRef.current = true
    if (!insertComposerLineBreakViaExecCommand(el)) {
      skipRichSyncRef.current = false
      return false
    }

    if (composingRef.current) return true

    let text = plainTextFromComposerRoot(el)
    text = normalizeCashtagsInCaption(text)
    if (maxLength != null && text.length > maxLength) {
      text = text.slice(0, maxLength)
    }

    const caret = getCaretTextOffset(el)
    const nextCaret = maxLength != null ? Math.min(caret, text.length) : caret
    lastValueRef.current = text
    caretRef.current = nextCaret
    notifyComposerInput(el, text, nextCaret, { sync: true })
    if (text !== value) onChange?.(text)
    setDomHasText(text.length > 0)
    requestAnimationFrame(() => syncComposerFieldAutoHeight(el))
    return true
  }, [maxLength, notifyComposerInput, onChange, value, variant])

  useEffect(() => {
    syncPlaceholderFromDom()
  }, [syncPlaceholderFromDom])

  useLayoutEffect(() => {
    if (iosNativeTextarea) return
    const el = rootRef.current
    if (!el || composingRef.current) return
    const domText = plainTextFromComposerRoot(el)
    if (domText === value) {
      lastValueRef.current = value
      setDomHasText(value.length > 0)
      const styleChanged = lastStyleCtxRef.current !== cashtagStyleContext
      // DOM already matches React value (normal typing path). Do NOT rewrite HTML every
      // setPostText re-render … that was the Android typing stall (innerHTML + caret ×2/key).
      // Only restyle when quote/color context changes (debounced if focused).
      if (styleChanged) {
        lastStyleCtxRef.current = cashtagStyleContext
        const caret =
          document.activeElement === el
            ? Math.min(getCaretTextOffset(el), value.length)
            : value.length
        if (!detectCashtagAtCursor(value, caret)?.query) {
          if (document.activeElement === el || el.contains(document.activeElement)) {
            scheduleRichComposerSync()
          } else {
            syncComposerHtml(el, value, caret, cashtagStyleContext)
          }
        }
      }
      return
    }
    if (domText === lastValueRef.current && value === lastValueRef.current) {
      return
    }
    if (domText === lastValueRef.current && value !== lastValueRef.current) {
      // Parent-driven update (draft restore, clear, paste) while DOM still matches last emit.
      if (domText.length === 0 || value.length > domText.length) {
        lastValueRef.current = value
        const caret =
          document.activeElement === el
            ? Math.min(getCaretTextOffset(el), value.length)
            : value.length
        caretRef.current = caret
        if (richSyncTimerRef.current) {
          window.clearTimeout(richSyncTimerRef.current)
          richSyncTimerRef.current = 0
        }
        syncComposerHtml(el, value, caret, cashtagStyleContext)
        lastStyleCtxRef.current = cashtagStyleContext
        setDomHasText(value.length > 0)
      }
      return
    }
    lastValueRef.current = value
    const caret =
      document.activeElement === el
        ? Math.min(getCaretTextOffset(el), value.length)
        : value.length
    caretRef.current = caret
    if (richSyncTimerRef.current) {
      window.clearTimeout(richSyncTimerRef.current)
      richSyncTimerRef.current = 0
    }
    syncComposerHtml(el, value, caret, cashtagStyleContext)
    lastStyleCtxRef.current = cashtagStyleContext
    setDomHasText(value.length > 0)
  }, [cashtagStyleContext, iosNativeTextarea, scheduleRichComposerSync, value])

  useLayoutEffect(() => {
    if (!manageFieldHeight) return
    const el = rootRef.current
    if (!el) return
    try {
      syncComposerFieldAutoHeight(el)
    } catch {
      // ignore
    }
  }, [manageFieldHeight, value])

  useEffect(() => {
    if (iosNativeTextarea) return undefined
    const el = rootRef.current
    if (!el || disabled) return undefined
    const onSelectionChange = () => {
      if (composingRef.current) return
      const root = rootRef.current
      if (!root) return
      const active = document.activeElement
      if (active !== root && !root.contains(active)) return
      if (SELECTION_NOTIFY_THROTTLE_MS > 0) {
        const now = Date.now()
        if (now - lastSelectionNotifyAtRef.current < SELECTION_NOTIFY_THROTTLE_MS) return
        lastSelectionNotifyAtRef.current = now
      }
      const caret = getCaretTextOffset(root)
      caretRef.current = caret
      notifyComposerInput(root, plainTextFromComposerRoot(root), caret)
      syncComposerFieldAutoHeight(root)
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [disabled, notifyComposerInput, iosNativeTextarea])

  const handleTextareaChange = useCallback(
    (e) => {
      const el = e.target
      let text = el.value
      text = normalizeCashtagsInCaption(text)
      if (maxLength != null && text.length > maxLength) {
        text = text.slice(0, maxLength)
      }
      const caret = el.selectionStart ?? text.length
      lastValueRef.current = text
      caretRef.current = caret
      notifyComposerInput(el, text, caret, { sync: true })
      if (text !== value) onChange?.(text)
      setDomHasText(text.length > 0)
      requestAnimationFrame(() => syncComposerFieldAutoHeight(el))
    },
    [maxLength, notifyComposerInput, onChange, value],
  )

  const handleTextareaKeyDown = useCallback(
    (e) => {
      onKeyDown?.(e)
    },
    [onKeyDown],
  )

  const handleTextareaSelect = useCallback(
    (e) => {
      const el = e.target
      const caret = el.selectionStart ?? 0
      caretRef.current = caret
      notifyComposerInput(el, el.value, caret)
      onMouseUp?.(e)
    },
    [notifyComposerInput, onMouseUp],
  )

  const handleBeforeInput = useCallback((e) => {
    const type = String(e?.inputType ?? '')
    if (type.startsWith('insert') || type === 'insertCompositionText') {
      setDomHasText(true)
    }
  }, [])

  const handleInput = useCallback(() => {
    readAndEmit()
  }, [readAndEmit])

  const insertPlainTextIntoField = useCallback(
    (text) => {
      if (!text) return
      const el = rootRef.current
      if (!el) return
      if (iosNativeTextarea) {
        const start = el.selectionStart ?? el.value.length
        const end = el.selectionEnd ?? start
        let next = el.value.slice(0, start) + text + el.value.slice(end)
        next = normalizeCashtagsInCaption(next)
        if (maxLength != null && next.length > maxLength) {
          next = next.slice(0, maxLength)
        }
        const caret =
          maxLength != null ? Math.min(start + text.length, maxLength) : start + text.length
        el.value = next
        el.setSelectionRange(caret, caret)
        lastValueRef.current = next
        caretRef.current = caret
        notifyComposerInput(el, next, caret, { sync: true })
        if (next !== value) onChange?.(next)
        setDomHasText(next.length > 0)
        requestAnimationFrame(() => syncComposerFieldAutoHeight(el))
        return
      }
      insertPlainTextAtSelection(el, text)
      readAndEmit()
    },
    [iosNativeTextarea, maxLength, notifyComposerInput, onChange, readAndEmit, value],
  )

  const handlePaste = useCallback(
    async (e) => {
      const imageFiles = imageFilesFromClipboardEvent(e)
      if (imageFiles.length && onPasteImageFilesRef.current) {
        e.preventDefault()
        onPasteImageFilesRef.current(imageFiles)
        return
      }

      if (clipboardEventHasHtml(e)) {
        e.preventDefault()
        const text = e.clipboardData?.getData('text/plain') ?? ''
        if (text) insertPlainTextIntoField(text)
        return
      }

      if (onPasteImageFilesRef.current && navigator.clipboard?.read) {
        const asyncFiles = await imageFilesFromNavigatorClipboardRead()
        if (asyncFiles.length) {
          e.preventDefault()
          onPasteImageFilesRef.current(asyncFiles)
          return
        }
      }

      e.preventDefault()
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (text) insertPlainTextIntoField(text)
    },
    [insertPlainTextIntoField],
  )

  const handleKeyDown = useCallback(
    (e) => {
      onKeyDown?.(e)
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setDomHasText(true)
      }
      if (e.defaultPrevented) return
      if (!enterInsertsNewline || !isEnterKeyEvent(e)) return
      if (e.ctrlKey || e.metaKey) return
      e.preventDefault()
      insertEnterNewline()
    },
    [enterInsertsNewline, insertEnterNewline, onKeyDown],
  )

  const showPlaceholder =
    Boolean(placeholder) && !value && !domHasText && !isComposing

  if (iosNativeTextarea) {
    return (
      <div className="relative min-h-0 w-full">
        <textarea
          ref={rootRef}
          id={id}
          rows={1}
          value={value}
          disabled={disabled}
          readOnly={disabled}
          spellCheck
          aria-label={ariaLabel}
          placeholder={placeholder || undefined}
          onChange={handleTextareaChange}
          onKeyDown={handleTextareaKeyDown}
          onKeyUp={onKeyUp}
          onSelect={handleTextareaSelect}
          onPaste={handlePaste}
          onBlur={onBlur}
          onFocus={onFocus}
          className={`w-full resize-none border-0 bg-transparent touch-manipulation whitespace-pre-wrap break-words px-0 text-left text-zinc-100 outline-none selection:bg-cyan-500/25 [-webkit-tap-highlight-color:transparent] ${preset.fieldClass} ${manageFieldHeight ? 'overflow-hidden' : 'overflow-y-auto'} ${className}`}
        />
      </div>
    )
  }

  return (
    <div className="relative min-h-0 w-full">
      {showPlaceholder ? (
        <span
          aria-hidden
          className={`pointer-events-none absolute left-0 top-0 select-none whitespace-pre-wrap text-zinc-500 ${preset.placeholderClass}`}
        >
          {placeholder}
        </span>
      ) : null}
      <div
        ref={rootRef}
        id={id}
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        contentEditable={disabled ? 'false' : 'true'}
        suppressContentEditableWarning
        spellCheck
        onBeforeInput={handleBeforeInput}
        onInput={handleInput}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onKeyUp={onKeyUp}
        onMouseUp={onMouseUp}
        onBlur={(e) => {
          flushRichComposerSync()
          onBlur?.(e)
        }}
        onFocus={onFocus}
        onCompositionStart={() => {
          composingRef.current = true
          setIsComposing(true)
          setDomHasText(true)
        }}
        onCompositionEnd={() => {
          composingRef.current = false
          setIsComposing(false)
          readAndEmit()
          flushRichComposerSync()
        }}
        className={`w-full touch-manipulation whitespace-pre-wrap break-words px-0 text-left text-zinc-100 outline-none selection:bg-cyan-500/25 [-webkit-tap-highlight-color:transparent] ${preset.fieldClass} ${manageFieldHeight ? 'overflow-hidden' : 'overflow-y-auto'} ${className}`}
      />
    </div>
  )
})

export default LoungeRichComposerField
