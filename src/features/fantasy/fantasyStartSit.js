import { nbaWeekOf } from './fantasyNbaWeek.js'
import { projectionOf } from './fantasyProjection.js'

/** Which player positions can fill each lineup slot. */
const SLOT_ELIGIBLE = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  K: ['K'],
  DEF: ['DEF'],
  FLEX: ['RB', 'WR', 'TE'],
  WRRB_FLEX: ['WR', 'RB'],
  REC_FLEX: ['WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  // NBA (Sleeper slot codes); players carry multi-position eligibility (card `elig`).
  PG: ['PG'],
  SG: ['SG'],
  SF: ['SF'],
  PF: ['PF'],
  C: ['C'],
  G: ['PG', 'SG', 'G'],
  F: ['SF', 'PF'],
  UTIL: ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'FC'],
  // Yahoo High Score: Frontcourt (players there are listed G / FC).
  FC: ['SF', 'PF', 'C', 'FC'],
  // ESPN combo slots.
  'SG/SF': ['SG', 'SF'],
  'G/F': ['PG', 'SG', 'SF'],
  'PF/C': ['PF', 'C'],
  'F/C': ['SF', 'PF', 'C'],
}

/** Slots `leagueLineupSlots` returns (football); NBA leagues read theirs through `waiverLineupSlots`. */
const NFL_SLOTS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'FLEX', 'WRRB_FLEX', 'REC_FLEX', 'SUPER_FLEX'])

const SLOT_ALIAS = {
  'D/ST': 'DEF',
  DST: 'DEF',
  'W/R/T': 'FLEX',
  'RB/WR/TE': 'FLEX',
  'W/R': 'WRRB_FLEX',
  'RB/WR': 'WRRB_FLEX',
  'W/T': 'REC_FLEX',
  'WR/TE': 'REC_FLEX',
  'Q/W/R/T': 'SUPER_FLEX',
  OP: 'SUPER_FLEX',
  SUPERFLEX: 'SUPER_FLEX',
}

/** Typical one-of slots; starters beyond these counts are read as FLEX when a host does not send its slots. */
const BASE_SLOTS = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 }

