import { useMemo, useState } from 'react'
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import {
  computeBackerPortfolioTrendChart,
  viewerActiveBackingSlice,
} from './pokerStableBackerMath.js'
import { dealTypeLabel, roundMoney } from './pokerStableMath.js'
import { sliceDisplayName } from './pokerStableApi.js'
import { STABLE_CHART_PORTFOLIO, STABLE_TAB_ACTIVE } from './pokerStableUi.js'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler, Legend)

/** Chart.js axis chrome for Stable Trend (`html.light`). */
function pokerStableTrendChartChrome() {
  const isLight =
    typeof document !== 'undefined' && document.documentElement.classList.contains('light')
  if (isLight) {
    return {
      grid: 'rgba(24,24,27,0.06)',
      ticks: '#71717a',
      legend: '#52525b',
    }
  }
  return {
    grid: 'rgba(255,255,255,0.04)',
    ticks: '#71717a',
    legend: '#a1a1aa',
  }
}

const HORSE_COLORS = ['#34d399', '#60a5fa', '#f472b6', '#a78bfa', '#fb7185', '#fbbf24']

/**
 * Portfolio + per-horse cumulative session share (active + closed stakes).
 * Session performance only ... deposits/withdrawals do not affect this chart.
 */
export default function PokerStableTrendTab({
  horseDeals = [],
  sessions = [],
  slicesByDeal = {},
  profilesById = {},
  userId,
}) {
  const [portfolioOnly, setPortfolioOnly] = useState(false)

  const chartBundle = useMemo(
    () =>
      computeBackerPortfolioTrendChart({
        horseDeals,
        sessions,
        slicesByDeal,
        userId,
      }),
    [horseDeals, sessions, slicesByDeal, userId],
  )

  const yScale = useMemo(() => {
    const values = [...chartBundle.portfolio, ...Object.values(chartBundle.horseSeries).flat(), 0]
    const minVal = Math.min(...values)
    const maxVal = Math.max(...values)
    const pad = Math.max(500, Math.max(Math.abs(minVal), Math.abs(maxVal)) * 0.12)
    return {
      min: roundMoney(minVal - pad),
      max: roundMoney(maxVal + pad),
    }
  }, [chartBundle])

  const datasets = useMemo(() => {
    const rows = [
      {
        label: 'Portfolio',
        data: chartBundle.portfolio,
        borderColor: STABLE_CHART_PORTFOLIO,
        backgroundColor: 'rgba(34, 211, 238, 0.08)',
        fill: true,
        tension: 0.25,
        borderWidth: 2.5,
      },
    ]
    if (!portfolioOnly) {
      chartBundle.deals.forEach((deal, idx) => {
        const series = chartBundle.horseSeries[deal.id]
        if (!series?.length) return
        const slice = viewerActiveBackingSlice(deal.id, slicesByDeal, userId)
        rows.push({
          label:
            deal.label?.trim() ||
            sliceDisplayName(slice || {}, profilesById) ||
            dealTypeLabel(deal.deal_type),
          data: series,
          borderColor: HORSE_COLORS[idx % HORSE_COLORS.length],
          backgroundColor: 'transparent',
          tension: 0.25,
          borderWidth: 1.5,
        })
      })
    }
    return rows
  }, [chartBundle, portfolioOnly, slicesByDeal, profilesById, userId])

  const hasHistory = sessions.length > 0 || horseDeals.length > 0
  const chartChrome = useMemo(() => pokerStableTrendChartChrome(), [])

  return (
    <div data-poker-stable-trend className="pb-4">
      <div className="mb-3 flex rounded-xl border border-zinc-800 bg-zinc-900/50 p-1">
        <button
          type="button"
          onClick={() => setPortfolioOnly(false)}
          className={`flex-1 rounded-lg py-2 text-xs font-bold touch-manipulation ${
            !portfolioOnly ? STABLE_TAB_ACTIVE : 'text-zinc-400 active:text-zinc-200'
          }`}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setPortfolioOnly(true)}
          className={`flex-1 rounded-lg py-2 text-xs font-bold touch-manipulation ${
            portfolioOnly ? STABLE_TAB_ACTIVE : 'text-zinc-400 active:text-zinc-200'
          }`}
        >
          Portfolio
        </button>
      </div>
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3">
        {hasHistory ? (
          <Line
            data={{ labels: chartBundle.labels, datasets }}
            options={{
              responsive: true,
              maintainAspectRatio: true,
              plugins: {
                legend: { labels: { color: chartChrome.legend, boxWidth: 12 } },
                tooltip: {
                  callbacks: {
                    label: (ctx) => `${ctx.dataset.label}: ${fmtPoker$(ctx.parsed.y)}`,
                  },
                },
              },
              scales: {
                x: {
                  ticks: { color: chartChrome.ticks, maxRotation: 45 },
                  grid: { color: chartChrome.grid },
                },
                y: {
                  min: yScale.min,
                  max: yScale.max,
                  ticks: {
                    color: chartChrome.ticks,
                    callback: (v) => fmtPoker$(Number(v)),
                  },
                  grid: { color: chartChrome.grid },
                },
              },
            }}
          />
        ) : (
          <p className="py-10 text-center text-sm text-zinc-500">No stake session history yet.</p>
        )}
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Per-horse performance (your action % of gross results). Bankroll adjustments and
        settle crystallization do not move this chart.
      </p>
    </div>
  )
}
