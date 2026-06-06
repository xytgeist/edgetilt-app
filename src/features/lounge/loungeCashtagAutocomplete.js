import { useState, useEffect, useRef, useCallback } from 'react'
import { LOUNGE_MARKET_EMBED_MAX } from '../../utils/loungeMarketCaptionParse.js'
import { loungeMarketSearch } from '../../utils/loungeMarketApi.js'
import {
  getCaretTextOffset,
  isRichComposerElement,
  plainTextFromComposerRoot,
  setCaretTextOffset,
  syncComposerHtml,
} from './loungeRichComposerDom.js'

const DEBOUNCE_MS = 200
const MAX_RESULTS = 8

/** Active `$TICKER` fragment at cursor (partial query allowed). */
export function detectCashtagAtCursor(value, cursorPos) {
  if (!value || cursorPos == null) return null
  const before = value.slice(0, cursorPos)
  const m = before.match(/\$([A-Za-z][A-Za-z0-9.-]*)$/)
  if (!m) return null
  const start = before.length - m[0].length
  const after = value.slice(cursorPos)
  const tail = after.match(/^[A-Za-z0-9.-]*/)
  const end = cursorPos + (tail ? tail[0].length : 0)
  return { query: m[1], start, end }
}

/** @param {object} row Finnhub search row */
export function marketSymbolFromSearchRow(row) {
  return {
    symbol: String(row?.symbol || '').trim(),
    asset_class: String(row?.asset_class || '').trim() === 'crypto' ? 'crypto' : 'stock',
    display_symbol: String(row?.display_symbol || row?.symbol || '').trim(),
    name: String(row?.name || row?.description || row?.display_symbol || row?.symbol || '').trim(),
    exchange: String(row?.exchange || row?.type || '').trim(),
    logo_url: String(row?.logo_url || row?.logo || '').trim(),
    market_cap: row?.market_cap != null ? Number(row.market_cap) : null,
    price: row?.price != null ? Number(row.price) : null,
    change_pct: row?.change_pct != null ? Number(row.change_pct) : null,
    currency: String(row?.currency || 'USD').trim() || 'USD',
  }
}

export function marketSymbolDedupeKey(row) {
  return `${row?.asset_class || 'stock'}:${row?.symbol || ''}`.toLowerCase()
}

export function applyCashtagSuggestion(value, cashtag, displaySymbol) {
  if (!cashtag) return { value, cursorPos: value.length }
  const sym = String(displaySymbol || '').trim()
  if (!sym) return { value, cursorPos: value.length }
  const before = value.slice(0, cashtag.start)
  const after = value.slice(cashtag.end)
  const inserted = `$${sym} `
  const newValue = before + inserted + after
  return { value: newValue, cursorPos: cashtag.start + inserted.length }
}

/**
 * Cashtag autocomplete for `$AAPL`-style market symbols.
 * Selecting a row completes the cashtag and calls `onAddSymbol`.
 *
 * @param {string} value
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {boolean} enabled
 * @param {(row: ReturnType<typeof marketSymbolFromSearchRow>) => void} [onAddSymbol]
 */
export function useCashtagState(value, supabaseClient, enabled = true, onAddSymbol) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [cashtag, setCashtag] = useState(null)
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

  const clearCashtag = useCallback(() => {
    fetchGenRef.current += 1
    clearTimeout(debounceRef.current)
    lastQueryRef.current = null
    setCashtag(null)
    setSuggestions([])
    setLoading(false)
  }, [])

  const refreshCashtagContext = useCallback(
    (text, caret) => {
      if (typeof text === 'string') liveValueRef.current = text
      const draft = liveValueRef.current
      const cursor = typeof caret === 'number' ? caret : null

      if (!enabled || cursor == null) {
        clearCashtag()
        return
      }

      const active = detectCashtagAtCursor(draft, cursor)
      if (!active) {
        clearCashtag()
        return
      }

      setCashtag(active)
      setActiveIndex(0)

      if (!active.query) {
        lastQueryRef.current = ''
        setSuggestions([])
        setLoading(false)
        return
      }

      if (active.query === lastQueryRef.current && suggestionsRef.current.length > 0) {
        setLoading(false)
        return
      }

      setLoading(true)
      clearTimeout(debounceRef.current)
      const gen = (fetchGenRef.current += 1)
      debounceRef.current = window.setTimeout(async () => {
        try {
          const rows = await loungeMarketSearch(supabaseClient, active.query)
          if (fetchGenRef.current !== gen) return
          lastQueryRef.current = active.query
          setSuggestions(Array.isArray(rows) ? rows.slice(0, MAX_RESULTS) : [])
        } catch {
          if (fetchGenRef.current !== gen) return
          setSuggestions([])
        } finally {
          if (fetchGenRef.current === gen) setLoading(false)
        }
      }, DEBOUNCE_MS)
    },
    [clearCashtag, enabled, supabaseClient],
  )

  useEffect(() => () => clearTimeout(debounceRef.current), [])

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

  const commitSelection = useCallback(
    (row, setValue, editorEl) => {
      if (!row?.symbol || !cashtag) return
      const normalized = marketSymbolFromSearchRow(row)
      const result = applyCashtagSuggestion(
        liveValueRef.current,
        cashtag,
        normalized.display_symbol || normalized.symbol,
      )
      pendingCursorRef.current = result.cursorPos
      if (isRichComposerElement(editorEl)) {
        syncComposerHtml(editorEl, result.value, result.cursorPos)
      }
      liveValueRef.current = result.value
      setValue(result.value)
      onAddSymbol?.(normalized)
      clearCashtag()
      requestAnimationFrame(() => {
        applyCursor(editorEl)
        editorEl?.focus?.()
      })
    },
    [applyCursor, cashtag, clearCashtag, onAddSymbol],
  )

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
        caret = isRichComposerElement(el) ? getCaretTextOffset(el) : (el.selectionStart ?? null)
      }

      refreshCashtagContext(text, caret)
    },
    [refreshCashtagContext],
  )

  const onCashtagKeyDown = useCallback(
    (e, setValue, editorEl) => {
      const open = Boolean(cashtag)
      if (!open) return false

      if (suggestions.length > 0) {
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
          const row = suggestions[activeIndex]
          if (!row?.symbol) return false
          e.preventDefault()
          commitSelection(row, setValue, editorEl)
          return true
        }
      }

      if (e.key === 'Escape') {
        clearCashtag()
        return true
      }
      return false
    },
    [activeIndex, cashtag, clearCashtag, commitSelection, suggestions],
  )

  const onCashtagSelect = useCallback(
    (row, setValue, editorEl) => {
      commitSelection(row, setValue, editorEl)
    },
    [commitSelection],
  )

  const isOpen = Boolean(cashtag)

  return {
    cashtag,
    suggestions,
    loading,
    activeIndex,
    isOpen,
    clearCashtag,
    onCursorMove,
    onCashtagKeyDown,
    onCashtagSelect,
    maxSymbols: LOUNGE_MARKET_EMBED_MAX,
  }
}
