import { useState } from 'react'
import {
  formatMarketCap,
  formatMarketChangePct,
  formatMarketPrice,
} from '../../utils/loungeMarketCaptionParse.js'

function marketSearchMetaLine(row) {
  const ticker = row?.display_symbol || row?.symbol || ''
  const exchange = String(row?.exchange || row?.type || '').trim()
  const cap = formatMarketCap(row?.market_cap)
  const parts = [ticker, exchange, cap !== '-' ? cap : ''].filter(Boolean)
  return parts.join(' · ')
}

function MarketSearchAvatar({ row, size = 'md' }) {
  const [imgOk, setImgOk] = useState(Boolean(row?.logo_url || row?.logo))
  const dim = size === 'sm' ? 'h-8 w-8 text-[11px]' : 'h-9 w-9 text-xs'
  const logo = row?.logo_url || row?.logo
  const initials = (row?.display_symbol || row?.symbol || '?').slice(0, 2)

  if (logo && imgOk) {
    return (
      <img
        src={logo}
        alt=""
        className={`${dim} shrink-0 rounded-full object-cover bg-zinc-800`}
        loading="lazy"
        decoding="async"
        onError={() => setImgOk(false)}
      />
    )
  }

  return (
    <div
      className={`flex ${dim} shrink-0 items-center justify-center rounded-full bg-zinc-800 font-bold text-zinc-300`}
    >
      {initials}
    </div>
  )
}

/**
 * Shared cashtag/picker search row - name, ticker · exchange · mcap, price + % change.
 */
export default function LoungeMarketSearchResultRow({ row, variant = 'default', className = '' }) {
  const compact = variant === 'compact'
  const name = row?.name || row?.description || row?.display_symbol || row?.symbol || ''
  const changePct = Number(row?.change_pct ?? row?.quote?.change_pct)
  const up = Number.isFinite(changePct) ? changePct >= 0 : true
  const price = row?.price ?? row?.quote?.price
  const meta = marketSearchMetaLine(row)

  return (
    <div className={`flex w-full items-center ${compact ? 'gap-2' : 'gap-3'} ${className}`}>
      <MarketSearchAvatar row={row} size={compact ? 'sm' : 'md'} />
      <div className="min-w-0 flex-1">
        <div
          className={`truncate font-semibold text-zinc-100 ${
            compact ? 'text-[13px] leading-tight' : 'text-[15px]'
          }`}
        >
          {name}
        </div>
        <div
          className={`truncate text-zinc-500 ${compact ? 'text-[11px] leading-tight' : 'text-xs'}`}
        >
          {meta}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div
          className={`font-semibold tabular-nums text-zinc-100 ${
            compact ? 'text-[13px]' : 'text-sm'
          }`}
        >
          {formatMarketPrice(price)}
        </div>
        <div
          className={`font-semibold tabular-nums ${compact ? 'text-[11px]' : 'text-xs'} ${
            up ? 'text-lv-green' : 'text-lv-red'
          }`}
        >
          {formatMarketChangePct(changePct)}
        </div>
      </div>
    </div>
  )
}
