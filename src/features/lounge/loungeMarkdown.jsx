import { renderRichCaption } from './loungeCaption.jsx'

/**
 * Limited Markdown parser and renderer for Edge Lounge posts.
 * Safe, sanitized, theme-aware React elements (no innerHTML / XSS).
 *
 * Supported elements:
 * - Headings: # H1, ## H2, ### H3
 * - Dividers: --- or ***
 * - Blockquotes: > quote
 * - Unordered lists: - item or * item
 * - Ordered lists: 1. item
 * - Checklists / Tasks: - [ ] item or - [x] item
 * - Bold: **text** or __text__
 * - Italic: *text* or _text_
 * - Strikethrough: ~~text~~
 * - Highlight: ==text==
 * - Spoiler: ||text||
 * - Curated colors: [green]text[/green], [red]text[/red], [gold]text[/gold], [blue]text[/blue], [purple]text[/purple]
 * - Inline code: `code`
 * - Fenced code blocks: ```lang\ncode\n```
 * - Links, @mentions, #hashtags, and $cashtags (passed through renderRichCaption)
 */

export const LOUNGE_COLOR_TAGS = {
  green: {
    darkClass: 'text-emerald-400 font-semibold',
    lightClass: 'text-emerald-700 font-semibold',
    dataAttr: 'data-lounge-color-green',
  },
  red: {
    darkClass: 'text-rose-400 font-semibold',
    lightClass: 'text-rose-600 font-semibold',
    dataAttr: 'data-lounge-color-red',
  },
  gold: {
    darkClass: 'text-amber-300 font-semibold',
    lightClass: 'text-amber-700 font-semibold',
    dataAttr: 'data-lounge-color-gold',
  },
  blue: {
    darkClass: 'text-cyan-400 font-semibold',
    lightClass: 'text-blue-600 font-semibold',
    dataAttr: 'data-lounge-color-blue',
  },
  purple: {
    darkClass: 'text-purple-400 font-semibold',
    lightClass: 'text-purple-700 font-semibold',
    dataAttr: 'data-lounge-color-purple',
  },
}

/**
 * Parses inline markdown tokens (bold, italic, strikethrough, highlight, spoiler, colors, inline code)
 * and runs plain text portions through renderRichCaption.
 *
 * @param {string} text
 * @param {object} captionOpts Options passed down to renderRichCaption
 * @param {string} keyPrefix Unique key prefix for React elements
 * @returns {React.ReactNode[]}
 */
