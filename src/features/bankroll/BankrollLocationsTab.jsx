import { useState, useMemo } from 'react'
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  ArcElement,
  Tooltip,
  Filler,
} from 'chart.js'
import { Line, Doughnut } from 'react-chartjs-2'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, ArcElement, Tooltip, Filler)

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

function sessionWinLoss(s) {
  if (s.end_amount == null) return null
  return Number(s.end_amount) - Number(s.start_amount)
}

function sessionDurationHours(s) {
  const start = new Date(s.start_at)
  const end = s.end_at ? new Date(s.end_at) : new Date()
  return Math.max(0, (end - start) / 3_600_000)
}

function buildLocationStats(sessions) {
  const map = {}
  for (const s of sessions) {
    const key = s.casino_name || 'Unknown'
    if (!map[key]) map[key] = { name: key, sessions: [] }
    map[key].sessions.push(s)
  }
  return Object.values(map).map(loc => {
    const completed = loc.sessions.filter(s => s.end_amount != null)
    const totalPL = completed.reduce((sum, s) => sum + (sessionWinLoss(s) ?? 0), 0)
    const totalHours = completed.reduce((sum, s) => sum + sessionDurationHours(s), 0)
    const won = completed.filter(s => (sessionWinLoss(s) ?? 0) >= 0).length
    return {
      name: loc.name,
      count: loc.sessions.length,
      completed: completed.length,
      totalPL,
      totalHours,
      hourlyRate: totalHours >= 0.02 ? totalPL / totalHours : null,
      winPct: completed.length > 0 ? (won / completed.length) * 100 : null,
      sessions: loc.sessions,
    }
  }).sort((a, b) => b.totalPL - a.totalPL)
}

// ── Location detail modal ─────────────────────────────────────────────────────

