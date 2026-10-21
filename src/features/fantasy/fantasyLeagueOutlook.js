/**
 * League outlook: playoff and title odds from a season simulation. Each team scores its rest-of-season lineup
 * strength (`teamStrength`, the same per-week value the trade tools use) with weekly noise; this week keeps its
 * real pairings, later regular-season weeks pair teams at random (hosts do not send the remaining schedule yet).
 * Seeds go by wins, then points for; the bracket gives the top seeds byes when the field is not a power of two.
 */

/** Weekly score spread as a share of a lineup's expected points (a ~115-point lineup swings ~23 a week). */
const WEEKLY_SD_SHARE = 0.2
const MIN_WEEKLY_SD = 12

/** Playoff start week and team count from any host (Sleeper names; Yahoo / ESPN syncs save the same keys). */
export function playoffFormat(league, teamCount) {
  const s = league?.settings || {}
  const start = Number(s.playoff_week_start) || 15
  const teams = Number(s.playoff_teams) || (teamCount >= 12 ? 6 : 4)
  return { start, teams: Math.max(1, Math.min(teams, teamCount)) }
}

/** Deterministic PRNG so the same inputs give the same odds between renders. */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function normal(rng) {
  let u = 0
  while (u === 0) u = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng())
}

function shuffle(list, rng) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Seeds into a single-elimination bracket; top seeds get byes until the field is a power of two. */
function playBracket(seeded, score) {
  let field = [...seeded]
  const size = 2 ** Math.ceil(Math.log2(Math.max(1, field.length)))
  const byes = size - field.length
  let round = field.slice(0, byes)
  let playing = field.slice(byes)
  while (round.length + playing.length > 1) {
    const winners = []
    for (let i = 0, j = playing.length - 1; i < j; i += 1, j -= 1) {
      const a = playing[i]
      const b = playing[j]
      winners.push(score(a) >= score(b) ? a : b)
    }
    field = [...round, ...winners]
    round = []
    playing = field
  }
  return (round[0] ?? playing[0]) || null
}

/**
 * @param {{ teams: Array<{ id: string, wins: number, losses: number, ties: number, pointsFor: number }>,
 *   strength: Record<string, number>, week: number, pairs: Array<[string, string]>, format: { start: number, teams: number },
 *   sims?: number, seed?: number }} input
 * @returns {Record<string, { playoff: number, title: number }> | null} null once the regular season is over
 */
export function simulateLeague({ teams, strength, week, pairs, format, sims = 3000, seed = 7 }) {
  const ids = (teams || []).map((t) => String(t.id))
  if (ids.length < 2) return null
  const regularLeft = Math.max(0, format.start - Math.max(1, Number(week) || 1))
  if (regularLeft <= 0) return null
  const known = ids.map((id) => Number(strength?.[id])).filter((v) => Number.isFinite(v) && v > 0)
  const avg = known.length ? known.reduce((a, v) => a + v, 0) / known.length : 100
  const mean = Object.fromEntries(ids.map((id) => [id, Number(strength?.[id]) > 0 ? Number(strength[id]) : avg]))
  const sd = Object.fromEntries(ids.map((id) => [id, Math.max(MIN_WEEKLY_SD, mean[id] * WEEKLY_SD_SHARE)]))
  const base = Object.fromEntries(
    (teams || []).map((t) => [String(t.id), { wins: (Number(t.wins) || 0) + (Number(t.ties) || 0) / 2, pf: Number(t.pointsFor) || 0 }]),
  )
  const thisWeek = (pairs || []).filter(([a, b]) => a && b && mean[a] != null && mean[b] != null)

  const rng = mulberry32(seed + ids.length * 31 + regularLeft)
  const playoff = Object.fromEntries(ids.map((id) => [id, 0]))
  const title = Object.fromEntries(ids.map((id) => [id, 0]))
  const draw = (id) => mean[id] + sd[id] * normal(rng)

  for (let s = 0; s < sims; s += 1) {
    const wins = Object.fromEntries(ids.map((id) => [id, base[id].wins]))
    const pf = Object.fromEntries(ids.map((id) => [id, base[id].pf]))
    for (let w = 0; w < regularLeft; w += 1) {
      const games = w === 0 && thisWeek.length ? thisWeek : pairUp(shuffle(ids, rng))
      for (const [a, b] of games) {
        const sa = draw(a)
        const sb = draw(b)
        pf[a] += sa
        pf[b] += sb
        if (sa > sb) wins[a] += 1
        else if (sb > sa) wins[b] += 1
        else {
          wins[a] += 0.5
          wins[b] += 0.5
        }
      }
    }
    const seeded = [...ids].sort((a, b) => wins[b] - wins[a] || pf[b] - pf[a]).slice(0, format.teams)
    for (const id of seeded) playoff[id] += 1
    const champ = playBracket(seeded, draw)
    if (champ) title[champ] += 1
  }
  return Object.fromEntries(ids.map((id) => [id, { playoff: playoff[id] / sims, title: title[id] / sims }]))
}

function pairUp(order) {
  const out = []
  for (let i = 0; i + 1 < order.length; i += 2) out.push([order[i], order[i + 1]])
  return out
}

/** This week's pairings from the synced matchups (`mine_team_id` / `opp_team_id`). */
export function weekPairs(matchups) {
  const seen = new Set()
  const out = []
  for (const m of matchups || []) {
    const a = String(m?.mine_team_id || '')
    const b = String(m?.opp_team_id || '')
    if (!a || !b) continue
    const key = [a, b].sort().join('|')
    if (seen.has(key)) continue
    seen.add(key)
    out.push([a, b])
  }
  return out
}
