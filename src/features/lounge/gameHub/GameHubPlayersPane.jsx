import { useEffect, useMemo, useState } from 'react'
import GameHubFantasyPane from './GameHubFantasyPane.jsx'
import { KalshiPlayerPropsBoard } from './GameHubKalshiProps.jsx'

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

function RosterBoard({ players, awayAbbrev, homeAbbrev }) {
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

  if (!players?.length) {
    return <div className="py-10 text-center text-sm text-zinc-500">No roster data for this matchup yet.</div>
  }

  return (
    <div className="space-y-3">
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

/**
 * Players hub surface: Roster + Fantasy board + Kalshi player props.
 */
export default function GameHubPlayersPane({
  players,
  props,
  loading,
  error,
  awayAbbrev,
  homeAbbrev,
  season,
  week,
  sources,
  /** Prefer fantasy on pregame (hub used to open Fantasy tab). */
  defaultView = 'roster',
}) {
  const [view, setView] = useState(defaultView)

  useEffect(() => {
    setView(defaultView)
  }, [defaultView])

  if (loading) return <div className="py-10 text-center text-sm text-zinc-500">Loading players…</div>
  if (error) return <div className="py-10 text-center text-sm text-lv-red">{error}</div>

  const hasKalshi = Array.isArray(sources) && sources.includes('kalshi')
  const hasPoly = Array.isArray(sources) && sources.includes('polymarket')

  return (
    <div data-lounge-game-players className="space-y-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[12px] text-zinc-500">
          {season && week != null ? `Week ${week} · ${season}` : 'This matchup'}
          {view === 'props' && hasKalshi ? ' · Kalshi' : ''}
          {view === 'props' && hasPoly ? ' · Polymarket' : ''}
        </div>
        <div className="flex gap-1 rounded-full bg-zinc-900 p-0.5">
          {[
            { id: 'roster', label: 'Roster' },
            { id: 'fantasy', label: 'Fantasy' },
            { id: 'props', label: 'Props' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setView(opt.id)}
              className={`rounded-full px-3 py-1 text-[12px] font-semibold ${
                view === opt.id ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'roster' ? (
        <RosterBoard players={players} awayAbbrev={awayAbbrev} homeAbbrev={homeAbbrev} />
      ) : null}

      {view === 'fantasy' ? (
        <GameHubFantasyPane
          players={players}
          loading={false}
          error=""
          season={season}
          week={week}
          sources={sources}
          embedded
        />
      ) : null}

      {view === 'props' ? (
        <KalshiPlayerPropsBoard props={props} players={players} />
      ) : null}
    </div>
  )
}
