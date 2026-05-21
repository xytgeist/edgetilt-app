import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getCaretTextOffset,
  isRichComposerElement,
  setCaretTextOffset,
  syncComposerHtml,
} from './loungeRichComposerDom.js'

const DEBOUNCE_MS = 180
const MIN_QUERY_LEN = 1
const MAX_RESULTS = 6

/**
 * Detects an active @mention at the cursor position in a textarea value.
 * Returns `{ query, start, end }` or null if no active mention.
 */
export function detectMentionAtCursor(value, cursorPos) {
  if (!value || cursorPos == null) return null
  const before = value.slice(0, cursorPos)
  // Match the last @word that hasn't been broken by whitespace
  const m = before.match(/@([\w]*)$/)
  if (!m) return null
  const start = before.length - m[0].length
  // Find where this word ends (either cursor or end of a continuous \w run)
  const after = value.slice(cursorPos)
  const tail = after.match(/^[\w]*/)
  const end = cursorPos + (tail ? tail[0].length : 0)
  return { query: m[1], start, end }
}

/**
 * Hook that watches a textarea value + cursor position and returns mention suggestions.
 *
 * @param {{ value: string, cursorPos: number|null, supabaseClient: object, enabled: boolean }} opts
 * @returns {{ mention: {query,start,end}|null, suggestions: Array, loading: boolean, clearMention: () => void }}
 */
export function useMentionAutocomplete({ value, cursorPos, supabaseClient, enabled }) {
  const [mention, setMention] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)
  const lastQueryRef = useRef(null)

  const clearMention = useCallback(() => {
    setMention(null)
    setSuggestions([])
    setLoading(false)
    lastQueryRef.current = null
  }, [])

  useEffect(() => {
    if (!enabled) {
      clearMention()
      return
    }
    const active = detectMentionAtCursor(value, cursorPos)
    if (!active || active.query.length < MIN_QUERY_LEN) {
      clearMention()
      return
    }
    setMention(active)

    if (active.query === lastQueryRef.current) return

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (!supabaseClient) return
      lastQueryRef.current = active.query
      setLoading(true)
      try {
        const { data } = await supabaseClient
          .from('profiles')
          .select('user_id,handle,display_name,avatar_url,role,is_og')
          .ilike('handle', `${active.query}%`)
          .not('handle', 'is', null)
          .order('handle', { ascending: true })
          .limit(MAX_RESULTS)
        setSuggestions(data || [])
      } catch {
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(debounceRef.current)
  }, [value, cursorPos, enabled, supabaseClient, clearMention])

  return { mention, suggestions, loading, clearMention }
}

/**
 * Given the current textarea value and an active mention `{ start, end }`,
 * returns the new value with the handle inserted and the new cursor position.
 */
export function applyMentionSuggestion(value, mention, handle) {
  if (!mention) return { value, cursorPos: value.length }
  const before = value.slice(0, mention.start)
  const after = value.slice(mention.end)
  const inserted = `@${handle} `
  const newValue = before + inserted + after
  const newCursor = mention.start + inserted.length
  return { value: newValue, cursorPos: newCursor }
}

/**
 * All-in-one mention autocomplete state for a single composer.
 * Manages cursor tracking, keyboard nav, and suggestion selection.
 *
 * @param {string} value - current textarea value
 * @param {object} supabaseClient
 * @param {boolean} enabled - false when not logged in / read-only
 * @returns object with handlers and state to spread onto textareas / pass to the dropdown
 */
export function useMentionState(value, supabaseClient, enabled = true) {
  const [cursorPos, setCursorPos] = useState(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const pendingCursorRef = useRef(null)
  /** Plain text from the last input/selection sync — ahead of React value on mobile. */
  const [liveValue, setLiveValue] = useState(value)

  useEffect(() => {
    setLiveValue(value)
  }, [value])

  const { mention, suggestions, loading, clearMention } = useMentionAutocomplete({
    value: liveValue,
    cursorPos,
    supabaseClient,
    enabled,
  })

  // Reset active index when suggestion list changes
  useEffect(() => {
    setActiveIndex(0)
  }, [suggestions.length])

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

  const onCursorMove = useCallback((e) => {
    const el = e?.target
    if (!el) return
    if (typeof e?.text === 'string') {
      setLiveValue(e.text)
    }
    if (typeof e?.caret === 'number') {
      setCursorPos(e.caret)
      return
    }
    if (isRichComposerElement(el)) {
      setCursorPos(getCaretTextOffset(el))
      return
    }
    setCursorPos(el.selectionStart ?? null)
  }, [])

  // Returns true if the event was consumed (caller should skip default onKeyDown handling)
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
        const result = applyMentionSuggestion(liveValue, mention, profile.handle)
        pendingCursorRef.current = result.cursorPos
        setCursorPos(result.cursorPos)
        if (isRichComposerElement(textareaEl)) {
          syncComposerHtml(textareaEl, result.value, result.cursorPos)
        }
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
    [mention, suggestions, activeIndex, liveValue, clearMention, applyCursor]
  )

  // Call from LoungeMentionDropdown onSelect
  const onMentionSelect = useCallback(
    (profile, setValue, textareaEl) => {
      if (!profile?.handle) return
      const result = applyMentionSuggestion(liveValue, mention, profile.handle)
      pendingCursorRef.current = result.cursorPos
      setCursorPos(result.cursorPos)
      if (isRichComposerElement(textareaEl)) {
        syncComposerHtml(textareaEl, result.value, result.cursorPos)
      }
      setValue(result.value)
      clearMention()
      requestAnimationFrame(() => {
        applyCursor(textareaEl)
        textareaEl?.focus()
      })
    },
    [liveValue, mention, clearMention, applyCursor]
  )

  return {
    mention,
    suggestions,
    loading,
    activeIndex,
    clearMention,
    onCursorMove,
    onMentionKeyDown,
    onMentionSelect,
  }
}
