import { useCallback, useEffect, useState } from 'react'
import { fetchBotPicksRecord } from '../bots/botPortalApi.js'

const PERSONA_METAS = {
  Scott: { title: 'The Model', badge: 'bg-emerald-950/70 text-emerald-300 ring-emerald-500/30' },
  Rocco: { title: 'Vegas Spreads', badge: 'bg-blue-950/70 text-blue-300 ring-blue-500/30' },
  Chedda: { title: 'Moneyline & Dogs', badge: 'bg-amber-950/70 text-amber-300 ring-amber-500/30' },
  Tank: { title: 'Totals & Primetime', badge: 'bg-purple-950/70 text-purple-300 ring-purple-500/30' },
}

const TIMEFRAME_OPTIONS = [
  { id: 'all_time', label: 'All-Time' },
  { id: 'season', label: '2026 Season' },
  { id: 'month', label: 'This Month' },
  { id: 'week', label: 'This Week' },
]

export function LoungeProfileSharpScorecard({ supabaseClient, profileUserId, profileHandle }) {
  const [timeframe, setTimeframe] = useState('all_time')
  const [sportKey, setSportKey] = useState('all')
  const [recordData, setRecordData] = useState(null)
  const [loading, setLoading] = useState(false)

  const isScott = profileHandle?.toLowerCase() === 'sharpesignal' || profileHandle?.toLowerCase() === '@sharpesignal'

  const loadStats = useCallback(async () => {
    if (!supabaseClient || !profileUserId) return
    setLoading(true)
    try {
      const { data } = await fetchBotPicksRecord(supabaseClient, profileUserId, {
        timeframe,
        sportKey,
      })
      if (data) setRecordData(data)
    } catch (err) {
      console.warn('Failed to load sharp scorecard:', err)
    } finally {
      setLoading(false)
    }
  }, [supabaseClient, profileUserId, timeframe, sportKey])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const overall = recordData?.overall || {
    wins: 0,
    losses: 0,
    pushes: 0,
    pending: 0,
    win_rate_pct: 0,
    roi_pct: 0,
    units_net: 0,
  }
  const pickers = recordData?.pickers || {}
  const sports = recordData?.sports || []
  const unitsNum = Number(overall.units_net) || 0
  const totalGraded = overall.wins + overall.losses + overall.pushes

  // Don't render scorecard on random user profiles unless it's Scott or they have logged bets
  if (!isScott && totalGraded === 0 && overall.pending === 0) {
    return null
  }

  return (
    <div
      data-sharp-scorecard=""
      className="mt-4 overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-950/20 via-zinc-950/80 to-zinc-950 p-3 sm:p-4 text-white shadow-xl"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎯</span>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-black tracking-tight text-white">
                Sharp Syndicate Desk
              </span>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 ring-1 ring-emerald-500/40">
                Verified Ledger
              </span>
            </div>
            <div className="text-[11px] text-zinc-400">
              Scott, Rocco, Chedda & Tank · Auto-graded odds performance
            </div>
          </div>
        </div>

        {/* Timeframe selector pills */}
        <div className="flex items-center gap-1 rounded-lg bg-zinc-900/90 p-0.5 text-[11px] ring-1 ring-zinc-800">
          {TIMEFRAME_OPTIONS.map((tf) => {
            const active = timeframe === tf.id
            return (
              <button
                key={tf.id}
                type="button"
                onClick={() => setTimeframe(tf.id)}
                className={`rounded-md px-2 py-0.5 font-semibold transition ${
                  active
                    ? 'bg-amber-500 text-black shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {tf.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Sport filter row if multiple sports exist */}
      {sports.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-[11px] font-medium text-zinc-500">Sport:</span>
          <button
            type="button"
            onClick={() => setSportKey('all')}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ring-1 ${
              sportKey === 'all'
                ? 'bg-zinc-100 text-zinc-950 ring-white'
                : 'bg-zinc-900 text-zinc-400 ring-zinc-800 hover:text-white'
            }`}
          >
            All Sports
          </button>
          {sports.map((sp) => {
            const active = sportKey === sp.sport_key
            const spUnits = Number(sp.units_net) || 0
            return (
              <button
                key={sp.sport_key}
                type="button"
                onClick={() => setSportKey(sp.sport_key)}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ring-1 ${
                  active
                    ? 'bg-amber-500 text-black ring-amber-400'
                    : 'bg-zinc-900 text-zinc-300 ring-zinc-800 hover:text-white'
                }`}
              >
                {sp.sport_label}
                <span className={`ml-1 text-[10px] ${active ? 'text-black/80 font-bold' : spUnits >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {spUnits > 0 ? `+${spUnits}u` : `${spUnits}u`}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {/* Units Net */}
        <div className="flex flex-col justify-between rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Net Units
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <span
              className={`text-xl font-black tabular-nums tracking-tight sm:text-2xl ${
                unitsNum > 0
                  ? 'text-emerald-400'
                  : unitsNum < 0
                    ? 'text-rose-400'
                    : 'text-zinc-200'
              }`}
            >
              {unitsNum > 0 ? `+${unitsNum.toFixed(2)}` : unitsNum.toFixed(2)}u
            </span>
          </div>
        </div>

        {/* Record */}
        <div className="flex flex-col justify-between rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Record (W-L)
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold tabular-nums text-white sm:text-2xl">
              {overall.wins}-{overall.losses}
              {overall.pushes > 0 ? `-${overall.pushes}` : ''}
            </span>
          </div>
        </div>

        {/* Win Rate */}
        <div className="flex flex-col justify-between rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Win Rate
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold tabular-nums text-white sm:text-2xl">
              {overall.win_rate_pct}%
            </span>
          </div>
        </div>

        {/* ROI / Pending */}
        <div className="flex flex-col justify-between rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            {overall.pending > 0 ? 'Active Action' : 'Est. ROI'}
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            {overall.pending > 0 ? (
              <span className="text-base font-bold text-amber-400 sm:text-lg">
                {overall.pending} Pending
              </span>
            ) : (
              <span
                className={`text-xl font-bold tabular-nums sm:text-2xl ${
                  Number(overall.roi_pct) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {Number(overall.roi_pct) > 0 ? `+${overall.roi_pct}%` : `${overall.roi_pct}%`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 4 Pickers Breakdown Grid */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {['Scott', 'Rocco', 'Chedda', 'Tank'].map((name) => {
          const stats = pickers[name] || { wins: 0, losses: 0, pushes: 0, win_rate_pct: 0, units_net: 0 }
          const meta = PERSONA_METAS[name] || { title: 'Picker', badge: 'bg-zinc-800 text-zinc-200' }
          const pickerUnits = Number(stats.units_net) || 0

          return (
            <div
              key={name}
              className="flex flex-col justify-between rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-2.5"
            >
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-sm text-white">{name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ring-1 ${meta.badge}`}>
                    {meta.title}
                  </span>
                </div>
                <div className="mt-2 text-xs font-semibold text-zinc-200 tabular-nums">
                  {stats.wins}-{stats.losses}{stats.pushes > 0 ? `-${stats.pushes}` : ''}
                  <span className="ml-1 text-[10px] font-normal text-zinc-400">
                    ({stats.win_rate_pct}%)
                  </span>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-zinc-800/60 pt-1.5 text-[11px]">
                <span className="text-[10px] text-zinc-500">Net</span>
                <span
                  className={`font-bold tabular-nums ${
                    pickerUnits >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {pickerUnits > 0 ? `+${pickerUnits.toFixed(2)}` : pickerUnits.toFixed(2)}u
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
