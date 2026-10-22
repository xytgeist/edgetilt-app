/**
 * Host scoring rules → the flat map `scoreLine` already multiplies
 * (`pass_yd`, `rec`, `fgm_0_19`, …). Unknown stats are dropped.
 */

const CBS_ABBR: Record<string, string> = {
  PaYd: 'pass_yd',
  PaTD: 'pass_td',
  PaInt: 'pass_int',
  RuYd: 'rush_yd',
  RuTD: 'rush_td',
  Recpt: 'rec',
  ReYd: 'rec_yd',
  ReTD: 'rec_td',
  Pa2P: 'pass_2pt',
  Ru2P: 'rush_2pt',
  Re2P: 'rec_2pt',
  FL: 'fum_lost',
  FG19: 'fgm_0_19',
  FG29: 'fgm_20_29',
  FG39: 'fgm_30_39',
  FG49: 'fgm_40_49',
  FG50: 'fgm_50p',
  FG: 'fgm',
  MFG: 'fgmiss',
  XP: 'xpm',
  MXP: 'xpmiss',
  IKRTD: 'ret_td',
  IPRTD: 'ret_td',
}

/**
 * Yahoo team defense (position type DT) stat ids → Sleeper's D/ST keys, which the projected and live lines carry.
 * By id, not name: "Interception" / "Touchdown" also name offensive stats. Yards-allowed tiers are 100 wide on
 * Yahoo, so they get `yahoo_ya_*` keys the client fills from the expected yards allowed. Per-type return TDs
 * (99-102) are left out: Sleeper puts `def_pr_td` / `def_kr_td` / `pass_int_td` on returners and QBs too.
 */
const YAHOO_DT_STAT: Record<number, string> = {
  31: 'pts_allow',
  32: 'sack',
  33: 'int',
  34: 'fum_rec',
  35: 'def_td',
  36: 'safe',
  37: 'blk_kick',
  49: 'ret_td',
  50: 'pts_allow_0',
  51: 'pts_allow_1_6',
  52: 'pts_allow_7_13',
  53: 'pts_allow_14_20',
  54: 'pts_allow_21_27',
  55: 'pts_allow_28_34',
  56: 'pts_allow_35p',
  68: 'tkl_loss',
  69: 'yds_allow',
  71: 'yahoo_ya_0_99',
  72: 'yahoo_ya_100_199',
  73: 'yahoo_ya_200_299',
  74: 'yahoo_ya_300_399',
  75: 'yahoo_ya_400_499',
  76: 'yahoo_ya_500p',
  103: 'blk_kick_td',
}

function num(value: unknown): number | null {
  if (typeof value === 'string' && !value.trim()) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function walk(node: unknown, visit: (obj: Record<string, unknown>) => void) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit)
    return
  }
  const obj = node as Record<string, unknown>
  visit(obj)
  for (const value of Object.values(obj)) walk(value, visit)
}

function put(out: Record<string, number>, key: string, value: number) {
  if (key.startsWith('__')) return
  if (out[key] == null || out[key] === value) out[key] = value
}

/** Yahoo settings: categories carry the name, modifiers carry the point value, joined on stat_id. */
export function yahooScoringFromSettings(root: unknown): Record<string, number> {
  const byId = new Map<number, { name: string; value: number | null; position: string }>()
  walk(root, (obj) => {
    if (obj.stat_id == null) return
    const id = Number(obj.stat_id)
    if (!Number.isFinite(id)) return
    const row = byId.get(id) || { name: '', value: null, position: '' }
    if (typeof obj.name === 'string' && obj.name.trim()) row.name = obj.name.trim()
    const value = num(obj.value)
    if (value != null) row.value = value
    const position = String(obj.position_type || '')
    if (position) row.position = position
    byId.set(id, row)
  })

  const out: Record<string, number> = {}
  const misses: number[] = []
  for (const [id, row] of byId) {
    if (row.value == null) continue
    // These ids are DT-only on Yahoo NFL, so a missing position_type still maps.
    if (YAHOO_DT_STAT[id] && (!row.position || row.position.toUpperCase() === 'DT')) {
      const key = YAHOO_DT_STAT[id]
      if (key) put(out, key, row.value)
      continue
    }
    if (!row.name) continue
    const keys = keysForYahooStat(row.name, row.position)
    if (keys.includes('__fgmiss__')) misses.push(row.value)
    for (const key of keys) put(out, key, row.value)
  }
  if (misses.length && misses.every((value) => value === misses[0])) put(out, 'fgmiss', misses[0])
  return out
}

