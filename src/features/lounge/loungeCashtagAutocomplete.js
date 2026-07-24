import { useState, useEffect, useRef, useCallback } from 'react'
import { LOUNGE_MARKET_EMBED_MAX } from '../../utils/loungeMarketCaptionParse.js'
import { loungeMarketResolveSymbol } from '../../utils/loungeMarketApi.js'
import { searchLoungeMarketSymbolUniverse } from '../../utils/loungeMarketSymbolSearch.js'
import { marketSymbolDedupeKey } from './loungeMarketSymbolUtils.js'
import {
  getLoungeCashtagSymbolSeedUniverse,
  hydrateLoungeCashtagResolvedSymbols,
  mergeLoungeMarketSymbolUniverseRows,
} from './loungeMarketSymbolUniverse.js'
import { withCashtagRowLogo } from './marketCashtagLogos.js'
import {
  getCaretTextOffset,
  isRichComposerElement,
  plainTextFromComposerRoot,
  setCaretTextOffset,
  syncComposerHtml,
} from './loungeRichComposerDom.js'

const MIN_QUERY_LEN = 1
const MAX_RESULTS = 8
const MISS_FALLBACK_DEBOUNCE_MS = 300
const MISS_FALLBACK_CACHE_MAX = 48

/** @type {Map<string, object[]>} */
const missFallbackCache = new Map()

function buildCashtagSearchIndex(universe) {
  const byLetter = new Map()
  for (const row of universe) {
    const display = String(row?.display_symbol || row?.symbol || '').trim().toUpperCase()
    const name = String(row?.name || '').trim().toUpperCase()
    const letters = new Set([display.charAt(0), name.charAt(0)].filter(Boolean))
    for (const letter of letters) {
      if (!byLetter.has(letter)) byLetter.set(letter, [])
      byLetter.get(letter).push(row)
    }
  }
  return { byLetter, all: universe }
}

const SEED_UNIVERSE = getLoungeCashtagSymbolSeedUniverse()
const SEED_INDEX = buildCashtagSearchIndex(SEED_UNIVERSE.rows)

function installUniverseRows(rows, fullUniverseRef) {
  const list = Array.isArray(rows) && rows.length ? rows : SEED_UNIVERSE.rows
  if (fullUniverseRef) {
    fullUniverseRef.current = list.length > SEED_UNIVERSE.rows.length
  }
  return {
    rows: list,
    index: list.length > SEED_UNIVERSE.rows.length ? buildCashtagSearchIndex(list) : SEED_INDEX,
  }
}

function localCashtagMatches(universe, query, searchIndex = null) {
  if (!Array.isArray(universe) || !universe.length || !query) return []
  const letter = String(query).trim().charAt(0).toUpperCase()
  const pool =
    searchIndex?.byLetter && letter && searchIndex.byLetter.has(letter)
      ? searchIndex.byLetter.get(letter)
      : universe
  return searchLoungeMarketSymbolUniverse(pool, query, MAX_RESULTS)
}

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

/** @param {object} row Universe row */
export function marketSymbolFromSearchRow(row) {
  return {
    symbol: String(row?.symbol || '').trim(),
    asset_class: String(row?.asset_class || '').trim() === 'crypto' ? 'crypto' : 'stock',
    display_symbol: String(row?.display_symbol || row?.symbol || '').trim(),
    name: String(row?.name || row?.description || row?.display_symbol || row?.symbol || '').trim(),
    exchange: String(row?.exchange || row?.type || '').trim(),
    logo_url: String(row?.logo_url || row?.logo || '').trim(),
    coin_id: String(row?.coin_id || '').trim() || undefined,
    market_cap: row?.market_cap != null ? Number(row.market_cap) : null,
    price: row?.price != null ? Number(row.price) : null,
    change_pct: row?.change_pct != null ? Number(row.change_pct) : null,
    currency: String(row?.currency || 'USD').trim() || 'USD',
  }
}

