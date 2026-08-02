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
  backerSliceSessionShare,
  backerSliceStakeValue,
} from './pokerStableBackerMath.js'
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

/**
 * Portfolio + per-horse cumulative session share (active + closed stakes).
 */
export default function PokerStableTrendTab({
  horseDeals = [],
  sessions = [],
  slicesByDeal = {},
  bankrollByDeal = {},
  profilesById = {},
  userId,
  liquidBankroll = 0,
}) {
  const [portfolioOnly, setPortfolioOnly] = useState(false)

  const chartBundle = useMemo(() => {
    const deals = [...horseDeals]
    /** @type {Record<string, number>} */
    const runByDeal = {}
    /** @type {Record<string, number[]>} */
    const horseSeries = {}
    for (const deal of deals) {
      runByDeal[deal.id] = 0
      horseSeries[deal.id] = [0]
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
    const portfolio = [0]

    for (const ev of events) {
      const share = backerSliceSessionShare(ev.deal, ev.slice, ev.session)
      runByDeal[ev.deal.id] = roundMoney(runByDeal[ev.deal.id] + share)
      let port = 0
      for (const deal of deals) {
        port = roundMoney(port + (runByDeal[deal.id] || 0))
      }
      labels.push(formatTrendLabel(ev.session.start_at || ev.session.created_at))
      portfolio.push(port)
      for (const deal of deals) {
        horseSeries[deal.id].push(runByDeal[deal.id] || 0)
      }
    }

    // Terminal point: backing bankroll + active stake MTM (matches hero portfolio concept).
    let nowPortfolio = roundMoney(liquidBankroll)
    for (const deal of deals) {
      if (deal.status !== 'active') continue
      const slice = viewerBackingSlice(deal.id, slicesByDeal, userId)
      if (!slice) continue
      nowPortfolio = roundMoney(
        nowPortfolio + backerSliceStakeValue(deal, slice, bankrollByDeal[deal.id]),
      )
    }

    if (events.length === 0) {
      labels.push('Now')
      portfolio.push(nowPortfolio)
      for (const deal of deals) {
        horseSeries[deal.id].push(deal.status === 'active' ? runByDeal[deal.id] || 0 : 0)
      }
    } else {
      labels.push('Now')
      portfolio.push(nowPortfolio)
      for (const deal of deals) {
        const last = horseSeries[deal.id][horseSeries[deal.id].length - 1] || 0
        if (deal.status === 'active') {
          const slice = viewerBackingSlice(deal.id, slicesByDeal, userId)
          horseSeries[deal.id].push(
            slice ? backerSliceStakeValue(deal, slice, bankrollByDeal[deal.id]) : last,
          )
        } else {
          horseSeries[deal.id].push(last)
        }
      }
    }

    return { labels, portfolio, horseSeries, deals }
  }, [
    horseDeals,
    sessions,
    slicesByDeal,
    bankrollByDeal,
    userId,
    liquidBankroll,
  ])

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
          label: deal.label?.trim() || sliceDisplayName(slice || {}, profilesById) || dealTypeLabel(deal.deal_type),
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
                x: { ticks: { color: '#71717a', maxRotation: 45 }, grid: { color: 'rgba(255,255,255,0.04)' } },
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
        ) : (
          <p className="py-10 text-center text-sm text-zinc-500">No stake session history yet.</p>
        )}
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Per-horse lines accumulate your action % of on-stake session results (includes closed stakes).
        Portfolio ends at backing bankroll plus active stake mark-to-market; settle crystallization is
        separate.
      </p>
    </div>
  )
}
