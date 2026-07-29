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

function GameRows({ rows }) {
  if (!rows.length) {
    return <p className="py-2 text-center text-xs text-zinc-500">No sessions yet</p>
  }
  return (
    <div>
      <div className="mb-1 grid grid-cols-[1.4fr_0.7fr_0.9fr_0.9fr] gap-1">
        <ColHead />
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

function AccordionSection({ title, titleClass, open, onToggle, columnHeads, children }) {
  return (
    <Card>
      <button
        type="button"
        onClick={onToggle}
        className="mb-1 flex w-full items-center gap-2 touch-manipulation"
      >
        <span className={`text-sm ${open ? 'rotate-0' : '-rotate-90'} text-zinc-400 transition-transform`}>
          ▾
        </span>
        <span className={`flex-1 text-left text-[15px] font-semibold ${titleClass}`}>{title}</span>
        {columnHeads ? (
          <div className="grid w-[55%] grid-cols-3 gap-1">
            <ColHead className="text-right">Hours</ColHead>
            <ColHead className="text-right">$/h</ColHead>
            <ColHead className="text-right">Total</ColHead>
          </div>
        ) : null}
      </button>
      {open ? <div className="mt-1">{children}</div> : null}
    </Card>
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
 * Poker bankroll DETAILS tab (Total / Sessions / Games + Cash/Tourney accordions).
 */
export default function PokerBankrollOverview({ sessions = [] }) {
  const stats = useMemo(() => buildPokerOverviewStats(sessions), [sessions])
  const [cashOpen, setCashOpen] = useState(true)
  const [tourneyOpen, setTourneyOpen] = useState(true)
  const [cashMode, setCashMode] = useState('tiers') // 'tiers' | 'games'
  const [tourneyMode, setTourneyMode] = useState('games')

  const { cash, tourney, total } = stats

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

      {/* Games */}
      <Card>
        <div className="mb-2 text-[15px] font-semibold text-zinc-200">Games</div>
        <GameRows rows={stats.allByGame.slice(0, 12)} />
      </Card>

      {/* Cash Game accordion */}
      <AccordionSection
        title="Cash Game"
        titleClass="text-cyan-400"
        open={cashOpen}
        onToggle={() => setCashOpen((v) => !v)}
        columnHeads
      >
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
        <GameRows rows={cashMode === 'tiers' ? stats.cashByTier : stats.cashByGame} />
        <div className="mt-2">
          <StatPairRow label="Sessions" value={String(cash.sessions)} />
          <StatPairRow
            label="Rebuys"
            value={`${cash.rebuys}${cash.sessions ? ` (${fmtPct(cash.rebuyPct)})` : ''}`}
          />
          <StatPairRow
            label="BB/h"
            value={cash.bbPerHour == null ? '-' : fmtNum(cash.bbPerHour, 2)}
            tone
          />
          <StatPairRow label="Avg Winnings" value={fmtPokerOverview$(cash.avgWinnings)} tone />
          <StatPairRow label="Avg Losses" value={fmtPokerOverview$(cash.avgLosses)} tone />
        </div>
      </AccordionSection>

      {/* Tournament accordion */}
      <AccordionSection
        title="Tournament"
        titleClass="text-amber-300"
        open={tourneyOpen}
        onToggle={() => setTourneyOpen((v) => !v)}
        columnHeads
      >
        <div className="mb-2 flex gap-2">
          <button
            type="button"
            onClick={() => setTourneyMode('games')}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold touch-manipulation ${
              tourneyMode === 'games' ? 'bg-amber-500/20 text-amber-200' : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            By game
          </button>
        </div>
        <GameRows rows={stats.tourneyByGame} />
        <div className="mt-2">
          <StatPairRow label="Bounty winnings" value={fmtPokerOverview$(tourney.bounty)} tone />
          <StatPairRow label="Sessions" value={String(tourney.sessions)} />
          <StatPairRow
            label="Rebuys"
            value={`${tourney.rebuys}${tourney.sessions ? ` (${fmtPct(tourney.rebuyPct)})` : ''}`}
          />
          <StatPairRow
            label="ITM"
            value={`${tourney.itm}${tourney.sessions ? ` (${fmtPct(tourney.itmPct)})` : ''}`}
          />
          <StatPairRow
            label="Final Table"
            value={`${tourney.finalTable}${tourney.sessions ? ` (${fmtPct(tourney.finalTablePct)})` : ''}`}
          />
          <StatPairRow
            label="Runner-Up"
            value={`${tourney.runnerUp}${tourney.sessions ? ` (${fmtPct(tourney.runnerUpPct)})` : ''}`}
          />
          <StatPairRow
            label="Victories"
            value={`${tourney.victories}${tourney.sessions ? ` (${fmtPct(tourney.victoriesPct)})` : ''}`}
          />
        </div>
      </AccordionSection>

      <MonthCompare current={stats.currentMonth} last={stats.lastMonth} />
      <TrendCard months={stats.trendMonths} agg={stats.trendAgg} />
    </div>
  )
}
