import { Fragment } from 'react'

/** Strip trailing punctuation unlikely to be part of the URL. */
const TRAILING_PUNCT_RE = /[.,;:!?)'\]}>]+$/

const HTTP_URL_RE = /https?:\/\/[^\s<>"']+/gi
const WWW_URL_RE = /\bwww\.[^\s<>"']+/gi

/** http(s)://…, www.…, or bare domains (e.g. lvslotpro.com). */
const URL_RE =
  /(?:https?:\/\/|www\.)[\w\-.~:/?#[\]@!$&'()*+,;=%]+|\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::\d{1,5})?(?:\/[\w\-.~:/?#[\]@!$&'()*+,;=%]*)?/gi

/** Skip URL matches that are part of an email address (local or domain segment). */
function isPartOfEmailAddress(text, start, end) {
  // Local part immediately before @domain.tld (e.g. set.food@gmail.com → skip set.food).
  if (text[end] === '@') {
    const rest = text.slice(end + 1)
    if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/.test(rest)) return true
  }
  // Domain part after @local (e.g. user@gmail.com → skip gmail.com).
  if (start > 0) {
    const at = text.lastIndexOf('@', start - 1)
    if (at >= 0 && /^[a-zA-Z0-9._+-]*$/.test(text.slice(at + 1, start))) return true
  }
  return false
}

function trimTrailingPunct(raw) {
  return raw.replace(TRAILING_PUNCT_RE, '')
}

/** @returns {string | null} */
function safeHttpHref(raw) {
  const trimmed = trimTrailingPunct(raw)
  let href = trimmed
  if (/^www\./i.test(href)) href = `https://${href}`
  else if (!/^https?:\/\//i.test(href)) href = `https://${href}`
  try {
    const u = new URL(href)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.href
  } catch {
    return null
  }
}

/**
 * @param {string} text
 * @returns {{ type: 'text' | 'link', value: string, href?: string }[]}
 */
function collapseUrlStripWhitespace(text) {
  return String(text || '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function previewHostPattern(previewUrl) {
  try {
    const host = new URL(String(previewUrl || '').trim()).hostname.replace(/^www\./i, '')
    if (!host) return null
    return host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  } catch {
    return null
  }
}

/**
 * Removes URL segments from prose.
 * When previewUrl is set, only strips http(s)/www links and the preview host ...
 * not unrelated bare domains in wire copy (e.g. Crypto.com in a headline).
 */
export function textWithoutUrls(text, { previewUrl = null } = {}) {
  let out = String(text || '')
  out = out.replace(HTTP_URL_RE, ' ')
  out = out.replace(WWW_URL_RE, ' ')

  const hostPattern = previewUrl ? previewHostPattern(previewUrl) : null
  if (hostPattern) {
    out = out.replace(new RegExp(`\\b${hostPattern}\\b`, 'gi'), ' ')
  } else {
    const re = new RegExp(URL_RE.source, URL_RE.flags)
    out = out.replace(re, (match, offset, whole) => {
      if (isPartOfEmailAddress(whole, offset, offset + match.length)) return match
      return ' '
    })
  }

  return collapseUrlStripWhitespace(out)
}

/**
 * Caption/body for display when a link preview card is attached - strips URL text
 * but keeps any other caption (e.g. "look at this" above a YouTube embed).
 */
export function bodyTextWithLinkPreview(text, linkPreview) {
  const raw = String(text ?? '').trim()
  if (!raw) return ''
  if (!linkPreview) return raw
  const previewUrl = String(linkPreview?.url || linkPreview?.canonicalUrl || '').trim()
  return textWithoutUrls(raw, { previewUrl: previewUrl || null })
}

/** True when the string is only URL(s) and whitespace (hide duplicate text when showing a card). */
export function textIsOnlyUrls(text) {
  const t = String(text || '').trim()
  if (!t) return false
  return textWithoutUrls(t).length === 0 && extractFirstUrlFromText(t) != null
}

/** First http(s), www, or bare-domain URL in text (for link preview attach). */
export function extractFirstUrlFromText(text) {
  if (!text) return null
  for (const seg of splitTextWithLinks(text)) {
    if (seg.type === 'link' && seg.href) return seg.href
  }
  return null
}

export function splitTextWithLinks(text, { trimTrailing = true } = {}) {
  if (!text) return [{ type: 'text', value: '' }]
  const segments = []
  const re = new RegExp(URL_RE.source, URL_RE.flags)
  let last = 0
  let match
  while ((match = re.exec(text)) !== null) {
    if (isPartOfEmailAddress(text, match.index, match.index + match[0].length)) continue
    if (match.index > last) {
      segments.push({ type: 'text', value: text.slice(last, match.index) })
    }
    const raw = match[0]
    const display = trimTrailing ? trimTrailingPunct(raw) : raw
    const href = safeHttpHref(trimTrailing ? raw : display)
    const trailing = trimTrailing ? raw.slice(display.length) : ''
    if (href) {
      segments.push({ type: 'link', value: display, href })
    } else {
      segments.push({ type: 'text', value: raw })
    }
    if (trailing) segments.push({ type: 'text', value: trailing })
    last = match.index + raw.length
  }
  if (last < text.length) segments.push({ type: 'text', value: text.slice(last) })
  return segments.length ? segments : [{ type: 'text', value: text }]
}

/**
 * Renders plain text with http(s) / www / bare-domain URLs as external links.
 *
 * @param {{
 *   text: string,
 *   className?: string,
 *   linkClassName?: string,
 * }} props
 */
export function LinkifiedText({ text, className, linkClassName = 'underline underline-offset-2' }) {
  const segments = splitTextWithLinks(text)
  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.type === 'link' && seg.href ? (
          <a
            key={i}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClassName}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {seg.value}
          </a>
        ) : (
          <Fragment key={i}>{seg.value}</Fragment>
        ),
      )}
    </span>
  )
}
