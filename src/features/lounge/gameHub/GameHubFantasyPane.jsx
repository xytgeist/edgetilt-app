import { useEffect, useMemo, useState } from 'react'
import { NFL_TEAM_CATALOG } from '../loungeSportsMatch.js'
import { LoungeSportsTeamLogo } from '../loungeSportsPillPaint.jsx'

function PlayerAvatar({ player, size = 'sm' }) {
  const [failed, setFailed] = useState(false)
  const dim = size === 'lg' ? 'h-full w-full' : 'h-9 w-9'
  const letter = String(player?.name || '?').slice(0, 1).toUpperCase()
  if (!player?.headshot_url || failed) {
    if (size === 'lg') {
      return (
        <span className="flex h-full w-full items-center justify-center text-4xl font-bold text-white/70">
          {letter}
        </span>
      )
    }
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
      className={`${dim} shrink-0 object-cover object-top ${size === 'lg' ? '' : 'rounded-full bg-zinc-800'}`}
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

const TEAM_BY_ABBREV = new Map(NFL_TEAM_CATALOG.map((row) => [row.abbrev, row]))

function catalogForTeam(abbrev) {
  const key = String(abbrev || '')
    .trim()
    .toUpperCase()
  if (!key) return null
  if (key === 'JAC') return TEAM_BY_ABBREV.get('JAX') || null
  if (key === 'WSH') return TEAM_BY_ABBREV.get('WAS') || null
  return TEAM_BY_ABBREV.get(key) || null
}

function teamColor(abbrev) {
  return catalogForTeam(abbrev)?.color || '#3f3f46'
}

function teamSideFromAbbrev(abbrev, gameSide) {
  const row = catalogForTeam(abbrev)
  return {
    abbrev: row?.abbrev || abbrev || gameSide?.abbrev || '',
    logo: gameSide?.logo || (row ? `/sports/nfl/logos/${row.abbrev}.png` : ''),
    logoLight: gameSide?.logoLight || (row ? `/sports/nfl/logos/${row.abbrev}-light.png` : ''),
    name: gameSide?.name || row?.names?.[0] || abbrev || '',
  }
}

function normalizeFantasyPos(player) {
  const raw = String(player?.position || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  if (raw === 'FB' || raw === 'HB') return 'RB'
  if (raw === 'DST' || raw === 'D') return 'DEF'
  if (raw === 'PK') return 'K'
  if (['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(raw)) return raw
  const fantasy = Array.isArray(player?.fantasy_positions)
    ? player.fantasy_positions.map((x) => String(x).toUpperCase())
    : []
  for (const fp of fantasy) {
    if (fp === 'DST' || fp === 'DEF') return 'DEF'
    if (fp === 'K' || fp === 'PK') return 'K'
    if (['QB', 'RB', 'WR', 'TE'].includes(fp)) return fp
  }
  return raw
}

function shortDisplayName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return '—'
  if (parts.length === 1) return parts[0].toUpperCase()
  const first = parts[0].charAt(0).toUpperCase()
  const rest = parts.slice(1).join(' ').toUpperCase()
  return `${first}. ${rest}`
}

function seasonAvgLine(player) {
  const season = player?.season_ppr
  const gp = player?.season_gp
  if (season != null && gp != null && Number(gp) > 0) {
    return `${fmt(Number(season) / Number(gp))} avg`
  }
  if (season != null) return `${fmt(season)} YTD`
  return null
}

const MATCHUP_SLOTS = [
  { id: 'QB', label: 'QB', pos: 'QB', depth: 1 },
  { id: 'RB1', label: 'RB1', pos: 'RB', depth: 1 },
  { id: 'WR1', label: 'WR1', pos: 'WR', depth: 1 },
  { id: 'TE', label: 'TE', pos: 'TE', depth: 1 },
  { id: 'K', label: 'K', pos: 'K', depth: 1 },
  { id: 'DEF', label: 'DEF', pos: 'DEF', depth: 1 },
]

function rankSideAtPos(players, side, pos) {
  return (players || [])
    .filter((p) => p.side === side && normalizeFantasyPos(p) === pos)
    .sort((a, b) => {
      const da = a.depth_chart_order != null ? Number(a.depth_chart_order) : 99
      const db = b.depth_chart_order != null ? Number(b.depth_chart_order) : 99
      if (da !== db) return da - db
      const pa = a.projected_ppr ?? a.fantasypros_pts ?? -1
      const pb = b.projected_ppr ?? b.fantasypros_pts ?? -1
      if (pb !== pa) return pb - pa
      return (a.search_rank ?? 9999) - (b.search_rank ?? 9999)
    })
}

function pickDepth(ranked, depth) {
  if (!ranked.length) return null
  const byDepth = ranked.find((p) => Number(p.depth_chart_order) === depth)
  if (byDepth) return byDepth
  return ranked[depth - 1] || null
}

function MatchupHalf({
  player,
  slotLabel,
  align,
  teamAbbrev,
  oppAbbrev,
  teamSide,
  liveOrFinal,
}) {
  const color = teamColor(teamAbbrev)
  const isDef = normalizeFantasyPos(player) === 'DEF' || slotLabel === 'DEF'
  const proj = player?.projected_ppr ?? player?.fantasypros_pts
  const scored = player?.game_ppr
  const main = liveOrFinal ? scored : proj
  const showProjUnder = liveOrFinal && proj != null
  const avg = seasonAvgLine(player)
  const empty = !player

  return (
    <div className={`relative flex min-w-0 flex-1 flex-col ${align === 'right' ? 'items-end text-right' : 'items-start text-left'}`}>
      <div
        className="relative h-[9.5rem] w-full overflow-hidden"
        style={{
          background: `linear-gradient(180deg, ${color}cc 0%, ${color}66 45%, #18181b 100%)`,
        }}
      >
        <span
          className={`pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.18] ${
            align === 'right' ? 'translate-x-[12%]' : '-translate-x-[12%]'
          }`}
          aria-hidden="true"
        >
          <LoungeSportsTeamLogo side={teamSide} treatment="halo" size={120} />
        </span>
        <span
          className={`absolute top-2 z-[2] rounded-md bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${
            align === 'right' ? 'right-2' : 'left-2'
          }`}
        >
          {slotLabel}
        </span>
        {!empty ? (
          <div
            className={`absolute bottom-0 z-[1] h-[8.75rem] w-[7.5rem] ${
              align === 'right' ? 'right-1' : 'left-1'
            }`}
          >
            {isDef || !player.headshot_url ? (
              <div className="flex h-full w-full items-end justify-center pb-2">
                <LoungeSportsTeamLogo side={teamSide} treatment="halo" size={72} />
              </div>
            ) : (
              <PlayerAvatar player={player} size="lg" />
            )}
          </div>
        ) : (
          <div className="absolute inset-0 z-[1] flex items-center justify-center text-[12px] font-semibold text-white/50">
            —
          </div>
        )}
      </div>

      <div className="relative z-[2] w-full bg-zinc-900/95 px-2.5 pb-3 pt-2">
        <div className={`flex items-start gap-1.5 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
          <div className="min-w-0 flex-1">
            <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
              <div className="truncate text-[13px] font-bold uppercase tracking-wide text-zinc-50">
                {empty ? 'TBD' : shortDisplayName(player.name)}
              </div>
              {!empty ? <InjuryPill status={player.injury_status} /> : null}
            </div>
            <div className="mt-0.5 text-[11px] font-medium text-zinc-400">
              {teamAbbrev || '—'} vs. {oppAbbrev || '—'}
            </div>
            {avg ? <div className="mt-0.5 text-[11px] text-zinc-500">{avg}</div> : null}
          </div>
          <div className="flex h-[3.25rem] w-[3.25rem] shrink-0 flex-col items-center justify-center rounded-xl bg-zinc-800 ring-1 ring-zinc-700/80">
            <div className="text-[15px] font-bold tabular-nums leading-none text-zinc-50">{fmt(main)}</div>
            {showProjUnder ? (
              <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-wide text-zinc-500">
                {fmt(proj)} proj
              </div>
            ) : (
              <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-wide text-zinc-500">
                {liveOrFinal ? 'PPR' : 'PROJ'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function FantasyMatchupCarousel({ matchups, game, liveOrFinal }) {
  const [index, setIndex] = useState(0)
  const [touchX, setTouchX] = useState(null)

  useEffect(() => {
    setIndex(0)
  }, [matchups])

  const safeIndex = matchups.length ? Math.min(index, matchups.length - 1) : 0
  const current = matchups[safeIndex] || null

  if (!current) return null

  const awayAbbrev = game?.away?.abbrev || ''
  const homeAbbrev = game?.home?.abbrev || ''
  const awaySide = teamSideFromAbbrev(awayAbbrev, game?.away)
  const homeSide = teamSideFromAbbrev(homeAbbrev, game?.home)

  const go = (dir) => {
    if (!matchups.length) return
    setIndex((i) => (i + dir + matchups.length) % matchups.length)
  }

  return (
    <div data-fantasy-h2h className="space-y-2">
      <div
        className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950"
        onTouchStart={(e) => setTouchX(e.changedTouches?.[0]?.clientX ?? null)}
        onTouchEnd={(e) => {
          if (touchX == null) return
          const x = e.changedTouches?.[0]?.clientX
          if (x == null) return
          const dx = x - touchX
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
          setTouchX(null)
        }}
      >
        <div className="flex">
          <MatchupHalf
            player={current.away}
            slotLabel={current.label}
            align="left"
            teamAbbrev={awayAbbrev}
            oppAbbrev={homeAbbrev}
            teamSide={awaySide}
            liveOrFinal={liveOrFinal}
          />
          <div className="w-px shrink-0 self-stretch bg-zinc-800" aria-hidden="true" />
          <MatchupHalf
            player={current.home}
            slotLabel={current.label}
            align="right"
            teamAbbrev={homeAbbrev}
            oppAbbrev={awayAbbrev}
            teamSide={homeSide}
            liveOrFinal={liveOrFinal}
          />
        </div>

        {matchups.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous matchup"
              onClick={() => go(-1)}
              className="absolute left-1.5 top-[4.25rem] z-[3] flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/15 backdrop-blur-sm"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next matchup"
              onClick={() => go(1)}
              className="absolute right-1.5 top-[4.25rem] z-[3] flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/15 backdrop-blur-sm"
            >
              ›
            </button>
          </>
        ) : null}
      </div>

      {matchups.length > 1 ? (
        <div className="flex items-center justify-center gap-1.5">
          {matchups.map((m, i) => (
            <button
              key={m.id}
              type="button"
              aria-label={m.label}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === safeIndex ? 'w-4 bg-zinc-200' : 'w-1.5 bg-zinc-700'
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Sleeper game PPR + season on each row.
 * Pregame: Game = projection. Live/final: Game = scored, proj tucked under.
 * Top: H2H carousel for QB / RB1 / WR1 / TE / K / DEF.
 */
export default function GameHubFantasyPane({ players, loading, error, gameStatus = 'pre', game = null }) {
  const liveOrFinal = gameStatus === 'in' || gameStatus === 'post'

  const { matchups, rest } = useMemo(() => {
    const list = players || []
    const slots = []
    const featuredIds = new Set()

    for (const slot of MATCHUP_SLOTS) {
      const awayRanked = rankSideAtPos(list, 'away', slot.pos)
      const homeRanked = rankSideAtPos(list, 'home', slot.pos)
      const away = pickDepth(awayRanked, slot.depth)
      const home = pickDepth(homeRanked, slot.depth)
      if (!away && !home) continue
      if (away?.sleeper_id) featuredIds.add(String(away.sleeper_id))
      if (home?.sleeper_id) featuredIds.add(String(home.sleeper_id))
      slots.push({ ...slot, away, home })
    }

    const board = list
      .filter((p) => ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(normalizeFantasyPos(p)))
      .filter((p) => !featuredIds.has(String(p.sleeper_id)))
    board.sort((a, b) => {
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

    return { matchups: slots, rest: board }
  }, [players, liveOrFinal])

  if (loading) return <div className="py-10 text-center text-sm text-zinc-500">Loading fantasy…</div>
  if (error) return <div className="py-10 text-center text-sm text-lv-red">{error}</div>

  if (!matchups.length && !rest.length) {
    return (
      <div data-lounge-game-fantasy className="py-10 text-center text-sm text-zinc-500">
        No Sleeper fantasy board for this game yet.
      </div>
    )
  }

  return (
    <div data-lounge-game-fantasy className="space-y-4 py-3">
      <FantasyMatchupCarousel matchups={matchups} game={game} liveOrFinal={liveOrFinal} />

      {rest.length ? (
        <div className="space-y-2">
          <div className="grid grid-cols-[minmax(0,1fr)_3.25rem_3.25rem] gap-x-2 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
            <span>Rest of board</span>
            <span className="text-right">Game</span>
            <span className="text-right">Season</span>
          </div>

          <ul className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
            {rest.slice(0, 40).map((p) => {
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
          </ul>
        </div>
      ) : null}
    </div>
  )
}
