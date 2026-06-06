import { useEffect, useRef } from 'react'
import { createChart, LineSeries } from 'lightweight-charts'
import {
  formatMarketChangePct,
  formatMarketEmbedWindowLabel,
  formatMarketPrice,
  marketEmbedCacheKey,
} from '../../utils/loungeMarketCaptionParse.js'
import { loungeMarketBarsToSeries, loungeMarketChartTheme } from './loungeMarketChartTheme.js'

/**
 * @param {{
 *   embed: object,
 *   rollingLive?: object | null,
 *   onOpen?: () => void,
 *   className?: string,
 * }} props
 */
export default function LoungeMarketChartMini({ embed, rollingLive = null, onOpen, className = '' }) {
  const hostRef = useRef(null)
  const chartRef = useRef(null)

  const isRolling = embed?.kind === 'rolling'
  const quote = isRolling && rollingLive?.quote ? rollingLive.quote : embed?.quote
  const bars = isRolling && rollingLive?.bars?.length ? rollingLive.bars : embed?.bars
  const windowLabel = formatMarketEmbedWindowLabel(embed, isRolling ? rollingLive : null)
  const changePct = Number(quote?.change_pct)
  const up = Number.isFinite(changePct) ? changePct >= 0 : true
  const theme = loungeMarketChartTheme()

  useEffect(() => {
    const el = hostRef.current
    if (!el) return undefined
    const chart = createChart(el, {
      width: el.clientWidth || 148,
      height: 52,
      layout: theme.layout,
      grid: theme.grid,
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      timeScale: { visible: false },
      crosshair: { vertLine: { visible: false }, horzLine: { visible: false } },
      handleScroll: false,
      handleScale: false,
    })
    const series = chart.addSeries(LineSeries, {
      color: up ? theme.upColor : theme.downColor,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    })
    series.setData(loungeMarketBarsToSeries(bars || []))
    chart.timeScale().fitContent()
    chartRef.current = chart

    const ro = new ResizeObserver(() => {
      if (!hostRef.current || !chartRef.current) return
      chartRef.current.applyOptions({ width: hostRef.current.clientWidth })
      chartRef.current.timeScale().fitContent()
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [embed?.symbol, embed?.kind, bars, up, theme])

  if (!embed?.display_symbol) return null

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onOpen?.()
      }}
      className={`relative flex w-[148px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border ${theme.cardBorder} ${theme.cardBg} p-2 text-left touch-manipulation active:opacity-90 ${className}`}
      data-lounge-market-chart-mini
      aria-label={`Open ${embed.display_symbol} chart`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <div className={`truncate text-[13px] font-bold ${theme.priceText}`}>
            ${embed.display_symbol}
          </div>
          <div className={`truncate text-[10px] ${theme.mutedText}`}>{windowLabel}</div>
        </div>
        {embed.logo_url ? (
          <img src={embed.logo_url} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
        ) : null}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className={`text-[12px] font-semibold tabular-nums ${theme.priceText}`}>
          {formatMarketPrice(quote?.price)}
        </span>
        <span
          className={`text-[11px] font-semibold tabular-nums ${up ? 'text-lv-green' : 'text-lv-red'}`}
        >
          {formatMarketChangePct(changePct)}
        </span>
      </div>
      <div ref={hostRef} className="mt-1 h-[52px] w-full" />
    </button>
  )
}

export { marketEmbedCacheKey }
