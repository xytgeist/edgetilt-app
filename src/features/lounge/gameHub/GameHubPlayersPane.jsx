import { useMemo, useState } from 'react'

function PlayerAvatar({ player }) {
  const [failed, setFailed] = useState(false)
  const letter = String(player?.name || '?').slice(0, 1).toUpperCase()
  if (!player?.headshot_url || failed) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-bold text-zinc-300">
        {letter}
      </span>
    )
  }
  return (
    <img
      src={player.headshot_url}
      alt=""
      className="h-10 w-10 shrink-0 rounded-full object-cover bg-zinc-800"
      onError={() => setFailed(true)}
    />
  )
}

/**
 * Ranked roster for both teams in this matchup.
 */
export default function GameHubPlayersPane({ players, loading, error, awayAbbrev, homeAbbrev }) {
  const [q, setQ] = useState('')
  const [side, setSide] = useState('all')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (players || []).filter((p) => {
      if (side === 'away' && p.side !== 'away') return false
      if (side === 'home' && p.side !== 'home') return false
      if (!needle) return true
      return (
        String(p.name || '').toLowerCase().includes(needle) ||
        String(p.position || '').toLowerCase().includes(needle) ||
        String(p.team || '').toLowerCase().includes(needle)
      )
    })
  }, [players, q, side])

  if (loading) return <div className="py-10 text-center text-sm text-zinc-500">Loading roster…</div>
  if (error) return <div className="py-10 text-center text-sm text-lv-red">{error}</div>
  if (!players?.length) {
    return <div className="py-10 text-center text-sm text-zinc-500">No roster data for this matchup yet.</div>
  }

  return (
    <div data-lounge-game-players className="space-y-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(ev) => setQ(ev.target.value)}
          placeholder="Search players"
          className="min-w-0 flex-1 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-[13px] text-white outline-none placeholder:text-zinc-500"
        />
        {[
          { id: 'all', label: 'Both' },
          { id: 'away', label: awayAbbrev || 'Away' },
          { id: 'home', label: homeAbbrev || 'Home' },
        ].map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setSide(opt.id)}
            className={`rounded-full px-2.5 py-1.5 text-[12px] font-semibold ${
              side === opt.id ? 'bg-zinc-100 text-zinc-950' : 'bg-zinc-800 text-zinc-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <ul className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        {filtered.map((p) => (
          <li key={p.sleeper_id} className="flex items-center gap-3 px-3 py-2.5">
            <PlayerAvatar player={p} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold text-zinc-100">{p.name}</div>
              <div className="text-[12px] text-zinc-500">
                {p.position || '—'} · {p.team}
                {p.search_rank != null ? ` · #${p.search_rank}` : ''}
              </div>
            </div>
            {p.projected_ppr != null || p.season_ppr != null ? (
              <div className="shrink-0 text-right">
                <div className="text-[14px] font-bold tabular-nums text-zinc-100">
                  {p.projected_ppr != null ? p.projected_ppr : '—'}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                  {p.season_ppr != null ? `YTD ${p.season_ppr}` : 'Proj'}
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {!filtered.length ? (
        <div className="py-6 text-center text-sm text-zinc-500">No players match that filter.</div>
      ) : null}
    </div>
  )
}