export { marketSymbolDedupeKey }

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
 * Local lookup table + miss-only API fallback (never "No matches" until fallback completes).
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
  const lastQueryRef = useRef(null)
  const lastCaretRef = useRef(null)
  const suggestionsRef = useRef([])
  const universeRef = useRef(SEED_UNIVERSE.rows)
  const searchIndexRef = useRef(SEED_INDEX)
  const fullUniverseRef = useRef(false)
  const loadGenRef = useRef(0)
  const fallbackTimerRef = useRef(null)

  useEffect(() => {
    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
    }
  }, [])

  useEffect(() => {
    suggestionsRef.current = suggestions
  }, [suggestions])

  useEffect(() => {
    liveValueRef.current = value
  }, [value])

  const clearCashtag = useCallback(() => {
    loadGenRef.current += 1
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
    lastQueryRef.current = null
    setCashtag(null)
    setSuggestions([])
    setLoading(false)
  }, [])

  const applyCashtagQuery = useCallback(
    (query) => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)

      const cacheKey = String(query || '').trim().toUpperCase()
      if (cacheKey !== String(lastQueryRef.current || '').trim().toUpperCase()) {
        loadGenRef.current += 1
      }
      lastQueryRef.current = query

      const localRows = localCashtagMatches(universeRef.current, query, searchIndexRef.current).map(
        withCashtagRowLogo,
      )

      if (localRows.length > 0) {
        setSuggestions(localRows)
        setLoading(false)
        return
      }

      setSuggestions([])

      if (!supabaseClient) {
        setLoading(false)
        return
      }

      const cachedMiss = missFallbackCache.get(cacheKey)
      if (cachedMiss !== undefined) {
        setSuggestions(cachedMiss.map(withCashtagRowLogo))
        setLoading(false)
        return
      }

      setLoading(true)
      const gen = loadGenRef.current

      fallbackTimerRef.current = setTimeout(() => {
        void loungeMarketResolveSymbol(supabaseClient, query)
          .then((resolved) => {
            if (gen !== loadGenRef.current) return
            if (String(lastQueryRef.current || '').trim().toUpperCase() !== cacheKey) return

            const rows = Array.isArray(resolved) ? resolved.map(withCashtagRowLogo) : []
            missFallbackCache.set(cacheKey, rows)
            if (missFallbackCache.size > MISS_FALLBACK_CACHE_MAX) {
              const first = missFallbackCache.keys().next().value
              missFallbackCache.delete(first)
            }

            if (rows.length) {
              const payload = mergeLoungeMarketSymbolUniverseRows(resolved)
              const installed = installUniverseRows(payload.rows, fullUniverseRef)
              universeRef.current = installed.rows
              searchIndexRef.current = installed.index
            }

            setSuggestions(rows)
            setLoading(false)
          })
          .catch((err) => {
            if (gen !== loadGenRef.current) return
            console.warn('[lounge] cashtag resolve:', err)
            setLoading(false)
          })
      }, MISS_FALLBACK_DEBOUNCE_MS)
    },
    [supabaseClient],
  )

  useEffect(() => {
    if (!enabled || !supabaseClient) {
      const seeded = installUniverseRows(SEED_UNIVERSE.rows, fullUniverseRef)
      universeRef.current = seeded.rows
      searchIndexRef.current = seeded.index
      return undefined
    }

    const payload = hydrateLoungeCashtagResolvedSymbols()
    const installed = installUniverseRows(payload?.rows, fullUniverseRef)
    universeRef.current = installed.rows
    searchIndexRef.current = installed.index

    return undefined
  }, [enabled, supabaseClient])

  const refreshCashtagContext = useCallback(
    (text, caret) => {
      if (typeof text === 'string') liveValueRef.current = text
      const draft = liveValueRef.current
      const cursor = typeof caret === 'number' ? caret : null
      lastCaretRef.current = cursor

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

      if (!active.query || active.query.length < MIN_QUERY_LEN) {
        loadGenRef.current += 1
        if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
        lastQueryRef.current = active.query || ''
        setSuggestions([])
        setLoading(false)
        return
      }

      if (
        active.query === lastQueryRef.current &&
        (suggestionsRef.current.length > 0 || loading)
      ) {
        return
      }

      applyCashtagQuery(active.query)
    },
    [applyCashtagQuery, clearCashtag, enabled, loading],
  )

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
      const tag = String(cashtag.query || normalized.display_symbol || normalized.symbol || '')
        .trim()
        .toUpperCase()
      if (tag) normalized.display_symbol = tag
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