function LocationDetailModal({ location, onClose }) {
  const completed = location.sessions.filter(s => s.end_amount != null)
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))

  // Cumulative P&L line - per-session results for point + segment coloring
  const lineLabels = completed.map((_, i) => `#${i + 1}`)
  const sessionResults = []
  let running = 0
  const lineData = completed.map(s => {
    const wl = sessionWinLoss(s) ?? 0
    sessionResults.push(wl)
    running += wl
    return parseFloat(running.toFixed(2))
  })
  const pointRadius = lineData.length <= 15 ? 4 : 0
  const pointColors = sessionResults.map(r => r >= 0 ? '#34d399' : '#f87171')

  const chartLineData = {
    labels: lineLabels,
    datasets: [{
      data: lineData,
      segment: {
        borderColor: ctx => sessionResults[ctx.p1DataIndex] >= 0 ? '#34d399' : '#f87171',
      },
      borderColor: '#71717a',
      fill: {
        target: 'origin',
        above: 'rgba(52,211,153,0.10)',
        below: 'rgba(248,113,113,0.10)',
      },
      borderWidth: 2,
      pointRadius,
      pointHoverRadius: Math.max(pointRadius, 5),
      pointBackgroundColor: pointColors,
      pointBorderColor: pointColors,
      tension: 0.3,
    }],
  }

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: { label: ctx => fmt$(ctx.parsed.y) },
        backgroundColor: '#18181b',
        borderColor: '#3f3f46',
        borderWidth: 1,
        titleColor: '#a1a1aa',
        bodyColor: '#fff',
        padding: 10,
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#71717a', font: { size: 10 }, maxTicksLimit: 6, maxRotation: 0 },
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.06)' },
        ticks: { color: '#71717a', font: { size: 10 }, callback: v => fmt$(v) },
      },
    },
  }

  // Donut: Type (Slots vs Tables)
  const slotCount = completed.filter(s => (s.game_type || 'slots') === 'slots').length
  const tableCount = completed.filter(s => s.game_type === 'tables').length
  const typeDonut = {
    labels: ['Slots', 'Tables'],
    datasets: [{
      data: [slotCount, tableCount],
      backgroundColor: ['#06b6d4', '#8b5cf6'],
      borderWidth: 0,
    }],
  }

  // Donut: Won vs Lost sessions
  const wonCount = completed.filter(s => (sessionWinLoss(s) ?? 0) >= 0).length
  const lostCount = completed.length - wonCount
  const wlDonut = {
    labels: ['Won', 'Lost'],
    datasets: [{
      data: [wonCount, lostCount],
      backgroundColor: ['#34d399', '#f87171'],
      borderWidth: 0,
    }],
  }

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#18181b',
        borderColor: '#3f3f46',
        borderWidth: 1,
        titleColor: '#a1a1aa',
        bodyColor: '#fff',
        padding: 10,
      },
    },
  }

  // Game type P&L table
  const byType = ['slots', 'tables'].map(type => {
    const rows = completed.filter(s => (s.game_type || 'slots') === type)
    const pl = rows.reduce((sum, s) => sum + (sessionWinLoss(s) ?? 0), 0)
    return { type, count: rows.length, pl }
  }).filter(r => r.count > 0)

  const totalPL = lineData.length > 0 ? lineData[lineData.length - 1] : 0

  return (
    <div
      className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg rounded-3xl bg-zinc-900 border border-zinc-700/50 px-5 pt-5 pb-6 max-h-[88vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="text-white font-bold text-lg truncate">{location.name}</div>
            <div className="text-zinc-500 text-xs mt-0.5">
              {location.completed} session{location.completed !== 1 ? 's' : ''} · {location.totalHours.toFixed(1)}h played
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-3 shrink-0 rounded-full w-8 h-8 flex items-center justify-center bg-zinc-800 text-zinc-400 text-sm touch-manipulation active:bg-zinc-700"
          >
            ✕
          </button>
        </div>

        {/* P&L summary */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <MiniStatCard label="Total P&L" value={`${totalPL >= 0 ? '+' : ''}${fmt$(totalPL)}`} positive={totalPL >= 0} />
          <MiniStatCard label="Hourly" value={location.hourlyRate != null ? `${location.hourlyRate >= 0 ? '+' : ''}${fmt$(location.hourlyRate)}/hr` : '-'} positive={(location.hourlyRate ?? 0) >= 0} />
          <MiniStatCard label="Win %" value={location.winPct != null ? `${location.winPct.toFixed(0)}%` : '-'} positive={(location.winPct ?? 0) >= 50} />
        </div>

        {/* Line chart */}
        {completed.length >= 2 ? (
          <div className="rounded-2xl bg-zinc-800/50 border border-zinc-700/30 p-3 mb-4">
            <div className="text-zinc-400 text-xs mb-2">Cumulative P&L</div>
            <div className="h-[160px]">
              <Line data={chartLineData} options={lineOptions} />
            </div>
          </div>
        ) : null}

        {/* Donut charts */}
        {completed.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <DonutCard title="Game Type" chart={typeDonut} options={donutOptions}
              legend={[
                { label: 'Slots', color: '#06b6d4', count: slotCount },
                { label: 'Tables', color: '#8b5cf6', count: tableCount },
              ]}
            />
            <DonutCard title="Outcome" chart={wlDonut} options={donutOptions}
              legend={[
                { label: 'Won', color: '#34d399', count: wonCount },
                { label: 'Lost', color: '#f87171', count: lostCount },
              ]}
            />
          </div>
        )}

        {/* Game type P&L table */}
        {byType.length > 1 && (
          <div className="rounded-2xl bg-zinc-800/50 border border-zinc-700/30 p-3">
            <div className="text-zinc-400 text-xs mb-2">P&L by Game Type</div>
            <div className="space-y-2">
              {byType.map(row => (
                <div key={row.type} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{row.type === 'slots' ? '🎰' : '🃏'}</span>
                    <span className="text-white text-sm capitalize">{row.type}</span>
                    <span className="text-zinc-500 text-xs">({row.count})</span>
                  </div>
                  <span className={`text-sm font-semibold ${row.pl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {row.pl >= 0 ? '+' : ''}{fmt$(row.pl)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MiniStatCard({ label, value, positive }) {
  return (
    <div className="rounded-2xl bg-zinc-800/60 border border-zinc-700/30 p-3 text-center">
      <div className="text-zinc-500 text-[10px] uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-sm font-bold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>{value}</div>
    </div>
  )
}

function DonutCard({ title, chart, options, legend }) {
  const hasData = chart.datasets[0].data.some(v => v > 0)
  return (
    <div className="rounded-2xl bg-zinc-800/50 border border-zinc-700/30 p-3">
      <div className="text-zinc-400 text-xs mb-2">{title}</div>
      {!hasData ? (
        <div className="h-[90px] flex items-center justify-center text-zinc-600 text-xs">No data</div>
      ) : (
        <>
          <div className="h-[90px]">
            <Doughnut data={chart} options={options} />
          </div>
          <div className="flex justify-center gap-3 mt-2">
            {legend.map(l => (
              <div key={l.label} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                <span className="text-zinc-400 text-[10px]">{l.label} ({l.count})</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BankrollLocationsTab({ sessions }) {
  const [selectedLocation, setSelectedLocation] = useState(null)

  const locations = useMemo(() => buildLocationStats(sessions), [sessions])

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-4xl mb-3">📍</div>
        <div className="text-zinc-400 text-sm">No sessions yet. Add sessions with a casino to see location stats.</div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2 pb-4">
        {locations.map(loc => {
          const plColor = loc.totalPL >= 0 ? 'text-emerald-400' : 'text-red-400'
          const sign = loc.totalPL >= 0 ? '+' : ''
          return (
            <button
              key={loc.name}
              onClick={() => setSelectedLocation(loc)}
              data-session-row
              className="w-full text-left rounded-2xl bg-zinc-900 border border-zinc-800/60 p-4 touch-manipulation active:bg-zinc-800 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-white font-semibold text-sm truncate">{loc.name}</div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-zinc-500 text-xs">{loc.completed} session{loc.completed !== 1 ? 's' : ''}</span>
                    <span className="text-zinc-500 text-xs">{loc.totalHours.toFixed(1)}h</span>
                    {loc.hourlyRate != null && (
                      <span className={`text-xs font-semibold ${loc.hourlyRate >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {loc.hourlyRate >= 0 ? '+' : ''}{fmt$(loc.hourlyRate)}/hr
                      </span>
                    )}
                    {loc.winPct != null && (
                      <span className="text-zinc-500 text-xs">{loc.winPct.toFixed(0)}% win</span>
                    )}
                  </div>
                </div>
                <div className={`shrink-0 font-black text-xl tabular-nums ${plColor}`}>
                  {sign}{fmt$(loc.totalPL)}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {selectedLocation && (
        <LocationDetailModal
          location={selectedLocation}
          onClose={() => setSelectedLocation(null)}
        />
      )}
    </>
  )
}
