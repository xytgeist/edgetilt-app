import { useState, useEffect, useCallback } from 'react'

export default function CasinoListPanel({ supabaseClient }) {
  const [casinos, setCasinos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [recentOnly, setRecentOnly] = useState(false)
  const [addName, setAddName] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: err } = await supabaseClient
        .from('casinos')
        .select('id, name, aliases, source, created_at')
        .order('created_at', { ascending: false })
      if (err) throw err
      setCasinos(data || [])
    } catch (e) {
      setError(e?.message || 'Could not load casino list.')
    } finally {
      setLoading(false)
    }
  }, [supabaseClient])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const handleAdd = async () => {
    const name = addName.trim()
    if (!name) return
    setAdding(true)
    setError('')
    try {
      const { error: err } = await supabaseClient
        .from('casinos')
        .insert({ name, source: 'admin' })
      if (err) throw err
      setAddName('')
      await load()
    } catch (e) {
      setError(e?.message || 'Could not add casino.')
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (id) => {
    setDeletingId(id)
    setError('')
    try {
      const { error: err } = await supabaseClient.from('casinos').delete().eq('id', id)
      if (err) throw err
      setCasinos((prev) => prev.filter((c) => c.id !== id))
    } catch (e) {
      setError(e?.message || 'Could not delete casino.')
    } finally {
      setDeletingId(null)
    }
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const filtered = casinos.filter((c) => {
    if (recentOnly && c.created_at < sevenDaysAgo) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="mb-4 rounded-2xl border border-zinc-700/60 bg-zinc-900/80 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-zinc-300 hover:text-zinc-100 touch-manipulation"
      >
        <span className="flex items-center gap-2">
          <span className="text-base">🎰</span>
          Casino Name Index
          {casinos.length > 0 && !loading && (
            <span className="text-[11px] font-normal text-zinc-500">({casinos.length})</span>
          )}
        </span>
        <span className="text-zinc-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-zinc-700/40">
          {error && (
            <div className="mt-3 rounded-xl bg-red-900/30 border border-red-500/30 px-3 py-2 text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Add new */}
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Add casino name…"
              className="flex-1 min-w-0 bg-zinc-800 text-zinc-100 placeholder-zinc-500 rounded-xl border border-zinc-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={adding || !addName.trim()}
              className="shrink-0 rounded-xl bg-orange-600 text-white text-sm font-semibold px-4 py-2 disabled:opacity-50 touch-manipulation"
            >
              {adding ? '…' : 'Add'}
            </button>
          </div>

          {/* Filters */}
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="flex-1 min-w-[140px] bg-zinc-800 text-zinc-100 placeholder-zinc-500 rounded-xl border border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            />
            <button
              type="button"
              onClick={() => setRecentOnly((v) => !v)}
              className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold touch-manipulation transition-colors ${
                recentOnly
                  ? 'bg-violet-500/20 border-violet-400/50 text-violet-200'
                  : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Recent (7d)
            </button>
            <button
              type="button"
              onClick={load}
              className="shrink-0 text-zinc-500 hover:text-zinc-300 text-xs touch-manipulation"
            >
              ↺ Refresh
            </button>
          </div>

          {/* List */}
          {loading ? (
            <div className="mt-4 text-zinc-500 text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="mt-4 text-zinc-500 text-sm">
              {casinos.length === 0 ? 'No casinos yet. They\'ll auto-populate as events are saved.' : 'No results.'}
            </div>
          ) : (
            <div className="mt-3 space-y-1 max-h-72 overflow-y-auto pr-1">
              {filtered.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-xl bg-zinc-800/60 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-zinc-100 text-sm truncate">{c.name}</div>
                    {c.aliases?.length > 0 && (
                      <div className="text-zinc-500 text-[10px] truncate">{c.aliases.join(', ')}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                        c.source === 'admin'
                          ? 'bg-orange-500/20 text-orange-300'
                          : c.source === 'seed'
                            ? 'bg-blue-500/20 text-blue-300'
                            : 'bg-zinc-700 text-zinc-400'
                      }`}
                    >
                      {c.source}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      disabled={deletingId === c.id}
                      className="text-red-400 hover:text-red-300 text-xs font-medium touch-manipulation disabled:opacity-40"
                    >
                      {deletingId === c.id ? '…' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-2 text-zinc-600 text-[10px]">
            {filtered.length} of {casinos.length} entries
          </div>
        </div>
      )}
    </div>
  )
}
