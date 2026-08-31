import { splitTextWithLinks } from '../../utils/linkifyText.jsx'
import {
  guessCashtagAssetClass,
  marketCashtagColorClass,
} from '../../utils/loungeMarketCaptionParse.js'

const MENTION_CLASS = 'font-medium text-orange-400'
const HASHTAG_CLASS = 'font-semibold text-cyan-400'
const LINK_CLASS =
  'font-medium text-sky-400 underline underline-offset-2 decoration-sky-400/70 break-all [overflow-wrap:anywhere]'

const CASHTAG_RE = /\$([A-Za-z][A-Za-z0-9.-]{0,14})\b/g

/** Style committed @handles in composer; partial @queries stay plain for autocomplete/caret. */
const COMPOSER_MENTION_COMMIT_RE = /@([\w]+)(?=[\s,.!?;:'")\]])/g

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function wrapSpan(className, inner) {
  return `<span class="${className}">${inner}</span>`
}

function appendCashtagHtml(out, fragment, styleCtx) {
  if (!fragment) return
  let last = 0
  CASHTAG_RE.lastIndex = 0
  let m
  while ((m = CASHTAG_RE.exec(fragment)) !== null) {
    if (m.index > last) out.push(escapeHtml(fragment.slice(last, m.index)))
    const tickerKey = String(m[1] || '').trim().toUpperCase()
    const changePct = styleCtx?.quotesByTicker?.[tickerKey]?.change_pct
    const assetClass =
      styleCtx?.assetClassByTicker?.get(tickerKey) || guessCashtagAssetClass(tickerKey)
    const cls = marketCashtagColorClass(changePct, { assetClass })
    out.push(wrapSpan(cls, escapeHtml(`$${tickerKey}`)))
    last = m.index + m[0].length
  }
  if (last < fragment.length) out.push(escapeHtml(fragment.slice(last)))
}

function appendMentionHtml(out, fragment, { committedOnly = false } = {}, styleCtx = null) {
  if (!fragment) return
  let last = 0
  // Composer: only style @handles followed by whitespace or punctuation so partial @queries stay
  // plain text (Android caret + mention autocomplete rely on a stable DOM).
  const re = committedOnly ? COMPOSER_MENTION_COMMIT_RE : /@([\w]+)/g
  re.lastIndex = 0
  let m
  while ((m = re.exec(fragment)) !== null) {
    if (m.index > last) appendCashtagHtml(out, fragment.slice(last, m.index), styleCtx)
    out.push(wrapSpan(MENTION_CLASS, `@${escapeHtml(m[1])}`))
    last = m.index + m[0].length
  }
  if (last < fragment.length) appendCashtagHtml(out, fragment.slice(last), styleCtx)
}

function appendHashtagHtml(out, fragment, mentionOpts, styleCtx) {
  if (!fragment) return
  let last = 0
  const re = /#(?:[\p{L}\p{N}_-]+)/gu
  let m
  while ((m = re.exec(fragment)) !== null) {
    if (m.index > last) appendMentionHtml(out, fragment.slice(last, m.index), mentionOpts, styleCtx)
    out.push(wrapSpan(HASHTAG_CLASS, escapeHtml(m[0])))
    last = m.index + m[0].length
  }
  if (last < fragment.length) appendMentionHtml(out, fragment.slice(last), mentionOpts, styleCtx)
}

const COMPOSER_MENTION_OPTS = { committedOnly: true }

/** Build styled HTML for a plain caption string (composer contenteditable). */
function appendStyledComposerFragment(out, fragment, styleCtx) {
  if (!fragment) return
  for (const seg of splitTextWithLinks(fragment, { trimTrailing: false })) {
    if (seg.type === 'link' && seg.href) {
      out.push(wrapSpan(LINK_CLASS, escapeHtml(seg.value)))
    } else if (seg.value) {
      appendHashtagHtml(out, seg.value, COMPOSER_MENTION_OPTS, styleCtx)
    }
  }
}

export function buildRichComposerHtml(text, styleCtx = null) {
  const s = String(text ?? '')
  if (!s) return ''
  const lines = s.split('\n')
  const out = []
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) out.push('<br>')
    appendStyledComposerFragment(out, lines[i], styleCtx)
  }
  return out.join('')
}

