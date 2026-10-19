import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { scoreLine } from './fantasyBoxScore.js'
import { useHeadshotSrc } from '../../utils/playerHeadshot.js'
import { distinctTeamAccent, useTeamAccent } from './useTeamAccent.js'
import { useLiveGames, useLivePlays } from './useFantasyLive.js'
import { leagueRates } from './fantasyBoxScore.js'
import { requestLoungeSportsGameOpen } from '../lounge/loungeSportsHubNav.js'
import { loungeSportsGameMatch } from '../../utils/loungeSportsApi.js'
import { formatFantasyPoints } from '../lounge/gameHub/gameHubPlayFantasy.js'
import {
  fantasyPosition,
  gameLocked,
  leagueLineupSlots,
  openLineupSlots,
  optimizeLineup,
  slotPositions,
  weekValue,
} from './fantasyStartSit.js'
import { rankWaivers, rowId } from './fantasyWaivers.js'
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
} from './fantasyTrades.js'
import { openExternalUrl, shareViaBestAvailable } from '../../utils/edgeNative.js'
import { positionPillClass, slotPillPosition } from '../../utils/fantasyPositionPill.js'
import { sportsBetPropTapPayload, useSportsBetOddsActions } from '../sports-bet-tracker/sportsBetLogContext.jsx'
import { useOddsLogPress } from '../sports-bet-tracker/useOddsLogPress.js'

