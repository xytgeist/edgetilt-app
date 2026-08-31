import { useCallback, useEffect, useState } from 'react'

const DIVISIONS = [
  'ALL',
  'Flyweight',
  'Bantamweight',
  'Featherweight',
  'Lightweight',
  'Welterweight',
  'Middleweight',
  'Light Heavyweight',
  'Heavyweight',
]

export default function BotUfcMetricsEditor({ supabaseClient, setToast }) {
  const [fighters, setFighters] = useState([])
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDiv, setSelectedDiv] = useState('ALL')
  const [editingFields, setEditingFields] = useState({})

  // Matchup Simulator state
  const [fighterAId, setFighterAId] = useState('')
  const [fighterBId, setFighterBId] = useState('')
  const [isApexCage, setIsApexCage] = useState(false)
  const [isFiveRounds, setIsFiveRounds] = useState(false)

  const loadFighters = useCallback(async () => {
    if (!supabaseClient) return
    setLoading(true)
    try {
      const { data, error } = await supabaseClient
        .from('ufc_fighter_metrics')
        .select('*')
        .order('fighter_name', { ascending: true })

      if (error) throw error
      setFighters(data || [])
      const initialMap = {}
      for (const f of data || []) {
        initialMap[f.id] = {
          slpm: Number(f.slpm),
          sapm: Number(f.sapm),
          str_acc: Number(f.str_acc),
          str_def: Number(f.str_def),
          td_avg: Number(f.td_avg),
          td_def: Number(f.td_def),
          finish_rate: Number(f.finish_rate),
          reach_inches: Number(f.reach_inches),
        }
      }
      setEditingFields(initialMap)
      if (data && data.length >= 2 && !fighterAId) {
        setFighterAId(data[0].id)
        setFighterBId(data[1].id)
      }
    } catch (err) {
      console.error('Failed to load UFC fighter metrics:', err)
      setToast?.({ message: `Failed to load UFC fighters: ${err.message}`, isError: true })
    } finally {
      setLoading(false)
    }
  }, [supabaseClient, setToast, fighterAId])

  useEffect(() => {
    loadFighters()
  }, [loadFighters])

  const handleFieldChange = (id, field, value) => {
    setEditingFields((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [field]: value,
      },
    }))
  }

  const handleSaveFighter = async (fighter) => {
    const edit = editingFields[fighter.id]
    if (!edit) return

    setSavingId(fighter.id)
    try {
      const { error } = await supabaseClient
        .from('ufc_fighter_metrics')
        .update({
          slpm: Number(edit.slpm),
          sapm: Number(edit.sapm),
          str_acc: Number(edit.str_acc),
          str_def: Number(edit.str_def),
          td_avg: Number(edit.td_avg),
          td_def: Number(edit.td_def),
          finish_rate: Number(edit.finish_rate),
          reach_inches: Number(edit.reach_inches),
          is_custom_override: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', fighter.id)

      if (error) throw error
      setToast?.({ message: `Saved UFC metrics for ${fighter.fighter_name}` })
      await loadFighters()
    } catch (err) {
      console.error('Failed to save fighter metrics:', err)
      setToast?.({ message: `Save failed: ${err.message}`, isError: true })
    } finally {
      setSavingId(null)
    }
  }

  const handleResetFighter = async (fighter) => {
    setSavingId(fighter.id)
    try {
      const { error } = await supabaseClient
        .from('ufc_fighter_metrics')
        .update({
          is_custom_override: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', fighter.id)

      if (error) throw error
      setToast?.({ message: `Reset ${fighter.fighter_name} override status.` })
      await loadFighters()
    } catch (err) {
      setToast?.({ message: `Reset failed: ${err.message}`, isError: true })
    } finally {
      setSavingId(null)
    }
  }

  const filteredFighters = fighters.filter((f) => {
    const matchesDiv = selectedDiv === 'ALL' || f.division === selectedDiv
    const matchesQuery =
      !searchQuery ||
      f.fighter_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.division.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesDiv && matchesQuery
  })

  // Matchup Simulator Calculations
  const simFighterA = fighters.find((f) => f.id === fighterAId)
  const simFighterB = fighters.find((f) => f.id === fighterBId)

  let simAnalysis = null
  if (simFighterA && simFighterB && simFighterA.id !== simFighterB.id) {
    const netStrikingA = Number(simFighterA.slpm) - Number(simFighterA.sapm)
    const netStrikingB = Number(simFighterB.slpm) - Number(simFighterB.sapm)
    const strikingDiffA = Math.round((netStrikingA - netStrikingB) * 100) / 100

    const tdControlA = Math.round(Number(simFighterA.td_avg) * (1 - Number(simFighterB.td_def) / 100) * 10) / 10
    const tdControlB = Math.round(Number(simFighterB.td_avg) * (1 - Number(simFighterA.td_def) / 100) * 10) / 10
    const reachDeltaA = Math.round((Number(simFighterA.reach_inches) - Number(simFighterB.reach_inches)) * 10) / 10

    let probA = 0.50 + (strikingDiffA * 0.05) + ((tdControlA - tdControlB) * 0.07) + (reachDeltaA * 0.008)
    if (isFiveRounds) {
      probA += (Number(simFighterA.slpm) - Number(simFighterB.slpm)) * 0.02
    }
    if (isApexCage) {
      if (tdControlA > tdControlB) probA += 0.03
      else if (tdControlB > tdControlA) probA -= 0.03
    }
    probA = Math.max(0.12, Math.min(0.88, probA))
    const probB = Math.round((1 - probA) * 1000) / 1000
    probA = Math.round(probA * 1000) / 1000

    const oddsA = probA >= 0.50 ? Math.round(-(probA / (1 - probA)) * 100) : Math.round(((1 - probA) / probA) * 100)
    const oddsB = probB >= 0.50 ? Math.round(-(probB / (1 - probB)) * 100) : Math.round(((1 - probB) / probB) * 100)

    // Method projections
    const avgFinish = (Number(simFighterA.finish_rate) + Number(simFighterB.finish_rate)) / 200
    let fdgtd = avgFinish
    if (isApexCage) fdgtd = Math.min(0.92, fdgtd + 0.10)
    if (isFiveRounds) fdgtd = Math.min(0.94, fdgtd + 0.12)
    const fdgtdPct = Math.round(fdgtd * 100)

    const koA = Math.round(probA * (Number(simFighterA.finish_rate) * 0.7) * 10) / 10
    const decA = Math.round((probA * 100 - koA) * 10) / 10

    simAnalysis = {
      strikingDiffA,
      tdControlA,
      tdControlB,
      reachDeltaA,
      probA,
      probB,
      oddsA,
      oddsB,
      fdgtdPct,
      koA,
      decA,
    }
  }

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/60 p-4 rounded-xl border border-zinc-800/80">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <span>🥊</span> UFC Fighter Metrics & Octagon Engine
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Real official UFC Stats metrics (SLpM, SApM, Str Def, TD Avg/Def, Finish %) powering Rocco & Scott MMA cards.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadFighters}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
          >
            {loading ? 'Refreshing...' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {/* Matchup Simulator Card */}
      <div className="p-4 rounded-xl bg-gradient-to-br from-red-950/20 via-zinc-900/40 to-zinc-900/40 border border-red-500/20">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-red-300 flex items-center gap-1.5">
            <span>⚡</span> Octagon Matchup Simulator
          </h4>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isFiveRounds}
                onChange={(e) => setIsFiveRounds(e.target.checked)}
                className="rounded bg-zinc-800 border-zinc-700 text-red-500 focus:ring-0"
              />
              <span>5-Round Main/Title</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isApexCage}
                onChange={(e) => setIsApexCage(e.target.checked)}
                className="rounded bg-zinc-800 border-zinc-700 text-red-500 focus:ring-0"
              />
              <span>Apex 25ft Cage (+Finish)</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Fighter A (Red Corner)</label>
            <select
              value={fighterAId}
              onChange={(e) => setFighterAId(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
            >
              {fighters.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.fighter_name} ({f.division})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Fighter B (Blue Corner)</label>
            <select
              value={fighterBId}
              onChange={(e) => setFighterBId(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
            >
              {fighters.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.fighter_name} ({f.division})
                </option>
              ))}
            </select>
          </div>
        </div>

        {simAnalysis && (
          <div className="space-y-2 pt-3 border-t border-zinc-800/80 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-zinc-950/60 p-2 rounded-lg border border-zinc-800">
                <span className="text-zinc-500 block text-[10px]">Model Win Prob</span>
                <span className="font-bold text-red-300">
                  {Math.round(simAnalysis.probA * 100)}% vs {Math.round(simAnalysis.probB * 100)}%
                </span>
              </div>
              <div className="bg-zinc-950/60 p-2 rounded-lg border border-zinc-800">
                <span className="text-zinc-500 block text-[10px]">Model Fair ML</span>
                <span className="font-bold text-emerald-400">
                  {simAnalysis.oddsA > 0 ? `+${simAnalysis.oddsA}` : simAnalysis.oddsA} / {simAnalysis.oddsB > 0 ? `+${simAnalysis.oddsB}` : simAnalysis.oddsB}
                </span>
              </div>
              <div className="bg-zinc-950/60 p-2 rounded-lg border border-zinc-800">
                <span className="text-zinc-500 block text-[10px]">Net Strike Delta</span>
                <span className="font-semibold text-zinc-200">
                  {simAnalysis.strikingDiffA > 0 ? `+${simAnalysis.strikingDiffA}` : simAnalysis.strikingDiffA} SLpM
                </span>
              </div>
              <div className="bg-zinc-950/60 p-2 rounded-lg border border-zinc-800">
                <span className="text-zinc-500 block text-[10px]">FDGTD (Inside Distance)</span>
                <span className="font-bold text-amber-300">
                  {simAnalysis.fdgtdPct}% {simAnalysis.fdgtdPct >= 60 ? '🔥 UNDER Edge' : '⏱️ OVER Edge'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Division Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {DIVISIONS.map((div) => (
            <button
              key={div}
              type="button"
              onClick={() => setSelectedDiv(div)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                selectedDiv === div
                  ? 'bg-red-900/60 text-red-200 ring-1 ring-red-500/40'
                  : 'bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700/80 hover:text-zinc-200'
              }`}
            >
              {div}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search fighter..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950/40">
        <table className="w-full text-left text-xs text-zinc-300">
          <thead className="bg-zinc-900/80 text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800">
            <tr>
              <th className="px-3 py-2.5">Fighter</th>
              <th className="px-2 py-2.5">Division</th>
              <th className="px-2 py-2.5">SLpM</th>
              <th className="px-2 py-2.5">SApM</th>
              <th className="px-2 py-2.5">Str Def %</th>
              <th className="px-2 py-2.5">TD Avg</th>
              <th className="px-2 py-2.5">TD Def %</th>
              <th className="px-2 py-2.5">Finish %</th>
              <th className="px-2 py-2.5">Reach</th>
              <th className="px-3 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {filteredFighters.map((f) => {
              const edit = editingFields[f.id] || {}
              const isSaving = savingId === f.id

              return (
                <tr key={f.id} className="hover:bg-zinc-900/30 transition">
                  <td className="px-3 py-2.5 font-medium text-white whitespace-nowrap">
                    {f.fighter_name}
                    {f.is_custom_override && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] bg-red-950/80 text-red-400 border border-red-800/40">
                        MODIFIED
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-zinc-400 whitespace-nowrap">{f.division}</td>
                  <td className="px-2 py-2.5">
                    <input
                      type="number"
                      step="0.01"
                      value={edit.slpm ?? f.slpm}
                      onChange={(e) => handleFieldChange(f.id, 'slpm', e.target.value)}
                      className="w-14 bg-zinc-900 border border-zinc-700/80 rounded px-1.5 py-0.5 text-xs text-white"
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <input
                      type="number"
                      step="0.01"
                      value={edit.sapm ?? f.sapm}
                      onChange={(e) => handleFieldChange(f.id, 'sapm', e.target.value)}
                      className="w-14 bg-zinc-900 border border-zinc-700/80 rounded px-1.5 py-0.5 text-xs text-white"
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <input
                      type="number"
                      step="1"
                      value={edit.str_def ?? f.str_def}
                      onChange={(e) => handleFieldChange(f.id, 'str_def', e.target.value)}
                      className="w-12 bg-zinc-900 border border-zinc-700/80 rounded px-1.5 py-0.5 text-xs text-white"
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <input
                      type="number"
                      step="0.01"
                      value={edit.td_avg ?? f.td_avg}
                      onChange={(e) => handleFieldChange(f.id, 'td_avg', e.target.value)}
                      className="w-14 bg-zinc-900 border border-zinc-700/80 rounded px-1.5 py-0.5 text-xs text-white"
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <input
                      type="number"
                      step="1"
                      value={edit.td_def ?? f.td_def}
                      onChange={(e) => handleFieldChange(f.id, 'td_def', e.target.value)}
                      className="w-12 bg-zinc-900 border border-zinc-700/80 rounded px-1.5 py-0.5 text-xs text-white"
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <input
                      type="number"
                      step="1"
                      value={edit.finish_rate ?? f.finish_rate}
                      onChange={(e) => handleFieldChange(f.id, 'finish_rate', e.target.value)}
                      className="w-12 bg-zinc-900 border border-zinc-700/80 rounded px-1.5 py-0.5 text-xs text-white"
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <input
                      type="number"
                      step="0.5"
                      value={edit.reach_inches ?? f.reach_inches}
                      onChange={(e) => handleFieldChange(f.id, 'reach_inches', e.target.value)}
                      className="w-14 bg-zinc-900 border border-zinc-700/80 rounded px-1.5 py-0.5 text-xs text-white"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSaveFighter(f)}
                        disabled={isSaving}
                        className="px-2 py-1 rounded bg-red-950/70 hover:bg-red-900 text-red-300 border border-red-700/40 text-[11px] font-medium transition"
                      >
                        {isSaving ? '...' : 'Save'}
                      </button>
                      {f.is_custom_override && (
                        <button
                          type="button"
                          onClick={() => handleResetFighter(f)}
                          disabled={isSaving}
                          className="px-1.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-[10px]"
                          title="Reset to default"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
