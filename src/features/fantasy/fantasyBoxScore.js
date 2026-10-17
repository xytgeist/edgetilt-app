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

function ratesFrom(scoring, sport) {
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
  const rates = ratesFrom(scoring, sport)
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
