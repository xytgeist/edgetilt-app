/**
 * Player prop cards: map each Kalshi / Polymarket player line to a stat, then read the live box score
 * (`player_box`), season averages and projections (`fantasy.players`) for it.
 */
import { boxFantasyPoints } from './gameHubLiveRails.js'

function nameKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
}

const has = (v) => v != null && v !== '' && Number.isFinite(Number(v))
const num = (v) => (has(v) ? Number(v) : null)
const sumOrNull = (...vals) => (vals.some(has) ? vals.reduce((s, v) => s + (num(v) || 0), 0) : null)

/**
 * `box(b)` → live value (null when the feed lacks that field), `season(pl)` → season total (`max` for longest),
 * `proj(pl)` → projection, `pace` → counting stat worth extrapolating.
 */
export const PROP_STATS = {
  pass_yds: { label: 'pass yds', box: (b) => num(b.pass_yds), season: (pl) => num(pl?.season_pass_yd), proj: (pl) => num(pl?.projected_pass_yd), pace: true },
  pass_td: { label: 'pass TD', box: (b) => num(b.pass_td), season: (pl) => num(pl?.season_pass_td) },
  pass_int: { label: 'INT', box: (b) => num(b.pass_int), season: (pl) => num(pl?.season_pass_int) },
  pass_cmp: { label: 'comp', box: (b) => num(b.pass_cmp), season: (pl) => num(pl?.season_pass_cmp), pace: true },
  pass_att: { label: 'pass att', box: (b) => num(b.pass_att), season: (pl) => num(pl?.season_pass_att), pace: true },
  rush_yds: { label: 'rush yds', box: (b) => num(b.rush_yds), season: (pl) => num(pl?.season_rush_yd), proj: (pl) => num(pl?.projected_rush_yd), pace: true },
  rush_att: { label: 'carries', box: (b) => num(b.rush_att), season: (pl) => num(pl?.season_rush_att), pace: true },
  rec: { label: 'rec', box: (b) => num(b.rec), season: (pl) => num(pl?.season_rec), proj: (pl) => num(pl?.projected_rec), pace: true },
  rec_yds: { label: 'rec yds', box: (b) => num(b.rec_yds), season: (pl) => num(pl?.season_rec_yd), proj: (pl) => num(pl?.projected_rec_yd), pace: true },
  rr_yds: {
    label: 'rush+rec yds',
    box: (b) => sumOrNull(b.rush_yds, b.rec_yds),
    season: (pl) => sumOrNull(pl?.season_rush_yd, pl?.season_rec_yd),
    proj: (pl) => sumOrNull(pl?.projected_rush_yd, pl?.projected_rec_yd),
    pace: true,
  },
  scrim_yds: {
    label: 'scrim yds',
    box: (b) => sumOrNull(b.rush_yds, b.rec_yds),
    season: (pl) => sumOrNull(pl?.season_rush_yd, pl?.season_rec_yd),
    proj: (pl) => sumOrNull(pl?.projected_rush_yd, pl?.projected_rec_yd),
    pace: true,
  },
  td: { label: 'TD', box: (b) => sumOrNull(b.rush_td, b.rec_td, b.ret_td), season: (pl) => sumOrNull(pl?.season_rush_td, pl?.season_rec_td) },
  rec_lng: { label: 'long rec', box: (b) => num(b.rec_lng), season: (pl) => num(pl?.season_rec_lng), max: true },
  fpts: { label: 'fpts', box: (b) => boxFantasyPoints(b, 1), season: (pl) => num(pl?.season_ppr), proj: (pl) => num(pl?.projected_ppr), pace: true },
}

