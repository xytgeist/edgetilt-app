import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { DollarSign, Trophy } from 'lucide-react'
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
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import {
  fmtPoker$,
  pokerSessionDurationHours,
  pokerSessionTotalCost,
  pokerSessionWinLoss,
} from './pokerBankrollMath.js'
import { pokerSessionStakesLabel } from './pokerSessionLabels.js'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, ArcElement, Tooltip, Filler)

function venueSubtitle(sessions) {
  const counts = { live: 0, online: 0, club: 0 }
  /** @type {Map<string, number>} */
  const currencyCounts = new Map()
  for (const s of sessions || []) {
    const kind = s.venue_kind === 'online' ? 'online' : s.venue_kind === 'club' ? 'club' : 'live'
    counts[kind] += 1
    const cur = String(s.currency || 'USD').trim().toUpperCase() || 'USD'
    currencyCounts.set(cur, (currencyCounts.get(cur) || 0) + 1)
  }
  let kind = 'Live'
  if (counts.online >= counts.live && counts.online >= counts.club) kind = 'Online'
  else if (counts.club >= counts.live && counts.club >= counts.online) kind = 'Club'
  let currency = 'USD'
  let best = 0
  for (const [code, n] of currencyCounts) {
    if (n > best) {
      best = n
      currency = code
    }
  }
  return `${kind} · ${currency}`
}

function fmtRoi(pct) {
  if (pct == null || Number.isNaN(pct)) return '—'
  const rounded = Math.round(pct)
  return `${rounded}%`
}

function buildLocationStats(sessions) {
  /** @type {Map<string, object[]>} */
  const map = new Map()
  for (const s of sessions || []) {
    const key = String(s.venue_name || '').trim() || 'Unknown'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(s)
  }

  return [...map.entries()]
    .map(([name, locs]) => {
      const completed = locs.filter((s) => pokerSessionWinLoss(s) != null)
      let totalPL = 0
      let totalHours = 0
      let invested = 0
      let won = 0
      let cashPL = 0
      let cashInvested = 0
      let cashCount = 0
      let tourneyPL = 0
      let tourneyInvested = 0
      let tourneyCount = 0

      for (const s of completed) {
        const wl = pokerSessionWinLoss(s) ?? 0
        const cost = pokerSessionTotalCost(s)
        const hrs = pokerSessionDurationHours(s)
        totalPL += wl
        totalHours += hrs
        invested += cost
        if (wl >= 0) won += 1
        if (s.session_type === 'tournament') {
          tourneyPL += wl
          tourneyInvested += cost
          tourneyCount += 1
        } else {
          cashPL += wl
          cashInvested += cost
          cashCount += 1
        }
      }

      return {
        name,
        subtitle: venueSubtitle(locs),
        count: locs.length,
        completed: completed.length,
        totalPL,
        totalHours,
        invested,
        hourlyRate: totalHours >= 0.02 ? totalPL / totalHours : null,
        winPct: completed.length > 0 ? (won / completed.length) * 100 : null,
        roi: invested > 0 ? (totalPL / invested) * 100 : null,
        cash: {
          count: cashCount,
          profit: cashPL,
          invested: cashInvested,
          roi: cashInvested > 0 ? (cashPL / cashInvested) * 100 : null,
        },
        tournament: {
          count: tourneyCount,
          profit: tourneyPL,
          invested: tourneyInvested,
          roi: tourneyInvested > 0 ? (tourneyPL / tourneyInvested) * 100 : null,
        },
        sessions: locs,
      }
    })
    .sort((a, b) => b.totalPL - a.totalPL)
}

