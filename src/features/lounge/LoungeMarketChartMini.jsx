import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AreaSeries, BaselineSeries, LineStyle, createChart } from 'lightweight-charts'
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
import {
  miniBaselineSeriesOptions,
  miniSparklineColor,
  resolveMiniSparklineStyle,
} from './loungeMarketMiniSparkline.js'

/**
 * Feed / composer market mini … Apple-style blend:
 * logo · ticker+arrow / name · sparkline · price / change
 *
 * Compact (default): tall spark beside the two-line text stack; name under ticker.
 * Wide name: when that name would truncate at 38% width, spark shrinks to the
 * ticker row and the name spans under ticker + spark (same vertical band;
 * still truncates before price).
 *
 * Sparkline: dashed open (tint vs prior close); BaselineSeries green above /
 * red below open with fill toward the open line.
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
const MINI_SPARKLINE_MIN_PX = 48
const MINI_SPARKLINE_HEIGHT_PX = 40
/** Wide-name mode: spark shares the ticker row only so the name band stays put. */
const MINI_SPARKLINE_HEIGHT_WIDE_PX = 22
const MINI_CARD_CLASS = 'h-[4.25rem] min-h-[4.25rem]'
const MINI_CARD_BORDER_CLASS = 'border-zinc-700/55'
/** Compact left column = max-w-[38%]; probe uses the same budget. */
const MINI_COMPACT_NAME_PROBE_CLASS =
  'pointer-events-none absolute left-0 top-0 w-[38%] overflow-hidden whitespace-nowrap text-[13px] font-medium opacity-0'

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
  const cardRef = useRef(null)
  const nameProbeRef = useRef(null)
  const hostRef = useRef(null)
  const chartRef = useRef(null)
  const tapRef = useRef(/** @type {{ x: number, y: number, pointerId: number } | null} */ (null))
  const [wideName, setWideName] = useState(false)

  const isRolling = embed?.kind === 'rolling'
  const rollingPayload = isRolling ? pickRollingMarketPayload(embed, rollingLive) : null
  const quote = isRolling ? rollingPayload?.quote : embed?.quote
  const bars = isRolling ? rollingPayload?.bars : embed?.bars
  const changePct = Number(quote?.change_pct)
  const changeAbs = Number(quote?.change)
  /** Day change vs prior close (labels / ▲▼). */
  const dayUp = Number.isFinite(changePct)
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
  const sparkStyle = resolveMiniSparklineStyle(bars, quote, { compareMode, assetClass })
  const sparkHeightPx = wideName ? MINI_SPARKLINE_HEIGHT_WIDE_PX : MINI_SPARKLINE_HEIGHT_PX

  useLayoutEffect(() => {
    const card = cardRef.current
    const probe = nameProbeRef.current
    if (!card || !probe) return undefined

    const check = () => {
      const overflows = probe.scrollWidth > probe.clientWidth + 1
      setWideName((prev) => (prev === overflows ? prev : overflows))
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(card)
    return () => ro.disconnect()
  }, [displayName])

  useEffect(() => {
    const el = hostRef.current
    if (!el) return undefined
    const chart = createChart(el, {
      width: Math.max(MINI_SPARKLINE_MIN_PX, el.clientWidth || MINI_SPARKLINE_MIN_PX),
      height: sparkHeightPx,
      layout: theme.layout,
      grid: theme.grid,
      localization: marketChartLocalizationBase(),
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      timeScale: { visible: false, rightOffset: 0, fixLeftEdge: true, fixRightEdge: true },
      crosshair: { vertLine: { visible: false }, horzLine: { visible: false } },
      handleScroll: false,
      handleScale: false,
    })

    const openBase =
      sparkStyle.openLinePrice != null && Number.isFinite(sparkStyle.openLinePrice)
        ? sparkStyle.openLinePrice
        : null

    const series =
      openBase != null
        ? chart.addSeries(BaselineSeries, miniBaselineSeriesOptions(isLight, openBase))
        : chart.addSeries(AreaSeries, {
            lineColor: miniSparklineColor(sparkStyle.sparkUp, isLight, 'line'),
            topColor: miniSparklineColor(sparkStyle.sparkUp, isLight, 'top'),
            bottomColor: miniSparklineColor(sparkStyle.sparkUp, isLight, 'bottom'),
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          })
    series.setData(seriesBars)

    if (openBase != null) {
      series.createPriceLine({
        price: openBase,
        color: miniSparklineColor(sparkStyle.openUp, isLight, 'dash'),
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        lineVisible: true,
        axisLabelVisible: false,
        title: '',
      })
    }

    const applyVisibleRange = () => {
      if (
        sparkStyle.fromSec != null &&
        sparkStyle.toSec != null &&
        sparkStyle.toSec > sparkStyle.fromSec &&
        seriesBars.length >= 2
      ) {
        try {
          chart.timeScale().setVisibleRange({
            from: sparkStyle.fromSec,
            to: sparkStyle.toSec,
          })
          return
        } catch {
          /* fall through */
        }
      }
      chart.timeScale().fitContent()
    }
    applyVisibleRange()
    chartRef.current = chart

    const ro = new ResizeObserver(() => {
      if (!hostRef.current || !chartRef.current) return
      chartRef.current.applyOptions({ width: hostRef.current.clientWidth })
      applyVisibleRange()
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [
    embed?.symbol,
    embed?.kind,
    seriesBars,
    sparkStyle.sparkUp,
    sparkStyle.openUp,
    sparkStyle.openLinePrice,
    sparkStyle.fromSec,
    sparkStyle.toSec,
    isLight,
    theme,
    sparkHeightPx,
  ])

  const priceLabel = formatMarketPrice(quote?.price)
  const changeLabel = formatMiniChangeLabel(quote?.change, changePct)
  const changeTone = dayUp ? 'text-lv-green lounge-cashtag-positive' : 'text-lv-red'
  const arrow = dayUp ? '▲' : '▼'

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

  /**
   * One grid for both modes so ticker/name/price/change share the same vertical
   * bands. Compact: tall spark spans both rows. Wide: short spark on ticker row;
   * name spans under ticker + spark.
   */
  const gridCols = wideName
    ? 'grid-cols-[auto_minmax(0,max-content)_minmax(3rem,1fr)_auto]'
    : 'grid-cols-[auto_minmax(0,38%)_minmax(3rem,1fr)_auto]'

  return (
    <div
      ref={cardRef}
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
      className={`relative grid ${MINI_CARD_CLASS} ${gridCols} min-w-0 shrink-0 snap-start grid-rows-[auto_auto] content-center items-center gap-x-2.5 gap-y-0.5 overflow-hidden rounded-2xl border bg-gradient-to-br from-zinc-900/95 via-zinc-950 to-zinc-900/90 px-3 py-1 text-left [touch-action:pan-x_pan-y] cursor-pointer active:opacity-90 [-webkit-tap-highlight-color:transparent] ${MINI_CARD_BORDER_CLASS} ${className}`}
      data-lounge-market-chart-mini
      data-asset-class={assetClass}
      data-wide-name={wideName ? '1' : '0'}
      aria-label={`Open ${displaySymbol} chart`}
    >
      {/* Compact-column probe: wide layout only when this name would truncate at 38%. */}
      <span ref={nameProbeRef} className={MINI_COMPACT_NAME_PROBE_CLASS} aria-hidden>
        {displayName}
      </span>

      {embed.logo_url ? (
        <img
          src={embed.logo_url}
          alt=""
          className="col-start-1 row-span-2 h-9 w-9 shrink-0 self-center rounded-full border border-zinc-700/50 object-cover"
        />
      ) : (
        <div
          className="col-start-1 row-span-2 flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full border border-zinc-700/50 bg-zinc-800/90 text-[11px] font-bold text-zinc-300"
          aria-hidden
        >
          {displaySymbol.slice(0, 2)}
        </div>
      )}

      <div className="col-start-2 row-start-1 flex min-w-0 max-w-full items-center gap-1 self-center">
        <span className={`shrink-0 text-[12px] leading-none ${changeTone}`} aria-hidden>
          {arrow}
        </span>
        <span
          className={`min-w-0 truncate text-[15px] font-bold leading-snug tracking-wide ${theme.priceText}`}
        >
          {displaySymbol}
        </span>
      </div>

      <div
        ref={hostRef}
        className={`pointer-events-none col-start-3 w-full min-w-12 ${
          wideName ? 'row-start-1 self-center' : 'row-span-2 self-center'
        }`}
        style={{ height: sparkHeightPx }}
        aria-hidden
      />

      <div
        className={`col-start-4 row-start-1 self-center whitespace-nowrap pl-0.5 text-right text-[15px] font-bold tabular-nums leading-snug ${theme.priceText}`}
      >
        {priceLabel}
      </div>

      <div
        className={`row-start-2 min-w-0 truncate text-[13px] font-medium leading-snug ${theme.mutedText} ${
          wideName ? 'col-start-2 col-span-2' : 'col-start-2'
        }`}
      >
        {displayName}
      </div>

      <div
        className={`col-start-4 row-start-2 self-center whitespace-nowrap pl-0.5 text-right text-[13px] font-semibold tabular-nums leading-snug ${changeTone}`}
      >
        {changeLabel}
      </div>
    </div>
  )
}

export { marketEmbedCacheKey }
