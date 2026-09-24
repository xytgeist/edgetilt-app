import { useEffect, useMemo, useState } from 'react'
import { LoungeSportsTeamLogo, useLoungeSportsPillWashAndLogos } from '../loungeSportsPillPaint.jsx'

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

/** Fixed-frame headshot for H2H (same height both sides). Missing → bust silhouette.
 * Sources are landscape busts (~1.4:1). Use contain + bottom so shoulders aren't
 * sliced by a tall object-cover crop. */
function MatchupPortrait({ player, isDef }) {
  const [failed, setFailed] = useState(false)
  const src = player?.headshot_url
  const showPhoto = Boolean(src) && !failed && !isDef

  if (isDef) return null

  if (!showPhoto) {
    return (
      <img
        src="/sports/nfl/silhouettes/player-bust.png"
        alt=""
        className="h-full w-full object-contain object-bottom opacity-80"
      />
    )
  }

  return (
    <img
      src={src}
      alt=""
      className="h-full w-full object-contain object-bottom"
      onError={() => setFailed(true)}
    />
  )
}

function fmt(n, digits = 1) {
  if (n == null || !Number.isFinite(Number(n))) return '-'
  const v = Number(n)
  return Number.isInteger(v) || digits === 0 ? String(Math.round(v)) : v.toFixed(digits)
}

function fmtYd(n) {
  if (n == null || !Number.isFinite(Number(n))) return null
  return String(Math.round(Number(n)))
}

