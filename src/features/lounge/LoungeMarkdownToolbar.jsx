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
    // Inline wrap
    const content = selected || defaultText
    const wrapped = `${prefix}${content}${suffix}`
    nextVal = val.slice(0, start) + wrapped + val.slice(end)
    nextStart = start + prefix.length
    nextEnd = nextStart + content.length
  }

  onUpdate(nextVal)

  // Restore cursor and focus
  requestAnimationFrame(() => {
    textarea.focus()
    textarea.setSelectionRange(nextStart, nextEnd)
  })
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

  return (
    <div
      data-lounge-markdown-toolbar=""
      className={`flex flex-wrap items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-950/80 p-1 backdrop-blur-sm ${className}`}
    >
      <button
        type="button"
        onClick={() => handleFormat({ prefix: '**', suffix: '**', defaultText: 'bold text' })}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[13px] font-black text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95 touch-manipulation"
        title="Bold (**text**)"
        aria-label="Bold"
      >
        <span className="font-extrabold">B</span>
      </button>

      <button
        type="button"
        onClick={() => handleFormat({ prefix: '*', suffix: '*', defaultText: 'italic text' })}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[13px] italic font-serif text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95 touch-manipulation"
        title="Italic (*text*)"
        aria-label="Italic"
      >
        <span>I</span>
      </button>

      <button
        type="button"
        onClick={() => handleFormat({ prefix: '~~', suffix: '~~', defaultText: 'strikethrough' })}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[13px] font-bold text-zinc-200 line-through transition-colors hover:bg-zinc-800 hover:text-white active:scale-95 touch-manipulation"
        title="Strikethrough (~~text~~)"
        aria-label="Strikethrough"
      >
        <span>S</span>
      </button>

      <div className="mx-0.5 h-4 w-px bg-zinc-800" role="presentation" aria-hidden />

      <button
        type="button"
        onClick={() => handleFormat({ prefix: '`', suffix: '`', defaultText: 'code' })}
        className="flex h-8 px-2 items-center justify-center rounded-lg font-mono text-[11px] font-semibold text-cyan-400 transition-colors hover:bg-zinc-800 hover:text-cyan-300 active:scale-95 touch-manipulation"
        title="Inline Code (`code`)"
        aria-label="Inline Code"
      >
        <span>&lt;/&gt;</span>
      </button>

      <button
        type="button"
        onClick={() => handleFormat({ prefix: '```', suffix: '```', defaultText: 'code block', mode: 'block' })}
        className="flex h-8 px-2 items-center justify-center rounded-lg font-mono text-[10px] font-semibold text-cyan-400 transition-colors hover:bg-zinc-800 hover:text-cyan-300 active:scale-95 touch-manipulation"
        title="Code Block (```code```)"
        aria-label="Code Block"
      >
        <span>{'{ }'}</span>
      </button>

      <div className="mx-0.5 h-4 w-px bg-zinc-800" role="presentation" aria-hidden />

      <button
        type="button"
        onClick={() => handleFormat({ prefix: '> ', defaultText: 'quote', mode: 'linePrefix' })}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[14px] font-serif text-amber-400 transition-colors hover:bg-zinc-800 hover:text-amber-300 active:scale-95 touch-manipulation"
        title="Blockquote (> quote)"
        aria-label="Blockquote"
      >
        <span>&ldquo;</span>
      </button>

      <button
        type="button"
        onClick={() => handleFormat({ prefix: '- ', defaultText: 'item', mode: 'linePrefix' })}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[14px] text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95 touch-manipulation"
        title="Bulleted List (- item)"
        aria-label="Bulleted List"
      >
        <span>&bull;</span>
      </button>

      <button
        type="button"
        onClick={() => handleFormat({ prefix: '1. ', defaultText: 'item', mode: 'linePrefix' })}
        className="flex h-8 px-1.5 items-center justify-center rounded-lg font-mono text-[11px] font-bold text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95 touch-manipulation"
        title="Numbered List (1. item)"
        aria-label="Numbered List"
      >
        <span>1.</span>
      </button>

      {!isEdgePro ? (
        <button
          type="button"
          onClick={onUpgradeClick}
          className="ml-auto inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-400 ring-1 ring-amber-500/40 hover:brightness-110 active:scale-95 touch-manipulation"
        >
          <span>PRO</span>
        </button>
      ) : null}
    </div>
  )
}
