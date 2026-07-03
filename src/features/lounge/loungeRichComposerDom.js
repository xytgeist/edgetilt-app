import { splitTextWithLinks } from '../../utils/linkifyText.jsx'

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
function appendStyledComposerFragment(out, fragment) {
  if (!fragment) return
  for (const seg of splitTextWithLinks(fragment, { trimTrailing: false })) {
    if (seg.type === 'link' && seg.href) {
      out.push(wrapSpan(LINK_CLASS, escapeHtml(seg.value)))
    } else if (seg.value) {
      appendHashtagHtml(out, seg.value, COMPOSER_MENTION_OPTS)
    }
  }
}

export function buildRichComposerHtml(text) {
  const s = String(text ?? '')
  if (!s) return ''
  const lines = s.split('\n')
  const out = []
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) out.push('<br>')
    appendStyledComposerFragment(out, lines[i])
  }
  return out.join('')
}

/** Normalize plain text read from a composer root (Android block/div quirks). */
export function normalizeComposerPlainText(text, root) {
  let t = String(text ?? '')
  if (!root) return t
  // Lone <br> placeholder reads as "\n" via the walker.
  if (t === '\n' && /^<br\s*\/?>$/i.test(String(root.innerHTML || '').trim())) return ''
  // Sole inner block wrapper: walker may append one trailing newline between blocks.
  if (t.endsWith('\n') && root.childElementCount === 1) {
    const only = root.children[0]
    if (only && (only.tagName === 'DIV' || only.tagName === 'P')) {
      t = t.replace(/\n$/, '')
    }
  }
  return t
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
      if (
        beforeLen > 0 &&
        parts.length > 0 &&
        node !== root &&
        !parts[parts.length - 1]?.endsWith('\n')
      ) {
        parts.push('\n')
      }
      return
    }
    for (const child of node.childNodes) walk(child)
  }
  for (const child of root.childNodes) walk(child)
  return normalizeComposerPlainText(parts.join(''), root)
}

function textLengthOfComposerNode(node, root) {
  if (!node) return 0
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue?.length ?? 0
  if (node.nodeType !== Node.ELEMENT_NODE) return 0
  const tag = node.tagName
  if (tag === 'BR') return 1
  if (tag === 'DIV' || tag === 'P') {
    let len = 0
    for (const child of node.childNodes) len += textLengthOfComposerNode(child, root)
    if (node !== root && len > 0) len += 1
    return len
  }
  let len = 0
  for (const child of node.childNodes) len += textLengthOfComposerNode(child, root)
  return len
}

/** Character offset of the selection anchor within `root`. */
export function getCaretTextOffset(root) {
  if (!root || typeof window === 'undefined') return 0
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !root.contains(sel.anchorNode)) {
    return plainTextFromComposerRoot(root).length
  }

  const anchorNode = sel.anchorNode
  const anchorOffset = sel.anchorOffset

  // Android Chrome often anchors selection on the contenteditable root by child index.
  if (anchorNode === root) {
    let offset = 0
    for (let i = 0; i < anchorOffset && i < root.childNodes.length; i += 1) {
      offset += textLengthOfComposerNode(root.childNodes[i], root)
    }
    return Math.min(offset, plainTextFromComposerRoot(root).length)
  }

  let offset = 0
  let found = false

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
      if (remaining === 0) {
        range.setStartAfter(node)
        range.collapse(true)
        placed = true
        return
      }
      remaining -= 1
      if (remaining === 0) {
        range.setStartAfter(node)
        range.collapse(true)
        placed = true
      }
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

/** Input types mobile virtual keyboards use for Enter / newline. */
export const COMPOSER_LINE_BREAK_INPUT_TYPES = new Set(['insertLineBreak', 'insertParagraph'])

/**
 * Mobile keyboards often anchor selection outside the contenteditable until focus is reconciled.
 * Returns whether a usable range inside `root` exists after this call.
 */
