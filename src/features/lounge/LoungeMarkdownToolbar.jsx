import { useCallback } from 'react'

/**
 * Helper to wrap or insert markdown formatting at the current selection in a textarea.
 *
 * @param {HTMLTextAreaElement | null} textarea
 * @param {object} options
 * @param {string} options.prefix Prefix before selected text (e.g. '**')
 * @param {string} options.suffix Suffix after selected text (e.g. '**')
 * @param {string} options.defaultText Placeholder if no text is selected (e.g. 'bold text')
 * @param {'inline' | 'linePrefix' | 'block'} [options.mode='inline']
 * @param {(nextText: string) => void} onUpdate Callback when text changes
 */
export function applyMarkdownFormatting(textarea, { prefix, suffix = '', defaultText = '', mode = 'inline' }, onUpdate) {
  if (!textarea) return

  const start = textarea.selectionStart ?? 0
  const end = textarea.selectionEnd ?? 0
  const val = textarea.value || ''
  const selected = val.slice(start, end)

  let nextVal = ''
  let nextStart = start
  let nextEnd = end

  if (mode === 'linePrefix') {
    // Prefix each line in the selection
    const beforeSelection = val.slice(0, start)
    const afterSelection = val.slice(end)

    // Find the start of the first line in the selection
    const lastNewlineBefore = beforeSelection.lastIndexOf('\n')
    const lineStart = lastNewlineBefore === -1 ? 0 : lastNewlineBefore + 1

    const textToModify = val.slice(lineStart, end)
    const lines = textToModify.split('\n')
    const modifiedLines = lines.map((l) => `${prefix}${l}`)
    const joined = modifiedLines.join('\n')

    nextVal = val.slice(0, lineStart) + joined + afterSelection
    nextStart = lineStart
    nextEnd = lineStart + joined.length
  } else if (mode === 'block') {
    const content = selected || defaultText
    const block = `\n${prefix}\n${content}\n${suffix}\n`
    nextVal = val.slice(0, start) + block + val.slice(end)
    nextStart = start + prefix.length + 2
    nextEnd = nextStart + content.length
  } else {
    // Inline wrap: selects the inner text between prefix and suffix
    const content = selected || defaultText
    const wrapped = `${prefix}${content}${suffix}`
    nextVal = val.slice(0, start) + wrapped + val.slice(end)
    nextStart = start + prefix.length
    nextEnd = nextStart + content.length
  }

  // Update DOM directly and focus/select immediately
  textarea.value = nextVal
  textarea.focus()
  if (typeof textarea.setSelectionRange === 'function') {
    textarea.setSelectionRange(nextStart, nextEnd)
  }

  onUpdate?.(nextVal)

  // Re-assert selection range across next tick in case React controlled re-render adjusts it
  const preserveSelection = () => {
    if (textarea) {
      textarea.focus()
      if (typeof textarea.setSelectionRange === 'function') {
        textarea.setSelectionRange(nextStart, nextEnd)
      }
    }
  }
  requestAnimationFrame(preserveSelection)
  setTimeout(preserveSelection, 0)
  setTimeout(preserveSelection, 40)
}

/**
 * Markdown formatting toolbar for the Full-Screen Pro Composer.
 *
 * @param {{
 *   textareaRef: React.RefObject<HTMLTextAreaElement>,
 *   onTextChange: (text: string) => void,
 *   isEdgePro?: boolean,
 *   onUpgradeClick?: () => void,
 *   className?: string,
 * }} props
 */
export default function LoungeMarkdownToolbar({
  textareaRef,
  onTextChange,
  isEdgePro = true,
  onUpgradeClick,
  className = '',
}) {
  const handleFormat = useCallback(
    (opts) => {
      if (!isEdgePro) {
        onUpgradeClick?.()
        return
      }
      applyMarkdownFormatting(textareaRef?.current, opts, onTextChange)
    },
    [isEdgePro, onTextChange, onUpgradeClick, textareaRef],
  )

  const btnClass =
    'flex h-9 min-w-[2.25rem] sm:h-10 sm:min-w-[2.5rem] items-center justify-center rounded-xl px-2 sm:px-2.5 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95 touch-manipulation'

  return (
    <div
      data-lounge-markdown-toolbar=""
      className={`flex flex-wrap items-center gap-1.5 rounded-2xl border border-zinc-800/90 bg-zinc-950/90 p-1.5 backdrop-blur-md ${className}`}
    >
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '**', suffix: '**', defaultText: 'bold text' })}
        className={`${btnClass} text-[15px] sm:text-[16px] font-black text-zinc-200`}
        title="Bold (**text**)"
        aria-label="Bold"
      >
        <span className="font-extrabold">B</span>
      </button>

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '*', suffix: '*', defaultText: 'italic text' })}
        className={`${btnClass} text-[15px] sm:text-[16px] italic font-serif text-zinc-200`}
        title="Italic (*text*)"
        aria-label="Italic"
      >
        <span>I</span>
      </button>

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '~~', suffix: '~~', defaultText: 'strikethrough' })}
        className={`${btnClass} text-[15px] sm:text-[16px] font-bold text-zinc-200 line-through`}
        title="Strikethrough (~~text~~)"
        aria-label="Strikethrough"
      >
        <span>S</span>
      </button>

      <div className="mx-0.5 h-5 w-px bg-zinc-800" role="presentation" aria-hidden />

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '`', suffix: '`', defaultText: 'code' })}
        className={`${btnClass} font-mono text-[13px] sm:text-[14px] font-semibold text-cyan-400 hover:text-cyan-300`}
        title="Inline Code (`code`)"
        aria-label="Inline Code"
      >
        <span>&lt;/&gt;</span>
      </button>

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '```', suffix: '```', defaultText: 'code block', mode: 'block' })}
        className={`${btnClass} font-mono text-[13px] sm:text-[14px] font-semibold text-cyan-400 hover:text-cyan-300`}
        title="Code Block (```code```)"
        aria-label="Code Block"
      >
        <span>{'{ }'}</span>
      </button>

      <div className="mx-0.5 h-5 w-px bg-zinc-800" role="presentation" aria-hidden />

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '> ', defaultText: 'quote', mode: 'linePrefix' })}
        className={`${btnClass} text-[18px] sm:text-[19px] font-serif text-amber-400 hover:text-amber-300`}
        title="Blockquote (> quote)"
        aria-label="Blockquote"
      >
        <span>&ldquo;</span>
      </button>

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '- ', defaultText: 'item', mode: 'linePrefix' })}
        className={`${btnClass} text-[18px] sm:text-[19px] text-zinc-200`}
        title="Bulleted List (- item)"
        aria-label="Bulleted List"
      >
        <span>&bull;</span>
      </button>

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '1. ', defaultText: 'item', mode: 'linePrefix' })}
        className={`${btnClass} font-mono text-[13px] sm:text-[14px] font-bold text-zinc-200`}
        title="Numbered List (1. item)"
        aria-label="Numbered List"
      >
        <span>1.</span>
      </button>

      {!isEdgePro ? (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onUpgradeClick}
          className="ml-auto inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-amber-400 ring-1 ring-amber-500/40 hover:brightness-110 active:scale-95 touch-manipulation"
        >
          <span>PRO</span>
        </button>
      ) : null}
    </div>
  )
}