export function renderInlineMarkdown(text, captionOpts = {}, keyPrefix = 'im') {
  const str = String(text ?? '')
  if (!str) return []

  // Quick check: if no markdown characters exist, delegate directly to renderRichCaption
  if (!/[`*_~=\|\[]/.test(str)) {
    const rendered = renderRichCaption(str, captionOpts)
    return rendered ? (Array.isArray(rendered) ? rendered : [rendered]) : []
  }

  const nodes = []
  let k = 0

  // Regex matches:
  // 1. Inline code: `code`
  // 2. Bold: **text** or __text__
  // 3. Strikethrough: ~~text~~
  // 4. Highlight: ==text==
  // 5. Spoiler: ||text||
  // 6. Color tags: [(green|red|gold|blue|purple)]text[/\1]
  // 7. Italic: *text* or _text_
  const inlineRegex =
    /(`+)([\s\S]+?)\1|(\*\*|__)([\s\S]+?)\3|(~~)([\s\S]+?)\5|(==)([\s\S]+?)\7|(\|\|)([\s\S]+?)\9|\[(green|red|gold|blue|purple)\]([\s\S]+?)\[\/\11\]|(\*|_)([^\s*_](?:[\s\S]*?[^\s*_])?)\13/gi

  let lastIdx = 0
  let match

  while ((match = inlineRegex.exec(str)) !== null) {
    const matchIdx = match.index
    if (matchIdx > lastIdx) {
      const plain = str.slice(lastIdx, matchIdx)
      const plainNodes = renderRichCaption(plain, captionOpts)
      if (plainNodes) {
        if (Array.isArray(plainNodes)) nodes.push(...plainNodes)
        else nodes.push(plainNodes)
      }
    }

    if (match[1] && match[2] !== undefined) {
      // 1. Inline code
      nodes.push(
        <code
          key={`${keyPrefix}-code-${k++}`}
          data-lounge-inline-code=""
          className="rounded-md border border-zinc-700/60 bg-zinc-800/85 px-1.5 py-0.5 font-mono text-[13px] text-cyan-300 font-normal"
        >
          {match[2]}
        </code>
      )
    } else if (match[3] && match[4] !== undefined) {
      // 2. Bold
      const inner = renderInlineMarkdown(match[4], captionOpts, `${keyPrefix}-b-${k++}`)
      nodes.push(
        <strong key={`${keyPrefix}-bold-${k++}`} data-lounge-bold="" className="font-bold text-zinc-100">
          {inner}
        </strong>
      )
    } else if (match[5] && match[6] !== undefined) {
      // 3. Strikethrough
      const inner = renderInlineMarkdown(match[6], captionOpts, `${keyPrefix}-s-${k++}`)
      nodes.push(
        <del key={`${keyPrefix}-del-${k++}`} data-lounge-del="" className="line-through text-zinc-400">
          {inner}
        </del>
      )
    } else if (match[7] && match[8] !== undefined) {
      // 4. Highlight (==text==)
      const inner = renderInlineMarkdown(match[8], captionOpts, `${keyPrefix}-hl-${k++}`)
      nodes.push(
        <mark
          key={`${keyPrefix}-mark-${k++}`}
          data-lounge-highlight=""
          className="rounded px-1.5 py-0.5 font-medium bg-amber-500/20 text-amber-200 border-b border-amber-500/40"
        >
          {inner}
        </mark>
      )
    } else if (match[9] && match[10] !== undefined) {
      // 5. Spoiler (||text||)
      const inner = renderInlineMarkdown(match[10], captionOpts, `${keyPrefix}-sp-${k++}`)
      nodes.push(
        <span
          key={`${keyPrefix}-spoiler-${k++}`}
          data-lounge-spoiler=""
          className="cursor-pointer select-none rounded bg-zinc-800 text-transparent hover:bg-zinc-700 active:text-zinc-100 active:bg-zinc-800/90 transition-colors px-1 py-0.5"
          onClick={(e) => {
            const el = e.currentTarget
            el.classList.toggle('!text-zinc-100')
            el.classList.toggle('!bg-zinc-800/70')
          }}
          title="Click to reveal spoiler"
        >
          {inner}
        </span>
      )
    } else if (match[11] && match[12] !== undefined) {
      // 6. Curated Color Tag ([green]...[/green])
      const colorName = String(match[11]).toLowerCase()
      const colorDef = LOUNGE_COLOR_TAGS[colorName] || LOUNGE_COLOR_TAGS.gold
      const inner = renderInlineMarkdown(match[12], captionOpts, `${keyPrefix}-c-${colorName}-${k++}`)
      nodes.push(
        <span
          key={`${keyPrefix}-color-${k++}`}
          data-lounge-color-tag={colorName}
          className={colorDef.darkClass}
        >
          {inner}
        </span>
      )
    } else if (match[13] && match[14] !== undefined) {
      // 7. Italic
      const inner = renderInlineMarkdown(match[14], captionOpts, `${keyPrefix}-i-${k++}`)
      nodes.push(
        <em key={`${keyPrefix}-em-${k++}`} data-lounge-em="" className="italic text-zinc-200">
          {inner}
        </em>
      )
    }

    lastIdx = matchIdx + match[0].length
  }

  if (lastIdx < str.length) {
    const tail = str.slice(lastIdx)
    const tailNodes = renderRichCaption(tail, captionOpts)
    if (tailNodes) {
      if (Array.isArray(tailNodes)) nodes.push(...tailNodes)
      else nodes.push(tailNodes)
    }
  }

  return nodes
}

/**
 * Top-level Markdown renderer for Lounge posts and comments.
 *
 * @param {string} raw Raw caption text
 * @param {object} captionOpts Options passed to renderRichCaption
 * @returns {React.ReactNode}
 */
export function renderLoungeMarkdown(raw, captionOpts = {}) {
  const s = String(raw ?? '').trimEnd()
  if (!s) return null

  // Fast path: if the text has no newlines and no markdown special chars, pass straight to renderRichCaption
  if (!s.includes('\n') && !/[`*_~>=|#\-\[\]]/.test(s)) {
    return renderRichCaption(s, captionOpts)
  }

  const lines = s.split(/\r?\n/)
  const elements = []
  let elemKey = 0

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // 1. Fenced code block (```[lang])
    if (line.trimStart().startsWith('```')) {
      const codeLines = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      if (i < lines.length) i++ // consume closing ```
      elements.push(
        <pre
          key={`lmd-codeblock-${elemKey++}`}
          data-lounge-code-block=""
          className="my-2 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950/90 p-3 font-mono text-[13px] leading-relaxed text-cyan-300"
        >
          <code>{codeLines.join('\n')}</code>
        </pre>
      )
      continue
    }

    // 2. Horizontal Divider (--- or *** or ___)
    if (/^\s*([*\-_])(\s*\1){2,}\s*$/.test(line)) {
      elements.push(
        <hr
          key={`lmd-hr-${elemKey++}`}
          data-lounge-hr=""
          className="my-3 border-0 h-px bg-gradient-to-r from-transparent via-zinc-700 to-transparent"
        />
      )
      i++
      continue
    }

    // 3. Headings (# H1, ## H2, ### H3)
    const headingMatch = line.match(/^\s*(#{1,3})\s+(.*)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const headingText = headingMatch[2]
      if (level === 1) {
        elements.push(
          <h2
            key={`lmd-h1-${elemKey++}`}
            data-lounge-h1=""
            className="my-2 text-[18px] sm:text-[20px] font-black tracking-tight text-white"
          >
            {renderInlineMarkdown(headingText, captionOpts, `lmd-h1-${elemKey}`)}
          </h2>
        )
      } else if (level === 2) {
        elements.push(
          <h3
            key={`lmd-h2-${elemKey++}`}
            data-lounge-h2=""
            className="my-1.5 text-[16px] sm:text-[17px] font-bold tracking-tight text-zinc-100"
          >
            {renderInlineMarkdown(headingText, captionOpts, `lmd-h2-${elemKey}`)}
          </h3>
        )
      } else {
        elements.push(
          <h4
            key={`lmd-h3-${elemKey++}`}
            data-lounge-h3=""
            className="my-1 text-[14px] sm:text-[15px] font-bold text-zinc-200"
          >
            {renderInlineMarkdown(headingText, captionOpts, `lmd-h3-${elemKey}`)}
          </h4>
        )
      }
      i++
      continue
    }

    // 4. Blockquote (> quote)
    if (line.startsWith('>')) {
      const quoteLines = []
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      const quoteContent = quoteLines.map((ql, qIdx) => (
        <span key={`qline-${qIdx}`} className="block">
          {renderInlineMarkdown(ql, captionOpts, `lmd-q-${elemKey}-${qIdx}`)}
        </span>
      ))
      elements.push(
        <blockquote
          key={`lmd-quote-${elemKey++}`}
          data-lounge-blockquote=""
          className="my-2 border-l-4 border-amber-500/70 bg-amber-950/10 py-1 pl-3.5 pr-2 rounded-r-lg text-zinc-300 italic"
        >
          {quoteContent}
        </blockquote>
      )
      continue
    }

    // 5. Unordered list (- item or * item)
    if (/^\s*[-*]\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*[-*]\s+/, '')
        items.push(itemText)
        i++
      }
      if (items.length > 0) {
        elements.push(
          <ul
            key={`lmd-ul-${elemKey++}`}
            data-lounge-ul=""
            className="my-2 list-disc space-y-1 pl-5 text-zinc-200 marker:text-amber-400"
          >
            {items.map((it, idx) => (
              <li key={`li-${idx}`} className="leading-snug">
                {renderInlineMarkdown(it, captionOpts, `lmd-ul-item-${elemKey}-${idx}`)}
              </li>
            ))}
          </ul>
        )
        continue
      }
    }

    // 7. Ordered list (1. item)
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*\d+\.\s+/, '')
        items.push(itemText)
        i++
      }
      elements.push(
        <ol
          key={`lmd-ol-${elemKey++}`}
          data-lounge-ol=""
          className="my-2 list-decimal space-y-1 pl-5 text-zinc-200 marker:font-semibold marker:text-amber-400"
        >
          {items.map((it, idx) => (
            <li key={`li-${idx}`} className="leading-snug">
              {renderInlineMarkdown(it, captionOpts, `lmd-ol-item-${elemKey}-${idx}`)}
            </li>
          ))}
        </ol>
      )
      continue
    }

    // 8. Standard paragraph / single line
    if (!line.trim()) {
      // Empty line - spacer
      elements.push(<div key={`lmd-spacer-${elemKey++}`} className="h-2" aria-hidden />)
      i++
      continue
    }

    // Non-empty line
    elements.push(
      <span key={`lmd-p-${elemKey++}`} className="block leading-relaxed">
        {renderInlineMarkdown(line, captionOpts, `lmd-line-${elemKey}`)}
      </span>
    )
    i++
  }

  return elements.length === 1 ? elements[0] : <div className="space-y-0.5">{elements}</div>
}
