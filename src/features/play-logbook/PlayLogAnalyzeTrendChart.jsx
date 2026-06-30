import { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

/**
 * Legend icon: horizontal line with a circle (matches line-chart series).
 * @param {string} color
 * @param {number} [lineWidth]
 * @param {number[] | undefined} [borderDash]
 */
function lineCircleLegendIcon(color, lineWidth = 2.5, borderDash) {
  const width = 28
  const height = 12
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return 'circle'

  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  if (borderDash?.length) ctx.setLineDash(borderDash)
  ctx.beginPath()
  ctx.moveTo(1, height / 2)
  ctx.lineTo(width - 1, height / 2)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.arc(width / 2, height / 2, 3.5, 0, Math.PI * 2)
  ctx.fill()

  return canvas
}

/** @typedef {import('./playLogAnalyzeChart.js').PlayLogAnalyzeTrendSeries} PlayLogAnalyzeTrendSeries */

/**
 * @param {string | null | undefined} iso
 */
function fmtTrendTooltipDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * @param {number | null | undefined} pct
 */
function fmtRtpPct(pct) {
  if (pct == null || !Number.isFinite(pct)) return '-'
  return `${pct.toFixed(2)}%`
}

/**
 * @param {number | null | undefined} n
 */
function fmtMoneyShort(n) {
  if (n == null || !Number.isFinite(n)) return '-'
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs >= 1000) return `${sign}$${Math.round(abs).toLocaleString()}`
  return `${sign}$${abs.toFixed(abs >= 100 ? 0 : 2)}`
}

/**
 * @param {PlayLogAnalyzeTrendSeries} series
 */
