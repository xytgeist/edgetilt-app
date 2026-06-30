import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getCaretTextOffset,
  isRichComposerElement,
  plainTextFromComposerRoot,
  setCaretTextOffset,
  syncComposerHtml,
} from './loungeRichComposerDom.js'

const DEBOUNCE_MS = 120
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

async function fetchMentionSuggestions(supabaseClient, query) {
  if (!supabaseClient) return []
  let req = supabaseClient
    .from('profiles')
    .select('user_id,handle,display_name,avatar_url,role,is_og')
    .not('handle', 'is', null)
    .order('handle', { ascending: true })
    .limit(MAX_RESULTS)
  if (query) req = req.ilike('handle', `${query}%`)
  const { data } = await req
  return data || []
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
  const [activeIndex, setActiveIndex] = useState(0)
  const [mention, setMention] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const pendingCursorRef = useRef(null)
  const liveValueRef = useRef(value)
  const debounceRef = useRef(null)
  const fetchGenRef = useRef(0)
  const lastQueryRef = useRef(null)
  const suggestionsRef = useRef([])

  useEffect(() => {
    suggestionsRef.current = suggestions
  }, [suggestions])

  useEffect(() => {
    liveValueRef.current = value
  }, [value])

  const clearMention = useCallback(() => {
    fetchGenRef.current += 1
    clearTimeout(debounceRef.current)
    lastQueryRef.current = null
    setMention(null)
    setSuggestions([])
    setLoading(false)
  }, [])

  const refreshMentionContext = useCallback(
    (text, caret) => {
      if (typeof text === 'string') {
        liveValueRef.current = text
      }
      const draft = liveValueRef.current
      const cursor = typeof caret === 'number' ? caret : null

      if (!enabled || cursor == null) {
        clearMention()
        return
      }

      const active = detectMentionAtCursor(draft, cursor)
      if (!active) {
        clearMention()
        return
      }

      setMention(active)
      setActiveIndex(0)

      if (active.query === lastQueryRef.current && suggestionsRef.current.length > 0) {
        setLoading(false)
        return
      }

      setLoading(true)
      clearTimeout(debounceRef.current)
      const gen = (fetchGenRef.current += 1)
      debounceRef.current = window.setTimeout(async () => {
        try {
          const rows = await fetchMentionSuggestions(supabaseClient, active.query)
          if (fetchGenRef.current !== gen) return
          lastQueryRef.current = active.query
          setSuggestions(rows)
        } catch {
          if (fetchGenRef.current !== gen) return
          setSuggestions([])
        } finally {
          if (fetchGenRef.current === gen) setLoading(false)
        }
      }, DEBOUNCE_MS)
    },
    [clearMention, enabled, supabaseClient],
  )

  useEffect(() => {
    return () => {
      clearTimeout(debounceRef.current)
    }
  }, [])

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

  // Call from LoungeMentionDropdown onSelect
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
    loading,
    activeIndex,
    clearMention,
    onCursorMove,
    onMentionKeyDown,
    onMentionSelect,
  }
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

/** @deprecated internal - kept for tests/import stability if referenced elsewhere */
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
    if (!active) {
      clearMention()
      return
    }
    setMention(active)
    if (active.query === lastQueryRef.current) return

    clearTimeout(debounceRef.current)
    setLoading(true)
    debounceRef.current = window.setTimeout(async () => {
      try {
        const rows = await fetchMentionSuggestions(supabaseClient, active.query)
        lastQueryRef.current = active.query
        setSuggestions(rows)
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
