import { useMemo } from 'react'
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip)

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(n) {
  if (n == null || isNaN(n)) return '-'
  const abs = Math.abs(n)
  const str = abs >= 10000
    ? '$' + Math.round(abs).toLocaleString()
    : abs >= 100
    ? '$' + abs.toFixed(0)
    : '$' + abs.toFixed(2)
  return n < 0 ? '-' + str : str
}

// Compact label for on-bar display (keeps it short)
function fmtBarLabel(n) {
  if (!n) return ''
  const abs = Math.abs(n)
  const str = abs >= 10000
    ? '$' + (abs / 1000).toFixed(1) + 'K'
    : abs >= 1000
    ? '$' + Math.round(abs / 100) / 10 + 'K'
    : abs >= 100
    ? '$' + Math.round(abs)
    : '$' + abs.toFixed(0)
  return (n >= 0 ? '+' : '-') + str
}

function sessionWinLoss(session) {
  if (session.end_amount == null) return null
  return Number(session.end_amount) - Number(session.start_amount)
}

function sessionDurationHours(session) {
  const start = new Date(session.start_at)
  const end = session.end_at ? new Date(session.end_at) : new Date()
  return Math.max(0, (end - start) / 3_600_000)
}

function aggregate(sessions, groupFn, labelMap) {
  const map = {}
  for (const s of sessions) {
    const wl = sessionWinLoss(s)
    if (wl == null) continue
    const key = groupFn(s)
    if (!map[key]) map[key] = { total: 0, count: 0 }
    map[key].total += wl
    map[key].count++
  }
  return labelMap.map(({ key, label }) => ({
    label,
    total: map[key]?.total ?? 0,
    count: map[key]?.count ?? 0,
  }))
}

const WEEKDAYS = [
  { key: 0, label: 'Sun' }, { key: 1, label: 'Mon' }, { key: 2, label: 'Tue' },
  { key: 3, label: 'Wed' }, { key: 4, label: 'Thu' }, { key: 5, label: 'Fri' }, { key: 6, label: 'Sat' },
]
const MONTHS = [
  { key: 0, label: 'Jan' }, { key: 1, label: 'Feb' }, { key: 2, label: 'Mar' },
  { key: 3, label: 'Apr' }, { key: 4, label: 'May' }, { key: 5, label: 'Jun' },
  { key: 6, label: 'Jul' }, { key: 7, label: 'Aug' }, { key: 8, label: 'Sep' },
  { key: 9, label: 'Oct' }, { key: 10, label: 'Nov' }, { key: 11, label: 'Dec' },
]
const DURATION_BUCKETS = [
  { key: '0-1h', label: '0–1h', min: 0, max: 1 },
  { key: '1-2h', label: '1–2h', min: 1, max: 2 },
  { key: '2-3h', label: '2–3h', min: 2, max: 3 },
  { key: '3-4h', label: '3–4h', min: 3, max: 4 },
  { key: '4-5h', label: '4–5h', min: 4, max: 5 },
  { key: '5-6h', label: '5–6h', min: 5, max: 6 },
  { key: '6-8h', label: '6–8h', min: 6, max: 8 },
  { key: '8h+', label: '8h+', min: 8, max: Infinity },
]

function barColors(totals) {
  return totals.map(v => v > 0 ? 'rgba(52,211,153,0.85)' : v < 0 ? 'rgba(248,113,113,0.85)' : 'rgba(113,113,122,0.3)')
}

// ── Inline plugin: draw value labels on each bar ──────────────────────────────
const barValueLabelsPlugin = {
  id: 'barValueLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart
    ctx.save()
    ctx.font = 'bold 9px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    ctx.textAlign = 'center'

    chart.data.datasets.forEach((dataset, di) => {
      const meta = chart.getDatasetMeta(di)
      if (meta.hidden) return
      meta.data.forEach((bar, idx) => {
        const value = dataset.data[idx]
        if (!value) return
        const label = fmtBarLabel(value)
        const isPos = value >= 0
        ctx.fillStyle = isPos ? '#34d399' : '#f87171'
        if (isPos) {
          ctx.textBaseline = 'bottom'
          ctx.fillText(label, bar.x, bar.y - 3)
        } else {
          ctx.textBaseline = 'top'
          ctx.fillText(label, bar.x, bar.y + 3)
        }
      })
    })
    ctx.restore()
  },
}