const TOOLS = [
  {
    id: 'live',
    label: 'Live',
  },
  {
    id: 'start',
    label: 'Start/Sit',
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
      className="h-10 w-10 shrink-0 object-contain"
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
  if (fantasyPos(position) === 'DEF') return String(name || 'DEF').toUpperCase()
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
  const named = raw.includes(':') ? raw.split(':').slice(1).join(':') : raw
  if (named && !/^\d+$/.test(named)) return named
  return fantasyPos(row?.position) || `${index + 1}`
}

function pairBySlot(left, right) {
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

function pairLineup(leftRows, rightRows) {
  const left = leftRows || []
  const right = rightRows || []
  const nfl = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])
  const sample = left.concat(right)
  if (sample.length && !sample.some((row) => nfl.has(fantasyPos(row.position)))) {
    return pairBySlot(left, right)
  }
  const order = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
  const bucket = (rows) => {
    const map = {}
    for (const row of rows) {
      const pos = fantasyPos(row.position)
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
    for (let i = 0; i < n; i++) {
      pairs.push({
        key: `${pos}-${i}`,
        label: n > 1 ? `${pos}${i + 1}` : pos,
        left: a[i] || null,
        right: b[i] || null,
      })
    }
  }
  return pairs
}

function pairStarters(leftRows, rightRows) {
  return pairLineup(startersOf(leftRows), startersOf(rightRows))
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
function SideBust({ row, align, live }) {
  const shot = useHeadshotSrc(row?.headshot_url, 384)
  if (!row) return null
  const right = align === 'right'
  const bust = !isDefense(row) && !shot.failed
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute bottom-0 h-[115%] aspect-[600/436] ${right ? '-right-7' : '-left-7'}`}
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

/** Our box × this league's rules, else the host/Sleeper number once the game has started. */
function pointsOf(card, scoring, sport) {
  if (!card || !gameStarted(card)) return null
  const scored = scoreLine(card.line, scoring, sport, card.pos || null)
  if (scored != null) return { pts: scored, fromLine: true }
  const w = Number(card.week_pts)
  if (Number.isFinite(w)) return { pts: w, fromLine: false }
  return { pts: 0, fromLine: false }
}

/** Starter total. Before kickoff this is the projection. After, live points so far plus remaining projections. */
function sideOutlook(roster, cards, scoring, sport) {
  const starters = startersOf(roster)
  let projected = 0
  let projectedN = 0
  let scored = 0
  let started = false
  let fromLine = false
  let outlook = 0
  let outlookOk = false
  for (const row of starters) {
    const card = row?.sleeper_id ? cards?.[row.sleeper_id] : null
    if (!card) continue
    const p = Number(card.projected)
    const hasP = Number.isFinite(p)
    if (hasP) {
      projected += p
      projectedN += 1
    }
    const livePts = pointsOf(card, scoring, sport)
    if (livePts) {
      started = true
      if (livePts.fromLine) fromLine = true
      scored += livePts.pts
      outlook += livePts.pts
      outlookOk = true
    } else if (hasP) {
      outlook += p
      outlookOk = true
    }
  }
  return {
    live: started,
    fromLine,
    projected: projectedN ? projected : null,
    scored: started ? scored : null,
    outlook: outlookOk ? outlook : null,
  }
}

function displayScore(outlook, hostScore) {
  if (!outlook?.live) {
    if (outlook?.projected != null) return { text: outlook.projected.toFixed(1), live: false }
    return { text: '–', live: false }
  }
  if (outlook.fromLine && outlook.scored != null) return { text: outlook.scored.toFixed(1), live: true }
  const host = Number(hostScore)
  if (Number.isFinite(host) && host > 0) return { text: host.toFixed(1), live: true }
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

/** Weekly win chance from the two outlooks. σ 28 is a typical fantasy margin, not a book price. */
function winChance(left, right) {
  if (left == null || right == null) return null
  const p = normCdf((left - right) / 28)
  return Math.min(0.97, Math.max(0.03, p))
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

function VsHead({ row, align }) {
  if (!row) return <div />
  return (
    <div className={`flex min-w-0 items-center ${align === 'right' ? 'flex-row-reverse text-right' : 'text-left'}`}>
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

/** Expanded player panel. Page 1 is this game's totals (or projection), swipe left for every market. */
function SidePanel({ row, card }) {
  const [page, setPage] = useState(0)
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
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(e) => {
          const el = e.currentTarget
          const w = el.clientWidth || 1
          setPage(Math.round(el.scrollLeft / w))
        }}
      >
        <div className="w-full min-w-full shrink-0 snap-start px-2 py-1.5">
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

function playerPts(card, loading, scoring, sport) {
  const livePts = pointsOf(card, scoring, sport)
  if (livePts) return pts(livePts.pts) || '0.0'
  const proj = pts(card?.projected)
  if (proj) return proj
  return loading ? '…' : '-'
}

function MatchupRows({ pairs, cards, cardsLoading, bench, scoring, sport }) {
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
            className={`fantasy-card-lift relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 ${bench ? 'fantasy-bench-row' : ''}`}
          >
            <span
              aria-hidden
              className="fantasy-row-divider pointer-events-none absolute inset-y-2 left-1/2 w-px -translate-x-1/2"
            />
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
              <SideBust row={pair.left} align="left" live={leftLive} />
              <SideBust row={pair.right} align="right" live={rightLive} />
              <div className="relative z-[1] grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 px-10">
                {pair.left || !pair.leftOpen ? <VsHead row={pair.left} align="left" /> : <OpenSlotTag align="left" />}
                <div className="flex items-center gap-1">
                  <span className={`w-8 text-right text-[13px] font-bold tabular-nums ${leftLive ? 'fantasy-live-pts' : 'text-zinc-100'}`}>
                    {playerPts(leftCard, cardsLoading, scoring, sport)}
                  </span>
                  {slotPillPosition(pair.label) ? (
                    <span
                      data-pos-pill={slotPillPosition(pair.label)}
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${positionPillClass(slotPillPosition(pair.label))}`}
                    >
                      {pair.label}
                    </span>
                  ) : (
                    <span
                      className="fantasy-slot-pill rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ color: '#fff' }}
                    >
                      {pair.label}
                    </span>
                  )}
                  <span className={`w-8 text-[13px] font-bold tabular-nums ${rightLive ? 'fantasy-live-pts' : 'text-zinc-100'}`}>
                    {playerPts(rightCard, cardsLoading, scoring, sport)}
                  </span>
                </div>
                {pair.right || !pair.rightOpen ? <VsHead row={pair.right} align="right" /> : <OpenSlotTag align="right" />}
              </div>
              <div className="relative z-[1] mt-1.5 grid min-h-[14px] grid-cols-2 gap-1.5 px-1">
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
        className="flex w-full items-start gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-2.5 py-2 text-left"
      >
        {item.position === 'DEF' && item.headshotUrl ? (
          <img src={item.headshotUrl} alt="" className="mt-0.5 h-7 w-7 shrink-0 object-contain" loading="lazy" />
        ) : shot.failed || !item.headshotUrl ? (
          <span className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-zinc-800" aria-hidden />
        ) : (
          <img src={shot.src} alt="" onError={shot.onError} className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-zinc-800 object-cover object-top" loading="lazy" />
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

/** Live: games with these lineups' starters (tap opens the game hub) and the plays that scored for them. */
function LivePanel({ supabaseClient, page, detail, sport, active }) {
  const nfl = String(sport || 'nfl').toLowerCase() === 'nfl'
  const games = useLiveGames({ supabaseClient, active: active && nfl, leftRows: page?.roster, rightRows: page?.oppRoster })
  const rates = useMemo(() => leagueRates(detail?.league?.scoring, 'nfl'), [detail?.league?.scoring])
  const plays = useLivePlays({ supabaseClient, active: active && nfl, games, rates })
  if (!nfl || !games.length) return null
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
      ) : anyLive ? (
        <p className="px-0.5 text-[11px] text-zinc-500">No scoring plays for these starters yet.</p>
      ) : null}
    </div>
  )
}