const SERIES_STAT = {
  kxnflpassyds: 'pass_yds',
  kxnflrec: 'rec',
  kxnflrecyds: 'rec_yds',
  kxnflrryds: 'rr_yds',
  kxnflrshatt: 'rush_att',
  kxnflrshyds: 'rush_yds',
  kxnfltd: 'td',
  football_player_passing_yards: 'pass_yds',
  football_player_passing_touchdowns: 'pass_td',
  football_player_interceptions_thrown: 'pass_int',
  football_player_passing_completions: 'pass_cmp',
  football_player_passing_attempts: 'pass_att',
  football_player_rushing_yards: 'rush_yds',
  football_player_rushing_attempts: 'rush_att',
  football_player_receptions: 'rec',
  football_player_receiving_yards: 'rec_yds',
  football_player_scrimmage_yards: 'scrim_yds',
  football_player_touchdowns: 'td',
  football_player_longest_reception: 'rec_lng',
  football_player_fantasy_points_ppr: 'fpts',
}

function statFromText(text) {
  const t = String(text || '').toLowerCase()
  if (/rush(ing)?\s*(and|\+|&)\s*rec/.test(t)) return 'rr_yds'
  if (/long(est)?\s*rec/.test(t)) return 'rec_lng'
  if (/scrim(mage)?\s*(yds|yards)/.test(t)) return 'scrim_yds'
  if (/fantasy|fpts/.test(t)) return 'fpts'
  if (/pass(ing)?\s*(yds|yards)/.test(t)) return 'pass_yds'
  if (/pass(ing)?\s*(td|touchdown)/.test(t)) return 'pass_td'
  if (/\bint(erception)?s?\b/.test(t)) return 'pass_int'
  if (/comp(letion)?s?\b/.test(t)) return 'pass_cmp'
  if (/pass(ing)?\s*att/.test(t)) return 'pass_att'
  if (/rush(ing)?\s*(yds|yards)/.test(t)) return 'rush_yds'
  if (/rush(ing)?\s*att|carries/.test(t)) return 'rush_att'
  if (/rec(eiving)?\s*(yds|yards)/.test(t)) return 'rec_yds'
  if (/\brec(eption)?s?\b/.test(t)) return 'rec'
  if (/\btd\b|touchdown/.test(t)) return 'td'
  return null
}

/** `{ stat, need }` … `need` is the value that clears the line ("75+" → 75, "O 17.5" → 17.5 exclusive). */
export function classifyPropLine(prop) {
  if (!prop) return null
  const series = String(prop.series || '').trim().toLowerCase()
  const text = String(prop.line_label || prop.title || '')
  // "1st Touchdown" / "Most passing yards" are not N+ ladders … no strike to track.
  if (/\b(?:1st|first)\s+(?:\w+\s+)?(?:touchdown|td)\b/i.test(text) || /firsttd/.test(series)) return null
  if (/^football_player_most_/.test(series)) return null
  const stat = SERIES_STAT[series] || statFromText(text)
  if (!stat) return null
  const plus = text.match(/(\d+(?:\.\d+)?)\s*\+/)
  const over = text.match(/\bO\s*(\d+(?:\.\d+)?)/i)
  const any = text.match(/(\d+(?:\.\d+)?)/)
  const strike = plus ? Number(plus[1]) : over ? Number(over[1]) : any ? Number(any[1]) : null
  if (strike == null || !Number.isFinite(strike)) return null
  return { stat, strike, inclusive: Boolean(plus) || !over }
}

export function clearsLine(value, line) {
  if (value == null || !line) return false
  return line.inclusive ? value >= line.strike : value > line.strike
}

function clockSeconds(clock) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(clock || '').trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** Share of regulation played (0-1). Halftime / period breaks count the finished quarters. */
export function gameFraction(game, live) {
  if (game?.status === 'post') return 1
  if (game?.status !== 'in') return 0
  const period = Number(live?.period ?? game?.live?.period)
  if (!Number.isFinite(period) || period < 1) return 0
  if (period > 4) return 1
  const left = clockSeconds(live?.clock ?? game?.live?.clock)
  const breakBoard = /HALFTIME|END_PERIOD|END_OF_PERIOD/.test(String(live?.status_name || '').toUpperCase())
  const inPeriod = breakBoard || left == null ? 900 : 900 - left
  return Math.max(0, Math.min(1, ((period - 1) * 900 + inPeriod) / 3600))
}

