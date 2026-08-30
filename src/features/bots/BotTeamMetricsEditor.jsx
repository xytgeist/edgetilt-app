import { useCallback, useEffect, useState } from 'react'

export default function BotTeamMetricsEditor({ supabaseClient, setToast }) {
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedConf, setSelectedConf] = useState('ALL')
  const [editingFields, setEditingFields] = useState({}) // id -> { off_epa, def_epa, pbwr, prwr, success_rate }

  const loadTeams = useCallback(async () => {
    if (!supabaseClient) return
    setLoading(true)
    try {
      const { data, error } = await supabaseClient
        .from('nfl_team_metrics')
        .select('*')
        .order('team_name', { ascending: true })

      if (error) throw error
      setTeams(data || [])
      const initialMap = {}
      for (const t of data || []) {
        initialMap[t.id] = {
          off_epa_play: Number(t.off_epa_play),
          def_epa_play: Number(t.def_epa_play),
          pass_block_win_rate: Number(t.pass_block_win_rate),
          pass_rush_win_rate: Number(t.pass_rush_win_rate),
          success_rate: Number(t.success_rate),
        }
      }
      setEditingFields(initialMap)
    } catch (err) {
      console.error('Failed to load team metrics:', err)
      setToast?.({ message: `Failed to load team metrics: ${err.message}`, isError: true })
    } finally {
      setLoading(false)
    }
  }, [supabaseClient, setToast])

  useEffect(() => {
    loadTeams()
  }, [loadTeams])

  const handleFieldChange = (id, field, value) => {
    setEditingFields((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [field]: value,
      },
    }))
  }

  const handleSaveTeam = async (team) => {
    const edit = editingFields[team.id]
    if (!edit) return

    const offEpa = Number(edit.off_epa_play)
    const defEpa = Number(edit.def_epa_play)
    const pbwr = Number(edit.pass_block_win_rate)
    const prwr = Number(edit.pass_rush_win_rate)
    const succRate = Number(edit.success_rate)

    if (isNaN(offEpa) || isNaN(defEpa) || isNaN(pbwr) || isNaN(prwr)) {
      setToast?.({ message: 'Invalid numbers in team metrics fields', isError: true })
      return
    }

    setSavingId(team.id)
    try {
      const { error } = await supabaseClient
        .from('nfl_team_metrics')
        .update({
          off_epa_play: offEpa,
          def_epa_play: defEpa,
          pass_block_win_rate: pbwr,
          pass_rush_win_rate: prwr,
          success_rate: succRate,
          is_custom_override: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', team.id)

      if (error) throw error
      setToast?.({ message: `Updated ${team.team_name} metrics`, isError: false })
      setTeams((prev) =>
        prev.map((t) =>
          t.id === team.id
            ? {
                ...t,
                off_epa_play: offEpa,
                def_epa_play: defEpa,
                pass_block_win_rate: pbwr,
                pass_rush_win_rate: prwr,
                success_rate: succRate,
                is_custom_override: true,
              }
            : t,
        ),
      )
    } catch (err) {
      console.error('Failed to update team metrics:', err)
      setToast?.({ message: `Save failed: ${err.message}`, isError: true })
    } finally {
      setSavingId(null)
    }
  }

  const filteredTeams = teams.filter((t) => {
    if (selectedConf !== 'ALL' && t.conference !== selectedConf) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return (
        t.team_name.toLowerCase().includes(q) ||
        t.team_abbr.toLowerCase().includes(q) ||
        t.division.toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-4 text-zinc-100 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-white tracking-wide">
              ⚔️ NFL Team EPA & Trench Efficiency
            </span>
            <span className="rounded bg-indigo-950/80 px-2 py-0.5 text-[10.5px] font-bold text-indigo-400 ring-1 ring-indigo-500/30">
              Rocco & Scott Models
            </span>
          </div>
          <p className="mt-0.5 text-xs text-zinc-400">
            Off/Def EPA per play, Pass Block Win Rate (PBWR), and Pass Rush Win Rate (PRWR) for matchup trench disparity.
          </p>
        </div>

        <button
          type="button"
          onClick={loadTeams}
          disabled={loading}
          className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
        >
          {loading ? 'Refreshing...' : '🔄 Refresh Table'}
        </button>
      </div>

      {/* Filters & Search */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {['ALL', 'AFC', 'NFC'].map((conf) => (
            <button
              key={conf}
              type="button"
              onClick={() => setSelectedConf(conf)}
              className={`rounded-md px-2.5 py-1 font-semibold transition ${
                selectedConf === conf
                  ? 'bg-amber-500 text-black shadow-sm'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              {conf}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search team or division..."
          className="w-full sm:w-64 rounded-lg border border-zinc-800 bg-zinc-900/90 px-3 py-1 text-xs text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
        />
      </div>

      {/* Team Metrics Table */}
      <div className="mt-3 max-h-96 overflow-y-auto rounded-lg border border-zinc-800/80 bg-zinc-900/40">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-zinc-950/95 border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-3 py-2">Team</th>
              <th className="px-2 py-2">Div</th>
              <th className="px-2 py-2">Off EPA</th>
              <th className="px-2 py-2">Def EPA</th>
              <th className="px-2 py-2">Net EPA</th>
              <th className="px-2 py-2">PBWR %</th>
              <th className="px-2 py-2">PRWR %</th>
              <th className="px-2 py-2">Succ %</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {filteredTeams.map((team) => {
              const edit = editingFields[team.id] || {
                off_epa_play: Number(team.off_epa_play),
                def_epa_play: Number(team.def_epa_play),
                pass_block_win_rate: Number(team.pass_block_win_rate),
                pass_rush_win_rate: Number(team.pass_rush_win_rate),
                success_rate: Number(team.success_rate),
              }

              const netEpa = Math.round((Number(edit.off_epa_play) - Number(edit.def_epa_play)) * 100) / 100
              const hasChanged =
                Number(edit.off_epa_play) !== Number(team.off_epa_play) ||
                Number(edit.def_epa_play) !== Number(team.def_epa_play) ||
                Number(edit.pass_block_win_rate) !== Number(team.pass_block_win_rate) ||
                Number(edit.pass_rush_win_rate) !== Number(team.pass_rush_win_rate) ||
                Number(edit.success_rate) !== Number(team.success_rate)

              const isSaving = savingId === team.id

              return (
                <tr key={team.id} className="hover:bg-zinc-800/30 transition">
                  <td className="px-3 py-2 font-semibold text-white">
                    <div className="flex items-center gap-1.5">
                      <span>{team.team_name}</span>
                      <span className="text-[10px] text-zinc-500 font-mono">({team.team_abbr})</span>
                      {team.is_custom_override && (
                        <span className="rounded bg-amber-950/80 px-1 py-0.2 text-[9px] font-bold text-amber-400 ring-1 ring-amber-500/30">
                          custom
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-zinc-400 text-[11px]">
                    {team.conference} {team.division}
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      step="0.01"
                      value={edit.off_epa_play}
                      onChange={(e) => handleFieldChange(team.id, 'off_epa_play', e.target.value)}
                      className="w-16 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      step="0.01"
                      value={edit.def_epa_play}
                      onChange={(e) => handleFieldChange(team.id, 'def_epa_play', e.target.value)}
                      className="w-16 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-2 py-2 font-mono text-xs font-bold">
                    <span className={netEpa > 0 ? 'text-emerald-400' : netEpa < 0 ? 'text-rose-400' : 'text-zinc-400'}>
                      {netEpa > 0 ? `+${netEpa}` : netEpa}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      step="1"
                      value={edit.pass_block_win_rate}
                      onChange={(e) => handleFieldChange(team.id, 'pass_block_win_rate', e.target.value)}
                      className="w-14 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      step="1"
                      value={edit.pass_rush_win_rate}
                      onChange={(e) => handleFieldChange(team.id, 'pass_rush_win_rate', e.target.value)}
                      className="w-14 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      step="0.5"
                      value={edit.success_rate}
                      onChange={(e) => handleFieldChange(team.id, 'success_rate', e.target.value)}
                      className="w-14 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={isSaving || !hasChanged}
                      onClick={() => handleSaveTeam(team)}
                      className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
                        hasChanged
                          ? 'bg-amber-500 text-black hover:bg-amber-400 shadow-sm'
                          : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                      }`}
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  </td>
                </tr>
              )
            })}
            {filteredTeams.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-zinc-500">
                  No NFL teams found matching filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