function shortLeagueName(lg) {
  const name = String(lg?.name || '').trim()
  return name.length > 16 ? `${name.slice(0, 15)}…` : name
}

function rowKeyOf(row) {
  if (row?.sleeper_id) return String(row.sleeper_id)
  return fantasyPosition(row?.position) === 'DEF' && row?.nfl_team ? `DEF:${String(row.nfl_team).toUpperCase()}` : ''
}

/**
 * Main-page Live across every NFL league: one alert per league with something to fix, one games strip and one
 * play feed for all your starters (green) and this week's opponents' starters (rose). A player you start in
 * several leagues shows once, tagged with each. Points use the primary league's scoring.
 */
function HomeLive({ supabaseClient, leagues, details, cards, cardsLoading, onOpenLeague }) {
  const nfl = useMemo(
    () => (leagues || []).filter((lg) => String(lg.sport || 'nfl').toLowerCase() === 'nfl' && details?.[lg.id]),
    [leagues, details],
  )
  const merged = useMemo(() => {
    const left = new Map()
    const right = new Map()
    const tags = new Map()
    const add = (map, row, side, lg) => {
      const key = rowKeyOf(row)
      if (!key) return
      if (!map.has(key)) map.set(key, row)
      const list = tags.get(`${side}:${key}`) || []
      list.push(shortLeagueName(lg))
      tags.set(`${side}:${key}`, list)
    }
    for (const lg of nfl) {
      const page = matchupPages(details[lg.id]).find((p) => p.yours)
      if (!page) continue
      for (const row of page.roster || []) if (row.slot === 'starter') add(left, row, 'left', lg)
      for (const row of page.oppRoster || []) if (row.slot === 'starter') add(right, row, 'right', lg)
    }
    for (const key of left.keys()) right.delete(key)
    return { leftRows: [...left.values()], rightRows: [...right.values()], tags }
  }, [nfl, details])
  const primary = nfl.find((lg) => lg.is_primary) || nfl[0] || null
  const rates = useMemo(() => leagueRates(primary ? details?.[primary.id]?.league?.scoring : null, 'nfl'), [primary, details])
  const games = useLiveGames({ supabaseClient, active: nfl.length > 0, leftRows: merged.leftRows, rightRows: merged.rightRows })
  const plays = useLivePlays({ supabaseClient, active: nfl.length > 0, games, rates })
  if (!nfl.length) return null

  const tagFor = (item) => {
    const key = item.position === 'DEF' ? `DEF:${String(item.name).toUpperCase()}` : String(item.sleeperId || '')
    const list = merged.tags.get(`${item.side}:${key}`) || []
    const label = list.join(' · ')
    return item.side === 'left' ? label || 'Yours' : `vs · ${label || 'Opp'}`
  }
  const anyLive = games.some((g) => g.game.status === 'in')

  return (
    <section data-fantasy-live className="space-y-2">
      {nfl.map((lg) => (
        <LiveAlerts
          key={lg.id}
          detail={details[lg.id]}
          cards={cards}
          cardsLoading={cardsLoading}
          sport="nfl"
          prefix={nfl.length > 1 ? shortLeagueName(lg) : ''}
          onOpen={() => onOpenLeague(lg.id, 'start')}
        />
      ))}
      {games.length ? (
        <>
          <div className="flex items-baseline justify-between gap-2 px-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Live</span>
            <span className="text-[10px] text-zinc-500">
              <span data-fantasy-live-side="left" className="rounded px-1 font-bold">
                yours
              </span>{' '}
              <span data-fantasy-live-side="right" className="rounded px-1 font-bold">
                opponents
              </span>
            </span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {games.map((entry) => (
              <LiveGameChip key={entry.game.id} entry={entry} />
            ))}
          </div>
        </>
      ) : null}
      {plays.length ? (
        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2 px-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Your players</span>
            <span className="text-[10px] text-zinc-500">Tap a play for the game</span>
          </div>
          <ul className="max-h-[22rem] space-y-1.5 overflow-y-auto overscroll-contain">
            {plays.map((item) => (
              <LivePlayRow key={item.key} item={item} tagFor={tagFor} />
            ))}
          </ul>
        </div>
      ) : anyLive ? (
        <p className="px-0.5 text-[11px] text-zinc-500">No scoring plays for your starters yet.</p>
      ) : null}
    </section>
  )
}

