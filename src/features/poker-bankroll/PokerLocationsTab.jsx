import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DollarSign, Trophy } from 'lucide-react'
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import {
  fmtPoker$,
  pokerSessionDurationHours,
  pokerSessionTotalCost,
  pokerSessionWinLoss,
} from './pokerBankrollMath.js'
import { pokerSessionStakesLabel } from './pokerSessionLabels.js'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler)

/** Chart.js tooltip / axis chrome for EDGE light vs dark (`html.light`). */
function pokerLocationChartChrome() {
  const isLight =
    typeof document !== 'undefined' && document.documentElement.classList.contains('light')
  if (isLight) {
    return {
      isLight: true,
      tooltipBg: '#ffffff',
      tooltipBorder: '#d4d4d8',
      tooltipTitle: '#52525b',
      tooltipBody: '#18181b',
      crosshair: 'rgba(24,24,27,0.45)',
      crosshairDot: '#18181b',
      grid: 'rgba(24,24,27,0.06)',
      ticks: '#71717a',
      pos: '#059669',
      neg: '#dc2626',
    }
  }
  return {
    isLight: false,
    tooltipBg: '#3f3f46',
    tooltipBorder: '#52525b',
    tooltipTitle: '#e4e4e7',
    tooltipBody: '#fafafa',
    crosshair: 'rgba(255,255,255,0.55)',
    crosshairDot: '#ffffff',
    grid: 'rgba(255,255,255,0.06)',
    ticks: '#71717a',
    pos: '#34d399',
    neg: '#f87171',
  }
}

function fmtChartSessionDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Cumulative P&L line with slide-to-scrub crosshair + session callout.
 * @param {{ sessions: object[] }} props completed sessions, oldest → newest
 */
