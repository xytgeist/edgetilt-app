import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronLeft, RefreshCw, SlidersHorizontal, X } from 'lucide-react'
import { scoreLine } from './fantasyBoxScore.js'
import { projectionOf } from './fantasyProjection.js'
import { nbaMatchupUpcoming, nbaWeekOf } from './fantasyNbaWeek.js'
import { lockInCall, nbaLockIn } from './fantasyLockIn.js'
import { CategoryBoard, CategoryScoreLine, leagueCategories, SeasonStandings, seasonLongFormat, useCategoryMatchup } from './FantasyCategoryBoard.jsx'
import { useHeadshotSrc } from '../../utils/playerHeadshot.js'
import { distinctTeamAccent, useTeamAccent } from './useTeamAccent.js'
import { useLiveGames, useLivePlays } from './useFantasyLive.js'
import FantasyPlayerNews from './FantasyPlayerNews.jsx'
import { usePlayerNews } from './usePlayerNews.js'
import { newsByPlayer, newsTimeAgo, withNews } from './fantasyNewsStatus.js'
import { leagueRates } from './fantasyBoxScore.js'
import { requestLoungeSportsGameOpen } from '../lounge/loungeSportsHubNav.js'
import { loungeSportsGameMatch } from '../../utils/loungeSportsApi.js'
import { formatFantasyPoints } from '../lounge/gameHub/gameHubPlayFantasy.js'
import {
  fantasyPosition,
  gameLocked,
  injuryKey,
  leagueLineupSlots,
  openLineupSlots,
  optimizeLineup,
  slotPositions,
  weekValue,
} from './fantasyStartSit.js'
import { rankWaivers, rowId, waiverLineupSlots } from './fantasyWaivers.js'
import { streamPlan } from './fantasyStreaming.js'
import { schedulePlan } from './fantasyNbaSchedule.js'
import {
  loadLeagueValues,
  loadLineupCards,
  loadOpenSlotFill,
  loadPendingTrades,
  loadSniper,
  loadWaivers,
} from './fantasyApi.js'
import { rankBoom, rankHandcuffs } from './fantasySniper.js'
import { claimOdds, waiverWindow } from './fantasyWaiverWindow.js'
import {
  composeCounterMessage,
  composeFlipMessage,
  composeOfferMessage,
  findFlips,
  findTrades,
  parseOfferText,
  reviewOffer,
  teamStrength,
  TRADE_STANCES,
  valueContext,
} from './fantasyTrades.js'
import { playoffFormat, simulateLeague, weekPairs } from './fantasyLeagueOutlook.js'
import {
  dismissMove,
  dismissPeriod,
  moveDismissKey,
  restoreMoves,
  useFantasyDismissVersion,
  withoutDismissed,
} from './fantasyDismissals.js'
import { openExternalUrl, shareViaBestAvailable } from '../../utils/edgeNative.js'
import { positionPillClass, slotPillPosition } from '../../utils/fantasyPositionPill.js'
import { sportsBetPropTapPayload, useSportsBetOddsActions } from '../sports-bet-tracker/sportsBetLogContext.jsx'
import { useOddsLogPress } from '../sports-bet-tracker/useOddsLogPress.js'

const TOOLS = [
  {
    id: 'start',
    label: 'Roster',
  },
  {
    id: 'live',
    label: 'Live',
  },
  {
    id: 'waiver',
    label: 'Waivers',
  },
  {
    id: 'trade',
    label: 'Trades',
  },
]

const DEFAULT_TOOL = TOOLS[0].id

/** NFL: Roster carries the live matchup (its pill reads Live while a starter plays); Plays shows once the week kicks off. */
function nflTools({ live, kicked }) {
  return [
    { id: 'start', label: live ? 'Live' : 'Roster', live },
    ...(kicked ? [{ id: 'plays', label: 'Plays' }] : []),
    { id: 'waiver', label: 'Waivers' },
    { id: 'trade', label: 'Trades' },
  ]
}

const TOOL_IDS = new Set([...TOOLS.map((t) => t.id), 'plays'])

function providerLabel(provider) {
  if (provider === 'yahoo') return 'Yahoo'
  if (provider === 'sleeper') return 'Sleeper'
  if (provider === 'espn') return 'ESPN'
  if (provider === 'cbs') return 'CBS'
  return provider || ''
}

function recordLine(t) {
  if (!t) return ''
  const w = Number(t.wins) || 0
  const l = Number(t.losses) || 0
  const ti = Number(t.ties) || 0
  return ti > 0 ? `${w}-${l}-${ti}` : `${w}-${l}`
}

function TeamLogo({ team }) {
  const [failed, setFailed] = useState(false)
  const url = String(team?.avatar_url || '').trim()
  const letter = String(team?.team_name || '?').trim().slice(0, 1).toUpperCase() || '?'
  if (!url || failed) {
    return (
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[13px] font-bold"
        style={{ color: '#fff' }}
      >
        {letter}
      </span>
    )
  }
  return (
    <img
      src={url}
      alt=""
      data-fantasy-team-logo
      className="h-10 w-10 shrink-0 rounded-[10px] object-cover"
      onError={() => setFailed(true)}
    />
  )
}

function injuryLabel(status) {
  const s = String(status || '').trim()
  if (!s) return ''
  if (/^q(uestionable)?$/i.test(s)) return 'Q'
  if (/^d(oubtful)?$/i.test(s)) return 'D'
  if (/^out$/i.test(s)) return 'Out'
  if (/^ir$/i.test(s)) return 'IR'
  return s.length > 12 ? s.slice(0, 12) : s
}

/** Row tint for a hurt player: 'out' (Out, IR, Doubtful) or 'q' (Questionable, GTD / day-to-day). */
function injuryTone(status) {
  const key = injuryKey(status)
  if (key === 'out' || key === 'doubtful') return 'out'
  if (key === 'questionable' || /^(gtd|dtd|day[- ]to[- ]day|game[- ]time decision)$/i.test(String(status || '').trim())) return 'q'
  return ''
}

function startersOf(rows) {
  return (rows || []).filter((r) => r.slot === 'starter')
}

function fantasyPos(position) {
  const p = String(position || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  if (p === 'FB' || p === 'HB') return 'RB'
  if (p === 'DST' || p === 'D' || p === 'DEF') return 'DEF'
  if (p === 'PK') return 'K'
  return p
}

function shortName(name, position) {
  // Hosts send "Browns", "New England Patriots", "Patriots D/ST", or "Las Vegas Raiders DEF": nickname + D/ST.
  if (fantasyPos(position) === 'DEF') {
    const words = String(name || '')
      .replace(/\b(d\/st|dst|def|defense)\b\.?/gi, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
    return words.length ? `${words[words.length - 1].toUpperCase()} D/ST` : 'D/ST'
  }
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return ''
  if (parts.length === 1) return parts[0].toUpperCase()
  return `${parts[0].charAt(0).toUpperCase()}. ${parts.slice(1).join(' ').toUpperCase()}`
}

function slotPill(row, index) {
  const raw = String(row?.slot_label || '')
  // The slot name is the last part: Sleeper "00:UTIL" / "08:UTIL2", ESPN "starter:3078576:PG"; Yahoo is the name.
  const named = (raw.includes(':') ? raw.split(':').pop() : raw).replace(/(\D)\d+$/, '$1')
  if (named && !/^\d+$/.test(named)) return named
  return fantasyPos(row?.position) || `${index + 1}`
}

/** NBA lineup order (hosts list rosters in their own order; pairing by slot keeps PG across from PG). */
const NBA_SLOT_RANK = ['PG', 'SG', 'G', 'SG/SF', 'G/F', 'SF', 'PF', 'F', 'PF/C', 'F/C', 'C', 'UTIL']

function bySlotRank(rows) {
  const rank = (row, i) => {
    const at = NBA_SLOT_RANK.indexOf(slotPill(row, i).toUpperCase())
    return at < 0 ? NBA_SLOT_RANK.length : at
  }
  return rows.map((row, i) => ({ row, r: rank(row, i), i })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.row)
}

function pairBySlot(leftRows, rightRows) {
  const left = bySlotRank(leftRows)
  const right = bySlotRank(rightRows)
  const n = Math.max(left.length, right.length)
  const pairs = []
  for (let i = 0; i < n; i += 1) {
    const label = slotPill(left[i] || right[i], i)
    pairs.push({
      key: `${label}-${i}`,
      label,
      left: left[i] || null,
      right: right[i] || null,
    })
  }
  return pairs
}

function benchOf(rows) {
  return (rows || []).filter((r) => r.slot !== 'starter')
}

/**
 * Host slot names to a pairing key; flex slots keep their own row whoever fills them. Yahoo's `slot_label` is the
 * slot name; Sleeper / ESPN end theirs with it (`starter:3:FLEX`).
 */
const LINEUP_SLOT_KEY = {
  QB: 'QB',
  RB: 'RB',
  WR: 'WR',
  TE: 'TE',
  K: 'K',
  PK: 'K',
  DEF: 'DEF',
  'D/ST': 'DEF',
  DST: 'DEF',
  'W/R/T': 'FLEX',
  'RB/WR/TE': 'FLEX',
  FLEX: 'FLEX',
  'W/R': 'WRRB',
  'RB/WR': 'WRRB',
  'W/T': 'WRTE',
  'WR/TE': 'WRTE',
  'Q/W/R/T': 'SFLX',
  OP: 'SFLX',
  SUPERFLEX: 'SFLX',
  SUPER_FLEX: 'SFLX',
  WRRB_FLEX: 'WRRB',
  REC_FLEX: 'WRTE',
}
/** A slot a QB can also fill reads FLEX; W/R/T-only flex reads WRT. */
const FLEX_PILL = { FLEX: 'WRT', WRRB: 'W/R', WRTE: 'W/T', SFLX: 'FLEX' }

function lineupSlotKey(row, bySlot) {
  if (bySlot && row?.slot === 'starter') {
    const key = LINEUP_SLOT_KEY[(String(row.slot_label || '').split(':').pop() || '').trim().toUpperCase()]
    if (key) return key
  }
  return fantasyPos(row?.position)
}

function pairLineup(leftRows, rightRows, { bySlot = false } = {}) {
  const left = leftRows || []
  const right = rightRows || []
  const nfl = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])
  const sample = left.concat(right)
  if (sample.length && !sample.some((row) => nfl.has(fantasyPos(row.position)))) {
    return pairBySlot(left, right)
  }
  // Flex rows sit right after the last WR (host lineup order), superflex after TE.
  const order = ['QB', 'RB', 'WR', 'FLEX', 'WRRB', 'WRTE', 'TE', 'SFLX', 'K', 'DEF']
  const bucket = (rows) => {
    const map = {}
    for (const row of rows) {
      const pos = lineupSlotKey(row, bySlot)
      if (!map[pos]) map[pos] = []
      map[pos].push(row)
    }
    return map
  }
  const leftBuckets = bucket(left)
  const rightBuckets = bucket(right)
  const pairs = []
  for (const pos of order) {
    const a = leftBuckets[pos] || []
    const b = rightBuckets[pos] || []
    const n = Math.max(a.length, b.length)
    const base = FLEX_PILL[pos] || pos
    for (let i = 0; i < n; i++) {
      pairs.push({
        key: `${pos}-${i}`,
        label: n > 1 ? `${base}${i + 1}` : base,
        left: a[i] || null,
        right: b[i] || null,
      })
    }
  }
  return pairs
}

function pairStarters(leftRows, rightRows) {
  return pairLineup(startersOf(leftRows), startersOf(rightRows), { bySlot: true })
}

function pairBench(leftRows, rightRows) {
  return pairLineup(benchOf(leftRows), benchOf(rightRows))
}

function isDefense(row) {
  const p = String(row?.position || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  return p === 'DEF' || p === 'DST' || p === 'D'
}

function teamAbbrev(row) {
  return String(row?.nfl_team || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
}

/**
 * Full 600x436 ESPN bust (contain, never cropped at the shoulders), a bit taller than the collapsed card so the
 * head clears the name line, bottom-anchored and tucked past the outer edge. Names keep clear of the head;
 * market text may run over the shoulders.
 * Logos and letter fallbacks keep the round mark, centered in the same lane.
 */
function SideBust({ row, align, live, final = false }) {
  const shot = useHeadshotSrc(row?.headshot_url, 384)
  if (!row) return null
  const right = align === 'right'
  const bust = !isDefense(row) && !shot.failed
  return (
    <span
      aria-hidden
      data-fantasy-final-side={final ? '' : undefined}
      className={`pointer-events-none absolute bottom-0 h-[74px] aspect-[600/436] ${right ? '-right-7' : '-left-7'}`}
    >
      {live ? <span className="fantasy-live-glow absolute -inset-x-10 -top-4 bottom-0" /> : null}
      {bust ? (
        <img
          src={shot.src}
          alt=""
          className="relative h-full w-full object-contain object-bottom"
          loading="lazy"
          decoding="async"
          onError={shot.onError}
        />
      ) : (
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <PlayerAvatar row={row} size="md" />
        </span>
      )}
    </span>
  )
}

const PROP_LABEL_SHORT = [
  [/\bpassing yards\b/i, 'pass yds'],
  [/\brushing yards\b/i, 'rush yds'],
  [/\breceiving yards\b/i, 'rec yds'],
  [/\breceptions?\b/i, 'rec'],
  [/\btouchdowns?\b/i, 'TD'],
]

function shortPropLabel(label) {
  let out = String(label || '')
  for (const [re, short] of PROP_LABEL_SHORT) out = out.replace(re, short)
  return out
}

function PlayerAvatar({ row, size = 'md' }) {
  const [failed, setFailed] = useState(false)
  const team = teamAbbrev(row)
  const letter = String(row?.player_name || team || '?').slice(0, 1).toUpperCase()
  const box = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'
  const shot = useHeadshotSrc(row?.headshot_url, 160)

  if (isDefense(row) && team && !failed) {
    return (
      <img
        src={`/sports/nfl/logos/${team}.png`}
        alt=""
        className={`${box} shrink-0 object-contain`}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    )
  }

  if (shot.failed || failed) {
    return (
      <span className={`flex ${box} shrink-0 items-center justify-center text-xs font-bold text-zinc-400`}>
        {letter}
      </span>
    )
  }

  return (
    <span className={`relative ${box} shrink-0 overflow-hidden`}>
      <img
        src={shot.src}
        alt=""
        className="absolute inset-0 h-full w-full origin-[center_22%] scale-[1.42] object-cover object-[center_18%]"
        loading="lazy"
        decoding="async"
        onError={shot.onError}
      />
    </span>
  )
}

function pts(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return n.toFixed(1)
}

function cents(price) {
  const n = Number(price)
  if (!Number.isFinite(n) || n <= 0) return ''
  const p = n <= 1 ? n * 100 : n
  return `${Math.round(p)}¢`
}

function ordinal(n) {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  const tail = ['th', 'st', 'nd', 'rd']
  return `${n}${tail[n % 10] || 'th'}`
}

function standingsRank(team, teams) {
  if (!team) return null
  const sorted = [...(teams || [])].sort((a, b) => {
    const wins = (Number(b.wins) || 0) - (Number(a.wins) || 0)
    if (wins) return wins
    return (Number(b.points_for) || 0) - (Number(a.points_for) || 0)
  })
  const i = sorted.findIndex((t) => t.id === team.id)
  return i < 0 ? null : i + 1
}

function gameStarted(card) {
  if (!card || card.bye) return false
  const st = String(card.game_status || '').toLowerCase()
  if (['in_progress', 'inprogress', 'live', 'complete', 'closed', 'final', 'post'].includes(st)) return true
  if (card.kickoff) {
    const t = Date.parse(card.kickoff)
    if (Number.isFinite(t) && t <= Date.now()) return true
  }
  return false
}

/** This week's projection in this league's rules: Sleeper + sportsbook props blend (`fantasyProjection.js`). */
function projectedOf(card, scoring, sport) {
  return projectionOf(card, scoring, sport, card?.pos || null)
}

/** Our box × this league's rules, else the host/Sleeper number once the game has started. */
function pointsOf(card, scoring, sport) {
  if (!card || !gameStarted(card)) return null
  const scored = scoreLine(card.line, scoring, sport, card.pos || null)
  if (scored != null) return { pts: scored, fromLine: true }
  const w = Number(card.week_pts)
  if (Number.isFinite(w)) return { pts: w, fromLine: false }
  return { pts: 0, fromLine: false }
}

/**
 * Starter total. Before kickoff this is the projection. After, live points so far plus what is still to play:
 * full projections for players yet to start, the paced share for players mid-game, nothing once final.
 */
function sideOutlook(roster, cards, scoring, sport, lockIn = false, upcoming = false) {
  const starters = startersOf(roster)
  if (sport === 'nba') return nbaSideOutlook(starters, cards, scoring, lockIn, upcoming)
  let projected = 0
  let projectedN = 0
  let scored = 0
  let started = false
  let fromLine = false
  let remaining = 0
  let outlookOk = false
  let kicked = false
  let playing = false
  let allFinal = starters.length > 0
  for (const row of starters) {
    const card = row?.sleeper_id ? cards?.[row.sleeper_id] : null
    if (!card || sideStatus(card) !== 'Final') allFinal = false
    if (!card) continue
    if (gameStarted(card)) kicked = true
    if (sideStatus(card) === 'Live') playing = true
    const livePts = pointsOf(card, scoring, sport)
    // A starter ruled out projects zero until his game starts (hosts score him the same way).
    const ruledOut = !livePts && injuryKey(row.injury_status) === 'out'
    const p = ruledOut ? 0 : projectedOf(card, scoring, sport)
    const hasP = Number.isFinite(p)
    if (hasP) {
      projected += p
      projectedN += 1
    }
    if (livePts) {
      started = true
      if (livePts.fromLine) fromLine = true
      scored += livePts.pts
      outlookOk = true
      if (hasP && sideStatus(card) === 'Live') {
        const progress = gameProgressOf(card, sport)
        if (progress != null) remaining += p * (1 - progress)
      }
    } else if (hasP) {
      remaining += p
      outlookOk = true
    }
  }
  return {
    live: started,
    kicked: kicked || started,
    playing,
    final: started && allFinal,
    fromLine,
    projected: projectedN ? projected : null,
    scored: started ? scored : null,
    remaining,
    outlook: outlookOk ? scored + remaining : null,
  }
}

/** NBA side: host week-to-date + live points it has not caught yet, plus per-game projections x games left (Lock-In: one game counts). */
function nbaSideOutlook(starters, cards, scoring, lockIn = false, upcoming = false) {
  let projected = 0
  let projectedN = 0
  let scored = 0
  let boost = 0
  let remaining = 0
  let started = false
  let kicked = false
  let playing = false
  let outlookOk = false
  let allDone = starters.length > 0
  for (const row of starters) {
    const card = row?.sleeper_id ? cards?.[row.sleeper_id] : null
    if (!card) {
      allDone = false
      continue
    }
    const w = nbaWeekOf(row, card, scoring, undefined, { lockIn, upcoming })
    if (Number.isFinite(w.pregame)) {
      projected += w.pregame
      projectedN += 1
    }
    if (w.played > 0 || w.host) started = true
    if (w.live) {
      kicked = true
      playing = true
    }
    if (w.live || w.gamesLeft > 0) allDone = false
    scored += w.scored
    boost += w.boost
    remaining += w.remaining
    outlookOk = true
  }
  return {
    live: started,
    kicked: kicked || started,
    playing,
    final: started && allDone,
    fromLine: false,
    boost,
    projected: projectedN ? projected : null,
    scored: started ? scored : null,
    remaining,
    outlook: outlookOk ? scored + remaining : null,
  }
}

function displayScore(outlook, hostScore) {
  if (!outlook?.live) {
    if (outlook?.projected != null) return { text: outlook.projected.toFixed(1), live: false }
    return { text: '–', live: false }
  }
  if (outlook.fromLine && outlook.scored != null) return { text: outlook.scored.toFixed(1), live: true }
  const host = Number(hostScore)
  if (Number.isFinite(host) && host > 0) return { text: (host + (Number(outlook.boost) || 0)).toFixed(1), live: true }
  if (outlook.scored != null) return { text: outlook.scored.toFixed(1), live: true }
  return { text: '0.0', live: true }
}

function normCdf(x) {
  const sign = x < 0 ? -1 : 1
  const a = Math.abs(x) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * a)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a))
  return 0.5 * (1 + sign * y)
}

/**
 * Points of variance per projected point still to play. NFL: a pregame spread near 28 for two ~115-point
 * lineups (a typical weekly fantasy margin, not a book price). NBA: per point, game-to-game swing (SD ~30% of a
 * ~35-point game, ~3), missed games (rest / late scratches ~10% of games, ~3) and the weekly projection's own
 * miss (~15% of a player's week, ~3), so two ~1,050-point lineups spread near 140 before the week starts.
 * Lock-In counts one game a player (smaller totals, the best game of several): ~5. Tightens as the week plays out.
 */
const WIN_VAR_PER_POINT = { nfl: 3.4, nba: 9, nba_lockin: 5 }

/** Weekly win chance from the two projected finishes and the projected points both sides still have to play. */
function winChance(left, right, remaining, sport = 'nfl', lockIn = false) {
  if (left == null || right == null) return null
  const perPoint = WIN_VAR_PER_POINT[sport === 'nba' && lockIn ? 'nba_lockin' : sport] || WIN_VAR_PER_POINT.nfl
  const sigma = Math.sqrt(perPoint * Math.max(0, Number(remaining) || 0))
  if (sigma < 0.5) return left > right ? 1 : left < right ? 0 : 0.5
  return Math.min(0.99, Math.max(0.01, normCdf((left - right) / sigma)))
}

const MAIN_STAT = { QB: 'pass_yds', RB: 'rush_yds', WR: 'rec_yds', TE: 'rec_yds' }

function propStat(prop) {
  if (prop?.stat) return prop.stat
  const t = String(prop?.label || '').toLowerCase()
  if (/rush/.test(t) && /rec/.test(t)) return 'rr_yds'
  if (/pass/.test(t) && /yd/.test(t)) return 'pass_yds'
  if (/rush/.test(t) && /yd/.test(t)) return 'rush_yds'
  if (/rec/.test(t) && /yd/.test(t)) return 'rec_yds'
  return ''
}

const MARKET_GROUP_ORDER = {
  QB: ['pass_yds', 'rush_yds', 'td', 'rec_yds', 'rec'],
  RB: ['rush_yds', 'rec_yds', 'rec', 'td', 'pass_yds'],
  WR: ['rec_yds', 'rec', 'td', 'rush_yds', 'pass_yds'],
  TE: ['rec_yds', 'rec', 'td', 'rush_yds', 'pass_yds'],
}
const MARKET_GROUP_LABEL = {
  pass_yds: 'Pass yds',
  rush_yds: 'Rush yds',
  rec_yds: 'Rec yds',
  rr_yds: 'Rush + rec yds',
  rec: 'Receptions',
  td: 'Touchdowns',
}

function marketStat(prop) {
  const known = propStat(prop)
  if (known) return known
  const t = String(prop?.label || '').toLowerCase()
  if (/\btd\b|touchdown/.test(t)) return 'td'
  if (/\brec(eption)?s?\b/.test(t)) return 'rec'
  return 'other'
}

