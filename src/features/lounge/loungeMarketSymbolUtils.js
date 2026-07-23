/** Dedupe key for composer chart picker pills / attach rows. */
export function marketSymbolDedupeKey(row) {
  return `${row?.asset_class || 'stock'}:${row?.symbol || ''}`.toLowerCase()
}

/** Picker row explicitly chosen for a caption cashtag (`display_symbol` = tag). */
export function getComposerMarketSymbolForCashtag(symbols, tag) {
  const t = String(tag || '').trim().toUpperCase()
  if (!t) return null
  return (
    (symbols || []).find((s) => String(s.display_symbol || '').trim().toUpperCase() === t) || null
  )
}

/**
 * Replace any prior picker row for `tag` and append the chosen instrument (respects embed max).
 * @param {object[]} symbols
 * @param {string} tag
 * @param {object} row
 * @param {number} [max]
 */
export function mergeComposerMarketSymbolForCashtag(symbols, tag, row, max = 12) {
  const t = String(tag || '').trim().toUpperCase()
  const sym = String(row?.symbol || '').trim()
  if (!t || !sym) return symbols || []
  const asset_class = String(row?.asset_class || 'stock').trim() === 'crypto' ? 'crypto' : 'stock'
  const key = marketSymbolDedupeKey({ symbol: sym, asset_class })
  const next = (symbols || []).filter((s) => {
    const ds = String(s.display_symbol || '').trim().toUpperCase()
    if (ds === t) return false
    return marketSymbolDedupeKey(s) !== key
  })
  next.push({
    symbol: sym,
    asset_class,
    display_symbol: t,
    name: row.name,
    exchange: row.exchange,
    logo_url: row.logo_url,
    market_cap: row.market_cap,
  })
  return next.slice(0, max)
}