export function fantasyPosition(position) {
  const p = String(position || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  if (p === 'FB' || p === 'HB') return 'RB'
  if (p === 'DST' || p === 'D' || p === 'DEF') return 'DEF'
  if (p === 'PK') return 'K'
  return p
}

function normSlot(raw) {
  const up = String(raw || '').trim().toUpperCase()
  return SLOT_ALIAS[up] || up
}

/**
 * Starting slots for this league. Sleeper sends `roster_positions`, ESPN sync writes `lineup_slots`.
 * Otherwise infer from the current starters (one QB, two RB, two WR, one TE, K, DEF, the rest FLEX).
 */
export function leagueLineupSlots(league, roster) {
  const settings = league?.settings && typeof league.settings === 'object' ? league.settings : {}
  const raw = Array.isArray(settings.lineup_slots) && settings.lineup_slots.length
    ? settings.lineup_slots
    : Array.isArray(settings.roster_positions)
      ? settings.roster_positions
      : []
  const slots = raw.map(normSlot).filter((s) => NFL_SLOTS.has(s))
  if (slots.length) return { slots, inferred: false }

  const counts = {}
  for (const row of roster || []) {
    if (row?.slot !== 'starter') continue
    const pos = fantasyPosition(row.position)
    counts[pos] = (counts[pos] || 0) + 1
  }
  const out = []
  let flex = 0
  let superFlex = 0
  for (const [pos, n] of Object.entries(counts)) {
    const base = BASE_SLOTS[pos]
    if (base == null) continue
    const keep = Math.min(n, base)
    for (let i = 0; i < keep; i++) out.push(pos)
    const extra = n - keep
    if (extra > 0) {
      if (pos === 'QB') superFlex += extra
      else if (pos === 'RB' || pos === 'WR' || pos === 'TE') flex += extra
    }
  }
  for (let i = 0; i < flex; i++) out.push('FLEX')
  for (let i = 0; i < superFlex; i++) out.push('SUPER_FLEX')
  return { slots: out, inferred: true }
}

export function injuryKey(status) {
  const s = String(status || '').trim().toLowerCase()
  if (!s) return ''
  if (/^(o|out|ir|pup|sus|suspended|na|nfi|cov)$/.test(s) || s.includes('reserve')) return 'out'
  if (/^d(oubtful)?$/.test(s)) return 'doubtful'
  if (/^q(uestionable)?$/.test(s)) return 'questionable'
  return ''
}

const INJURY_FACTOR = { out: 0, doubtful: 0.25, questionable: 0.85 }
const INJURY_WORD = { out: 'out', doubtful: 'doubtful', questionable: 'questionable' }

export function gameLocked(card) {
  if (!card || card.bye) return false
  const st = String(card.game_status || '').toLowerCase()
  if (['in_progress', 'inprogress', 'live', 'complete', 'closed', 'final', 'post'].includes(st)) return true
  const t = card.kickoff ? Date.parse(card.kickoff) : NaN
  return Number.isFinite(t) && t <= Date.now()
}

/** This week's projection in league scoring (Sleeper + props blend, `fantasyProjection.js`), then injury and bye. */
export function weekValue(row, card, scoring, sport = 'nfl') {
  const base = projectionOf(card, scoring, sport, fantasyPosition(row?.position))
  const proj = Number.isFinite(base) ? base : 0
  if (card?.bye) return { value: 0, proj, why: 'bye' }
  const injury = injuryKey(row?.injury_status)
  if (injury) return { value: proj * INJURY_FACTOR[injury], proj, why: INJURY_WORD[injury] }
  return { value: proj, proj, why: '' }
}

/** NBA locks each player at his own tip: playing or finished today means his seat is set. */
export function nbaLocked(card) {
  return card?.today === 'in' || card?.today === 'post'
}

/** NBA Start / Sit is for today: his per-game projection if his team plays today, else nothing to gain. */
export function nbaTodayValue(row, card, scoring) {
  const base = projectionOf(card, scoring, 'nba', fantasyPosition(row?.position))
  const proj = Number.isFinite(base) ? base : 0
  if (!card?.today) return { value: 0, proj, why: 'no game' }
  const s = String(row?.injury_status || '').trim().toLowerCase()
  const injury = /^(gtd|dtd|day)/.test(s) ? 'questionable' : injuryKey(s)
  if (injury) return { value: proj * INJURY_FACTOR[injury], proj, why: INJURY_WORD[injury] }
  return { value: proj, proj, why: '' }
}

function canFill(slot, pos, elig = null) {
  const list = SLOT_ELIGIBLE[slot] || []
  return (elig?.length ? elig : [pos]).some((p) => list.includes(p))
}

/** Positions that can play a lineup slot (FLEX → RB / WR / TE). */
export function slotPositions(slot) {
  return SLOT_ELIGIBLE[slot] || []
}

/**
 * NBA weekly lineup (Yahoo High Score): a starter is worth the expected best of his banked game and games left
 * (benching him gives the banked game up); a bench player only counts games from when he goes in.
 */
function nbaWeeklyValue(row, card, scoring, nbaWeek) {
  const starter = row?.slot === 'starter'
  const w = card ? nbaWeekOf(starter ? row : { ...row, week_points: 0 }, card, scoring, Date.now(), { lockIn: nbaWeek.mode, upcoming: nbaWeek.upcoming }) : null
  const value = w && Number.isFinite(w.total) ? w.total : 0
  const proj = w && Number.isFinite(w.perGame) ? w.perGame : 0
  if (!w || (w.gamesLeft <= 0 && !w.live && !(starter && w.host > 0))) return { value: 0, proj, why: 'no game' }
  return { value, proj, why: '' }
}

/**
 * Best legal lineup for this week. Players whose game already started stay where they are.
 * Most restrictive slots fill first, so FLEX takes the best leftover RB / WR / TE.
 * Returns the moves (start this one, bench that one) and the projected gain.
 * `nbaWeek` ({ mode, upcoming }) plans an NBA week instead of today (lineups set once a week).
 */
export function optimizeLineup({ roster, cards, scoring, slots, sport = 'nfl', nbaWeek = null }) {
  // NBA plans today's games (daily locks) unless the league sets lineups weekly; NFL plans the week.
  const nba = sport === 'nba'
  const pool = (roster || [])
    .filter((row) => row?.sleeper_id && (row.slot === 'starter' || row.slot === 'bench'))
    .map((row) => {
      const card = cards?.[row.sleeper_id] || null
      const pos = fantasyPosition(row.position)
      return {
        row,
        card,
        pos,
        elig: nba && card?.elig?.length ? card.elig.map((p) => String(p).toUpperCase()) : null,
        locked: nba ? (nbaWeek ? card?.game_status === 'in_progress' : nbaLocked(card)) : gameLocked(card),
        starter: row.slot === 'starter',
        ...(nba
          ? nbaWeek
            ? nbaWeeklyValue(row, card, scoring, nbaWeek)
            : nbaTodayValue(row, card, scoring)
          : weekValue(row, card, scoring, sport)),
      }
    })

  const open = slots.map((slot, i) => ({ slot, i, player: null }))
  const used = new Set()
  const restrict = (slot) => (SLOT_ELIGIBLE[slot] || []).length

  // Locked starters keep a seat: give each the tightest open slot it fits.
  for (const p of pool.filter((x) => x.locked && x.starter)) {
    const seat = open
      .filter((s) => !s.player && canFill(s.slot, p.pos, p.elig))
      .sort((a, b) => restrict(a.slot) - restrict(b.slot))[0]
    if (seat) {
      seat.player = p
      used.add(p.row.sleeper_id)
    }
  }

  // A player with no NFL team, on bye, out, or (NBA) no game today cannot score, so he does not count as filling a seat.
  const playable = (p) => p.why !== 'bye' && p.why !== 'out' && p.why !== 'no game' && (p.pos === 'DEF' || Boolean(p.row.nfl_team))
  const order = open.filter((s) => !s.player).sort((a, b) => restrict(a.slot) - restrict(b.slot) || a.i - b.i)
  for (const seat of order) {
    const best = pool
      .filter((p) => !used.has(p.row.sleeper_id) && !(p.locked && !p.starter) && playable(p) && canFill(seat.slot, p.pos, p.elig))
      .sort((a, b) => b.value - a.value || Number(b.starter) - Number(a.starter))[0]
    if (best) {
      seat.player = best
      used.add(best.row.sleeper_id)
    }
  }

  const bestIds = new Set(open.filter((s) => s.player).map((s) => s.player.row.sleeper_id))
  const current = pool.filter((p) => p.starter)
  const ins = pool.filter((p) => !p.starter && bestIds.has(p.row.sleeper_id)).sort((a, b) => b.value - a.value)
  const outs = current.filter((p) => !bestIds.has(p.row.sleeper_id)).sort((a, b) => a.value - b.value)

  const moves = []
  const left = [...outs]
  for (const inP of ins) {
    let at = left.findIndex((o) => o.pos === inP.pos)
    if (at < 0) at = left.findIndex((o) => slots.some((slot) => canFill(slot, o.pos, o.elig) && canFill(slot, inP.pos, inP.elig)))
    if (at < 0) at = left.length ? 0 : -1
    const outP = at >= 0 ? left.splice(at, 1)[0] : null
    const gain = inP.value - (outP ? outP.value : 0)
    if (gain < 0.05 && outP) continue
    moves.push({ start: inP, bench: outP, gain })
  }

  const sum = (list) => list.reduce((acc, p) => acc + p.value, 0)
  const now = sum(current)
  const best = sum(open.filter((s) => s.player).map((s) => s.player))
  // Seats nobody on the roster can take (no eligible player, or every one is locked on the bench / already used).
  const empty = open
    .filter((s) => !s.player)
    .map((s) => {
      const total = slots.filter((x) => x === s.slot).length
      const nth = slots.slice(0, s.i + 1).filter((x) => x === s.slot).length
      return { slot: s.slot, label: total > 1 ? `${s.slot}${nth}` : s.slot }
    })
  return {
    moves,
    gain: Math.max(0, best - now),
    projected: best,
    locked: pool.filter((p) => p.locked && p.starter).length,
    // An NBA seat with nobody playing today is a normal off day, not a hole to fill.
    empty: nba ? [] : empty,
  }
}

/**
 * Dedicated starting slots (QB / RB / WR / TE / K / DEF) the host lineup leaves empty, as `{ pos: count }`.
 * Starters take the tightest slot they fit; FLEX holes are left to Start/Sit.
 */
export function openLineupSlots(rows, slots) {
  const seats = (slots || []).map((slot) => ({ slot, taken: false }))
  const restrict = (slot) => (SLOT_ELIGIBLE[slot] || []).length
  for (const row of rows || []) {
    if (row?.slot !== 'starter') continue
    const pos = fantasyPosition(row.position)
    const seat = seats
      .filter((x) => !x.taken && canFill(x.slot, pos))
      .sort((a, b) => restrict(a.slot) - restrict(b.slot))[0]
    if (seat) seat.taken = true
  }
  const out = {}
  for (const x of seats) {
    if (x.taken || restrict(x.slot) !== 1) continue
    const pos = SLOT_ELIGIBLE[x.slot][0]
    out[pos] = (out[pos] || 0) + 1
  }
  return out
}
