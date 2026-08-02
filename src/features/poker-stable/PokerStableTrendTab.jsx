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
import { backerSliceStakeValue } from './pokerStableBackerMath.js'
import { dealTypeLabel, roundMoney } from './pokerStableMath.js'
import { sliceDisplayName } from './pokerStableApi.js'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler, Legend)

const HORSE_COLORS = ['#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#fb7185']

/**
 * Portfolio total + per-horse lines (read-only v1).
 */
export default function PokerStableTrendTab({
  activeDeals = [],
  slicesByDeal = {},
  bankrollByDeal = {},
  profilesById = {},
  userId,
  liquidBankroll = 0,
}) {
  const [portfolioOnly, setPortfolioOnly] = useState(false)

  const chartBundle = useMemo(() => {
    const labels = ['Start']
    const portfolio = [roundMoney(liquidBankroll)]
    /** @type {Record<string, number[]>} */
    const horseSeries = {}

    const sorted = [...activeDeals].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )

    for (const deal of sorted) {
      const slice = (slicesByDeal[deal.id] || []).find(
        (s) => s.staker_user_id === userId && s.status === 'active',
      )
      if (!slice) continue
      const label = deal.label?.trim() || sliceDisplayName(slice, profilesById)
      const horseKey = deal.id
      if (!horseSeries[horseKey]) horseSeries[horseKey] = [0]
      const val = backerSliceStakeValue(deal, slice, bankrollByDeal[deal.id])
      labels.push(label.slice(0, 12))
      horseSeries[horseKey].push(val)
      portfolio.push(roundMoney(liquidBankroll + val))
    }

    if (labels.length === 1) {
      labels.push('Now')
      portfolio.push(roundMoney(liquidBankroll))
    }

    return { labels, portfolio, horseSeries, sorted }
  }, [activeDeals, slicesByDeal, bankrollByDeal, profilesById, userId, liquidBankroll])

  const datasets = useMemo(() => {
    const rows = [
      {
        label: 'Portfolio',
        data: chartBundle.portfolio,
        borderColor: '#fbbf24',
        backgroundColor: 'rgba(251, 191, 36, 0.08)',
        fill: true,
        tension: 0.25,
        borderWidth: 2.5,
      },
    ]
    if (!portfolioOnly) {
      chartBundle.sorted.forEach((deal, idx) => {
        const series = chartBundle.horseSeries[deal.id]
        if (!series) return
        const padded = [0, ...series.slice(1)]
        while (padded.length < chartBundle.labels.length) padded.push(padded[padded.length - 1] || 0)
        rows.push({
          label: deal.label?.trim() || dealTypeLabel(deal.deal_type),
          data: padded,
          borderColor: HORSE_COLORS[idx % HORSE_COLORS.length],
          backgroundColor: 'transparent',
          tension: 0.25,
          borderWidth: 1.5,
        })
      })
    }
    return rows
  }, [chartBundle, portfolioOnly])

  return (
    <div data-poker-stable-trend className="pb-4">
      <label className="mb-3 flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
        <input
          type="checkbox"
          checked={portfolioOnly}
          onChange={(e) => setPortfolioOnly(e.target.checked)}
          className="rounded border-zinc-600"
        />
        Portfolio only
      </label>
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3">
        <Line
          data={{ labels: chartBundle.labels, datasets }}
          options={{
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: { labels: { color: '#a1a1aa', boxWidth: 12 } },
              tooltip: {
                callbacks: {
                  label: (ctx) => `${ctx.dataset.label}: ${fmtPoker$(ctx.parsed.y)}`,
                },
              },
            },
            scales: {
              x: { ticks: { color: '#71717a' }, grid: { color: 'rgba(255,255,255,0.04)' } },
              y: {
                ticks: {
                  color: '#71717a',
                  callback: (v) => fmtPoker$(Number(v)),
                },
                grid: { color: 'rgba(255,255,255,0.04)' },
              },
            },
          }}
        />
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Snapshot trend from active stakes (mark-to-market slice values). Full history builds as deals
        accumulate events.
      </p>
    </div>
  )
}
