/**
 * Landscape gamecast side-rail pages beyond team stats: live fantasy points (full PPR from the ESPN box score,
 * `player_box` on the scoreboard detail) and each player's headline prop with live progress toward the line.
 */
import { pregamePlayerPropRails } from './gameHubPregameProps.js'

function nameKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
}

/** Last name, keeping particles ("St. Brown", "Del Rio-Wilson"). */
function lastName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter((w) => !/^(jr|sr|ii|iii|iv|v)\.?$/i.test(w))
  if (parts.length >= 3 && /^(?:st\.?|del|de|da|di|du|la|le|van|von|mc)$/i.test(parts[parts.length - 2])) {
    return parts.slice(-2).join(' ')
  }
  return parts.length ? parts[parts.length - 1] : String(name || '')
}

const round1 = (n) => Math.round(n * 10) / 10
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** Standard full PPR; FG 3 (<40) / 4 (40-49) / 5 (50+), miss -1, PAT 1, fumble lost -2. */
export function boxFantasyPoints(b) {
  if (!b) return 0
  const fgYds = Array.isArray(b.fg_yds) ? b.fg_yds.map(num) : []
  const fgMade = num(b.fg_made)
  const fgTiered = fgYds.reduce((s, y) => s + (y >= 50 ? 5 : y >= 40 ? 4 : 3), 0)
  const fgUntiered = Math.max(0, fgMade - fgYds.length) * 3
  return round1(
    num(b.pass_yds) * 0.04 +
      num(b.pass_td) * 4 -
      num(b.pass_int) * 2 +
      num(b.rush_yds) * 0.1 +
      num(b.rush_td) * 6 +
      num(b.rec) +
      num(b.rec_yds) * 0.1 +
      num(b.rec_td) * 6 -
      num(b.fum_lost) * 2 +
      num(b.ret_td) * 6 +
      fgTiered +
      fgUntiered -
      Math.max(0, num(b.fg_att) - fgMade) +
      num(b.xp_made),
  )
}

function guessPosition(b) {
  const g = Array.isArray(b?.groups) ? b.groups : []
  if (g.includes('kicking')) return 'K'
  if (g.includes('passing')) return 'QB'
  if (g.includes('rushing') && num(b.rush_yds) >= num(b.rec_yds)) return 'RB'
  if (g.includes('receiving')) return 'WR'
  return ''
}

function rosterIndex(players) {
  const m = new Map()
  for (const pl of Array.isArray(players) ? players : []) {
    const k = nameKey(pl?.name)
    if (k) m.set(k, pl)
  }
  return m
}

/**
 * Top `limit` fantasy scorers per side: `{ key, name, position, points, proj }` (proj = roster projected PPR).
 */
export function liveFantasyRails(playerBox, players, limit = 5) {
  const roster = rosterIndex(players)
  const out = { away: [], home: [] }
  for (const side of ['away', 'home']) {
    const rows = []
    for (const b of Array.isArray(playerBox?.[side]) ? playerBox[side] : []) {
      const pl = roster.get(nameKey(b.name))
      const points = boxFantasyPoints(b)
      const projRaw = pl?.projected_ppr ?? pl?.fantasypros_pts
      const proj = projRaw != null && Number.isFinite(Number(projRaw)) ? round1(Number(projRaw)) : null
      if (!points && proj == null) continue
      rows.push({
        key: `${side}:${b.id || nameKey(b.name)}`,
        name: lastName(pl?.name || b.name),
        position: String(pl?.position || guessPosition(b)).toUpperCase(),
        points,
        proj,
      })
    }
    out[side] = rows.sort((a, b) => b.points - a.points || (b.proj ?? -1) - (a.proj ?? -1)).slice(0, limit)
  }
  return out
}

const STAT_FROM_LABEL = { 'pass yds': 'pass_yds', 'rush yds': 'rush_yds', 'rec yds': 'rec_yds' }

/**
 * Every still-bettable player line (rung nearest 50¢ per player + stat) with `current` from the box score.
 * Lines already cleared are settled, so they drop off. Rows: pregame rail row + `{ current, target, hit }`.
 */
export function livePropRails(props, players, playerBox, limit = Infinity) {
  const rails = pregamePlayerPropRails(props, players, limit, { live: true })
  const haveBox = Boolean(playerBox?.away?.length || playerBox?.home?.length)
  const boxByName = new Map()
  for (const side of ['away', 'home']) {
    for (const b of Array.isArray(playerBox?.[side]) ? playerBox[side] : []) boxByName.set(nameKey(b.name), b)
  }
  const out = { away: [], home: [] }
  for (const side of ['away', 'home']) {
    out[side] = rails[side]
      .map((r) => {
      // Rail keys are `${nameKey(roster name)}:${stat}`.
      const b = boxByName.get(r.key.slice(0, r.key.lastIndexOf(':')))
      const target = parseFloat(r.line)
      const field = STAT_FROM_LABEL[r.stat]
      // No box at all (feed miss) → unknown, not 0; a player missing from a real box hasn't recorded the stat.
      const current = !haveBox ? null : !b ? 0 : field ? num(b[field]) : num(b.rush_td) + num(b.rec_td) + num(b.ret_td)
      return {
        ...r,
        current,
        target: Number.isFinite(target) ? target : null,
        hit: current != null && Number.isFinite(target) && current >= target,
      }
      })
      .filter((r) => !r.hit)
  }
  return out
}
