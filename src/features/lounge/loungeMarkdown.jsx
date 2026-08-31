import { renderRichCaption } from './loungeCaption.jsx'

/**
 * Limited Markdown parser and renderer for Edge Lounge posts.
 * Safe, sanitized, theme-aware React elements (no innerHTML / XSS).
 *
 * Supported elements:
 * - Fenced code blocks: ```lang\ncode\n```
 * - Blockquotes: > quote
 * - Unordered lists: - item or * item
 * - Ordered lists: 1. item
 * - Bold: **text** or __text__
 * - Italic: *text* or _text_
 * - Strikethrough: ~~text~~
 * - Inline code: `code`
 * - Links, @mentions, #hashtags, and $cashtags (passed through renderRichCaption)
 */

/**
 * Parses inline markdown tokens (bold, italic, strikethrough, inline code)
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
  if (!/[`*_~]/.test(str)) {
    const rendered = renderRichCaption(str, captionOpts)
    return rendered ? (Array.isArray(rendered) ? rendered : [rendered]) : []
  }

  const nodes = []
  let k = 0

  // Regex matches:
  // 1. Inline code: `code`
  // 2. Bold: **text** or __text__
  // 3. Strikethrough: ~~text~~
  // 4. Italic: *text* or _text_
  const inlineRegex = /(`+)([\s\S]+?)\1|(\*\*|__)([\s\S]+?)\3|(~~)([\s\S]+?)\5|(\*|_)([^\s*_](?:[\s\S]*?[^\s*_])?)\7/g

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
      // Inline code
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
      // Bold
      const inner = renderInlineMarkdown(match[4], captionOpts, `${keyPrefix}-b-${k++}`)
      nodes.push(
        <strong key={`${keyPrefix}-bold-${k++}`} data-lounge-bold="" className="font-bold text-zinc-100">
          {inner}
        </strong>
      )
    } else if (match[5] && match[6] !== undefined) {
      // Strikethrough
      const inner = renderInlineMarkdown(match[6], captionOpts, `${keyPrefix}-s-${k++}`)
      nodes.push(
        <del key={`${keyPrefix}-del-${k++}`} data-lounge-del="" className="line-through text-zinc-400">
          {inner}
        </del>
      )
    } else if (match[7] && match[8] !== undefined) {
      // Italic
      const inner = renderInlineMarkdown(match[8], captionOpts, `${keyPrefix}-i-${k++}`)
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
  if (!s.includes('\n') && !/[`*_~>]/.test(s)) {
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

    // 2. Blockquote (> quote)
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

    // 3. Unordered list (- item or * item)
    if (/^\s*[-*]\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*[-*]\s+/, '')
        items.push(itemText)
        i++
      }
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

    // 4. Ordered list (1. item)
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

    // 5. Standard paragraph / single line
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

  return elements.length === 1 ? elements[0] : elements
}