function seasonDetailLine(player) {
  const pos = String(player?.position || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  const parts = []
  if (pos === 'QB') {
    if (player.season_pass_yd != null) parts.push(`${fmt(player.season_pass_yd, 0)} pass yd`)
    if (player.season_pass_td != null) parts.push(`${fmt(player.season_pass_td, 0)} TD`)
    if (player.season_pass_int != null) parts.push(`${fmt(player.season_pass_int, 0)} INT`)
  } else if (pos === 'RB' || pos === 'FB' || pos === 'HB') {
    if (player.season_rush_yd != null) parts.push(`${fmt(player.season_rush_yd, 0)} rush yd`)
    if (player.season_rec != null) parts.push(`${fmt(player.season_rec, 0)} rec`)
    if (player.season_rec_yd != null && player.season_rec == null) {
      parts.push(`${fmt(player.season_rec_yd, 0)} rec yd`)
    }
  } else if (pos === 'WR' || pos === 'TE') {
    if (player.season_rec != null) parts.push(`${fmt(player.season_rec, 0)} rec`)
    if (player.season_rec_yd != null) parts.push(`${fmt(player.season_rec_yd, 0)} yd`)
    if (player.season_rec_td != null) parts.push(`${fmt(player.season_rec_td, 0)} TD`)
  } else if (pos === 'K' || pos === 'PK') {
    if (player.season_fgm != null || player.season_fgmiss != null) {
      const made = Number(player.season_fgm) || 0
      const miss = Number(player.season_fgmiss) || 0
      parts.push(`${made}/${made + miss} FG`)
    }
  } else if (pos === 'DEF' || pos === 'DST') {
    if (player.season_pts_allow != null) parts.push(`${fmt(player.season_pts_allow, 0)} allowed`)
    if (player.season_sack != null) {
      parts.push(`${fmt(player.season_sack, player.season_sack % 1 === 0 ? 0 : 1)} sack`)
    }
  } else {
    if (player.season_pass_yd != null) parts.push(`${fmt(player.season_pass_yd, 0)} pass yd`)
    if (player.season_rush_yd != null) parts.push(`${fmt(player.season_rush_yd, 0)} rush yd`)
    if (player.season_rec_yd != null) parts.push(`${fmt(player.season_rec_yd, 0)} rec yd`)
    else if (player.season_rec != null) parts.push(`${fmt(player.season_rec, 0)} rec`)
  }
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

/** Position tag colors inspired by the reference pills. */
function positionPillClass(pos) {
  switch (pos) {
    case 'QB':
      return 'bg-[#1a2a4a] text-[#7ec8ff] ring-1 ring-[#5aa0d8]/60'
    case 'RB':
      return 'bg-[#2a3230] text-[#7dffb3] ring-1 ring-[#3d4a45]/70'
    case 'WR':
      return 'bg-[#3a2218] text-[#ff9a5c] ring-1 ring-[#6a3a28]/55'
    case 'TE':
      return 'bg-[#3a1520] text-[#f0a8c0] ring-1 ring-[#6a3040]/50'
    case 'K':
      return 'bg-[#2a2818] text-[#f5d76e] ring-1 ring-[#6a5a28]/55'
    case 'DEF':
      return 'bg-[#1a2838] text-[#9ec4e8] ring-1 ring-[#3a5878]/55'
    default:
      return 'bg-zinc-800 text-zinc-200 ring-1 ring-zinc-600/50'
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

function shortDisplayName(name, { isDef = false, teamNickname = '' } = {}) {
  if (isDef) return String(teamNickname || 'DEF').toUpperCase()
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

/** Last token of “Atlanta Falcons” / side.mascot → “Falcons”. */
function teamNickname(side) {
  const mascot = String(side?.mascot || '').trim()
  if (mascot) return mascot
  const name = String(side?.name || '').trim()
  if (!name) return String(side?.abbrev || '').trim()
  const parts = name.split(/\s+/).filter(Boolean)
  return parts[parts.length - 1] || name
}

function seasonAvgLine(player) {
  const season = player?.season_ppr
  const gp = player?.season_gp
  const last = player?.last_week_ppr
  const avg =
    season != null && gp != null && Number(gp) > 0 ? Number(season) / Number(gp) : null
  if (last != null && avg != null) return `${fmt(last)} last · ${fmt(avg)} avg`
  if (last != null) return `${fmt(last)} last`
  if (avg != null) return `${fmt(avg)} avg`
  if (season != null) return `${fmt(season)} YTD`
  return null
}

function matchupStatLine(player, pos) {
  if (!player) return null
  const p = pos || normalizeFantasyPos(player)
  if (p === 'QB') {
    const pass = Number(player.season_pass_yd) || 0
    const rush = Number(player.season_rush_yd) || 0
    const tot =
      player.season_pass_yd != null || player.season_rush_yd != null ? pass + rush : null
    const td = (Number(player.season_pass_td) || 0) + (Number(player.season_rush_td) || 0)
    const hasTd = player.season_pass_td != null || player.season_rush_td != null
    if (tot == null && !hasTd) return null
    if (tot != null && hasTd) return `${fmtYd(tot)} Yds · ${fmt(td, 0)} TD`
    if (tot != null) return `${fmtYd(tot)} Yds`
    return `${fmt(td, 0)} TD`
  }
  if (p === 'RB' || p === 'WR' || p === 'TE') {
    const rush = Number(player.season_rush_yd) || 0
    const rec = Number(player.season_rec_yd) || 0
    const tot =
      player.season_rush_yd != null || player.season_rec_yd != null ? rush + rec : null
    const td = (Number(player.season_rush_td) || 0) + (Number(player.season_rec_td) || 0)
    const hasTd = player.season_rush_td != null || player.season_rec_td != null
    if (tot == null && !hasTd) return null
    if (tot != null && hasTd) return `${fmtYd(tot)} Yds · ${fmt(td, 0)} TD`
    if (tot != null) return `${fmtYd(tot)} Yds`
    return `${fmt(td, 0)} TD`
  }
  if (p === 'K') {
    const pts = player.season_ppr
    const made = player.season_fgm
    const miss = player.season_fgmiss
    const att =
      made != null || miss != null ? (Number(made) || 0) + (Number(miss) || 0) : null
    if (pts == null && att == null) return null
    if (pts != null && att != null) {
      return `${fmt(pts, 0)} Pts · ${fmt(made ?? 0, 0)}/${fmt(att, 0)} FGs`
    }
    if (pts != null) return `${fmt(pts, 0)} Pts`
    return `${fmt(made ?? 0, 0)}/${fmt(att, 0)} FGs`
  }
  if (p === 'DEF') {
    const pts = player.season_pts_allow
    const sack = player.season_sack
    if (pts == null && sack == null) return null
    if (pts != null && sack != null) {
      return `${fmt(pts, 0)} Allowed · ${fmt(sack, sack % 1 === 0 ? 0 : 1)} Sacks`
    }
    if (pts != null) return `${fmt(pts, 0)} Allowed`
    return `${fmt(sack, sack % 1 === 0 ? 0 : 1)} Sacks`
  }
  return null
}

/** Quartile color from league position rank (1 = best). */
function posRankTone(rank, of) {
  if (rank == null || rank <= 0) return null
  if (of == null || of <= 0) return 'text-zinc-400'
  const pct = rank / of
  if (pct <= 0.25) return 'text-emerald-400'
  if (pct > 0.75) return 'text-rose-400'
  return 'text-amber-300'
}

function PosRankMark({ player }) {
  const rank = player?.season_pos_rank
  const of = player?.season_pos_rank_of
  const tone = posRankTone(rank, of)
  if (rank == null || !tone) return null
  return (
    <span
      className={`shrink-0 font-semibold tabular-nums ${tone}`}
      title={of != null ? `#${rank} of ${of}` : `#${rank}`}
    >
      ({rank})
    </span>
  )
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
  slotPos,
  align,
  washColor,
  teamSide,
  logoTreatment,
  liveOrFinal,
  meshSrc,
}) {
  const isDef = slotPos === 'DEF' || normalizeFantasyPos(player) === 'DEF'
  const proj = player?.projected_ppr ?? player?.fantasypros_pts
  const scored = player?.game_ppr
  const main = liveOrFinal ? scored : proj
  const showProjUnder = liveOrFinal && proj != null
  const empty = !player
  const nick = teamNickname(teamSide)
  const stats = matchupStatLine(player, slotPos)
  const avg = seasonAvgLine(player)
  const logoOpacity = isDef ? 0.82 : 0.3

  return (
    <div
      className={`relative flex min-w-0 flex-1 flex-col ${
        align === 'right' ? 'items-end text-right' : 'items-start text-left'
      }`}
    >
      <div
        data-fantasy-h2h-wash
        className="relative h-[8.2rem] w-full overflow-visible"
        style={{ '--fantasy-wash': washColor || '#3f3f46' }}
      >
        <span className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
          <img data-fantasy-h2h-mesh src={meshSrc} alt="" />
          <span data-fantasy-h2h-tint />
        </span>
        <span
          className={`pointer-events-none absolute top-1/2 z-[1] -translate-y-1/2 ${
            isDef
              ? 'left-1/2 -translate-x-1/2'
              : align === 'right'
                ? '-right-[18%]'
                : '-left-[18%]'
          }`}
          style={{ opacity: logoOpacity }}
          aria-hidden="true"
        >
          <LoungeSportsTeamLogo side={teamSide} treatment={logoTreatment} size={168} />
        </span>
        <span
          className={`absolute top-2 z-[4] rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${positionPillClass(
            slotPos,
          )} ${align === 'right' ? 'right-2' : 'left-2'}`}
        >
          {slotLabel}
        </span>
        {!empty && !isDef ? (
          <div
            className={`pointer-events-none absolute z-[2] flex h-[8.75rem] w-full items-end ${
              align === 'right' ? 'justify-start pl-0.5' : 'justify-end pr-0.5'
            }`}
            style={{ bottom: '-10%' }}
          >
            {/* Wide enough for landscape NFL/ESPN busts (~1.4:1) without side-slicing shoulders. */}
            <div className="h-[8.75rem] w-[9.5rem] overflow-hidden">
              <MatchupPortrait player={player} isDef={false} />
            </div>
          </div>
        ) : null}
        {empty ? (
          <div className="absolute inset-0 z-[2] flex items-center justify-center text-[12px] font-semibold text-white/50">
            —
          </div>
        ) : null}
      </div>

      <div className="relative z-[3] w-full bg-zinc-900/95 px-2.5 pb-3 pt-2">
        <div className={`flex items-start gap-1.5 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
          <div className="min-w-0 flex-1">
            <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
              <div className="truncate text-[13px] font-bold uppercase tracking-wide text-zinc-50">
                {empty ? 'TBD' : shortDisplayName(player.name, { isDef, teamNickname: nick })}
              </div>
              {!empty && !isDef ? <InjuryPill status={player.injury_status} /> : null}
            </div>
            {stats || (!empty && player?.season_pos_rank != null) ? (
              <div
                className={`mt-0.5 flex min-w-0 items-center gap-1 text-[11px] font-medium text-zinc-400 ${
                  align === 'right' ? 'justify-end' : ''
                }`}
              >
                {stats ? <span className="truncate">{stats}</span> : null}
                {!empty && player?.season_pos_rank != null ? <PosRankMark player={player} /> : null}
              </div>
            ) : null}
            {avg ? <div className="mt-0.5 text-[11px] font-medium text-zinc-400">{avg}</div> : null}
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
  const { awayColor, homeColor, awayTreatment, homeTreatment } = useLoungeSportsPillWashAndLogos(game)

  useEffect(() => {
    setIndex(0)
  }, [matchups])

  const safeIndex = matchups.length ? Math.min(index, matchups.length - 1) : 0
  const current = matchups[safeIndex] || null

  if (!current) return null

  const awaySide = game?.away || { abbrev: '' }
  const homeSide = game?.home || { abbrev: '' }

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
            slotPos={current.pos}
            align="left"
            washColor={awayColor}
            teamSide={awaySide}
            logoTreatment={awayTreatment}
            liveOrFinal={liveOrFinal}
            meshSrc="/sports/nfl/textures/jersey-mesh-1.jpg"
          />
          <div className="w-px shrink-0 self-stretch bg-zinc-800" aria-hidden="true" />
          <MatchupHalf
            player={current.home}
            slotLabel={current.label}
            slotPos={current.pos}
            align="right"
            washColor={homeColor}
            teamSide={homeSide}
            logoTreatment={homeTreatment}
            liveOrFinal={liveOrFinal}
            meshSrc="/sports/nfl/textures/jersey-mesh-2.jpg"
          />
        </div>

        {matchups.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous matchup"
              onClick={() => go(-1)}
              className="absolute left-1.5 top-[4.5rem] z-[4] flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/15 backdrop-blur-sm"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next matchup"
              onClick={() => go(1)}
              className="absolute right-1.5 top-[4.5rem] z-[4] flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/15 backdrop-blur-sm"
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
              const detail = seasonDetailLine(p)
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
