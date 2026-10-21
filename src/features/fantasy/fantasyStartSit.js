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
}

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
  const slots = raw.map(normSlot).filter((s) => SLOT_ELIGIBLE[s])
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

function canFill(slot, pos) {
  return (SLOT_ELIGIBLE[slot] || []).includes(pos)
}

/** Positions that can play a lineup slot (FLEX → RB / WR / TE). */
export function slotPositions(slot) {
  return SLOT_ELIGIBLE[slot] || []
}

/**
 * Best legal lineup for this week. Players whose game already started stay where they are.
 * Most restrictive slots fill first, so FLEX takes the best leftover RB / WR / TE.
 * Returns the moves (start this one, bench that one) and the projected gain.
 */
export function optimizeLineup({ roster, cards, scoring, slots, sport = 'nfl' }) {
  const pool = (roster || [])
    .filter((row) => row?.sleeper_id && (row.slot === 'starter' || row.slot === 'bench'))
    .map((row) => {
      const card = cards?.[row.sleeper_id] || null
      const pos = fantasyPosition(row.position)
      return { row, card, pos, locked: gameLocked(card), starter: row.slot === 'starter', ...weekValue(row, card, scoring, sport) }
    })

  const open = slots.map((slot, i) => ({ slot, i, player: null }))
  const used = new Set()
  const restrict = (slot) => (SLOT_ELIGIBLE[slot] || []).length

  // Locked starters keep a seat: give each the tightest open slot it fits.
  for (const p of pool.filter((x) => x.locked && x.starter)) {
    const seat = open
      .filter((s) => !s.player && canFill(s.slot, p.pos))
      .sort((a, b) => restrict(a.slot) - restrict(b.slot))[0]
    if (seat) {
      seat.player = p
      used.add(p.row.sleeper_id)
    }
  }

  // A player with no NFL team, on bye, or out cannot score, so he does not count as filling a seat.
  const playable = (p) => p.why !== 'bye' && p.why !== 'out' && (p.pos === 'DEF' || Boolean(p.row.nfl_team))
  const order = open.filter((s) => !s.player).sort((a, b) => restrict(a.slot) - restrict(b.slot) || a.i - b.i)
  for (const seat of order) {
    const best = pool
      .filter((p) => !used.has(p.row.sleeper_id) && !(p.locked && !p.starter) && playable(p) && canFill(seat.slot, p.pos))
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
    if (at < 0) at = left.findIndex((o) => slots.some((slot) => canFill(slot, o.pos) && canFill(slot, inP.pos)))
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
    empty,
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
