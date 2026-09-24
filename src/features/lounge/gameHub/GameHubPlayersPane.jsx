import { useEffect, useMemo, useState } from 'react'
import { KalshiPlayerPropsBoard } from './GameHubKalshiProps.jsx'
import { injuryTag } from './GameHubFantasyPane.jsx'

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

const POSITION_ORDER = { QB: 0, RB: 1, WR: 2, TE: 3 }

function positionRank(pos) {
  const p = String(pos || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  if (p in POSITION_ORDER) return POSITION_ORDER[p]
  if (p === 'FB' || p === 'HB') return POSITION_ORDER.RB
  return 50
}

function fmtStat(n, digits = 0) {
  if (n == null || !Number.isFinite(Number(n))) return null
  const v = Number(n)
  return Number.isInteger(v) || digits === 0 ? String(Math.round(v)) : v.toFixed(digits)
}

/** Season counting line for roster (not weekly projections). */
function seasonStatLine(player, headline) {
  const parts = []
  const pass = fmtStat(player.season_pass_yd)
  const rush = fmtStat(player.season_rush_yd)
  const recYd = fmtStat(player.season_rec_yd)
  const rec = fmtStat(player.season_rec, 0)
  const gp = fmtStat(player.season_gp)
  const skip = headline?.label
  if (pass && skip !== 'Pass yd') parts.push(`${pass} pass yd`)
  if (rush && skip !== 'Rush yd') parts.push(`${rush} rush yd`)
  if (recYd && skip !== 'Rec yd') parts.push(`${recYd} rec yd`)
  if (rec) parts.push(`${rec} rec`)
  if (gp) parts.push(`${gp} gp`)
  return parts.join(' · ')
}

/** Position-primary season number for the right rail. */
function seasonHeadline(player) {
  const pos = String(player.position || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  if (pos === 'QB' && player.season_pass_yd != null) {
    return { value: fmtStat(player.season_pass_yd), label: 'Pass yd' }
  }
  if ((pos === 'RB' || pos === 'FB' || pos === 'HB') && player.season_rush_yd != null) {
    return { value: fmtStat(player.season_rush_yd), label: 'Rush yd' }
  }
  if ((pos === 'WR' || pos === 'TE') && player.season_rec_yd != null) {
    return { value: fmtStat(player.season_rec_yd), label: 'Rec yd' }
  }
  if (player.season_pass_yd != null) {
    return { value: fmtStat(player.season_pass_yd), label: 'Pass yd' }
  }
  if (player.season_rush_yd != null) {
    return { value: fmtStat(player.season_rush_yd), label: 'Rush yd' }
  }
  if (player.season_rec_yd != null) {
    return { value: fmtStat(player.season_rec_yd), label: 'Rec yd' }
  }
  if (player.season_rec != null) {
    return { value: fmtStat(player.season_rec, 1), label: 'Rec' }
  }
  return null
}

function seasonPrimaryYards(player) {
  const pos = String(player.position || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  if (pos === 'QB') return Number(player.season_pass_yd) || 0
  if (pos === 'RB' || pos === 'FB' || pos === 'HB') return Number(player.season_rush_yd) || 0
  if (pos === 'WR' || pos === 'TE') return Number(player.season_rec_yd) || 0
  return (
    Number(player.season_pass_yd) ||
    Number(player.season_rush_yd) ||
    Number(player.season_rec_yd) ||
    0
  )
}

function normalizePos(pos) {
  const p = String(pos || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  if (p === 'FB' || p === 'HB') return 'RB'
  return p
}

function RosterBoard({ players }) {
  const sorted = useMemo(() => {
    const list = [...(players || [])]
    list.sort((a, b) => {
      const sa = a.is_starter === true ? 0 : 1
      const sb = b.is_starter === true ? 0 : 1
      if (sa !== sb) return sa - sb
      const pa = positionRank(a.position)
      const pb = positionRank(b.position)
      if (pa !== pb) return pa - pb
      const da = a.depth_chart_order != null ? Number(a.depth_chart_order) : 99
      const db = b.depth_chart_order != null ? Number(b.depth_chart_order) : 99
      if (da !== db) return da - db
      const ya = seasonPrimaryYards(a)
      const yb = seasonPrimaryYards(b)
      if (yb !== ya) return yb - ya
      return (a.search_rank ?? 9999) - (b.search_rank ?? 9999)
    })
    return list
  }, [players])

  if (!sorted.length) {
    return <div className="py-6 text-center text-sm text-zinc-500">No players for that filter.</div>
  }

  return (
    <ul className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      {sorted.map((p) => {
        const headline = seasonHeadline(p)
        const detail = seasonStatLine(p, headline)
        return (
          <li key={p.sleeper_id} className="flex items-center gap-3 px-3 py-2.5">
            <PlayerAvatar player={p} />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <div className="truncate text-[14px] font-semibold text-zinc-100">{p.name}</div>
                <InjuryPill status={p.injury_status} />
              </div>
              <div className="truncate text-[12px] text-zinc-500">
                {p.position || '-'} · {p.team}
                {p.is_starter ? ' · Starter' : ''}
                {detail ? ` · ${detail}` : ''}
              </div>
            </div>
            {headline ? (
              <div className="shrink-0 text-right">
                <div className="text-[14px] font-bold tabular-nums text-zinc-100">{headline.value}</div>
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">{headline.label}</div>
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

const POSITION_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'QB', label: 'QB' },
  { id: 'RB', label: 'RB' },
  { id: 'WR', label: 'WR' },
  { id: 'TE', label: 'TE' },
]

/**
 * Players hub surface: Roster + Kalshi/Poly player props.
 */
export default function GameHubPlayersPane({
  players,
  props,
  loading,
  error,
  defaultView = 'roster',
}) {
  const [view, setView] = useState(defaultView === 'props' ? 'props' : 'roster')
  const [position, setPosition] = useState('all')

  useEffect(() => {
    setView(defaultView === 'props' ? 'props' : 'roster')
  }, [defaultView])

  const filteredPlayers = useMemo(() => {
    if (position === 'all') return players || []
    return (players || []).filter((p) => normalizePos(p.position) === position)
  }, [players, position])

  const filteredProps = useMemo(() => {
    if (position === 'all') return props || []
    const names = new Set(
      (players || [])
        .filter((p) => normalizePos(p.position) === position)
        .map((p) => String(p.name || '').trim().toLowerCase())
        .filter(Boolean),
    )
    return (props || []).filter((p) => {
      const name = String(p.player_name || '').trim().toLowerCase()
      return name && names.has(name)
    })
  }, [props, players, position])

  if (loading) return <div className="py-10 text-center text-sm text-zinc-500">Loading players…</div>
  if (error) return <div className="py-10 text-center text-sm text-lv-red">{error}</div>

  return (
    <div data-lounge-game-players className="space-y-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-full bg-zinc-900 p-0.5">
          {[
            { id: 'roster', label: 'Roster' },
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
        <label className="ml-auto inline-flex items-center gap-1.5">
          <span className="sr-only">Position</span>
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            className="rounded-full border border-zinc-700 bg-zinc-900 py-1 pl-3 pr-8 text-[12px] font-semibold text-zinc-200 outline-none focus:border-zinc-500"
          >
            {POSITION_FILTERS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.id === 'all' ? 'All positions' : opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {view === 'roster' ? (
        !players?.length ? (
          <div className="py-10 text-center text-sm text-zinc-500">No roster data for this matchup yet.</div>
        ) : (
          <RosterBoard players={filteredPlayers} />
        )
      ) : null}

      {view === 'props' ? (
        <KalshiPlayerPropsBoard props={filteredProps} players={filteredPlayers} />
      ) : null}
    </div>
  )
}
