import { useState, useMemo, useRef, useEffect } from 'react'
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

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler)

const FILTERS = [
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: 'YTD', days: null, ytd: true },
  { label: '1Y', days: 365 },
  { label: '3Y', days: 1095 },
  { label: 'MAX', days: null },
]

const HORIZONS = [50, 100, 200]
const RUIN_FRACTION = 0.75

// ── Info text ─────────────────────────────────────────────────────────────────

const INFO = {
  winRate: {
    title: 'Win Rate',
    body: 'The percentage of sessions where you cashed out for a profit. Most AP slot strategies have win rates below 50% because significant wins are infrequent events. Evaluate this together with Payoff Ratio: a 35% win rate combined with a 2:1 payoff is a perfectly viable long-run edge.',
  },
  expectancy: {
    title: 'Expectancy',
    body: 'Your average dollar result per session. This is the foundational number of any AP strategy. A positive expectancy over a statistically meaningful sample means you have a real, extractable edge. A small positive expectancy requires a larger bankroll and longer runway before consistent extraction is possible.',
  },
  profitFactor: {
    title: 'Profit Factor',
    body: 'Total gross winnings divided by total gross losses. A value above 1.0 means your strategy is profitable. Widely used in both betting and trading as a core benchmark. A Profit Factor of 1.4 means for every dollar lost across all losing sessions, you win $1.40 across all winning sessions.',
  },
  payoffRatio: {
    title: 'Payoff Ratio',
    body: 'Average winning session size divided by average losing session size. For strategies with sub-50% win rates, you need this above 1.0 to remain profitable over time. In AP slot play, jackpot events or high-value promotion captures drive this metric up significantly. Pair it with Win Rate to read the full picture.',
  },
  stdDev: {
    title: 'Standard Deviation',
    body: 'The volatility of your session P&L in dollars. High standard deviation relative to Expectancy means more variance per session, requiring a larger bankroll to survive natural swings before your edge shows through. It is also the denominator in most risk-adjusted performance ratios.',
  },
  skewness: {
    title: 'Skewness',
    body: 'Measures how asymmetric your P&L distribution is. Positive skewness means rare large wins pull your average above the median, which is a desirable property in AP gaming where you want to capture occasional high-value events. Negative skewness is a warning sign: it indicates rare catastrophic losses even if your average result is positive.',
  },
  sortino: {
    title: 'Sortino Ratio',
    body: 'Your average session P&L divided by downside deviation only. Unlike Sharpe Ratio, large wins do not count against your score. For AP slot play this is the appropriate risk-adjusted metric because you want to minimize downside volatility, not total volatility. Higher is better; anything above 0 means positive risk-adjusted returns.',
  },
  calmar: {
    title: 'Calmar Ratio',
    body: 'Total net P&L divided by maximum drawdown. Measures how much return your strategy generates per unit of worst-case historical risk. A Calmar above 1.0 means you have earned back more than your worst drawdown in total net profit. Negative means you are still underwater overall.',
  },
  kelly: {
    title: 'Kelly Fraction',
    body: 'Derived from your observed win rate and payoff ratio, this is the theoretically optimal percentage of bankroll to commit per session to maximize long-run bankroll growth. Negative Kelly means no mathematical edge is currently demonstrable from your sample. Full Kelly is aggressive and volatile; Half Kelly shown here preserves most of the growth benefit while significantly reducing variance.',
  },
  maxDrawdown: {
    title: 'Max Drawdown',
    body: 'The largest peak-to-trough dollar loss across your session history. This is the worst-case scenario your bankroll has already survived. Your starting bankroll should exceed this number with enough buffer to survive it again, because max drawdown in the future is very likely to exceed the historical max.',
  },
  recoveryFactor: {
    title: 'Recovery Factor',
    body: 'Net profit divided by max drawdown. Shows how many times over your net gains exceed your worst historical losing stretch. A Recovery Factor above 2.0 is generally considered strong evidence of a sustainable edge in systematic betting contexts. Below 1.0 means your net profit has not yet recovered your worst drawdown.',
  },
  ulcerIndex: {
    title: 'Ulcer Index',
    body: 'Measures both the depth and duration of drawdowns over time. Unlike Max Drawdown, which captures a single worst event, Ulcer Index penalizes strategies that spend prolonged time below their high-water mark. A strategy with one sharp drawdown followed by a quick recovery will score better than one that grinds slowly underwater for many sessions.',
  },
  riskOfRuin: {
    title: 'Risk of Ruin',
    body: 'A Monte Carlo estimate of the probability that your bankroll drops to 25% of its current value within the selected projection horizon. Calculated from 5,000 simulations that sample your actual session history with replacement. Lower is better. Unlike formula-based RoR estimates, this captures the full shape of your P&L distribution including skewness and fat tails.',
  },
  maxWinStreak: {
    title: 'Max Win Streak',
    body: 'Your longest consecutive run of profitable sessions. Useful for understanding positive variance and calibrating expectations during hot periods. High win streaks driven by a genuine edge will tend to occur more frequently than chance would predict.',
  },
  maxLossStreak: {
    title: 'Max Loss Streak',
    body: 'Your longest consecutive run of losing sessions. This directly informs minimum bankroll requirements: your bankroll must be able to absorb this many sessions at typical buy-in sizes without being forced off the strategy. Expect future loss streaks to eventually exceed your historical worst.',
  },
}

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

