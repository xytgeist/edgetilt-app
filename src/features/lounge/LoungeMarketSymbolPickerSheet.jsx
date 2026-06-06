import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LOUNGE_MARKET_EMBED_MAX, parseCaptionMarketWindowClient } from '../../utils/loungeMarketCaptionParse.js'
import { loungeMarketPreview, loungeMarketSearch } from '../../utils/loungeMarketApi.js'
import LoungeMarketSearchResultRow from './LoungeMarketSearchResultRow.jsx'

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   selected: Array<{ symbol: string, asset_class: string, display_symbol?: string, name?: string, exchange?: string, logo_url?: string, market_cap?: number|null, currency?: string, preview?: object }>,
 *   onChange: (next: Array<{ symbol: string, asset_class: string, display_symbol?: string, name?: string, exchange?: string, logo_url?: string, market_cap?: number|null, currency?: string, preview?: object }>) => void,
 *   caption?: string,
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 * }} props
 */
export default function LoungeMarketSymbolPickerSheet({
  open,
  onClose,
  selected,
  onChange,
  caption = '',
  supabaseClient,
}) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [previewByKey, setPreviewByKey] = useState(/** @type {Record<string, object>} */ ({}))
  const debounceRef = useRef(0)

  const windowInfo = useMemo(() => parseCaptionMarketWindowClient(caption), [caption])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setDebounced('')
    setResults([])
    setErr('')
  }, [open])

  useEffect(() => {
    if (!open) return
    window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => setDebounced(query.trim()), 280)
    return () => window.clearTimeout(debounceRef.current)
  }, [query, open])

  useEffect(() => {
    if (!open || debounced.length < 1) {
      setResults([])
      return undefined
    }
    let cancelled = false
    setLoading(true)
    setErr('')
    void loungeMarketSearch(supabaseClient, debounced)
      .then((rows) => {
        if (cancelled) return
        setResults(Array.isArray(rows) ? rows : [])
      })
      .catch((e) => {
        if (cancelled) return
        setErr(e instanceof Error ? e.message : 'Search failed.')
        setResults([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debounced, open, supabaseClient])

  const selectedKeys = useMemo(
    () => new Set(selected.map((s) => `${s.asset_class}:${s.symbol}`.toLowerCase())),
    [selected],
  )

  const loadPreview = useCallback(
    async (row) => {
      const key = `${row.asset_class}:${row.symbol}`.toLowerCase()
      if (previewByKey[key]) return previewByKey[key]
      const preview = await loungeMarketPreview(supabaseClient, {
        symbol: row.symbol,
        asset_class: row.asset_class,
      })
      if (preview) {
        setPreviewByKey((prev) => ({ ...prev, [key]: preview }))
      }
      return preview
    },
    [previewByKey, supabaseClient],
  )

  const toggleRow = useCallback(
    async (row) => {
      const key = `${row.asset_class}:${row.symbol}`.toLowerCase()
      if (selectedKeys.has(key)) {
        onChange(selected.filter((s) => `${s.asset_class}:${s.symbol}`.toLowerCase() !== key))
        return
      }
      if (selected.length >= LOUNGE_MARKET_EMBED_MAX) {
        setErr(`You can attach up to ${LOUNGE_MARKET_EMBED_MAX} charts.`)
        return
      }
      setErr('')
      const hasSearchQuote = row?.price != null && Number.isFinite(Number(row.price))
      const preview = hasSearchQuote
        ? {
            display_symbol: row.display_symbol || row.symbol,
            name: row.name || row.description || row.symbol,
            exchange: row.exchange || row.type || '',
            logo_url: row.logo_url || row.logo || '',
            market_cap: row.market_cap ?? null,
            currency: row.currency || 'USD',
            price: row.price,
            change_pct: row.change_pct,
          }
        : await loadPreview(row)
      onChange([
        ...selected,
        {
          symbol: row.symbol,
          asset_class: row.asset_class,
          display_symbol: preview?.display_symbol || row.display_symbol || row.symbol,
          name: preview?.name || row.description || row.symbol,
          exchange: preview?.exchange || row.exchange || '',
          logo_url: preview?.logo_url || row.logo_url || row.logo || '',
          market_cap: preview?.market_cap ?? null,
          currency: preview?.currency || 'USD',
          preview,
        },
      ])
    },
    [loadPreview, onChange, selected, selectedKeys],
  )

  useEffect(() => {
    if (!open) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[220] flex flex-col justify-end bg-black/55 backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 flex max-h-[82vh] flex-col rounded-t-3xl border border-zinc-700/80 bg-zinc-950 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 pb-3 pt-4">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold text-zinc-50">Market charts</div>
            <div className="text-xs text-zinc-500">
              Pick up to {LOUNGE_MARKET_EMBED_MAX} · window from caption: {windowInfo.windowLabel}
              {windowInfo.kind === 'historical' ? ' (snapshot)' : ' (live in feed)'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-zinc-200 touch-manipulation"
          >
            Done
          </button>
        </div>

        {selected.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto border-b border-zinc-800 px-3 py-2">
            {selected.map((s) => (
              <button
                key={`${s.asset_class}:${s.symbol}`}
                type="button"
                onClick={() =>
                  onChange(
                    selected.filter(
                      (x) => `${x.asset_class}:${x.symbol}`.toLowerCase() !== `${s.asset_class}:${s.symbol}`.toLowerCase(),
                    ),
                  )
                }
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-cyan-500/15 px-2.5 py-1 text-sm font-semibold text-cyan-300 touch-manipulation"
              >
                ${s.display_symbol || s.symbol}
                <span aria-hidden>×</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="px-4 py-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search stocks & crypto…"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-[15px] text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-600 focus:outline-none"
            autoFocus
          />
        </div>

        {err ? <div className="px-4 pb-2 text-sm text-rose-300">{err}</div> : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {loading ? <div className="px-3 py-6 text-center text-sm text-zinc-500">Searching…</div> : null}
          {!loading && debounced && results.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-zinc-500">No matches.</div>
          ) : null}
          {!debounced ? (
            <div className="px-3 py-6 text-center text-sm text-zinc-500">Type a ticker or company name.</div>
          ) : null}

          <ul className="space-y-1">
            {results.map((row) => {
              const key = `${row.asset_class}:${row.symbol}`.toLowerCase()
              const picked = selectedKeys.has(key)
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => void toggleRow(row)}
                    className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left touch-manipulation ${
                      picked ? 'bg-cyan-500/10 ring-1 ring-cyan-500/40' : 'hover:bg-zinc-900'
                    }`}
                  >
                    <LoungeMarketSearchResultRow row={row} />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
