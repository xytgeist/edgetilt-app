import { useMemo, useState } from 'react'
import { KalshiPlayerPropsBoard } from './GameHubKalshiProps.jsx'
import { FantasyMatchupStack, GoToFantasyButton } from './GameHubFantasyPane.jsx'
import { getFantasyPinRole, toggleFantasyPin, useFantasyPins } from './gameHubFantasyPins.js'
import { useHeadshotSrc } from '../../../utils/playerHeadshot.js'
import { scoreLine } from '../../fantasy/fantasyBoxScore.js'
import { boxForPlayer, indexPlayerBox } from './gameHubPropStats.js'
import { rosterBench, rosterBenchLabel, rosterLeaguePill, rosterLeagueTitle, useLeagueOpponents, useRosterLeagues } from './gameHubRosterLeagues.js'
import { DEFAULT_NBA_SCORING, useNbaLeagueRules } from './gameHubNbaLeagues.js'
import GameHubLeagueChips from './GameHubLeagueChips.jsx'
import { useGameLeagueChips } from './useGameLeagueChips.js'

/** ESPN box (`player_box` stats bag) → Sleeper NBA stat keys, with the double / triple-double flags Sleeper scores. */
function nbaLineFromBox(box) {
  const s = box?.stats || {}
  const n = (key) => Number(s[key]) || 0
  const line = {
    pts: n('points'),
    reb: n('rebounds'),
    ast: n('assists'),
    stl: n('steals'),
    blk: n('blocks'),
    to: n('turnovers'),
    tpm: n('threePointFieldGoalsMade'),
    fgm: n('fieldGoalsMade'),
    fga: n('fieldGoalsAttempted'),
    ftm: n('freeThrowsMade'),
    fta: n('freeThrowsAttempted'),
    oreb: n('offensiveRebounds'),
    dreb: n('defensiveRebounds'),
  }
  const cats = ['pts', 'reb', 'ast', 'stl', 'blk'].filter((key) => line[key] >= 10).length
  if (cats >= 2) line.dd = 1
  if (cats >= 3) line.td = 1
  if (line.pts >= 40) line.bonus_pt_40p = 1
  if (line.pts >= 50) line.bonus_pt_50p = 1
  return line
}

function fmt(n, digits = 1) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  const v = Number(n)
  return Number.isInteger(v) ? String(v) : v.toFixed(digits)
}

function statusOf(game, live) {
  if (game?.status === 'post') return 'post'
  if (game?.status === 'in' || Number(live?.period) >= 1) return 'in'
  return 'pre'
}

function Avatar({ player }) {
  const shot = useHeadshotSrc(player?.headshot_url, 96)
  const initials = String(player?.name || '')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
  return shot.src && !shot.failed ? (
    <img
      src={shot.src}
      alt=""
      onError={shot.onError}
      loading="lazy"
      className="h-9 w-9 shrink-0 rounded-full bg-zinc-800 object-cover object-top"
    />
  ) : (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-bold text-zinc-400">
      {initials}
    </span>
  )
}