function LocationCumulativeScrubChart({ sessions }) {
  const chartRef = useRef(null)
  const wrapRef = useRef(null)
  const activeRef = useRef(null)
  const [active, setActive] = useState(null)
  const chrome = useMemo(() => pokerLocationChartChrome(), [])

  const { chartData, sessionResults, lineData } = useMemo(() => {
    const results = []
    let running = 0
    const data = (sessions || []).map((s) => {
      const wl = pokerSessionWinLoss(s) ?? 0
      results.push(wl)
      running += wl
      return parseFloat(running.toFixed(2))
    })
    const pointRadius = data.length <= 15 ? 3 : 0
    const pointColors = results.map((r) => (r >= 0 ? '#34d399' : '#f87171'))
    return {
      sessionResults: results,
      lineData: data,
      chartData: {
        labels: data.map((_, i) => `#${i + 1}`),
        datasets: [
          {
            data,
            segment: {
              borderColor: (ctx) => (results[ctx.p1DataIndex] >= 0 ? '#34d399' : '#f87171'),
            },
            borderColor: '#71717a',
            fill: {
              target: 'origin',
              above: 'rgba(52,211,153,0.10)',
              below: 'rgba(248,113,113,0.10)',
            },
            borderWidth: 2,
            pointRadius,
            pointHoverRadius: 0,
            pointBackgroundColor: pointColors,
            pointBorderColor: pointColors,
            tension: 0.3,
          },
        ],
      },
    }
  }, [sessions])

  const crosshairPlugin = useMemo(
    () => ({
      id: 'pokerLocationCrosshair',
      afterDraw(chart) {
        const a = activeRef.current
        if (a?.index == null) return
        const meta = chart.getDatasetMeta(0)
        const pt = meta?.data?.[a.index]
        if (!pt || pt.x == null || pt.y == null) return
        const { ctx, chartArea } = chart
        ctx.save()
        ctx.beginPath()
        ctx.setLineDash([4, 4])
        ctx.strokeStyle = chrome.crosshair
        ctx.lineWidth = 1
        ctx.moveTo(pt.x, chartArea.top)
        ctx.lineTo(pt.x, chartArea.bottom)
        ctx.stroke()
        ctx.beginPath()
        ctx.setLineDash([])
        ctx.fillStyle = chrome.crosshairDot
        ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      },
    }),
    [chrome.crosshair, chrome.crosshairDot],
  )

  useEffect(() => {
    activeRef.current = active
    chartRef.current?.update?.('none')
  }, [active])

  const scrub = useCallback(
    (nativeEvent) => {
      const chart = chartRef.current
      if (!chart || !sessions?.length) return
      const els = chart.getElementsAtEventForMode(
        nativeEvent,
        'index',
        { intersect: false },
        false,
      )
      if (!els.length) return
      const index = els[0].index
      const meta = chart.getDatasetMeta(0)
      const pt = meta?.data?.[index]
      if (!pt) return
      const session = sessions[index]
      const sessionPL = sessionResults[index] ?? 0
      const cumPL = lineData[index] ?? 0
      setActive({
        index,
        x: pt.x,
        y: pt.y,
        wrapW: wrapRef.current?.clientWidth || 320,
        session,
        sessionPL,
        cumPL,
      })
    },
    [lineData, sessionResults, sessions],
  )

  const onPointerDown = useCallback(
    (e) => {
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      scrub(e.nativeEvent)
    },
    [scrub],
  )

  const onPointerMove = useCallback(
    (e) => {
      scrub(e.nativeEvent)
    },
    [scrub],
  )

  const onPointerUp = useCallback((e) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }, [])

  const onPointerLeave = useCallback(() => {
    setActive(null)
  }, [])

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          grid: { color: chrome.grid },
          ticks: {
            color: chrome.ticks,
            font: { size: 10 },
            maxTicksLimit: 6,
            maxRotation: 0,
          },
        },
        y: {
          grid: { color: chrome.grid },
          ticks: {
            color: chrome.ticks,
            font: { size: 10 },
            callback: (v) => fmtPoker$(v),
          },
        },
      },
    }),
    [chrome.grid, chrome.ticks],
  )

  const tipW = 168
  const wrapW = active?.wrapW || 320
  let tipLeft = active ? active.x + 12 : 0
  if (active && tipLeft + tipW > wrapW - 4) tipLeft = Math.max(4, active.x - tipW - 12)
  const tipTop = active ? Math.max(4, active.y - 42) : 0
  const cumTone = active && active.cumPL >= 0 ? chrome.pos : chrome.neg
  const sessionTone = active && active.sessionPL >= 0 ? chrome.pos : chrome.neg

  return (
    <div
      ref={wrapRef}
      className="relative h-[160px] touch-none select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerLeave}
    >
      <Line ref={chartRef} data={chartData} options={options} plugins={[crosshairPlugin]} />
      {active?.session ? (
        <div
          className="pointer-events-none absolute z-10 rounded-lg px-2.5 py-1.5 shadow-lg"
          style={{
            left: tipLeft,
            top: tipTop,
            minWidth: 140,
            maxWidth: tipW,
            background: chrome.tooltipBg,
            border: `1px solid ${chrome.tooltipBorder}`,
          }}
        >
          <div className="text-[11px] font-medium leading-tight" style={{ color: chrome.tooltipTitle }}>
            {fmtChartSessionDate(active.session.start_at)}{' '}
            <span className="font-semibold tabular-nums" style={{ color: cumTone }}>
              ({fmtPoker$(active.cumPL)})
            </span>
          </div>
          <div className="mt-0.5 text-[10px] tabular-nums" style={{ color: chrome.tooltipTitle }}>
            Session{' '}
            <span className="font-semibold" style={{ color: sessionTone }}>
              {fmtPoker$(active.sessionPL)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

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

/** @param {'all' | 'live' | 'online' | 'club'} venue */
function filterSessionsByVenue(sessions, venue) {
  if (venue === 'all') return sessions || []
  return (sessions || []).filter((s) => (s.venue_kind || 'live') === venue)
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

/**
 * 100% segmented meter (e.g. Won / Lost mix).
 * @param {{ title: string, summary?: string, segments: { label: string, count: number, color: string }[] }} props
 */
function SegmentMeterCard({ title, summary, segments }) {
  const total = (segments || []).reduce((sum, s) => sum + (Number(s.count) || 0), 0)
  return (
    <div className="rounded-2xl border border-zinc-700/30 bg-zinc-800/50 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="text-xs text-zinc-400">{title}</div>
        {summary ? (
          <div className="text-[11px] font-bold tabular-nums text-white">{summary}</div>
        ) : null}
      </div>
      {total <= 0 ? (
        <div className="py-3 text-center text-xs text-zinc-600">No data</div>
      ) : (
        <>
          <div
            className="flex h-3.5 w-full overflow-hidden rounded-full bg-zinc-950/60 ring-1 ring-inset ring-zinc-700/40"
            role="img"
            aria-label={segments.map((s) => `${s.label} ${s.count}`).join(', ')}
          >
            {segments
              .filter((s) => (Number(s.count) || 0) > 0)
              .map((s) => (
                <div
                  key={s.label}
                  className="h-full min-w-[3px] first:rounded-l-full last:rounded-r-full"
                  style={{
                    width: `${((Number(s.count) || 0) / total) * 100}%`,
                    backgroundColor: s.color,
                  }}
                />
              ))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
            {segments.map((l) => (
              <div key={l.label} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: l.color }}
                />
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

/**
 * Cash vs Tourney value bars: bar width = share of |P/L|, labeled with P/L and $/h.
 * @param {{ sessions: object[], totalPL: number }} props
 */
function SessionTypeValueBars({ sessions, totalPL }) {
  const { rows, barMode } = useMemo(() => {
    let cashPL = 0
    let cashHrs = 0
    let cashN = 0
    let tourneyPL = 0
    let tourneyHrs = 0
    let tourneyN = 0
    for (const s of sessions || []) {
      const wl = pokerSessionWinLoss(s)
      if (wl == null) continue
      const hrs = pokerSessionDurationHours(s)
      if (s.session_type === 'tournament') {
        tourneyPL += wl
        tourneyHrs += hrs
        tourneyN += 1
      } else {
        cashPL += wl
        cashHrs += hrs
        cashN += 1
      }
    }
    const built = [
      {
        key: 'cash',
        label: 'Cash',
        count: cashN,
        profit: cashPL,
        hours: cashHrs,
        hourly: cashHrs >= 0.02 ? cashPL / cashHrs : null,
      },
      {
        key: 'tournament',
        label: 'Tourney',
        count: tourneyN,
        profit: tourneyPL,
        hours: tourneyHrs,
        hourly: tourneyHrs >= 0.02 ? tourneyPL / tourneyHrs : null,
      },
    ].filter((r) => r.count > 0)

    // Bar length: relative |$/h| when both have rates, else |P/L| share.
    const hourlies = built.map((r) => (r.hourly != null ? Math.abs(r.hourly) : null))
    const allHaveHourly = hourlies.length > 0 && hourlies.every((h) => h != null)
    const maxHourly = allHaveHourly ? Math.max(...hourlies, 0.01) : 0
    const absPlSum = built.reduce((sum, r) => sum + Math.abs(r.profit), 0)

    return {
      barMode: allHaveHourly ? 'hourly' : 'pl',
      rows: built.map((r) => {
        const widthPct = allHaveHourly
          ? (Math.abs(r.hourly) / maxHourly) * 100
          : absPlSum > 0
            ? (Math.abs(r.profit) / absPlSum) * 100
            : 0
        const ofTotal =
          totalPL != null && Math.abs(totalPL) >= 0.005
            ? (r.profit / totalPL) * 100
            : null
        return { ...r, widthPct: Math.max(widthPct, r.count > 0 ? 6 : 0), ofTotal }
      }),
    }
  }, [sessions, totalPL])

  if (!rows.length) return null

  return (
    <div className="rounded-2xl border border-zinc-700/30 bg-zinc-800/50 p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <div className="text-xs text-zinc-400">Value by type</div>
        <div className="text-[10px] text-zinc-500">
          {barMode === 'hourly' ? 'bar = relative $/h' : 'bar = share of |P/L|'}
        </div>
      </div>
      <div className="space-y-3">
        {rows.map((row) => {
          const positive = row.profit >= 0
          const barColor = positive ? '#34d399' : '#f87171'
          return (
            <div key={row.key}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-[12px] font-semibold text-white">
                  {row.label}{' '}
                  <span className="font-normal text-zinc-500">({row.count})</span>
                </span>
                <span
                  className={`text-[12px] font-bold tabular-nums ${
                    positive ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {fmtPoker$(row.profit)}
                  {row.hourly != null ? (
                    <span className="font-semibold text-zinc-400">
                      {' '}
                      · {fmtPoker$(row.hourly)}/h
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-950/60 ring-1 ring-inset ring-zinc-700/40">
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{
                    width: `${Math.min(100, row.widthPct)}%`,
                    backgroundColor: barColor,
                  }}
                />
              </div>
              {row.ofTotal != null ? (
                <div className="mt-0.5 text-[10px] tabular-nums text-zinc-500">
                  {row.ofTotal >= 0 ? '+' : ''}
                  {row.ofTotal.toFixed(0)}% of location P/L
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
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

function LocationDetailModal({ location, onClose, onOpenSession }) {
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

  const wonCount = completed.filter((s) => (pokerSessionWinLoss(s) ?? 0) >= 0).length
  const lostCount = completed.length - wonCount

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
        className={`${APP_MODAL_SHEET_PANEL_CLASS} max-w-[100vw] min-w-0 overflow-x-hidden overscroll-x-none touch-pan-y no-scrollbar px-4 pb-[calc(1.25rem+max(env(safe-area-inset-bottom, 0px), var(--edge-sab, 0px)))] pt-4`}
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
            <LocationCumulativeScrubChart sessions={completed} />
          </div>
        ) : null}

        {completed.length > 0 ? (
          <div className="mb-4 space-y-2">
            <SessionTypeValueBars sessions={completed} totalPL={location.totalPL} />
            <SegmentMeterCard
              title="Outcome"
              summary={location.winPct != null ? `${location.winPct.toFixed(0)}% won` : undefined}
              segments={[
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
                    onOpenSession?.(session)
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
                      onOpenSession?.(session)
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

const VENUE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'online', label: 'Online' },
  { id: 'club', label: 'Club' },
]

export default function PokerLocationsTab({ sessions, loading, onOpenSession }) {
  const [selectedLocation, setSelectedLocation] = useState(null)
  /** @type {'all' | 'live' | 'online' | 'club'} */
  const [venueFilter, setVenueFilter] = useState('all')

  const filteredSessions = useMemo(
    () => filterSessionsByVenue(sessions, venueFilter),
    [sessions, venueFilter],
  )
  const locations = useMemo(
    () => buildLocationStats(filteredSessions),
    [filteredSessions],
  )
  const hasAnySessions = (sessions || []).length > 0

  function selectVenueFilter(id) {
    setVenueFilter(id)
    setSelectedLocation(null)
  }

  if (loading) {
    return <p className="py-16 text-center text-sm text-zinc-500">Loading…</p>
  }

  if (!hasAnySessions) {
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
      <div className="mb-3 flex flex-wrap gap-1.5">
        {VENUE_FILTERS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => selectVenueFilter(opt.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold touch-manipulation ${
              venueFilter === opt.id
                ? 'bg-zinc-700 text-white'
                : 'bg-zinc-800/60 text-zinc-500 active:bg-zinc-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {!locations.length ? (
        <div
          data-elevated-card="surface"
          className="rounded-3xl border border-zinc-800 bg-zinc-900/50 px-4 py-10 text-center"
        >
          <p className="font-semibold text-white">No locations for this filter</p>
          <p className="mt-1 text-sm text-zinc-500">Try All, or another Live / Online / Club filter.</p>
        </div>
      ) : (
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
                key={`${venueFilter}:${loc.name}`}
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
                      <span>{loc.completed} Entries</span>
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
      )}

      {selectedLocation ? (
        <LocationDetailModal
          location={selectedLocation}
          onClose={() => setSelectedLocation(null)}
          onOpenSession={onOpenSession}
        />
      ) : null}
    </>
  )
}