/** Markets grouped by stat (position's main stat first), each ladder low strike to high. */
function groupMarkets(props, position) {
  const order = MARKET_GROUP_ORDER[fantasyPos(position)] || MARKET_GROUP_ORDER.WR
  const by = new Map()
  for (const prop of props || []) {
    const key = marketStat(prop)
    if (!by.has(key)) by.set(key, [])
    by.get(key).push(prop)
  }
  const rank = (key) => {
    const i = order.indexOf(key)
    return i < 0 ? order.length + (key === 'other' ? 1 : 0) : i
  }
  return [...by.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([key, list]) => ({
      key,
      label: MARKET_GROUP_LABEL[key] || 'Other',
      props: [...list].sort((a, b) => (propStrike(a.label) ?? 1e9) - (propStrike(b.label) ?? 1e9)),
    }))
}

function pickMainProp(row, card) {
  const want = MAIN_STAT[fantasyPos(row?.position)]
  if (!want) return null
  return (card?.props || []).find((p) => propStat(p) === want) || null
}

function SiteBadge({ provider }) {
  const tone =
    {
      espn: 'bg-[#e52534]',
      sleeper: 'bg-[#0f8f6f]',
      yahoo: 'bg-[#6001d2]',
      cbs: 'bg-[#0b63ce]',
    }[provider] || 'bg-zinc-700'
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-black tracking-wide ${tone}`} style={{ color: '#fff' }}>
      {providerLabel(provider) || 'League'}
    </span>
  )
}

const PROP_STAT_NAME = {
  pass_yds: 'Passing yards',
  rush_yds: 'Rushing yards',
  rec_yds: 'Receiving yards',
  rec: 'Receptions',
  td: 'Touchdowns',
}

/** Bet Tracker fields for this player's game (each fantasy row is a different game). */
function playerBetGame(row, card) {
  const team = String(row?.nfl_team || '').toUpperCase()
  const opp = String(card?.opponent || '').toUpperCase()
  const out = { sport_key: 'americanfootball_nfl', sport_label: 'NFL', commence_time: card?.kickoff || undefined }
  if (team && opp && card?.home != null) {
    out.home_team = card.home ? team : opp
    out.away_team = card.home ? opp : team
  }
  return out
}

function propStrike(label) {
  const m = String(label || '').match(/^(\d+(?:\.\d+)?)\+/)
  return m ? Number(m[1]) : null
}

/** Tap opens the Yes / No ticket on the book (and records the tap). Hold logs it in the Bet Tracker. */
function YesNoPills({ prop, row, card }) {
  const { logOdds, recordTap } = useSportsBetOddsActions()
  const yes = prop?.price
  const no = prop?.no != null ? prop.no : yes != null ? Math.max(0, 1 - Number(yes)) : null
  const base = {
    playerName: row?.player_name || '',
    stat: PROP_STAT_NAME[prop?.stat] || prop?.stat || '',
    line: propStrike(prop?.label),
    book: prop?.source || 'kalshi',
    selectionLabel: prop?.label || '',
  }
  const game = playerBetGame(row, card)
  const yesPayload = { ...game, ...sportsBetPropTapPayload({ ...base, price: yes, side: 'over' }) }
  const noPayload = { ...game, ...sportsBetPropTapPayload({ ...base, price: no, side: 'under' }) }
  const yesHref = prop?.url_yes || prop?.url_market
  const noHref = prop?.url_no || prop?.url_market
  const canAct = Boolean(prop && row && (logOdds || recordTap))
  const yesPress = useOddsLogPress({
    enabled: canAct,
    onLog: logOdds ? () => logOdds(yesPayload) : null,
    onOpen: yesHref
      ? () => {
          recordTap?.(yesPayload)
          void openExternalUrl(yesHref)
        }
      : null,
  })
  const noPress = useOddsLogPress({
    enabled: canAct,
    onLog: logOdds ? () => logOdds(noPayload) : null,
    onOpen: noHref
      ? () => {
          recordTap?.(noPayload)
          void openExternalUrl(noHref)
        }
      : null,
  })
  const stopKeys = (e) => e.stopPropagation()
  const who = row?.player_name || 'Player'
  return (
    <span className="inline-flex shrink-0 overflow-hidden rounded ring-1 ring-inset ring-zinc-700/80 text-[10px] font-bold leading-[14px] tabular-nums">
      <button
        type="button"
        {...yesPress}
        onKeyDown={stopKeys}
        aria-label={`${who} ${prop?.label || ''}, Yes`}
        className="fantasy-yes inline-flex min-w-[1.6rem] items-center justify-center bg-emerald-500/15 px-1 text-emerald-300 touch-manipulation active:opacity-80 [-webkit-tap-highlight-color:transparent]"
      >
        {cents(yes) || '-'}
      </button>
      <button
        type="button"
        {...noPress}
        onKeyDown={stopKeys}
        aria-label={`${who} ${prop?.label || ''}, No`}
        className="fantasy-no inline-flex min-w-[1.6rem] items-center justify-center border-l border-zinc-700/80 bg-rose-500/10 px-1 text-rose-300 touch-manipulation active:opacity-80 [-webkit-tap-highlight-color:transparent]"
      >
        {cents(no) || '-'}
      </button>
    </span>
  )
}

function gameWhen(card) {
  if (card?.kickoff) {
    const d = new Date(card.kickoff)
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    }
  }
  if (card?.game_date) {
    const d = new Date(`${card.game_date}T12:00:00`)
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString(undefined, { weekday: 'short' })
  }
  return ''
}

function injuryPill(status) {
  const label = injuryLabel(status)
  if (!label) return null
  const out = label === 'Out' || label === 'IR'
  return (
    <span
      className={`shrink-0 rounded px-1 text-[9px] font-bold uppercase ${
        out ? 'bg-rose-500/20 text-rose-300' : 'bg-rose-500/15 text-rose-300'
      }`}
    >
      {label}
    </span>
  )
}

/** Main market under the row. The pill sits against the card's center line, label outward. */
function CenterMarket({ prop, align, row, card }) {
  if (!prop?.label) return <div />
  const left = align === 'left'
  return (
    <div className={`flex min-w-0 items-center gap-1 ${left ? 'justify-end' : 'justify-start'}`}>
      {left ? <span className="fantasy-prop-label min-w-0 truncate text-[10px] font-semibold leading-[14px] text-sky-300">{shortPropLabel(prop.label)}</span> : null}
      <YesNoPills prop={prop} row={row} card={card} />
      {left ? null : <span className="fantasy-prop-label min-w-0 truncate text-[10px] font-semibold leading-[14px] text-sky-300">{shortPropLabel(prop.label)}</span>}
    </div>
  )
}

function VsHead({ row, align, final = false, gamesLeft = null }) {
  if (!row) return <div />
  return (
    <div
      data-fantasy-final-side={final ? '' : undefined}
      className={`flex min-w-0 items-center ${align === 'right' ? 'flex-row-reverse text-right' : 'text-left'}`}
    >
      <div className="min-w-0">
        <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
          <span className="truncate text-[12px] font-bold tracking-wide text-zinc-100">
            {shortName(row.player_name, row.position)}
          </span>
          {injuryPill(row.injury_status)}
        </div>
        <div className="truncate text-[10px] text-zinc-500">
          {fantasyPos(row.position) || row.position}
          {row.nfl_team ? ` · ${row.nfl_team}` : ''}
          {gamesLeft != null ? ` · ${gamesLeft} left` : ''}
        </div>
      </div>
    </div>
  )
}

const STAT_LABEL = {
  pass_yd: 'Pass yds',
  pass_td: 'Pass TD',
  pass_int: 'INT',
  rush_yd: 'Rush yds',
  rush_td: 'Rush TD',
  rec: 'Rec',
  rec_yd: 'Rec yds',
  rec_td: 'Rec TD',
  fum_lost: 'Fum lost',
  ret_td: 'Return TD',
  fgm: 'FG',
  fgmiss: 'FG miss',
  xpm: 'XP',
  pts: 'PTS',
  reb: 'REB',
  ast: 'AST',
  stl: 'STL',
  blk: 'BLK',
  tpm: '3PM',
  to: 'TO',
  goals: 'G',
  assists: 'A',
  shots: 'SOG',
  hits: 'HIT',
  saves: 'SV',
  goals_against: 'GA',
  h: 'H',
  hr: 'HR',
  rbi: 'RBI',
  r: 'R',
  sb: 'SB',
  bb: 'BB',
  k: 'K',
  ip: 'IP',
  er: 'ER',
  w: 'W',
  sv: 'SV',
}

const STAT_ORDER = {
  QB: ['pass_yd', 'pass_td', 'pass_int', 'rush_yd', 'rush_td', 'fum_lost'],
  RB: ['rush_yd', 'rush_td', 'rec', 'rec_yd', 'rec_td', 'fum_lost'],
  WR: ['rec', 'rec_yd', 'rec_td', 'rush_yd', 'rush_td', 'fum_lost'],
  TE: ['rec', 'rec_yd', 'rec_td', 'rush_yd', 'fum_lost'],
  K: ['fgm', 'fgmiss', 'xpm'],
}

/** Counting stats worth showing for this player, in position order. FG distance buckets fold into FG. */
function statRows(line, position) {
  if (!line || typeof line !== 'object') return []
  const merged = { ...line }
  const buckets = Object.keys(line).filter((key) => /^fgm_/.test(key))
  if (buckets.length) merged.fgm = (Number(line.fgm) || 0) + buckets.reduce((sum, key) => sum + (Number(line[key]) || 0), 0)
  const order = STAT_ORDER[fantasyPos(position)] || Object.keys(STAT_LABEL)
  const rows = []
  for (const key of order) {
    if (!STAT_LABEL[key]) continue
    const v = Number(merged[key])
    if (!Number.isFinite(v)) continue
    const keep = v !== 0 || ['pass_yd', 'rush_yd', 'rec', 'rec_yd', 'pts', 'fgm'].includes(key)
    if (!keep) continue
    rows.push({ key, label: STAT_LABEL[key], value: Number.isInteger(v) ? String(v) : v.toFixed(1) })
  }
  return rows.slice(0, 6)
}

function sideStatus(card) {
  const st = String(card?.game_status || '').toLowerCase()
  if (['complete', 'closed', 'final', 'post'].includes(st)) return 'Final'
  if (gameStarted(card)) return 'Live'
  return 'Proj'
}

const PEEK_DELAY_MS = 1000
/** How far the pages slide, as a share of the panel width (enough to show the market Yes / No pills). */
const PEEK_SHARE = 0.8

/** The peek is a hint: it plays on the first few expansions, then stops (and stops early once someone swipes over). */
const PEEK_KEY = 'edgetilt:fantasyPanelPeeks'
const PEEK_MAX = 3
let lastPeekAt = 0

function peeksShown() {
  try {
    return Number(localStorage.getItem(PEEK_KEY)) || 0
  } catch {
    return PEEK_MAX
  }
}

function setPeeksShown(n) {
  try {
    localStorage.setItem(PEEK_KEY, String(n))
  } catch {
    /* private mode: the in-memory cap still applies this session */
  }
}

/**
 * Hints a hidden next page: shortly after the pager appears, its pages slide over and spring back.
 * Moves the pages (transform), not the scroll position, so snapping is untouched. Skipped once the user touches
 * the pager, under reduced motion, and after PEEK_MAX expansions (both panels of one row count once).
 */
function usePagerPeek(ref, enabled) {
  useEffect(() => {
    const el = ref.current
    if (!enabled || !el || typeof window === 'undefined') return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    if (peeksShown() >= PEEK_MAX) return undefined
    let touched = false
    const onTouch = () => {
      touched = true
      // Swiping to the markets page means the hint did its job.
      if (el.scrollLeft > el.clientWidth / 2) setPeeksShown(PEEK_MAX)
    }
    el.addEventListener('pointerdown', onTouch, { passive: true })
    el.addEventListener('scroll', onTouch, { passive: true })
    const timer = window.setTimeout(() => {
      if (touched || el.scrollLeft > 2) return
      // The other panel of the same row peeks along without spending another play.
      const now = Date.now()
      if (now - lastPeekAt > 1500) {
        if (peeksShown() >= PEEK_MAX) return
        setPeeksShown(peeksShown() + 1)
      }
      lastPeekAt = now
      for (const page of el.children) {
        page.animate?.(
          // Slide out, hold so the market pills read, slide back with a small overshoot.
          [
            { transform: 'translateX(0)', easing: 'cubic-bezier(0.25, 0.8, 0.3, 1)' },
            { transform: `translateX(-${PEEK_SHARE * 100}%)`, offset: 0.32 },
            { transform: `translateX(-${PEEK_SHARE * 100}%)`, offset: 0.5, easing: 'cubic-bezier(0.5, 0, 0.3, 1)' },
            { transform: 'translateX(8px)', offset: 0.86, easing: 'ease-in-out' },
            { transform: 'translateX(0)' },
          ],
          { duration: 2600 },
        )
      }
    }, PEEK_DELAY_MS)
    return () => {
      window.clearTimeout(timer)
      el.removeEventListener('pointerdown', onTouch)
      el.removeEventListener('scroll', onTouch)
    }
  }, [ref, enabled])
}

/** Expanded player panel. Page 1 is this game's totals (or projection), swipe left for every market. */
function SidePanel({ row, card }) {
  const [page, setPage] = useState(0)
  const [newsOpen, setNewsOpen] = useState(false)
  const pagerRef = useRef(null)
  const hasMarkets = Boolean(card?.props?.length)
  usePagerPeek(pagerRef, hasMarkets)
  if (!row) return <div />
  const status = sideStatus(card)
  const live = status !== 'Proj'
  const stats = statRows(live ? card?.line : card?.proj_line, row.position)
  const props = card?.props || []
  const when = gameWhen(card)
  const side = card?.bye ? 'Bye' : card?.opponent ? `${card.home ? 'vs' : '@'} ${card.opponent}` : ''
  const gameLine = [when, side].filter(Boolean).join(' ')
  const pages = props.length ? 2 : 1
  return (
    <div data-fantasy-side-panel className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950/60">
      <div
        ref={pagerRef}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(e) => {
          const el = e.currentTarget
          const w = el.clientWidth || 1
          setPage(Math.round(el.scrollLeft / w))
        }}
      >
        <div className="w-full min-w-full shrink-0 snap-start px-2 py-1.5">
          {row.news_note ? (
            <button
              type="button"
              data-fantasy-panel-news
              aria-expanded={newsOpen}
              onClick={(e) => {
                e.stopPropagation()
                setNewsOpen((v) => !v)
              }}
              className="mb-1.5 block w-full border-b border-zinc-800 pb-1.5 text-left touch-manipulation [-webkit-tap-highlight-color:transparent]"
            >
              <div className="flex items-baseline justify-between gap-1 text-[9px] font-bold uppercase tracking-wide">
                <span data-fantasy-panel-news-label>News</span>
                <span className="font-semibold normal-case tracking-normal text-zinc-500">
                  {newsTimeAgo(row.news_note.published)} · {row.news_note.source}
                </span>
              </div>
              <p className={`mt-0.5 text-[11px] font-semibold leading-snug text-zinc-200 ${newsOpen ? '' : 'line-clamp-3'}`}>{row.news_note.headline}</p>
              {newsOpen && row.news_note.story ? (
                <p className="mt-1 text-[10px] leading-snug text-zinc-300">{row.news_note.story}</p>
              ) : null}
              {row.news_note.impact ? (
                <p className={`mt-0.5 text-[10px] leading-snug text-zinc-400 ${newsOpen ? '' : 'line-clamp-3'}`}>{row.news_note.impact}</p>
              ) : null}
            </button>
          ) : null}
          <div className="flex items-center justify-between gap-1 text-[9px] font-bold uppercase tracking-wide text-zinc-500">
            <span className={live ? 'text-rose-300' : ''}>{status}</span>
            {gameLine ? <span className="min-w-0 truncate font-semibold normal-case tracking-normal">{gameLine}</span> : null}
          </div>
          {stats.length ? (
            <div className="mt-1 space-y-0.5">
              {stats.map((s) => (
                <div key={s.key} className="flex items-baseline justify-between gap-2 text-[11px] leading-tight">
                  <span className="text-zinc-400">{s.label}</span>
                  <span className="font-bold tabular-nums text-zinc-100">{s.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[10px] text-zinc-500">{card?.bye ? 'On bye this week.' : 'No stat line yet.'}</p>
          )}
        </div>
        {props.length ? (
          <div className="w-full min-w-full shrink-0 snap-start px-2 py-1.5">
            <div className="space-y-1.5">
              {groupMarkets(props, row.position).map((group) => (
                <div key={group.key}>
                  <div className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">{group.label}</div>
                  <div className="mt-0.5 space-y-1">
                    {group.props.map((prop) => {
                      const strike = propStrike(prop.label)
                      return (
                        <div key={prop.label} className="flex items-center justify-between gap-1.5">
                          <span className="min-w-0 truncate text-[10px] font-semibold leading-[14px] tabular-nums text-zinc-300">
                            {strike != null && group.key !== 'other' ? `${strike}+` : shortPropLabel(prop.label)}
                          </span>
                          <YesNoPills prop={prop} row={row} card={card} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {pages > 1 ? (
        <div className="flex justify-center gap-1 pb-1.5" aria-hidden="true">
          {[0, 1].map((i) => (
            <span key={i} className={`h-1 w-1 rounded-full ${page === i ? 'bg-zinc-300' : 'bg-zinc-700'}`} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Typical real-time game length (minutes) when ESPN progress is missing, to pace a live projection. */
const GAME_MINUTES = { nfl: 185, nba: 140, nhl: 150, mlb: 180 }

/** Share of this player's game already played (0-1): ESPN's clock when we have it, else time since kickoff. */
function gameProgressOf(card, sport) {
  let progress = Number(card?.game_progress)
  if (!Number.isFinite(progress)) {
    const kick = Date.parse(card?.kickoff || '')
    if (!Number.isFinite(kick)) return null
    progress = Math.min(0.97, Math.max(0, (Date.now() - kick) / ((GAME_MINUTES[sport] || 185) * 60_000)))
  }
  return Math.min(1, Math.max(0, progress))
}

/** Live projection: points so far plus the original projection for the share of the game still to play. */
function liveProjection(card, actual, sport, proj) {
  if (!Number.isFinite(proj)) return null
  const progress = gameProgressOf(card, sport)
  if (progress == null) return null
  return actual + proj * (1 - progress)
}

/**
 * Big number = points scored; before kickoff it is the projection (a size down, muted, "PROJ" under it).
 * Small line under a started game = the pregame projection, or the live-paced number during it (green / red vs
 * the pregame projection).
 */
function PointsCell({ card, row, loading, scoring, sport, align, lockIn = false, upcoming = false, valueLabel = 'PROJ' }) {
  if (sport === 'nba') {
    return <NbaPointsCell card={card} row={row} loading={loading} scoring={scoring} align={align} lockIn={lockIn} upcoming={upcoming} valueLabel={valueLabel} />
  }
  const status = sideStatus(card)
  const proj = projectedOf(card, scoring, sport)
  const hasProj = Number.isFinite(proj)
  const scored = status === 'Proj' ? null : pointsOf(card, scoring, sport)
  const pregame = status === 'Proj' && !card?.bye && hasProj
  let main = !card && loading ? '…' : '-'
  let mainCls = 'text-[13px] text-zinc-100'
  let sub = card?.bye ? 'BYE' : hasProj ? pts(proj) : ''
  let subCls = 'text-zinc-500'
  if (pregame) {
    main = pts(proj) || '0.0'
    mainCls = 'text-[12px] text-zinc-300'
    sub = 'PROJ'
    subCls = 'text-[8px] tracking-wide text-zinc-500'
  }
  if (scored) {
    main = pts(scored.pts) || '0.0'
    if (status === 'Live') {
      mainCls = 'text-[13px] fantasy-live-pts'
      const paced = liveProjection(card, scored.pts, sport, proj)
      if (paced != null && hasProj) {
        sub = pts(paced)
        const delta = paced - proj
        subCls = delta >= 0.5 ? 'fantasy-proj-up' : delta <= -0.5 ? 'fantasy-proj-down' : 'text-zinc-400'
      }
    }
  }
  return (
    <span className={`flex w-8 flex-col leading-none ${align === 'right' ? 'items-start' : 'items-end'}`}>
      <span className={`font-bold tabular-nums ${mainCls}`}>{main}</span>
      {sub ? <span className={`mt-0.5 font-semibold tabular-nums ${pregame ? '' : 'text-[9px] '}${subCls}`}>{sub}</span> : null}
    </span>
  )
}

/**
 * NBA: big number = week-to-date points (green while a game is on); before his first game it is the week's
 * projection (muted, "PROJ"). Small line = projected week total, green / red vs the start-of-week projection.
 */
function NbaPointsCell({ card, row, loading, scoring, align, lockIn = false, upcoming = false, valueLabel = 'PROJ' }) {
  const w = card ? nbaWeekOf(row, card, scoring, undefined, { lockIn, upcoming }) : null
  const hasProj = Number.isFinite(w?.pregame)
  // ESPN sends no per-player week points: show his projected week, not a "0.0 scored" that never moves.
  const noHost = row?.week_points == null && !w?.live
  const pregame = !!w && ((w.played === 0 && !w.host) || noHost)
  let main = !card && loading ? '…' : '-'
  let mainCls = 'text-[13px] text-zinc-100'
  let sub = ''
  let subCls = 'text-zinc-500'
  if (pregame && hasProj) {
    main = pts(noHost ? w.total : w.pregame) || '0.0'
    mainCls = 'text-[12px] text-zinc-300'
    sub = valueLabel
    subCls = 'text-[8px] tracking-wide text-zinc-500'
  } else if (w && !pregame) {
    main = pts(w.scored) || '0.0'
    if (w.live) mainCls = 'text-[13px] fantasy-live-pts'
    if (hasProj) {
      sub = pts(w.total)
      const delta = w.total - w.pregame
      subCls = delta >= 0.5 ? 'fantasy-proj-up' : delta <= -0.5 ? 'fantasy-proj-down' : 'text-zinc-400'
    }
  }
  return (
    <span className={`flex w-8 flex-col leading-none ${align === 'right' ? 'items-start' : 'items-end'}`}>
      <span className={`font-bold tabular-nums ${mainCls}`}>{main}</span>
      {sub ? <span className={`mt-0.5 font-semibold tabular-nums ${pregame ? '' : 'text-[9px] '}${subCls}`}>{sub}</span> : null}
    </span>
  )
}

function MatchupRows({ pairs, cards, cardsLoading, bench, scoring, sport, lockIn = false, upcoming = false, valueLabel = 'PROJ' }) {
  const [openKeys, setOpenKeys] = useState(() => new Set())
  const toggle = (key) =>
    setOpenKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  if (!pairs.length) return null
  return (
    <>
      {pairs.map((pair) => {
        const rowKey = `${bench ? 'b' : 's'}-${pair.key}`
        const leftCard = pair.left?.sleeper_id ? cards?.[pair.left.sleeper_id] : null
        const rightCard = pair.right?.sleeper_id ? cards?.[pair.right.sleeper_id] : null
        const leftMain = pair.left ? pickMainProp(pair.left, leftCard) : null
        const rightMain = pair.right ? pickMainProp(pair.right, rightCard) : null
        const open = openKeys.has(rowKey)
        const leftLive = !!pair.left && sideStatus(leftCard) === 'Live'
        const rightLive = !!pair.right && sideStatus(rightCard) === 'Live'
        return (
          <li
            key={rowKey}
            className={`relative overflow-hidden rounded-xl border ${
              bench ? 'fantasy-bench-row border-dashed' : 'fantasy-card-lift border-zinc-800 bg-zinc-900/60'
            }`}
          >
            {injuryTone(pair.left?.injury_status) ? (
              <span
                aria-hidden
                data-fantasy-injury-side={injuryTone(pair.left.injury_status)}
                className="pointer-events-none absolute inset-y-0 left-0 w-1/2"
              />
            ) : null}
            {injuryTone(pair.right?.injury_status) ? (
              <span
                aria-hidden
                data-fantasy-injury-side={injuryTone(pair.right.injury_status)}
                data-side="right"
                className="pointer-events-none absolute inset-y-0 right-0 w-1/2"
              />
            ) : null}
            <span
              aria-hidden
              className="fantasy-row-divider pointer-events-none absolute inset-y-2 left-1/2 w-px -translate-x-1/2"
            />
            {pair.left?.news_note ? (
              <span
                data-fantasy-news-corner
                aria-label="New news"
                className="pointer-events-none absolute left-0 top-0 z-[2] rounded-br-lg px-1.5 py-[3px] text-[7.5px] font-extrabold leading-none tracking-wide"
              >
                NEWS
              </span>
            ) : null}
            {pair.right?.news_note ? (
              <span
                data-fantasy-news-corner
                aria-label="New news"
                className="pointer-events-none absolute right-0 top-0 z-[2] rounded-bl-lg px-1.5 py-[3px] text-[7.5px] font-extrabold leading-none tracking-wide"
              >
                NEWS
              </span>
            ) : null}
            <div
              role="button"
              tabIndex={0}
              aria-expanded={open}
              onClick={() => toggle(rowKey)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggle(rowKey)
                }
              }}
              className="relative block w-full cursor-pointer px-2 py-2 touch-manipulation [-webkit-tap-highlight-color:transparent]"
            >
              <SideBust row={pair.left} align="left" live={leftLive} final={sideStatus(leftCard) === 'Final'} />
              <SideBust row={pair.right} align="right" live={rightLive} final={sideStatus(rightCard) === 'Final'} />
              <div className="relative z-[1] grid w-full grid-cols-2 items-center gap-3 px-10">
                {pair.left || !pair.leftOpen ? (
                  <VsHead
                    row={pair.left}
                    align="left"
                    final={sideStatus(leftCard) === 'Final'}
                    gamesLeft={sport === 'nba' && leftCard ? Number(upcoming ? leftCard.games_next : leftCard.games_left) || 0 : null}
                  />
                ) : (
                  <OpenSlotTag align="left" />
                )}
                {pair.right || !pair.rightOpen ? (
                  <VsHead
                    row={pair.right}
                    align="right"
                    final={sideStatus(rightCard) === 'Final'}
                    gamesLeft={sport === 'nba' && rightCard ? Number(upcoming ? rightCard.games_next : rightCard.games_left) || 0 : null}
                  />
                ) : (
                  <OpenSlotTag align="right" />
                )}
              </div>
              {/* Pinned to the card's vertical middle; it clears the name line above and the props row below. */}
              <div className="absolute inset-x-0 top-1/2 z-[1] flex -translate-y-1/2 justify-center">
                <div className="flex items-center gap-1">
                  <PointsCell card={leftCard} row={pair.left} loading={cardsLoading} scoring={scoring} sport={sport} align="left" lockIn={lockIn} upcoming={upcoming} valueLabel={valueLabel} />
                  {bench ? (
                    <span data-fantasy-bench-pill className="rounded-md px-1.5 py-0.5 text-[10px] font-bold">
                      BN
                    </span>
                  ) : slotPillPosition(pair.label) ? (
                    <span
                      data-pos-pill={slotPillPosition(pair.label)}
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${positionPillClass(slotPillPosition(pair.label))}`}
                    >
                      {pair.label}
                    </span>
                  ) : (
                    <span
                      className="fantasy-slot-pill rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-zinc-500/60"
                      style={{ color: '#fff' }}
                    >
                      {pair.label}
                    </span>
                  )}
                  <PointsCell card={rightCard} row={pair.right} loading={cardsLoading} scoring={scoring} sport={sport} align="right" lockIn={lockIn} upcoming={upcoming} valueLabel={valueLabel} />
                </div>
              </div>
              <div className="relative z-[1] mt-[17px] grid min-h-[14px] grid-cols-2 gap-1.5 px-1">
                <CenterMarket prop={leftMain} align="left" row={pair.left} card={leftCard} />
                <CenterMarket prop={rightMain} align="right" row={pair.right} card={rightCard} />
              </div>
            </div>
            {open ? (
              <div className="relative grid grid-cols-2 gap-1.5 px-2 pb-2.5 pt-2">
                <SidePanel row={pair.left} card={leftCard} />
                <SidePanel row={pair.right} card={rightCard} />
              </div>
            ) : null}
          </li>
        )
      })}
    </>
  )
}

