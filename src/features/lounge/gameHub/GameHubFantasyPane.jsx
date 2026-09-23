import { useMemo, useState } from 'react'
import { kalshiCents } from './gameHubFormatters.js'

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
  if (n == null || !Number.isFinite(Number(n))) return '—'
  const v = Number(n)
  return Number.isInteger(v) || digits === 0 ? String(Math.round(v)) : v.toFixed(digits)
}

function yardLine(player, mode) {
  if (mode === 'weekly') {
    const parts = []
    if (player.projected_pass_yd != null) parts.push(`${fmt(player.projected_pass_yd, 0)} pass`)
    if (player.projected_rush_yd != null) parts.push(`${fmt(player.projected_rush_yd, 0)} rush`)
    if (player.projected_rec_yd != null) parts.push(`${fmt(player.projected_rec_yd, 0)} rec`)
    else if (player.projected_rec != null) parts.push(`${fmt(player.projected_rec, 1)} rec`)
    return parts.join(' · ')
  }
  const parts = []
  if (player.season_pass_yd != null) parts.push(`${fmt(player.season_pass_yd, 0)} pass`)
  if (player.season_rush_yd != null) parts.push(`${fmt(player.season_rush_yd, 0)} rush`)
  if (player.season_rec_yd != null) parts.push(`${fmt(player.season_rec_yd, 0)} rec`)
  else if (player.season_rec != null) parts.push(`${fmt(player.season_rec, 1)} rec`)
  if (player.season_gp != null) parts.push(`${fmt(player.season_gp, 0)} gp`)
  return parts.join(' · ')
}

/**
 * Sleeper weekly (DFF) + season fantasy stats, plus Kalshi props (separate).
 */
export default function GameHubFantasyPane({
  players,
  props,
  loading,
  error,
  season,
  week,
  sources,
}) {
  const [view, setView] = useState('weekly')

  const ranked = useMemo(() => {
    const list = [...(players || [])].filter((p) =>
      ['QB', 'RB', 'WR', 'TE'].includes(String(p.position || '').toUpperCase()),
    )
    list.sort((a, b) => {
      if (view === 'season') {
        const sa = a.season_ppr ?? -1
        const sb = b.season_ppr ?? -1
        if (sb !== sa) return sb - sa
      } else {
        const pa = a.projected_ppr ?? a.fantasypros_pts ?? -1
        const pb = b.projected_ppr ?? b.fantasypros_pts ?? -1
        if (pb !== pa) return pb - pa
      }
      return (a.search_rank ?? 9999) - (b.search_rank ?? 9999)
    })
    return list
  }, [players, view])

  if (loading) return <div className="py-10 text-center text-sm text-zinc-500">Loading fantasy…</div>
  if (error) return <div className="py-10 text-center text-sm text-lv-red">{error}</div>

  const hasKalshi = Array.isArray(sources) && sources.includes('kalshi')
  const hasSleeper =
    Array.isArray(sources) &&
    (sources.includes('sleeper_projections') || sources.includes('sleeper_season_stats'))

  return (
    <div data-lounge-game-fantasy className="space-y-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[12px] text-zinc-500">
          {season && week != null ? `Week ${week} · ${season}` : 'This matchup'}
          {hasSleeper ? ' · Sleeper' : ''}
          {hasKalshi ? ' · Kalshi props' : ''}
        </div>
        <div className="flex gap-1 rounded-full bg-zinc-900 p-0.5">
          {[
            { id: 'weekly', label: 'Weekly' },
            { id: 'season', label: 'Season' },
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

      {view === 'props' ? (
        <div className="space-y-2">
          {(props || []).map((prop) => (
            <a
              key={prop.ticker}
              href={prop.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 px-3 py-3 touch-manipulation active:opacity-90"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Kalshi · {prop.series.replace(/^KXNFL/, '')}
                  </div>
                  <div className="mt-0.5 text-[14px] font-semibold leading-snug text-zinc-100">
                    {prop.title}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[16px] font-bold tabular-nums text-emerald-400">
                    {kalshiCents(prop.yes_ask ?? prop.yes_bid ?? prop.last)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">Yes</div>
                </div>
              </div>
            </a>
          ))}
          {!props?.length ? (
            <div className="py-8 text-center text-sm text-zinc-500">
              No open Kalshi player props for this matchup right now.
            </div>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          {ranked.slice(0, 40).map((p, i) => {
            const pts = view === 'season' ? p.season_ppr : (p.projected_ppr ?? p.fantasypros_pts)
            const detail = yardLine(p, view)
            return (
              <li key={p.sleeper_id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="w-5 shrink-0 text-center text-[12px] font-semibold tabular-nums text-zinc-500">
                  {i + 1}
                </span>
                <PlayerAvatar player={p} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-zinc-100">{p.name}</div>
                  <div className="truncate text-[12px] text-zinc-500">
                    {p.position} · {p.team}
                    {detail ? ` · ${detail}` : ''}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[14px] font-bold tabular-nums text-zinc-100">{fmt(pts)}</div>
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                    {view === 'season' ? 'YTD PPR' : 'Proj PPR'}
                  </div>
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
      )}
    </div>
  )
}