function fmtDate(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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

function readChartIsDark() {
  const html = document.documentElement
  if (html.classList.contains('light')) return false
  if (html.classList.contains('dark')) return true
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
}

/** Monte Carlo fan - line/fill/legend tokens tuned per theme. */
function fanChartStyle(isDark) {
  if (isDark) {
    return {
      bandOuter: 'rgba(96,165,250,0.16)',
      bandInner: 'rgba(96,165,250,0.28)',
      bandEdge: 'rgba(147,197,253,0.62)',
      medianLine: 'rgba(147,197,253,0.92)',
      medianWidth: 2.25,
      ruinLine: 'rgba(248,113,113,0.82)',
      ruinWidth: 2,
      legendText: '#a1a1aa',
    }
  }
  return {
    bandOuter: 'rgba(37,99,235,0.22)',
    bandInner: 'rgba(37,99,235,0.40)',
    bandEdge: 'rgba(29,78,216,0.65)',
    medianLine: 'rgba(29,78,216,0.92)',
    medianWidth: 2.5,
    ruinLine: 'rgba(220,38,38,0.78)',
    ruinWidth: 2,
    legendText: '#3f3f46',
  }
}

function fmtDurationHrs(hrs) {
  if (hrs < 0.02) return '-'
  const h = Math.floor(hrs)
  const m = Math.round((hrs - h) * 60)
  if (h === 0) return `${m}m`
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function fmtRatio(n, digits = 2) {
  if (n == null || isNaN(n)) return '-'
  const sign = n >= 0 ? '+' : ''
  return sign + n.toFixed(digits)
}

// ── Monte Carlo ───────────────────────────────────────────────────────────────

function runMonteCarlo(sessionResults, currentBankroll, horizon, numSims = 5000) {
  const n = sessionResults.length
  const ruinDrop = currentBankroll != null ? currentBankroll * RUIN_FRACTION : null
  const steps = Array.from({ length: horizon }, () => new Float32Array(numSims))
  let ruinCount = 0

  for (let sim = 0; sim < numSims; sim++) {
    let cumPL = 0
    let ruined = false
    for (let step = 0; step < horizon; step++) {
      cumPL += sessionResults[Math.floor(Math.random() * n)]
      if (!ruined && ruinDrop != null && cumPL <= -ruinDrop) {
        ruined = true
        ruinCount++
      }
      steps[step][sim] = cumPL
    }
  }

  const pct = (arr, p) => arr[Math.min(Math.floor(arr.length * p), arr.length - 1)]
  const p10 = [], p25 = [], p50 = [], p75 = [], p90 = []
  for (let step = 0; step < horizon; step++) {
    steps[step].sort()
    const arr = steps[step]
    p10.push(pct(arr, 0.10))
    p25.push(pct(arr, 0.25))
    p50.push(pct(arr, 0.50))
    p75.push(pct(arr, 0.75))
    p90.push(pct(arr, 0.90))
  }

  return { ror: (ruinCount / numSims) * 100, p10, p25, p50, p75, p90, ruinDrop }
}

// ── Small components ──────────────────────────────────────────────────────────

function MetricInfoModal({ title, body, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[110] bg-black/75 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md rounded-3xl bg-zinc-900 border border-zinc-700/50 px-5 pt-5 pb-6">
        <div className="flex items-start justify-between mb-3">
          <div className="text-white font-bold text-base leading-tight">{title}</div>
          <button
            onClick={onClose}
            className="ml-3 shrink-0 rounded-full w-7 h-7 flex items-center justify-center bg-zinc-800 text-zinc-400 text-xs touch-manipulation active:bg-zinc-700"
          >
            ✕
          </button>
        </div>
        <div className="text-zinc-400 text-sm leading-relaxed">{body}</div>
      </div>
    </div>
  )
}

// Compact metric tile - used in 2-per-row pairs
function MetricTile({ label, value, color = 'text-white', sub, onInfo }) {
  return (
    <div className="flex-1 min-w-0 rounded-2xl bg-zinc-800/50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <span className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wide leading-tight truncate">
          {label}
        </span>
        {onInfo && (
          <button
            onClick={e => { e.stopPropagation(); onInfo() }}
            className="shrink-0 w-5 h-5 rounded-full border border-zinc-700/70 flex items-center justify-center text-zinc-600 text-[9px] font-bold touch-manipulation active:border-zinc-500 active:text-zinc-400"
          >
            i
          </button>
        )}
      </div>
      <div className={`text-[15px] font-bold tabular-nums leading-none ${color}`}>{value}</div>
      {sub && <div className="text-zinc-600 text-[10px] mt-1 leading-tight">{sub}</div>}
    </div>
  )
}

// Full-width metric row - used for Kelly and section-spanning metrics
function MetricRow({ label, value, color = 'text-white', sub, onInfo }) {
  return (
    <div className="rounded-2xl bg-zinc-800/50 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-white text-sm font-semibold">{label}</div>
            <button
              onClick={e => { e.stopPropagation(); onInfo() }}
              className="shrink-0 w-4 h-4 rounded-full border border-zinc-700/70 flex items-center justify-center text-zinc-600 text-[8px] font-bold touch-manipulation active:border-zinc-500 active:text-zinc-400"
            >
              i
            </button>
          </div>
          {sub && <div className="text-zinc-500 text-[10px] mt-0.5 leading-tight">{sub}</div>}
        </div>
        <div className={`shrink-0 font-bold text-sm tabular-nums ${color}`}>{value}</div>
      </div>
    </div>
  )
}

function MetricSection({ title, children }) {
  return (
    <div className="space-y-2">
      <div className="text-zinc-600 text-[9px] font-semibold uppercase tracking-widest px-0.5">{title}</div>
      {children}
    </div>
  )
}

// Session detail modal
function SessionDetailModal({ session, onClose }) {
  const wl = sessionWinLoss(session)
  const hrs = sessionDurationHours(session)
  const hourly = hrs >= 0.02 && wl != null ? wl / hrs : null

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg rounded-3xl bg-zinc-900 border border-zinc-700/50 px-5 pt-5 pb-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="text-white font-bold text-lg truncate">{session.casino_name || 'Session'}</div>
            <div className="text-zinc-500 text-xs mt-0.5">{fmtDate(session.start_at)}</div>
          </div>
          <button
            onClick={onClose}
            className="ml-3 shrink-0 rounded-full w-8 h-8 flex items-center justify-center bg-zinc-800 text-zinc-400 text-sm touch-manipulation active:bg-zinc-700"
          >
            ✕
          </button>
        </div>

        {wl != null && (
          <div className={`text-4xl font-black tabular-nums mb-5 ${wl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {wl >= 0 ? '+' : ''}{fmt$(wl)}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 mb-4">
          <DetailStat label="Duration" value={fmtDurationHrs(hrs)} />
          <DetailStat label="Buy-in" value={fmt$(session.start_amount)} />
          <DetailStat label="Cash-out" value={session.end_amount != null ? fmt$(session.end_amount) : '-'} />
        </div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <DetailStat label="Hourly" value={hourly != null ? `${hourly >= 0 ? '+' : ''}${fmt$(hourly)}/hr` : '-'} colored={hourly != null} positive={hourly != null && hourly >= 0} />
          <DetailStat label="Game type" value={session.game_type === 'tables' ? '🃏 Tables' : '🎰 Slots'} />
        </div>

        {session.notes && (
          <div className="rounded-2xl bg-zinc-800/60 px-4 py-3">
            <div className="text-zinc-500 text-[10px] uppercase tracking-wide mb-1">Notes</div>
            <div className="text-zinc-300 text-sm leading-relaxed">{session.notes}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function DetailStat({ label, value, colored, positive }) {
  return (
    <div className="rounded-2xl bg-zinc-800/60 px-3 py-3 text-center">
      <div className="text-zinc-500 text-[10px] uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-sm font-bold ${colored ? (positive ? 'text-emerald-400' : 'text-red-400') : 'text-white'}`}>
        {value}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BankrollTrendTab({ sessions, adjustments, initialBankroll }) {
  const [filter, setFilter] = useState('MAX')
  const [fanHorizon, setFanHorizon] = useState(100)
  const [showMonteCarlo, setShowMonteCarlo] = useState(false)
  const [sessionModal, setSessionModal] = useState(null)
  const [infoModal, setInfoModal] = useState(null)
  const [tooltip, setTooltip] = useState(null) // { type:'session'|'fan', x, y, side, ... }
  const [isDark, setIsDark] = useState(readChartIsDark)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const orderedSessionsRef = useRef([])
  const sessionResultsRef = useRef([])
  const mcResultRef = useRef(null)
  const totalPLRef = useRef(0)
  const chartContainerRef = useRef(null)

  useEffect(() => {
    const sync = () => setIsDark(readChartIsDark())
    sync()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', sync)
    const obs = new MutationObserver(sync)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => {
      mq.removeEventListener('change', sync)
      obs.disconnect()
    }
  }, [])

  const fanStyle = useMemo(() => fanChartStyle(isDark), [isDark])

  const showInfo = (key) => setInfoModal(INFO[key])

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => new Date(a.start_at) - new Date(b.start_at)),
    [sessions]
  )

  const filteredSessions = useMemo(() => {
    const f = FILTERS.find(f => f.label === filter)
    if (!f || (!f.days && !f.ytd)) return sortedSessions
    const cutoff = f.ytd
      ? new Date(new Date().getFullYear(), 0, 1)
      : new Date(Date.now() - f.days * 86400000)
    return sortedSessions.filter(s => new Date(s.start_at) >= cutoff)
  }, [sortedSessions, filter])

  const { labels, dataPoints, sessionResults, orderedSessions, adjMarkers } = useMemo(() => {
    const f = FILTERS.find(f => f.label === filter)
    const cutoff = f?.ytd
      ? new Date(new Date().getFullYear(), 0, 1)
      : f?.days
      ? new Date(Date.now() - f.days * 86400000)
      : null

    const labels = []
    const dataPoints = []
    const sessionResults = []
    const orderedSessions = []
    const adjMarkers = []

    const adjInWindow = (adjustments || []).filter(a => !cutoff || new Date(a.occurred_at) >= cutoff)
    const events = [
      ...filteredSessions.map(s => ({ type: 'session', date: new Date(s.start_at), session: s })),
      ...adjInWindow.map(a => ({ type: 'adj', date: new Date(a.occurred_at), adj: a })),
    ].sort((a, b) => a.date - b.date)

    let running = 0
    let idx = 0
    for (const ev of events) {
      if (ev.type === 'session') {
        const wl = ev.session.end_amount != null
          ? Number(ev.session.end_amount) - Number(ev.session.start_amount)
          : 0
        running += wl
        idx++
        labels.push(`#${idx}`)
        dataPoints.push(parseFloat(running.toFixed(2)))
        sessionResults.push(wl)
        orderedSessions.push(ev.session)
      } else {
        adjMarkers.push({ idx: dataPoints.length, amount: Number(ev.adj.amount) })
      }
    }

    return { labels, dataPoints, sessionResults, orderedSessions, adjMarkers }
  }, [filteredSessions, adjustments, filter])

  orderedSessionsRef.current = orderedSessions
  sessionResultsRef.current = sessionResults

  const totalPL = dataPoints.length > 0 ? dataPoints[dataPoints.length - 1] : 0
  const maxPL   = dataPoints.length > 0 ? Math.max(...dataPoints) : 0
  const minPL   = dataPoints.length > 0 ? Math.min(...dataPoints) : 0

  // ── All advanced metrics ───────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const n = sessionResults.length
    if (n < 2) return null

    // Drawdown metrics
    let peak = 0
    let maxDrawdown = 0
    let uiSumSq = 0
    for (let i = 0; i < dataPoints.length; i++) {
      if (dataPoints[i] > peak) peak = dataPoints[i]
      const dd = Math.max(0, peak - dataPoints[i])
      if (dd > maxDrawdown) maxDrawdown = dd
      uiSumSq += dd * dd
    }
    const ulcerIndex = Math.sqrt(uiSumSq / dataPoints.length)

    // Win/Loss split
    const wins   = sessionResults.filter(r => r > 0)
    const losses  = sessionResults.filter(r => r < 0)
    const winRate = wins.length / n
    const avgWin  = wins.length > 0 ? wins.reduce((s, r) => s + r, 0) / wins.length : 0
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, r) => s + r, 0) / losses.length) : 0
    const payoffRatio  = avgLoss > 0.01 ? avgWin / avgLoss : null
    const grossWins    = wins.reduce((s, r) => s + r, 0)
    const grossLosses  = Math.abs(losses.reduce((s, r) => s + r, 0))
    const profitFactor = grossLosses > 0.01 ? grossWins / grossLosses : null

    // Distribution
    const expectancy = sessionResults.reduce((s, r) => s + r, 0) / n
    const variance   = sessionResults.reduce((s, r) => s + (r - expectancy) ** 2, 0) / n
    const stdDev     = Math.sqrt(variance)
    const skewness   = stdDev > 0.01
      ? sessionResults.reduce((s, r) => s + ((r - expectancy) / stdDev) ** 3, 0) / n
      : null

    // Risk-adjusted
    const downsideVariance = sessionResults.reduce((s, r) => s + (r < 0 ? r * r : 0), 0) / n
    const downsideDev = Math.sqrt(downsideVariance)
    const sortino = downsideDev > 0.01 ? expectancy / downsideDev : null
    const calmar  = maxDrawdown > 0.01 ? totalPL / maxDrawdown : null
    const recoveryFactor = maxDrawdown > 0.01 ? totalPL / maxDrawdown : null  // same as calmar numerically; kept separate for display context

    // Kelly fraction (gambling Kelly for session outcomes)
    // f* = (b*p - q) / b  where b = payoff ratio, p = win rate, q = 1 - win rate
    const kelly = payoffRatio != null && payoffRatio > 0
      ? (payoffRatio * winRate - (1 - winRate)) / payoffRatio
      : null

    // Streaks
    let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0
    for (const r of sessionResults) {
      if (r > 0) {
        curWin++; curLoss = 0
        if (curWin > maxWinStreak) maxWinStreak = curWin
      } else if (r < 0) {
        curLoss++; curWin = 0
        if (curLoss > maxLossStreak) maxLossStreak = curLoss
      } else {
        curWin = 0; curLoss = 0
      }
    }

    return {
      maxDrawdown, ulcerIndex, sortino, calmar,
      winRate, avgWin, avgLoss, payoffRatio, profitFactor, grossWins, grossLosses,
      expectancy, stdDev, skewness, kelly, recoveryFactor,
      maxWinStreak, maxLossStreak,
    }
  }, [dataPoints, sessionResults, totalPL])

  // ── Monte Carlo ────────────────────────────────────────────────────────────
  const mcResult = useMemo(() => {
    if (sessionResults.length < 5) return null
    return runMonteCarlo(sessionResults, initialBankroll, fanHorizon)
  }, [sessionResults, initialBankroll, fanHorizon])

  const activeMC = showMonteCarlo ? mcResult : null

  mcResultRef.current = mcResult
  totalPLRef.current = totalPL

  // ── Chart helpers ──────────────────────────────────────────────────────────
  const pointColors = sessionResults.map(r => r >= 0 ? '#34d399' : '#f87171')
  const pointRadius = activeMC ? 0 : (dataPoints.length <= 20 ? 5 : dataPoints.length <= 50 ? 3 : 0)

  const chartData = useMemo(() => {
    const nHist    = dataPoints.length
    const horizon  = fanHorizon
    const projNulls = Array(nHist).fill(null)

    const baseData = activeMC
      ? [...dataPoints, ...Array(horizon).fill(null)]
      : dataPoints
    const basePointColors = activeMC
      ? [...pointColors, ...Array(horizon).fill('transparent')]
      : pointColors

    const datasets = [
      {
        data: baseData,
        segment: {
          borderColor: ctx => sessionResults[ctx.p1DataIndex] >= 0 ? '#34d399' : '#f87171',
        },
        borderColor: '#71717a',
        fill: {
          target: 'origin',
          above: 'rgba(52,211,153,0.10)',
          below: 'rgba(248,113,113,0.10)',
        },
        borderWidth: 2.5,
        pointRadius,
        pointHoverRadius: activeMC ? 0 : Math.max(pointRadius + 2, 6),
        pointBackgroundColor: basePointColors,
        pointBorderColor: basePointColors,
        tension: 0.3,
        spanGaps: false,
      },
    ]

    if (activeMC) {
      const off = v => parseFloat((v + totalPL).toFixed(2))
      const p90d = activeMC.p90.map(off)
      const p75d = activeMC.p75.map(off)
      const p50d = activeMC.p50.map(off)
      const p25d = activeMC.p25.map(off)
      const p10d = activeMC.p10.map(off)

      const ruinY = activeMC.ruinDrop != null
        ? parseFloat((totalPL - activeMC.ruinDrop).toFixed(2))
        : null

      // Dataset 1 - ruin threshold
      datasets.push({
        data: ruinY != null
          ? [...Array(nHist).fill(null), ...Array(horizon).fill(ruinY)]
          : [],
        borderColor: fanStyle.ruinLine,
        borderWidth: fanStyle.ruinWidth,
        borderDash: [6, 4],
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        tension: 0,
      })
      // Dataset 2 - p90, fill '+4' → p10
      datasets.push({ data: [...projNulls, ...p90d], borderColor: 'transparent', borderWidth: 0, pointRadius: 0, pointHoverRadius: 0, fill: '+4', backgroundColor: fanStyle.bandOuter, tension: 0.35, spanGaps: false })
      // Dataset 3 - p75, fill '+2' → p25 (upper IQR edge visible)
      datasets.push({ data: [...projNulls, ...p75d], borderColor: fanStyle.bandEdge, borderWidth: 1.25, borderDash: [4, 3], pointRadius: 0, pointHoverRadius: 0, fill: '+2', backgroundColor: fanStyle.bandInner, tension: 0.35, spanGaps: false })
      // Dataset 4 - p50 median
      datasets.push({ data: [...projNulls, ...p50d], borderColor: fanStyle.medianLine, borderWidth: fanStyle.medianWidth, borderDash: [6, 4], pointRadius: 0, pointHoverRadius: 0, fill: false, tension: 0.35, spanGaps: false })
      // Dataset 5 - p25 (lower IQR edge visible)
      datasets.push({ data: [...projNulls, ...p25d], borderColor: fanStyle.bandEdge, borderWidth: 1.25, borderDash: [4, 3], pointRadius: 0, pointHoverRadius: 0, fill: false, tension: 0.35, spanGaps: false })
      // Dataset 6 - p10
      datasets.push({ data: [...projNulls, ...p10d], borderColor: 'transparent', borderWidth: 0, pointRadius: 0, pointHoverRadius: 0, fill: false, tension: 0.35, spanGaps: false })
    }

    const extLabels = activeMC
      ? [...labels, ...Array.from({ length: horizon }, (_, i) => `+${i + 1}`)]
      : labels

    return { labels: extLabels, datasets }
  }, [dataPoints, sessionResults, pointColors, pointRadius, activeMC, totalPL, fanHorizon, labels, fanStyle])

  const boundaryPlugin = useMemo(() => {
    if (!activeMC) return null
    const nHist = dataPoints.length
    return {
      id: 'historicalBoundary',
      afterDraw(chart) {
        const { ctx, chartArea, scales, data } = chart
        const allLabels = data.labels
        if (!allLabels || nHist <= 0 || nHist >= allLabels.length) return
        const x1 = scales.x.getPixelForValue(allLabels[nHist - 1])
        const x2 = scales.x.getPixelForValue(allLabels[nHist])
        if (x1 == null || x2 == null) return
        const x = (x1 + x2) / 2
        ctx.save()
        ctx.beginPath()
        ctx.setLineDash([3, 4])
        ctx.strokeStyle = 'rgba(113,113,122,0.35)'
        ctx.lineWidth = 1
        ctx.moveTo(x, chartArea.top)
        ctx.lineTo(x, chartArea.bottom)
        ctx.stroke()
        ctx.restore()
      },
    }
  }, [activeMC, dataPoints.length])

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    onClick: (evt, _elements, chart) => {
      const native = evt.native ?? evt
      const snapped = chart.getElementsAtEventForMode(native, 'index', { intersect: false }, false)
      if (snapped.length > 0) {
        const idx = snapped[0].index
        const containerRect = chartContainerRef.current?.getBoundingClientRect()
        const tapX = containerRect ? native.clientX - containerRect.left : 0
        const tapY = containerRect ? native.clientY - containerRect.top : 0
        const side = tapX > (containerRect?.width ?? 300) / 2 ? 'right' : 'left'
        const nHist = orderedSessionsRef.current.length

        if (idx >= nHist) {
          // Tapped in the fan projection area
          const mc = mcResultRef.current
          if (!mc) { setTooltip(null); return }
          const projIdx = Math.min(idx - nHist, mc.p10.length - 1)
          const off = v => parseFloat((v + totalPLRef.current).toFixed(2))
          setTooltip({
            type: 'fan',
            x: tapX,
            y: tapY,
            side,
            step: projIdx + 1,
            p10: off(mc.p10[projIdx]),
            p25: off(mc.p25[projIdx]),
            p50: off(mc.p50[projIdx]),
            p75: off(mc.p75[projIdx]),
            p90: off(mc.p90[projIdx]),
            ror: mc.ror,
          })
        } else {
          setTooltip({
            type: 'session',
            x: tapX,
            y: tapY,
            side,
            session: orderedSessionsRef.current[idx],
            sessionPL: sessionResultsRef.current[idx],
            cumPL: chart.data.datasets[0].data[idx],
          })
        }
      } else {
        setTooltip(null)
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#71717a', maxTicksLimit: 8, font: { size: 10 }, maxRotation: 0 },
      },
      y: {
        grid: {
          color: ctx => ctx.tick.value === 0 ? 'rgba(99,179,237,0.45)' : 'rgba(255,255,255,0.06)',
          lineWidth: ctx => ctx.tick.value === 0 ? 0.75 : 1,
        },
        ticks: { color: '#71717a', font: { size: 10 }, callback: v => fmt$(v) },
      },
    },
  }), [])

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-4xl mb-3">📈</div>
        <div className="text-zinc-400 text-sm">No sessions yet. Start playing to see your trend.</div>
      </div>
    )
  }

  // ── Derived display values ─────────────────────────────────────────────────
  const m = metrics  // shorthand

  const rorColor = mcResult == null ? 'text-zinc-400'
    : mcResult.ror < 5   ? 'text-emerald-400'
    : mcResult.ror < 20  ? 'text-amber-400'
    : 'text-red-400'

  const kellyPct = m?.kelly != null
    ? m.kelly <= 0
      ? null
      : m.kelly >= 0.5
      ? '≥50%'
      : `${(m.kelly * 100).toFixed(1)}%`
    : null

  const halfKellyPct = m?.kelly != null && m.kelly > 0
    ? m.kelly >= 0.5
      ? '≥25%'
      : `${(m.kelly * 50).toFixed(1)}%`
    : null

  return (
    <>
      <div className="space-y-4">
        {/* Summary row */}
        <div className="grid grid-cols-3 gap-2">
          <StatPill label="Total P&L" value={`${totalPL >= 0 ? '+' : ''}${fmt$(totalPL)}`} positive={totalPL >= 0} />
          <StatPill label="Peak" value={maxPL > 0 ? `+${fmt$(maxPL)}` : '$0'} positive={maxPL > 0} neutral={maxPL <= 0} />
          <StatPill label="Trough" value={fmt$(minPL)} positive={minPL >= 0} />
        </div>

        {/* Chart card */}
        <div data-bankroll-card className="rounded-3xl bg-zinc-900 border border-zinc-800/60 p-4">
          {/* Time filter pills */}
          <div className="flex gap-1 mb-3 overflow-x-auto no-scrollbar">
            {FILTERS.map(f => (
              <button
                key={f.label}
                onClick={() => { setTooltip(null); setFilter(f.label) }}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold touch-manipulation transition-colors ${
                  filter === f.label ? 'bg-zinc-700 text-white' : 'text-zinc-500 active:bg-zinc-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Monte Carlo toggle + horizon */}
          {mcResult && (
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <button
                onClick={() => setShowMonteCarlo(v => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold touch-manipulation transition-colors border ${
                  showMonteCarlo
                    ? 'bg-blue-900/60 text-blue-300 border-blue-700/50'
                    : 'text-zinc-600 border-zinc-800'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${showMonteCarlo ? 'bg-blue-400' : 'bg-zinc-600'}`} />
                Monte Carlo
              </button>
              {showMonteCarlo && HORIZONS.map(h => (
                <button
                  key={h}
                  onClick={() => setFanHorizon(h)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold touch-manipulation transition-colors border ${
                    fanHorizon === h
                      ? 'bg-blue-900/60 text-blue-300 border-blue-700/50'
                      : 'text-zinc-600 border-zinc-800'
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          )}

          {filteredSessions.length < 2 ? (
            <div className="h-[220px] flex items-center justify-center text-zinc-600 text-sm">
              Not enough sessions in this period.
            </div>
          ) : (
            <div ref={chartContainerRef} className="h-[220px] relative">
              <Line data={chartData} options={chartOptions} plugins={boundaryPlugin ? [boundaryPlugin] : []} />

              {/* Dismiss backdrop - fixed so tapping anywhere outside the tooltip closes it */}
              {tooltip && (
                <div
                  className="fixed inset-0 z-[19]"
                  onClick={() => setTooltip(null)}
                />
              )}

              {/* HTML tooltip - session detail or fan projection callout */}
              {tooltip && (() => {
                // Light-mode theme - dark mode is unchanged
                const bg  = isDark ? '#18181b' : '#ffffff'
                const bdr = isDark ? '#3f3f46' : '#d4d4d8'
                const clrDate  = isDark ? '#a1a1aa' : '#52525b'
                const clrLabel = isDark ? '#71717a' : '#52525b'
                const clrPos   = isDark ? '#34d399' : '#059669'  // emerald-400 / emerald-700
                const clrNeg   = isDark ? '#f87171' : '#dc2626'  // red-400 / red-600
                const clrLink  = isDark ? '#22d3ee' : '#0284c7'  // cyan-400 / sky-600
                const clrHead  = isDark ? '#93c5fd' : '#2563eb'  // blue-300 / blue-600
                const clrMuted = isDark ? '#71717a' : '#71717a'
                const clrDivider = isDark ? '#3f3f46' : '#e4e4e7'
                return (
                  <div
                    className="absolute z-[20] rounded-xl shadow-xl"
                    style={{
                      background: bg,
                      border: `1px solid ${bdr}`,
                      padding: '10px 14px',
                      minWidth: tooltip.type === 'fan' ? 190 : 170,
                      maxWidth: 220,
                      top: Math.max(4, tooltip.y - (tooltip.type === 'fan' ? 120 : 90)),
                      ...(tooltip.side === 'left'
                        ? { left: tooltip.x + 12 }
                        : { right: `calc(100% - ${tooltip.x}px + 12px)` }),
                    }}
                  >
                    {tooltip.type === 'fan' ? (
                      <>
                        <div className="text-[11px] font-semibold mb-2" style={{ color: clrHead }}>+{tooltip.step} sessions projected</div>
                        {[
                          { label: 'Best (p90)', val: tooltip.p90 },
                          { label: 'Upper (p75)', val: tooltip.p75 },
                          { label: 'Median',      val: tooltip.p50 },
                          { label: 'Lower (p25)', val: tooltip.p25 },
                          { label: 'Worst (p10)', val: tooltip.p10 },
                        ].map(({ label, val }) => (
                          <div key={label} className="flex justify-between gap-3 text-[11px] mb-0.5">
                            <span style={{ color: clrMuted }}>{label}</span>
                            <span style={{ color: val >= 0 ? clrPos : clrNeg }}>
                              {val >= 0 ? '+' : ''}{fmt$(val)}
                            </span>
                          </div>
                        ))}
                        <div className="mt-2 pt-2 flex justify-between gap-3 text-[11px]" style={{ borderTop: `1px solid ${clrDivider}` }}>
                          <span style={{ color: clrMuted }}>Risk of Ruin</span>
                          <span style={{ color: tooltip.ror < 5 ? clrPos : tooltip.ror < 20 ? '#f59e0b' : clrNeg }}>
                            {tooltip.ror.toFixed(1)}%
                          </span>
                        </div>
                      </>
                    ) : (
                      <button
                        className="text-left w-full"
                        onClick={() => { setSessionModal(tooltip.session); setTooltip(null) }}
                      >
                        <div className="text-[11px] mb-1.5" style={{ color: clrDate }}>{fmtDate(tooltip.session.start_at)}</div>
                        <div className="text-[12px] mb-0.5">
                          <span style={{ color: clrLabel }}>This session: </span>
                          <span style={{ color: tooltip.sessionPL >= 0 ? clrPos : clrNeg }}>
                            {tooltip.sessionPL >= 0 ? '+' : ''}{fmt$(tooltip.sessionPL)}
                          </span>
                        </div>
                        <div className="text-[12px] mb-2">
                          <span style={{ color: clrLabel }}>Cumulative: </span>
                          <span style={{ color: tooltip.cumPL >= 0 ? clrPos : clrNeg }}>
                            {tooltip.cumPL >= 0 ? '+' : ''}{fmt$(tooltip.cumPL)}
                          </span>
                        </div>
                        <div className="text-[11px] font-semibold" style={{ color: clrLink }}>View details →</div>
                      </button>
                    )}
                  </div>
                )
              })()}
            </div>
          )}

          {/* Fan chart legend */}
          {activeMC && filteredSessions.length >= 2 && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <div className="flex items-center gap-1.5">
                <div
                  className="w-7 shrink-0"
                  style={{ borderTop: `${fanStyle.medianWidth}px dashed ${fanStyle.medianLine}` }}
                />
                <span className="text-[11px] font-medium" style={{ color: fanStyle.legendText }}>Median projection</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  className="w-3.5 h-3.5 rounded-sm shrink-0 border"
                  style={{ backgroundColor: fanStyle.bandInner, borderColor: fanStyle.bandEdge }}
                />
                <span className="text-[11px] font-medium" style={{ color: fanStyle.legendText }}>25–75th %ile</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  className="w-7 shrink-0"
                  style={{ borderTop: `${fanStyle.ruinWidth}px dashed ${fanStyle.ruinLine}` }}
                />
                <span className="text-[11px] font-medium" style={{ color: fanStyle.legendText }}>Ruin threshold (25% remaining)</span>
              </div>
            </div>
          )}

          {/* Adjustment markers */}
          {adjMarkers.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {adjMarkers.map((m, i) => (
                <span key={i} className="text-[10px] text-zinc-500 bg-zinc-800 rounded-full px-2 py-0.5">
                  Manual adj {m.amount >= 0 ? '+' : ''}{fmt$(m.amount)}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Advanced metrics */}
        {m && (
          <div data-bankroll-card className="rounded-3xl bg-zinc-900 border border-zinc-800/60 p-4">
            <button
              className="w-full flex items-center justify-between touch-manipulation"
              onClick={() => setShowAdvanced(v => !v)}
            >
              <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">Advanced Metrics</span>
              <svg
                className="w-4 h-4 text-zinc-500 transition-transform duration-200"
                style={{ transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)' }}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showAdvanced && <div className="mt-5 space-y-5">
            {/* FOUNDATION */}
            <MetricSection title="Foundation">
              <div className="flex gap-2">
                <MetricTile
                  label="Win Rate"
                  value={`${(m.winRate * 100).toFixed(1)}%`}
                  color={m.winRate > 0.45 ? 'text-emerald-400' : m.winRate > 0.30 ? 'text-amber-400' : 'text-red-400'}
                  sub={`${sessionResults.filter(r => r > 0).length}W / ${sessionResults.filter(r => r < 0).length}L`}
                />
                <MetricTile
                  label="Expectancy"
                  value={`${m.expectancy >= 0 ? '+' : ''}${fmt$(m.expectancy)}`}
                  color={m.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400'}
                  sub="avg per session"
                  onInfo={() => showInfo('expectancy')}
                />
              </div>
              <div className="flex gap-2">
                <MetricTile
                  label="Profit Factor"
                  value={m.profitFactor != null ? `${m.profitFactor.toFixed(2)}×` : '-'}
                  color={m.profitFactor == null ? 'text-white' : m.profitFactor > 1.1 ? 'text-emerald-400' : m.profitFactor >= 1.0 ? 'text-amber-400' : 'text-red-400'}
                  onInfo={() => showInfo('profitFactor')}
                />
                <MetricTile
                  label="Payoff Ratio"
                  value={m.payoffRatio != null ? `${m.payoffRatio.toFixed(2)}×` : '-'}
                  color={m.payoffRatio == null ? 'text-white' : m.payoffRatio > 1.2 ? 'text-emerald-400' : m.payoffRatio >= 1.0 ? 'text-amber-400' : 'text-red-400'}
                  sub={m.avgWin > 0 ? `avg win ${fmt$(m.avgWin)} / avg loss ${fmt$(m.avgLoss)}` : undefined}
                  onInfo={() => showInfo('payoffRatio')}
                />
              </div>
            </MetricSection>

            {/* RISK & DRAWDOWN */}
            <MetricSection title="Risk & Drawdown">
              <div className="flex gap-2">
                <MetricTile
                  label="Max Drawdown"
                  value={m.maxDrawdown > 0 ? `-${fmt$(m.maxDrawdown)}` : '$0'}
                  color={m.maxDrawdown > 0 ? 'text-red-400' : 'text-white'}
                  onInfo={() => showInfo('maxDrawdown')}
                />
                <MetricTile
                  label="Recovery Factor"
                  value={m.recoveryFactor != null ? `${m.recoveryFactor.toFixed(2)}×` : '-'}
                  color={m.recoveryFactor == null ? 'text-white' : m.recoveryFactor > 1.5 ? 'text-emerald-400' : m.recoveryFactor >= 0 ? 'text-amber-400' : 'text-red-400'}
                  onInfo={() => showInfo('recoveryFactor')}
                />
              </div>
              <div className="flex gap-2">
                <MetricTile
                  label="Ulcer Index"
                  value={fmt$(m.ulcerIndex)}
                  color="text-white"
                  sub="lower = smoother equity curve"
                  onInfo={() => showInfo('ulcerIndex')}
                />
                <MetricTile
                  label="Risk of Ruin"
                  value={mcResult == null
                    ? (sessionResults.length < 5 ? 'Need 5+ sessions' : '-')
                    : mcResult.ror < 0.1 ? '<0.1%' : `${mcResult.ror.toFixed(1)}%`}
                  color={rorColor}
                  sub={mcResult != null ? `${fanHorizon}-session horizon` : undefined}
                  onInfo={() => showInfo('riskOfRuin')}
                />
              </div>
            </MetricSection>

            {/* DISTRIBUTION */}
            <MetricSection title="Volatility & Distribution">
              <div className="flex gap-2">
                <MetricTile
                  label="Std Deviation"
                  value={fmt$(m.stdDev)}
                  color="text-white"
                  sub="per session volatility"
                  onInfo={() => showInfo('stdDev')}
                />
                <MetricTile
                  label="Skewness"
                  value={m.skewness != null ? fmtRatio(m.skewness) : '-'}
                  color={m.skewness == null ? 'text-white' : m.skewness > 0.2 ? 'text-emerald-400' : m.skewness < -0.2 ? 'text-red-400' : 'text-white'}
                  sub={m.skewness != null ? (m.skewness > 0.2 ? 'positive skew, good for AP' : m.skewness < -0.2 ? 'negative skew, watch closely' : 'roughly symmetric') : undefined}
                  onInfo={() => showInfo('skewness')}
                />
              </div>
            </MetricSection>

            {/* RISK-ADJUSTED RETURNS */}
            <MetricSection title="Risk-Adjusted Returns">
              <div className="flex gap-2">
                <MetricTile
                  label="Sortino Ratio"
                  value={m.sortino != null ? fmtRatio(m.sortino) : '-'}
                  color={m.sortino == null ? 'text-white' : m.sortino >= 0 ? 'text-emerald-400' : 'text-red-400'}
                  onInfo={() => showInfo('sortino')}
                />
                <MetricTile
                  label="Calmar Ratio"
                  value={m.calmar != null ? fmtRatio(m.calmar) : '-'}
                  color={m.calmar == null ? 'text-white' : m.calmar >= 0 ? 'text-emerald-400' : 'text-red-400'}
                  onInfo={() => showInfo('calmar')}
                />
              </div>
            </MetricSection>

            {/* BANKROLL SIZING */}
            <MetricSection title="Bankroll Sizing">
              <MetricRow
                label="Kelly Fraction"
                value={kellyPct ?? 'No Edge'}
                color={kellyPct ? (m.kelly > 0.05 ? 'text-emerald-400' : 'text-amber-400') : 'text-red-400'}
                sub={kellyPct
                  ? `Half Kelly: ${halfKellyPct} - recommended starting point`
                  : 'Negative Kelly: sample does not yet show a mathematical edge'}
                onInfo={() => showInfo('kelly')}
              />
            </MetricSection>

            {/* STREAKS */}
            <MetricSection title="Streaks">
              <div className="flex gap-2">
                <MetricTile
                  label="Max Win Streak"
                  value={`${m.maxWinStreak}`}
                  color="text-emerald-400"
                  sub="consecutive sessions"
                />
                <MetricTile
                  label="Max Loss Streak"
                  value={`${m.maxLossStreak}`}
                  color="text-red-400"
                  sub="consecutive sessions"
                />
              </div>
            </MetricSection>
            </div>}
          </div>
        )}

        {/* Sessions count */}
        <div className="text-center text-zinc-600 text-xs">
          {filteredSessions.length} session{filteredSessions.length !== 1 ? 's' : ''} in range
          {filteredSessions.length >= 2 && <span className="ml-2 text-zinc-700">· tap a point for details</span>}
          {mcResult == null && sessionResults.length >= 2 && sessionResults.length < 5 && (
            <span className="ml-2 text-zinc-700">· need 5+ sessions for projections</span>
          )}
        </div>
      </div>

      {sessionModal && (
        <SessionDetailModal session={sessionModal} onClose={() => setSessionModal(null)} />
      )}

      {infoModal && (
        <MetricInfoModal title={infoModal.title} body={infoModal.body} onClose={() => setInfoModal(null)} />
      )}
    </>
  )
}

function StatPill({ label, value, positive, neutral }) {
  const color = neutral ? 'text-white' : positive ? 'text-emerald-400' : 'text-red-400'
  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800/60 px-3 py-3 text-center">
      <div className="text-zinc-500 text-[10px] uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-sm font-bold ${color}`}>{value}</div>
    </div>
  )
}