function MiniStatCard({ label, value, positive }) {
  return (
    <div className="rounded-2xl border border-zinc-700/30 bg-zinc-800/60 p-3 text-center">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`text-sm font-bold ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>{value}</div>
    </div>
  )
}

function DonutCard({ title, centerLabel, centerValue, chart, options, legend }) {
  const hasData = chart.datasets[0].data.some((v) => v > 0)
  return (
    <div className="rounded-2xl border border-zinc-700/30 bg-zinc-800/50 p-3">
      <div className="mb-2 text-xs text-zinc-400">{title}</div>
      {!hasData ? (
        <div className="flex h-[110px] items-center justify-center text-xs text-zinc-600">No data</div>
      ) : (
        <>
          <div className="relative h-[110px]">
            <Doughnut data={chart} options={options} />
            {centerLabel ? (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-[11px] font-bold tabular-nums text-white">{centerValue}</div>
                <div className="text-[9px] uppercase tracking-wide text-zinc-500">{centerLabel}</div>
              </div>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
            {legend.map((l) => (
              <div key={l.label} className="flex items-center gap-1">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
                <span className="text-[10px] text-zinc-400">
                  {l.label} ({l.count})
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function SessionRow({ session, onClick }) {
  const wl = pokerSessionWinLoss(session)
  const isTourney = session.session_type === 'tournament'
  return (
    <button
      type="button"
      onClick={() => onClick?.(session)}
      className="flex w-full items-start gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/70 px-3 py-3 text-left touch-manipulation active:bg-zinc-800/80"
    >
      <span
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          isTourney ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'
        }`}
        aria-hidden
      >
        {isTourney ? (
          <Trophy className="h-4 w-4" strokeWidth={2.25} />
        ) : (
          <DollarSign className="h-4 w-4" strokeWidth={2.25} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-semibold text-white">{pokerSessionStakesLabel(session)}</span>
          <span
            className={`shrink-0 font-bold tabular-nums ${
              wl == null ? 'text-zinc-500' : wl >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {wl == null ? '-' : fmtPoker$(wl)}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-zinc-500">
          {String(session.venue_name || '').trim() || 'Unknown'}
        </span>
        <span className="mt-0.5 block text-[11px] text-zinc-600">
          {new Date(session.start_at).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      </span>
    </button>
  )
}

function LocationDetailModal({ location, onClose, onEditSession }) {
  const [yearFilter, setYearFilter] = useState('all')

  const completed = useMemo(
    () =>
      location.sessions
        .filter((s) => pokerSessionWinLoss(s) != null)
        .sort((a, b) => new Date(a.start_at) - new Date(b.start_at)),
    [location.sessions],
  )

  const years = useMemo(() => {
    const set = new Set()
    for (const s of completed) {
      set.add(new Date(s.start_at).getFullYear())
    }
    return [...set].sort((a, b) => b - a)
  }, [completed])

  const yearFiltered = useMemo(() => {
    if (yearFilter === 'all') return completed
    const y = Number(yearFilter)
    return completed.filter((s) => new Date(s.start_at).getFullYear() === y)
  }, [completed, yearFilter])

  const bestSessions = useMemo(() => {
    return [...completed]
      .filter((s) => (pokerSessionWinLoss(s) ?? 0) > 0)
      .sort((a, b) => (pokerSessionWinLoss(b) ?? 0) - (pokerSessionWinLoss(a) ?? 0))
      .slice(0, 5)
  }, [completed])

  const lineLabels = completed.map((_, i) => `#${i + 1}`)
  const sessionResults = []
  let running = 0
  const lineData = completed.map((s) => {
    const wl = pokerSessionWinLoss(s) ?? 0
    sessionResults.push(wl)
    running += wl
    return parseFloat(running.toFixed(2))
  })
  const pointRadius = lineData.length <= 15 ? 4 : 0
  const pointColors = sessionResults.map((r) => (r >= 0 ? '#34d399' : '#f87171'))

  const chartLineData = {
    labels: lineLabels,
    datasets: [
      {
        data: lineData,
        segment: {
          borderColor: (ctx) => (sessionResults[ctx.p1DataIndex] >= 0 ? '#34d399' : '#f87171'),
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
      },
    ],
  }

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: { label: (ctx) => fmtPoker$(ctx.parsed.y) },
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
        ticks: { color: '#71717a', font: { size: 10 }, callback: (v) => fmtPoker$(v) },
      },
    },
  }

  const cashCount = location.cash.count
  const tourneyCount = location.tournament.count
  const typeDonut = {
    labels: ['Cash Game', 'Tournament'],
    datasets: [
      {
        data: [cashCount, tourneyCount],
        backgroundColor: ['#3b82f6', '#fbbf24'],
        borderWidth: 0,
      },
    ],
  }

  const wonCount = completed.filter((s) => (pokerSessionWinLoss(s) ?? 0) >= 0).length
  const lostCount = completed.length - wonCount
  const wlDonut = {
    labels: ['Won', 'Lost'],
    datasets: [
      {
        data: [wonCount, lostCount],
        backgroundColor: ['#34d399', '#f87171'],
        borderWidth: 0,
      },
    ],
  }

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
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

  const typeRows = [
    { key: 'cash', label: 'Cash Game', icon: 'cash', iconClass: 'text-blue-400', ...location.cash },
    {
      key: 'tournament',
      label: 'Tournament',
      icon: 'trophy',
      iconClass: 'text-amber-300',
      ...location.tournament,
    },
  ].filter((r) => r.count > 0)

  return createPortal(
    <div
      className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`}
      onClick={onClose}
    >
      <div
        data-poker-bankroll-sheet
        className={`${APP_MODAL_SHEET_PANEL_CLASS} max-w-[100vw] min-w-0 overflow-x-hidden overscroll-x-none touch-pan-y px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-4`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Location Info</div>
            <div className="truncate text-lg font-bold text-white">{location.name}</div>
            <div className="mt-0.5 text-xs text-zinc-500">{location.subtitle}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm text-zinc-400 touch-manipulation active:bg-zinc-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <MiniStatCard
            label="Total P&L"
            value={`${location.totalPL >= 0 ? '+' : ''}${fmtPoker$(location.totalPL)}`}
            positive={location.totalPL >= 0}
          />
          <MiniStatCard
            label="Hourly"
            value={
              location.hourlyRate != null
                ? `${location.hourlyRate >= 0 ? '+' : ''}${fmtPoker$(location.hourlyRate)}/hr`
                : '-'
            }
            positive={(location.hourlyRate ?? 0) >= 0}
          />
          <MiniStatCard
            label="Win %"
            value={location.winPct != null ? `${location.winPct.toFixed(0)}%` : '-'}
            positive={(location.winPct ?? 0) >= 50}
          />
        </div>

        {completed.length >= 2 ? (
          <div className="mb-4 rounded-2xl border border-zinc-700/30 bg-zinc-800/50 p-3">
            <div className="mb-2 text-xs text-zinc-400">Cumulative P&L</div>
            <div className="h-[160px]">
              <Line data={chartLineData} options={lineOptions} />
            </div>
          </div>
        ) : null}

        {completed.length > 0 ? (
          <div className="mb-4 grid grid-cols-2 gap-3">
            <DonutCard
              title="Session Type"
              centerValue={String(location.completed)}
              centerLabel="Entries"
              chart={typeDonut}
              options={donutOptions}
              legend={[
                { label: 'Cash', color: '#3b82f6', count: cashCount },
                { label: 'Tourney', color: '#fbbf24', count: tourneyCount },
              ]}
            />
            <DonutCard
              title="Outcome"
              centerValue={location.winPct != null ? `${location.winPct.toFixed(0)}%` : '—'}
              centerLabel="Won"
              chart={wlDonut}
              options={donutOptions}
              legend={[
                { label: 'Won', color: '#34d399', count: wonCount },
                { label: 'Lost', color: '#f87171', count: lostCount },
              ]}
            />
          </div>
        ) : null}

        {typeRows.length > 0 ? (
          <div className="mb-4 rounded-2xl border border-zinc-700/30 bg-zinc-800/50 p-3">
            <div className="mb-2 grid grid-cols-[1fr_auto_auto] gap-3 text-[10px] uppercase tracking-wide text-zinc-500">
              <span>Type</span>
              <span className="w-14 text-right">ROI</span>
              <span className="w-20 text-right">Profit</span>
            </div>
            <div className="space-y-2">
              {typeRows.map((row) => (
                <div key={row.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900/80 ${row.iconClass}`}
                    >
                      {row.icon === 'trophy' ? (
                        <Trophy className="h-3.5 w-3.5" strokeWidth={2.25} />
                      ) : (
                        <DollarSign className="h-3.5 w-3.5" strokeWidth={2.25} />
                      )}
                    </span>
                    <span className="truncate text-sm text-white">
                      {row.label}{' '}
                      <span className="text-zinc-500">({row.count})</span>
                    </span>
                  </div>
                  <span
                    className={`w-14 text-right text-sm font-semibold tabular-nums ${
                      (row.roi ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {fmtRoi(row.roi)}
                  </span>
                  <span
                    className={`w-20 text-right text-sm font-semibold tabular-nums ${
                      row.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {fmtPoker$(row.profit)}
                  </span>
                </div>
              ))}
              {typeRows.length > 1 ? (
                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-t border-zinc-700/40 pt-2">
                  <span className="text-sm font-semibold text-white">Total</span>
                  <span className="w-14 text-right text-sm text-zinc-500">—</span>
                  <span
                    className={`w-20 text-right text-sm font-bold tabular-nums ${
                      location.totalPL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {fmtPoker$(location.totalPL)}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {bestSessions.length > 0 ? (
          <div className="mb-4">
            <div className="mb-2 inline-flex rounded-full border border-zinc-700/50 bg-zinc-800/60 px-3 py-1 text-xs font-semibold text-zinc-300">
              Best sessions
            </div>
            <div className="space-y-2">
              {bestSessions.map((s) => (
                <SessionRow
                  key={`best-${s.id}`}
                  session={s}
                  onClick={(session) => {
                    onClose()
                    onEditSession?.(session)
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}

        {completed.length > 0 ? (
          <div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setYearFilter('all')}
                className={`rounded-full px-3 py-1 text-xs font-semibold touch-manipulation ${
                  yearFilter === 'all'
                    ? 'bg-zinc-100 text-zinc-900'
                    : 'bg-zinc-800 text-zinc-400 active:bg-zinc-700'
                }`}
              >
                All
              </button>
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setYearFilter(String(y))}
                  className={`rounded-full px-3 py-1 text-xs font-semibold touch-manipulation ${
                    yearFilter === String(y)
                      ? 'bg-zinc-100 text-zinc-900'
                      : 'bg-zinc-800 text-zinc-400 active:bg-zinc-700'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {[...yearFiltered]
                .sort((a, b) => new Date(b.start_at) - new Date(a.start_at))
                .map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    onClick={(session) => {
                      onClose()
                      onEditSession?.(session)
                    }}
                  />
                ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

export default function PokerLocationsTab({ sessions, loading, onEditSession }) {
  const [selectedLocation, setSelectedLocation] = useState(null)
  const locations = useMemo(() => buildLocationStats(sessions), [sessions])

  if (loading) {
    return <p className="py-16 text-center text-sm text-zinc-500">Loading…</p>
  }

  if (!locations.length) {
    return (
      <div
        data-elevated-card="surface"
        className="rounded-3xl border border-zinc-800 bg-zinc-900/50 px-4 py-10 text-center"
      >
        <p className="font-semibold text-white">No locations yet</p>
        <p className="mt-1 text-sm text-zinc-500">Log sessions with a venue to see them here.</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2 pb-4">
        {locations.map((loc) => {
          const plColor = loc.totalPL >= 0 ? 'text-emerald-400' : 'text-rose-400'
          const hourlyColor =
            loc.hourlyRate == null
              ? 'text-zinc-500'
              : loc.hourlyRate >= 0
                ? 'text-emerald-400'
                : 'text-rose-400'
          const winColor =
            loc.winPct == null ? 'text-zinc-500' : loc.winPct >= 50 ? 'text-zinc-400' : 'text-rose-400'
          return (
            <button
              key={loc.name}
              type="button"
              onClick={() => setSelectedLocation(loc)}
              data-elevated-card="surface"
              className="w-full rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-4 text-left touch-manipulation active:bg-zinc-800/80"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">{loc.name}</div>
                  <div className="mt-0.5 text-xs text-zinc-500">{loc.subtitle}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
                    <span>
                      {loc.completed} Entries
                    </span>
                    <span aria-hidden>·</span>
                    <span>{loc.totalHours.toFixed(0)}h</span>
                    {loc.hourlyRate != null ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className={`font-semibold ${hourlyColor}`}>
                          {fmtPoker$(loc.hourlyRate)}/h
                        </span>
                      </>
                    ) : null}
                    {loc.winPct != null ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className={winColor}>{loc.winPct.toFixed(0)}% won</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className={`shrink-0 text-xl font-black tabular-nums ${plColor}`}>
                  {fmtPoker$(loc.totalPL)}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {selectedLocation ? (
        <LocationDetailModal
          location={selectedLocation}
          onClose={() => setSelectedLocation(null)}
          onEditSession={onEditSession}
        />
      ) : null}
    </>
  )
}
