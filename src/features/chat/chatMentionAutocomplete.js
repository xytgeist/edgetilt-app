import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  getCaretTextOffset,
  isRichComposerElement,
  plainTextFromComposerRoot,
  setCaretTextOffset,
  syncComposerHtml,
} from '../lounge/loungeRichComposerDom.js'
import {
  applyMentionSuggestion,
  detectMentionAtCursor,
} from '../lounge/loungeMentionAutocomplete.js'

const MAX_RESULTS = 6

function filterChatMentionCandidates(candidates, query) {
  const rows = Array.isArray(candidates) ? candidates : []
  const q = String(query || '').trim().toLowerCase()
  const filtered = rows.filter((row) => {
    const handle = String(row?.handle || '').trim().toLowerCase()
    if (!handle) return false
    if (!q) return true
    return handle.startsWith(q)
  })
  return filtered.slice(0, MAX_RESULTS)
}

/**
 * Room-member-scoped @mention autocomplete for chat composers.
 *
 * @param {string} value
 * @param {Array<{ user_id: string, handle: string, display_name?: string|null, avatar_url?: string|null, role?: string|null, is_og?: boolean|null }>} candidates
 * @param {boolean} [enabled]
 */
export function useChatMentionState(value, candidates, enabled = true) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [mention, setMention] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const pendingCursorRef = useRef(null)
  const liveValueRef = useRef(value)
  const candidateRows = useMemo(
    () => (Array.isArray(candidates) ? candidates : []).filter((row) => row?.handle),
    [candidates],
  )

  useEffect(() => {
    liveValueRef.current = value
  }, [value])

  const clearMention = useCallback(() => {
    setMention(null)
    setSuggestions([])
  }, [])

  const refreshMentionContext = useCallback(
    (text, caret) => {
      if (!enabled) {
        clearMention()
        return
      }
      const active = detectMentionAtCursor(text, caret)
      if (!active) {
        clearMention()
        return
      }
      setMention(active)
      setSuggestions(filterChatMentionCandidates(candidateRows, active.query))
      setActiveIndex(0)
    },
    [candidateRows, clearMention, enabled],
  )

  useEffect(() => {
    if (!enabled) clearMention()
  }, [enabled, clearMention])

  const applyCursor = useCallback((editorEl) => {
    const pos = pendingCursorRef.current
    if (pos == null || !editorEl) return
    pendingCursorRef.current = null
    if (isRichComposerElement(editorEl)) {
      setCaretTextOffset(editorEl, pos)
      return
    }
    editorEl.selectionStart = editorEl.selectionEnd = pos
  }, [])

  const onCursorMove = useCallback(
    (e) => {
      const el = e?.target
      if (!el && typeof e?.text !== 'string') return

      let text = typeof e?.text === 'string' ? e.text : undefined
      let caret = typeof e?.caret === 'number' ? e.caret : undefined

      if (text === undefined && el) {
        text = isRichComposerElement(el) ? plainTextFromComposerRoot(el) : el.value ?? ''
      }
      if (caret === undefined && el) {
        caret = isRichComposerElement(el)
          ? getCaretTextOffset(el)
          : (el.selectionStart ?? null)
      }

      refreshMentionContext(text, caret)
    },
    [refreshMentionContext],
  )

  const onMentionKeyDown = useCallback(
    (e, setValue, textareaEl) => {
      if (!mention || suggestions.length === 0) return false
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1))
        return true
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
        return true
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const profile = suggestions[activeIndex]
        if (!profile?.handle) return false
        e.preventDefault()
        const result = applyMentionSuggestion(liveValueRef.current, mention, profile.handle)
        pendingCursorRef.current = result.cursorPos
        if (isRichComposerElement(textareaEl)) {
          syncComposerHtml(textareaEl, result.value, result.cursorPos)
        }
        liveValueRef.current = result.value
        setValue(result.value)
        clearMention()
        requestAnimationFrame(() => applyCursor(textareaEl))
        return true
      }
      if (e.key === 'Escape') {
        clearMention()
        return true
      }
      return false
    },
    [mention, suggestions, activeIndex, clearMention, applyCursor],
  )

  const onMentionSelect = useCallback(
    (profile, setValue, textareaEl) => {
      if (!profile?.handle) return
      const result = applyMentionSuggestion(liveValueRef.current, mention, profile.handle)
      pendingCursorRef.current = result.cursorPos
      if (isRichComposerElement(textareaEl)) {
        syncComposerHtml(textareaEl, result.value, result.cursorPos)
      }
      liveValueRef.current = result.value
      setValue(result.value)
      clearMention()
      requestAnimationFrame(() => {
        applyCursor(textareaEl)
        textareaEl?.focus()
      })
    },
    [mention, clearMention, applyCursor],
  )

  return {
    mention,
    suggestions,
    loading: false,
    activeIndex,
    clearMention,
    onCursorMove,
    onMentionKeyDown,
    onMentionSelect,
  }
}
