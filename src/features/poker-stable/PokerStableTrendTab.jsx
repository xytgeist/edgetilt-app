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
import { backerSliceSessionShare } from './pokerStableBackerMath.js'
import { dealTypeLabel, roundMoney } from './pokerStableMath.js'
import { sliceDisplayName } from './pokerStableApi.js'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler, Legend)

const HORSE_COLORS = ['#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#fb7185']

function formatTrendLabel(iso) {
  if (!iso) return 'n/a'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'n/a'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function viewerBackingSlice(dealId, slicesByDeal, userId) {
  return (slicesByDeal[dealId] || []).find(
    (s) => s.staker_user_id === userId && s.status !== 'declined',
  )
}

/** Plot coordinate = backing bankroll floor + session performance (manual set shifts floor, not points). */
function withCapitalFloor(capitalFloor, performance) {
  return roundMoney(Number(capitalFloor) + Number(performance))
}

/**
 * Portfolio + per-horse cumulative session share (active + closed stakes).
 * Chart points move only on stake sessions; backing bankroll sets the y-axis floor.
 */
export default function PokerStableTrendTab({
  horseDeals = [],
  sessions = [],
  slicesByDeal = {},
  profilesById = {},
  userId,
  liquidBankroll = 0,
}) {
  const [portfolioOnly, setPortfolioOnly] = useState(false)
  const capitalFloor = roundMoney(liquidBankroll)

  const chartBundle = useMemo(() => {
    const deals = [...horseDeals]
    /** @type {Record<string, number>} */
    const perfByDeal = {}
    /** @type {Record<string, number[]>} */
    const horsePerformance = {}
    for (const deal of deals) {
      perfByDeal[deal.id] = 0
      horsePerformance[deal.id] = [0]
    }

    const events = []
    for (const deal of deals) {
      const slice = viewerBackingSlice(deal.id, slicesByDeal, userId)
      if (!slice) continue
      for (const session of sessions) {
        if (session.deal_id !== deal.id) continue
        events.push({
          deal,
          slice,
          session,
          t: new Date(session.start_at || session.created_at).getTime(),
        })
      }
    }
    events.sort((a, b) => a.t - b.t)

    const labels = ['Start']
    const portfolioPerf = [0]

    for (const ev of events) {
      const share = backerSliceSessionShare(ev.deal, ev.slice, ev.session)
      perfByDeal[ev.deal.id] = roundMoney(perfByDeal[ev.deal.id] + share)
      let portPerf = 0
      for (const deal of deals) {
        portPerf = roundMoney(portPerf + (perfByDeal[deal.id] || 0))
      }
      labels.push(formatTrendLabel(ev.session.start_at || ev.session.created_at))
      portfolioPerf.push(portPerf)
      for (const deal of deals) {
        horsePerformance[deal.id].push(perfByDeal[deal.id] || 0)
      }
    }

    const portfolio = portfolioPerf.map((p) => withCapitalFloor(capitalFloor, p))
    /** @type {Record<string, number[]>} */
    const horseSeries = {}
    for (const deal of deals) {
      horseSeries[deal.id] = horsePerformance[deal.id].map((p) =>
        withCapitalFloor(capitalFloor, p),
      )
    }

    return { labels, portfolio, horseSeries, deals, capitalFloor }
  }, [horseDeals, sessions, slicesByDeal, userId, capitalFloor])

  const yScale = useMemo(() => {
    const values = [
      ...chartBundle.portfolio,
      ...Object.values(chartBundle.horseSeries).flat(),
      chartBundle.capitalFloor,
    ]
    const minVal = Math.min(...values, chartBundle.capitalFloor)
    const maxVal = Math.max(...values, chartBundle.capitalFloor)
    const pad = Math.max(500, (maxVal - minVal) * 0.08)
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
        borderColor: '#fbbf24',
        backgroundColor: 'rgba(251, 191, 36, 0.08)',
        fill: true,
        tension: 0.25,
        borderWidth: 2.5,
      },
    ]
    if (!portfolioOnly) {
      chartBundle.deals.forEach((deal, idx) => {
        const series = chartBundle.horseSeries[deal.id]
        if (!series?.length) return
        const slice = viewerBackingSlice(deal.id, slicesByDeal, userId)
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
        {hasHistory ? (
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
                x: {
                  ticks: { color: '#71717a', maxRotation: 45 },
                  grid: { color: 'rgba(255,255,255,0.04)' },
                },
                y: {
                  min: yScale.min,
                  max: yScale.max,
                  ticks: {
                    color: '#71717a',
                    callback: (v) => fmtPoker$(Number(v)),
                  },
                  grid: { color: 'rgba(255,255,255,0.04)' },
                },
              },
            }}
          />
        ) : (
          <p className="py-10 text-center text-sm text-zinc-500">No stake session history yet.</p>
        )}
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Lines move only on stake sessions (your action % of gross results). Manual backing bankroll
        sets the chart floor ({fmtPoker$(capitalFloor)}) without adding a jump point. Settle
        crystallization is separate.
      </p>
    </div>
  )
}
