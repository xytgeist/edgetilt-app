import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { feedPostDisplayCaption } from '../../utils/communityFeedPost.js'
import {
  cashtagFinnhubSymbol,
  extractCashtagsFromCaption,
  guessCashtagAssetClass,
  coingeckoCoinIdForTicker,
  normalizeMarketEmbeds,
} from '../../utils/loungeMarketCaptionParse.js'
import { loungeMarketBatchRolling } from '../../utils/loungeMarketApi.js'
import { isUsEquityRegularSessionOpen } from '../../utils/usEquityMarketSession.js'
import {
  isLoungeMarketPollAllowed,
  markLoungeUserActivity,
  useLoungeMarketPollOnResume,
} from './loungeMarketPollActivity.js'

/** @type {React.Context<{ quotes: Record<string, object>, cashtagQuotesByTicker: Record<string, { change_pct: number }>, refresh: () => void } | null>} */
const LoungeMarketFeedContext = createContext(null)

/**
 * @param {{
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   posts: object[],
 *   feedActive?: boolean,
 *   children: React.ReactNode,
 * }} props
 */
export function LoungeMarketFeedProvider({ supabaseClient, posts, feedActive = true, children }) {
  const [quotes, setQuotes] = useState(/** @type {Record<string, object>} */ ({}))
  const [cashtagQuotesByTicker, setCashtagQuotesByTicker] = useState(
    /** @type {Record<string, { change_pct: number }>} */ ({}),
  )
  const inflightRef = useRef(false)

  const symbolItems = useMemo(() => {
    /** @type {Array<{ symbol: string, asset_class: string, cacheKey: string, displayTicker: string, coin_id?: string }>} */
    const items = []
    const seen = new Set()
    const embedClassByTicker = new Map()

    for (const post of posts || []) {
      for (const embed of normalizeMarketEmbeds(post?.market_embeds)) {
        const ticker = String(embed.display_symbol || embed.symbol || '').trim().toUpperCase()
        if (ticker && embed.asset_class) embedClassByTicker.set(ticker, embed.asset_class)
      }
    }

    const addItem = (displayTicker, assetClass, finnhubSymbol, coinId = '') => {
      const ticker = String(displayTicker || '').trim().toUpperCase()
      const sym = String(finnhubSymbol || '').trim()
      if (!ticker || !sym) return
      const cacheKey = `${assetClass}:${sym}`.toLowerCase()
      if (seen.has(cacheKey)) return
      seen.add(cacheKey)
      const resolvedCoinId =
        String(coinId || '').trim() ||
        (assetClass === 'crypto' ? coingeckoCoinIdForTicker(ticker) : '')
      items.push({
        symbol: sym,
        asset_class: assetClass,
        cacheKey,
        displayTicker: ticker,
        ...(resolvedCoinId ? { coin_id: resolvedCoinId } : {}),
      })
    }

    for (const post of posts || []) {
      for (const embed of normalizeMarketEmbeds(post?.market_embeds)) {
        if (embed.kind !== 'rolling') continue
        const ticker = String(embed.display_symbol || embed.symbol || '').trim().toUpperCase()
        addItem(ticker, embed.asset_class, embed.symbol, embed.coin_id)
      }

      const caption = feedPostDisplayCaption(post)
      for (const raw of extractCashtagsFromCaption(caption)) {
        const ticker = String(raw || '').trim().toUpperCase()
        if (!ticker) continue
        const assetClass = guessCashtagAssetClass(ticker, embedClassByTicker)
        addItem(ticker, assetClass, cashtagFinnhubSymbol(ticker, assetClass))
      }
    }

    return items
  }, [posts])

  const seededCashtagQuotes = useMemo(() => {
    const byTicker = {}
    for (const post of posts || []) {
      for (const embed of normalizeMarketEmbeds(post?.market_embeds)) {
        const ticker = String(embed.display_symbol || embed.symbol || '').trim().toUpperCase()
        const pct = Number(embed?.quote?.change_pct)
        if (ticker && Number.isFinite(pct)) byTicker[ticker] = { change_pct: pct }
      }
    }
    return byTicker
  }, [posts])

  useEffect(() => {
    setCashtagQuotesByTicker((prev) => ({ ...seededCashtagQuotes, ...prev }))
  }, [seededCashtagQuotes])

  const refresh = useCallback(async (/** @type {{ forceRefresh?: boolean }} */ options = {}) => {
    if (!supabaseClient || !symbolItems.length || inflightRef.current) return
    const pollItems = isUsEquityRegularSessionOpen()
      ? symbolItems
      : symbolItems.filter((item) => item.asset_class !== 'stock')
    if (!pollItems.length) return
    inflightRef.current = true
    try {
      const batch = await loungeMarketBatchRolling(
        supabaseClient,
        pollItems.map(({ symbol, asset_class, coin_id }) => ({
          symbol,
          asset_class,
          ...(coin_id ? { coin_id } : {}),
        })),
        { refresh: options.forceRefresh === true },
      )
      if (!batch || typeof batch !== 'object') return
      const next = {}
      const byTicker = {}
      for (const item of pollItems) {
        const payload = batch[item.cacheKey]
        if (payload) next[item.cacheKey] = payload
        const pct = Number(payload?.quote?.change_pct)
        if (payload && Number.isFinite(pct) && item.displayTicker) {
          byTicker[item.displayTicker] = { change_pct: pct }
        }
      }
      setQuotes((prev) => ({ ...prev, ...next }))
      setCashtagQuotesByTicker((prev) => ({ ...seededCashtagQuotes, ...prev, ...byTicker }))
    } finally {
      inflightRef.current = false
    }
  }, [seededCashtagQuotes, supabaseClient, symbolItems])

  const pollIfAllowed = useCallback(
    (/** @type {{ forceRefresh?: boolean }} */ options = {}) => {
      if (!isLoungeMarketPollAllowed({ requireFeedActive: true, feedActive })) return
      void refresh(options)
    },
    [feedActive, refresh],
  )

  useLoungeMarketPollOnResume(() => pollIfAllowed(), {
    requireFeedActive: true,
    feedActive,
    enabled: feedActive,
  })

  useEffect(() => {
    if (!feedActive) return undefined
    markLoungeUserActivity()
    pollIfAllowed()
    const id = window.setInterval(() => pollIfAllowed(), 90_000)
    return () => window.clearInterval(id)
  }, [feedActive, pollIfAllowed])

  const value = useMemo(
    () => ({ quotes, cashtagQuotesByTicker, refresh }),
    [quotes, cashtagQuotesByTicker, refresh],
  )
  return <LoungeMarketFeedContext.Provider value={value}>{children}</LoungeMarketFeedContext.Provider>
}

export function useLoungeMarketFeedQuotes() {
  const ctx = useContext(LoungeMarketFeedContext)
  return ctx || { quotes: {}, cashtagQuotesByTicker: {}, refresh: () => {} }
}

export { collectRollingMarketSymbols, marketEmbedCacheKey } from '../../utils/loungeMarketCaptionParse.js'
