import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import {
  getCaretTextOffset,
  insertComposerLineBreakViaExecCommand,
  insertPlainTextAtSelection,
  plainTextFromComposerRoot,
  syncComposerHtml,
} from './loungeRichComposerDom.js'
import { LOUNGE_CAPTION_MAX } from '../../utils/loungeCommentLimits.js'
import { normalizeCashtagsInCaption } from '../../utils/loungeMarketCaptionParse.js'
import { LOUNGE_RICH_COMPOSER_VARIANTS } from './loungeRichComposerVariants.js'

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
  const onInputRef = useRef(onInput)
  onInputRef.current = onInput
  const preset = LOUNGE_RICH_COMPOSER_VARIANTS[variant] || LOUNGE_RICH_COMPOSER_VARIANTS.feed
  /** Android: DOM text can lead React value by a keystroke; do not overlay placeholder on typed chars. */
  const [domHasText, setDomHasText] = useState(() => String(value ?? '').length > 0)
  const [isComposing, setIsComposing] = useState(false)

  useImperativeHandle(ref, () => rootRef.current, [])

  const syncPlaceholderFromDom = useCallback(() => {
    const el = rootRef.current
    const domLen = el ? plainTextFromComposerRoot(el).length : 0
    setDomHasText(Boolean(String(value ?? '').length) || domLen > 0)
  }, [value])

  const notifyComposerInput = useCallback((el, text, caret, { sync = false } = {}) => {
    caretRef.current = caret
    const payload = { target: el, text, caret }
    if (sync) onInputRef.current?.(payload)
    requestAnimationFrame(() => {
      onInputRef.current?.(payload)
    })
  }, [])

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
    if (skipRichSyncRef.current) {
      skipRichSyncRef.current = false
    } else {
      syncComposerHtml(el, capped, nextCaret)
    }
    if (capped !== value) onChange?.(capped)
    setDomHasText(capped.length > 0)
  }, [maxLength, notifyComposerInput, onChange, value])

  const insertEnterNewline = useCallback(() => {
    if (enterHandledRef.current) return true
    const el = rootRef.current
    if (!el) return false

    enterHandledRef.current = true
    queueMicrotask(() => {
      enterHandledRef.current = false
    })

    skipRichSyncRef.current = true
    if (!insertComposerLineBreakViaExecCommand(el)) {
      skipRichSyncRef.current = false
      return false
    }

    if (composingRef.current) return true

    const caret = getCaretTextOffset(el)
    let text = plainTextFromComposerRoot(el)
    text = normalizeCashtagsInCaption(text)
    if (maxLength != null && text.length > maxLength) {
      text = text.slice(0, maxLength)
    }
    const nextCaret = maxLength != null ? Math.min(caret, text.length) : caret
    lastValueRef.current = text
    caretRef.current = nextCaret
    notifyComposerInput(el, text, nextCaret, { sync: true })
    if (text !== value) onChange?.(text)
    setDomHasText(text.length > 0)
    return true
  }, [maxLength, notifyComposerInput, onChange, value])

  useEffect(() => {
    syncPlaceholderFromDom()
  }, [syncPlaceholderFromDom])

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el || composingRef.current) return
    const domText = plainTextFromComposerRoot(el)
    if (domText === value) {
      lastValueRef.current = value
      return
    }
    if (domText === lastValueRef.current) return
    lastValueRef.current = value
    const caret =
      document.activeElement === el
        ? Math.min(getCaretTextOffset(el), value.length)
        : value.length
    caretRef.current = caret
    syncComposerHtml(el, value, caret)
  }, [value])

  useLayoutEffect(() => {
    if (!autoGrow) return
    const el = rootRef.current
    if (!el) return
    try {
      el.style.height = 'auto'
      const max = Math.round(Math.min(window.innerHeight * 0.42, 352))
      const lineFloor = 38
      el.style.height = `${Math.min(Math.max(el.scrollHeight, lineFloor), max)}px`
      el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
    } catch {
      // ignore
    }
  }, [autoGrow, value])

  useEffect(() => {
    const el = rootRef.current
    if (!el || disabled) return undefined
    const onSelectionChange = () => {
      if (composingRef.current) return
      const root = rootRef.current
      if (!root) return
      const active = document.activeElement
      if (active !== root && !root.contains(active)) return
      const caret = getCaretTextOffset(root)
      caretRef.current = caret
      notifyComposerInput(root, plainTextFromComposerRoot(root), caret)
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [disabled, notifyComposerInput])

  const handleBeforeInput = useCallback((e) => {
    const type = String(e?.inputType ?? '')
    if (type.startsWith('insert') || type === 'insertCompositionText') {
      setDomHasText(true)
    }
  }, [])

  const handleInput = useCallback(() => {
    readAndEmit()
  }, [readAndEmit])

  const handlePaste = useCallback(
    (e) => {
      e.preventDefault()
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (!text) return
      insertPlainTextAtSelection(rootRef.current, text)
      readAndEmit()
    },
    [readAndEmit],
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
        onBlur={onBlur}
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
        }}
        className={`w-full touch-manipulation whitespace-pre-wrap break-words px-0 text-left text-zinc-100 outline-none selection:bg-cyan-500/25 [-webkit-tap-highlight-color:transparent] ${preset.fieldClass} ${autoGrow ? 'overflow-hidden' : 'overflow-y-auto'} ${className}`}
      />
    </div>
  )
})

export default LoungeRichComposerField
