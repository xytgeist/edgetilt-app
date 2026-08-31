import { useCallback, useState } from 'react'
import {
  Bold,
  Italic,
  Strikethrough,
  Highlighter,
  Palette,
  Quote,
  List,
  ListOrdered,
  Code,
  SquareCode,
  EyeOff,
  Minus,
} from 'lucide-react'

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
    // Prefix at cursor or line start: insert character and place cursor immediately after
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
  const [headingPickerOpen, setHeadingPickerOpen] = useState(false)
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
    'flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95 touch-manipulation'

  return (
    <div
      data-lounge-markdown-toolbar=""
      className={`relative z-20 flex w-full max-w-full items-center gap-0.5 sm:gap-1 rounded-2xl border border-zinc-800/90 bg-zinc-950/90 px-2 py-1.5 backdrop-blur-md ${className}`}
    >
      {/* ── Heading Dropdown (H1 / H2 / H3) ── */}
      <div className="relative shrink-0">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setColorPickerOpen(false)
            setHeadingPickerOpen((prev) => !prev)
          }}
          className={`${btnClass} font-black text-sm`}
          title="Headings (H1, H2, H3)"
          aria-label="Headings"
        >
          <span>H</span>
        </button>

        {headingPickerOpen ? (
          <div
            data-lounge-heading-picker-dropdown=""
            className="absolute left-0 top-full z-50 mt-1.5 flex items-center gap-1 rounded-xl border border-zinc-700 bg-zinc-900/95 p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
            onMouseDown={(e) => e.preventDefault()}
          >
            <button
              type="button"
              onClick={() => {
                setHeadingPickerOpen(false)
                handleFormat({ prefix: '# ', mode: 'linePrefix' })
              }}
              className="flex h-8 px-2.5 items-center justify-center rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-xs font-black text-white transition-colors"
              title="Heading 1 (# Title)"
            >
              H1
            </button>
            <button
              type="button"
              onClick={() => {
                setHeadingPickerOpen(false)
                handleFormat({ prefix: '## ', mode: 'linePrefix' })
              }}
              className="flex h-8 px-2.5 items-center justify-center rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-xs font-bold text-zinc-200 transition-colors"
              title="Heading 2 (## Section)"
            >
              H2
            </button>
            <button
              type="button"
              onClick={() => {
                setHeadingPickerOpen(false)
                handleFormat({ prefix: '### ', mode: 'linePrefix' })
              }}
              className="flex h-8 px-2.5 items-center justify-center rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 transition-colors"
              title="Heading 3 (### Subhead)"
            >
              H3
            </button>
          </div>
        ) : null}
      </div>

      <div className="mx-0.5 h-4 w-px shrink-0 bg-zinc-800" role="presentation" aria-hidden />

      {/* ── Bold ── */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '**', suffix: '**', defaultText: 'bold text' })}
        className={btnClass}
        title="Bold (**text**)"
        aria-label="Bold"
      >
        <Bold className="h-4 w-4" />
      </button>

      {/* ── Italic ── */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '*', suffix: '*', defaultText: 'italic text' })}
        className={btnClass}
        title="Italic (*text*)"
        aria-label="Italic"
      >
        <Italic className="h-4 w-4" />
      </button>

      {/* ── Strikethrough ── */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '~~', suffix: '~~', defaultText: 'strikethrough' })}
        className={btnClass}
        title="Strikethrough (~~text~~)"
        aria-label="Strikethrough"
      >
        <Strikethrough className="h-4 w-4" />
      </button>

      {/* ── Highlight ── */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '==', suffix: '==', defaultText: 'highlighted' })}
        className={`${btnClass} text-amber-400 hover:text-amber-300`}
        title="Highlight (==text==)"
        aria-label="Highlight"
      >
        <Highlighter className="h-4 w-4" />
      </button>

      {/* ── Curated Colors Dropdown Button ── */}
      <div className="relative shrink-0">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setHeadingPickerOpen(false)
            setColorPickerOpen((prev) => !prev)
          }}
          className={`${btnClass} text-emerald-400 hover:text-emerald-300`}
          title="Text Colors"
          aria-label="Text Colors"
        >
          <Palette className="h-4 w-4" />
        </button>

        {colorPickerOpen ? (
          <div
            data-lounge-color-picker-dropdown=""
            className="absolute left-0 top-full z-50 mt-1.5 flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900/95 p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
            onMouseDown={(e) => e.preventDefault()}
          >
            <button
              type="button"
              onClick={() => {
                setColorPickerOpen(false)
                handleFormat({ prefix: '[green]', suffix: '[/green]', defaultText: 'green text' })
              }}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 transition-colors"
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
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/20 hover:bg-rose-500/40 text-rose-400 transition-colors"
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
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 transition-colors"
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
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-400 transition-colors"
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
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/20 hover:bg-purple-500/40 text-purple-400 transition-colors"
              title="Purple text"
            >
              <span className="h-3 w-3 rounded-full bg-purple-400" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="mx-0.5 h-4 w-px shrink-0 bg-zinc-800" role="presentation" aria-hidden />

      {/* ── Bulleted List ── */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '- ', mode: 'linePrefix' })}
        className={btnClass}
        title="Bulleted List (- item)"
        aria-label="Bulleted List"
      >
        <List className="h-4 w-4" />
      </button>

      {/* ── Numbered List ── */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '1. ', mode: 'linePrefix' })}
        className={btnClass}
        title="Numbered List (1. item)"
        aria-label="Numbered List"
      >
        <ListOrdered className="h-4 w-4" />
      </button>

      {/* ── Blockquote ── */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '> ', mode: 'linePrefix' })}
        className={`${btnClass} text-amber-400 hover:text-amber-300`}
        title="Blockquote (> quote)"
        aria-label="Blockquote"
      >
        <Quote className="h-4 w-4" />
      </button>

      <div className="mx-0.5 h-4 w-px shrink-0 bg-zinc-800" role="presentation" aria-hidden />

      {/* ── Inline Code ── */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '`', suffix: '`', defaultText: 'code' })}
        className={`${btnClass} text-cyan-400 hover:text-cyan-300`}
        title="Inline Code (`code`)"
        aria-label="Inline Code"
      >
        <Code className="h-4 w-4" />
      </button>

      {/* ── Code Block ── */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '```', suffix: '```', defaultText: 'code block', mode: 'block' })}
        className={`${btnClass} text-cyan-400 hover:text-cyan-300`}
        title="Code Block (```block```)"
        aria-label="Code Block"
      >
        <SquareCode className="h-4 w-4" />
      </button>

      {/* ── Spoiler ── */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '||', suffix: '||', defaultText: 'spoiler' })}
        className={`${btnClass} text-zinc-400 hover:text-zinc-200`}
        title="Spoiler (||text||)"
        aria-label="Spoiler"
      >
        <EyeOff className="h-4 w-4" />
      </button>

      {/* ── Divider ── */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleFormat({ prefix: '\n---\n', mode: 'linePrefix' })}
        className={`${btnClass} text-zinc-400 hover:text-zinc-200`}
        title="Divider Line (---)"
        aria-label="Divider Line"
      >
        <Minus className="h-4 w-4" />
      </button>

      {!isEdgePro ? (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onUpgradeClick}
          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-amber-400 ring-1 ring-amber-500/40 hover:brightness-110 active:scale-95 touch-manipulation"
        >
          <span>PRO</span>
        </button>
      ) : null}
    </div>
  )
}
