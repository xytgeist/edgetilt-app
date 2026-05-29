/** @typedef {'integer' | 'money' | 'decimal' | 'text'} PlayLogValueType */

/** @typedef {{ slug: string, label: string, value_type: PlayLogValueType, sort_order: number }} PlayLogMetricDef */

/** @typedef {{ id: string, slug?: string | null, display_name: string, machine_slug?: string | null, calculator_slug?: string | null, metric_slugs: string[], is_system: boolean, user_id?: string | null }} PlayLogTemplate */

/** @typedef {{ id: string, template_id: string, captured_at: string, casino_name?: string | null, notes?: string | null, values: Record<string, unknown> }} PlayLogEntry */

/** Fallback labels when DB metric defs have not loaded yet. */
export const PLAY_LOG_METRIC_FALLBACK = /** @type {Record<string, { label: string, value_type: PlayLogValueType }>} */ ({
  counter: { label: 'Counter', value_type: 'integer' },
  bet_size: { label: 'Bet size', value_type: 'money' },
  denom: { label: 'Denom', value_type: 'money' },
  spin_count: { label: 'Spins', value_type: 'integer' },
  bonus_count: { label: 'Bonuses', value_type: 'integer' },
  money_in: { label: 'Total money in', value_type: 'money' },
  money_out: { label: 'Total money out', value_type: 'money' },
  counter_at_hit: { label: 'Counter at hit', value_type: 'integer' },
  mega: { label: 'Mega', value_type: 'integer' },
  grand: { label: 'Grand', value_type: 'integer' },
  major: { label: 'Major', value_type: 'integer' },
  minor: { label: 'Minor', value_type: 'integer' },
  mini: { label: 'Mini', value_type: 'integer' },
  target_bonus_paid: { label: 'Target bonus paid', value_type: 'money' },
})

/** @param {PlayLogMetricDef[] | null | undefined} defs */
export function metricDefMap(defs) {
  /** @type {Record<string, PlayLogMetricDef>} */
  const map = {}
  for (const d of defs || []) map[d.slug] = d
  for (const [slug, fb] of Object.entries(PLAY_LOG_METRIC_FALLBACK)) {
    if (!map[slug]) {
      map[slug] = { slug, label: fb.label, value_type: fb.value_type, sort_order: 0 }
    }
  }
  return map
}

/** @param {string[]} metricSlugs @param {Record<string, PlayLogMetricDef>} defsMap */
export function sortMetricSlugs(metricSlugs, defsMap) {
  return [...metricSlugs].sort((a, b) => {
    const oa = defsMap[a]?.sort_order ?? 999
    const ob = defsMap[b]?.sort_order ?? 999
    if (oa !== ob) return oa - ob
    return a.localeCompare(b)
  })
}

/** @param {unknown} raw @param {PlayLogValueType} type */
export function parseMetricInput(raw, type) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  if (type === 'text') return s
  const n = Number(s.replace(/[^0-9.\-]/g, ''))
  if (!Number.isFinite(n)) return null
  if (type === 'integer') return Math.round(n)
  return n
}

/** @param {unknown} v @param {PlayLogValueType} type */
export function formatMetricValue(v, type) {
  if (v == null || v === '') return '—'
  if (type === 'text') return String(v)
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  if (type === 'money') {
    const abs = Math.abs(n)
    const str = abs >= 1000 ? `$${Math.round(abs).toLocaleString()}` : `$${abs.toFixed(abs >= 100 ? 0 : 2)}`
    return n < 0 ? `-${str}` : str
  }
  if (type === 'integer') return String(Math.round(n))
  return n.toFixed(2)
}

/** @param {Record<string, unknown>} values @param {string[]} slugs @param {Record<string, PlayLogMetricDef>} defsMap */
export function valuesForStorage(values, slugs, defsMap) {
  /** @type {Record<string, number | string>} */
  const out = {}
  for (const slug of slugs) {
    const def = defsMap[slug]
    if (!def) continue
    const parsed = parseMetricInput(values[slug], def.value_type)
    if (parsed != null) out[slug] = parsed
  }
  return out
}

/** @param {PlayLogEntry[]} entries @param {string} slug */
export function numericSamples(entries, slug) {
  return entries
    .map(e => Number(e.values?.[slug]))
    .filter(n => Number.isFinite(n))
}

/** @param {number[]} nums */
export function avg(nums) {
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

/** @param {number[]} nums */
export function sum(nums) {
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0)
}

/** @param {PlayLogTemplate[]} templates */
export function templatesSorted(templates) {
  return [...templates].sort((a, b) => {
    if (a.is_system !== b.is_system) return a.is_system ? -1 : 1
    return a.display_name.localeCompare(b.display_name)
  })
}
