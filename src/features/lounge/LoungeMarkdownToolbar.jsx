import { useCallback, useState } from 'react'

/**
 * Helper to wrap or insert markdown formatting at the current selection in a textarea.
 *
 * @param {HTMLTextAreaElement | null} textarea
 * @param {object} options
 * @param {string} options.prefix Prefix before selected text (e.g. '**')
 * @param {string} options.suffix Suffix after selected text (e.g. '**')
 * @param {string} [options.defaultText] Placeholder if no text is selected (only highlighted for inline/block pairs)
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
    // Prefix at cursor or line start: simply insert character and place cursor immediately after
    if (start === end && !selected) {
      nextVal = val.slice(0, start) + prefix + val.slice(end)
      nextStart = start + prefix.length
      nextEnd = nextStart
    } else {
      const beforeSelection = val.slice(0, start)
      const afterSelection = val.slice(end)

      const lastNewlineBefore = beforeSelection.lastIndexOf('\n')
      const lineStart = lastNewlineBefore === -1 ? 0 : lastNewlineBefore + 1

      const textToModify = val.slice(lineStart, end)
      const lines = textToModify.split('\n')
      const modifiedLines = lines.map((l) => `${prefix}${l}`)
      const joined = modifiedLines.join('\n')

      nextVal = val.slice(0, lineStart) + joined + afterSelection
      nextStart = lineStart + joined.length
      nextEnd = nextStart
    }
  } else if (mode === 'block') {
    // Code block: highlights inner text
    const content = selected || defaultText
    const block = `\n${prefix}\n${content}\n${suffix}\n`
    nextVal = val.slice(0, start) + block + val.slice(end)
    nextStart = start + prefix.length + 2
    nextEnd = nextStart + content.length
  } else {
    // Inline wrap (bold, italic, strike, code, highlight, spoiler, colors): highlights the inner text between prefix and suffix
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
  const [colorPickerOpen, setColorPickerOpen] = useState(false)

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
    'flex h-9 min-w-[2.1rem] sm:h-10 sm:min-w-[2.4rem] items-center justify-center rounded-xl px-2 sm:px-2.5 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95 touch-manipulation'

  return (
    <div
      data-lounge-markdown-toolbar=""
      className={`relative flex flex-wrap items-center gap-1 rounded-2xl border border-zinc-800/90 bg-zinc-950/90 p-1.5 backdrop-blur-md ${className}`}
    >
      {/* ── Heading ── */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '## ', mode: 'linePrefix' })}
        className={`${btnClass} text-[14px] sm:text-[15px] font-black text-zinc-200`}
        title="Heading (## Title)"
        aria-label="Heading"
      >
        <span>H</span>
      </button>

      {/* ── Bold ── */}
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

      {/* ── Italic ── */}
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

      {/* ── Strikethrough ── */}
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

      {/* ── Highlight ── */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '==', suffix: '==', defaultText: 'highlighted' })}
        className={`${btnClass} text-[13px] sm:text-[14px] font-bold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20`}
        title="Highlight (==text==)"
        aria-label="Highlight"
      >
        <span>HL</span>
      </button>

      {/* ── Curated Colors Dropdown Button ── */}
      <div className="relative">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setColorPickerOpen((prev) => !prev)}
          className={`${btnClass} flex items-center gap-0.5 text-[13px] font-bold text-emerald-400 hover:text-emerald-300`}
          title="Text Colors"
          aria-label="Text Colors"
        >
          <span className="flex h-3 w-3 rounded-full bg-gradient-to-tr from-emerald-400 via-amber-300 to-cyan-400" />
        </button>

        {colorPickerOpen ? (
          <div
            className="absolute left-0 top-full z-50 mt-1 flex items-center gap-1 rounded-xl border border-zinc-700 bg-zinc-900/95 p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
            onMouseDown={(e) => e.preventDefault()}
          >
            <button
              type="button"
              onClick={() => {
                setColorPickerOpen(false)
                handleFormat({ prefix: '[green]', suffix: '[/green]', defaultText: 'green text' })
              }}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400"
              title="Green text"
            >
              <span className="h-3 w-3 rounded-full bg-emerald-400" />
            </button>
            <button
              type="button"
              onClick={() => {
                setColorPickerOpen(false)
                handleFormat({ prefix: '[red]', suffix: '[/red]', defaultText: 'red text' })
              }}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/20 hover:bg-rose-500/40 text-rose-400"
              title="Red text"
            >
              <span className="h-3 w-3 rounded-full bg-rose-400" />
            </button>
            <button
              type="button"
              onClick={() => {
                setColorPickerOpen(false)
                handleFormat({ prefix: '[gold]', suffix: '[/gold]', defaultText: 'gold text' })
              }}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/20 hover:bg-amber-500/40 text-amber-300"
              title="Gold text"
            >
              <span className="h-3 w-3 rounded-full bg-amber-300" />
            </button>
            <button
              type="button"
              onClick={() => {
                setColorPickerOpen(false)
                handleFormat({ prefix: '[blue]', suffix: '[/blue]', defaultText: 'blue text' })
              }}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-400"
              title="Blue text"
            >
              <span className="h-3 w-3 rounded-full bg-cyan-400" />
            </button>
            <button
              type="button"
              onClick={() => {
                setColorPickerOpen(false)
                handleFormat({ prefix: '[purple]', suffix: '[/purple]', defaultText: 'purple text' })
              }}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/20 hover:bg-purple-500/40 text-purple-400"
              title="Purple text"
            >
              <span className="h-3 w-3 rounded-full bg-purple-400" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="mx-0.5 h-5 w-px bg-zinc-800" role="presentation" aria-hidden />

      {/* ── Inline Code ── */}
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

      {/* ── Blockquote ── */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '> ', mode: 'linePrefix' })}
        className={`${btnClass} text-[18px] sm:text-[19px] font-serif text-amber-400 hover:text-amber-300`}
        title="Blockquote (> quote)"
        aria-label="Blockquote"
      >
        <span>&ldquo;</span>
      </button>

      {/* ── Bulleted List ── */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '- ', mode: 'linePrefix' })}
        className={`${btnClass} text-[18px] sm:text-[19px] text-zinc-200`}
        title="Bulleted List (- item)"
        aria-label="Bulleted List"
      >
        <span>&bull;</span>
      </button>

      {/* ── Numbered List ── */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '1. ', mode: 'linePrefix' })}
        className={`${btnClass} font-mono text-[13px] sm:text-[14px] font-bold text-zinc-200`}
        title="Numbered List (1. item)"
        aria-label="Numbered List"
      >
        <span>1.</span>
      </button>

      {/* ── Spoiler ── */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '||', suffix: '||', defaultText: 'spoiler' })}
        className={`${btnClass} font-mono text-[12px] sm:text-[13px] font-semibold text-zinc-400 hover:text-zinc-200`}
        title="Spoiler (||text||)"
        aria-label="Spoiler"
      >
        <span>|| ||</span>
      </button>

      {/* ── Divider ── */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '\n---\n', mode: 'linePrefix' })}
        className={`${btnClass} font-mono text-[13px] text-zinc-400 hover:text-zinc-200`}
        title="Divider Line (---)"
        aria-label="Divider Line"
      >
        <span>&mdash;</span>
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
