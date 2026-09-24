import { useMemo, useState } from 'react'

function PlayerAvatar({ player }) {
  const [failed, setFailed] = useState(false)
  const letter = String(player?.name || '?').slice(0, 1).toUpperCase()
  if (!player?.headshot_url || failed) {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-300">
        {letter}
      </span>
    )
  }
  return (
    <img
      src={player.headshot_url}
      alt=""
      className="h-9 w-9 shrink-0 rounded-full object-cover bg-zinc-800"
      onError={() => setFailed(true)}
    />
  )
}

function fmt(n, digits = 1) {
  if (n == null || !Number.isFinite(Number(n))) return '-'
  const v = Number(n)
  return Number.isInteger(v) || digits === 0 ? String(Math.round(v)) : v.toFixed(digits)
}

function projYardLine(player) {
  const parts = []
  if (player.projected_pass_yd != null) parts.push(`${fmt(player.projected_pass_yd, 0)} pass`)
  if (player.projected_rush_yd != null) parts.push(`${fmt(player.projected_rush_yd, 0)} rush`)
  if (player.projected_rec_yd != null) parts.push(`${fmt(player.projected_rec_yd, 0)} rec`)
  else if (player.projected_rec != null) parts.push(`${fmt(player.projected_rec, 1)} rec`)
  return parts.join(' · ')
}

/** Only surface Q / D / Out (IR counts as Out). */
export function injuryTag(status) {
  const raw = String(status || '').trim().toLowerCase()
  if (!raw) return null
  if (raw === 'out' || raw === 'ir' || raw.includes('out')) {
    return { code: 'OUT', label: 'Out', className: 'bg-rose-500/20 text-rose-300 ring-rose-400/40' }
  }
  if (raw.startsWith('doubt')) {
    return { code: 'D', label: 'Doubtful', className: 'bg-amber-500/20 text-amber-300 ring-amber-400/40' }
  }
  if (raw.startsWith('quest') || raw === 'q') {
    return { code: 'Q', label: 'Questionable', className: 'bg-yellow-500/15 text-yellow-300 ring-yellow-400/35' }
  }
  return null
}

function InjuryPill({ status }) {
  const tag = injuryTag(status)
  if (!tag) return null
  return (
    <span
      title={tag.label}
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 ring-inset ${tag.className}`}
    >
      {tag.code}
    </span>
  )
}

/**
 * Sleeper game PPR + season on each row.
 * Pregame: Game = projection. Live/final: Game = scored, proj tucked under.
 */
export default function GameHubFantasyPane({ players, loading, error, gameStatus = 'pre' }) {
  const liveOrFinal = gameStatus === 'in' || gameStatus === 'post'

  const ranked = useMemo(() => {
    const list = [...(players || [])].filter((p) =>
      ['QB', 'RB', 'WR', 'TE'].includes(String(p.position || '').toUpperCase()),
    )
    list.sort((a, b) => {
      if (liveOrFinal) {
        const ga = a.game_ppr ?? -1
        const gb = b.game_ppr ?? -1
        if (gb !== ga) return gb - ga
      }
      const pa = a.projected_ppr ?? a.fantasypros_pts ?? -1
      const pb = b.projected_ppr ?? b.fantasypros_pts ?? -1
      if (pb !== pa) return pb - pa
      const sa = a.season_ppr ?? -1
      const sb = b.season_ppr ?? -1
      if (sb !== sa) return sb - sa
      return (a.search_rank ?? 9999) - (b.search_rank ?? 9999)
    })
    return list
  }, [players, liveOrFinal])

  if (loading) return <div className="py-10 text-center text-sm text-zinc-500">Loading fantasy…</div>
  if (error) return <div className="py-10 text-center text-sm text-lv-red">{error}</div>

  return (
    <div data-lounge-game-fantasy className="space-y-3 py-3">
      <div className="grid grid-cols-[minmax(0,1fr)_3.25rem_3.25rem] gap-x-2 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
        <span>Player</span>
        <span className="text-right">Game</span>
        <span className="text-right">Season</span>
      </div>

      <ul className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        {ranked.slice(0, 40).map((p, i) => {
          const proj = p.projected_ppr ?? p.fantasypros_pts
          const scored = p.game_ppr
          const season = p.season_ppr
          const detail = projYardLine(p)
          const gameMain = liveOrFinal ? scored : proj
          const showProjUnder = liveOrFinal && proj != null
          return (
            <li
              key={p.sleeper_id}
              className="grid grid-cols-[minmax(0,1fr)_3.25rem_3.25rem] items-center gap-x-2 px-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-5 shrink-0 text-center text-[12px] font-semibold tabular-nums text-zinc-500">
                  {i + 1}
                </span>
                <PlayerAvatar player={p} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <div className="truncate text-[14px] font-semibold text-zinc-100">{p.name}</div>
                    <InjuryPill status={p.injury_status} />
                  </div>
                  <div className="truncate text-[12px] text-zinc-500">
                    {p.position} · {p.team}
                    {detail ? ` · ${detail}` : ''}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[14px] font-bold tabular-nums text-zinc-100">{fmt(gameMain)}</div>
                {showProjUnder ? (
                  <div className="text-[10px] tabular-nums text-zinc-500">{fmt(proj)} proj</div>
                ) : (
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">PPR</div>
                )}
              </div>
              <div className="text-right">
                <div className="text-[14px] font-bold tabular-nums text-zinc-100">{fmt(season)}</div>
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">YTD</div>
              </div>
            </li>
          )
        })}
        {!ranked.length ? (
          <li className="px-3 py-8 text-center text-sm text-zinc-500">
            No Sleeper fantasy board for this game yet.
          </li>
        ) : null}
      </ul>
    </div>
  )
}
