import { useCallback, useEffect, useState } from 'react'

export default function BotCfbPowerRatingsEditor({ supabaseClient, setToast }) {
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedConf, setSelectedConf] = useState('ALL')
  const [editingFields, setEditingFields] = useState({}) // id -> { power_rating, off_rating, def_rating, home_field_advantage }

  const loadTeams = useCallback(async () => {
    if (!supabaseClient) return
    setLoading(true)
    try {
      const { data, error } = await supabaseClient
        .from('cfb_team_power_ratings')
        .select('*')
        .order('power_rating', { ascending: false })

      if (error) throw error
      setTeams(data || [])
      const initialMap = {}
      for (const t of data || []) {
        initialMap[t.id] = {
          power_rating: Number(t.power_rating),
          off_rating: Number(t.off_rating),
          def_rating: Number(t.def_rating),
          home_field_advantage: Number(t.home_field_advantage),
        }
      }
      setEditingFields(initialMap)
    } catch (err) {
      console.error('Failed to load CFB power ratings:', err)
      setToast?.({ message: `Failed to load CFB power ratings: ${err.message}`, isError: true })
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

    const powerRating = Number(edit.power_rating)
    const offRating = Number(edit.off_rating)
    const defRating = Number(edit.def_rating)
    const hfa = Number(edit.home_field_advantage)

    if (Number.isNaN(powerRating) || Number.isNaN(offRating) || Number.isNaN(defRating) || Number.isNaN(hfa)) {
      setToast?.({ message: 'Ratings and HFA must be valid numbers.', isError: true })
      return
    }

    setSavingId(team.id)
    try {
      const { error } = await supabaseClient
        .from('cfb_team_power_ratings')
        .update({
          power_rating: powerRating,
          off_rating: offRating,
          def_rating: defRating,
          home_field_advantage: hfa,
          is_custom_override: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', team.id)

      if (error) throw error

      setToast?.({ message: `Updated power ratings for ${team.team_name}` })
      setTeams((prev) =>
        prev.map((t) =>
          t.id === team.id
            ? {
                ...t,
                power_rating: powerRating,
                off_rating: offRating,
                def_rating: defRating,
                home_field_advantage: hfa,
                is_custom_override: true,
              }
            : t,
        ),
      )
    } catch (err) {
      console.error('Failed to update team ratings:', err)
      setToast?.({ message: `Failed to save: ${err.message}`, isError: true })
    } finally {
      setSavingId(null)
    }
  }

  const handleResetTeam = async (team) => {
    setSavingId(team.id)
    try {
      const { error } = await supabaseClient
        .from('cfb_team_power_ratings')
        .update({
          is_custom_override: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', team.id)

      if (error) throw error

      setToast?.({ message: `Reset override for ${team.team_name}` })
      await loadTeams()
    } catch (err) {
      console.error('Failed to reset team ratings:', err)
      setToast?.({ message: `Failed to reset: ${err.message}`, isError: true })
    } finally {
      setSavingId(null)
    }
  }

  const conferences = ['ALL', 'SEC', 'Big Ten', 'Big 12', 'ACC', 'Independent', 'Mountain West', 'AAC', 'Sun Belt', 'C-USA']

  const filteredTeams = teams.filter((t) => {
    const matchesConf = selectedConf === 'ALL' || t.conference === selectedConf
    const query = searchQuery.toLowerCase().trim()
    const matchesSearch =
      !query ||
      t.team_name.toLowerCase().includes(query) ||
      t.team_abbr.toLowerCase().includes(query) ||
      t.conference.toLowerCase().includes(query)
    return matchesConf && matchesSearch
  })

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-4 mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <div className="text-white font-bold text-sm">CFB Power Index & Model Spreads</div>
          <div className="text-zinc-500 text-[11px]">
            Points vs Average FBS Team, Off/Def efficiency, and Home Field Advantage (HFA) used by Scott & Rocco for Saturday slates.
          </div>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={loadTeams}
          className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="text"
          value={searchQuery}
          placeholder="Search team or conference..."
          onChange={(e) => setSearchQuery(e.target.value)}
          className="min-w-[180px] flex-1 rounded-xl border border-zinc-700 bg-zinc-900/90 px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:border-cyan-500/50 focus:outline-none"
        />
        <div className="flex flex-wrap gap-1">
          {conferences.map((conf) => (
            <button
              key={conf}
              type="button"
              onClick={() => setSelectedConf(conf)}
              className={`rounded-lg px-2 py-1 text-[10px] font-semibold ring-1 ${
                selectedConf === conf
                  ? 'bg-cyan-950/60 text-cyan-200 ring-cyan-500/40'
                  : 'bg-zinc-900 text-zinc-400 ring-zinc-800 hover:text-zinc-200'
              }`}
            >
              {conf}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800/80">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-900/90 text-zinc-400 border-b border-zinc-800">
            <tr>
              <th className="py-2.5 px-3 font-semibold">Team</th>
              <th className="py-2.5 px-2 font-semibold">Conf</th>
              <th className="py-2.5 px-2 font-semibold text-center" title="Power Rating: Points vs Average FBS team">Power (PR)</th>
              <th className="py-2.5 px-2 font-semibold text-center" title="Offensive Rating">Off Rating</th>
              <th className="py-2.5 px-2 font-semibold text-center" title="Defensive Rating (pts allowed)">Def Rating</th>
              <th className="py-2.5 px-2 font-semibold text-center" title="Home Field Advantage">HFA (Pts)</th>
              <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 bg-zinc-950/20">
            {filteredTeams.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-zinc-500">
                  {loading ? 'Loading teams…' : 'No teams match the current filter.'}
                </td>
              </tr>
            ) : (
              filteredTeams.map((team) => {
                const edit = editingFields[team.id] || {}
                const isSaving = savingId === team.id
                const isCustom = team.is_custom_override

                return (
                  <tr key={team.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-white whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-zinc-300 font-mono text-[11px] w-10">
                          {team.team_abbr}
                        </span>
                        <span>{team.team_name}</span>
                        {isCustom && (
                          <span className="rounded bg-amber-950/60 px-1 py-0.5 text-[9px] font-bold text-amber-300 ring-1 ring-amber-500/30">
                            OVERRIDE
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-zinc-400 font-mono text-[11px] whitespace-nowrap">
                      {team.conference}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <input
                        type="number"
                        step="0.5"
                        value={edit.power_rating ?? ''}
                        onChange={(e) => handleFieldChange(team.id, 'power_rating', e.target.value)}
                        className="w-16 rounded-lg border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-center text-xs text-white font-mono focus:border-cyan-500/50 focus:outline-none"
                      />
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <input
                        type="number"
                        step="0.5"
                        value={edit.off_rating ?? ''}
                        onChange={(e) => handleFieldChange(team.id, 'off_rating', e.target.value)}
                        className="w-16 rounded-lg border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-center text-xs text-white font-mono focus:border-cyan-500/50 focus:outline-none"
                      />
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <input
                        type="number"
                        step="0.5"
                        value={edit.def_rating ?? ''}
                        onChange={(e) => handleFieldChange(team.id, 'def_rating', e.target.value)}
                        className="w-16 rounded-lg border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-center text-xs text-white font-mono focus:border-cyan-500/50 focus:outline-none"
                      />
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <input
                        type="number"
                        step="0.1"
                        value={edit.home_field_advantage ?? ''}
                        onChange={(e) => handleFieldChange(team.id, 'home_field_advantage', e.target.value)}
                        className="w-16 rounded-lg border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-center text-xs text-white font-mono focus:border-cyan-500/50 focus:outline-none"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleSaveTeam(team)}
                          className="rounded-lg bg-cyan-700/80 hover:bg-cyan-600 px-2.5 py-1 text-[11px] font-bold text-white transition-colors disabled:opacity-50"
                        >
                          {isSaving ? '…' : 'Save'}
                        </button>
                        {isCustom && (
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleResetTeam(team)}
                            className="rounded-lg bg-zinc-800 hover:bg-zinc-700 px-2 py-1 text-[11px] font-semibold text-zinc-400 transition-colors disabled:opacity-50"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
