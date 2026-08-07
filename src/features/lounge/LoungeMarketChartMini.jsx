import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AreaSeries, BaselineSeries, LineStyle, createChart } from 'lightweight-charts'
import {
  formatMarketChangePct,
  formatMarketEmbedWindowLabel,
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
 * Compact (default): flex row with tall spark `flex-1` (full leftover width).
 * Wide name: when the name would truncate at 38% width, spark shrinks onto the
 * ticker row and the name runs under ticker + spark (same vertical band;
 * truncates before price). Historical (non-today) windows show a tiny date
 * centered under the sparkline.
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
const MINI_CARD_CLASS_WITH_RANGE = 'h-[4.75rem] min-h-[4.75rem]'
const MINI_CARD_BORDER_CLASS = 'border-zinc-700/55'
/** Historical only … centered under the spark (hidden for default today / rolling). */
const MINI_RANGE_CLASS =
  'w-full min-w-0 truncate text-center text-[10px] font-medium leading-tight text-zinc-500'
/** Off-screen probe sized in px to the compact name budget (38% of card). */
const MINI_COMPACT_NAME_PROBE_CLASS =
  'pointer-events-none absolute -left-[9999px] top-0 overflow-hidden whitespace-nowrap text-[13px] font-medium'

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
  const compactNameRef = useRef(null)
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
  /** Default today / live rolling … no date. Historical caption windows only. */
  const rangeLabel =
    !isRolling && embed?.kind === 'historical'
      ? formatMarketEmbedWindowLabel(embed, null)
      : ''
  const showRange = Boolean(rangeLabel)
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

    const contentBoxWidth = () => {
      const cs = getComputedStyle(card)
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
      // max-w-[38%] is % of the content box; clientWidth includes padding and was too generous
      // (medium-long names like "UWM Holdings Corp" looked like they fit → stuck compact).
      return Math.max(0, card.clientWidth - padX)
    }

    const check = () => {
      const innerW = contentBoxWidth()
      if (innerW < 32) {
        setWideName(false)
        return
      }
      const budget = Math.floor(innerW * 0.38)
      probe.style.width = `${budget}px`
      let overflows = probe.scrollWidth > probe.clientWidth + 1
      // Ground truth while compact: if the real name node is ellipsizing, go wide.
      const compactName = compactNameRef.current
      if (compactName && compactName.scrollWidth > compactName.clientWidth + 1) {
        overflows = true
      }
      setWideName((prev) => (prev === overflows ? prev : overflows))
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(card)
    let cancelled = false
    const fontsReady =
      typeof document !== 'undefined' && document.fonts?.ready
        ? document.fonts.ready.then(() => {
            if (!cancelled) check()
          })
        : null
    return () => {
      cancelled = true
      ro.disconnect()
      void fontsReady
    }
  }, [displayName, wideName])

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

    const syncWidth = () => {
      if (!hostRef.current || !chartRef.current) return
      const w = hostRef.current.clientWidth
      if (w < 8) return
      chartRef.current.applyOptions({ width: w })
      applyVisibleRange()
    }
    // Flex leftover width often resolves a frame after mount.
    const raf = requestAnimationFrame(syncWidth)
    const ro = new ResizeObserver(syncWidth)
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
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
    wideName,
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

  const logo = embed.logo_url ? (
    <img
      src={embed.logo_url}
      alt=""
      className="h-9 w-9 shrink-0 rounded-full border border-zinc-700/50 object-cover"
    />
  ) : (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-700/50 bg-zinc-800/90 text-[11px] font-bold text-zinc-300"
      aria-hidden
    >
      {displaySymbol.slice(0, 2)}
    </div>
  )

  const tickerRow = (
    <div className="flex min-w-0 max-w-full items-center gap-1">
      <span className={`shrink-0 text-[12px] leading-none ${changeTone}`} aria-hidden>
        {arrow}
      </span>
      <span
        className={`min-w-0 truncate text-[15px] font-bold leading-snug tracking-wide ${theme.priceText}`}
      >
        {displaySymbol}
      </span>
    </div>
  )

  const priceStack = (
    <div className="flex shrink-0 flex-col items-end justify-center gap-0.5 pl-0.5 text-right">
      <div className={`whitespace-nowrap text-[15px] font-bold tabular-nums leading-snug ${theme.priceText}`}>
        {priceLabel}
      </div>
      <div className={`whitespace-nowrap text-[13px] font-semibold tabular-nums leading-snug ${changeTone}`}>
        {changeLabel}
      </div>
    </div>
  )

  const sparkColumn = (
    <div className="flex min-w-12 flex-1 flex-col items-stretch justify-center gap-0.5 self-center">
      <div
        ref={hostRef}
        className="pointer-events-none w-full"
        style={{ height: sparkHeightPx }}
        aria-hidden
      />
      {showRange ? <div className={MINI_RANGE_CLASS}>{rangeLabel}</div> : null}
    </div>
  )

  const cardHeightClass = showRange ? MINI_CARD_CLASS_WITH_RANGE : MINI_CARD_CLASS

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
      className={`relative flex ${cardHeightClass} min-w-0 shrink-0 snap-start items-center gap-2.5 overflow-hidden rounded-2xl border bg-gradient-to-br from-zinc-900/95 via-zinc-950 to-zinc-900/90 px-3 py-1 text-left [touch-action:pan-x_pan-y] cursor-pointer active:opacity-90 [-webkit-tap-highlight-color:transparent] ${MINI_CARD_BORDER_CLASS} ${className}`}
      data-lounge-market-chart-mini
      data-asset-class={assetClass}
      data-wide-name={wideName ? '1' : '0'}
      data-mini-range={showRange ? '1' : '0'}
      aria-label={`Open ${displaySymbol} chart`}
    >
      <span ref={nameProbeRef} className={MINI_COMPACT_NAME_PROBE_CLASS} aria-hidden>
        {displayName}
      </span>

      {logo}

      {wideName ? (
        <>
          {/* Middle column grows; spark flex-1 on ticker row; name underneath at compact Y. */}
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 overflow-hidden">
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 shrink-0">{tickerRow}</div>
              {sparkColumn}
            </div>
            <div className={`min-w-0 truncate text-[13px] font-medium leading-snug ${theme.mutedText}`}>
              {displayName}
            </div>
          </div>
          {priceStack}
        </>
      ) : (
        <>
          <div className="flex min-w-0 max-w-[38%] shrink-0 flex-col items-start justify-center gap-0.5 overflow-hidden">
            {tickerRow}
            <div
              ref={compactNameRef}
              className={`w-full min-w-0 truncate text-[13px] font-medium leading-snug ${theme.mutedText}`}
            >
              {displayName}
            </div>
          </div>
          {sparkColumn}
          {priceStack}
        </>
      )}
    </div>
  )
}

export { marketEmbedCacheKey }
