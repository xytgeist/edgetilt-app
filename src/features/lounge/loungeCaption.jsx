import { appendHighlightedPlainText, loungeSearchHighlightTerms } from '../../utils/loungeSearchHighlight.jsx'
import { splitTextWithLinks } from '../../utils/linkifyText.jsx'
import { LOUNGE_CAPTION_DISPLAY_MAX, LOUNGE_CAPTION_DISPLAY_MAX_LINES } from '../../utils/loungeCommentLimits.js'
import { marketCashtagColorClass } from '../../utils/loungeMarketCaptionParse.js'

/** @returns {{ text: string, isTruncated: boolean }} */
export function truncateCaptionForDisplay(
  raw,
  maxLen = LOUNGE_CAPTION_DISPLAY_MAX,
  maxLines = LOUNGE_CAPTION_DISPLAY_MAX_LINES,
) {
  const s = String(raw ?? '')
  const max = Math.max(1, maxLen)
  const lineCap = Math.max(1, maxLines)

  let text = s
  let isTruncated = false

  const lines = s.split(/\r?\n/)
  if (lines.length > lineCap) {
    text = lines.slice(0, lineCap).join('\n').trimEnd()
    isTruncated = true
  }

  if (text.length <= max) {
    return { text, isTruncated }
  }

  let cut = max
  const slice = text.slice(0, max)
  const lastSpace = slice.lastIndexOf(' ')
  const lastNewline = slice.lastIndexOf('\n')
  const breakAt = Math.max(lastSpace, lastNewline)
  if (breakAt > max * 0.6) cut = breakAt
  return { text: text.slice(0, cut).trimEnd(), isTruncated: true }
}

/** Strip trailing punctuation often pasted after URLs in prose. */
export function trimUrlTrail(url) {
  let u = String(url)
  while (u.length > 0 && /[),.;:!?\]'"]+$/u.test(u)) {
    u = u.slice(0, -1)
  }
  return u
}

/** @deprecated Prefer splitTextWithLinks - kept for any external imports. */
export function hrefForUrlDisplay(display) {
  const d = String(display).trim()
  if (!d) return ''
  if (/^https?:\/\//iu.test(d)) return d
  if (/^www\./iu.test(d)) return `https://${d}`
  if (/\./.test(d)) return `https://${d}`
  return ''
}

/**
 * Lounge caption: `http(s)://…` and `www.…` links (opens new tab), Unicode `#tags`, and `@handles`.
 * @param {{ hashtagClassName?: string, linkClassName?: string, mentionClassName?: string, cashtagQuotesByTicker?: Record<string, { change_pct?: number }>, highlightQuery?: string, highlightClassName?: string, onMentionClick?: (handle: string, e: MouseEvent) => void, onHashtagClick?: (tag: string, e: MouseEvent) => void, onLinkClick?: (href: string, e: MouseEvent) => void, onCashtagClick?: (ticker: string, e: MouseEvent) => void }} [opts]
 */
export function renderRichCaption(
  text,
  {
    hashtagClassName = 'font-semibold text-cyan-400',
    linkClassName = 'font-medium text-sky-400 underline underline-offset-2 decoration-sky-400/70 break-words',
    mentionClassName = 'font-medium text-orange-400',
    cashtagQuotesByTicker = null,
    highlightQuery = '',
    highlightClassName,
    onMentionClick = null,
    onHashtagClick = null,
    onLinkClick = null,
    onCashtagClick = null,
  } = {}
) {
  const s = String(text ?? '')
  if (!s) return null
  const out = []
  const rkRef = { current: 0 }
  const highlightTerms = loungeSearchHighlightTerms(highlightQuery)

  const pushPlain = (fragment) => {
    if (!fragment) return
    if (highlightTerms.length) {
      appendHighlightedPlainText(out, rkRef, fragment, highlightTerms, {
        keyPrefix: 'rk-p',
        highlightClassName,
      })
    } else {
      out.push(fragment)
    }
  }

  const pushMentionParsed = (fragment) => {
    if (!fragment) return
    let last = 0
    const re = /@([\w]+)/g
    let m
    while ((m = re.exec(fragment)) !== null) {
      if (m.index > last) pushPlain(fragment.slice(last, m.index))
      const handle = m[1]
      if (onMentionClick) {
        out.push(
          <button
            key={`rk-m-${rkRef.current++}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onMentionClick(handle, e)
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={`${mentionClassName} touch-manipulation [-webkit-tap-highlight-color:transparent]`}
          >
            @{handle}
          </button>
        )
      } else {
        out.push(
          <span key={`rk-m-${rkRef.current++}`} className={mentionClassName}>
            @{handle}
          </span>
        )
      }
      last = m.index + m[0].length
    }
    if (last < fragment.length) pushPlain(fragment.slice(last))
  }

  const pushCashtagParsed = (fragment) => {
    if (!fragment) return
    let last = 0
    const re = /\$([A-Za-z][A-Za-z0-9.-]{0,14})\b/g
    let m
    while ((m = re.exec(fragment)) !== null) {
      if (m.index > last) pushMentionParsed(fragment.slice(last, m.index))
      const ticker = String(m[1] || '').trim()
      const tickerKey = ticker.toUpperCase()
      const changePct = cashtagQuotesByTicker?.[tickerKey]?.change_pct
      const cashtagClassName = marketCashtagColorClass(changePct)
      const label = `$${tickerKey}`
      if (onCashtagClick) {
        out.push(
          <button
            key={`rk-c-${rkRef.current++}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onCashtagClick(tickerKey, e)
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={`${cashtagClassName} touch-manipulation [-webkit-tap-highlight-color:transparent]`}
          >
            {label}
          </button>,
        )
      } else {
        out.push(
          <span key={`rk-c-${rkRef.current++}`} className={cashtagClassName}>
            {label}
          </span>,
        )
      }
      last = m.index + m[0].length
    }
    if (last < fragment.length) pushMentionParsed(fragment.slice(last))
  }

  const pushHashtagParsed = (fragment) => {
    if (!fragment) return
    let last = 0
    const re = /#(?:[\p{L}\p{N}_-]+)/gu
    let m
    while ((m = re.exec(fragment)) !== null) {
      if (m.index > last) pushCashtagParsed(fragment.slice(last, m.index))
      const tag = m[0]
      if (onHashtagClick) {
        out.push(
          <button
            key={`rk-h-${rkRef.current++}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onHashtagClick(tag, e)
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={`${hashtagClassName} touch-manipulation [-webkit-tap-highlight-color:transparent]`}
          >
            {tag}
          </button>
        )
      } else {
        out.push(
          <span key={`rk-h-${rkRef.current++}`} className={hashtagClassName}>
            {tag}
          </span>
        )
      }
      last = m.index + m[0].length
    }
    if (last < fragment.length) pushCashtagParsed(fragment.slice(last))
  }

  for (const seg of splitTextWithLinks(s)) {
    if (seg.type === 'link' && seg.href) {
      if (onLinkClick) {
        out.push(
          <button
            key={`rk-u-${rkRef.current++}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onLinkClick(seg.href, e)
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={`${linkClassName} touch-manipulation text-left [-webkit-tap-highlight-color:transparent]`}
          >
            {seg.value}
          </button>
        )
      } else {
        out.push(
          <a
            key={`rk-u-${rkRef.current++}`}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClassName}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {seg.value}
          </a>
        )
      }
    } else if (seg.value) {
      pushHashtagParsed(seg.value)
    }
  }
  return out.length ? out : null
}