export function ensureComposerSelection(root) {
  if (!root || typeof window === 'undefined') return false
  const sel = window.getSelection()
  if (!sel) return false

  // Do not re-focus when the caret is already inside the field — mobile WebKit
  // often resets selection to the wrong line when focus() runs unnecessarily.
  if (sel.rangeCount > 0 && sel.anchorNode && root.contains(sel.anchorNode)) {
    return true
  }

  try {
    root.focus({ preventScroll: true })
  } catch {
    try {
      root.focus()
    } catch {
      // ignore focus errors
    }
  }

  if (sel.rangeCount > 0 && sel.anchorNode && root.contains(sel.anchorNode)) {
    return true
  }

  setCaretTextOffset(root, plainTextFromComposerRoot(root).length)
  return sel.rangeCount > 0 && sel.anchorNode != null && root.contains(sel.anchorNode)
}

/**
 * Insert `\n` at the current caret using plain text (avoid DOM insert + re-read races on mobile).
 * Returns `{ text, caret }` or null when selection cannot be resolved.
 */
export function composerNewlineFromCaret(root) {
  if (!root) return null
  const caret = getCaretTextOffset(root)
  ensureComposerSelection(root)
  const text = plainTextFromComposerRoot(root)
  const safeCaret = Math.max(0, Math.min(caret, text.length))
  return {
    text: text.slice(0, safeCaret) + '\n' + text.slice(safeCaret),
    caret: safeCaret + 1,
  }
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
  if (!root || typeof document === 'undefined') return false
  if (!ensureComposerSelection(root)) return false
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false
  if (!root.contains(sel.anchorNode)) return false
  sel.deleteFromDocument()
  const range = sel.getRangeAt(0)
  const node = document.createTextNode(text)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
  return true
}

/**
 * Insert a line break via execCommand (X/Twitter-style, best on iOS/Android contenteditable).
 * Falls back to manual <br> when execCommand is unavailable.
 */
export function insertComposerLineBreakViaExecCommand(root) {
  if (!root || typeof document === 'undefined') return false
  if (!ensureComposerSelection(root)) return false
  try {
    root.focus({ preventScroll: true })
  } catch {
    try {
      root.focus()
    } catch {
      // ignore
    }
  }
  try {
    if (document.execCommand('insertLineBreak', false, null)) return true
  } catch {
    // ignore
  }
  try {
    if (document.execCommand('insertHTML', false, '<br>')) return true
  } catch {
    // ignore
  }
  return insertComposerLineBreakAtSelection(root)
}

/** Insert a visible line break at the current selection (mobile Enter / newline). */
export function insertComposerLineBreakAtSelection(root) {
  if (!root || typeof document === 'undefined') return false
  if (!ensureComposerSelection(root)) return false
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false
  if (!root.contains(sel.anchorNode)) return false
  sel.deleteFromDocument()
  const range = sel.getRangeAt(0)
  const br = document.createElement('br')
  range.insertNode(br)
  range.setStartAfter(br)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
  return true
}

/** Client rect for the current selection caret inside a composer root. */
export function getComposerCaretClientRect(root) {
  if (!root || typeof window === 'undefined') return null
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !root.contains(sel.anchorNode)) return null

  const range = sel.getRangeAt(0)
  const rects = range.getClientRects()
  if (rects.length > 0) {
    const r = rects[rects.length - 1]
    return { top: r.top, left: r.left, bottom: r.bottom, right: r.right }
  }

  const clone = range.cloneRange()
  clone.collapse(true)
  const marker = document.createElement('span')
  marker.textContent = '\u200b'
  try {
    clone.insertNode(marker)
    const mr = marker.getBoundingClientRect()
    return { top: mr.top, left: mr.left, bottom: mr.bottom, right: mr.right }
  } finally {
    marker.remove()
  }
}

export function isRichComposerElement(el) {
  return Boolean(el?.isContentEditable)
}
