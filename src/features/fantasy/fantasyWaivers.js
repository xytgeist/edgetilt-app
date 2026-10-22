import { scoreLine } from './fantasyBoxScore.js'
import { fantasyPosition, leagueLineupSlots } from './fantasyStartSit.js'
import { seasonProfile } from './fantasyValue.js'

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
  // NBA (Sleeper slot codes); players carry multi-position eligibility (`elig`).
  PG: ['PG'],
  SG: ['SG'],
  SF: ['SF'],
  PF: ['PF'],
  C: ['C'],
  G: ['PG', 'SG'],
  F: ['SF', 'PF'],
  UTIL: ['PG', 'SG', 'SF', 'PF', 'C'],
}

function canFill(slot, pos, elig = null) {
  const list = SLOT_ELIGIBLE[slot] || []
  return (elig?.length ? elig : [pos]).some((p) => list.includes(p))
}

/**
 * Lineup slots for waiver math. NBA reads Sleeper's `roster_positions` here so Start / Sit (`leagueLineupSlots`)
 * stays NFL-shaped (NBA lineups lock daily, not weekly).
 */
export function waiverLineupSlots(league, rosterRows, sport = 'nfl') {
  if (sport !== 'nba') return leagueLineupSlots(league, rosterRows).slots
  const settings = league?.settings && typeof league.settings === 'object' ? league.settings : {}
  const raw = Array.isArray(settings.roster_positions) ? settings.roster_positions : Array.isArray(settings.lineup_slots) ? settings.lineup_slots : []
  return raw.map((s) => String(s || '').trim().toUpperCase()).filter((s) => SLOT_ELIGIBLE[s] && !['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(s))
}

/** NBA eligibility from Sleeper `fantasy_positions` (NFL players stay single-position). */
function eligOf(entry, sport) {
  if (sport !== 'nba') return null
  const list = Array.isArray(entry?.fantasy_positions) ? entry.fantasy_positions.map((p) => String(p).toUpperCase()) : []
  return list.length ? list : null
}

function injuryKind(status) {
  const s = String(status || '').trim().toLowerCase()
  if (!s) return ''
  if (/^(ir|pup|sus|suspended|nfi|na)$/.test(s) || s.includes('reserve')) return 'long'
  if (/^(o|out)$/.test(s)) return 'out'
  if (/^d(oubtful)?$/.test(s)) return 'doubtful'
  if (/^q(uestionable)?$/.test(s)) return 'questionable'
  return ''
}

const FIRST_WEEK_FACTOR = { out: 0, doubtful: 0.25, questionable: 0.85 }

/** Points per week over the horizon in league scoring (K / DEF keep Sleeper's points), then injury. */
export function horizonValue(entry, scoring, injuryStatus, sport = 'nfl') {
  const pos = fantasyPosition(entry?.position)
  const kind = injuryKind(injuryStatus ?? entry?.injury_status)
  const known = (entry?.weeks || []).some((w) => !w.bye && (w.ppr != null || w.line))
  const weeks = (entry?.weeks || []).map((w, i) => {
    if (w.bye) return { week: w.week, pts: 0, bye: true, opp: null }
    const scored = w.line ? scoreLine(w.line, scoring, sport, pos) : null
    let pts = Number.isFinite(scored) ? scored : Number(w.ppr) || 0
    if (kind === 'long') pts = 0
    else if (i === 0 && kind in FIRST_WEEK_FACTOR) pts *= FIRST_WEEK_FACTOR[kind]
    return { week: w.week, pts, bye: false, opp: w.opp, home: w.home }
  })
  const avg = weeks.length ? weeks.reduce((a, w) => a + w.pts, 0) / weeks.length : 0
  // Per game over the weeks he plays and has a projection: what he is worth to keep, byes aside.
  let sum = 0
  let games = 0
  for (const w of entry?.weeks || []) {
    if (w.bye || (w.ppr == null && !w.line)) continue
    const scored = w.line ? scoreLine(w.line, scoring, sport, pos) : null
    sum += Number.isFinite(scored) ? scored : Number(w.ppr) || 0
    games += 1
  }
  const healthy = games ? sum / games : 0
  return { avg, healthy, weeks, injury: kind, known }
}

export function rowId(row) {
  if (row?.sleeper_id) return String(row.sleeper_id)
  if (fantasyPosition(row?.position) === 'DEF' && row?.nfl_team) return String(row.nfl_team).toUpperCase()
  return ''
}

/** Best seats by value: tightest slots first, so FLEX takes the best leftover. */
export function bestSeats(pool, slots) {
  const restrict = (slot) => (SLOT_ELIGIBLE[slot] || []).length
  const order = slots.map((slot, i) => ({ slot, i })).sort((a, b) => restrict(a.slot) - restrict(b.slot) || a.i - b.i)
  const used = new Set()
  const seats = []
  let total = 0
  for (const { slot } of order) {
    const best = pool
      .filter((p) => !used.has(p.id) && canFill(slot, p.pos, p.elig))
      .sort((a, b) => b.value - a.value)[0]
    if (!best) continue
    used.add(best.id)
    seats.push({ slot, p: best })
    total += best.value
  }
  return { seats, total, seated: used }
}

/** How many of each position the dedicated (one-position) slots need … never suggest dropping below it. */
function minimumByPos(slots) {
  const need = {}
  for (const slot of slots) {
    const elig = SLOT_ELIGIBLE[slot] || []
    if (elig.length === 1) need[elig[0]] = (need[elig[0]] || 0) + 1
  }
  return need
}

/** A drop is never someone the market prices this much above the pickup (FantasyCalc scale). */
const DROP_MARKET_CUSHION = 300
/** A handcuff can go only if another non-starting RB is worth this share of the starter he backs up. */
const DECENT_RB_SHARE = 0.7

function sameTeam(a, b) {
  const t = (x) => String(x || '').toUpperCase().replace(/[^A-Z]/g, '')
  return Boolean(t(a)) && t(a) === t(b)
}

/**
 * Rank the league's available players for this roster. `gain` is how much the best starting lineup improves per
 * week if added: over the rest of the season when the Edge sent rest-of-season data (season production blended
 * with projections, injury-aware games left), else over the next few weeks. `nearGain` is always the next few
 * weeks. `depth` is the upgrade over the weakest bench player at that position. Each pick carries a drop that
 * keeps every dedicated slot fillable and is never worth more than the pickup, rest of season or by market value.
 */
export function rankWaivers({ pool, rosterRows, scoring, slots, sport = 'nfl' }) {
  const rosterById = new Map((pool?.roster || []).map((p) => [String(p.sleeper_id), p]))
  const ctx = { scoring, sport, weeksLeft: Number(pool?.weeks_left) || 0 }
  const profileOf = (entry, h, pos) => seasonProfile(entry, h, ctx, pos)
  const candidates = (pool?.players || []).map((entry) => ({ entry, h: horizonValue(entry, scoring, entry.injury_status, sport) }))
  // A rostered player with no projection at all is valued at roughly the best freely available option,
  // so a missing feed does not make every waiver player at that position look like an upgrade.
  const replacement = {}
  for (const { entry, h } of candidates) {
    const pos = fantasyPosition(entry.position)
    ;(replacement[pos] ||= []).push(h.avg)
  }
  for (const pos of Object.keys(replacement)) {
    const top = replacement[pos].sort((a, b) => b - a)
    replacement[pos] = top[Math.min(2, top.length - 1)] || 0
  }
  const mine = (rosterRows || [])
    .filter((row) => rowId(row) && (row.slot === 'starter' || row.slot === 'bench'))
    .map((row) => {
      const id = rowId(row)
      const pos = fantasyPosition(row.position)
      const entry = rosterById.get(id) || { position: row.position, weeks: [] }
      const h = horizonValue(entry, scoring, row.injury_status, sport)
      const value = h.known || h.injury === 'long' ? h.avg : replacement[pos] || 0
      const prof = profileOf(entry, h, pos)
      return {
        id,
        pos,
        elig: eligOf(entry, sport),
        value,
        rosWeekly: prof ? prof.weekly : null,
        rosTotal: prof ? prof.ppg * prof.games : null,
        market: Number(entry.market_value) || 0,
        h,
        row,
        name: row.player_name,
      }
    })
  const ros = ctx.weeksLeft > 0 && mine.some((p) => p.rosWeekly != null)
  const rosSeats = (list) => bestSeats(list.map((p) => ({ ...p, value: p.rosWeekly ?? p.value })), slots)
  const base = bestSeats(mine, slots)
  const baseRos = ros ? rosSeats(mine) : null
  const need = minimumByPos(slots)
  const countPos = (list, pos) => list.filter((p) => p.pos === pos).length

  const picks = []
  for (const { entry, h } of candidates) {
    if (h.avg <= 0) continue
    const candPos = fantasyPosition(entry.position)
    const prof = profileOf(entry, h, candPos)
    const cand = {
      id: String(entry.sleeper_id),
      pos: candPos,
      elig: eligOf(entry, sport),
      value: h.avg,
      rosWeekly: prof ? prof.weekly : null,
      rosTotal: prof ? prof.ppg * prof.games : null,
      market: Number(entry.market_value) || 0,
      h,
      entry,
      name: entry.name,
    }
    const trial = bestSeats([...mine, cand], slots)
    const nearGain = trial.total - base.total
    const rosTrial = ros ? rosSeats([...mine, cand]) : null
    const rosGain = rosTrial ? rosTrial.total - baseRos.total : null
    const gain = rosGain ?? nearGain
    const seatedAfter = rosTrial ? rosTrial.seated : trial.seated
    const before = rosTrial ? baseRos : base
    const replaced = gain > 0.05 ? before.seats.map((s) => s.p).find((p) => !seatedAfter.has(p.id)) || null : null

    const after = [...mine, cand]
    const benchAfter = after.filter((p) => !seatedAfter.has(p.id) && p.id !== cand.id)
    // Keep-worth: rest-of-season points when we have them (injury-aware), else the healthy per-game rate,
    // so byes and IR stashes do not decide who gets cut. Never drop someone the market values well above him.
    const keepValue = (p) => (p.rosTotal != null ? p.rosTotal : p.h.known ? Math.max(p.value, p.h.healthy) : p.value)
    const candKeep = cand.rosTotal != null ? cand.rosTotal : cand.h.healthy
    // Handcuffs: a bench RB on the same NFL team as one of your starting RBs. Keep him unless another
    // non-starting RB (the pickup counts) could hold that starter's spot if he goes down.
    const startingRbs = before.seats.map((s) => s.p).filter((p) => p.pos === 'RB')
    const weekly = (p) => p.rosWeekly ?? p.value
    const cuffProtected = (p) => {
      if (p.pos !== 'RB') return false
      const starter = startingRbs.find((st) => st.id !== p.id && sameTeam(st.row?.nfl_team, p.row?.nfl_team))
      if (!starter) return false
      if (p.h.healthy < (replacement.RB || 0) * 0.8) return false
      const others = after.filter((o) => o.pos === 'RB' && o.id !== p.id && o.id !== starter.id && !startingRbs.some((st) => st.id === o.id))
      const bestOther = Math.max(0, ...others.map(weekly))
      return bestOther < DECENT_RB_SHARE * weekly(starter)
    }
    // Why each bench player after the move is (or is not) the cut, for the card's breakdown.
    const keepReason = (p) => {
      if (countPos(after, p.pos) - 1 < (need[p.pos] || 0)) return 'need'
      if (keepValue(p) >= candKeep) return 'better'
      if (p.market > cand.market + DROP_MARKET_CUSHION) return 'market'
      if (cuffProtected(p)) return 'cuff'
      return ''
    }
    const drop = benchAfter
      .filter((p) => !keepReason(p))
      .sort((a, b) => keepValue(a) - keepValue(b) || a.market - b.market)[0] || null
    const bench = benchAfter
      .map((p) => ({ p, weekly: weekly(p), near: p.value, keep: p === drop ? 'drop' : keepReason(p) || 'higher' }))
      .sort((a, b) => a.weekly - b.weekly)

    const samePos = mine.filter((p) => p.pos === cand.pos && !base.seated.has(p.id))
    const weakest = samePos.sort((a, b) => a.value - b.value)[0]
    const depth = cand.value - (weakest ? weakest.value : 0)

    const reasons = []
    if (replaced) {
      // The player he starts over moves to the bench; the cut can be someone else (the weakest bench player).
      const benched = drop && drop.id !== replaced.id ? ' (to bench)' : ''
      reasons.push(
        rosGain != null
          ? `Starts over ${replaced.name}${benched}: +${rosGain.toFixed(1)}/wk rest of season${nearGain > 0.05 ? ` (+${nearGain.toFixed(1)} now)` : ''}`
          : `Starts over ${replaced.name}${benched}: +${gain.toFixed(1)}/wk`,
      )
    } else if (nearGain > 0.05) {
      reasons.push(`+${nearGain.toFixed(1)}/wk short term`)
    }
    let byeSeat = null
    let byeWeek = null
    for (const seat of base.seats) {
      if (!canFill(seat.slot, cand.pos, cand.elig)) continue
      const off = seat.p.h.weeks.find((w) => w.bye && !cand.h.weeks.find((c) => c.week === w.week)?.bye)
      if (off) {
        byeSeat = seat.p
        byeWeek = off.week
        break
      }
    }
    if (byeSeat) reasons.push(`covers ${byeSeat.name}'s bye (wk ${byeWeek})`)
    const hurt = base.seats.map((s) => s.p).find((p) => p.pos === cand.pos && (p.h.injury === 'out' || p.h.injury === 'long'))
    if (hurt) reasons.push(`${hurt.name} is ${hurt.h.injury === 'long' ? 'on IR' : 'out'}`)
    if (!reasons.length && depth > 0.5) reasons.push(`+${depth.toFixed(1)}/wk over your ${cand.pos} depth`)

    if (gain <= 0.05 && nearGain <= 0.05 && depth <= 0.5 && !byeSeat && !hurt) continue
    picks.push({
      cand,
      gain: Math.max(0, gain),
      nearGain: Math.max(0, nearGain),
      depth,
      drop,
      replaced,
      bench,
      candWeekly: weekly(cand),
      reasons,
      starter: gain > 0.05,
      ros: rosGain != null,
    })
  }

  picks.sort((a, b) => b.gain - a.gain || b.nearGain - a.nearGain || b.depth - a.depth || b.cand.value - a.cand.value)
  return picks
}
