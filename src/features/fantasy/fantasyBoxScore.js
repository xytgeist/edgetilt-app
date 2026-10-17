/**
 * League rules × a live counting line.
 * Sleeper stores a flat map (`pass_yd`, `pts`, `tpm`, …). ESPN NFL stores `scoringItems` stat ids.
 * Returns null when the league has no usable rules, so the caller keeps the host total.
 */

const ESPN_NFL_STAT = {
  3: 'pass_yd',
  4: 'pass_td',
  17: 'bonus_pass_yd_300',
  18: 'bonus_pass_yd_400',
  19: 'pass_2pt',
  20: 'pass_int',
  24: 'rush_yd',
  25: 'rush_td',
  26: 'rush_2pt',
  37: 'bonus_rush_yd_100',
  38: 'bonus_rush_yd_200',
  42: 'rec_yd',
  43: 'rec_td',
  44: 'rec_2pt',
  53: 'rec',
  56: 'bonus_rec_yd_100',
  57: 'bonus_rec_yd_200',
  72: 'fum_lost',
  74: 'fgm_50p',
  77: 'fgm_40_49',
  80: 'fgm_0_39',
  83: 'fgm',
  85: 'fgmiss',
  86: 'xpm',
  88: 'xpmiss',
  101: 'ret_td',
  102: 'ret_td',
}

/** Same counting stat under a second ESPN id. Keep the primary. */
const ESPN_SKIP_IF = { 22: 3, 40: 24, 41: 53 }

const LINE_ALIAS = {
  pass_yds: 'pass_yd',
  g: 'goals',
  goal: 'goals',
  a: 'assists',
  assist: 'assists',
  sog: 'shots',
  shot: 'shots',
  hit: 'hits',
  blocks: 'blk',
  sv: 'saves',
  save: 'saves',
  ga: 'goals_against',
  fg3m: 'tpm',
  turnovers: 'to',
}

const FG_TIERS = ['fgm_0_19', 'fgm_20_29', 'fgm_30_39', 'fgm_40_49', 'fgm_50_59', 'fgm_60p', 'fgm_50p', 'fgm_0_39']
const EXACT_RULE = new Set([
  'rec', 'fum', 'fum_lost', 'pts', 'reb', 'ast', 'stl', 'blk', 'to', 'tpm', 'dd', 'td',
  'goals', 'assists', 'shots', 'hits', 'pim', 'plus_minus', 'saves', 'goals_against',
  'fgmiss', 'xpm', 'xpmiss', 'h', 'hr', 'rbi', 'r', 'sb', 'bb', 'k', 'er', 'ip', 'w', 'sv',
])

function isKnownRule(key) {
  return EXACT_RULE.has(key)
    || key.startsWith('pass_')
    || key.startsWith('rush_')
    || key.startsWith('rec_')
    || key.startsWith('fum_')
    || key.startsWith('fgm')
    || key.startsWith('bonus_')
}

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function flatRates(scoring) {
  const out = {}
  if (!scoring || typeof scoring !== 'object' || Array.isArray(scoring)) return out
  for (const [key, value] of Object.entries(scoring)) {
    if (key === 'scoringItems' || key === 'scoringType' || key === 'playerRankType') continue
    const n = num(value)
    if (n == null) continue
    out[key] = n
  }
  return out
}

function fromEspnItems(items) {
  const present = new Set(items.map((row) => Number(row?.statId)).filter((id) => Number.isFinite(id)))
  const out = {}
  for (const row of items) {
    const id = Number(row?.statId)
    const skip = ESPN_SKIP_IF[id]
    if (skip != null && present.has(skip)) continue
    const key = ESPN_NFL_STAT[id]
    const points = num(row?.points)
    if (!key || points == null) continue
    if (key === 'ret_td') out[key] = (out[key] || 0) + points
    else out[key] = points
  }
  return out
}

function dedupeFg(rates) {
  const has = (key) => rates[key] != null && rates[key] !== 0
  const next = { ...rates }
  if (FG_TIERS.some(has)) delete next.fgm
  if (has('fgm_50_59') || has('fgm_60p')) delete next.fgm_50p
  if (has('fgm_0_19') || has('fgm_20_29') || has('fgm_30_39')) delete next.fgm_0_39
  return next
}

