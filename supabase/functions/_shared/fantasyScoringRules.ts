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
  for (const row of byId.values()) {
    if (!row.name || row.value == null) continue
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
