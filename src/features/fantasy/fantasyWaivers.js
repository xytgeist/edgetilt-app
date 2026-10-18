import { scoreLine } from './fantasyBoxScore.js'
import { fantasyPosition } from './fantasyStartSit.js'

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

function canFill(slot, pos) {
  return (SLOT_ELIGIBLE[slot] || []).includes(pos)
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
      .filter((p) => !used.has(p.id) && canFill(slot, p.pos))
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

/**
 * Rank the league's available players for this roster. `gain` is how much the best starting lineup
 * improves per week if added; `depth` is the upgrade over the weakest bench player at that position.
 * Each pick carries a drop suggestion that keeps every dedicated slot fillable.
 */
export function rankWaivers({ pool, rosterRows, scoring, slots, sport = 'nfl' }) {
  const rosterById = new Map((pool?.roster || []).map((p) => [String(p.sleeper_id), p]))
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
      return { id, pos, value, h, row, name: row.player_name }
    })
  const base = bestSeats(mine, slots)
  const need = minimumByPos(slots)
  const countPos = (list, pos) => list.filter((p) => p.pos === pos).length

  const picks = []
  for (const { entry, h } of candidates) {
    if (h.avg <= 0) continue
    const cand = { id: String(entry.sleeper_id), pos: fantasyPosition(entry.position), value: h.avg, h, entry, name: entry.name }
    const trial = bestSeats([...mine, cand], slots)
    const gain = trial.total - base.total
    const replaced = gain > 0.05 ? base.seats.map((s) => s.p).find((p) => !trial.seated.has(p.id)) || null : null

    const after = [...mine, cand]
    const benchAfter = after.filter((p) => !trial.seated.has(p.id) && p.id !== cand.id)
    // Keep-worth is per-game and healthy: byes and IR stashes should not decide who gets cut.
    const keepValue = (p) => (p.h.known ? Math.max(p.value, p.h.healthy) : p.value)
    const drop = benchAfter
      .filter((p) => countPos(after, p.pos) - 1 >= (need[p.pos] || 0) && keepValue(p) < cand.h.healthy)
      .sort((a, b) => keepValue(a) - keepValue(b))[0] || null

    const samePos = mine.filter((p) => p.pos === cand.pos && !base.seated.has(p.id))
    const weakest = samePos.sort((a, b) => a.value - b.value)[0]
    const depth = cand.value - (weakest ? weakest.value : 0)

    const reasons = []
    if (replaced) reasons.push(`+${gain.toFixed(1)}/wk over ${replaced.name}`)
    let byeSeat = null
    let byeWeek = null
    for (const seat of base.seats) {
      if (!canFill(seat.slot, cand.pos)) continue
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

    if (gain <= 0.05 && depth <= 0.5 && !byeSeat && !hurt) continue
    picks.push({ cand, gain: Math.max(0, gain), depth, drop, reasons, starter: gain > 0.05 })
  }

  picks.sort((a, b) => b.gain - a.gain || b.depth - a.depth || b.cand.value - a.cand.value)
  return picks
}
