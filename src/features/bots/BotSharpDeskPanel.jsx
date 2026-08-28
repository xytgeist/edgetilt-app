import { useCallback, useEffect, useState } from 'react'
import {
  fetchBotPicksRecord,
  fetchBotRecentPicks,
  invokeLoungeOddsGradePicks,
  invokeLoungeOddsPredictivePick,
} from './botPortalApi.js'

const PICKER_METAS = {
  Scott: { title: 'The Model', badge: 'bg-emerald-950/70 text-emerald-300 ring-emerald-500/30' },
  Rocco: { title: 'Vegas Spreads', badge: 'bg-blue-950/70 text-blue-300 ring-blue-500/30' },
  Chedda: { title: 'Moneyline & Dogs', badge: 'bg-amber-950/70 text-amber-300 ring-amber-500/30' },
  Tank: { title: 'Totals & Primetime', badge: 'bg-purple-950/70 text-purple-300 ring-purple-500/30' },
}

export function BotSharpDeskPanel({
  supabaseClient,
  botUserId,
  botSlug,
  setToast,
  busy,
  setBusy,
  selectedSportKey,
}) {
  const [recordData, setRecordData] = useState(null)
  const [recentPicks, setRecentPicks] = useState([])
  const [loading, setLoading] = useState(false)
  const [grading, setGrading] = useState(false)
  const [dropping, setDropping] = useState(false)
  const [selectedPicker, setSelectedPicker] = useState('auto')
  const [cardMode, setCardMode] = useState('auto')

  const loadData = useCallback(async () => {
    if (!supabaseClient || !botUserId) return
    setLoading(true)
    try {
      const [recRes, picksRes] = await Promise.all([
        fetchBotPicksRecord(supabaseClient, botUserId),
        fetchBotRecentPicks(supabaseClient, botUserId, 25),
      ])
      if (recRes.data) setRecordData(recRes.data)
      if (picksRes.data) setRecentPicks(picksRes.data)
    } catch (e) {
      console.error('Failed to load sharp desk data:', e)
    } finally {
      setLoading(false)
    }
  }, [supabaseClient, botUserId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleGradePicks = async () => {
    setGrading(true)
    if (setBusy) setBusy(true)
    try {
      const { data, error } = await invokeLoungeOddsGradePicks(supabaseClient, { slug: botSlug })
      if (error) {
        setToast?.(`Grading failed: ${error.message}`)
      } else {
        const count = data?.resolved ?? 0
        setToast?.(`Graded ${count} pending pick${count === 1 ? '' : 's'}.`)
        await loadData()
      }
    } catch (err) {
      setToast?.(`Grading error: ${err.message}`)
    } finally {
      setGrading(false)
      if (setBusy) setBusy(false)
    }
  }

  const handleDropPick = async (dryRun = false) => {
    setDropping(true)
    if (setBusy) setBusy(true)
    try {
      const { data, error } = await invokeLoungeOddsPredictivePick(supabaseClient, {
        slug: botSlug,
        cardMode,
        pickerName: selectedPicker !== 'auto' ? selectedPicker : undefined,
        sportKey: selectedSportKey || undefined,
        dryRun,
      })
      if (error) {
        setToast?.(`Drop failed: ${error.message}`)
      } else if (data?.dryRun) {
        if (data.card) {
          setToast?.(`[Dry Run] Syndicate Card with ${data.card.picks.length} picks ready.`)
        } else if (data.pick) {
          setToast?.(`[Dry Run] Solo Pick: ${data.pickerName} on ${data.pick.pickName}`)
        } else {
          setToast?.(`[Dry Run] ${data.message || 'No candidates found.'}`)
        }
      } else if (data?.ok) {
        const msg = data.isSyndicate
          ? `Published Syndicate Card (${data.pickIds?.length || 0} picks)`
          : `Published Solo Pick for ${data.pickerName}`
        setToast?.(msg)
        await loadData()
      } else {
        setToast?.(data?.message || 'No picks published.')
      }
    } catch (err) {
      setToast?.(`Drop error: ${err.message}`)
    } finally {
      setDropping(false)
      if (setBusy) setBusy(false)
    }
  }

  const overall = recordData?.overall || { wins: 0, losses: 0, pushes: 0, pending: 0, win_rate_pct: 0, units_net: 0 }
  const pickers = recordData?.pickers || {}

  return (
    <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-950/15 p-3 sm:p-4 text-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base">🎯</span>
            <span className="font-bold text-sm text-zinc-100">Sharp Syndicate Desk</span>
            <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40">
              4-Man Crew
            </span>
          </div>
          <div className="text-[11px] text-zinc-400 mt-0.5">
            Scott, Rocco, Chedda & Tank predictive betting tally ... auto-graded against final scores.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy || grading || loading}
            onClick={handleGradePicks}
            className="rounded-lg bg-emerald-600/80 hover:bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition disabled:opacity-50"
          >
            {grading ? 'Grading…' : 'Grade Pending'}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={loadData}
            className="rounded-lg bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 text-xs text-zinc-300 transition disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Manual Drop Controls */}
      <div className="mt-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80 p-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-zinc-400 font-medium text-[11px]">Drop Pick:</span>
          <select
            value={cardMode}
            onChange={(e) => setCardMode(e.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white focus:outline-none"
          >
            <option value="auto">Auto Mode (Slate/Density)</option>
            <option value="solo">Solo Pick</option>
            <option value="syndicate">Syndicate Card (Multi-Picker)</option>
          </select>

          {cardMode !== 'syndicate' && (
            <select
              value={selectedPicker}
              onChange={(e) => setSelectedPicker(e.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white focus:outline-none"
            >
              <option value="auto">Auto Persona Match</option>
              <option value="Scott">Scott (The Model / EV)</option>
              <option value="Rocco">Rocco (Vegas Spreads)</option>
              <option value="Chedda">Chedda (ML & Dogs)</option>
              <option value="Tank">Tank (Totals / O/U)</option>
            </select>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={busy || dropping || loading}
            onClick={() => handleDropPick(true)}
            className="rounded bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition disabled:opacity-50"
          >
            Preview
          </button>
          <button
            type="button"
            disabled={busy || dropping || loading}
            onClick={() => handleDropPick(false)}
            className="rounded bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 px-3 py-1 text-[11px] font-bold text-white shadow-sm transition disabled:opacity-50"
          >
            {dropping ? 'Publishing…' : 'Publish Pick'}
          </button>
        </div>
      </div>

      {/* Overall syndicate banner */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-900/90 border border-zinc-800 px-3 py-2 text-xs">
        <div className="text-zinc-400 font-medium">
          Syndicate Overall:
          <span className="ml-1.5 font-bold text-white tabular-nums">
            {overall.wins}-{overall.losses}{overall.pushes > 0 ? `-${overall.pushes}` : ''}
          </span>
          <span className="ml-2 text-zinc-500">({overall.win_rate_pct}% win)</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-zinc-400">
            Units Net:{' '}
            <span className={`font-bold tabular-nums ${Number(overall.units_net) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {Number(overall.units_net) > 0 ? `+${overall.units_net}` : overall.units_net}u
            </span>
          </span>
          {overall.pending > 0 && (
            <span className="text-amber-400 font-medium tabular-nums">
              {overall.pending} pending
            </span>
          )}
        </div>
      </div>

      {/* 4 Pickers Grid */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {['Scott', 'Rocco', 'Chedda', 'Tank'].map((name) => {
          const stats = pickers[name] || { wins: 0, losses: 0, pushes: 0, win_rate_pct: 0, units_net: 0 }
          const meta = PICKER_METAS[name] || { title: 'Picker', badge: 'bg-zinc-800 text-zinc-200' }
          const unitsNum = Number(stats.units_net) || 0

          return (
            <div
              key={name}
              className="rounded-xl bg-zinc-950/60 border border-zinc-800/80 p-2.5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-white">{name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ring-1 ${meta.badge}`}>
                    {meta.title}
                  </span>
                </div>
                <div className="mt-2 text-xs font-semibold text-zinc-200 tabular-nums">
                  {stats.wins}-{stats.losses}{stats.pushes > 0 ? `-${stats.pushes}` : ''}
                  <span className="text-[10px] text-zinc-400 font-normal ml-1">
                    ({stats.win_rate_pct}%)
                  </span>
                </div>
              </div>
              <div className="mt-2 pt-1.5 border-t border-zinc-800/60 flex items-center justify-between text-[11px]">
                <span className="text-zinc-500 text-[10px]">Net</span>
                <span className={`font-bold tabular-nums ${unitsNum >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {unitsNum > 0 ? `+${unitsNum.toFixed(2)}` : unitsNum.toFixed(2)}u
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Recent Picks Table */}
      {recentPicks.length > 0 && (
        <div className="mt-4 border-t border-zinc-800/70 pt-3">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Recent Syndicate Picks
          </div>
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {recentPicks.map((pick) => {
              const meta = PICKER_METAS[pick.picker_name]
              const isWon = pick.status === 'won'
              const isLost = pick.status === 'lost'
              const isPending = pick.status === 'pending'
              const isPush = pick.status === 'push'

              const statusBadge = isWon
                ? 'bg-emerald-950/80 text-emerald-300 ring-emerald-500/40'
                : isLost
                  ? 'bg-rose-950/80 text-rose-300 ring-rose-500/40'
                  : isPush
                    ? 'bg-zinc-800 text-zinc-300 ring-zinc-600/40'
                    : 'bg-amber-950/80 text-amber-300 ring-amber-500/40'

              const lineStr = pick.pick_line != null
                ? `${pick.pick_name} ${Number(pick.pick_line) > 0 ? `+${pick.pick_line}` : pick.pick_line}`
                : pick.pick_name

              return (
                <div
                  key={pick.id}
                  className="flex flex-wrap items-center justify-between gap-1.5 rounded-lg bg-zinc-900/60 border border-zinc-800/60 px-2.5 py-1.5 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ring-1 ${meta?.badge || 'bg-zinc-800 text-zinc-200'}`}>
                      {pick.picker_name}
                    </span>
                    <span className="font-semibold text-white truncate">{lineStr}</span>
                    <span className="text-[11px] text-zinc-400 truncate">
                      ({pick.away_team} @ {pick.home_team})
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {pick.home_score != null && pick.away_score != null && (
                      <span className="text-[10px] text-zinc-400 tabular-nums">
                        {pick.away_score}-{pick.home_score}
                      </span>
                    )}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ring-1 uppercase tabular-nums ${statusBadge}`}>
                      {isPending
                        ? 'Pending'
                        : isWon
                          ? `Won +${pick.units_net}u`
                          : isLost
                            ? `Lost ${pick.units_net}u`
                            : 'Push'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