export const LOUNGE_IOS =
  typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)

/** Positive Android UA check (never `!LOUNGE_IOS` … that includes desktop). */
export const LOUNGE_ANDROID =
  typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)

const IOS_CARET_ANCHOR_CLASS = 'ios-caret-anchor'

function isIosCaretAnchorBr(node) {
  return (
    node?.nodeType === Node.ELEMENT_NODE &&
    node.tagName === 'BR' &&
    node.classList?.contains(IOS_CARET_ANCHOR_CLASS)
  )
}

function shouldAppendIosCaretAnchor(text, caretOffset) {
  return (
    LOUNGE_IOS &&
    caretOffset != null &&
    caretOffset === String(text ?? '').length &&
    String(text ?? '').length > 0 &&
    String(text ?? '').endsWith('\n')
  )
}

function appendIosCaretAnchorBr(html) {
  return `${html || '<br>'}<br class="${IOS_CARET_ANCHOR_CLASS}" aria-hidden="true">`
}

function refocusIosComposerRoot(root, caretOffset) {
  if (!LOUNGE_IOS || !root) return
  try {
    root.contentEditable = 'false'
    root.contentEditable = 'true'
    root.focus({ preventScroll: true })
  } catch {
    try {
      root.focus()
    } catch {
      // ignore
    }
  }
  if (caretOffset != null) setCaretTextOffset(root, caretOffset)
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
      if (isIosCaretAnchorBr(node)) return
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
  if (tag === 'BR') {
    if (isIosCaretAnchorBr(node)) return 0
    return 1
  }
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
      if (isIosCaretAnchorBr(node)) return
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

/**
 * Range-based caret offset; more reliable after iOS execCommand line breaks (messy br/div DOM).
 */
export function getCaretTextOffsetViaRange(root) {
  if (!root || typeof window === 'undefined') return 0
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !root.contains(sel.anchorNode)) {
    return plainTextFromComposerRoot(root).length
  }
  try {
    const range = document.createRange()
    range.selectNodeContents(root)
    range.setEnd(sel.anchorNode, sel.anchorOffset)
    const tmp = document.createElement('div')
    tmp.appendChild(range.cloneContents())
    return plainTextFromComposerRoot(tmp).length
  } catch {
    return getCaretTextOffset(root)
  }
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
export function syncComposerHtml(root, text, caretOffset = null, styleCtx = null) {
  if (!root) return
  let html = buildRichComposerHtml(text, styleCtx)
  if (shouldAppendIosCaretAnchor(text, caretOffset)) {
    html = appendIosCaretAnchorBr(html)
  }
  root.innerHTML = html || '<br>'
  if (caretOffset != null) {
    setCaretTextOffset(root, caretOffset)
    refocusIosComposerRoot(root, caretOffset)
  }
}

/** Plain (unstyled) composer HTML for chat contenteditable. */
export function syncPlainComposerHtml(root, text, caretOffset = null) {
  if (!root) return
  const s = String(text ?? '')
  let html
  if (!s) {
    html = '<br>'
  } else {
    const lines = s.split('\n')
    const out = []
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) out.push('<br>')
      if (lines[i]) out.push(escapeHtml(lines[i]))
    }
    html = out.join('') || '<br>'
  }
  if (shouldAppendIosCaretAnchor(text, caretOffset)) {
    html = appendIosCaretAnchorBr(html)
  }
  root.innerHTML = html
  if (caretOffset != null) {
    setCaretTextOffset(root, caretOffset)
    refocusIosComposerRoot(root, caretOffset)
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

const TEXTAREA_CARET_STYLE_PROPERTIES = [
  'direction',
  'boxSizing',
  'width',
  'height',
  'overflowX',
  'overflowY',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontSizeAdjust',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'textDecoration',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
  'MozTabSize',
  'whiteSpace',
  'wordBreak',
  'wordWrap',
  'overflowWrap',
]

/**
 * Computes caret bounding client rect for `<textarea>` or `<input>` using an offscreen mirror element.
 */
export function getTextareaCaretClientRect(el) {
  if (!el || typeof window === 'undefined' || typeof document === 'undefined') return null
  const pos = typeof el.selectionStart === 'number' ? el.selectionStart : (el.value?.length ?? 0)
  const isInput = el.tagName === 'INPUT'

  const div = document.createElement('div')
  div.setAttribute('data-textarea-caret-mirror', 'true')
  document.body.appendChild(div)

  const style = div.style
  const computed = window.getComputedStyle(el)

  style.whiteSpace = isInput ? 'nowrap' : 'pre-wrap'
  if (!isInput) style.wordWrap = 'break-word'

  style.position = 'fixed'
  style.visibility = 'hidden'
  style.top = '0px'
  style.left = '-9999px'
  style.pointerEvents = 'none'

  for (const prop of TEXTAREA_CARET_STYLE_PROPERTIES) {
    style[prop] = computed[prop]
  }

  if (computed.overflowY === 'scroll' || (computed.overflowY === 'auto' && el.scrollHeight > el.clientHeight)) {
    style.overflowY = 'scroll'
  } else {
    style.overflow = 'hidden'
  }

  div.textContent = (el.value ?? '').substring(0, pos)
  if (isInput) {
    div.textContent = div.textContent.replace(/\s/g, '\u00a0')
  }

  const span = document.createElement('span')
  span.textContent = (el.value ?? '').substring(pos) || '.'
  div.appendChild(span)

  const elRect = el.getBoundingClientRect()
  const mirrorRect = div.getBoundingClientRect()
  const spanRect = span.getBoundingClientRect()

  const borderLeft = parseFloat(computed.borderLeftWidth) || 0
  const borderTop = parseFloat(computed.borderTopWidth) || 0
  const lineHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.25 || 20

  const spanRelativeTop = spanRect.top - mirrorRect.top
  const spanRelativeLeft = spanRect.left - mirrorRect.left

  const top = elRect.top + borderTop + spanRelativeTop - el.scrollTop
  const left = elRect.left + borderLeft + spanRelativeLeft - el.scrollLeft
  const height = spanRect.height || lineHeight

  document.body.removeChild(div)

  return {
    top,
    bottom: top + height,
    left,
    right: left + (spanRect.width || 0),
  }
}

/** Client rect for the current selection caret inside a composer root or textarea/input. */
export function getComposerCaretClientRect(root) {
  if (!root || typeof window === 'undefined') return null
  if (root.tagName === 'TEXTAREA' || root.tagName === 'INPUT') {
    return getTextareaCaretClientRect(root)
  }
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

/**
 * Read caret before a line break. On iOS, trust caretRef when range reads lag (Hello → Enter → Enter).
 */
export function readComposerCaretBeforeLineBreak(root, caretRefFallback = 0) {
  return Math.max(getCaretTextOffsetViaRange(root), caretRefFallback)
}

/**
 * iOS nested/fixed composers: splice `\n` in plain text and rebuild HTML (no execCommand).
 * Avoids WebKit caret paint bugs from messy post-execCommand DOM on empty lines.
 */
export function insertComposerNewlineByPlainSync(
  root,
  { maxLength, normalize, caretRefFallback = 0, rich = true } = {},
) {
  if (!root || typeof document === 'undefined') return null
  if (!ensureComposerSelection(root)) return null

  const beforeCaret = readComposerCaretBeforeLineBreak(root, caretRefFallback)
  let text = plainTextFromComposerRoot(root)
  if (normalize) text = normalize(text)

  const safeBefore = Math.max(0, Math.min(beforeCaret, text.length))
  let nextText = text.slice(0, safeBefore) + '\n' + text.slice(safeBefore)
  if (normalize) nextText = normalize(nextText)

  let nextCaret = safeBefore + 1
  if (maxLength != null && nextText.length > maxLength) {
    nextText = nextText.slice(0, maxLength)
    nextCaret = Math.min(nextCaret, maxLength)
  }

  if (rich) syncComposerHtml(root, nextText, nextCaret)
  else syncPlainComposerHtml(root, nextText, nextCaret)

  return { text: nextText, caret: nextCaret }
}

/** Keep the typing caret visible when a composer field scrolls internally. */
export function scrollComposerCaretIntoView(root, { paddingPx = 6, bottomInsetPx = 0 } = {}) {
  if (!root || typeof window === 'undefined') return
  const active = document.activeElement
  if (active !== root && !root.contains(active)) return
  if (root.scrollHeight <= root.clientHeight + 1) return

  const pad = paddingPx
  const bottomInset = Math.max(0, bottomInsetPx)

  if (isRichComposerElement(root)) {
    const caret = getComposerCaretClientRect(root)
    if (!caret) return
    const box = root.getBoundingClientRect()
    const visibleBottom = box.bottom - pad - bottomInset
    if (caret.bottom > visibleBottom) {
      root.scrollTop += caret.bottom - visibleBottom
    } else if (caret.top < box.top + pad) {
      root.scrollTop -= box.top + pad - caret.top
    }
    return
  }

  if (typeof root.selectionStart !== 'number') return
  const style = window.getComputedStyle(root)
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.25 || 20
  const textBefore = String(root.value ?? '').slice(0, root.selectionStart)
  const lineCount = Math.max(1, textBefore.split('\n').length)
  const caretTop = (lineCount - 1) * lineHeight
  const caretBottom = caretTop + lineHeight
  const visibleTop = root.scrollTop
  const visibleBottom = visibleTop + root.clientHeight - bottomInset
  if (caretBottom > visibleBottom - pad) {
    root.scrollTop = caretBottom - root.clientHeight + pad + bottomInset
  } else if (caretTop < visibleTop + pad) {
    root.scrollTop = Math.max(0, caretTop - pad)
  }
}

const COMPOSER_FIELD_SCROLL_PAD_PX = 40
const COMPOSER_FIELD_CATEGORY_GAP_PX = 10

/** Cap feed composer height above category pills and reserve scroll padding at the bottom. */
export function syncComposerFieldAutoHeight(root, { lineFloor = 38, viewportMaxPx = 352 } = {}) {
  if (!root) return
  root.style.height = 'auto'
  root.style.paddingBottom = ''
  let maxHeightPx = Math.round(Math.min(window.innerHeight * 0.42, viewportMaxPx))

  const header = root.closest('[data-lounge-feed-composer]')
  const category = header?.querySelector('[data-lounge-composer-category]')
  if (category) {
    const fieldTop = root.getBoundingClientRect().top
    const categoryTop = category.getBoundingClientRect().top
    const availableAboveCategory = categoryTop - fieldTop - COMPOSER_FIELD_CATEGORY_GAP_PX
    if (availableAboveCategory > lineFloor) {
      maxHeightPx = Math.min(maxHeightPx, Math.floor(availableAboveCategory))
    }
  }

  const contentHeight = Math.max(root.scrollHeight, lineFloor)
  const nextHeight = Math.min(contentHeight, maxHeightPx)
  const needsScroll = contentHeight > maxHeightPx
  root.style.height = `${nextHeight}px`
  root.style.overflowY = needsScroll ? 'auto' : 'hidden'
  root.style.paddingBottom = needsScroll ? `${COMPOSER_FIELD_SCROLL_PAD_PX}px` : ''
  scrollComposerCaretIntoView(root, {
    paddingPx: 8,
    bottomInsetPx: needsScroll ? COMPOSER_FIELD_SCROLL_PAD_PX : 0,
  })
}
