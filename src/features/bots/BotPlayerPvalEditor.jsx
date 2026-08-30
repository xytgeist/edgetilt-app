import { useCallback, useEffect, useState } from 'react'

export default function BotPlayerPvalEditor({ supabaseClient, setToast }) {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPos, setSelectedPos] = useState('ALL')
  const [editingPval, setEditingPval] = useState({}) // id -> number

  const loadPlayers = useCallback(async () => {
    if (!supabaseClient) return
    setLoading(true)
    try {
      const { data, error } = await supabaseClient
        .from('nfl_player_pvals')
        .select('*')
        .order('pval', { ascending: false })

      if (error) throw error
      setPlayers(data || [])
      const initialMap = {}
      for (const p of data || []) {
        initialMap[p.id] = Number(p.pval)
      }
      setEditingPval(initialMap)
    } catch (err) {
      console.error('Failed to load player PVALs:', err)
      setToast?.({ message: `Failed to load player values: ${err.message}`, isError: true })
    } finally {
      setLoading(false)
    }
  }, [supabaseClient, setToast])

  useEffect(() => {
    loadPlayers()
  }, [loadPlayers])

  const handleSavePval = async (player) => {
    const newVal = Number(editingPval[player.id])
    if (isNaN(newVal) || newVal < 0 || newVal > 10) {
      setToast?.({ message: 'PVAL must be between 0.0 and 10.0', isError: true })
      return
    }

    setSavingId(player.id)
    try {
      const { error } = await supabaseClient
        .from('nfl_player_pvals')
        .update({
          pval: newVal,
          is_custom_override: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', player.id)

      if (error) throw error
      setToast?.({ message: `Updated ${player.player_name} PVAL to ${newVal} pts`, isError: false })
      setPlayers((prev) =>
        prev.map((p) => (p.id === player.id ? { ...p, pval: newVal, is_custom_override: true } : p)),
      )
    } catch (err) {
      console.error('Failed to update PVAL:', err)
      setToast?.({ message: `Save failed: ${err.message}`, isError: true })
    } finally {
      setSavingId(null)
    }
  }

  const filteredPlayers = players.filter((p) => {
    if (selectedPos !== 'ALL' && p.position !== selectedPos) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return (
        p.player_name.toLowerCase().includes(q) ||
        p.team_name.toLowerCase().includes(q) ||
        p.position.toLowerCase().includes(q)
      )
    }
    return true
  })

  const positions = ['ALL', 'QB', 'EDGE', 'CB', 'OT', 'WR', 'RB', 'DT', 'S', 'TE']

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-4 text-zinc-100 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-white tracking-wide">
              ⚡ NFL Player Point Spread Values (PVAL)
            </span>
            <span className="rounded bg-emerald-950/80 px-2 py-0.5 text-[10.5px] font-bold text-emerald-400 ring-1 ring-emerald-500/30">
              Auto-Synced Tuesdays
            </span>
          </div>
          <p className="mt-0.5 text-xs text-zinc-400">
            Real market line impact (pts) when player is ruled OUT. Syndicate injury models read this directly.
          </p>
        </div>

        <button
          type="button"
          onClick={loadPlayers}
          disabled={loading}
          className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
        >
          {loading ? 'Refreshing...' : '🔄 Refresh Table'}
        </button>
      </div>

      {/* Filters & Search */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {positions.map((pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => setSelectedPos(pos)}
              className={`rounded-md px-2.5 py-1 font-semibold transition ${
                selectedPos === pos
                  ? 'bg-amber-500 text-black shadow-sm'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search player or team..."
          className="w-full sm:w-64 rounded-lg border border-zinc-800 bg-zinc-900/90 px-3 py-1 text-xs text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
        />
      </div>

      {/* Players Table */}
      <div className="mt-3 max-h-96 overflow-y-auto rounded-lg border border-zinc-800/80 bg-zinc-900/40">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-zinc-950/95 border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-3 py-2">Player</th>
              <th className="px-3 py-2">Team</th>
              <th className="px-2 py-2">Pos</th>
              <th className="px-3 py-2">PVAL (pts)</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {filteredPlayers.map((player) => {
              const currentVal = editingPval[player.id] ?? Number(player.pval)
              const hasChanged = Number(currentVal) !== Number(player.pval)
              const isSaving = savingId === player.id

              return (
                <tr key={player.id} className="hover:bg-zinc-800/30 transition">
                  <td className="px-3 py-2 font-semibold text-white">
                    {player.player_name}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">
                    {player.team_name}
                  </td>
                  <td className="px-2 py-2">
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold text-zinc-300">
                      {player.position}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        max="8"
                        value={currentVal}
                        onChange={(e) =>
                          setEditingPval((prev) => ({
                            ...prev,
                            [player.id]: parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-16 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs font-bold text-amber-300 focus:border-amber-500 focus:outline-none"
                      />
                      <span className="text-[11px] text-zinc-500">pts</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {player.is_custom_override ? (
                      <span className="rounded bg-amber-950/70 border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                        Custom Override
                      </span>
                    ) : (
                      <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-400">
                        Auto Model
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={!hasChanged || isSaving}
                      onClick={() => handleSavePval(player)}
                      className={`rounded px-2.5 py-1 text-[11px] font-bold transition ${
                        hasChanged
                          ? 'bg-amber-500 text-black hover:bg-amber-400 shadow-sm cursor-pointer'
                          : 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-50'
                      }`}
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
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
