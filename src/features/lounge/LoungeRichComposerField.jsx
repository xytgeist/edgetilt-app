import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import {
  COMPOSER_LINE_BREAK_INPUT_TYPES,
  getCaretTextOffset,
  insertPlainTextAtSelection,
  plainTextFromComposerRoot,
  syncComposerHtml,
} from './loungeRichComposerDom.js'
import { LOUNGE_CAPTION_MAX } from '../../utils/loungeCommentLimits.js'
import { normalizeCashtagsInCaption } from '../../utils/loungeMarketCaptionParse.js'
import { LOUNGE_RICH_COMPOSER_VARIANTS } from './loungeRichComposerVariants.js'

/**
 * Contenteditable Lounge caption field - real @ / # / link styling with aligned caret.
 * Value contract is plain text (same as the former textarea + mirror stack).
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
  const lastNewlineAtMsRef = useRef(0)
  const skipNextInputReadRef = useRef(false)
  const onInputRef = useRef(onInput)
  onInputRef.current = onInput
  const preset = LOUNGE_RICH_COMPOSER_VARIANTS[variant] || LOUNGE_RICH_COMPOSER_VARIANTS.feed

  useImperativeHandle(ref, () => rootRef.current, [])

  /** Notify mention layer - sync first (pre-DOM rewrite), rAF backup for late Android selection. */
  const notifyComposerInput = useCallback((el, text, caret, { sync = false } = {}) => {
    caretRef.current = caret
    const payload = { target: el, text, caret }
    if (sync) onInputRef.current?.(payload)
    requestAnimationFrame(() => {
      onInputRef.current?.(payload)
      requestAnimationFrame(() => {
        if (!el?.isConnected) return
        const liveCaret = getCaretTextOffset(el)
        caretRef.current = liveCaret
        onInputRef.current?.({
          target: el,
          text: plainTextFromComposerRoot(el),
          caret: liveCaret,
        })
      })
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
    syncComposerHtml(el, capped, nextCaret)
    if (capped !== value) onChange?.(capped)
  }, [maxLength, notifyComposerInput, onChange, value])

  const insertNewlineAtCaret = useCallback(() => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (now - lastNewlineAtMsRef.current < 80) return false
    lastNewlineAtMsRef.current = now

    const el = rootRef.current
    if (!el) return false
    const base = lastValueRef.current ?? value ?? ''
    let caret = getCaretTextOffset(el)
    if (!Number.isFinite(caret) || caret < 0) caret = caretRef.current
    caret = Math.max(0, Math.min(caret, base.length))
    let next = `${base.slice(0, caret)}\n${base.slice(caret)}`
    next = normalizeCashtagsInCaption(next)
    if (maxLength != null && next.length > maxLength) return false
    const nextCaret = caret + 1
    lastValueRef.current = next
    caretRef.current = nextCaret
    syncComposerHtml(el, next, nextCaret)
    notifyComposerInput(el, next, nextCaret, { sync: true })
    onChange?.(next)
    skipNextInputReadRef.current = true
    return true
  }, [maxLength, notifyComposerInput, onChange, value])

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el || composingRef.current) return
    const domText = plainTextFromComposerRoot(el)
    if (domText === value) {
      lastValueRef.current = value
      return
    }
    // Enter/readAndEmit may update DOM before the parent value prop catches up.
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

  const handleBeforeInput = useCallback(
    (e) => {
      if (enterInsertsNewline && COMPOSER_LINE_BREAK_INPUT_TYPES.has(e.inputType)) {
        e.preventDefault()
        insertNewlineAtCaret()
        return
      }
      requestAnimationFrame(() => readAndEmit())
    },
    [enterInsertsNewline, insertNewlineAtCaret, readAndEmit],
  )

  const handleInput = useCallback(() => {
    if (skipNextInputReadRef.current) {
      skipNextInputReadRef.current = false
      return
    }
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
      if (e.defaultPrevented) return
      if (enterInsertsNewline && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        insertNewlineAtCaret()
      }
    },
    [enterInsertsNewline, insertNewlineAtCaret, onKeyDown],
  )

  return (
    <div className="relative min-h-0 w-full">
      {!value && placeholder ? (
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
        onInput={handleInput}
        onBeforeInput={handleBeforeInput}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onKeyUp={onKeyUp}
        onMouseUp={onMouseUp}
        onBlur={onBlur}
        onFocus={onFocus}
        onCompositionStart={() => {
          composingRef.current = true
        }}
        onCompositionEnd={() => {
          composingRef.current = false
          readAndEmit()
        }}
        className={`w-full touch-manipulation whitespace-pre-wrap break-words px-0 text-left text-zinc-100 outline-none selection:bg-cyan-500/25 [-webkit-tap-highlight-color:transparent] ${preset.fieldClass} ${autoGrow ? 'overflow-hidden' : 'overflow-y-auto'} ${className}`}
      />
    </div>
  )
})

export default LoungeRichComposerField