function InjuryTag({ status }) {
  const s = String(status || '').trim()
  if (!s) return null
  const out = /^(out|ir|inj|sus)/i.test(s)
  return (
    <span
      className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase ${
        out ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'
      }`}
    >
      {s.length > 4 ? s.slice(0, 4) : s}
    </span>
  )
}

function useBoxIndex(playerBox, status) {
  return useMemo(() => (status === 'pre' ? null : indexPlayerBox(playerBox)), [playerBox, status])
}

/**
 * NBA Players tab: Roster (box PTS / REB / AST once tipped, season average else projection before) and Props
 * (Kalshi + Polymarket player strike markets, same board as NFL).
 */
export function GameHubNbaPlayersPane({ players, props = [], loading, error, game, live = null, playerBox = null }) {
  const status = statusOf(game, live)
  const boxIndex = useBoxIndex(playerBox, status)
  const boxLoaded = Boolean(boxIndex?.any)
  const [view, setView] = useState('roster')
  if (loading) return <div className="py-10 text-center text-sm text-zinc-500">Loading players…</div>
  if (error) return <div className="py-10 text-center text-sm text-lv-red">{error}</div>
  const list = players || []
  if (!list.length) return <div className="py-10 text-center text-sm text-zinc-500">No roster for this game yet.</div>

  return (
    <div data-lounge-game-players className="space-y-4 py-3">
      <div className="inline-flex gap-1 rounded-full bg-zinc-900 p-0.5">
        {[
          { id: 'roster', label: 'Roster' },
          { id: 'props', label: 'Props' },
        ].map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setView(opt.id)}
            className={`rounded-full px-3 py-1 text-[12px] font-semibold ${view === opt.id ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {view === 'props' ? (
        <KalshiPlayerPropsBoard props={props} players={list} game={game} live={live} playerBox={playerBox} />
      ) : null}
      {view === 'props' ? null : ['away', 'home'].map((side) => {
        const team = game?.[side]
        const rows = list.filter((p) => p.side === side).slice(0, 13)
        if (!rows.length) return null
        const anySeason = rows.some((p) => p.season_line)
        const mode = boxLoaded ? 'box' : anySeason ? 'avg' : 'proj'
        const sorted = boxLoaded
          ? [...rows].sort((a, b) => {
              const ma = Number(boxForPlayer(boxIndex, a)?.stats?.minutes) || 0
              const mb = Number(boxForPlayer(boxIndex, b)?.stats?.minutes) || 0
              return mb - ma
            })
          : rows
        return (
          <div key={side} className="space-y-2">
            <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_2.5rem_2.5rem] gap-x-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              <span className="truncate">
                {team?.abbrev || side} {mode === 'box' ? '' : mode === 'avg' ? '· season avg' : '· projected'}
              </span>
              <span className="text-right">Pts</span>
              <span className="text-right">Reb</span>
              <span className="text-right">Ast</span>
            </div>
            <ul data-roster-list className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
              {sorted.map((p) => {
                const box = boxLoaded ? boxForPlayer(boxIndex, p) : null
                const line = mode === 'box' ? (box ? nbaLineFromBox(box) : null) : mode === 'avg' ? p.season_line : p.proj_line
                const mins = box?.stats?.minutes
                return (
                  <li key={p.sleeper_id} className="grid grid-cols-[minmax(0,1fr)_2.5rem_2.5rem_2.5rem] items-center gap-x-1.5 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar player={p} />
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-[14px] font-semibold text-zinc-100">{p.name}</span>
                          <InjuryTag status={p.injury_status} />
                        </div>
                        <div className="truncate text-[12px] text-zinc-500">
                          {p.position}
                          {mode === 'box' ? (box ? ` · ${fmt(mins, 0)} min` : ' · DNP') : ''}
                        </div>
                      </div>
                    </div>
                    {['pts', 'reb', 'ast'].map((key) => (
                      <span key={key} className="text-right text-[14px] font-bold tabular-nums text-zinc-100">
                        {line ? fmt(line[key] ?? 0) : '—'}
                      </span>
                    ))}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

const BATTLE_POS = ['PG', 'SG', 'SF', 'PF', 'C']

/** Watch pins share the hub store; Sleeper NBA ids collide with NFL ones, so NBA pins live under `nba:`. */
const pinKey = (p) => `nba:${p.sleeper_id}`

/** Pregame position battles: each side's top projected player at each position (primary position first). */
function positionBattles(rows) {
  const byProj = rows.filter((r) => r.proj != null).sort((a, b) => b.proj - a.proj)
  const used = new Set()
  const pick = (side, pos) => {
    const pool = byProj.filter((r) => r.p.side === side && !used.has(r.p.sleeper_id))
    const hit =
      pool.find((r) => String(r.p.position || '').toUpperCase() === pos) ||
      pool.find((r) => (r.p.fantasy_positions || []).map((x) => String(x).toUpperCase()).includes(pos))
    if (hit) used.add(hit.p.sleeper_id)
    return hit?.p || null
  }
  const out = []
  for (const pos of BATTLE_POS) {
    const away = pick('away', pos)
    const home = pick('home', pos)
    if (away || home) out.push({ id: pos, label: pos, pos, away, home })
  }
  return out
}

/** NBA Fantasy tab: per-game projection and live / final points under the viewer's NBA league scoring. */
export function GameHubNbaFantasyPane({ players, loading, error, game, live = null, playerBox = null }) {
  const status = statusOf(game, live)
  const liveOrFinal = status !== 'pre'
  const boxIndex = useBoxIndex(playerBox, status)
  const boxLoaded = Boolean(boxIndex?.any)
  const { league, leagues, selectLeague } = useNbaLeagueRules()
  const chipState = useGameLeagueChips(leagues, league?.id, selectLeague, game?.id)
  const scoring = league?.scoring || DEFAULT_NBA_SCORING
  const owned = useRosterLeagues()
  const opponents = useLeagueOpponents(league?.id)
  const pins = useFantasyPins()

  const rows = useMemo(() => {
    const list = (players || []).map((p) => {
      const id = String(p.sleeper_id || '')
      const box = boxLoaded ? boxForPlayer(boxIndex, p) : null
      const proj = p.proj_line ? scoreLine(p.proj_line, scoring, 'nba', p.position || null) : null
      const livePts = box ? scoreLine(nbaLineFromBox(box), scoring, 'nba', p.position || null) : boxLoaded ? 0 : null
      const mine = owned[id] || null
      const pinRole = getFantasyPinRole(pinKey(p), pins)
      const enemy = !mine && (Boolean(opponents[id]) || pinRole === 'enemy')
      const watch = !mine && !enemy && pinRole === 'mine'
      return { p, box, proj, livePts, mine, enemy, watch }
    })
    const tier = (r) => (r.mine ? 0 : r.enemy ? 1 : r.watch ? 2 : 3)
    return list.sort((a, b) => {
      if (tier(a) !== tier(b)) return tier(a) - tier(b)
      const va = (liveOrFinal ? a.livePts : a.proj) ?? -1
      const vb = (liveOrFinal ? b.livePts : b.proj) ?? -1
      if (vb !== va) return vb - va
      return (b.proj ?? -1) - (a.proj ?? -1)
    })
  }, [players, boxIndex, boxLoaded, scoring, owned, opponents, liveOrFinal, pins])

  const battles = useMemo(() => (liveOrFinal ? [] : positionBattles(rows)), [rows, liveOrFinal])
  const faceFor = useMemo(() => {
    const projBy = new Map(rows.map((r) => [String(r.p.sleeper_id), r.proj]))
    return (p) => {
      const avg = p.season_line
      const seasonPts = avg ? scoreLine(avg, scoring, 'nba', p.position || null) : null
      const line = avg || p.proj_line
      return {
        points: { main: projBy.get(String(p.sleeper_id)) ?? null, under: null, label: 'PROJ' },
        stats: line ? `${fmt(line.pts ?? 0)} pts · ${fmt(line.reb ?? 0)} reb · ${fmt(line.ast ?? 0)} ast` : null,
        avg: Number.isFinite(seasonPts) && p.season_gp > 0 ? `${fmt(seasonPts)} avg · ${p.season_gp} gp` : avg ? null : 'Projected',
      }
    }
  }, [rows, scoring])

  if (loading) return <div className="py-10 text-center text-sm text-zinc-500">Loading fantasy…</div>
  if (error) return <div className="py-10 text-center text-sm text-lv-red">{error}</div>
  if (!rows.length) return <div className="py-10 text-center text-sm text-zinc-500">No fantasy board for this game yet.</div>

  return (
    <div data-lounge-game-fantasy className="space-y-4 py-3">
      {leagues.length ? (
        <GameHubLeagueChips
          chips={chipState.chips}
          activeId={chipState.activeId}
          onPick={chipState.pick}
          action={(multi) => <GoToFantasyButton game={game} compact iconOnly={multi} />}
        />
      ) : (
        <div data-fantasy-scoring-bar className="flex items-center justify-between gap-3 px-1">
          <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide text-zinc-300">Default points</span>
          <GoToFantasyButton game={game} compact />
        </div>
      )}
      {battles.length ? <FantasyMatchupStack matchups={battles} game={game} gameStatus={status} faceFor={faceFor} /> : null}

      <div className="space-y-2">
        <div className="grid grid-cols-[minmax(0,1fr)_3.25rem] gap-x-2 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
          <span>Player</span>
          <span className="text-right">{status === 'post' ? 'Game' : status === 'in' ? 'Live' : 'Proj'}</span>
        </div>
        <ul className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          {rows.slice(0, 30).map(({ p, box, proj, livePts, mine, enemy, watch }) => {
            const pill = mine
              ? rosterLeaguePill(mine)
              : enemy && opponents[String(p.sleeper_id)] && league?.name
                ? rosterLeaguePill({ leagues: [{ name: league.name }] })
                : enemy
                  ? 'Enemy'
                  : watch
                    ? 'Watch'
                    : ''
            const boxLine = box ? nbaLineFromBox(box) : null
            const detail = boxLine ? `${boxLine.pts} pts · ${boxLine.reb} reb · ${boxLine.ast} ast` : ''
            const pinned = Boolean(mine || enemy || watch)
            const locked = Boolean(mine || opponents[String(p.sleeper_id)])
            const bench = Boolean(mine) && rosterBench(mine, league?.id)
            return (
              <li key={p.sleeper_id}>
                <button
                  type="button"
                  data-lounge-fantasy-pin={pinned ? (enemy ? 'enemy' : 'mine') : '0'}
                  data-lounge-fantasy-bench={bench ? '' : undefined}
                  onClick={() => {
                    if (!locked) toggleFantasyPin(pinKey(p))
                  }}
                  aria-pressed={pinned}
                  aria-label={
                    mine
                      ? `${p.name} is on your ${rosterLeagueTitle(mine)} ${bench ? 'bench' : 'roster'}`
                      : locked
                        ? `${p.name} is on an opposing roster${league?.name ? ` in ${league.name}` : ''}`
                        : watch
                          ? `Deselect ${p.name} from fantasy watch`
                          : `Select ${p.name} for fantasy watch`
                  }
                  className={`relative grid w-full grid-cols-[minmax(0,1fr)_3.25rem] items-center gap-x-2 px-3 py-2.5 text-left touch-manipulation [-webkit-tap-highlight-color:transparent] ${
                    enemy ? 'bg-rose-500/10' : bench ? 'bg-sky-500/[0.04]' : pinned ? 'bg-sky-500/10' : 'active:bg-zinc-800/80'
                  }`}
                >
                  {bench ? (
                    <span aria-hidden="true" className="pointer-events-none absolute inset-1 rounded-xl border border-dashed border-sky-400/45" />
                  ) : null}
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar player={p} />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[14px] font-semibold text-zinc-100">{p.name}</span>
                        {pill ? (
                          <span
                            title={mine ? rosterLeagueTitle(mine) : locked ? `Opponent in ${league?.name}` : undefined}
                            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                              enemy ? 'bg-rose-500/25 text-rose-300' : 'bg-sky-500/25 text-sky-300'
                            }`}
                          >
                            {pill}
                          </span>
                        ) : null}
                        {bench ? (
                          <span data-lounge-fantasy-bench-chip className="shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                            {rosterBenchLabel(mine, league?.id)}
                          </span>
                        ) : null}
                        <InjuryTag status={p.injury_status} />
                      </div>
                      <div className="truncate text-[12px] text-zinc-500">
                        {p.position} · {p.team}
                        {detail ? ` · ${detail}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[14px] font-bold tabular-nums text-zinc-100">{fmt(liveOrFinal ? livePts : proj)}</div>
                    <div className="text-[10px] tabular-nums text-zinc-500">
                      {liveOrFinal ? (proj != null ? `proj ${fmt(proj)}` : '') : 'per game'}
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
