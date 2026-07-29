import { useMemo, useState } from 'react'
import { DollarSign, Trophy } from 'lucide-react'
import { buildPokerOverviewStats, fmtPokerOverview$ } from './pokerOverviewStats.js'

/** Full dollars for the Total hero (no $7.5k shorthand, no cents). */
function fmtTotalWhole$(n) {
  if (n == null || Number.isNaN(Number(n))) return '-'
  const num = Number(n)
  const body = `$${Math.round(Math.abs(num)).toLocaleString()}`
  return num < 0 ? `-${body}` : body
}

function toneClass(n) {
  if (n == null || Number.isNaN(Number(n)) || Math.abs(Number(n)) < 0.0005) return 'text-zinc-200'
  return Number(n) > 0 ? 'text-emerald-400' : 'text-rose-400'
}

function fmtPct(n) {
  if (n == null || Number.isNaN(Number(n))) return '-'
  return `${Math.round(Number(n))}%`
}

function fmtNum(n, digits = 0) {
  if (n == null || Number.isNaN(Number(n))) return '-'
  return Number(n).toFixed(digits)
}

function Card({ children, className = '' }) {
  return (
    <div
      data-elevated-card="surface"
      className={`mb-3 rounded-2xl border border-zinc-700/50 bg-zinc-900/80 px-3.5 py-3 ${className}`}
    >
      {children}
    </div>
  )
}

function ColHead({ children, className = '' }) {
  return (
    <div className={`text-[10px] font-semibold uppercase tracking-wide text-zinc-500 ${className}`}>
      {children}
    </div>
  )
}

/** CG / Tourney matrix column label: icon stacked above text, right-justified. */
function MatrixTypeHead({ label, Icon, className = '' }) {
  return (
    <div
      className={`flex flex-col items-end justify-end gap-0.5 text-[10px] font-semibold uppercase tracking-wide ${className}`}
    >
      <Icon size={14} strokeWidth={2} aria-hidden className="opacity-90" />
      <span>{label}</span>
    </div>
  )
}

function MatrixRow({ label, c, t, tot, format = 'money', tone = false }) {
  const fmt = (v) => {
    if (format === 'money') return fmtPokerOverview$(v)
    if (format === 'pct') return fmtPct(v)
    if (format === 'hours') return fmtNum(v, 0)
    if (format === 'dec1') return fmtNum(v, 1)
    if (format === 'dec2') return fmtNum(v, 2)
    return fmtNum(v, 0)
  }
  const cell = (v) => (
    <span className={`tabular-nums text-right text-[13px] font-semibold ${tone ? toneClass(v) : 'text-zinc-100'}`}>
      {fmt(v)}
    </span>
  )
  return (
    <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr] items-center gap-1 border-t border-zinc-800/80 py-2 first:border-t-0">
      <span className="text-[13px] text-zinc-400">{label}</span>
      {cell(c)}
      {cell(t)}
      {cell(tot)}
    </div>
  )
}

function StatPairRow({ label, value, tone = false }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-zinc-800/80 py-2 first:border-t-0">
      <span className="text-[13px] text-zinc-400">{label}</span>
      <span className={`text-[13px] font-semibold tabular-nums ${tone ? toneClass(value) : 'text-zinc-100'}`}>
        {value}
      </span>
    </div>
  )
}

function GameRows({ rows, firstColLabel = '' }) {
  if (!rows.length) {
    return <p className="py-2 text-center text-xs text-zinc-500">No sessions yet</p>
  }
  return (
    <div>
      <div className="mb-1 grid grid-cols-[1.4fr_0.7fr_0.9fr_0.9fr] gap-1">
        <ColHead>{firstColLabel}</ColHead>
        <ColHead className="text-right">Hours</ColHead>
        <ColHead className="text-right">$/h</ColHead>
        <ColHead className="text-right">Total</ColHead>
      </div>
      {rows.map((r) => (
        <div
          key={r.label}
          className="grid grid-cols-[1.4fr_0.7fr_0.9fr_0.9fr] items-center gap-1 border-t border-zinc-800/80 py-2"
        >
          <span className="truncate text-[13px] text-zinc-200">{r.label}</span>
          <span className="text-right text-[13px] tabular-nums text-zinc-300">{fmtNum(r.hours, 0)}</span>
          <span className={`text-right text-[13px] font-semibold tabular-nums ${toneClass(r.hourly)}`}>
            {fmtPokerOverview$(r.hourly)}
          </span>
          <span className={`text-right text-[13px] font-semibold tabular-nums ${toneClass(r.profit)}`}>
            {fmtPokerOverview$(r.profit)}
          </span>
        </div>
      ))}
    </div>
  )
}