function keysForYahooStat(name: string, positionType: string): string[] {
  const n = name.toLowerCase().replace(/\s+/g, ' ').trim()
  const pos = positionType.toLowerCase()
  if (pos === 'dt' || pos === 'def' || pos === 'dp') return []
  if (n.includes('points allowed') || n.includes('defensive') || n.includes('sack')) return []
  if (/300/.test(n) && /399/.test(n)) return []
  if (/100/.test(n) && /199/.test(n)) return []
  if (n.includes('passing') && n.includes('yard') && n.includes('400')) return ['bonus_pass_yd_400']
  if (n.includes('rushing') && n.includes('yard') && n.includes('200')) return ['bonus_rush_yd_200']
  if (n.includes('receiving') && n.includes('yard') && n.includes('200')) return ['bonus_rec_yd_200']
  if (n === 'passing yards') return ['pass_yd']
  if (n === 'passing touchdowns' || n === 'passing td') return ['pass_td']
  if (n === 'interceptions' || n === 'passing interceptions') return ['pass_int']
  if (n === 'rushing yards') return ['rush_yd']
  if (n === 'rushing touchdowns' || n === 'rushing td') return ['rush_td']
  if (n === 'receptions') return ['rec']
  if (n === 'receiving yards') return ['rec_yd']
  if (n === 'receiving touchdowns' || n === 'receiving td') return ['rec_td']
  if (n.includes('return') && n.includes('touchdown')) return ['ret_td']
  if (n.includes('two-point') || n.includes('2-point')) return ['pass_2pt', 'rush_2pt', 'rec_2pt']
  if (n.includes('fumble') && n.includes('lost')) return ['fum_lost']
  if (n.includes('field goal') && n.includes('miss')) return ['__fgmiss__']
  if (n.includes('field goal') && n.includes('0-19')) return ['fgm_0_19']
  if (n.includes('field goal') && n.includes('20-29')) return ['fgm_20_29']
  if (n.includes('field goal') && n.includes('30-39')) return ['fgm_30_39']
  if (n.includes('field goal') && n.includes('40-49')) return ['fgm_40_49']
  if (n.includes('field goal') && (n.includes('50+') || n.includes('50 or more'))) return ['fgm_50p']
  if ((n.includes('extra point') || n.includes('point after')) && n.includes('miss')) return ['xpmiss']
  if (n.includes('extra point') || n.includes('point after')) return ['xpm']
  return []
}

/** CBS rules: stat abbr plus a point value. The public catalog's `scoring: 1` flag is not a point value. */
export function cbsScoringFromRules(root: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  walk(root, (obj) => {
    const abbr = String(obj.abbr || obj.stat || obj.stat_abbr || '').trim()
    const key = CBS_ABBR[abbr]
    if (!key) return
    const points = num(obj.points ?? obj.point_value ?? obj.point)
    const value = points ?? num(obj.value)
    if (value == null) return
    put(out, key, value)
  })
  return out
}

/** Yahoo NBA stat ids → Sleeper NBA stat keys (the keys `scoreLine` multiplies for NBA). */
const YAHOO_NBA_STAT: Record<number, string> = {
  3: 'fga',
  4: 'fgm',
  6: 'fta',
  7: 'ftm',
  9: 'tpa',
  10: 'tpm',
  12: 'pts',
  13: 'oreb',
  14: 'dreb',
  15: 'reb',
  16: 'ast',
  17: 'stl',
  18: 'blk',
  19: 'to',
  21: 'pf',
  23: 'tf',
  25: 'ff',
  27: 'dd',
  28: 'td',
}
/** Percentage categories (no points value; categories leagues only). */
const YAHOO_NBA_PCT: Record<number, string> = { 5: 'fg_pct', 8: 'ft_pct', 11: 'tp_pct' }

/** Points-league values from Yahoo NBA `stat_modifiers` (by stat id). */
export function yahooNbaScoringFromSettings(root: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  walk(root, (obj) => {
    const mods = obj.stat_modifiers as { stats?: Array<{ stat?: { stat_id?: unknown; value?: unknown } }> } | undefined
    if (!mods || !Array.isArray(mods.stats)) return
    for (const row of mods.stats) {
      const key = YAHOO_NBA_STAT[Number(row?.stat?.stat_id)]
      const value = num(row?.stat?.value)
      if (key && value != null) out[key] = value
    }
  })
  return out
}

export type NbaCategory = { stat_id: number; key: string; label: string; higher_better: boolean }

/** Scored categories from Yahoo NBA `stat_categories` (display-only stats skipped); empty for points leagues. */
export function yahooNbaCategories(root: unknown): NbaCategory[] {
  const out: NbaCategory[] = []
  const seen = new Set<number>()
  walk(root, (obj) => {
    const cats = obj.stat_categories as { stats?: Array<{ stat?: Record<string, unknown> }> } | undefined
    if (!cats || !Array.isArray(cats.stats)) return
    for (const row of cats.stats) {
      const st = row?.stat || {}
      const id = Number(st.stat_id)
      if (!Number.isFinite(id) || seen.has(id) || Number(st.is_only_display_stat) === 1) continue
      const key = YAHOO_NBA_STAT[id] || YAHOO_NBA_PCT[id]
      if (!key) continue
      seen.add(id)
      out.push({ stat_id: id, key, label: String(st.display_name || st.abbr || key), higher_better: String(st.sort_order) !== '0' })
    }
  })
  return out
}