function useStartSitPlan(detail, cards, sport) {
  return useMemo(() => {
    const mine = (detail?.teams || []).find((t) => t.is_mine)
    const roster = mine ? detail?.rostersByTeam?.[mine.id] || [] : []
    if (!roster.length) return null
    const { slots, inferred } = leagueLineupSlots(detail?.league, roster)
    if (!slots.length) return null
    return { inferred, ...optimizeLineup({ roster, cards, scoring: detail?.league?.scoring, slots, sport }) }
  }, [detail, cards, sport])
}

/** Live banner: open slots and swaps from Start/Sit, one tap to the details. Hidden when there is nothing to do. */
function LiveAlerts({ detail, cards, cardsLoading, sport, onOpen, prefix = '' }) {
  const plan = useStartSitPlan(detail, cards, sport)
  if (cardsLoading || !plan || (!plan.moves.length && !plan.empty.length)) return null
  const parts = []
  if (plan.empty.length) {
    const names = plan.empty.map(openSlotName)
    parts.push(names.length === 1 ? `${names[0]} is empty` : `${names.length} empty slots`)
  }
  if (plan.moves.length) parts.push(`${plan.moves.length} swap${plan.moves.length > 1 ? 's' : ''}, +${plan.gain.toFixed(1)} proj`)
  return (
    <button
      type="button"
      onClick={onOpen}
      data-fantasy-open-slot
      className="flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-[12px] font-bold"
    >
      <AlertTriangle size={15} strokeWidth={2.25} className="shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        {prefix ? <span className="opacity-80">{prefix}: </span> : null}
        {parts.join(' · ')}
      </span>
      <span className="shrink-0 text-[11px] font-semibold opacity-80">Start/Sit</span>
    </button>
  )
}

/** Start/Sit: best lineup for this week from your own roster, as swap cards. Moves happen on the host. */
function StartSitPanel({ supabaseClient, detail, cards, sport }) {
  const plan = useStartSitPlan(detail, cards, sport)
  const empty = plan?.empty || []
  const fills = useOpenSlotFills({ supabaseClient, detail, empty, sport })
  if (!plan || (!plan.moves.length && !empty.length)) return null
  const host = providerLabel(detail?.league?.provider)
  const moves = plan.moves
  return (
    <div data-fantasy-start-sit className="fantasy-card-lift rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-bold text-zinc-100">
          {moves.length ? 'Suggested moves' : 'Open lineup slot'}
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
            </li>
          ))}
        </ul>
      ) : null}
      {empty.length ? <OpenSlotAlert empty={empty} fills={fills} host={host} /> : null}
      <p className="mt-2 text-[10px] text-zinc-500">
        {moves.length ? `Make the swap on ${host}.` : ''}
        {plan.locked ? `${moves.length ? ' ' : ''}${plan.locked} already playing, locked.` : ''}
        {plan.inferred ? ' Slots read from your current lineup; Sync to load league slots.' : ''}
      </p>
    </div>
  )
}

