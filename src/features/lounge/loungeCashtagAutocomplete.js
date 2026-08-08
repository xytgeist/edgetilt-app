import { useState, useEffect, useRef, useCallback } from 'react'
import { LOUNGE_MARKET_EMBED_MAX } from '../../utils/loungeMarketCaptionParse.js'
import { loungeMarketResolveSymbol, loungeMarketEnrichSymbols } from '../../utils/loungeMarketApi.js'
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

function localHasExactCashtagMatch(rows, query) {
  const q = String(query || '')
    .trim()
    .toUpperCase()
    .replace(/^\$/, '')
  if (!q) return false
  return (rows || []).some((row) => {
    const display = String(row?.display_symbol || row?.symbol || '')
      .trim()
      .toUpperCase()
    return display === q
  })
}

async function enrichCashtagSuggestionRows(supabaseClient, rows) {
  if (!supabaseClient || !rows?.length) return rows
  try {
    const enriched = await loungeMarketEnrichSymbols(
      supabaseClient,
      rows.map((row) => marketSymbolFromSearchRow(row)),
    )
    if (!Array.isArray(enriched) || !enriched.length) return rows
    const byKey = new Map(
      enriched.map((row) => [
        `${String(row.asset_class || 'stock').trim()}:${String(row.symbol || '').trim().toLowerCase()}`,
        row,
      ]),
    )
    return rows.map((row) => {
      const key = `${String(row.asset_class || 'stock').trim()}:${String(row.symbol || '').trim().toLowerCase()}`
      const quoteRow = byKey.get(key)
      if (!quoteRow) return row
      return {
        ...row,
        price: quoteRow.price ?? row.price,
        change_pct: quoteRow.change_pct ?? row.change_pct,
        market_cap: quoteRow.market_cap ?? row.market_cap,
        exchange: quoteRow.exchange ?? row.exchange,
      }
    })
  } catch {
    return rows
  }
}

/** Active `$TICKER` fragment at cursor (partial query allowed; requires ≥1 letter after `$`). */
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

/** Ignore spurious contenteditable blur after DOM sync or when focus moved to the cashtag list. */
export function shouldKeepCashtagAutocompleteAfterBlur(fieldEl) {
  const active = document.activeElement
  if (fieldEl && (active === fieldEl || fieldEl.contains?.(active))) return true
  const dropdown = document.querySelector('[aria-label="Market symbol suggestions"]')
  if (dropdown?.contains?.(active)) return true
  return false
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
  const loadingRef = useRef(false)
  const cashtagRef = useRef(null)

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

  useEffect(() => {
    loadingRef.current = loading
  }, [loading])

  useEffect(() => {
    cashtagRef.current = cashtag
  }, [cashtag])

  const clearCashtag = useCallback(() => {
    const alreadyIdle =
      cashtagRef.current == null && suggestionsRef.current.length === 0 && !loadingRef.current
    loadGenRef.current += 1
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
    lastQueryRef.current = null
    // Avoid setState on every keystroke when there is no active $cashtag (was re-rendering SocialFeed).
    if (alreadyIdle) return
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
      const gen = loadGenRef.current

      const finishSuggestionsWithQuotes = (rows) => {
        if (!rows.length) {
          setSuggestions([])
          setLoading(false)
          return
        }
        setSuggestions(rows.map(withCashtagRowLogo))
        if (!supabaseClient) {
          setLoading(false)
          return
        }
        setLoading(true)
        void enrichCashtagSuggestionRows(supabaseClient, rows)
          .then((enriched) => {
            if (gen !== loadGenRef.current) return
            if (String(lastQueryRef.current || '').trim().toUpperCase() !== cacheKey) return
            setSuggestions(enriched.map(withCashtagRowLogo))
            setLoading(false)
          })
          .catch(() => setLoading(false))
      }

      const localRows = localCashtagMatches(universeRef.current, query, searchIndexRef.current)
      const hasExactLocal = localHasExactCashtagMatch(localRows, query)

      if (localRows.length > 0) {
        finishSuggestionsWithQuotes(localRows)
        // Prefix junk (GLDG…) used to short-circuit resolve_symbol, so exact
        // tickers missing from the seed (e.g. GLD) never appeared. Enrich when
        // local has hits but no exact display_symbol match.
        if (hasExactLocal || !supabaseClient) return
      } else {
        setSuggestions([])
        if (!supabaseClient) {
          setLoading(false)
          return
        }
      }

      const cachedMiss = missFallbackCache.get(cacheKey)
      if (cachedMiss !== undefined) {
        if (localRows.length > 0) {
          const payload = mergeLoungeMarketSymbolUniverseRows(cachedMiss)
          const installed = installUniverseRows(payload.rows, fullUniverseRef)
          universeRef.current = installed.rows
          searchIndexRef.current = installed.index
          const merged = localCashtagMatches(universeRef.current, query, searchIndexRef.current)
          finishSuggestionsWithQuotes(merged.length ? merged : localRows)
        } else {
          finishSuggestionsWithQuotes(Array.isArray(cachedMiss) ? cachedMiss : [])
        }
        return
      }

      if (!localRows.length) setLoading(true)

      fallbackTimerRef.current = setTimeout(() => {
        void loungeMarketResolveSymbol(supabaseClient, query)
          .then((resolved) => {
            if (gen !== loadGenRef.current) return
            if (String(lastQueryRef.current || '').trim().toUpperCase() !== cacheKey) return

            const rows = Array.isArray(resolved) ? resolved : []
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

            if (localRows.length > 0) {
              const merged = localCashtagMatches(universeRef.current, query, searchIndexRef.current)
              finishSuggestionsWithQuotes(merged.length ? merged : localRows)
            } else {
              finishSuggestionsWithQuotes(rows)
            }
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
      if (!active || !active.query || active.query.length < MIN_QUERY_LEN) {
        clearCashtag()
        return
      }

      const prev = cashtagRef.current
      const same =
        prev &&
        prev.query === active.query &&
        prev.start === active.start &&
        prev.end === active.end
      if (!same) {
        setCashtag(active)
        setActiveIndex(0)
      }

      if (
        active.query === lastQueryRef.current &&
        (suggestionsRef.current.length > 0 || loadingRef.current)
      ) {
        return
      }

      applyCashtagQuery(active.query)
    },
    [applyCashtagQuery, clearCashtag, enabled],
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
      // Complete the caption with the picked ticker ($TS → $TSLA), and keep
      // embed display_symbol in sync with that completed cashtag for matching.
      const selectedTag = String(normalized.display_symbol || normalized.symbol || '')
        .trim()
        .toUpperCase()
      if (!selectedTag) return
      normalized.display_symbol = selectedTag
      const result = applyCashtagSuggestion(
        liveValueRef.current,
        cashtag,
        selectedTag,
      )
      pendingCursorRef.current = result.cursorPos
      if (isRichComposerElement(editorEl)) {
        syncComposerHtml(editorEl, result.value, result.cursorPos)
      }
      liveValueRef.current = result.value
      setValue(result.value)
      onAddSymbol?.(normalized)
      clearCashtag()
      // Focus + caret after React layout (style-context / value sync) so `$TSLA|` sticks.
      const caretPos = result.cursorPos
      requestAnimationFrame(() => {
        editorEl?.focus?.()
        pendingCursorRef.current = caretPos
        applyCursor(editorEl)
        requestAnimationFrame(() => {
          pendingCursorRef.current = caretPos
          applyCursor(editorEl)
        })
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

  const isOpen = Boolean(cashtag?.query && cashtag.query.length >= MIN_QUERY_LEN)

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