export function leagueRates(scoring, sport = 'nfl') {
  const flat = flatRates(scoring)
  const known = Object.keys(flat).some((key) => isKnownRule(key))
  if (known) return dedupeFg(flat)
  if (sport === 'nba' || sport === 'nhl' || sport === 'mlb') return null
  const items = Array.isArray(scoring?.scoringItems) ? scoring.scoringItems : null
  if (!items?.length) return Object.keys(flat).length ? dedupeFg(flat) : null
  const mapped = fromEspnItems(items)
  return Object.keys(mapped).length ? dedupeFg(mapped) : null
}

function lineValue(line, key) {
  if (line[key] != null && line[key] !== '') {
    const direct = num(line[key])
    if (direct != null) return direct
  }
  const alias = LINE_ALIAS[key]
  if (!alias || line[alias] == null) return null
  return num(line[alias])
}

/** Points for one player, or null when this league's rules cannot be applied. */
export function scoreLine(line, scoring, sport = 'nfl') {
  if (!line || typeof line !== 'object') return null
  const rates = leagueRates(scoring, sport)
  if (!rates || !Object.keys(rates).length) return null
  let total = 0
  let used = false
  for (const [key, rate] of Object.entries(rates)) {
    const value = lineValue(line, key)
    if (value == null) continue
    total += value * rate
    used = true
  }
  if (!used) return null
  return Math.round(total * 10) / 10
}

function addCount(line, key, value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n === 0) return
  line[key] = (line[key] || 0) + n
}

function applyBonuses(line) {
  const at = (key, stat, min) => {
    if ((line[stat] || 0) >= min) line[key] = 1
  }
  at('bonus_pass_yd_300', 'pass_yd', 300)
  at('bonus_pass_yd_400', 'pass_yd', 400)
  at('bonus_rush_yd_100', 'rush_yd', 100)
  at('bonus_rush_yd_200', 'rush_yd', 200)
  at('bonus_rec_yd_100', 'rec_yd', 100)
  at('bonus_rec_yd_200', 'rec_yd', 200)
}

/** Hub football box (`pass_yds`, `fg_yds`) → the counting line `scoreLine` already multiplies. */
export function footballBoxLine(box) {
  if (!box || typeof box !== 'object') return null
  const line = {}
  addCount(line, 'pass_yd', box.pass_yds)
  addCount(line, 'pass_td', box.pass_td)
  addCount(line, 'pass_int', box.pass_int)
  addCount(line, 'rush_yd', box.rush_yds)
  addCount(line, 'rush_td', box.rush_td)
  addCount(line, 'rec', box.rec)
  addCount(line, 'rec_yd', box.rec_yds)
  addCount(line, 'rec_td', box.rec_td)
  addCount(line, 'fum_lost', box.fum_lost)
  addCount(line, 'ret_td', box.ret_td)
  addCount(line, 'xpm', box.xp_made)
  const yards = Array.isArray(box.fg_yds) ? box.fg_yds.map(Number).filter((n) => Number.isFinite(n)) : []
  const made = Number(box.fg_made) || 0
  const att = Number(box.fg_att) || 0
  if (yards.length) {
    for (const y of yards) {
      addCount(line, 'fgm', 1)
      if (y < 20) addCount(line, 'fgm_0_19', 1)
      else if (y < 30) addCount(line, 'fgm_20_29', 1)
      else if (y < 40) addCount(line, 'fgm_30_39', 1)
      else if (y < 50) addCount(line, 'fgm_40_49', 1)
      else addCount(line, 'fgm_50p', 1)
      if (y < 40) addCount(line, 'fgm_0_39', 1)
      if (y >= 50 && y < 60) addCount(line, 'fgm_50_59', 1)
      if (y >= 60) addCount(line, 'fgm_60p', 1)
    }
  } else if (made) {
    addCount(line, 'fgm', made)
  }
  addCount(line, 'fgmiss', Math.max(0, att - Math.max(made, yards.length)))
  applyBonuses(line)
  return Object.keys(line).length ? line : null
}

/** League points for one hub box row, or null when the rules cannot score it. */
export function leaguePointsForBox(box, scoring, sport = 'nfl') {
  return scoreLine(footballBoxLine(box), scoring, sport)
}

export function cardIsLive(card) {
  if (!card || card.bye) return false
  const st = String(card.game_status || '').toLowerCase()
  if (['complete', 'closed', 'final', 'post'].includes(st)) return false
  if (['in_progress', 'inprogress', 'live'].includes(st)) return true
  if (card.kickoff) {
    const t = Date.parse(card.kickoff)
    if (Number.isFinite(t) && t <= Date.now()) return true
  }
  return false
}