const WAIVER_POS = ['All', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF']

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
        className="absolute inset-0 h-full w-full origin-[center_22%] scale-[1.42] object-cover object-[center_18%]"
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
          <ComposeOffer offer={flip} myTeamName={myTeamName} initialText={composeFlipMessage(flip, myTeamName)} />
          <p className="mt-1 text-[10px] text-zinc-500">Claim {flip.pickup.name} on {host} first (you need an open roster spot), then send it.</p>
        </>
      ) : null}
    </li>
  )
}

function SniperView({ supabaseClient, detail, sport }) {
  const leagueId = detail?.league?.id || null
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
  }, [supabaseClient, leagueId])
  const state = loaded.id === leagueId ? { ...loaded, loading: false } : { data: null, error: '', loading: true }
  const scoring = detail?.league?.scoring
  const boom = useMemo(() => rankBoom({ sniper: state.data?.sniper, scoring, sport }).slice(0, 6), [state.data, scoring, sport])
  const cuffs = useMemo(() => rankHandcuffs({ sniper: state.data?.sniper, scoring, sport }), [state.data, scoring, sport])
  const week = state.data?.sniper?.week
  const anyProps = (state.data?.sniper?.boom || []).some((b) => b.props?.length)
  const mineTeam = (detail?.teams || []).find((t) => t.is_mine) || null
  const flips = useMemo(() => {
    if (!state.data?.league_players?.length || !mineTeam) return []
    const { slots } = leagueLineupSlots(detail?.league, detail?.rostersByTeam?.[mineTeam.id] || [])
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
        {!anyProps ? (
          <p className="mt-1 text-[10px] text-zinc-500">Kalshi player markets for wk {week} are not open yet; picks use the depth chart and matchups until they are.</p>
        ) : null}
      </div>
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
    </div>
  )
}