/** Box rows keyed by ESPN id and name so a roster player (or a prop's name) finds its live line. */
export function indexPlayerBox(playerBox) {
  const byId = new Map()
  const byName = new Map()
  for (const side of ['away', 'home']) {
    for (const b of Array.isArray(playerBox?.[side]) ? playerBox[side] : []) {
      if (b?.id) byId.set(String(b.id), b)
      const k = nameKey(b?.name)
      if (k) byName.set(k, b)
    }
  }
  return { byId, byName, any: byId.size > 0 || byName.size > 0 }
}

export function boxForPlayer(index, roster, name) {
  if (!index) return null
  return (roster?.espn_id && index.byId.get(String(roster.espn_id))) || index.byName.get(nameKey(roster?.name || name)) || null
}

const round1 = (n) => Math.round(n * 10) / 10

/**
 * Everything one prop row shows: live `current` + `pace`, or pregame `avg` (per game) + `proj`.
 * `current` is null before kickoff or when the feed lacks the field; a player missing from a live box is 0.
 */
export function propLineStats(line, { box, roster, boxLoaded, status, fraction }) {
  const def = line ? PROP_STATS[line.stat] : null
  if (!def) return null
  const started = status === 'in' || status === 'post'
  let current = null
  if (started && boxLoaded) current = box ? def.box(box) : 0
  if (current != null) current = round1(current)
  const gp = num(roster?.season_gp)
  const seasonTotal = def.season(roster)
  const avg = seasonTotal == null ? null : def.max ? seasonTotal : gp ? round1(seasonTotal / gp) : null
  const proj = def.proj ? def.proj(roster) : null
  const pace =
    status === 'in' && def.pace && current != null && fraction >= 0.15 && fraction < 1
      ? Math.round(current / fraction)
      : null
  // Where the player is headed: what he has plus the rest of the game at his pregame rate
  // (projection, else season average, else his live rate).
  let target = null
  if (current != null) {
    const liveRate = fraction >= 0.15 ? current / fraction : null
    const rate = proj ?? avg ?? liveRate
    target = def.max || status !== 'in' || rate == null
      ? current
      : round1(current + Math.max(0, 1 - (fraction || 0)) * rate)
  }
  return {
    label: def.label,
    current,
    target,
    pace,
    avg,
    avgIsMax: Boolean(def.max),
    proj: proj == null ? null : round1(proj),
    hit: clearsLine(current, line),
    final: status === 'post',
  }
}

/** One-line game summary for the card header ("19/32 · 190 yds · 1 TD", "9 car · 69 yds", "4/5 · 71 yds"). */
export function boxSummaryParts(box) {
  if (!box) return []
  const g = Array.isArray(box.groups) ? box.groups : []
  const parts = []
  if (g.includes('passing')) {
    const cmp = has(box.pass_att) && Number(box.pass_att) > 0 ? `${box.pass_cmp}/${box.pass_att} · ` : ''
    parts.push(`${cmp}${num(box.pass_yds) ?? 0} pass yds · ${num(box.pass_td) ?? 0} TD${num(box.pass_int) ? ` · ${box.pass_int} INT` : ''}`)
  }
  if (g.includes('rushing')) {
    const car = has(box.rush_att) && Number(box.rush_att) > 0 ? `${box.rush_att} car · ` : ''
    parts.push(`${car}${num(box.rush_yds) ?? 0} rush yds${num(box.rush_td) ? ` · ${box.rush_td} TD` : ''}`)
  }
  if (g.includes('receiving')) {
    const tgt = has(box.rec_tgt) && Number(box.rec_tgt) > 0 ? `/${box.rec_tgt}` : ''
    parts.push(`${num(box.rec) ?? 0}${tgt} rec · ${num(box.rec_yds) ?? 0} yds${num(box.rec_td) ? ` · ${box.rec_td} TD` : ''}`)
  }
  return parts
}