function SectionCard({ title, titleClass, children }) {
  return (
    <Card>
      <div className={`mb-2 text-[15px] font-semibold ${titleClass}`}>{title}</div>
      {children}
    </Card>
  )
}

/** @param {'all' | 'live' | 'online' | 'club'} venue */
function filterSessionsByVenue(sessions, venue) {
  if (venue === 'all') return sessions || []
  return (sessions || []).filter((s) => (s.venue_kind || 'live') === venue)
}

function VenueChips({ value, onChange, activeClass }) {
  return (
    <div className="mb-2 flex gap-2">
      {[
        { id: 'all', label: 'All' },
        { id: 'live', label: 'Live' },
        { id: 'online', label: 'Online' },
        { id: 'club', label: 'Club' },
      ].map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold touch-manipulation ${
            value === opt.id ? activeClass : 'bg-zinc-800 text-zinc-500'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function MonthCompare({ current, last }) {
  const cells = [
    { label: 'SESSIONS', c: current.sessions, l: last.sessions, fmt: (v) => String(v) },
    { label: 'HOURS', c: current.hours, l: last.hours, fmt: (v) => fmtNum(v, 0) },
    {
      label: 'NET PROFIT',
      c: current.profit,
      l: last.profit,
      fmt: (v) => fmtPokerOverview$(v),
      tone: true,
    },
    {
      label: 'HOURLY',
      c: current.hourly,
      l: last.hourly,
      fmt: (v) => fmtPokerOverview$(v),
      tone: true,
    },
  ]
  return (
    <Card>
      <div className="mb-3 text-center text-[13px] font-semibold text-zinc-300">
        Current Month / Last Month
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {cells.map((cell) => (
          <div key={cell.label} className="text-center">
            <div className="text-[15px] font-bold tabular-nums">
              <span className={cell.tone ? toneClass(cell.c) : 'text-white'}>{cell.fmt(cell.c)}</span>
              <span className="text-zinc-500"> / </span>
              <span className={cell.tone ? toneClass(cell.l) : 'text-zinc-300'}>{cell.fmt(cell.l)}</span>
            </div>
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              {cell.label}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-center">
        <div className="text-[15px] font-bold tabular-nums">
          <span className={toneClass(current.roi)}>{fmtPct(current.roi)}</span>
          <span className="text-zinc-500"> / </span>
          <span className={toneClass(last.roi)}>{fmtPct(last.roi)}</span>
        </div>
        <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">ROI</div>
      </div>
    </Card>
  )
}

function TrendCard({ months, agg }) {
  const maxAbs = Math.max(...months.map((m) => Math.abs(m.profit)), 1)
  const points = months.map((m, i) => {
    const x = (i / Math.max(months.length - 1, 1)) * 100
    const y = 50 - (m.profit / maxAbs) * 40
    return `${x},${y}`
  })
  const stroke = agg.profit >= 0 ? '#34d399' : '#fb7185'

  return (
    <Card>
      <div className="mb-2 text-[13px] font-semibold text-zinc-300">3-Month Trend</div>
      <svg viewBox="0 0 100 60" className="mb-3 h-16 w-full" preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          points={points.join(' ')}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { label: 'HOURS', value: fmtNum(agg.hours, 0), tone: false },
          { label: 'HOURLY', value: fmtPokerOverview$(agg.hourly), tone: true, n: agg.hourly },
          { label: 'ROI', value: fmtPct(agg.roi), tone: true, n: agg.roi },
          { label: 'NET PROFIT', value: fmtPokerOverview$(agg.profit), tone: true, n: agg.profit },
        ].map((c) => (
          <div key={c.label}>
            <div className={`text-[13px] font-bold tabular-nums ${c.tone ? toneClass(c.n) : 'text-white'}`}>
              {c.value}
            </div>
            <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
              {c.label}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

/**
 * Poker bankroll DETAILS tab (Total / Sessions + Cash/Tourney sections).
 */
export default function PokerBankrollOverview({ sessions = [] }) {
  const stats = useMemo(() => buildPokerOverviewStats(sessions), [sessions])
  const [cashMode, setCashMode] = useState('tiers') // 'tiers' | 'games'
  const [tourneyMode, setTourneyMode] = useState('tiers') // 'tiers' | 'games'
  const [cashVenue, setCashVenue] = useState('all') // 'all' | 'live' | 'online' | 'club'
  const [tourneyVenue, setTourneyVenue] = useState('all')

  const completed = useMemo(
    () => (sessions || []).filter((s) => s.status !== 'active'),
    [sessions],
  )
  const cashSessions = useMemo(
    () => completed.filter((s) => s.session_type === 'cash'),
    [completed],
  )
  const tourneySessions = useMemo(
    () => completed.filter((s) => s.session_type === 'tournament'),
    [completed],
  )

  const cashScoped = useMemo(
    () => buildPokerOverviewStats(filterSessionsByVenue(cashSessions, cashVenue)),
    [cashSessions, cashVenue],
  )
  const tourneyScoped = useMemo(
    () => buildPokerOverviewStats(filterSessionsByVenue(tourneySessions, tourneyVenue)),
    [tourneySessions, tourneyVenue],
  )

  const { cash, tourney, total } = stats
  const cashView = cashScoped.cash
  const tourneyView = tourneyScoped.tourney

  return (
    <div className="pb-4">
      {/* Total */}
      <Card>
        <div className="mb-2 flex items-end justify-between gap-2">
          <div className="text-[15px] font-semibold text-zinc-200">Total</div>
          <div className={`text-xl font-black tabular-nums ${toneClass(total.profit)}`}>
            {fmtTotalWhole$(total.profit)}
          </div>
        </div>
        <div className="mb-1 grid grid-cols-[1.2fr_1fr_1fr_1fr] items-end gap-1">
          <ColHead />
          <MatrixTypeHead label="Cash" Icon={DollarSign} className="text-cyan-400" />
          <MatrixTypeHead label="Tourney" Icon={Trophy} className="text-amber-300" />
          <ColHead className="text-right">Total</ColHead>
        </div>
        <MatrixRow label="Buy-In" c={cash.buyIn} t={tourney.buyIn} tot={total.buyIn} />
        <MatrixRow label="Cash-Out" c={cash.cashOut} t={tourney.cashOut} tot={total.cashOut} />
        <MatrixRow
          label="Net profit"
          c={cash.profit}
          t={tourney.profit}
          tot={total.profit}
          tone
        />
      </Card>

      {/* Sessions */}
      <Card>
        <div className="mb-1 grid grid-cols-[1.2fr_1fr_1fr_1fr] items-end gap-1">
          <div className="text-[15px] font-semibold text-zinc-200">Sessions</div>
          <MatrixTypeHead label="Cash" Icon={DollarSign} className="text-cyan-400" />
          <MatrixTypeHead label="Tourney" Icon={Trophy} className="text-amber-300" />
          <ColHead className="text-right">Total</ColHead>
        </div>
        <MatrixRow label="Sessions" c={cash.sessions} t={tourney.sessions} tot={total.sessions} format="hours" />
        <MatrixRow label="Hours" c={cash.hours} t={tourney.hours} tot={total.hours} format="hours" />
        <MatrixRow label="$/h" c={cash.hourly} t={tourney.hourly} tot={total.hourly} tone />
        <MatrixRow
          label="$/100"
          c={cash.dollarsPer100}
          t={tourney.dollarsPer100}
          tot={total.dollarsPer100}
          tone
        />
        <MatrixRow label="ROI" c={cash.roi} t={tourney.roi} tot={total.roi} format="pct" tone />
        <MatrixRow label="Won" c={cash.wonPct} t={tourney.wonPct} tot={total.wonPct} format="pct" tone />
        <MatrixRow label="Avg Buy-In" c={cash.avgBuyIn} t={tourney.avgBuyIn} tot={total.avgBuyIn} />
        <MatrixRow
          label="Avg Profit"
          c={cash.avgProfit}
          t={tourney.avgProfit}
          tot={total.avgProfit}
          tone
        />
        <MatrixRow
          label="Avg Rebuys"
          c={cash.avgRebuys}
          t={tourney.avgRebuys}
          tot={total.avgRebuys}
          format="dec1"
        />
      </Card>

      <Card>
        <div className="mb-2 text-[15px] font-semibold text-zinc-200">Games</div>
        <GameRows rows={stats.byGameField} firstColLabel="Games" />
      </Card>

      <SectionCard title="Cash Game" titleClass="text-cyan-400">
        <VenueChips
          value={cashVenue}
          onChange={setCashVenue}
          activeClass="bg-cyan-600/30 text-cyan-300"
        />
        <div className="mb-2 flex gap-2">
          <button
            type="button"
            onClick={() => setCashMode('tiers')}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold touch-manipulation ${
              cashMode === 'tiers' ? 'bg-cyan-600/30 text-cyan-300' : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            Stakes
          </button>
          <button
            type="button"
            onClick={() => setCashMode('games')}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold touch-manipulation ${
              cashMode === 'games' ? 'bg-cyan-600/30 text-cyan-300' : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            By game
          </button>
        </div>
        <GameRows rows={cashMode === 'tiers' ? cashScoped.cashByTier : cashScoped.cashByGame} />
        <div className="mt-2">
          <StatPairRow label="Sessions" value={String(cashView.sessions)} />
          <StatPairRow
            label="Rebuys"
            value={`${cashView.rebuys}${cashView.sessions ? ` (${fmtPct(cashView.rebuyPct)})` : ''}`}
          />
          <StatPairRow
            label="BB/h"
            value={cashView.bbPerHour == null ? '-' : fmtNum(cashView.bbPerHour, 2)}
            tone
          />
          <StatPairRow
            label="BB/100"
            value={cashView.bbPer100 == null ? '-' : fmtNum(cashView.bbPer100, 2)}
            tone
          />
          <StatPairRow label="Avg Winnings" value={fmtPokerOverview$(cashView.avgWinnings)} tone />
          <StatPairRow label="Avg Losses" value={fmtPokerOverview$(cashView.avgLosses)} tone />
        </div>
      </SectionCard>

      <SectionCard title="Tournament" titleClass="text-amber-300">
        <VenueChips
          value={tourneyVenue}
          onChange={setTourneyVenue}
          activeClass="bg-amber-500/20 text-amber-200"
        />
        <div className="mb-2 flex gap-2">
          <button
            type="button"
            onClick={() => setTourneyMode('tiers')}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold touch-manipulation ${
              tourneyMode === 'tiers' ? 'bg-amber-500/20 text-amber-200' : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            Stakes
          </button>
          <button
            type="button"
            onClick={() => setTourneyMode('games')}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold touch-manipulation ${
              tourneyMode === 'games' ? 'bg-amber-500/20 text-amber-200' : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            By event
          </button>
        </div>
        <GameRows
          rows={tourneyMode === 'tiers' ? tourneyScoped.tourneyByTier : tourneyScoped.tourneyByGame}
        />
        <div className="mt-2">
          <StatPairRow label="Bounty winnings" value={fmtPokerOverview$(tourneyView.bounty)} tone />
          <StatPairRow label="Sessions" value={String(tourneyView.sessions)} />
          <StatPairRow
            label="Rebuys"
            value={`${tourneyView.rebuys}${tourneyView.sessions ? ` (${fmtPct(tourneyView.rebuyPct)})` : ''}`}
          />
          <StatPairRow
            label="ITM"
            value={`${tourneyView.itm}${tourneyView.sessions ? ` (${fmtPct(tourneyView.itmPct)})` : ''}`}
          />
          <StatPairRow
            label="Final Table"
            value={`${tourneyView.finalTable}${tourneyView.sessions ? ` (${fmtPct(tourneyView.finalTablePct)})` : ''}`}
          />
          <StatPairRow
            label="Runner-Up"
            value={`${tourneyView.runnerUp}${tourneyView.sessions ? ` (${fmtPct(tourneyView.runnerUpPct)})` : ''}`}
          />
          <StatPairRow
            label="Victories"
            value={`${tourneyView.victories}${tourneyView.sessions ? ` (${fmtPct(tourneyView.victoriesPct)})` : ''}`}
          />
        </div>
      </SectionCard>

      <MonthCompare current={stats.currentMonth} last={stats.lastMonth} />
      <TrendCard months={stats.trendMonths} agg={stats.trendAgg} />
    </div>
  )
}