// ── Shared chart options ──────────────────────────────────────────────────────
function barOptions(totals) {
  // Expand the y-axis by 12% beyond the data extremes so bar labels never
  // overlap the bottom or top axis line.
  const dataMin = Math.min(0, ...totals)
  const dataMax = Math.max(0, ...totals)
  const range = Math.max(Math.abs(dataMin), Math.abs(dataMax), 1)
  const pad = range * 0.14
  const yMin = dataMin < 0 ? dataMin - pad : undefined
  const yMax = dataMax > 0 ? dataMax + pad : undefined

  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    layout: { padding: { top: 4, bottom: 4 } },
    datasets: {
      bar: {
        barPercentage: 0.92,
        categoryPercentage: 0.92,
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#71717a', font: { size: 10 }, maxRotation: 0 },
      },
      y: {
        min: yMin,
        max: yMax,
        grid: {
          color: ctx => ctx.tick.value === 0
            ? 'rgba(20,20,20,0.55)'
            : 'rgba(255,255,255,0.05)',
          lineWidth: ctx => ctx.tick.value === 0 ? 0.75 : 1,
        },
        ticks: {
          color: '#71717a',
          font: { size: 10 },
          callback: v => fmt$(v),
        },
      },
    },
  }
}

// ── Chart section ─────────────────────────────────────────────────────────────
function ChartSection({ title, data }) {
  const totals = data.map(d => d.total)
  const labels = data.map(d => d.label)
  const chartData = {
    labels,
    datasets: [{
      data: totals,
      backgroundColor: barColors(totals),
      borderRadius: 5,
      borderSkipped: false,
    }],
  }
  const total = totals.reduce((s, v) => s + v, 0)
  const nonZero = totals.some(v => v !== 0)

  return (
    <div data-bankroll-card className="rounded-3xl bg-zinc-900 border border-zinc-800/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-white font-semibold text-sm">{title}</div>
        {nonZero && (
          <div className={`text-xs font-bold ${total >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {total >= 0 ? '+' : ''}{fmt$(total)}
          </div>
        )}
      </div>
      {!nonZero ? (
        <div className="h-[180px] flex items-center justify-center text-zinc-600 text-sm">
          No data yet
        </div>
      ) : (
        <div className="h-[180px]">
          <Bar data={chartData} options={barOptions(totals)} plugins={[barValueLabelsPlugin]} />
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function BankrollChartsTab({ sessions }) {
  const weekdayData = useMemo(() =>
    aggregate(sessions, s => new Date(s.start_at).getDay(), WEEKDAYS),
    [sessions]
  )
  const monthData = useMemo(() =>
    aggregate(sessions, s => new Date(s.start_at).getMonth(), MONTHS),
    [sessions]
  )
  const yearData = useMemo(() => {
    const years = [...new Set(sessions.map(s => new Date(s.start_at).getFullYear()))].sort()
    if (years.length === 0) return []
    return aggregate(sessions, s => new Date(s.start_at).getFullYear(), years.map(y => ({ key: y, label: String(y) })))
  }, [sessions])

  const durationData = useMemo(() => {
    const map = {}
    for (const b of DURATION_BUCKETS) map[b.key] = { total: 0, count: 0 }
    for (const s of sessions) {
      const wl = sessionWinLoss(s)
      if (wl == null) continue
      const hrs = sessionDurationHours(s)
      const bucket = DURATION_BUCKETS.find(b => hrs >= b.min && hrs < b.max)
      if (bucket) { map[bucket.key].total += wl; map[bucket.key].count++ }
    }
    return DURATION_BUCKETS.map(b => ({ label: b.label, total: map[b.key].total, count: map[b.key].count }))
  }, [sessions])

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-4xl mb-3">📊</div>
        <div className="text-zinc-400 text-sm">No sessions yet. Complete a session to see charts.</div>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-4">
      <ChartSection title="Day of Week" data={weekdayData} />
      <ChartSection title="Month" data={monthData} />
      {yearData.length > 1 && <ChartSection title="Year" data={yearData} />}
      <ChartSection title="Session Length" data={durationData} />
    </div>
  )
}