function OpenSlotTag({ align }) {
  return (
    <div className={`min-w-0 ${align === 'right' ? 'text-right' : ''}`}>
      <span data-fantasy-open-tag className="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
        Open slot
      </span>
    </div>
  )
}

function startSitReason(p) {
  if (!p) return ''
  if (p.why === 'bye') return 'on bye'
  if (p.why) return p.why
  return ''
}

const OPEN_SLOT_NAME = { DEF: 'D/ST', WRRB_FLEX: 'W/R', REC_FLEX: 'W/T', SUPER_FLEX: 'SFLEX' }

function openSlotName(seat) {
  const base = OPEN_SLOT_NAME[seat.slot] || seat.slot
  return seat.label.replace(seat.slot, base)
}

function kickoffShort(iso) {
  const t = Date.parse(iso || '')
  if (!Number.isFinite(t)) return ''
  return new Date(t).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

/**
 * Free agents who can still fill an open seat this week: eligible position, game not started, ranked by this
 * week's projection in league scoring.
 */
function useOpenSlotFills({ supabaseClient, detail, empty, sport }) {
  const leagueId = detail?.league?.id || null
  const positions = [...new Set(empty.flatMap((s) => slotPositions(s.slot)))].sort()
  const key = leagueId && positions.length ? `${leagueId}:${positions.join(',')}` : null
  const [loaded, setLoaded] = useState({ key: null, list: [], error: '' })
  useEffect(() => {
    if (!supabaseClient || !key) return undefined
    let alive = true
    const want = new Set(key.split(':')[1].split(','))
    ;(async () => {
      const pool = await loadOpenSlotFill(supabaseClient, leagueId, [...want])
      const candidates = (pool?.fill || []).filter((p) => want.has(fantasyPosition(p.position))).slice(0, 60)
      const cardMap = candidates.length
        ? await loadLineupCards(
            supabaseClient,
            candidates.map((p) => ({ sleeper_id: p.sleeper_id, name: p.name, position: p.position, team: p.team })),
            sport,
          )
        : {}
      const list = candidates
        .map((p) => {
          const card = cardMap[p.sleeper_id] || null
          const row = { position: p.position, injury_status: p.injury_status }
          return { p, card, pos: fantasyPosition(p.position), ...weekValue(row, card, detail?.league?.scoring, sport) }
        })
        .filter((x) => x.card && !x.card.bye && !gameLocked(x.card) && x.value > 0)
        .sort((a, b) => b.value - a.value)
      if (alive) setLoaded({ key, list, error: '' })
    })().catch((err) => alive && setLoaded({ key, list: [], error: err?.message || 'Could not load free agents.' }))
    return () => {
      alive = false
    }
  }, [supabaseClient, key, leagueId, sport, detail?.league?.scoring])
  if (!key) return { loading: false, list: [], error: '' }
  return loaded.key === key ? { ...loaded, loading: false } : { loading: true, list: [], error: '' }
}

function OpenSlotAlert({ empty, fills, host }) {
  const names = empty.map(openSlotName)
  const bySeat = empty.map((seat) => ({
    seat,
    picks: fills.list.filter((x) => slotPositions(seat.slot).includes(x.pos)).slice(0, 3),
  }))
  return (
    <div data-fantasy-open-slot className="mt-2 rounded-xl border px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[12px] font-bold">
        <AlertTriangle size={15} strokeWidth={2.25} className="shrink-0" aria-hidden />
        <span>
          {names.length === 1 ? `${names[0]} is empty` : `${names.length} empty slots: ${names.join(', ')}`}
        </span>
      </div>
      {fills.loading ? (
        <span className="edge-skel mt-1.5 block h-10 rounded-lg" data-edge-skeleton aria-label="Finding free agents" />
      ) : fills.error ? (
        <p className="mt-1 text-[11px] opacity-80">{fills.error}</p>
      ) : (
        <div className="mt-1 space-y-1.5">
          {bySeat.map(({ seat, picks }, i) => (
            <div key={`${seat.label}-${i}`}>
              {empty.length > 1 ? <div className="text-[10px] font-bold uppercase tracking-wide opacity-80">{openSlotName(seat)}</div> : null}
              {picks.length ? (
                <ul className="space-y-1">
                  {picks.map((x) => (
                    <li key={x.p.sleeper_id} className="flex items-baseline gap-1.5 text-[12px]">
                      <span className="truncate font-semibold text-zinc-100">{shortName(x.p.name, x.p.position)}</span>
                      <span className="shrink-0 text-[10px] text-zinc-500">
                        {x.pos === 'DEF' ? 'D/ST' : x.pos}
                        {x.p.team ? ` · ${x.p.team}` : ''}
                        {x.card?.kickoff ? ` · ${kickoffShort(x.card.kickoff)}` : ''}
                      </span>
                      {injuryPill(x.p.injury_status)}
                      <span className="ml-auto shrink-0 tabular-nums text-zinc-300">{x.value.toFixed(1)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-zinc-400">No free agent here still has a game this week.</p>
              )}
            </div>
          ))}
          {bySeat.some((b) => b.picks.length) ? (
            <p className="text-[10px] text-zinc-500">Available in your league, game not started. Add on {host} before kickoff.</p>
          ) : null}
        </div>
      )}
    </div>
  )
}

function openGameHub(game) {
  if (game?.id) requestLoungeSportsGameOpen(String(game.id), { direct: true, match: loungeSportsGameMatch(game) })
}

function shortTeamName(team) {
  const name = String(team?.team_name || '').trim()
  return name.length > 14 ? `${name.slice(0, 13)}…` : name
}

function LiveGameChip({ entry }) {
  const { game, left, right } = entry
  const live = game.status === 'in'
  const score = (side) => (game.status === 'pre' || side.score == null ? '' : ` ${side.score}`)
  return (
    <button
      type="button"
      onClick={() => openGameHub(game)}
      data-fantasy-live-game={game.status}
      className="shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-left"
    >
      <div className="flex items-center gap-1 text-[12px] font-bold tabular-nums text-zinc-100">
        {game.away.logo ? <img src={game.away.logo} alt="" className="h-4 w-4 object-contain" loading="lazy" /> : null}
        <span>
          {game.away.abbrev}
          {score(game.away)}
        </span>
        <span className="text-zinc-500">·</span>
        {game.home.logo ? <img src={game.home.logo} alt="" className="h-4 w-4 object-contain" loading="lazy" /> : null}
        <span>
          {game.home.abbrev}
          {score(game.home)}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold">
        <span className={live ? 'fantasy-live-pts' : 'text-zinc-500'}>{game.status_label || (live ? 'Live' : '')}</span>
        {left.length ? <span data-fantasy-live-side="left" className="rounded px-1 font-bold">{left.length}</span> : null}
        {right.length ? <span data-fantasy-live-side="right" className="rounded px-1 font-bold">{right.length}</span> : null}
      </div>
    </button>
  )
}

function LivePlayRow({ item, tagFor }) {
  const shot = useHeadshotSrc(item.position === 'DEF' ? null : item.headshotUrl || null, 96)
  const clock = item.play.period ? `Q${item.play.period}${item.play.clock ? ` ${item.play.clock}` : ''}` : ''
  return (
    <li>
      <button
        type="button"
        onClick={() => openGameHub(item.game)}
        data-fantasy-play-side={item.side}
        className="flex w-full items-start gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-2.5 py-2 text-left"
      >
        {item.position === 'DEF' && item.headshotUrl ? (
          <img src={item.headshotUrl} alt="" className="mt-0.5 h-7 w-7 shrink-0 object-contain" loading="lazy" />
        ) : shot.failed || !item.headshotUrl ? (
          <span className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-zinc-800" aria-hidden />
        ) : (
          <span className="relative mt-0.5 h-7 w-7 shrink-0 overflow-hidden rounded-full bg-zinc-800">
            <img
              src={shot.src}
              alt=""
              onError={shot.onError}
              className="absolute inset-0 h-full w-full origin-[center_30%] scale-[1.75] object-cover"
              loading="lazy"
            />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-[12px] font-bold text-zinc-100">{item.name}</span>
            {item.position ? <span className="shrink-0 text-[10px] text-zinc-500">{item.position === 'DEF' ? 'D/ST' : item.position}</span> : null}
            <span data-fantasy-live-side={item.side} className="min-w-0 truncate rounded px-1 text-[9px] font-bold uppercase">
              {tagFor(item)}
            </span>
            <span className={`ml-auto shrink-0 text-[13px] font-bold tabular-nums ${item.points >= 0 ? 'fantasy-sit-in' : 'fantasy-sit-out'}`}>
              {formatFantasyPoints(item.points)}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-400">{item.play.description}</p>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            {clock}
            {clock ? ' · ' : ''}
            {item.game.away.abbrev} @ {item.game.home.abbrev}
          </p>
        </div>
      </button>
    </li>
  )
}

/**
 * Live: games with these lineups' starters (tap opens the game hub) and the plays that scored for them.
 * NBA shows the game chips only (a scoring-play feed would be every possession).
 */
function LivePanel({ supabaseClient, page, detail, sport, active, emptyText = '' }) {
  const s = String(sport || 'nfl').toLowerCase()
  const nfl = s === 'nfl'
  const on = nfl || s === 'nba'
  const games = useLiveGames({ supabaseClient, active: active && on, leftRows: page?.roster, rightRows: page?.oppRoster, sport: s })
  const rates = useMemo(() => leagueRates(detail?.league?.scoring, 'nfl'), [detail?.league?.scoring])
  const plays = useLivePlays({ supabaseClient, active: active && nfl, games, rates })
  if (!on || !games.length) {
    return emptyText ? <p className="px-0.5 text-[11px] text-zinc-500">{emptyText}</p> : null
  }
  const leftName = shortTeamName(page?.left) || 'Left'
  const rightName = shortTeamName(page?.right) || 'Right'
  const anyLive = games.some((g) => g.game.status === 'in')
  return (
    <div data-fantasy-live className="space-y-2">
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {games.map((entry) => (
          <LiveGameChip key={entry.game.id} entry={entry} />
        ))}
      </div>
      {plays.length ? (
        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2 px-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{page?.yours ? 'Your players' : 'These lineups'}</span>
            <span className="text-[10px] text-zinc-500">Tap a play for the game</span>
          </div>
          <ul className="max-h-[22rem] space-y-1.5 overflow-y-auto overscroll-contain">
            {plays.map((item) => (
              <LivePlayRow key={item.key} item={item} tagFor={(x) => (x.side === 'left' ? leftName : rightName)} />
            ))}
          </ul>
        </div>
      ) : anyLive && nfl ? (
        <p className="px-0.5 text-[11px] text-zinc-500">No scoring plays for these starters yet.</p>
      ) : null}
    </div>
  )
}

/** Roster / Live: chips for this matchup's games that are live or final (upcoming games stay off until they start). */
function RosterGameChips({ supabaseClient, page }) {
  const all = useLiveGames({ supabaseClient, active: true, leftRows: page?.roster, rightRows: page?.oppRoster, sport: 'nfl' })
  const games = all.filter((entry) => entry.game.status === 'in' || entry.game.status === 'post')
  if (!games.length) return null
  return (
    <div data-fantasy-roster-games className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {games.map((entry) => (
        <LiveGameChip key={entry.game.id} entry={entry} />
      ))}
    </div>
  )
}

/** Every NFL player on your teams (all slots) → the leagues they are on and whether you start them anywhere. */
/** Sleeper NBA rows have no photo of their own; the lineup cards carry one (ESPN via our R2). */
function withCardHeadshots(details, cards, sport) {
  if (!details || !cards) return details
  const next = {}
  for (const [leagueId, detail] of Object.entries(details)) {
    const byTeam = detail?.rostersByTeam
    if (!byTeam || String(detail?.league?.sport || 'nfl').toLowerCase() !== sport) {
      next[leagueId] = detail
      continue
    }
    const patch = (row) => {
      const url = !row?.headshot_url && row?.sleeper_id ? cards[row.sleeper_id]?.headshot_url : null
      return url ? { ...row, headshot_url: url } : row
    }
    const rosters = {}
    for (const [teamId, rows] of Object.entries(byTeam)) rosters[teamId] = (rows || []).map(patch)
    next[leagueId] = {
      ...detail,
      rostersByTeam: rosters,
      mineRoster: (detail.mineRoster || []).map(patch),
      oppRoster: (detail.oppRoster || []).map(patch),
    }
  }
  return next
}

function myPlayers(leagues, details, sport = 'nfl') {
  const out = new Map()
  for (const lg of leagues || []) {
    if (String(lg.sport || 'nfl').toLowerCase() !== sport) continue
    const detail = details?.[lg.id]
    const mine = (detail?.teams || []).find((t) => t.is_mine)
    if (!mine) continue
    for (const row of detail.rostersByTeam?.[mine.id] || []) {
      const id = String(row?.sleeper_id || '').trim()
      if (!/^\d+$/.test(id)) continue
      const entry = out.get(id) || { leagues: [], starting: false, name: row.player_name || '', team: row.nfl_team || '', position: row.position || '' }
      const name = String(lg?.name || '').trim()
      if (!entry.leagues.includes(name)) entry.leagues.push(name)
      if (row.slot === 'starter') entry.starting = true
      out.set(id, entry)
    }
  }
  return out
}

/**
 * Lock-In calls: starters with a finished game this week (the host's score in hand) and games still to play, best
 * edge first. Lock when that score beats what his games left are worth; the lock window closes at his next tip.
 * The public API does not say what is already locked, so the panel tells managers to skip those.
 */
function lockInCalls(roster, cards, scoring) {
  const out = []
  for (const row of roster || []) {
    if (row?.slot !== 'starter' || !row.sleeper_id) continue
    const card = cards?.[row.sleeper_id]
    const score = Number(row.week_points)
    const left = Number(card?.games_left) || 0
    if (!card || card.game_status === 'in_progress' || !(Number(card.games_played) > 0) || !(score > 0) || left <= 0) continue
    const mean = projectionOf(card, scoring, 'nba', card.pos || null)
    if (!Number.isFinite(mean) || mean <= 0) continue
    const games = String(row.injury_status || '').toLowerCase() === 'out' ? left - 1 : left
    const call = lockInCall(score, mean, games)
    out.push({ row, card, score, games, after: call.after, lock: call.lock, edge: score - call.after })
  }
  return out.sort((a, b) => Number(b.lock) - Number(a.lock) || Math.abs(b.edge) - Math.abs(a.edge))
}

function useStartSitPlan(detail, cards, sport) {
  const dismissVersion = useFantasyDismissVersion()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- dismissVersion re-reads the dismissed swaps
  return useMemo(() => startSitPlanOf(detail, cards, sport), [detail, cards, sport, dismissVersion])
}

/** The best lineup minus swaps you dismissed this period (Roster, home alerts, and outlook all read this). */
function startSitPlanOf(detail, cards, sport) {
  const plan = rawStartSitPlanOf(detail, cards, sport)
  if (!plan) return plan
  const leagueId = detail?.league?.id
  const period = dismissPeriod(detail, Boolean(plan.today))
  return { ...withoutDismissed(plan, leagueId, period), dismissLeague: leagueId, dismissPeriod: period }
}

/** This week's (NBA: today's) best lineup and swaps for your team, or null without a roster / slots. */
function rawStartSitPlanOf(detail, cards, sport) {
  const mine = (detail?.teams || []).find((t) => t.is_mine)
  const roster = mine ? detail?.rostersByTeam?.[mine.id] || [] : []
  if (!roster.length) return null
  if (sport === 'nba') {
    const slots = waiverLineupSlots(detail?.league, roster, 'nba')
    if (!slots.length || !cards) return null
    const scoring = detail?.league?.scoring
    const lockIn = nbaLockIn(detail?.league?.provider, sport, detail?.league?.settings)
    // High Score sets lineups once a week (benching a starter gives up his best game so far).
    const weekly = lockIn === 'best'
    return {
      inferred: false,
      today: !weekly,
      lockIn,
      lockCalls: lockIn === 'lock' ? lockInCalls(roster, cards, scoring) : [],
      ...optimizeLineup({ roster, cards, scoring, slots, sport, nbaWeek: weekly ? { mode: lockIn, upcoming: nbaMatchupUpcoming(detail?.league) } : null }),
    }
  }
  const { slots: own, inferred } = leagueLineupSlots(detail?.league, roster)
  // Guessed from your starters, an empty K / DEF slot vanishes; if another team starts one, the league has it.
  const slots = [...own]
  if (inferred) {
    for (const pos of ['K', 'DEF']) {
      if (slots.includes(pos)) continue
      const leagueHas = Object.values(detail?.rostersByTeam || {}).some((rows) =>
        (rows || []).some((r) => r?.slot === 'starter' && fantasyPos(r.position) === pos),
      )
      if (leagueHas) slots.push(pos)
    }
  }
  if (!slots.length) return null
  return { inferred, ...optimizeLineup({ roster, cards, scoring: detail?.league?.scoring, slots, sport }) }
}

/** "M. Evans" for sentences (row labels use the all-caps `shortName`). */
function briefName(name, position) {
  if (fantasyPos(position) === 'DEF') return String(name || 'DEF')
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return parts[0] || ''
  return `${parts[0].charAt(0).toUpperCase()}. ${parts.slice(1).join(' ')}`
}

function statusWord(row) {
  const key = injuryKey(row?.injury_status)
  if (/\bir\b|reserve/i.test(String(row?.injury_status || ''))) return 'on IR'
  if (key === 'out') return row?.news_status ? 'ruled out' : 'out'
  return 'doubtful'
}

/** Starters still to play who are Out / Doubtful, each with the Start/Sit swap that covers him (if any). */
function starterStatusAlerts(detail, cards, plan) {
  const mine = (detail?.teams || []).find((t) => t.is_mine)
  const rows = mine ? detail?.rostersByTeam?.[mine.id] || [] : []
  const out = []
  for (const row of rows) {
    if (row?.slot !== 'starter' || !row.sleeper_id) continue
    const key = injuryKey(row.injury_status)
    if (key !== 'out' && key !== 'doubtful') continue
    const card = cards?.[row.sleeper_id]
    if (card?.bye || gameLocked(card)) continue
    // NBA plans today: an injured starter matters when his team tips today and he has not played.
    if (plan?.today && card?.today !== 'pre') continue
    // You dismissed the swap that covers him: no nag (and not a false "no healthy backup").
    if ((plan?.dismissed || []).some((m) => m.bench?.row?.sleeper_id === row.sleeper_id)) continue
    const move = (plan?.moves || []).find((m) => m.bench?.row?.sleeper_id === row.sleeper_id) || null
    const name = briefName(row.player_name, row.position)
    out.push({
      id: String(row.sleeper_id),
      move,
      text: move
        ? `${name} ${statusWord(row)}: start ${briefName(move.start.row.player_name, move.start.row.position)} +${move.gain.toFixed(1)}`
        : `${name} ${statusWord(row)}: no healthy backup`,
    })
  }
  return out
}

/**
 * Live banner: starters ruled out or doubtful (named, with the swap), then any other swaps and open slots.
 * One tap opens Roster. Hidden when there is nothing to do.
 */
/** What needs doing in this league (hurt starters with the swap, locks, other swaps, open slots), one line each. */
function leagueAlertLines(plan, detail, cards) {
  if (!plan) return []
  const named = starterStatusAlerts(detail, cards, plan)
  const covered = new Set(named.map((a) => a.move).filter(Boolean))
  const otherMoves = plan.moves.filter((m) => !covered.has(m))
  const parts = []
  if (plan.empty.length) {
    const names = plan.empty.map(openSlotName)
    parts.push(names.length === 1 ? `${names[0]} is empty` : `${names.length} empty slots`)
  }
  if (otherMoves.length) {
    const gain = otherMoves.reduce((acc, m) => acc + m.gain, 0)
    parts.push(`${otherMoves.length}${named.length ? ' more' : ''} swap${otherMoves.length > 1 ? 's' : ''}, +${gain.toFixed(1)} proj`)
  }
  // Lock-In: name the scores worth locking before the next tip (waits are not urgent).
  const locks = (plan.lockCalls || []).filter((c) => c.lock).slice(0, 2)
  const lockLines = locks.map((c) => `Lock in ${briefName(c.row.player_name, c.row.position)} (${c.score.toFixed(1)}) before ${kickoffShort(c.card.kickoff) || 'his next game'}`)
  return [...named.map((a) => a.text), ...lockLines, ...(parts.length ? [parts.join(' · ')] : [])]
}

function LiveAlerts({ detail, cards, cardsLoading, sport, onOpen, prefix = '' }) {
  const plan = useStartSitPlan(detail, cards, sport)
  if (cardsLoading || !plan) return null
  const lines = leagueAlertLines(plan, detail, cards)
  if (!lines.length) return null
  return (
    <button
      type="button"
      onClick={onOpen}
      data-fantasy-open-slot
      className="flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-[12px] font-bold"
    >
      <AlertTriangle size={15} strokeWidth={2.25} className="shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        {lines.map((line, i) => (
          <span key={line} className="block truncate">
            {prefix && i === 0 ? <span className="opacity-80">{prefix}: </span> : null}
            {line}
          </span>
        ))}
      </span>
      <span className="shrink-0 text-[11px] font-semibold opacity-80">Roster</span>
    </button>
  )
}

/** Start/Sit: best lineup for this week from your own roster, as swap cards. Moves happen on the host. */
function StartSitPanel({ supabaseClient, detail, cards, sport }) {
  const plan = useStartSitPlan(detail, cards, sport)
  const empty = plan?.empty || []
  const fills = useOpenSlotFills({ supabaseClient, detail, empty, sport })
  const lockCalls = plan?.lockCalls || []
  // Dismissed swaps come back from the count on the Roster tab.
  if (!plan || (!plan.moves.length && !empty.length && !lockCalls.length)) return null
  const host = providerLabel(detail?.league?.provider)
  const moves = plan.moves
  return (
    <div data-fantasy-start-sit className="fantasy-card-lift rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-bold text-zinc-100">
          {plan.today ? "Today's lineup" : moves.length ? 'Suggested moves' : 'Open lineup slot'}
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
            moves.length ? 'fantasy-sit-gain' : 'fantasy-sit-ok'
          }`}
        >
          {moves.length ? `+${plan.gain.toFixed(1)} proj` : `${plan.projected.toFixed(1)} proj`}
        </span>
      </div>
      {moves.length ? (
        <ul className="mt-2 space-y-1.5">
          {moves.map((m) => (
            <li
              key={`${m.start.row.sleeper_id}-${m.bench?.row?.sleeper_id || 'open'}`}
              className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 px-2.5 py-2"
            >
              <div className="min-w-0 flex-1 space-y-0.5 text-[12px]">
                <div className="flex items-baseline gap-1.5">
                  <span className="fantasy-sit-in w-11 shrink-0 text-[10px] font-bold uppercase">Start</span>
                  <span className="truncate font-semibold text-zinc-100">{shortName(m.start.row.player_name, m.start.row.position)}</span>
                  <span className="shrink-0 text-[10px] text-zinc-500">{m.start.pos}</span>
                  <span className="ml-auto shrink-0 tabular-nums text-zinc-300">{m.start.value.toFixed(1)}</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="fantasy-sit-out w-11 shrink-0 text-[10px] font-bold uppercase">Bench</span>
                  <span className="truncate text-zinc-300">
                    {m.bench ? shortName(m.bench.row.player_name, m.bench.row.position) : 'Empty slot'}
                  </span>
                  {m.bench ? <span className="shrink-0 text-[10px] text-zinc-500">{m.bench.pos}</span> : null}
                  {startSitReason(m.bench) ? (
                    <span className="shrink-0 text-[10px] font-semibold text-rose-300">{startSitReason(m.bench)}</span>
                  ) : null}
                  <span className="ml-auto shrink-0 tabular-nums text-zinc-500">{m.bench ? m.bench.value.toFixed(1) : '-'}</span>
                </div>
              </div>
              <span className="fantasy-sit-gain shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums">
                +{m.gain.toFixed(1)}
              </span>
              <button
                type="button"
                data-fantasy-dismiss-move
                aria-label={`Dismiss: start ${m.start.row.player_name}`}
                onClick={() => dismissMove(plan.dismissLeague, plan.dismissPeriod, moveDismissKey(m))}
                className="-mr-1 shrink-0 rounded-full p-1 text-zinc-500 hover:text-zinc-200"
              >
                <X size={14} strokeWidth={2.25} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {empty.length ? <OpenSlotAlert empty={empty} fills={fills} host={host} /> : null}
      {lockCalls.length ? (
        <div data-fantasy-lock-calls className="mt-2">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Lock-in calls</div>
          <ul className="space-y-1.5">
            {lockCalls.map((c) => (
              <li
                key={c.row.sleeper_id}
                className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 px-2.5 py-2 text-[12px]"
              >
                <span className={`${c.lock ? 'fantasy-sit-in' : 'fantasy-sit-out'} w-11 shrink-0 text-[10px] font-bold uppercase`}>
                  {c.lock ? 'Lock' : 'Wait'}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold text-zinc-100">{shortName(c.row.player_name, c.row.position)}</span>{' '}
                  <span className="text-zinc-500">
                    {c.score.toFixed(1)} vs ~{c.after.toFixed(1)} from {c.games} game{c.games === 1 ? '' : 's'} left
                  </span>
                </span>
                {c.card.kickoff ? <span className="shrink-0 text-[10px] text-zinc-500">{kickoffShort(c.card.kickoff)}</span> : null}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] text-zinc-500">
            One game counts each week. Lock on {host} before his next tip; skip any you already locked.
          </p>
        </div>
      ) : null}
      <p className="mt-2 text-[10px] text-zinc-500">
        {moves.length ? `Make the swap on ${host}.` : ''}
        {plan.locked
          ? `${moves.length ? ' ' : ''}${plan.locked} ${plan.today ? 'already tipped today' : 'already playing'}, locked.`
          : ''}
        {plan.inferred ? ' Slots read from your current lineup; Sync to load league slots.' : ''}
      </p>
    </div>
  )
}

/** NBA games-left planner: my roster by night (opponent, back-to-backs), nightly starts, starts left vs opponent. */
function NbaSchedulePanel({ page, cards, league }) {
  const upcoming = nbaMatchupUpcoming(league)
  const [pick, setPick] = useState(null)
  const wk = pick ?? (upcoming ? 1 : 0)
  const plan = useMemo(() => {
    const slots = waiverLineupSlots(league, page?.roster || [], 'nba')
    if (!slots.length || !page?.roster?.length) return null
    return schedulePlan({ mine: page.roster, opp: page.oppRoster, cards, slots, wk })
  }, [league, page, cards, wk])
  if (!plan || !plan.dates.length) return null
  const oppName = shortTeamName(page?.right) || 'Opponent'
  const lockIn = nbaLockIn(league?.provider, 'nba', league?.settings)

  return (
    <div data-fantasy-nba-schedule className="fantasy-card-lift rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-bold text-zinc-100">Schedule</div>
        <div className="flex rounded-full border border-zinc-800 p-0.5">
          {[
            [0, 'This week'],
            [1, 'Next week'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPick(id)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${wk === id ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1 text-[11px] text-zinc-300">
        <span className="font-bold tabular-nums text-zinc-100">{plan.mineLeft}</span> starts left
        {plan.oppLeft != null ? (
          <>
            {' '}
            vs <span className="font-bold tabular-nums text-zinc-100">{plan.oppLeft}</span> for {oppName}
            {plan.mineLeft !== plan.oppLeft ? (
              <span className={`ml-1 font-semibold ${plan.mineLeft > plan.oppLeft ? 'fantasy-sit-in' : 'fantasy-sit-out'}`}>
                ({plan.mineLeft > plan.oppLeft ? '+' : ''}
                {plan.mineLeft - plan.oppLeft})
              </span>
            ) : null}
          </>
        ) : null}
      </div>
      <div className="mt-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <table className="w-full table-fixed border-separate border-spacing-0 text-[10px]">
          <colgroup>
            <col className="w-[4.75rem]" />
            {plan.dates.map((d) => (
              <col key={d} />
            ))}
            <col className="w-5" />
          </colgroup>
          <thead>
            <tr>
              <th className="pr-1" />
              {plan.dates.map((d) => (
                <th key={d} className={`pb-1 text-center font-bold uppercase ${d === plan.today ? 'text-sky-400' : 'text-zinc-500'}`}>
                  {nightLabel(d).slice(0, 2)}
                </th>
              ))}
              <th className="pb-1 text-right font-semibold text-zinc-500">L</th>
            </tr>
          </thead>
          <tbody>
            {plan.rows.map((p) => (
              <tr key={p.id} className={p.row.slot === 'bench' ? 'opacity-80' : ''}>
                <td className="truncate py-0.5 pr-1 font-semibold text-zinc-200">
                  {shortName(p.row.player_name, p.row.position)}
                </td>
                {plan.dates.map((d) => {
                  const g = p.games.get(d)
                  const past = d < plan.today || g?.state === 'post'
                  return (
                    <td key={d} className="py-0.5 text-center">
                      {g ? (
                        <span
                          data-fantasy-sched-b2b={g.b2b && !past ? '' : undefined}
                          className={`inline-block rounded px-[1px] text-[8.5px] font-semibold tracking-tight ${
                            past || p.out ? 'text-zinc-600' : g.state === 'in' ? 'fantasy-sit-gain' : 'bg-zinc-800 text-zinc-200'
                          }`}
                        >
                          {g.home ? '' : '@'}
                          {g.opp}
                        </span>
                      ) : (
                        <span className="text-zinc-700">·</span>
                      )}
                    </td>
                  )
                })}
                <td className="py-0.5 text-right font-bold tabular-nums text-zinc-200">
                  {p.out ? <span className="text-[8px] text-rose-300">OUT</span> : p.left}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-1 pr-1 font-semibold text-zinc-500">Starting</td>
              {plan.dates.map((d) => {
                const n = plan.starts[d]
                return (
                  <td key={d} className="pt-1 text-center text-[9px] tabular-nums">
                    {n == null ? (
                      <span className="text-zinc-700">-</span>
                    ) : (
                      <span className={`font-bold ${n < plan.slots ? 'fantasy-sit-out' : 'text-zinc-400'}`}>
                        {n}/{plan.slots}
                      </span>
                    )}
                  </td>
                )
              })}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-zinc-500">
        Starts = lineup slots you can fill with healthy players who play that night. L = games left. Underlined: second night of a back-to-back (rest risk).
        {lockIn === 'best'
          ? " High Score counts each starter's best game, so extra games are extra shots at a big night."
          : lockIn
            ? ' Lock-In counts one game a player, so extra games are extra shots at a big night.'
            : ''}
      </p>
    </div>
  )
}

const WAIVER_POS = ['All', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF']
const NBA_WAIVER_POS = ['All', 'PG', 'SG', 'SF', 'PF', 'C']

function WaiverAvatar({ url, pos, team }) {
  const shot = useHeadshotSrc(pos === 'DEF' ? null : url, 160)
  if (pos === 'DEF' && team) {
    return <img src={`/sports/nfl/logos/${team}.png`} alt="" className="h-9 w-9 shrink-0 object-contain" loading="lazy" decoding="async" />
  }
  if (shot.failed) return <span className="h-9 w-9 shrink-0 rounded-full bg-zinc-800" aria-hidden />
  return (
    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-zinc-800">
      <img
        src={shot.src}
        alt=""
        className="absolute inset-0 h-full w-full origin-[center_30%] scale-[1.75] object-cover"
        loading="lazy"
        decoding="async"
        onError={shot.onError}
      />
    </span>
  )
}

function FlipCard({ flip, myTeamName, host, odds }) {
  const [open, setOpen] = useState(false)
  const status = flip.lost.h.injury === 'long' ? 'IR' : flip.lost.h.injury === 'doubtful' ? 'doubtful' : 'out'
  return (
    <li className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-2.5 py-2">
      <div className="flex items-center gap-2.5">
        <WaiverAvatar url={flip.pickup.entry.headshot_url} pos={flip.pickup.pos} team={flip.pickup.team} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="fantasy-sit-in shrink-0 text-[10px] font-bold uppercase">Pick up</span>
            <span className="truncate text-[12px] font-bold text-zinc-100">{shortName(flip.pickup.name, flip.pickup.pos)}</span>
            <span className="shrink-0 text-[10px] text-zinc-500">
              {flip.pickup.pos}
              {flip.pickup.team ? ` · ${flip.pickup.team}` : ''}
            </span>
          </div>
          <div className="line-clamp-2 text-[10px] leading-snug text-zinc-400">
            {flip.team.team_name} lost {flip.lost.name} ({status}); {flip.pickup.name.split(' ').slice(-1)[0]} fills it (+{flip.fillGain.toFixed(1)}/wk for them)
          </div>
          {odds ? (
            <div className={`mt-0.5 text-[10px] font-semibold leading-snug ${odds.likely ? 'fantasy-sit-in' : 'fantasy-sit-out'}`}>{odds.text}</div>
          ) : null}
        </div>
      </div>
      <div className="mt-1.5 rounded-lg border border-zinc-800 px-2 py-1.5">
        <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-zinc-500">Then offer {flip.team.team_name}</div>
        <div className="grid grid-cols-2 gap-2">
          <TradeSide label="You give" players={flip.give} />
          <TradeSide label="You get" players={flip.get} />
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold tabular-nums">
          <span className="fantasy-sit-in">+{flip.myGain.toFixed(1)}/wk you</span>
          <span className="text-zinc-500">
            {' · '}
            {flip.theirGain >= 0 ? '+' : ''}
            {flip.theirGain.toFixed(1)} them
          </span>
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-200"
        >
          {open ? 'Close' : 'Compose offer'}
        </button>
      </div>
      {open ? (
        <>
          <ComposeOffer
            offer={flip}
            myTeamName={myTeamName}
            initialText={composeFlipMessage(flip, myTeamName)}
            casualText={composeFlipMessage(flip, myTeamName, 'casual')}
          />
          <p className="mt-1 text-[10px] text-zinc-500">Claim {flip.pickup.name} on {host} first (you need an open roster spot), then send it.</p>
        </>
      ) : null}
    </li>
  )
}

function SniperView({ supabaseClient, detail, sport }) {
  const leagueId = detail?.league?.id || null
  const rosterStamp = useRosterStamp(detail)
  const [loaded, setLoaded] = useState({ id: null, data: null, error: '' })
  useEffect(() => {
    if (!supabaseClient || !leagueId) return undefined
    let alive = true
    loadSniper(supabaseClient, leagueId)
      .then((data) => alive && setLoaded({ id: leagueId, data, error: '' }))
      .catch((err) => alive && setLoaded({ id: leagueId, data: null, error: err?.message || 'Could not load sniper picks.' }))
    return () => {
      alive = false
    }
  }, [supabaseClient, leagueId, rosterStamp])
  const state = loaded.id === leagueId ? { ...loaded, loading: false } : { data: null, error: '', loading: true }
  const scoring = detail?.league?.scoring
  const boom = useMemo(() => rankBoom({ sniper: state.data?.sniper, scoring, sport }).slice(0, 6), [state.data, scoring, sport])
  const cuffs = useMemo(() => rankHandcuffs({ sniper: state.data?.sniper, scoring, sport }), [state.data, scoring, sport])
  const week = state.data?.sniper?.week
  const anyProps = (state.data?.sniper?.boom || []).some((b) => b.props?.length)
  const mineTeam = (detail?.teams || []).find((t) => t.is_mine) || null
  const flips = useMemo(() => {
    if (!state.data?.league_players?.length || !mineTeam) return []
    const slots = waiverLineupSlots(detail?.league, detail?.rostersByTeam?.[mineTeam.id] || [], sport)
    return findFlips({ values: state.data, pool: state.data, detail, scoring, slots, sport })
  }, [state.data, detail, mineTeam, scoring, sport])
  const host = providerLabel(detail?.league?.provider)
  const waiverWin = waiverWindow(detail?.league)
  const continuous = waiverWin.type === 'continuous'

  if (state.loading) {
    return (
      <div className="mt-2 space-y-1.5" data-edge-skeleton aria-label="Loading sniper picks">
        {[0, 1, 2].map((i) => (
          <span key={i} className="edge-skel block h-12 rounded-xl" />
        ))}
      </div>
    )
  }
  if (state.error) return <p className="mt-2 text-[12px] text-rose-300">{state.error}</p>

  const cuffRow = (h, verb) => (
    <li key={`${h.starter.sleeper_id}-${h.backup.sleeper_id}`} className="flex items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-950/60 px-2.5 py-2">
      <WaiverAvatar url={h.backup.headshot_url} pos={h.backup.position} team={h.backup.team} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-[12px] font-bold text-zinc-100">{shortName(h.backup.name, h.backup.position)}</span>
          {injuryPill(h.backup.injury_status)}
          <span className="shrink-0 text-[10px] text-zinc-500">
            RB{h.backup.depth_rank || 2} · {h.backup.team}
          </span>
        </div>
        <div className="truncate text-[10px] text-zinc-400">
          {verb} {h.starter.name}
          {h.starter.injury_status ? ` (${h.starter.injury_status})` : ''}
        </div>
      </div>
      <span className="shrink-0 text-[12px] font-bold tabular-nums text-zinc-100">{h.proj.toFixed(1)}</span>
    </li>
  )

  return (
    <div className="mt-2 space-y-3">
      {flips.length && (waiverWin.open || continuous) ? (
        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Snipe &amp; flip</span>
            <span className="text-[10px] text-zinc-500">
              {continuous
                ? 'Free agents, first come'
                : `Waivers run ${waiverWin.label}${waiverWin.hoursLeft != null ? ` · ${Math.max(1, Math.round(waiverWin.hoursLeft))}h left` : ''}`}
            </span>
          </div>
          <ul className="space-y-1.5">
            {flips.map((f) => (
              <FlipCard
                key={`${f.team.id}-${f.pickup.id}`}
                flip={f}
                myTeamName={mineTeam?.team_name || ''}
                host={host}
                odds={claimOdds({
                  league: detail?.league,
                  teams: detail?.teams || [],
                  myTeamId: mineTeam?.id,
                  rivalsWanting: f.rivalsWanting || [],
                })}
              />
            ))}
          </ul>
          {!waiverWin.known ? (
            <p className="mt-1 text-[10px] text-zinc-500">Waiver time assumed Wed 3 AM ET; Sync to load this league&apos;s waiver order and schedule.</p>
          ) : null}
        </div>
      ) : flips.length ? (
        <p className="text-[10px] text-zinc-500">
          Snipe &amp; flip opens Sunday 4 PM ET once the week&apos;s games are in, and runs until waivers process ({waiverWin.label}).
        </p>
      ) : null}
      <div>
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Boom picks{week ? ` · wk ${week}` : ''}</span>
          <span className="text-[10px] text-zinc-500">Upside, not a start</span>
        </div>
        {boom.length ? (
          <ul className="space-y-1.5">
            {boom.map((pick) => (
              <li key={pick.entry.sleeper_id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-2.5 py-2">
                <div className="flex items-center gap-2.5">
                  <WaiverAvatar url={pick.entry.headshot_url} pos={pick.entry.position} team={pick.entry.team} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="truncate text-[12px] font-bold text-zinc-100">{shortName(pick.entry.name, pick.entry.position)}</span>
                      {injuryPill(pick.entry.injury_status)}
                      <span className="shrink-0 text-[10px] text-zinc-500">
                        {pick.entry.position} · {pick.entry.team}
                        {pick.entry.opponent ? ` ${pick.entry.home ? 'vs' : '@'} ${pick.entry.opponent}` : ''}
                      </span>
                    </div>
                    <div className="line-clamp-2 text-[10px] leading-snug text-zinc-400">{pick.reasons.join(' · ')}</div>
                  </div>
                  <span className="shrink-0 text-[12px] font-bold tabular-nums text-zinc-100">{pick.proj.toFixed(1)}</span>
                </div>
                {pick.prop ? (
                  <div className="mt-1.5 flex items-center justify-end gap-1.5">
                    <span className="fantasy-prop-label min-w-0 truncate text-[10px] font-semibold text-sky-300">{shortPropLabel(pick.prop.label)}</span>
                    <YesNoPills
                      prop={pick.prop}
                      row={{ player_name: pick.entry.name, nfl_team: pick.entry.team }}
                      card={{ opponent: pick.entry.opponent, home: pick.entry.home }}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-zinc-500">No available player stands out for this week yet.</p>
        )}
        {!anyProps && sport !== 'nba' ? (
          <p className="mt-1 text-[10px] text-zinc-500">Kalshi player markets for wk {week} are not open yet; picks use the depth chart and matchups until they are.</p>
        ) : null}
      </div>
      {sport === 'nba' ? null : (
      <div>
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Handcuffs</div>
        {cuffs.mine.length || cuffs.block.length ? (
          <div className="space-y-2">
            {cuffs.mine.length ? <ul className="space-y-1.5">{cuffs.mine.map((h) => cuffRow(h, 'Next up behind your'))}</ul> : null}
            {cuffs.block.length ? (
              <div>
                <div className="mb-1 text-[10px] text-zinc-500">Block a rival</div>
                <ul className="space-y-1.5">{cuffs.block.map((h) => cuffRow(h, 'Backup to'))}</ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-[12px] text-zinc-500">No free handcuffs behind rostered RB1s.</p>
        )}
      </div>
      )}
    </div>
  )
}

/**
 * Every team's player ids. The waiver / sniper / trade pools are read from the saved rosters, so they reload when a
 * sync changes any roster (a read during an older sync could list a team's players as free agents).
 */
function useRosterStamp(detail) {
  return useMemo(() => {
    const byTeam = detail?.rostersByTeam || {}
    return Object.keys(byTeam)
      .sort()
      .map((teamId) => `${teamId}:${(byTeam[teamId] || []).map((r) => r.sleeper_id || r.player_name || '').sort().join(',')}`)
      .join('|')
  }, [detail])
}

const KEEP_LABEL = {
  drop: 'Drop: lowest rest of season',
  need: 'Keep: needed to fill your lineup',
  better: 'Keep: worth more than the pickup',
  market: 'Keep: market value too high to cut',
  cuff: 'Keep: handcuff',
  higher: 'Keep: worth more than the drop',
}

/** Tap-open detail for a waiver pick: the lineup swap, the pickup's numbers, and why each bench player stays or goes. */
function WaiverBreakdown({ pick, span }) {
  const ros = pick.ros
  const unit = ros ? 'rest of season' : 'next weeks'
  const fmt = (n) => (Number.isFinite(n) ? n.toFixed(1) : '-')
  return (
    <div data-fantasy-waiver-breakdown className="mt-2 space-y-2 border-t border-zinc-800 pt-2 text-[10px] leading-snug">
      <div>
        <div className="font-bold uppercase tracking-wide text-zinc-500">Pickup</div>
        <div className="text-zinc-300">
          {pick.cand.name}: {fmt(pick.candWeekly)}/wk {unit}
          {ros ? ` · ${fmt(pick.cand.value)}/wk ${span || 'next weeks'}` : ''}
        </div>
      </div>
      {pick.replaced ? (
        <div>
          <div className="font-bold uppercase tracking-wide text-zinc-500">Lineup</div>
          <div className="text-zinc-300">
            {pick.cand.name} starts, {pick.replaced.name} ({fmt(pick.replaced.rosWeekly ?? pick.replaced.value)}/wk) moves to the bench:
            +{pick.gain.toFixed(1)}/wk {unit}
          </div>
        </div>
      ) : null}
      {pick.bench?.length ? (
        <div>
          <div className="font-bold uppercase tracking-wide text-zinc-500">Bench after the move</div>
          <ul className="mt-0.5 space-y-0.5">
            {pick.bench.map(({ p, weekly, near, keep }) => (
              <li key={p.id} className="flex items-baseline justify-between gap-2">
                <span className={`min-w-0 truncate ${keep === 'drop' ? 'fantasy-sit-out font-semibold' : 'text-zinc-300'}`}>
                  {shortName(p.name, p.row?.position)} <span className="text-zinc-500">{p.pos}</span>
                </span>
                <span className="shrink-0 tabular-nums text-zinc-400">
                  {fmt(weekly)}/wk{ros ? ` · ${fmt(near)} soon` : ''}
                </span>
                <span className={`w-[44%] shrink-0 text-right ${keep === 'drop' ? 'fantasy-sit-out' : 'text-zinc-500'}`}>
                  {KEEP_LABEL[keep] || KEEP_LABEL.higher}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/** Waivers: best adds available in this league for your lineup, with a safe drop. Claims happen on the host. */
const NIGHT_LABEL = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' })
const nightLabel = (date) => NIGHT_LABEL.format(new Date(`${date}T12:00:00Z`))

/** NBA streaming: open lineup slots by night and the available players who fill them (daily, all-games leagues). */
function StreamView({ state, detail, rosterRows, sport, host }) {
  const league = detail?.league
  const upcoming = nbaMatchupUpcoming(league)
  const unit = league?.settings?.category_value ? 'val' : 'pts'
  const plan = useMemo(() => {
    if (!state.data?.players?.length || !rosterRows.length) return { days: [], picks: [] }
    return streamPlan({ pool: state.data, rosterRows, scoring: league?.scoring, slots: waiverLineupSlots(league, rosterRows, sport), upcoming })
  }, [state.data, rosterRows, league, sport, upcoming])
  const picks = plan.picks.slice(0, 8)
  const openNights = plan.days.filter((d) => d.open > 0).length
  // Every pick is one move from today's roster; when they all cut the same player they are alternatives.
  const sameDrop = picks.length > 1 && picks.every((p) => p.drop.id === picks[0].drop.id) ? picks[0].drop : null
  const nights = (list) => list.map(nightLabel).join(', ')

  return (
    <>
      <div className="mt-1 text-[10px] text-zinc-500">
        {upcoming ? 'Next week (your matchup starts then)' : 'Nights left this week'} · open lineup slots
      </div>
      {state.loading ? (
        <div className="mt-2 space-y-1.5" data-edge-skeleton aria-label="Loading streams">
          {[0, 1, 2].map((i) => (
            <span key={i} className="edge-skel block h-12 rounded-xl" />
          ))}
        </div>
      ) : state.error ? (
        <p className="mt-2 text-[12px] text-rose-300">{state.error}</p>
      ) : (
        <>
          {plan.days.length ? (
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {plan.days.map((d) => (
                <div
                  key={d.date}
                  className={`shrink-0 rounded-lg border px-2 py-1 text-center ${d.open ? 'fantasy-sit-gain border-transparent' : 'border-zinc-800 bg-zinc-900'}`}
                >
                  <div className="text-[10px] font-bold uppercase text-zinc-400">{nightLabel(d.date)}</div>
                  <div className={`text-[11px] font-bold tabular-nums ${d.open ? '' : 'text-zinc-500'}`}>{d.open ? `${d.open} open` : 'Full'}</div>
                </div>
              ))}
            </div>
          ) : null}
          {!plan.days.length ? (
            <p className="mt-2 text-[12px] text-zinc-500">No games left on the schedule this week.</p>
          ) : !openNights ? (
            <p className="mt-2 text-[12px] text-zinc-500">Every lineup slot has someone playing each night left. Nothing to stream.</p>
          ) : !picks.length ? (
            <p className="mt-2 text-[12px] text-zinc-500">No available player fills your open nights better than your bench.</p>
          ) : (
            <>
            {sameDrop ? (
              <p className="mt-2 text-[11px] text-zinc-400">
                Pick one: each swaps out <span className="font-semibold text-zinc-200">{shortName(sameDrop.name, sameDrop.pos)}</span>. Sync after the
                add to plan a second stream.
              </p>
            ) : null}
            <ul className="mt-2 space-y-1.5">
              {picks.map((pick) => (
                <li key={pick.cand.id} className="flex items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-950/60 px-2.5 py-2">
                  <WaiverAvatar url={pick.cand.entry.headshot_url} pos={pick.cand.pos} team={pick.cand.entry.team} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="truncate text-[12px] font-bold text-zinc-100">{shortName(pick.cand.name, pick.cand.entry.position)}</span>
                      {injuryPill(pick.cand.entry.injury_status)}
                      <span className="shrink-0 text-[10px] text-zinc-500">
                        {(pick.cand.elig || [pick.cand.pos]).join('/')}
                        {pick.cand.entry.team ? ` · ${pick.cand.entry.team}` : ''}
                      </span>
                    </div>
                    <div className="truncate text-[10px] leading-snug text-zinc-400">
                      Starts {nights(pick.fills)} · {pick.cand.value.toFixed(1)} {unit}/game
                    </div>
                    <div className="truncate text-[10px] text-zinc-500">
                      Drop <span className="fantasy-sit-out font-semibold">{shortName(pick.drop.name, pick.drop.pos)}</span>
                      {pick.lost.length ? ` (starts ${nights(pick.lost)})` : ' (sits every night left)'}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="fantasy-sit-gain rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums">+{pick.gain.toFixed(1)}</span>
                    <span className="text-[9px] text-zinc-500">{unit} this wk</span>
                  </div>
                </li>
              ))}
            </ul>
            </>
          )}
        </>
      )}
      <p className="mt-2 text-[10px] text-zinc-500">
        {Number(league?.settings?.max_weekly_adds) > 0
          ? `Each stream uses one of your ${league.settings.max_weekly_adds} adds a week.`
          : "Each stream uses an add, so check your league's weekly add limit."}{' '}
        Same-night adds work only if {host} starts them that day.
      </p>
    </>
  )
}

function WaiversPanel({ supabaseClient, detail, sport }) {
  const leagueId = detail?.league?.id || null
  const rosterStamp = useRosterStamp(detail)
  const [loaded, setLoaded] = useState({ id: null, data: null, error: '' })
  const [pos, setPos] = useState('All')
  const [view, setView] = useState('adds')
  const [openPick, setOpenPick] = useState(null)
  useEffect(() => {
    if (!supabaseClient || !leagueId) return undefined
    let alive = true
    loadWaivers(supabaseClient, leagueId)
      .then((data) => alive && setLoaded({ id: leagueId, data, error: '' }))
      .catch((err) => alive && setLoaded({ id: leagueId, data: null, error: err?.message || 'Could not load waivers.' }))
    return () => {
      alive = false
    }
  }, [supabaseClient, leagueId, rosterStamp])
  const state = loaded.id === leagueId ? { ...loaded, loading: false } : { id: leagueId, data: null, error: '', loading: true }

  const mine = (detail?.teams || []).find((t) => t.is_mine) || null
  const rosterRows = useMemo(() => (mine ? detail?.rostersByTeam?.[mine.id] || [] : []), [detail, mine])
  const picks = useMemo(() => {
    if (!state.data?.players?.length || !rosterRows.length) return []
    const slots = waiverLineupSlots(detail?.league, rosterRows, sport)
    if (!slots.length) return []
    return rankWaivers({ pool: state.data, rosterRows, scoring: detail?.league?.scoring, slots, sport })
  }, [state.data, rosterRows, detail, sport])

  const host = providerLabel(detail?.league?.provider)
  const weeks = state.data?.weeks || []
  const span = weeks.length ? `wk ${weeks[0]}${weeks.length > 1 ? `-${weeks[weeks.length - 1]}` : ''}` : ''
  // Streaming needs daily lineups where every game counts (Lock-In counts one game a week).
  const canStream = sport === 'nba' && Boolean(detail?.league?.settings?.daily_lineups) && !nbaLockIn(detail?.league?.provider, sport, detail?.league?.settings)
  const tabs = [['adds', 'Adds'], ...(canStream ? [['stream', 'Stream']] : []), ['sniper', 'Sniper']]
  const tab = tabs.some(([id]) => id === view) ? view : 'adds'
  // NBA chips match any eligible position (a PG/SG shows under both).
  const shown = picks.filter((p) => pos === 'All' || p.cand.pos === pos || (p.cand.elig || []).includes(pos)).slice(0, 10)

  return (
    <div data-fantasy-waivers className="fantasy-card-lift rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-bold text-zinc-100">Waivers</div>
        <div className="flex rounded-full border border-zinc-800 p-0.5">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tab === id ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'sniper' ? (
        <SniperView supabaseClient={supabaseClient} detail={detail} sport={sport} />
      ) : tab === 'stream' ? (
        <StreamView state={state} detail={detail} rosterRows={rosterRows} sport={sport} host={host} />
      ) : (
      <>
      <div className="mt-1 text-[10px] text-zinc-500">Available in your league{span ? ` · ${span} avg` : ''}</div>
      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(sport === 'nba' ? NBA_WAIVER_POS : WAIVER_POS).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPos(p)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              pos === p ? 'bg-zinc-100 text-zinc-950' : 'border border-zinc-800 bg-zinc-900 text-zinc-300'
            }`}
          >
            {p}
          </button>
        ))}
      </div>
      {state.loading ? (
        <div className="mt-2 space-y-1.5" data-edge-skeleton aria-label="Loading waivers">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="edge-skel block h-12 rounded-xl" />
          ))}
        </div>
      ) : state.error ? (
        <p className="mt-2 text-[12px] text-rose-300">{state.error}</p>
      ) : !shown.length ? (
        <p className="mt-2 text-[12px] text-zinc-500">
          {picks.length ? `No ${pos} upgrades available right now.` : 'No available player beats your current roster right now.'}
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {shown.map((pick) => (
            <li key={pick.cand.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-2.5 py-2">
            <div
              role="button"
              tabIndex={0}
              aria-expanded={openPick === pick.cand.id}
              onClick={() => setOpenPick((id) => (id === pick.cand.id ? null : pick.cand.id))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setOpenPick((id) => (id === pick.cand.id ? null : pick.cand.id))
                }
              }}
              className="flex cursor-pointer items-center gap-2.5 touch-manipulation [-webkit-tap-highlight-color:transparent]"
            >
              <WaiverAvatar url={pick.cand.entry.headshot_url} pos={pick.cand.pos} team={pick.cand.entry.team} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="truncate text-[12px] font-bold text-zinc-100">
                    {shortName(pick.cand.name, pick.cand.entry.position)}
                  </span>
                  {injuryPill(pick.cand.entry.injury_status)}
                  <span className="shrink-0 text-[10px] text-zinc-500">
                    {pick.cand.pos}
                    {pick.cand.entry.team ? ` · ${pick.cand.entry.team}` : ''}
                  </span>
                </div>
                {pick.reasons[0] ? <div className="line-clamp-2 text-[10px] leading-snug text-zinc-400">{pick.reasons.join(' · ')}</div> : null}
                {pick.drop ? (
                  <div className="truncate text-[10px] text-zinc-500">
                    Drop <span className="fantasy-sit-out font-semibold">{shortName(pick.drop.name, pick.drop.row?.position)}</span>{' '}
                    ({(pick.drop.rosWeekly ?? pick.drop.value).toFixed(1)}/wk{pick.drop.rosWeekly != null ? ' rest of season' : ''}
                    {pick.replaced && pick.drop.id !== pick.replaced.id ? ', lowest on your bench' : ''})
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="text-[12px] font-bold tabular-nums text-zinc-100">{pick.cand.value.toFixed(1)}</span>
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                    pick.starter || pick.nearGain > 0.05 ? 'fantasy-sit-gain' : 'fantasy-sit-ok'
                  }`}
                >
                  {pick.starter ? `+${pick.gain.toFixed(1)}` : pick.nearGain > 0.05 ? `+${pick.nearGain.toFixed(1)} now` : 'Depth'}
                </span>
              </div>
            </div>
            {openPick === pick.cand.id ? <WaiverBreakdown pick={pick} span={span} /> : null}
            </li>
          ))}
        </ul>
      )}
      </>
      )}
      <p className="mt-2 text-[10px] text-zinc-500">
        Not on any roster in this league. Waiver order and pending claims are not visible here; claim on {host}.
      </p>
    </div>
  )
}

async function copyText(text) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall back below */
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

function TradeSide({ label, players }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-0.5 space-y-0.5">
        {players.map((p) => (
          <div key={p.id} className="flex min-w-0 items-baseline gap-1">
            <span className="truncate text-[12px] font-bold text-zinc-100">{shortName(p.name, p.row?.position)}</span>
            {injuryPill(p.row?.injury_status)}
            <span className="shrink-0 text-[10px] text-zinc-500">
              {p.pos}
              {p.team ? ` · ${p.team}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const OFFER_STYLES = [
  { id: 'casual', label: 'Casual' },
  { id: 'formal', label: 'Formal' },
]

/** Casual (a text to a friend) or formal (the full pitch). Each keeps its own edits when you switch. */
const TRADE_STANCE_KEY = 'edge.fantasy.tradeStance'
const TRADE_STANCE_DEFAULT = 2

function readTradeStance() {
  try {
    const n = Number(localStorage.getItem(TRADE_STANCE_KEY))
    return Number.isInteger(n) && n >= 0 && n < TRADE_STANCES.length ? n : TRADE_STANCE_DEFAULT
  } catch {
    return TRADE_STANCE_DEFAULT
  }
}

/** Same team + same players = same card; a new offer remounts it so the composer drafts that offer's message. */
function offerKey(offer) {
  const ids = (list) => (list || []).map((p) => p?.id).join('-')
  return `${offer?.team?.id || ''}:${ids(offer?.give)}:${ids(offer?.get)}`
}

function ComposeOffer({ offer, myTeamName, initialText, casualText }) {
  const [style, setStyle] = useState('casual')
  const [texts, setTexts] = useState(() => ({
    casual: casualText ?? composeOfferMessage(offer, myTeamName, 'casual'),
    formal: initialText ?? composeOfferMessage(offer, myTeamName),
  }))
  const text = texts[style]
  const setText = (value) => setTexts((prev) => ({ ...prev, [style]: value }))
  const [note, setNote] = useState('')
  const flash = (msg) => {
    setNote(msg)
    window.setTimeout(() => setNote(''), 1800)
  }
  return (
    <div data-fantasy-trade-compose className="mt-2 space-y-1.5">
      <div className="flex gap-1" role="tablist" aria-label="Message style">
        {OFFER_STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={style === s.id}
            onClick={() => setStyle(s.id)}
            data-fantasy-offer-style={style === s.id ? 'on' : 'off'}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              style === s.id ? 'bg-zinc-100 text-zinc-950' : 'border border-zinc-700 text-zinc-300'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-[12px] leading-snug text-zinc-100 outline-none"
        aria-label="Offer message"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={async () => flash((await copyText(text)) ? 'Copied' : 'Copy failed')}
          className="rounded-full bg-zinc-100 px-3 py-1.5 text-[12px] font-semibold text-zinc-950"
        >
          Copy
        </button>
        <button
          type="button"
          onClick={async () => {
            const res = await shareViaBestAvailable({ title: 'Trade offer', text, onCopied: () => flash('Copied') })
            if (res.mode === 'failed') flash('Share not available')
          }}
          className="rounded-full border border-zinc-700 px-3 py-1.5 text-[12px] font-semibold text-zinc-200"
        >
          Share
        </button>
        {note ? <span className="text-[11px] font-semibold text-zinc-400">{note}</span> : null}
      </div>
    </div>
  )
}

function OfferCard({ offer, myTeamName, compact = false, composeText, casualText }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[12px] font-bold text-zinc-100">{offer.team?.team_name || 'Team'}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${offer.theirGain >= -0.25 ? 'fantasy-sit-gain' : 'fantasy-sit-ok'}`}>
          {offer.fairness}
        </span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        <TradeSide label="You give" players={offer.give} />
        <TradeSide label="You get" players={offer.get} />
      </div>
      {!compact ? (
        <div className="mt-1.5 space-y-0.5 text-[10px] leading-snug">
          <div className="text-zinc-300">
            <span className="fantasy-sit-in font-bold">You:</span> {offer.forYou}
          </div>
          <div className="text-zinc-400">
            <span className="font-bold text-zinc-300">Them:</span> {offer.forThem}
          </div>
          {offer.myFill ? (
            <div className="text-zinc-400">
              <span className="font-bold text-zinc-300">Your fill-in:</span> {offer.myFill}
            </div>
          ) : null}
          {offer.theirFill ? (
            <div className="text-zinc-400">
              <span className="font-bold text-zinc-300">Their fill-in:</span> {offer.theirFill}
            </div>
          ) : null}
        </div>
      ) : null}
      {offer.value ? (
        <div className="mt-1 text-[10px] tabular-nums text-zinc-500">
          {offer.value.unit === 'market' ? 'Trade value (FantasyCalc)' : 'Value (pts above waivers, rest of season)'}: you give{' '}
          <span className="font-semibold text-zinc-300">{Math.round(offer.value.give).toLocaleString('en-US')}</span> · you get{' '}
          <span className="font-semibold text-zinc-300">{Math.round(offer.value.get).toLocaleString('en-US')}</span>
        </div>
      ) : null}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold tabular-nums">
          <span className="fantasy-sit-in">+{offer.myGain.toFixed(1)}/wk you</span>
          <span className="text-zinc-500">
            {' · '}
            {offer.theirGain >= 0 ? '+' : ''}
            {offer.theirGain.toFixed(1)} them
          </span>
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-200"
        >
          {open ? 'Close' : 'Compose offer'}
        </button>
      </div>
      {open ? <ComposeOffer offer={offer} myTeamName={myTeamName} initialText={composeText} casualText={casualText} /> : null}
    </div>
  )
}

function PickChips({ rows, picked, onToggle }) {
  return (
    <div className="flex flex-wrap gap-1">
      {rows.map((row) => {
        const on = picked.has(row.id)
        return (
          <button
            key={row.id}
            type="button"
            onClick={() => onToggle(row.id)}
            aria-pressed={on}
            className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
              on ? 'bg-zinc-100 text-zinc-950' : 'border border-zinc-800 bg-zinc-900 text-zinc-300'
            }`}
          >
            {shortName(row.player_name, row.position)}
            {fantasyPosition(row.position) !== 'DEF' ? (
              <span className={on ? 'text-zinc-600' : 'text-zinc-500'}> {fantasyPosition(row.position)}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

function rosterChoices(rows) {
  const order = { QB: 0, RB: 1, WR: 2, TE: 3, K: 5, DEF: 6 }
  return (rows || [])
    .filter((row) => rowId(row) && (row.slot === 'starter' || row.slot === 'bench' || row.slot === 'ir'))
    .map((row) => ({ ...row, id: rowId(row) }))
    .sort((a, b) => (order[fantasyPosition(a.position)] ?? 4) - (order[fantasyPosition(b.position)] ?? 4))
}

/** Host proposals turned into reviewer input: which side is yours, the other team, and whether rosters still match. */
function pendingOfferInputs(offer, detail) {
  const mine = (detail?.teams || []).find((t) => t.is_mine)
  if (!mine) return null
  const items = offer?.items || []
  const give = items.filter((i) => i.from_team_id === mine.id).map((i) => rowId(i)).filter(Boolean)
  const get = items.filter((i) => i.to_team_id === mine.id).map((i) => rowId(i)).filter(Boolean)
  const other = items.map((i) => (i.from_team_id === mine.id ? i.to_team_id : i.from_team_id)).find(Boolean) || null
  return {
    teamId: other,
    giveIds: give,
    getIds: get,
    complete: give.length + get.length === items.length,
    fromMe: offer.proposer_team_id === mine.id,
  }
}

function hoursLeftLabel(iso) {
  const ms = Date.parse(iso || '') - Date.now()
  if (!Number.isFinite(ms)) return ''
  if (ms <= 0) return 'expired'
  const h = Math.round(ms / 3600000)
  return h < 1 ? 'under 1h left' : h < 48 ? `${h}h left` : `${Math.round(h / 24)}d left`
}

function PendingOfferCard({ offer, detail, values, sport, onOpen }) {
  const input = pendingOfferInputs(offer, detail)
  const team = (detail?.teams || []).find((t) => t.id === input?.teamId)
  const review = useMemo(() => {
    const inp = pendingOfferInputs(offer, detail)
    const me = (detail?.teams || []).find((t) => t.is_mine)
    if (!inp?.complete || !values?.league_players?.length || !me) return null
    const slots = waiverLineupSlots(detail?.league, detail?.rostersByTeam?.[me.id] || [], sport)
    return reviewOffer({ values, detail, scoring: detail?.league?.scoring, slots, sport, teamId: inp.teamId, giveIds: inp.giveIds, getIds: inp.getIds })
  }, [offer, values, detail, sport])
  const stale = !input?.complete || (review && review.give.length + review.get.length !== input.giveIds.length + input.getIds.length)
  const left = hoursLeftLabel(offer.expires_at)

  return (
    <button
      type="button"
      onClick={() => !stale && review && onOpen(input)}
      className="block w-full rounded-xl border border-zinc-800 bg-zinc-950/60 px-2.5 py-2 text-left"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[12px] font-bold text-zinc-100">
          {input?.fromMe ? `You sent ${team?.team_name || 'a team'}` : `From ${team?.team_name || 'a team'}`}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {left ? <span className="text-[10px] text-zinc-500">{left}</span> : null}
          {review && !stale ? (
            <span data-verdict={review.verdict} className="fantasy-verdict rounded-full px-2 py-0.5 text-[10px] font-bold">
              {review.verdict}
            </span>
          ) : null}
        </span>
      </div>
      {review && !stale ? (
        <>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <TradeSide label="You give" players={review.give} />
            <TradeSide label="You get" players={review.get} />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold tabular-nums">
              <span className={review.myGain >= 0 ? 'fantasy-sit-in' : 'fantasy-sit-out'}>
                {review.myGain >= 0 ? '+' : ''}
                {review.myGain.toFixed(1)}/wk you
              </span>
              <span className="text-zinc-500">
                {' · '}
                {review.theirGain >= 0 ? '+' : ''}
                {review.theirGain.toFixed(1)} them
              </span>
            </span>
            <span className="text-[10px] font-semibold text-zinc-400">Details</span>
          </div>
          {review.counters[0] ? (
            <div className="mt-1 text-[10px] leading-snug text-zinc-400">
              <span className="font-bold text-zinc-300">{review.verdict === 'Accept' ? 'Push:' : 'Counter:'}</span> {review.counters[0].why} (
              {review.counters[0].myGain >= 0 ? '+' : ''}
              {review.counters[0].myGain.toFixed(1)}/wk you)
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-1 text-[11px] text-zinc-500">
          {(offer.items || []).map((i) => i.player_name || 'Unknown player').join(', ')}. Sync this league to grade it with current rosters.
        </p>
      )}
    </button>
  )
}

/** Offer Review: grade an offer someone sent you (pick the players or paste the host's trade notice). */
function OfferReview({ values, detail, sport, myName, pending }) {
  const teams = detail?.teams || []
  const mine = teams.find((t) => t.is_mine) || null
  const others = teams.filter((t) => !t.is_mine)
  const [teamId, setTeamId] = useState(null)
  const [give, setGive] = useState(() => new Set())
  const [get, setGet] = useState(() => new Set())
  const [paste, setPaste] = useState('')
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState(true)
  const activeTeam = others.find((t) => t.id === teamId) || null

  const toggle = (setter) => (id) =>
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const pickTeam = (id) => {
    setTeamId(id)
    setGet(new Set())
  }
  const readPaste = () => {
    const parsed = parseOfferText(paste, detail)
    if (!parsed?.teamId || !parsed.getIds.length || !parsed.giveIds.length) {
      setNote("Couldn't match both sides to rosters. Pick the players below.")
      if (parsed?.teamId) setTeamId(parsed.teamId)
      if (parsed?.giveIds.length) setGive(new Set(parsed.giveIds))
      if (parsed?.getIds.length) setGet(new Set(parsed.getIds))
      return
    }
    setNote('')
    setTeamId(parsed.teamId)
    setGive(new Set(parsed.giveIds))
    setGet(new Set(parsed.getIds))
    setEditing(false)
  }

  const review = useMemo(() => {
    const me = (detail?.teams || []).find((t) => t.is_mine)
    if (!values?.league_players?.length || !me || !teamId || !give.size || !get.size) return null
    const slots = waiverLineupSlots(detail?.league, detail?.rostersByTeam?.[me.id] || [], sport)
    return reviewOffer({ values, detail, scoring: detail?.league?.scoring, slots, sport, teamId, giveIds: give, getIds: get })
  }, [values, detail, teamId, give, get, sport])

  const openPending = (input) => {
    setTeamId(input.teamId)
    setGive(new Set(input.giveIds))
    setGet(new Set(input.getIds))
    setEditing(false)
    setNote('')
  }
  const host = providerLabel(detail?.league?.provider)
  const offers = pending?.data?.offers || []

  return (
    <div data-fantasy-offer-review className="mt-2 space-y-2.5">
      {pending?.data?.supported || pending?.loading ? (
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Open offers on {host}</div>
          {pending.loading ? (
            <span className="edge-skel block h-16 rounded-xl" data-edge-skeleton aria-label="Loading offers" />
          ) : offers.length ? (
            <div className="space-y-1.5">
              {offers.map((o) => (
                <PendingOfferCard key={o.id} offer={o} detail={detail} values={values} sport={sport} onOpen={openPending} />
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-zinc-500">No open trade offers right now. New ones show up here automatically.</p>
          )}
        </div>
      ) : pending?.error ? (
        <p className="text-[11px] text-zinc-500">Couldn&apos;t read offers from {host} ({pending.error}). Paste the notice below.</p>
      ) : pending?.data ? (
        <p className="text-[11px] text-zinc-500">{host} doesn&apos;t share pending offers with apps. Paste the notice below.</p>
      ) : null}
      <div>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={2}
          placeholder="Paste the trade notice (optional)"
          className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-[12px] leading-snug text-zinc-100 outline-none placeholder:text-zinc-500"
          aria-label="Trade notice"
        />
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            disabled={!paste.trim()}
            onClick={readPaste}
            className="rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 disabled:opacity-40"
          >
            Read offer
          </button>
          {note ? <span className="text-[10px] text-zinc-500">{note}</span> : null}
        </div>
      </div>

      <div>
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Offer from</div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {others.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => pickTeam(t.id)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                t.id === teamId ? 'bg-zinc-100 text-zinc-950' : 'border border-zinc-800 bg-zinc-900 text-zinc-300'
              }`}
            >
              {t.team_name}
            </button>
          ))}
        </div>
      </div>

      {activeTeam && review && !editing ? (
        <div className="flex items-start justify-between gap-2 rounded-xl border border-zinc-800 px-2.5 py-2">
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
            <TradeSide label="You give" players={review.give} />
            <TradeSide label="You get" players={review.get} />
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-200"
          >
            Edit
          </button>
        </div>
      ) : activeTeam ? (
        <>
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">You give</div>
            <PickChips rows={rosterChoices(detail?.rostersByTeam?.[mine?.id])} picked={give} onToggle={toggle(setGive)} />
          </div>
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">You get from {activeTeam.team_name}</div>
            <PickChips rows={rosterChoices(detail?.rostersByTeam?.[activeTeam.id])} picked={get} onToggle={toggle(setGet)} />
          </div>
        </>
      ) : null}

      {review ? (
        <div data-fantasy-offer-verdict className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <span data-verdict={review.verdict} className="fantasy-verdict rounded-full px-2.5 py-0.5 text-[12px] font-bold">
              {review.verdict}
            </span>
            <span className="text-[10px] font-semibold text-zinc-500">{review.confidence} confidence</span>
          </div>
          <div className="mt-1.5 text-[12px] font-bold tabular-nums">
            <span className={review.myGain >= 0 ? 'fantasy-sit-in' : 'fantasy-sit-out'}>
              {review.myGain >= 0 ? '+' : ''}
              {review.myGain.toFixed(1)}/wk you
            </span>
            <span className="text-zinc-500">
              {' · '}
              {review.theirGain >= 0 ? '+' : ''}
              {review.theirGain.toFixed(1)} them
            </span>
          </div>
          <div className="mt-1.5 space-y-1 text-[10px] leading-snug">
            <div className="text-zinc-300">
              <span className="font-bold text-zinc-200">Your best lineup:</span> {review.needYou}
            </div>
            <div className="text-zinc-300">
              <span className="font-bold text-zinc-200">Value:</span> {review.valueNote}
            </div>
            <div className="text-zinc-400">
              <span className="font-bold text-zinc-300">Their angle:</span> {review.theirAngle}
            </div>
            {review.drops.length ? (
              <div className="text-zinc-400">
                <span className="font-bold text-zinc-300">Roster spot:</span> you&apos;d drop{' '}
                {review.drops.map((p) => p.name).join(' and ').replace(/\.?$/, '.')}
              </div>
            ) : null}
          </div>
        </div>
      ) : activeTeam ? (
        <p className="text-[11px] text-zinc-500">Pick at least one player on each side.</p>
      ) : null}

      {review?.counters.length ? (
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            {review.verdict === 'Accept' ? 'Or push for more' : 'Counter with'}
          </div>
          <div className="space-y-1.5">
            {review.counters.map((c) => (
              <OfferCard
                key={c.key}
                offer={{ ...c, forYou: `${c.why} (+${c.myGain.toFixed(1)}/wk for you)` }}
                myTeamName={myName}
                composeText={composeCounterMessage(c, myName)}
                casualText={composeCounterMessage(c, myName, 'casual')}
              />
            ))}
          </div>
        </div>
      ) : null}

      {review?.betterAsk ? (
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Better ask them for</div>
          <OfferCard key={offerKey(review.betterAsk)} offer={review.betterAsk} myTeamName={myName} />
        </div>
      ) : null}
    </div>
  )
}

/** Trade Finder: offers that raise your best lineup, realistic for the other side, with a pasteable message. */
function TradesPanel({ supabaseClient, detail, sport }) {
  const leagueId = detail?.league?.id || null
  const rosterStamp = useRosterStamp(detail)
  const [loaded, setLoaded] = useState({ id: null, data: null, error: '' })
  const [view, setView] = useState('find')
  const [pendingLoaded, setPendingLoaded] = useState({ id: null, data: null, error: '' })
  useEffect(() => {
    if (!supabaseClient || !leagueId) return undefined
    let alive = true
    loadPendingTrades(supabaseClient, leagueId)
      .then((data) => alive && setPendingLoaded({ id: leagueId, data, error: '' }))
      .catch((err) => alive && setPendingLoaded({ id: leagueId, data: null, error: err?.message || 'Could not load offers.' }))
    return () => {
      alive = false
    }
  }, [supabaseClient, leagueId])
  const pending = pendingLoaded.id === leagueId ? { ...pendingLoaded, loading: false } : { data: null, error: '', loading: true }
  const offerCount = pending.data?.offers?.length || 0
  useEffect(() => {
    if (!supabaseClient || !leagueId) return undefined
    let alive = true
    loadLeagueValues(supabaseClient, leagueId)
      .then((data) => alive && setLoaded({ id: leagueId, data, error: '' }))
      .catch((err) => alive && setLoaded({ id: leagueId, data: null, error: err?.message || 'Could not load trade values.' }))
    return () => {
      alive = false
    }
  }, [supabaseClient, leagueId, rosterStamp])
  const state = loaded.id === leagueId ? { ...loaded, loading: false } : { data: null, error: '', loading: true }

  const mine = (detail?.teams || []).find((t) => t.is_mine) || null
  const [stanceStep, setStanceStep] = useState(readTradeStance)
  const pickStance = (step) => {
    setStanceStep(step)
    try {
      localStorage.setItem(TRADE_STANCE_KEY, String(step))
    } catch {
      /* private mode */
    }
  }
  const result = useMemo(() => {
    if (!state.data?.league_players?.length || !mine) return null
    const slots = waiverLineupSlots(detail?.league, detail?.rostersByTeam?.[mine.id] || [], sport)
    return findTrades({ values: state.data, detail, scoring: detail?.league?.scoring, slots, sport, stance: stanceStep / (TRADE_STANCES.length - 1) })
  }, [state.data, detail, mine, sport, stanceStep])
  const weeks = state.data?.weeks || []
  const rosWeeks = Number(state.data?.weeks_left) || 0
  const span = weeks.length
    ? rosWeeks
      ? `wk ${weeks[0]}-${weeks[0] + rosWeeks - 1}`
      : `wk ${weeks[0]}${weeks.length > 1 ? `-${weeks[weeks.length - 1]}` : ''}`
    : ''
  const myName = mine?.team_name || ''

  return (
    <div data-fantasy-trades className="fantasy-card-lift rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-bold text-zinc-100">Trades</div>
        <div className="flex rounded-full border border-zinc-800 p-0.5">
          {[
            ['find', 'Find'],
            ['review', 'Review'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${view === id ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400'}`}
            >
              {label}
              {id === 'review' && offerCount ? (
                <span data-fantasy-offer-count className="ml-1 rounded-full px-1.5 text-[10px] font-bold">
                  {offerCount}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1 text-[10px] text-zinc-500">
        {view === 'review' ? 'Grade an offer you got' : TRADE_STANCES[stanceStep]}
        {span ? ` · ${span}` : ''}
      </div>
      {view === 'find' ? (
        <div data-fantasy-trade-stance className="mt-2">
          <input
            type="range"
            min={0}
            max={TRADE_STANCES.length - 1}
            step={1}
            value={stanceStep}
            onChange={(e) => pickStance(Number(e.target.value))}
            aria-label="Offer stance"
            aria-valuetext={TRADE_STANCES[stanceStep]}
            className="block w-full"
            style={{ '--fill': `${(stanceStep / (TRADE_STANCES.length - 1)) * 100}%` }}
          />
          <div className="mt-0.5 flex justify-between text-[10px] font-semibold text-zinc-500">
            <span>Aggressive</span>
            <span>Fair</span>
          </div>
        </div>
      ) : null}
      {view === 'review' ? (
        state.loading ? (
          <div className="mt-2 space-y-1.5" data-edge-skeleton aria-label="Loading trade values">
            {[0, 1].map((i) => (
              <span key={i} className="edge-skel block h-16 rounded-xl" />
            ))}
          </div>
        ) : state.error ? (
          <p className="mt-2 text-[12px] text-rose-300">{state.error}</p>
        ) : (
          <OfferReview values={state.data} detail={detail} sport={sport} myName={myName} pending={pending} />
        )
      ) : state.loading ? (
        <div className="mt-2 space-y-1.5" data-edge-skeleton aria-label="Loading trade ideas">
          {[0, 1, 2].map((i) => (
            <span key={i} className="edge-skel block h-20 rounded-xl" />
          ))}
        </div>
      ) : state.error ? (
        <p className="mt-2 text-[12px] text-rose-300">{state.error}</p>
      ) : !result?.best ? (
        <p className="mt-2 text-[12px] text-zinc-500">No trade improves your lineup right now without fleecing someone.</p>
      ) : (
        <div className="mt-2 space-y-2">
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Best offer</div>
            <OfferCard key={offerKey(result.best)} offer={result.best} myTeamName={myName} />
          </div>
          {result.ifDeclined.length ? (
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">If they pass</div>
              <div className="space-y-1.5">
                {result.ifDeclined.map((o) => (
                  <OfferCard key={`${o.get[0].id}-${o.give.map((p) => p.id).join('-')}`} offer={o} myTeamName={myName} compact />
                ))}
              </div>
            </div>
          ) : null}
          {result.alsoConsider.length ? (
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Also consider</div>
              <div className="space-y-1.5">
                {result.alsoConsider.map((o) => (
                  <OfferCard key={`${o.team.id}-${o.get[0].id}`} offer={o} myTeamName={myName} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
      <p className="mt-2 text-[10px] text-zinc-500">
        {state.data?.market_source === 'fantasycalc'
          ? 'Fair by market trade value (FantasyCalc, your league format), never more than 15% overpaid; helps you by rest-of-season lineup points in your scoring.'
          : rosWeeks
            ? 'Rest-of-season value in your league scoring: season production blended with projections, above what the waiver wire offers. Never more than 15% overpaid.'
            : 'Based on next-four-week projections in your league scoring.'}{' '}
        Send the offer on {providerLabel(detail?.league?.provider)} or paste the message anywhere.
      </p>
    </div>
  )
}

const OPEN_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

/** Flag rows where a side has a real empty slot, and add a row when neither team starts that position. */
function markOpenSlots(pairs, mine, opp, league) {
  const slotsFor = (rows) => leagueLineupSlots(league, rows || [])
  const a = slotsFor(mine)
  const b = slotsFor(opp)
  if (a.inferred && b.inferred) return pairs
  const leftOpen = openLineupSlots(mine, a.slots)
  const rightOpen = openLineupSlots(opp, b.slots)
  const out = pairs.map((pair) => ({ ...pair }))
  for (const pos of OPEN_ORDER) {
    const need = Math.max(leftOpen[pos] || 0, rightOpen[pos] || 0)
    if (!need) continue
    const rows = out.filter((pair) => pair.key.startsWith(`${pos}-`))
    let leftLeft = leftOpen[pos] || 0
    let rightLeft = rightOpen[pos] || 0
    for (const pair of rows) {
      if (!pair.left && leftLeft > 0) {
        pair.leftOpen = true
        leftLeft -= 1
      }
      if (!pair.right && rightLeft > 0) {
        pair.rightOpen = true
        rightLeft -= 1
      }
    }
    const extra = Math.max(leftLeft, rightLeft)
    if (!extra) continue
    const at = (() => {
      const later = OPEN_ORDER.slice(OPEN_ORDER.indexOf(pos) + 1)
      const idx = out.findIndex((pair) => later.includes(pair.key.split('-')[0]))
      return idx < 0 ? out.length : idx
    })()
    const added = Array.from({ length: extra }, (_, i) => ({
      key: `${pos}-open-${i}`,
      label: pos,
      left: null,
      right: null,
      leftOpen: i < leftLeft,
      rightOpen: i < rightLeft,
    }))
    out.splice(at, 0, ...added)
  }
  return out
}

function VsMatchup({ mine, opp, cards, cardsLoading, scoring, sport, league }) {
  const starters = markOpenSlots(pairStarters(mine, opp), mine, opp, league)
  const bench = pairBench(mine, opp)
  if (!starters.length && !bench.length) {
    return <p className="px-1 text-[13px] text-zinc-500">No players synced for this matchup.</p>
  }
  return (
    <ul className="space-y-1.5">
      <MatchupRows pairs={starters} cards={cards} cardsLoading={cardsLoading} scoring={scoring} sport={sport} lockIn={nbaLockIn(league?.provider, sport, league?.settings)} upcoming={sport === 'nba' && nbaMatchupUpcoming(league)} valueLabel={league?.settings?.category_value ? 'VAL' : 'PROJ'} />
      {bench.length ? (
        <li data-fantasy-bench-divider className="flex items-center gap-2 px-1 pb-0.5 pt-3" aria-label="Bench">
          <span className="h-px flex-1" />
          <span className="text-[10px] font-bold uppercase tracking-[0.14em]">Bench</span>
          <span className="h-px flex-1" />
        </li>
      ) : null}
      <MatchupRows pairs={bench} cards={cards} cardsLoading={cardsLoading} bench scoring={scoring} sport={sport} lockIn={nbaLockIn(league?.provider, sport, league?.settings)} upcoming={sport === 'nba' && nbaMatchupUpcoming(league)} valueLabel={league?.settings?.category_value ? 'VAL' : 'PROJ'} />
    </ul>
  )
}

const FLIP_RESULT = { WIN: 'LOSS', LOSS: 'WIN', TIE: 'TIE' }

/** Host category results seen from the other side. */
function flipCategories(c) {
  if (!c) return c
  const results = Object.fromEntries(Object.entries(c.results || {}).map(([k, v]) => [k, FLIP_RESULT[v] || v]))
  return { left: c.right || {}, right: c.left || {}, results, wins: c.losses || 0, losses: c.wins || 0, ties: c.ties || 0 }
}

function matchupPages(detail) {
  const teams = detail?.teams || []
  const byId = Object.fromEntries(teams.map((t) => [t.id, t]))
  const byTeam = detail?.rostersByTeam || {}
  const mine = teams.find((t) => t.is_mine) || null
  const matchups = detail?.matchups || []
  const usedTeams = new Set()
  const out = []

  const pushPair = (mu, preferLeftId) => {
    if (!mu?.mine_team_id) return
    const pairKey = [mu.mine_team_id, mu.opp_team_id].filter(Boolean).sort().join(':')
    if (out.some((page) => page.key === pairKey)) return
    let leftId = mu.mine_team_id
    let rightId = mu.opp_team_id || null
    let leftScore = mu.mine_score
    let rightScore = mu.opp_score
    let categories = mu.categories || null
    if (preferLeftId && preferLeftId === rightId) {
      leftId = rightId
      rightId = mu.mine_team_id
      leftScore = mu.opp_score
      rightScore = mu.mine_score
      categories = flipCategories(categories)
    }
    usedTeams.add(leftId)
    if (rightId) usedTeams.add(rightId)
    out.push({
      key: pairKey,
      kind: rightId ? 'matchup' : 'bye',
      left: byId[leftId] || null,
      right: rightId ? byId[rightId] || null : null,
      leftScore,
      rightScore,
      categories,
      yours: Boolean(mine && (leftId === mine.id || rightId === mine.id)),
      roster: byTeam[leftId] || [],
      oppRoster: rightId ? byTeam[rightId] || [] : [],
    })
  }

  const mineMu = matchups.find(
    (mu) => mu.mine_team_id === mine?.id || mu.opp_team_id === mine?.id,
  )
  if (mineMu) pushPair(mineMu, mine?.id)
  for (const mu of matchups) pushPair(mu, null)

  // No matchups at all this week (before the league's first scoring week, offseason): still show your team.
  if (!matchups.length && mine) {
    out.push({
      key: `idle-${mine.id}`,
      kind: 'idle',
      left: mine,
      right: null,
      leftScore: null,
      rightScore: null,
      yours: true,
      roster: byTeam[mine.id] || [],
      oppRoster: [],
    })
    return out
  }

  const unpaired = teams.filter((t) => !usedTeams.has(t.id))
  if (unpaired.length && unpaired.length < matchups.length) {
    for (const t of unpaired) {
      out.push({
        key: `bye-${t.id}`,
        kind: 'bye',
        left: t,
        right: null,
        leftScore: null,
        rightScore: null,
        yours: Boolean(mine && t.id === mine.id),
        roster: byTeam[t.id] || [],
        oppRoster: [],
      })
    }
  }
  return out
}

const SPORT_ORDER = ['nfl', 'nba', 'mlb', 'nhl']
const SPORT_LABEL = { nfl: 'NFL', nba: 'NBA', mlb: 'MLB', nhl: 'NHL' }

function TeamHead({ team, teams, align }) {
  const rank = standingsRank(team, teams)
  const end = align === 'right'
  return (
    <div className={`flex min-w-0 items-center gap-2 ${end ? 'flex-row-reverse text-right' : 'text-left'}`}>
      <TeamLogo team={team} />
      <div className="min-w-0">
        <div className="truncate text-[15px] font-semibold">{team?.team_name || 'Team'}</div>
        <div className="truncate text-[11px] text-zinc-500">
          {rank ? `${ordinal(rank)} · ` : ''}
          {recordLine(team)}
        </div>
      </div>
    </div>
  )
}

function ScoreLine({ outlook, hostScore, align, lead, projUp, projFinal: finish }) {
  const score = displayScore(outlook, hostScore)
  const projFinal = score.live && !outlook?.final && finish != null ? finish.toFixed(1) : null
  const end = align === 'right'
  const playingNow = score.live && !outlook?.final && outlook?.playing
  return (
    <div className={`min-w-0 ${end ? 'text-right' : 'text-left'}`}>
      <div
        className={`text-[26px] font-bold tabular-nums leading-none transition-colors ${
          lead === 'trail' ? 'fantasy-vs-trail' : lead === 'lead' ? 'fantasy-vs-lead' : ''
        }`}
      >
        {score.text}
      </div>
      <div className={`mt-1 flex items-baseline gap-1.5 ${end ? 'justify-end' : ''}`}>
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          {playingNow ? (
            <span data-fantasy-live-dot aria-hidden className="relative inline-flex h-1.5 w-1.5">
              <span className="fantasy-live-dot-halo absolute inline-flex h-full w-full rounded-full motion-safe:animate-ping" />
              <span className="fantasy-live-dot-core relative inline-flex h-1.5 w-1.5 rounded-full" />
            </span>
          ) : null}
          {score.live ? (outlook?.final ? 'Final' : playingNow ? 'Live' : '') : score.text === '–' ? '' : 'Proj'}
        </span>
        {projFinal ? (
          <span className={`text-[11px] font-bold tabular-nums ${projUp ? 'fantasy-proj-up' : 'fantasy-proj-down'}`}>
            {projFinal}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function WinBar({ left, right, remaining, sport, chance = null, lockIn = false }) {
  const p = chance ?? winChance(left, right, remaining, sport, lockIn)
  if (p == null) return null
  const leftPct = Math.round(p * 100)
  const rightPct = 100 - leftPct
  return (
    <div className="px-3 pb-2.5">
      <div className="mb-1 flex justify-between text-[11px] font-semibold tabular-nums text-zinc-300">
        <span>{leftPct}%</span>
        <span>{rightPct}%</span>
      </div>
      <div data-team-colors className="fantasy-win-track flex h-1.5 overflow-hidden rounded-full">
        <div className="fantasy-win-fill h-full transition-[width] duration-500" style={{ width: `${leftPct}%` }} />
      </div>
    </div>
  )
}

function scoreValue(outlook, hostScore) {
  const n = Number(displayScore(outlook, hostScore).text)
  return Number.isFinite(n) ? n : null
}

/** Projected finish: the score on the card plus what the players still to play are projected for. */
function projectedFinish(outlook, hostScore) {
  if (!outlook) return null
  const shown = scoreValue(outlook, hostScore)
  if (!outlook.live) return outlook.projected ?? null
  if (shown == null || outlook.outlook == null) return outlook.outlook ?? null
  const remaining = Math.max(0, outlook.outlook - (outlook.scored ?? 0))
  return shown + remaining
}

/** NBA league formats vary a lot (one host can run five); the chip tells same-host leagues apart. NFL is all points. */
function leagueFormatLabel(provider, sport, settings) {
  if (String(sport || '').toLowerCase() !== 'nba') return ''
  if (String(provider || '').toLowerCase() === 'sleeper') return 'Lock-In'
  if (settings?.high_score) return 'High Score'
  const t = String(settings?.scoring_type || '').toUpperCase()
  if (t === 'H2H_MOST_CATEGORIES') return 'Most Cats'
  if (t === 'H2H_CATEGORY' || t === 'HEAD') return 'H2H Cats'
  if (t === 'H2H_POINTS' || t === 'HEADPOINT') return 'H2H Points'
  if (t === 'ROTO') return 'Roto'
  if (t === 'TOTAL_SEASON_POINTS' || t === 'POINT') return 'Season Points'
  return ''
}

function MatchupCard({
  page,
  teams,
  week,
  provider,
  settings = null,
  leagueName = '',
  cards,
  scoring,
  sport,
  categories = null,
  upcoming = false,
  onBack = null,
  headerActions = null,
  seasonLong = false,
  /** Neighbors of a card that shows header icons keep the same row height, so swiping does not resize cards. */
  reserveHeader = false,
}) {
  const lockIn = nbaLockIn(provider, sport, settings)
  const leftSide = sideOutlook(page.roster, cards, scoring, sport, lockIn, upcoming)
  const rightSide = sideOutlook(page.oppRoster, cards, scoring, sport, lockIn, upcoming)
  // Once either lineup has a game under way, both sides show a live score (0.0 until they score), like the hosts.
  const weekStarted =
    leftSide.kicked || rightSide.kicked || Number(page.leftScore) > 0 || Number(page.rightScore) > 0
  const asLive = (o) =>
    weekStarted && !o.live ? { ...o, live: true, final: false, scored: 0, outlook: o.outlook ?? o.projected } : o
  const leftOut = asLive(leftSide)
  const rightOut = asLive(rightSide)
  const leftAccent = useTeamAccent(page.left?.avatar_url, page.left?.id || page.left?.team_name)
  const rightRaw = useTeamAccent(page.right?.avatar_url, page.right?.id || page.right?.team_name)
  const cat = useCategoryMatchup(page, cards, categories, upcoming)
  const rightAccent = distinctTeamAccent(rightRaw, leftAccent)
  const ls = scoreValue(leftOut, page.leftScore)
  const rs = scoreValue(rightOut, page.rightScore)
  // The loser's score dims only once the matchup is decided (both lineups final), not while one side trails.
  const decided = Boolean(page.right && leftOut.final && rightOut.final)
  const lead = decided && ls != null && rs != null && ls !== rs ? (ls > rs ? 'left' : 'right') : null
  const lo = projectedFinish(leftOut, page.leftScore)
  const ro = page.right ? projectedFinish(rightOut, page.rightScore) : null
  const format = leagueFormatLabel(provider, sport, settings)
  return (
    <div
      className="fantasy-card-lift relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900"
      style={{
        '--vs-left': leftAccent.dark,
        '--vs-left-l': leftAccent.light,
        '--vs-right': page.right ? rightAccent.dark : 'transparent',
        '--vs-right-l': page.right ? rightAccent.light : 'transparent',
      }}
    >
      <span aria-hidden className="fantasy-vs-glow pointer-events-none absolute inset-0" />
      {leagueName || format || onBack || headerActions || reserveHeader ? (
        <div data-fantasy-card-league className={`relative flex items-center gap-2 px-3 pt-2.5 ${reserveHeader ? 'min-h-[2.375rem]' : ''}`}>
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="All leagues"
              data-fantasy-card-back
              className="-ml-1 flex min-w-0 items-center gap-0.5 text-left text-[11px] font-semibold text-zinc-400 touch-manipulation"
            >
              <ChevronLeft size={14} strokeWidth={2.5} className="shrink-0" aria-hidden />
              <span data-fantasy-card-title className="min-w-0 truncate">{leagueName || 'All leagues'}</span>
            </button>
          ) : (
            <span data-fantasy-card-title className="min-w-0 truncate text-[11px] font-semibold text-zinc-400">{leagueName}</span>
          )}
          <span className="min-w-0 flex-1" aria-hidden />
          {format ? (
            <span className="shrink-0 rounded-full border border-zinc-700 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-zinc-300">
              {format}
            </span>
          ) : null}
          {headerActions}
        </div>
      ) : null}
      {/* Names get the full width on top; the site badge sits between the scores below. */}
      <div className={`relative grid gap-3 px-3 ${leagueName || format || onBack || headerActions || reserveHeader ? 'pt-1.5' : 'pt-3'} ${page.right ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <TeamHead team={page.left} teams={teams} align="left" />
        {page.right ? <TeamHead team={page.right} teams={teams} align="right" /> : null}
      </div>
      <div
        className={`relative grid items-center gap-1 px-3 pb-3 pt-2 ${
          page.right ? 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]' : 'grid-cols-1'
        }`}
      >
        {cat ? (
          <CategoryScoreLine
            won={cat.record.wins}
            expected={cat.expected}
            align="left"
            lead={!decided ? null : cat.record.wins > cat.record.losses ? 'lead' : cat.record.wins < cat.record.losses ? 'trail' : null}
          />
        ) : (
          <ScoreLine
            outlook={leftOut}
            hostScore={page.leftScore}
            align="left"
            lead={lead === 'left' ? 'lead' : lead === 'right' ? 'trail' : null}
            projUp={lo != null && ro != null ? lo >= ro : true}
            projFinal={lo}
          />
        )}
        {page.right ? (
          <div className="flex flex-col items-center justify-center px-1">
            <SiteBadge provider={provider} />
            <div className="mt-1 text-[10px] font-semibold text-zinc-500">
              {week != null ? `Week ${week}` : 'This week'}
            </div>
          </div>
        ) : null}
        {page.right && cat ? (
          <CategoryScoreLine
            won={cat.record.losses}
            expected={Math.max(0, cat.total - cat.expected)}
            align="right"
            lead={!decided ? null : cat.record.losses > cat.record.wins ? 'lead' : cat.record.losses < cat.record.wins ? 'trail' : null}
          />
        ) : page.right ? (
          <ScoreLine
            outlook={rightOut}
            hostScore={page.rightScore}
            align="right"
            lead={lead === 'right' ? 'lead' : lead === 'left' ? 'trail' : null}
            projUp={lo != null && ro != null ? ro > lo : true}
            projFinal={ro}
          />
        ) : (
          <p className="text-[12px] text-zinc-500">
            {page.kind === 'idle' ? (seasonLong ? 'Season-long league: no weekly matchup.' : 'No matchup this week.') : 'Bye this week.'}
          </p>
        )}
      </div>
      {page.right ? (
        <div className="relative">
          <WinBar left={lo} right={ro} remaining={leftOut.remaining + rightOut.remaining} sport={sport} chance={cat ? cat.win : null} lockIn={lockIn} />
        </div>
      ) : null}
    </div>
  )
}

/**
 * Matchups as a snap carousel: the current card centered, neighbors peeking 20px on each side.
 * Bleeds to the screen edge (-mx-4 matches the page gutter). `onSettle` fires once a swipe comes to rest.
 * A tap on a side card centers it; `renderCard(page, isCurrent)` lets the centered card own its tap.
 */
function MatchupCarousel({ pages, index, onSettle, renderCard, className = '-mt-3 mb-1', leading = null }) {
  const ref = useRef(null)
  const settleRef = useRef(0)

  const centerOn = (i, behavior) => {
    const el = ref.current
    const card = el?.children?.[i]
    if (!el || !card) return
    el.scrollTo({ left: card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2, behavior })
  }

  useLayoutEffect(() => {
    centerOn(index, 'auto')
  }, [index, pages.length])

  useEffect(() => () => window.clearTimeout(settleRef.current), [])

  const nearest = () => {
    const el = ref.current
    if (!el) return index
    const mid = el.scrollLeft + el.clientWidth / 2
    let best = index
    let dist = Infinity
    Array.from(el.children).forEach((child, i) => {
      const d = Math.abs(child.offsetLeft + child.offsetWidth / 2 - mid)
      if (d < dist) {
        dist = d
        best = i
      }
    })
    return best
  }

  const settle = () => {
    window.clearTimeout(settleRef.current)
    const i = nearest()
    if (i !== index) onSettle(i)
  }

  return (
    <div
      ref={ref}
      onScroll={() => {
        window.clearTimeout(settleRef.current)
        settleRef.current = window.setTimeout(settle, 140)
      }}
      className={`relative -mx-4 ${className} flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-7 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
    >
      {pages.map((page, i) => (
        <div
          key={page.key}
          className={`relative w-full shrink-0 snap-center snap-always transition-opacity duration-200 ${i === index ? '' : 'opacity-60'}`}
          onClick={i === index ? undefined : () => centerOn(i, 'smooth')}
        >
          {/* `leading` hangs in the gutter left of the first card and scrolls away with it. */}
          {i === 0 && leading ? (
            <div aria-hidden className="pointer-events-none absolute inset-y-0 right-full mr-1.5 flex w-3.5 items-center justify-center">
              {leading}
            </div>
          ) : null}
          {renderCard(page, i === index)}
        </div>
      ))}
    </div>
  )
}

function readFantasyDeepLink() {
  if (typeof window === 'undefined') return null
  try {
    const u = new URL(window.location.href)
    const league = (u.searchParams.get('league') || '').trim()
    if (!league) return null
    return { league, tool: (u.searchParams.get('fantasyTool') || '').trim() }
  } catch {
    return null
  }
}

function clearFantasyDeepLink() {
  try {
    const u = new URL(window.location.href)
    if (!u.searchParams.has('league') && !u.searchParams.has('fantasyTool')) return
    u.searchParams.delete('league')
    u.searchParams.delete('fantasyTool')
    const qs = u.searchParams.toString()
    window.history.replaceState(window.history.state, document.title, `${u.pathname || '/'}${qs ? `?${qs}` : ''}${u.hash || ''}`)
  } catch {
    /* ignore */
  }
}

/** Main page: one swipe carousel of your matchups per sport. The centered card opens that league. */
/** Trade-board values per league for the home synopsis, kept across carousel swipes until a roster changes. */
const synopsisValues = new Map()

function syncedAgo(iso) {
  const ago = newsTimeAgo(iso)
  if (!ago) return ''
  if (ago === 'now') return 'Synced just now'
  return /^\d+[mhd]$/.test(ago) ? `Synced ${ago} ago` : `Synced ${ago}`
}

const pctText = (p) => (p == null ? '-' : p >= 0.995 ? '99%+' : p > 0 && p < 0.01 ? '<1%' : `${Math.round(p * 100)}%`)

function SynopsisSection({ title, onOpen, children }) {
  return (
    <div className="border-t border-zinc-800 pt-2">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{title}</span>
        {onOpen ? (
          <button type="button" onClick={onOpen} className="text-[10px] font-semibold text-sky-400">
            Open
          </button>
        ) : null}
      </div>
      <div className="space-y-0.5 text-[11px] leading-snug text-zinc-300">{children}</div>
    </div>
  )
}

/**
 * League synopsis under the home matchup card (NFL): playoff / title odds from a season simulation, injuries,
 * lineup fixes, and, once opened, the top waiver adds, sniper picks, and trade ideas. The summary line loads with
 * home (one trade-board read per league, shared-cached on the Edge); waivers and sniper load on open.
 */
function LeagueSynopsis({ supabaseClient, lg, detail, cards, sport, onOpenTool, alerts = [] }) {
  const leagueId = lg?.id || null
  const rosterStamp = useRosterStamp(detail)
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState({ key: '', data: null })
  const [extra, setExtra] = useState({ id: null, waivers: null, sniper: null })
  const nba = sport === 'nba'
  const on = sport === 'nfl' || nba

  useEffect(() => {
    if (!supabaseClient || !leagueId || !on) return undefined
    if (synopsisValues.get(leagueId)?.stamp === rosterStamp) return undefined
    let alive = true
    loadLeagueValues(supabaseClient, leagueId)
      .then((data) => {
        synopsisValues.set(leagueId, { stamp: rosterStamp, data })
        if (alive) setLoaded({ key: `${leagueId}|${rosterStamp}`, data })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [supabaseClient, leagueId, rosterStamp, on])

  useEffect(() => {
    if (!open || !supabaseClient || !leagueId || !on || extra.id === leagueId) return undefined
    let alive = true
    Promise.all([loadWaivers(supabaseClient, leagueId).catch(() => null), loadSniper(supabaseClient, leagueId).catch(() => null)]).then(
      ([waivers, sniper]) => {
        if (alive) setExtra({ id: leagueId, waivers, sniper })
      },
    )
    return () => {
      alive = false
    }
  }, [open, supabaseClient, leagueId, on, extra.id])

  const cached = synopsisValues.get(leagueId)
  const values =
    loaded.key === `${leagueId}|${rosterStamp}` ? loaded.data : cached?.stamp === rosterStamp ? cached.data : null
  const teams = useMemo(() => detail?.teams || [], [detail])
  const mine = teams.find((t) => t.is_mine) || null
  const myRows = useMemo(() => (mine ? detail?.rostersByTeam?.[mine.id] || [] : []), [detail, mine])
  const slots = useMemo(() => waiverLineupSlots(detail?.league, myRows, sport), [detail, myRows, sport])
  const scoring = detail?.league?.scoring

  const outlook = useMemo(() => {
    if (!values || !mine || !slots.length) return null
    const ctx = valueContext(values, scoring, sport, { market: false, waivers: false })
    const strength = {}
    for (const t of teams) strength[t.id] = teamStrength(detail?.rostersByTeam?.[t.id] || [], ctx, slots)
    const format = playoffFormat(detail?.league, teams.length)
    const odds = simulateLeague({
      teams: teams.map((t) => ({ id: t.id, wins: t.wins, losses: t.losses, ties: t.ties, pointsFor: t.points_for })),
      strength,
      week: detail?.week,
      pairs: weekPairs(detail?.matchups),
      format,
      schedule: detail?.league?.settings?.schedule?.weeks || null,
    })
    const order = [...teams].sort((a, b) => (b.wins || 0) - (a.wins || 0) || (Number(b.points_for) || 0) - (Number(a.points_for) || 0))
    const strengthRank = [...teams].sort((a, b) => (strength[b.id] || 0) - (strength[a.id] || 0)).findIndex((t) => t.id === mine.id) + 1
    return {
      odds: odds?.[mine.id] || null,
      format,
      place: order.findIndex((t) => t.id === mine.id) + 1,
      strength: strength[mine.id] || 0,
      strengthRank,
    }
  }, [values, mine, slots, teams, detail, scoring, sport])

  const hurt = useMemo(
    () =>
      myRows
        .filter((r) => (r.slot === 'starter' || r.slot === 'bench') && injuryTone(r.injury_status))
        .map((r) => ({ row: r, tone: injuryTone(r.injury_status), starter: r.slot === 'starter' }))
        .sort((a, b) => Number(b.starter) - Number(a.starter) || (a.tone === 'out' ? -1 : 1)),
    [myRows],
  )
  const empty = useMemo(() => {
    // NBA rows carry one position, so seat-by-position would misread dual-eligible starters; count instead.
    if (nba) {
      const missing = slots.length - myRows.filter((r) => r.slot === 'starter').length
      return missing > 0 ? [`${missing} slot${missing > 1 ? 's' : ''}`] : []
    }
    const open = slots.length ? openLineupSlots(myRows, slots) : {}
    return Object.entries(open).map(([pos, n]) => `${n > 1 ? `${n} ` : ''}${pos}`)
  }, [myRows, slots, nba])
  const dismissVersion = useFantasyDismissVersion()
  const lineup = useMemo(
    () =>
      cards && slots.length
        ? withoutDismissed(
            optimizeLineup({ roster: myRows, cards, scoring, slots, sport }),
            detail?.league?.id,
            dismissPeriod(detail, sport === 'nba'),
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dismissVersion re-reads the dismissed swaps
    [cards, slots, myRows, scoring, sport, detail, dismissVersion],
  )

  const waiverPicks = useMemo(() => {
    if (!extra.waivers?.players?.length || !myRows.length || !slots.length) return []
    return rankWaivers({ pool: extra.waivers, rosterRows: myRows, scoring, slots, sport }).filter((p) => p.starter).slice(0, 3)
  }, [extra.waivers, myRows, scoring, slots, sport])
  const boom = useMemo(
    () => (extra.sniper?.sniper ? rankBoom({ sniper: extra.sniper.sniper, scoring, sport }).slice(0, 2) : []),
    [extra.sniper, scoring, sport],
  )
  const trades = useMemo(() => {
    if (!open || !values || !slots.length) return []
    const step = readTradeStance()
    const res = findTrades({ values, detail, scoring, slots, sport, stance: step / (TRADE_STANCES.length - 1) })
    return [res.best, ...(res.alsoConsider || [])].filter(Boolean).slice(0, 2)
  }, [open, values, detail, scoring, slots, sport])

  if (!on || !mine) return null
  const hurtStarters = hurt.filter((h) => h.starter).length
  const summary = [
    outlook?.odds ? `Playoffs ${pctText(outlook.odds.playoff)} · Title ${pctText(outlook.odds.title)}` : values ? null : 'Odds loading…',
    outlook?.place ? `${ordinal(outlook.place)} of ${teams.length}` : null,
    hurtStarters ? `${hurtStarters} hurt starter${hurtStarters > 1 ? 's' : ''}` : null,
    empty.length ? `Empty ${empty.join(', ')}` : null,
    lineup?.gain > 0.05 ? `Lineup${nba ? ' today' : ''} +${lineup.gain.toFixed(1)}` : null,
  ].filter(Boolean)
  const toolOpen = (tool) => () => onOpenTool?.(tool)

  return (
    <div data-fantasy-synopsis className="mt-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-3 py-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left touch-manipulation [-webkit-tap-highlight-color:transparent]"
      >
        <span className="min-w-0">
          <span className="block truncate text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            League outlook{lg?.last_sync_at ? <span className="font-semibold normal-case tracking-normal"> · {syncedAgo(lg.last_sync_at)}</span> : null}
          </span>
          <span className="block truncate text-[11px] font-semibold text-zinc-200">{summary.join(' · ') || 'No issues this week'}</span>
          {/* Collapsed: what needs doing, in one amber line (the full list opens in Details). */}
          {alerts.length && !open ? (
            <span data-fantasy-attention-line className="mt-0.5 block truncate text-[11px] font-semibold">
              {alerts[0]}
              {alerts.length > 1 ? ` · +${alerts.length - 1} more` : ''}
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {alerts.length ? (
            <span
              data-fantasy-attention-pill
              className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
              aria-label={`${alerts.length} to fix`}
            >
              <AlertTriangle size={10} strokeWidth={2.5} aria-hidden />
              {alerts.length} to fix
            </span>
          ) : null}
          <span className="text-[10px] font-semibold text-sky-400">{open ? 'Hide' : 'Details'}</span>
        </span>
      </button>
      {open ? (
        <div className="mt-2 space-y-2">
          {alerts.length ? (
            <div data-fantasy-attention-box className="rounded-xl border px-2.5 py-2">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide" data-fantasy-attention-title>
                  <AlertTriangle size={10} strokeWidth={2.5} aria-hidden />
                  Needs attention
                </span>
                <button type="button" onClick={toolOpen('start')} className="text-[10px] font-semibold text-sky-400">
                  Roster
                </button>
              </div>
              <div className="space-y-0.5 text-[11px] leading-snug">
                {alerts.map((line) => (
                  <div key={line} data-fantasy-attention-line className="font-semibold">
                    {line}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <SynopsisSection title="Outlook">
            {outlook ? (
              <>
                <div>
                  {ordinal(outlook.place)} of {teams.length} ({mine.wins || 0}-{mine.losses || 0}
                  {mine.ties ? `-${mine.ties}` : ''}, {Math.round(Number(mine.points_for) || 0)} PF).
                  {outlook.odds
                    ? ` Playoffs ${pctText(outlook.odds.playoff)}, title ${pctText(outlook.odds.title)}.`
                    : ' Regular season is over.'}
                </div>
                <div className="text-zinc-500">
                  Rest-of-season lineup {outlook.strength.toFixed(1)}/wk ({ordinal(outlook.strengthRank)} best). Top {outlook.format.teams} make
                  the playoffs from week {outlook.format.start}; remaining opponents are simulated.
                </div>
              </>
            ) : (
              <div className="text-zinc-500">Loading league values…</div>
            )}
          </SynopsisSection>
          <SynopsisSection title="Injuries" onOpen={hurt.length ? toolOpen('start') : null}>
            {hurt.length ? (
              hurt.slice(0, 5).map(({ row, tone, starter }) => (
                <div key={rowId(row) || row.player_name} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {shortName(row.player_name, row.position)} <span className="text-zinc-500">{fantasyPos(row.position)}</span>
                  </span>
                  <span className={`shrink-0 font-semibold ${tone === 'out' ? 'text-rose-300' : 'text-amber-300'}`}>
                    {injuryLabel(row.injury_status)}
                    {starter ? ' · starting' : ' · bench'}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-zinc-500">No injury tags on your roster.</div>
            )}
            {empty.length ? <div className="text-amber-300">Empty lineup slot: {empty.join(', ')}</div> : null}
          </SynopsisSection>
          {lineup?.moves?.length ? (
            <SynopsisSection title={nba ? 'Lineup today' : 'Lineup this week'} onOpen={toolOpen('start')}>
              {lineup.moves.slice(0, 3).map((m) => (
                <div key={m.start.row.sleeper_id}>
                  Start {shortName(m.start.row.player_name, m.start.row.position)}
                  {m.bench ? ` over ${shortName(m.bench.row.player_name, m.bench.row.position)}` : ''}{' '}
                  <span className="fantasy-proj-up font-semibold">+{m.gain.toFixed(1)}</span>
                </div>
              ))}
            </SynopsisSection>
          ) : null}
          <SynopsisSection title="Waiver adds" onOpen={toolOpen('waiver')}>
            {extra.id !== leagueId ? (
              <div className="text-zinc-500">Loading…</div>
            ) : waiverPicks.length ? (
              waiverPicks.map((pick) => (
                <div key={pick.cand.id} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {shortName(pick.cand.name, pick.cand.entry.position)} <span className="text-zinc-500">{pick.cand.pos}</span>
                    {pick.drop ? <span className="text-zinc-500"> · drop {shortName(pick.drop.name, pick.drop.row?.position)}</span> : null}
                  </span>
                  <span className="fantasy-proj-up shrink-0 font-semibold">+{pick.gain.toFixed(1)}/wk</span>
                </div>
              ))
            ) : (
              <div className="text-zinc-500">No free agent beats your lineup right now.</div>
            )}
          </SynopsisSection>
          <SynopsisSection title="Sniper" onOpen={toolOpen('waiver')}>
            {extra.id !== leagueId ? (
              <div className="text-zinc-500">Loading…</div>
            ) : boom.length ? (
              boom.map((pick) => (
                <div key={pick.entry.sleeper_id} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {shortName(pick.entry.name, pick.entry.position)} <span className="text-zinc-500">{pick.entry.position}</span>
                    {pick.reasons?.[0] ? <span className="text-zinc-500"> · {pick.reasons[0]}</span> : null}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-zinc-200">{pick.proj.toFixed(1)}</span>
                </div>
              ))
            ) : (
              <div className="text-zinc-500">No boom candidates this week.</div>
            )}
          </SynopsisSection>
          <SynopsisSection title="Trade ideas" onOpen={toolOpen('trade')}>
            {!values ? (
              <div className="text-zinc-500">Loading…</div>
            ) : trades.length ? (
              trades.map((offer) => (
                <div key={`${offer.team?.id}-${offer.get?.[0]?.id}`} className="min-w-0">
                  <div className="truncate">
                    Get {offer.get.map((p) => shortName(p.name, p.pos)).join(' + ')} for{' '}
                    {offer.give.map((p) => shortName(p.name, p.pos)).join(' + ')}
                    <span className="text-zinc-500"> · {offer.team?.team_name}</span>
                  </div>
                  <div className="text-zinc-500">
                    <span className="fantasy-proj-up font-semibold">+{offer.myGain.toFixed(1)}/wk</span> · {offer.fairness}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-zinc-500">No trade clears both lineups right now.</div>
            )}
          </SynopsisSection>
        </div>
      ) : null}
    </div>
  )
}

/** Sync + Manage as small icons on the first sport row (home), with when the leagues last synced. */
function HomeSyncActions({ syncing, busy, onSync, onOpenManage, syncedIso }) {
  const ago = syncedIso ? newsTimeAgo(syncedIso) : ''
  return (
    <span data-fantasy-home-actions className="flex shrink-0 items-center gap-1.5">
      {ago ? <span className="text-[10px] font-semibold text-zinc-500">{ago === 'now' ? 'just now' : `${ago} ago`}</span> : null}
      <button
        type="button"
        disabled={busy || syncing}
        onClick={() => void onSync()}
        aria-label={syncing ? 'Syncing' : 'Sync leagues'}
        data-fantasy-sync-btn={syncing ? 'on' : undefined}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-800 text-zinc-300 touch-manipulation disabled:opacity-60"
      >
        <RefreshCw size={13} strokeWidth={2.25} className={syncing ? 'animate-spin' : ''} aria-hidden />
      </button>
      <button
        type="button"
        onClick={onOpenManage}
        aria-label="Manage leagues"
        className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-800 text-zinc-300 touch-manipulation"
      >
        <SlidersHorizontal size={13} strokeWidth={2.25} aria-hidden />
      </button>
    </span>
  )
}

function HomeSportCarousel({ group, entries, cards, onOpen, supabaseClient, onOpenTool, actions = null }) {
  const [key, setKey] = useState(null)
  const found = entries.findIndex((e) => e.key === key)
  const index = found >= 0 ? found : 0
  const dismissVersion = useFantasyDismissVersion()
  // What needs doing per league (once per league; the outlook card under the shown one lists it).
  const alertsBy = useMemo(() => {
    const out = {}
    for (const e of entries) {
      if (out[e.lg.id]) continue
      out[e.lg.id] = leagueAlertLines(startSitPlanOf(e.leagueDetail, cards, group.sport), e.leagueDetail, cards)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dismissVersion re-reads the dismissed swaps
  }, [entries, cards, group.sport, dismissVersion])
  return (
    <section data-fantasy-sport-carousel={group.sport}>
      <MatchupCarousel
        pages={entries}
        index={index}
        className="-mt-2"
        leading={
          <span
            data-fantasy-sport-gutter
            className="whitespace-nowrap text-[10.5px] font-black uppercase tracking-[0.12em] text-zinc-500 [transform:rotate(180deg)] [writing-mode:vertical-rl]"
          >
            {group.label}
          </span>
        }
        onSettle={(i) => {
          const entry = entries[i]
          if (entry) setKey(entry.key)
        }}
        renderCard={(entry, isCurrent) => (
          <div
            role={isCurrent ? 'button' : undefined}
            tabIndex={isCurrent ? 0 : undefined}
            onClick={isCurrent ? () => onOpen(entry.lg.id, entry.item.key) : undefined}
            onKeyDown={
              isCurrent
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onOpen(entry.lg.id, entry.item.key)
                    }
                  }
                : undefined
            }
            className="block w-full text-left"
          >
            <MatchupCard
              reserveHeader={Boolean(actions)}
              headerActions={
                isCurrent && actions ? (
                  // Sync / Manage act on every league; their taps must not open this one.
                  <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    {actions}
                  </span>
                ) : null
              }
              page={entry.item}
              teams={entry.leagueDetail.teams}
              week={entry.leagueDetail.week}
              provider={entry.lg.provider || entry.leagueDetail.league?.provider}
              settings={entry.leagueDetail.league?.settings || entry.lg.settings}
              leagueName={entry.lg.name || entry.leagueDetail.league?.name || ''}
              cards={cards}
              scoring={entry.leagueDetail.league?.scoring}
              sport={group.sport}
              categories={leagueCategories(entry.leagueDetail.league)}
              upcoming={group.sport === 'nba' && nbaMatchupUpcoming(entry.leagueDetail.league)}
            />
          </div>
        )}
      />
      {entries[index] ? (
        <LeagueSynopsis
          key={entries[index].lg.id}
          supabaseClient={supabaseClient}
          lg={entries[index].lg}
          detail={entries[index].leagueDetail}
          cards={cards}
          sport={group.sport}
          onOpenTool={(tool) => onOpenTool?.(entries[index].lg.id, entries[index].item.key, tool)}
          alerts={alertsBy[entries[index].lg.id] || []}
        />
      ) : null}
    </section>
  )
}

/**
 * Connected fantasy home. Hosts live in the manage sheet, not on this page.
 * Home is the matchup cards, grouped by sport. A tap opens that league:
 * the matchup stays on top, the lineup sits under it, and the other games are a swipe.
 */
export default function FantasyCommandCenter({
  supabaseClient,
  leagues,
  details: syncedDetails,
  loadingDetail,
  cards: cardsBySport,
  cardsLoading,
  busy,
  onSetPrimary,
  onOpenManage,
  onSync,
  syncing = false,
}) {
  const [leagueId, setLeagueId] = useState(null)
  const [pageKey, setPageKey] = useState(null)
  const [tool, setTool] = useState(DEFAULT_TOOL)

  const groups = useMemo(() => {
    const by = new Map()
    for (const lg of leagues || []) {
      const sport = String(lg.sport || 'nfl').toLowerCase()
      if (!by.has(sport)) by.set(sport, [])
      by.get(sport).push(lg)
    }
    return [...by.keys()]
      .sort((a, b) => {
        const ia = SPORT_ORDER.indexOf(a)
        const ib = SPORT_ORDER.indexOf(b)
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
      })
      .map((sport) => ({
        sport,
        label: SPORT_LABEL[sport] || sport.toUpperCase(),
        leagues: by.get(sport),
      }))
  }, [leagues])

  const nflPlayers = useMemo(() => myPlayers(leagues, syncedDetails, 'nfl'), [leagues, syncedDetails])
  const nbaPlayers = useMemo(() => myPlayers(leagues, syncedDetails, 'nba'), [leagues, syncedDetails])
  const nflNews = usePlayerNews(supabaseClient, nflPlayers, 'nfl')
  const nbaNews = usePlayerNews(supabaseClient, nbaPlayers, 'nba')
  const nflNewsMap = useMemo(() => newsByPlayer(nflNews.notes), [nflNews.notes])
  const nbaNewsMap = useMemo(() => newsByPlayer(nbaNews.notes), [nbaNews.notes])
  // Every tool reads rows with fresh news applied: a ruled-out starter is Out for Start/Sit before the host says so.
  const nbaCards = cardsBySport?.nba || null
  const details = useMemo(
    () => withCardHeadshots(withNews(withNews(syncedDetails, nflNewsMap, 'nfl'), nbaNewsMap, 'nba'), nbaCards, 'nba'),
    [syncedDetails, nflNewsMap, nbaNewsMap, nbaCards],
  )
  // One Player news list; NBA ids get a prefix there so they do not collide with NFL ones.
  const { newsPlayers, news } = useMemo(() => {
    const merged = new Map(nflPlayers)
    for (const [id, p] of nbaPlayers) merged.set(`nba:${id}`, p)
    const notes = [...nflNews.notes, ...nbaNews.notes.map((n) => ({ ...n, sleeper_id: `nba:${n.sleeper_id}` }))]
    notes.sort((a, b) => Date.parse(b.published || '') - Date.parse(a.published || ''))
    return {
      newsPlayers: merged,
      news: {
        key: [nflNews.key, nbaNews.key].filter(Boolean).join('|'),
        notes,
        loading: nflNews.loading || nbaNews.loading,
        error: nflNews.error || nbaNews.error,
      },
    }
  }, [nflPlayers, nbaPlayers, nflNews, nbaNews])

  const selected = leagueId ? (leagues || []).find((lg) => lg.id === leagueId) || null : null
  const detail = selected ? details?.[selected.id] || null : null
  // `cards` arrives per sport ({ nfl: {...}, nba: {...} }): ids collide across sports, so each league reads its own.
  const cardsFor = (sport) => cardsBySport?.[String(sport || 'nfl').toLowerCase()] || null
  const cards = cardsFor(selected?.sport || detail?.league?.sport)
  const pages = useMemo(() => (detail ? matchupPages(detail) : []), [detail])
  const keyed = pages.findIndex((item) => item.key === pageKey)
  const safePage = keyed >= 0 ? keyed : 0
  const current = pages[safePage] || null
  const leagueSport = String(selected?.sport || detail?.league?.sport || 'nfl').toLowerCase()
  const nflLeague = leagueSport === 'nfl'
  const nflState = useMemo(() => {
    if (!nflLeague || !current || !cards) return { live: false, kicked: false }
    const scoring = detail?.league?.scoring
    const left = sideOutlook(current.roster, cards, scoring, 'nfl')
    const right = sideOutlook(current.oppRoster, cards, scoring, 'nfl')
    return {
      live: Boolean(left.playing || right.playing),
      kicked: Boolean(left.kicked || right.kicked || Number(current.leftScore) > 0 || Number(current.rightScore) > 0),
    }
  }, [nflLeague, current, cards, detail])
  const tools = nflLeague ? nflTools(nflState) : TOOLS
  const rosterPlan = useStartSitPlan(detail, cards, leagueSport)
  const dismissedCount = rosterPlan?.dismissed?.length || 0
  // Tool state is shared across leagues: an id this league's pills do not have (NBA Live, NFL Plays pre-kickoff) opens Roster.
  const shownTool = nflLeague && tool === 'live' ? 'start' : tools.some((t) => t.id === tool) ? tool : DEFAULT_TOOL

  const openMatchup = (id, key) => {
    setLeagueId(id)
    setPageKey(key)
    void onSetPrimary?.(id)
  }
  // Push / share deep link: `?tab=fantasy&league=<id>&fantasyTool=start` opens that league on that pill, once.
  const [deepLink, setDeepLink] = useState(readFantasyDeepLink)
  useEffect(() => {
    const onPop = () => setDeepLink(readFantasyDeepLink())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const linkedLeague = deepLink ? (leagues || []).find((l) => String(l.id) === deepLink.league) : null
  if (deepLink && linkedLeague && details?.[linkedLeague.id]) {
    const page = matchupPages(details[linkedLeague.id]).find((p) => p.yours)
    setTool(TOOL_IDS.has(deepLink.tool) ? deepLink.tool : DEFAULT_TOOL)
    setLeagueId(linkedLeague.id)
    setPageKey(page?.key || null)
    setDeepLink(null)
  }
  useEffect(() => {
    if (!deepLink) clearFantasyDeepLink()
  }, [deepLink])

  // Home with matchup cards: Sync / Manage ride the first sport row as icons, so the cards start at the top.
  const homeGroups = leagueId
    ? []
    : groups
        .map((group) => ({
          group,
          matchups: group.leagues.flatMap((lg) => {
            const leagueDetail = details?.[lg.id]
            if (!leagueDetail) return []
            return matchupPages(leagueDetail)
              .filter((item) => item.yours)
              .map((item) => ({ key: `${lg.id}-${item.key}`, lg, item, leagueDetail }))
          }),
        }))
        .filter((g) => g.matchups.length)

  return (
    <div className="space-y-4">
      {/* League view with a matchup card: back / Sync / Manage ride the card's league row instead. */}
      {(leagueId ? !current : !homeGroups.length) ? (
      <div className="flex items-center justify-between gap-2">
        {leagueId ? (
          <button
            type="button"
            onClick={() => setLeagueId(null)}
            className="rounded-full border border-zinc-700 px-3 py-1.5 text-[12px] font-semibold text-zinc-200"
          >
            Fantasy
          </button>
        ) : (
          <span />
        )}
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={busy || syncing}
            onClick={() => void onSync()}
            data-fantasy-sync-btn={syncing ? 'on' : undefined}
            className={`inline-flex items-center gap-1.5 rounded-full border border-zinc-700 px-3 py-1.5 text-[12px] font-semibold text-zinc-200 ${
              syncing ? '' : 'disabled:opacity-40'
            }`}
          >
            {syncing ? (
              <>
                <RefreshCw size={12} strokeWidth={2.5} className="animate-spin" aria-hidden />
                Syncing
              </>
            ) : (
              'Sync'
            )}
          </button>
          <button
            type="button"
            onClick={onOpenManage}
            className="rounded-full bg-zinc-100 px-3 py-1.5 text-[12px] font-semibold text-zinc-950"
          >
            Manage
          </button>
        </div>
      </div>
      ) : null}

      {!loadingDetail && !(leagues || []).length ? (
        <div className="rounded-2xl border border-zinc-800 p-4 text-[13px] text-zinc-400">
          No leagues synced yet. Open Manage and sync after the league is live.
        </div>
      ) : null}

      {!leagueId ? (
        <>
          {loadingDetail && !(leagues || []).some((lg) => details?.[lg.id]) ? (
            <div className="py-6 text-center text-sm text-zinc-500">Loading matchups…</div>
          ) : null}
          {homeGroups.map(({ group, matchups }, gi) => {
            return (
              <HomeSportCarousel
                key={group.sport}
                group={group}
                entries={matchups}
                actions={
                  gi === 0 ? (
                    <HomeSyncActions syncing={syncing} busy={busy} onSync={onSync} onOpenManage={onOpenManage} syncedIso={null} />
                  ) : null
                }
                cards={cardsFor(group.sport)}
                supabaseClient={supabaseClient}
                onOpen={(id, key) => {
                  setTool(DEFAULT_TOOL)
                  openMatchup(id, key)
                }}
                onOpenTool={(id, key, tool) => {
                  setTool(tool)
                  openMatchup(id, key)
                }}
              />
            )
          })}
          <FantasyPlayerNews
            players={newsPlayers}
            news={news}
            showLeagues={(leagues || []).filter((lg) => ['nfl', 'nba'].includes(String(lg.sport || 'nfl').toLowerCase())).length > 1}
            leagueOrder={groups.flatMap((g) => g.leagues.map((lg) => String(lg?.name || '').trim()))}
          />
        </>
      ) : (
        <>
          {selected && !detail && loadingDetail ? (
            <div className="py-6 text-center text-sm text-zinc-500">Loading league…</div>
          ) : null}

          {detail && !pages.length ? (
            <div className="rounded-2xl border border-zinc-800 px-3 py-3 text-[12px] text-zinc-500">
              No matchup synced for this week.
            </div>
          ) : null}

          {current ? (
            <MatchupCarousel
              pages={pages}
              index={safePage}
              onSettle={(i) => {
                const item = pages[i]
                if (item) setPageKey(item.key)
              }}
              renderCard={(page, isCurrent) => (
                <MatchupCard
                  page={page}
                  onBack={isCurrent ? () => setLeagueId(null) : null}
                  reserveHeader
                  seasonLong={Boolean(seasonLongFormat(detail?.league))}
                  headerActions={
                    isCurrent ? (
                      <HomeSyncActions syncing={syncing} busy={busy} onSync={onSync} onOpenManage={onOpenManage} syncedIso={null} />
                    ) : null
                  }
                  teams={detail?.teams || []}
                  week={detail?.week}
                  provider={selected?.provider || detail?.league?.provider}
                  settings={detail?.league?.settings || selected?.settings}
                  leagueName={detail?.league?.name || selected?.name || ''}
                  cards={cards}
                  scoring={detail?.league?.scoring}
                  sport={selected?.sport || detail?.league?.sport}
                  categories={leagueCategories(detail?.league)}
                  upcoming={(selected?.sport || detail?.league?.sport) === 'nba' && nbaMatchupUpcoming(detail?.league)}
                />
              )}
            />
          ) : null}

          {current && leagueCategories(detail?.league) ? (
            <CategoryBoard page={current} cards={cards} categories={leagueCategories(detail?.league)} upcoming={nbaMatchupUpcoming(detail?.league)} />
          ) : null}
          {current?.kind === 'idle' && seasonLongFormat(detail?.league) ? (
            <SeasonStandings league={detail?.league} teams={detail?.teams} />
          ) : null}

          <div data-fantasy-tool-tabs role="tablist" className="-mt-1 flex gap-5 overflow-x-auto border-b border-zinc-800 px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tools.map((item) => {
              const on = item.id === shownTool
              const showDismissed = item.id === 'start' && dismissedCount > 0
              return (
                <div key={item.id} className="relative flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setTool(item.id)}
                    data-fantasy-tool-tab={on ? 'on' : 'off'}
                    className={`inline-flex items-center gap-1.5 border-b-2 pb-2 pt-1 text-[14px] font-semibold ${
                      on ? 'border-zinc-100 text-zinc-100' : 'border-transparent text-zinc-500'
                    }`}
                  >
                    {item.live ? (
                      <span data-fantasy-live-dot aria-hidden className="relative inline-flex h-1.5 w-1.5">
                        <span className="fantasy-live-dot-halo absolute inline-flex h-full w-full rounded-full motion-safe:animate-ping" />
                        <span className="fantasy-live-dot-core relative inline-flex h-1.5 w-1.5 rounded-full" />
                      </span>
                    ) : null}
                    {item.label}
                  </button>
                  {showDismissed ? (
                    <button
                      type="button"
                      data-fantasy-dismissed-restore
                      onClick={() => {
                        setTool('start')
                        restoreMoves(rosterPlan.dismissLeague, rosterPlan.dismissPeriod)
                      }}
                      aria-label={`Show ${dismissedCount} dismissed suggestion${dismissedCount > 1 ? 's' : ''}`}
                      title="Show dismissed"
                      className="mb-1.5 rounded-full bg-zinc-800 px-1.5 py-px text-[10px] font-bold tabular-nums text-zinc-300"
                    >
                      {dismissedCount}
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>

          {shownTool === 'plays' && detail && current ? (
            <LivePanel
              supabaseClient={supabaseClient}
              page={current}
              detail={detail}
              sport={selected?.sport || detail?.league?.sport}
              active
              emptyText="No games for these lineups on the board right now. Scoring plays show here while games are live."
            />
          ) : null}
          {shownTool === 'live' && detail ? (
            <LiveAlerts
              detail={detail}
              cards={cards}
              cardsLoading={cardsLoading}
              sport={selected?.sport || detail?.league?.sport}
              onOpen={() => setTool('start')}
            />
          ) : null}
          {shownTool === 'live' && detail && current ? (
            <LivePanel
              supabaseClient={supabaseClient}
              page={current}
              detail={detail}
              sport={selected?.sport || detail?.league?.sport}
              active
            />
          ) : null}
          {shownTool === 'start' && nflLeague && nflState.kicked && current ? (
            <RosterGameChips supabaseClient={supabaseClient} page={current} />
          ) : null}
          {shownTool === 'start' && detail ? (
            <StartSitPanel supabaseClient={supabaseClient} detail={detail} cards={cards} sport={selected?.sport || detail?.league?.sport} />
          ) : null}
          {shownTool === 'start' && detail && current && (selected?.sport || detail?.league?.sport) === 'nba' ? (
            <NbaSchedulePanel page={current} cards={cards} league={detail?.league} />
          ) : null}
          {shownTool === 'waiver' && detail ? (
            <WaiversPanel supabaseClient={supabaseClient} detail={detail} sport={selected?.sport || detail?.league?.sport} />
          ) : null}
          {shownTool === 'trade' && detail ? (
            <TradesPanel supabaseClient={supabaseClient} detail={detail} sport={selected?.sport || detail?.league?.sport} />
          ) : null}

          {current ? (
            <VsMatchup
              mine={current.roster}
              opp={current.oppRoster}
              cards={cards}
              cardsLoading={cardsLoading}
              scoring={detail?.league?.scoring}
              sport={selected?.sport || detail?.league?.sport}
              league={detail?.league}
            />
          ) : null}
        </>
      )}
    </div>
  )
}
