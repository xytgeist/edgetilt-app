import { useEffect, useRef } from 'react'
import { AreaSeries, createChart } from 'lightweight-charts'
import {
  formatMarketChangePct,
  formatMarketPrice,
  marketEmbedCacheKey,
  pickRollingMarketPayload,
} from '../../utils/loungeMarketCaptionParse.js'
import {
  loungeMarketBarsToPercentSeries,
  loungeMarketBarsToSeries,
  loungeMarketChartIsLight,
  loungeMarketChartTheme,
} from './loungeMarketChartTheme.js'
import { marketChartLocalizationBase } from './loungeMarketChartLocale.js'

/**
 * Feed / composer market mini … Apple-style blend:
 * logo · ticker+arrow / name · sparkline · price / change
 *
 * @param {{
 *   embed: object,
 *   rollingLive?: object | null,
 *   compareMode?: boolean,
 *   onOpen?: () => void,
 *   className?: string,
 * }} props
 */
const MINI_CHART_TAP_MOVE_PX = 12
const MINI_SPARKLINE_MIN_PX = 40
const MINI_SPARKLINE_HEIGHT_PX = 32
const MINI_CARD_CLASS = 'h-[3.5rem] min-h-[3.5rem]'
const MINI_SPARKLINE_HOST_CLASS = 'h-[32px] min-w-10 flex-1'

const MINI_CARD_BORDER_CLASS = 'border-zinc-700/55'

/** Absolute $ change when available; else pct. */
function formatMiniChangeLabel(change, changePct) {
  const ch = Number(change)
  if (Number.isFinite(ch)) {
    const abs = formatMarketPrice(Math.abs(ch))
    if (ch > 0) return `+${abs}`
    if (ch < 0) return `-${abs}`
    return abs
  }
  return formatMarketChangePct(changePct)
}

