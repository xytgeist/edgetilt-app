import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import {
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
  const composingRef = useRef(false)
  const onInputRef = useRef(onInput)
  onInputRef.current = onInput
  const preset = LOUNGE_RICH_COMPOSER_VARIANTS[variant] || LOUNGE_RICH_COMPOSER_VARIANTS.feed

  useImperativeHandle(ref, () => rootRef.current, [])

  /** Notify mention layer - sync first (pre-DOM rewrite), rAF backup for late Android selection. */
  const notifyComposerInput = useCallback((el, text, caret, { sync = false } = {}) => {
    const payload = { target: el, text, caret }
    if (sync) onInputRef.current?.(payload)
    requestAnimationFrame(() => {
      onInputRef.current?.(payload)
      requestAnimationFrame(() => {
        if (!el?.isConnected) return
        onInputRef.current?.({
          target: el,
          text: plainTextFromComposerRoot(el),
          caret: getCaretTextOffset(el),
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
    notifyComposerInput(el, capped, nextCaret, { sync: true })
    syncComposerHtml(el, capped, nextCaret)
    if (capped !== value) onChange?.(capped)
  }, [maxLength, notifyComposerInput, onChange, value])

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el || composingRef.current) return
    if (plainTextFromComposerRoot(el) === value) {
      lastValueRef.current = value
      return
    }
    lastValueRef.current = value
    const caret =
      document.activeElement === el
        ? Math.min(getCaretTextOffset(el), value.length)
        : value.length
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
      notifyComposerInput(root, plainTextFromComposerRoot(root), getCaretTextOffset(root))
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [disabled, notifyComposerInput])

  const handleBeforeInput = useCallback(() => {
    // Android defers selection updates; a follow-up read after the edit lands helps mentions.
    requestAnimationFrame(() => readAndEmit())
  }, [readAndEmit])

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
      if (e.defaultPrevented) return
      if (enterInsertsNewline && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        insertPlainTextAtSelection(rootRef.current, '\n')
        readAndEmit()
      }
    },
    [enterInsertsNewline, onKeyDown, readAndEmit],
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
