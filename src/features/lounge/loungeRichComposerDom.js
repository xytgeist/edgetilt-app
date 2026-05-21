import { hrefForUrlDisplay, trimUrlTrail } from './loungeCaption.jsx'

const MENTION_CLASS = 'font-medium text-orange-400'
const HASHTAG_CLASS = 'font-semibold text-cyan-400'
const LINK_CLASS =
  'font-medium text-sky-400 underline underline-offset-2 decoration-sky-400/70 break-words'

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function wrapSpan(className, inner) {
  return `<span class="${className}">${inner}</span>`
}

function appendMentionHtml(out, fragment, { committedOnly = false } = {}) {
  if (!fragment) return
  let last = 0
  // Composer: only style @handles followed by whitespace so partial @queries stay
  // plain text (Android caret + mention autocomplete rely on a stable DOM).
  const re = committedOnly ? /@([\w]+)(?=\s)/g : /@([\w]+)/g
  let m
  while ((m = re.exec(fragment)) !== null) {
    if (m.index > last) out.push(escapeHtml(fragment.slice(last, m.index)))
    out.push(wrapSpan(MENTION_CLASS, `@${escapeHtml(m[1])}`))
    last = m.index + m[0].length
  }
  if (last < fragment.length) out.push(escapeHtml(fragment.slice(last)))
}

function appendHashtagHtml(out, fragment, mentionOpts) {
  if (!fragment) return
  let last = 0
  const re = /#(?:[\p{L}\p{N}_-]+)/gu
  let m
  while ((m = re.exec(fragment)) !== null) {
    if (m.index > last) appendMentionHtml(out, fragment.slice(last, m.index), mentionOpts)
    out.push(wrapSpan(HASHTAG_CLASS, escapeHtml(m[0])))
    last = m.index + m[0].length
  }
  if (last < fragment.length) appendMentionHtml(out, fragment.slice(last), mentionOpts)
}

const COMPOSER_MENTION_OPTS = { committedOnly: true }

/** Build styled HTML for a plain caption string (composer contenteditable). */
export function buildRichComposerHtml(text) {
  const s = String(text ?? '')
  if (!s) return ''
  const out = []
  let last = 0
  const urlRe = /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi
  let um
  while ((um = urlRe.exec(s)) !== null) {
    const raw = um[0]
    const display = trimUrlTrail(raw)
    const href = hrefForUrlDisplay(display)
    if (um.index > last) appendHashtagHtml(out, s.slice(last, um.index), COMPOSER_MENTION_OPTS)
    if (href) {
      out.push(wrapSpan(LINK_CLASS, escapeHtml(display || raw)))
    } else {
      appendHashtagHtml(out, display || raw, COMPOSER_MENTION_OPTS)
    }
    last = um.index + raw.length
  }
  if (last < s.length) appendHashtagHtml(out, s.slice(last), COMPOSER_MENTION_OPTS)
  return out.join('')
}

/** Plain text (+ `\n`) from a composer contenteditable root. */
export function plainTextFromComposerRoot(root) {
  if (!root) return ''
  const parts = []
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.nodeValue || '')
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const tag = node.tagName
    if (tag === 'BR') {
      parts.push('\n')
      return
    }
    if (tag === 'DIV' || tag === 'P') {
      const beforeLen = parts.length
      for (const child of node.childNodes) walk(child)
      if (beforeLen > 0 && parts.length > 0 && node !== root && !parts[parts.length - 1]?.endsWith('\n')) {
        parts.push('\n')
      }
      return
    }
    for (const child of node.childNodes) walk(child)
  }
  for (const child of root.childNodes) walk(child)
  return parts.join('')
}

/** Character offset of the selection anchor within `root`. */
export function getCaretTextOffset(root) {
  if (!root || typeof window === 'undefined') return 0
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !root.contains(sel.anchorNode)) {
    return plainTextFromComposerRoot(root).length
  }

  let offset = 0
  let found = false
  const anchorNode = sel.anchorNode
  const anchorOffset = sel.anchorOffset

  function walkTextOnly(node) {
    if (found) return
    if (node === anchorNode && node.nodeType === Node.TEXT_NODE) {
      offset += anchorOffset
      found = true
      return
    }
    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.nodeValue?.length ?? 0
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const tag = node.tagName
    if (tag === 'BR') {
      offset += 1
      return
    }
    if (tag === 'DIV' || tag === 'P') {
      if (node === anchorNode) {
        for (let i = 0; i < anchorOffset && i < node.childNodes.length; i += 1) {
          walkTextOnly(node.childNodes[i])
        }
        found = true
        return
      }
      const before = offset
      for (const child of node.childNodes) walkTextOnly(child)
      if (node !== root && offset > before) offset += 1
      return
    }
    if (node === anchorNode && node.nodeType === Node.ELEMENT_NODE) {
      for (let i = 0; i < anchorOffset && i < node.childNodes.length; i += 1) {
        walkTextOnly(node.childNodes[i])
      }
      found = true
      return
    }
    for (const child of node.childNodes) walkTextOnly(child)
  }

  for (const child of root.childNodes) walkTextOnly(child)
  return found ? offset : plainTextFromComposerRoot(root).length
}

/** Place the caret at a plain-text character offset inside `root`. */
export function setCaretTextOffset(root, targetOffset) {
  if (!root || typeof window === 'undefined') return
  const sel = window.getSelection()
  if (!sel) return
  const maxOffset = Math.max(0, targetOffset)
  const range = document.createRange()
  let remaining = maxOffset
  let placed = false

  const walk = (node) => {
    if (placed) return
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.nodeValue?.length ?? 0
      if (remaining <= len) {
        range.setStart(node, remaining)
        range.collapse(true)
        placed = true
        return
      }
      remaining -= len
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const tag = node.tagName
    if (tag === 'BR') {
      if (remaining <= 1) {
        range.setStartBefore(node)
        range.collapse(true)
        placed = true
        return
      }
      remaining -= 1
      return
    }
    if (tag === 'DIV' || tag === 'P') {
      if (node !== root && remaining === 0) {
        range.setStart(node, 0)
        range.collapse(true)
        placed = true
        return
      }
      if (node !== root && remaining > 0) {
        const before = remaining
        for (const child of node.childNodes) {
          walk(child)
          if (placed) return
        }
        if (!placed && before > 0) {
          remaining -= 1
        }
        return
      }
    }
    for (const child of node.childNodes) {
      walk(child)
      if (placed) return
    }
  }

  for (const child of root.childNodes) {
    walk(child)
    if (placed) break
  }

  if (!placed) {
    range.selectNodeContents(root)
    range.collapse(false)
  }

  sel.removeAllRanges()
  sel.addRange(range)
}

/** Replace composer HTML from plain text and optionally restore caret. */
export function syncComposerHtml(root, text, caretOffset = null) {
  if (!root) return
  const html = buildRichComposerHtml(text)
  root.innerHTML = html || '<br>'
  if (caretOffset != null) {
    setCaretTextOffset(root, caretOffset)
  }
}

/** Insert plain text at the current selection (used for paste + Enter). */
export function insertPlainTextAtSelection(root, text) {
  if (!root || typeof document === 'undefined') return
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  if (!root.contains(sel.anchorNode)) return
  sel.deleteFromDocument()
  const range = sel.getRangeAt(0)
  const node = document.createTextNode(text)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}

export function isRichComposerElement(el) {
  return Boolean(el?.isContentEditable)
}