/** Waivers: best adds available in this league for your lineup, with a safe drop. Claims happen on the host. */
function WaiversPanel({ supabaseClient, detail, sport }) {
  const leagueId = detail?.league?.id || null
  const [loaded, setLoaded] = useState({ id: null, data: null, error: '' })
  const [pos, setPos] = useState('All')
  const [view, setView] = useState('adds')
  useEffect(() => {
    if (!supabaseClient || !leagueId) return undefined
    let alive = true
    loadWaivers(supabaseClient, leagueId)
      .then((data) => alive && setLoaded({ id: leagueId, data, error: '' }))
      .catch((err) => alive && setLoaded({ id: leagueId, data: null, error: err?.message || 'Could not load waivers.' }))
    return () => {
      alive = false
    }
  }, [supabaseClient, leagueId])
  const state = loaded.id === leagueId ? { ...loaded, loading: false } : { id: leagueId, data: null, error: '', loading: true }

  const mine = (detail?.teams || []).find((t) => t.is_mine) || null
  const rosterRows = useMemo(() => (mine ? detail?.rostersByTeam?.[mine.id] || [] : []), [detail, mine])
  const picks = useMemo(() => {
    if (!state.data?.players?.length || !rosterRows.length) return []
    const { slots } = leagueLineupSlots(detail?.league, rosterRows)
    if (!slots.length) return []
    return rankWaivers({ pool: state.data, rosterRows, scoring: detail?.league?.scoring, slots, sport })
  }, [state.data, rosterRows, detail, sport])

  const host = providerLabel(detail?.league?.provider)
  const weeks = state.data?.weeks || []
  const span = weeks.length ? `wk ${weeks[0]}${weeks.length > 1 ? `-${weeks[weeks.length - 1]}` : ''}` : ''
  const shown = picks.filter((p) => pos === 'All' || p.cand.pos === pos).slice(0, 10)

  return (
    <div data-fantasy-waivers className="fantasy-card-lift rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-bold text-zinc-100">Waivers</div>
        <div className="flex rounded-full border border-zinc-800 p-0.5">
          {[
            ['adds', 'Adds'],
            ['sniper', 'Sniper'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${view === id ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {view === 'sniper' ? (
        <SniperView supabaseClient={supabaseClient} detail={detail} sport={sport} />
      ) : (
      <>
      <div className="mt-1 text-[10px] text-zinc-500">Available in your league{span ? ` · ${span} avg` : ''}</div>
      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {WAIVER_POS.map((p) => (
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
            <li key={pick.cand.id} className="flex items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-950/60 px-2.5 py-2">
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
                    ({pick.drop.value.toFixed(1)}/wk)
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="text-[12px] font-bold tabular-nums text-zinc-100">{pick.cand.value.toFixed(1)}</span>
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                    pick.starter ? 'fantasy-sit-gain' : 'fantasy-sit-ok'
                  }`}
                >
                  {pick.starter ? `+${pick.gain.toFixed(1)}` : 'Depth'}
                </span>
              </div>
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

function ComposeOffer({ offer, myTeamName, initialText }) {
  const [text, setText] = useState(() => initialText ?? composeOfferMessage(offer, myTeamName))
  const [note, setNote] = useState('')
  const flash = (msg) => {
    setNote(msg)
    window.setTimeout(() => setNote(''), 1800)
  }
  return (
    <div data-fantasy-trade-compose className="mt-2 space-y-1.5">
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

function OfferCard({ offer, myTeamName, compact = false, composeText }) {
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
      {open ? <ComposeOffer offer={offer} myTeamName={myTeamName} initialText={composeText} /> : null}
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
    const { slots } = leagueLineupSlots(detail?.league, detail?.rostersByTeam?.[me.id] || [])
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
    const { slots } = leagueLineupSlots(detail?.league, detail?.rostersByTeam?.[me.id] || [])
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
              />
            ))}
          </div>
        </div>
      ) : null}

      {review?.betterAsk ? (
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Better ask them for</div>
          <OfferCard offer={review.betterAsk} myTeamName={myName} />
        </div>
      ) : null}
    </div>
  )
}

/** Trade Finder: offers that raise your best lineup, realistic for the other side, with a pasteable message. */
function TradesPanel({ supabaseClient, detail, sport }) {
  const leagueId = detail?.league?.id || null
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
  }, [supabaseClient, leagueId])
  const state = loaded.id === leagueId ? { ...loaded, loading: false } : { data: null, error: '', loading: true }

  const mine = (detail?.teams || []).find((t) => t.is_mine) || null
  const result = useMemo(() => {
    if (!state.data?.league_players?.length || !mine) return null
    const { slots } = leagueLineupSlots(detail?.league, detail?.rostersByTeam?.[mine.id] || [])
    return findTrades({ values: state.data, detail, scoring: detail?.league?.scoring, slots, sport })
  }, [state.data, detail, mine, sport])
  const weeks = state.data?.weeks || []
  const span = weeks.length ? `wk ${weeks[0]}${weeks.length > 1 ? `-${weeks[weeks.length - 1]}` : ''}` : ''
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
        {view === 'review' ? 'Grade an offer you got' : 'Slightly aggressive'}
        {span ? ` · ${span}` : ''}
      </div>
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
            <OfferCard offer={result.best} myTeamName={myName} />
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
        Based on next-four-week projections in your league scoring. Send the offer on {providerLabel(detail?.league?.provider)} or paste the message anywhere.
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
      <MatchupRows pairs={starters} cards={cards} cardsLoading={cardsLoading} scoring={scoring} sport={sport} />
      <MatchupRows pairs={bench} cards={cards} cardsLoading={cardsLoading} bench scoring={scoring} sport={sport} />
    </ul>
  )
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
    if (preferLeftId && preferLeftId === rightId) {
      leftId = rightId
      rightId = mu.mine_team_id
      leftScore = mu.opp_score
      rightScore = mu.mine_score
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
  const projFinal = score.live && finish != null ? finish.toFixed(1) : null
  const end = align === 'right'
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
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          {score.live ? 'Live' : score.text === '–' ? '' : 'Proj'}
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

function WinBar({ left, right }) {
  const p = winChance(left, right)
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

function MatchupCard({ page, teams, week, provider, cards, scoring, sport }) {
  const leftOut = sideOutlook(page.roster, cards, scoring, sport)
  const rightOut = sideOutlook(page.oppRoster, cards, scoring, sport)
  const leftAccent = useTeamAccent(page.left?.avatar_url, page.left?.id || page.left?.team_name)
  const rightRaw = useTeamAccent(page.right?.avatar_url, page.right?.id || page.right?.team_name)
  const rightAccent = distinctTeamAccent(rightRaw, leftAccent)
  const ls = scoreValue(leftOut, page.leftScore)
  const rs = scoreValue(rightOut, page.rightScore)
  const lead = page.right && ls != null && rs != null && ls !== rs ? (ls > rs ? 'left' : 'right') : null
  const lo = projectedFinish(leftOut, page.leftScore)
  const ro = page.right ? projectedFinish(rightOut, page.rightScore) : null
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
      {/* Names get the full width on top; the site badge sits between the scores below. */}
      <div className={`relative grid gap-3 px-3 pt-3 ${page.right ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <TeamHead team={page.left} teams={teams} align="left" />
        {page.right ? <TeamHead team={page.right} teams={teams} align="right" /> : null}
      </div>
      <div
        className={`relative grid items-center gap-1 px-3 pb-3 pt-2 ${
          page.right ? 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]' : 'grid-cols-1'
        }`}
      >
        <ScoreLine
          outlook={leftOut}
          hostScore={page.leftScore}
          align="left"
          lead={lead === 'left' ? 'lead' : lead === 'right' ? 'trail' : null}
          projUp={lo != null && ro != null ? lo >= ro : true}
          projFinal={lo}
        />
        {page.right ? (
          <div className="flex flex-col items-center justify-center px-1">
            <SiteBadge provider={provider} />
            <div className="mt-1 text-[10px] font-semibold text-zinc-500">
              {week != null ? `Week ${week}` : 'This week'}
            </div>
          </div>
        ) : null}
        {page.right ? (
          <ScoreLine
            outlook={rightOut}
            hostScore={page.rightScore}
            align="right"
            lead={lead === 'right' ? 'lead' : lead === 'left' ? 'trail' : null}
            projUp={lo != null && ro != null ? ro > lo : true}
            projFinal={ro}
          />
        ) : (
          <p className="text-[12px] text-zinc-500">Bye this week.</p>
        )}
      </div>
      {page.right ? (
        <div className="relative">
          <WinBar left={lo} right={ro} />
        </div>
      ) : null}
    </div>
  )
}

/**
 * Matchups as a snap carousel: the current card centered, neighbors peeking 20px on each side.
 * Bleeds to the screen edge (-mx-4 matches the page gutter). `onSettle` fires once a swipe comes to rest.
 */
function MatchupCarousel({ pages, index, onSettle, renderCard }) {
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
      className="relative -mx-4 -mt-3 mb-1 flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-7 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {pages.map((page, i) => (
        <div
          key={page.key}
          className={`w-full shrink-0 snap-center snap-always transition-opacity duration-200 ${i === index ? '' : 'opacity-60'}`}
          onClick={i === index ? undefined : () => centerOn(i, 'smooth')}
        >
          {renderCard(page)}
        </div>
      ))}
    </div>
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
  details,
  loadingDetail,
  cards,
  cardsLoading,
  busy,
  onSetPrimary,
  onOpenManage,
  onSync,
}) {
  const [leagueId, setLeagueId] = useState(null)
  const [pageKey, setPageKey] = useState(null)
  const [tool, setTool] = useState('live')

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

  const selected = leagueId ? (leagues || []).find((lg) => lg.id === leagueId) || null : null
  const detail = selected ? details?.[selected.id] || null : null
  const pages = useMemo(() => (detail ? matchupPages(detail) : []), [detail])
  const keyed = pages.findIndex((item) => item.key === pageKey)
  const safePage = keyed >= 0 ? keyed : 0
  const current = pages[safePage] || null

  const openMatchup = (id, key) => {
    setLeagueId(id)
    setPageKey(key)
    void onSetPrimary?.(id)
  }
  const openLeagueTool = (id, nextTool) => {
    const page = details?.[id] ? matchupPages(details[id]).find((p) => p.yours) : null
    setTool(nextTool)
    openMatchup(id, page?.key || null)
  }

  return (
    <div className="space-y-4">
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
            disabled={busy}
            onClick={() => void onSync()}
            className="rounded-full border border-zinc-700 px-3 py-1.5 text-[12px] font-semibold text-zinc-200 disabled:opacity-40"
          >
            {busy ? '…' : 'Sync'}
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

      {!loadingDetail && !(leagues || []).length ? (
        <div className="rounded-2xl border border-zinc-800 p-4 text-[13px] text-zinc-400">
          No leagues synced yet. Open Manage and sync after the league is live.
        </div>
      ) : null}

      {!leagueId ? (
        <>
          <HomeLive
            supabaseClient={supabaseClient}
            leagues={leagues}
            details={details}
            cards={cards}
            cardsLoading={cardsLoading}
            onOpenLeague={openLeagueTool}
          />
          {loadingDetail && !(leagues || []).some((lg) => details?.[lg.id]) ? (
            <div className="py-6 text-center text-sm text-zinc-500">Loading matchups…</div>
          ) : null}
          {groups.map((group) => {
            const matchups = group.leagues.flatMap((lg) => {
              const leagueDetail = details?.[lg.id]
              if (!leagueDetail) return []
              return matchupPages(leagueDetail)
                .filter((item) => item.yours)
                .map((item) => ({ lg, item, leagueDetail }))
            })
            if (!matchups.length && !loadingDetail) return null
            return (
              <section key={group.sport} className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{group.label}</div>
                {matchups.map(({ lg, item, leagueDetail }) => (
                  <button
                    key={`${lg.id}-${item.key}`}
                    type="button"
                    onClick={() => {
                      setTool('live')
                      openMatchup(lg.id, item.key)
                    }}
                    className="block w-full border-0 bg-transparent p-0 text-left"
                  >
                    <MatchupCard
                      page={item}
                      teams={leagueDetail.teams}
                      week={leagueDetail.week}
                      provider={lg.provider || leagueDetail.league?.provider}
                      cards={cards}
                      scoring={leagueDetail.league?.scoring}
                      sport={group.sport}
                    />
                  </button>
                ))}
              </section>
            )
          })}
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
              renderCard={(page) => (
                <MatchupCard
                  page={page}
                  teams={detail?.teams || []}
                  week={detail?.week}
                  provider={selected?.provider || detail?.league?.provider}
                  cards={cards}
                  scoring={detail?.league?.scoring}
                  sport={selected?.sport || detail?.league?.sport}
                />
              )}
            />
          ) : null}

          <div className="flex gap-2 overflow-x-auto pb-1">
            {TOOLS.map((item) => {
              const on = item.id === tool
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTool(item.id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                    on ? 'bg-zinc-100 text-zinc-950' : 'bg-zinc-900 text-zinc-300 border border-zinc-800'
                  }`}
                >
                  {item.label}
                </button>
              )
            })}
          </div>

          {tool === 'live' && detail ? (
            <LiveAlerts
              detail={detail}
              cards={cards}
              cardsLoading={cardsLoading}
              sport={selected?.sport || detail?.league?.sport}
              onOpen={() => setTool('start')}
            />
          ) : null}
          {tool === 'live' && detail && current ? (
            <LivePanel
              supabaseClient={supabaseClient}
              page={current}
              detail={detail}
              sport={selected?.sport || detail?.league?.sport}
              active
            />
          ) : null}
          {tool === 'start' && detail ? (
            <StartSitPanel supabaseClient={supabaseClient} detail={detail} cards={cards} sport={selected?.sport || detail?.league?.sport} />
          ) : null}
          {tool === 'waiver' && detail ? (
            <WaiversPanel supabaseClient={supabaseClient} detail={detail} sport={selected?.sport || detail?.league?.sport} />
          ) : null}
          {tool === 'trade' && detail ? (
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