export default function PlayLogAnalyzeTrendChart({ series }) {
  const isLight =
    typeof document !== 'undefined' && document.documentElement.classList.contains('light')

  const chartAxisColor = isLight ? '#18181b' : '#a1a1aa'
  const chartGridColor = isLight ? '#d4d4d8' : '#3f3f46'
  const chartBgPlugins = isLight
    ? [
        {
          id: 'playLogChartAreaBg',
          beforeDraw(chart) {
            const { ctx } = chart
            ctx.save()
            ctx.fillStyle = '#e4e4e7'
            ctx.fillRect(0, 0, chart.width, chart.height)
            ctx.restore()
          },
        },
      ]
    : []

  const chartData = useMemo(() => {
    const realized = series.points.map(p => p.realizedCumulativePct)
    /** @type {import('chart.js').ChartDataset<'line'>[]} */
    const datasets = []

    if (series.hasPnlTrend) {
      datasets.push({
        label: 'Cumulative net P/L',
        data: series.points.map(p => p.cumulativeNetUsd),
        yAxisID: 'yPnl',
        borderColor: isLight ? '#059669' : '#34d399',
        backgroundColor: 'transparent',
        tension: 0.25,
        borderWidth: 2.5,
        pointRadius: series.points.length > 24 ? 0 : 3,
        pointHoverRadius: 5,
        pointStyle: 'circle',
        fill: false,
        spanGaps: false,
      })
    }

    datasets.push({
      label: 'Realized RTP (cumulative)',
      data: realized,
      yAxisID: 'yRtp',
      borderColor: isLight ? '#0891b2' : '#22d3ee',
      backgroundColor: isLight ? 'rgba(8, 145, 178, 0.12)' : 'rgba(34, 211, 238, 0.12)',
      tension: 0.25,
      borderWidth: 2.5,
      pointRadius: series.points.length > 24 ? 0 : 3,
      pointHoverRadius: 5,
      pointStyle: 'circle',
      fill: true,
      spanGaps: false,
    })

    return { labels: series.labels, datasets }
  }, [series, isLight])

  const legendLabelGenerator = useMemo(
    () => ({
      generateLabels(chart) {
        return ChartJS.defaults.plugins.legend.labels
          .generateLabels(chart)
          .map(item => {
            const ds = chart.data.datasets[item.datasetIndex]
            if (!ds) return item
            const color = String(ds.borderColor ?? item.strokeStyle ?? chartAxisColor)
            item.pointStyle = lineCircleLegendIcon(
              color,
              typeof ds.borderWidth === 'number' ? ds.borderWidth : 2,
              Array.isArray(ds.borderDash) ? ds.borderDash : undefined,
            )
            return item
          })
      },
    }),
    [chartAxisColor],
  )

  const rtpYBounds = useMemo(() => {
    const vals = series.points.map(p => p.realizedCumulativePct).filter(
      v => v != null && Number.isFinite(v),
    )
    if (!vals.length) return { min: 0, max: 120 }
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const pad = Math.max(4, (max - min) * 0.12)
    return {
      min: Math.max(0, Math.floor(min - pad)),
      max: Math.ceil(max + pad),
    }
  }, [series.points])

  const pnlYBounds = useMemo(() => {
    const vals = series.points
      .map(p => p.cumulativeNetUsd)
      .filter(v => v != null && Number.isFinite(v))
    if (!vals.length) return { min: -100, max: 100 }
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const pad = Math.max(25, (max - min) * 0.15)
    return {
      min: Math.floor(min - pad),
      max: Math.ceil(max + pad),
    }
  }, [series.points])

  const showLegend = series.hasPnlTrend

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      scales: {
        x: {
          title: { display: true, text: 'Plays', color: chartAxisColor },
          grid: { color: chartGridColor },
          ticks: {
            color: chartAxisColor,
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 12,
          },
          border: { color: chartGridColor },
        },
        yRtp: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'RTP %', color: chartAxisColor },
          grid: { drawOnChartArea: !series.hasPnlTrend, color: chartGridColor },
          ticks: { color: chartAxisColor },
          border: { color: chartGridColor },
          min: rtpYBounds.min,
          max: rtpYBounds.max,
        },
        ...(series.hasPnlTrend
          ? {
              yPnl: {
                type: 'linear',
                position: 'left',
                title: { display: true, text: 'Net P/L ($)', color: chartAxisColor },
                grid: { color: chartGridColor },
                ticks: {
                  color: chartAxisColor,
                  callback: (value) => fmtMoneyShort(Number(value)),
                },
                border: { color: chartGridColor },
                min: pnlYBounds.min,
                max: pnlYBounds.max,
              },
            }
          : {}),
      },
      plugins: {
        legend: {
          display: showLegend,
          labels: {
            color: chartAxisColor,
            padding: 14,
            usePointStyle: true,
            pointStyleWidth: 28,
            boxWidth: 8,
            generateLabels: legendLabelGenerator.generateLabels,
          },
        },
        tooltip: {
          callbacks: {
            title(items) {
              const idx = items[0]?.dataIndex
              const point = series.points[idx]
              if (!point) return items[0]?.label || ''
              const when = fmtTrendTooltipDate(point.capturedAt)
              return when ? `Play ${point.label} · ${when}` : `Play ${point.label}`
            },
            label(ctx) {
              const label = ctx.dataset.label || ''
              if (ctx.dataset.yAxisID === 'yPnl') {
                return `${label}: ${fmtMoneyShort(ctx.parsed.y)}`
              }
              return `${label}: ${fmtRtpPct(ctx.parsed.y)}`
            },
          },
        },
      },
    }),
    [
      chartAxisColor,
      chartGridColor,
      pnlYBounds.max,
      pnlYBounds.min,
      rtpYBounds.max,
      rtpYBounds.min,
      series.hasPnlTrend,
      series.points,
      showLegend,
      legendLabelGenerator,
    ],
  )

  return (
    <div className="h-52 w-full min-w-0 overflow-hidden rounded-2xl">
      <Line data={chartData} options={chartOptions} plugins={chartBgPlugins} />
    </div>
  )
}