export default function LoungeMarketChartMini({
  embed,
  rollingLive = null,
  compareMode = false,
  onOpen,
  className = '',
}) {
  const hostRef = useRef(null)
  const chartRef = useRef(null)
  const tapRef = useRef(/** @type {{ x: number, y: number, pointerId: number } | null} */ (null))

  const isRolling = embed?.kind === 'rolling'
  const rollingPayload = isRolling ? pickRollingMarketPayload(embed, rollingLive) : null
  const quote = isRolling ? rollingPayload?.quote : embed?.quote
  const bars = isRolling ? rollingPayload?.bars : embed?.bars
  const changePct = Number(quote?.change_pct)
  const changeAbs = Number(quote?.change)
  const up = Number.isFinite(changePct)
    ? changePct >= 0
    : Number.isFinite(changeAbs)
      ? changeAbs >= 0
      : true
  const isLight = loungeMarketChartIsLight()
  const theme = loungeMarketChartTheme(isLight)
  const displaySymbol = String(embed?.display_symbol || '').trim().toUpperCase()
  const displayName = String(embed?.name || displaySymbol).trim() || displaySymbol
  const assetClass = embed?.asset_class === 'crypto' ? 'crypto' : 'stock'
  const seriesBars = compareMode
    ? loungeMarketBarsToPercentSeries(bars || [])
    : loungeMarketBarsToSeries(bars || [])

  useEffect(() => {
    const el = hostRef.current
    if (!el) return undefined
    const chart = createChart(el, {
      width: Math.max(MINI_SPARKLINE_MIN_PX, el.clientWidth || MINI_SPARKLINE_MIN_PX),
      height: MINI_SPARKLINE_HEIGHT_PX,
      layout: theme.layout,
      grid: theme.grid,
      localization: marketChartLocalizationBase(),
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      timeScale: { visible: false },
      crosshair: { vertLine: { visible: false }, horzLine: { visible: false } },
      handleScroll: false,
      handleScale: false,
    })
    const lineColor = up ? theme.upColor : theme.downColor
    const topColor = up
      ? isLight
        ? 'rgba(22, 163, 74, 0.22)'
        : 'rgba(34, 197, 94, 0.28)'
      : isLight
        ? 'rgba(220, 38, 38, 0.22)'
        : 'rgba(239, 68, 68, 0.28)'
    const bottomColor = up
      ? isLight
        ? 'rgba(22, 163, 74, 0)'
        : 'rgba(34, 197, 94, 0)'
      : isLight
        ? 'rgba(220, 38, 38, 0)'
        : 'rgba(239, 68, 68, 0)'

    const series = chart.addSeries(AreaSeries, {
      lineColor,
      topColor,
      bottomColor,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    })
    series.setData(seriesBars)
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
  }, [embed?.symbol, embed?.kind, seriesBars, up, isLight, theme])

  const priceLabel = formatMarketPrice(quote?.price)
  const changeLabel = formatMiniChangeLabel(quote?.change, changePct)
  const changeTone = up ? 'text-lv-green lounge-cashtag-positive' : 'text-lv-red'
  const arrow = up ? '▲' : '▼'

  if (!embed?.display_symbol) return null

  const onCardPointerDown = (e) => {
    tapRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId }
  }

  const onCardPointerUp = (e) => {
    const start = tapRef.current
    tapRef.current = null
    if (!start || start.pointerId !== e.pointerId) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    const distSq = dx * dx + dy * dy
    if (distSq > MINI_CHART_TAP_MOVE_PX * MINI_CHART_TAP_MOVE_PX) return
    if (Math.abs(dx) > Math.abs(dy)) return
    e.stopPropagation()
    onOpen?.()
  }

  const onCardPointerCancel = (e) => {
    if (tapRef.current?.pointerId === e.pointerId) tapRef.current = null
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={onCardPointerDown}
      onPointerUp={onCardPointerUp}
      onPointerCancel={onCardPointerCancel}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        e.stopPropagation()
        onOpen?.()
      }}
      className={`relative flex ${MINI_CARD_CLASS} min-w-0 shrink-0 snap-start items-center gap-2 overflow-hidden rounded-2xl border bg-gradient-to-br from-zinc-900/95 via-zinc-950 to-zinc-900/90 px-2.5 py-0.5 text-left [touch-action:pan-x_pan-y] cursor-pointer active:opacity-90 [-webkit-tap-highlight-color:transparent] ${MINI_CARD_BORDER_CLASS} ${className}`}
      data-lounge-market-chart-mini
      data-asset-class={assetClass}
      aria-label={`Open ${displaySymbol} chart`}
    >
      {embed.logo_url ? (
        <img
          src={embed.logo_url}
          alt=""
          className="h-7 w-7 shrink-0 rounded-full border border-zinc-700/50 object-cover"
        />
      ) : (
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-700/50 bg-zinc-800/90 text-[9px] font-bold text-zinc-300"
          aria-hidden
        >
          {displaySymbol.slice(0, 2)}
        </div>
      )}

      <div className="flex min-w-0 max-w-[38%] shrink-0 flex-col items-start justify-center gap-px overflow-hidden">
        <div className="flex min-w-0 max-w-full items-center gap-1">
          <span className={`shrink-0 text-[10px] leading-none ${changeTone}`} aria-hidden>
            {arrow}
          </span>
          <span
            className={`min-w-0 truncate text-[13px] font-bold leading-snug tracking-wide ${theme.priceText}`}
          >
            {displaySymbol}
          </span>
        </div>
        <div className={`w-full min-w-0 truncate text-[11px] font-medium leading-snug ${theme.mutedText}`}>
          {displayName}
        </div>
      </div>

      <div
        ref={hostRef}
        className={`pointer-events-none ${MINI_SPARKLINE_HOST_CLASS} self-center`}
        aria-hidden
      />

      <div className="flex shrink-0 flex-col items-end justify-center gap-px pl-0.5 text-right">
        <div className={`whitespace-nowrap text-[13px] font-bold tabular-nums leading-snug ${theme.priceText}`}>
          {priceLabel}
        </div>
        <div className={`whitespace-nowrap text-[11px] font-semibold tabular-nums leading-snug ${changeTone}`}>
          {changeLabel}
        </div>
      </div>
    </div>
  )
}

export { marketEmbedCacheKey }
