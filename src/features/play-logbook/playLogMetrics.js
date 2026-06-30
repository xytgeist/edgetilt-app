import { formatPlayLogCalcMetricDisplay } from '../../utils/playLogCalcSnapshot.js'

/** @typedef {'integer' | 'money' | 'decimal' | 'text'} PlayLogValueType */

/** @typedef {{ slug: string, label: string, value_type: PlayLogValueType, sort_order: number }} PlayLogMetricDef */

/** @typedef {{ slug: string, label: string, value_type: PlayLogValueType }} PlayLogCustomMetricDef */

/** @typedef {{ id: string, slug?: string | null, display_name: string, machine_slug?: string | null, calculator_slug?: string | null, metric_slugs: string[], custom_metric_defs?: PlayLogCustomMetricDef[] | null, is_system: boolean, user_id?: string | null }} PlayLogTemplate */

/** @typedef {{ id: string, template_id: string, captured_at: string, casino_name?: string | null, notes?: string | null, values: Record<string, unknown> }} PlayLogEntry */

/** Fallback labels when DB metric defs have not loaded yet. */
export const PLAY_LOG_METRIC_FALLBACK = /** @type {Record<string, { label: string, value_type: PlayLogValueType }>} */ ({
  counter: { label: 'Counter Start', value_type: 'integer' },
  bet_size: { label: 'Bet size', value_type: 'money' },
  denom: { label: 'Denom', value_type: 'money' },
  spin_count: { label: '# Spins (optional)', value_type: 'integer' },
  bonus_count: { label: '# Bonuses (optional)', value_type: 'integer' },
  money_in: { label: 'Cash in', value_type: 'money' },
  money_out: { label: 'Cash out', value_type: 'money' },
  counter_at_hit: { label: 'Counter Pop', value_type: 'integer' },
  mega: { label: 'Mega', value_type: 'integer' },
  grand: { label: 'Grand', value_type: 'integer' },
  major: { label: 'Major', value_type: 'integer' },
  minor: { label: 'Minor', value_type: 'integer' },
  mini: { label: 'Mini', value_type: 'integer' },
  target_bonus_paid: { label: 'Target bonus paid', value_type: 'money' },
  current_ev_rtp: { label: 'Current EV (RTP %)', value_type: 'decimal' },
  average_case_mult: { label: 'Average case (×)', value_type: 'decimal' },
  average_case_usd: { label: 'Average case ($)', value_type: 'money' },
  expected_ev_usd: { label: 'EV ($) (optional)', value_type: 'money' },
  acquisition_fee: { label: 'Acquisition fee', value_type: 'money' },
  mhb_manufacturer: { label: 'Manufacturer', value_type: 'text' },
  mhb_meter: { label: 'MHB meter', value_type: 'money' },
  must_hit_by: { label: 'Must hit by', value_type: 'money' },
  green_fg: { label: 'Green FG (2×)', value_type: 'integer' },
  blue_fg: { label: 'Blue FG (3×)', value_type: 'integer' },
  gold_fg: { label: 'Gold FG (4×)', value_type: 'integer' },
  r1_prize: { label: 'R1 prize (cr)', value_type: 'integer' },
  r2_prize: { label: 'R2 prize (cr)', value_type: 'integer' },
  r3_prize: { label: 'R3 prize (cr)', value_type: 'integer' },
  r4_prize: { label: 'R4 prize (cr)', value_type: 'integer' },
  r5_prize: { label: 'R5 prize (cr)', value_type: 'integer' },
})

/** Must Hit By calculator / logbook manufacturer picker (stored slug values). */
export const MHB_MANUFACTURER_OPTIONS = [
  { value: 'ainsworth', label: 'Ainsworth' },
  { value: 'ags', label: 'AGS' },
  { value: 'igt', label: 'IGT' },
  { value: 'manual', label: 'Manual' },
]

/** @param {unknown} raw */
export function formatMhbManufacturerValue(raw) {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return '-'
  return MHB_MANUFACTURER_OPTIONS.find(o => o.value === s)?.label ?? String(raw)
}

/** Log Play labels for optional session counters (always include “(optional)”). */
export function logPlayMetricDisplayLabel(slug, label) {
  if (slug === 'spin_count') return '# Spins (optional)'
  if (slug === 'bonus_count') return '# Bonuses (optional)'
  if (slug === 'expected_ev_usd') return 'EV ($) (optional)'
  return label
}

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
  for (const slug of ['spin_count', 'bonus_count', 'expected_ev_usd']) {
    if (map[slug]) {
      map[slug] = { ...map[slug], label: logPlayMetricDisplayLabel(slug, map[slug].label) }
    }
  }
  return map
}

/** Labels for template builder value-type picker (matches DB check). */
export const CUSTOM_METRIC_TYPE_OPTIONS = [
  { value: 'integer', label: 'Whole number' },
  { value: 'money', label: 'Money' },
  { value: 'decimal', label: 'Decimal' },
  { value: 'text', label: 'Short text' },
]

/** @param {unknown} raw */
export function normalizeCustomMetricDefs(raw) {
  if (!Array.isArray(raw)) return []
  /** @type {PlayLogCustomMetricDef[]} */
  const out = []
  const seen = new Set()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const slug = String(item.slug ?? '').trim()
    const label = String(item.label ?? '').trim()
    const value_type = item.value_type
    if (!slug || !label) continue
    if (!['integer', 'money', 'decimal', 'text'].includes(value_type)) continue
    if (seen.has(slug)) continue
    seen.add(slug)
    out.push({ slug, label, value_type })
  }
  return out
}

/** @param {PlayLogTemplate | null | undefined} template */
export function templateCustomMetricDefs(template) {
  return normalizeCustomMetricDefs(template?.custom_metric_defs)
}

/** @param {Record<string, PlayLogMetricDef>} baseDefsMap @param {PlayLogTemplate | null | undefined} template */
export function defsMapForTemplate(baseDefsMap, template) {
  const map = { ...baseDefsMap }
  let order = 9000
  for (const m of templateCustomMetricDefs(template)) {
    map[m.slug] = {
      slug: m.slug,
      label: m.label,
      value_type: m.value_type,
      sort_order: order++,
    }
  }
  return map
}

/** URL-safe slug for primary (system) game templates. */
export function slugifyGameTemplateSlug(label) {
  const base = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const trimmed = base.slice(0, 48)
  return trimmed || 'game'
}

/** @param {string} slug */
export function isValidGameTemplateSlug(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(slug || '').trim())
}

/** @param {string} label */
export function slugifyCustomMetricLabel(label) {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  const trimmed = base.slice(0, 36)
  return trimmed || 'field'
}

/** @param {string} label @param {Set<string>} existingSlugs */
export function uniqueCustomMetricSlug(label, existingSlugs) {
  let base = `c_${slugifyCustomMetricLabel(label)}`
  let slug = base
  let n = 2
  while (existingSlugs.has(slug)) {
    slug = `${base}_${n++}`
  }
  return slug
}

/**
 * @param {{ label: string, value_type: PlayLogValueType }[]} drafts
 * @param {Iterable<string>} reservedSlugs
 */
export function buildCustomMetricDefsForTemplate(drafts, reservedSlugs) {
  const existing = new Set(reservedSlugs)
  /** @type {PlayLogCustomMetricDef[]} */
  const out = []
  const labelsSeen = new Set()
  for (const d of drafts) {
    const label = d.label.trim()
    if (!label) continue
    const key = label.toLowerCase()
    if (labelsSeen.has(key)) continue
    labelsSeen.add(key)
    const preserved = d.slug && String(d.slug).trim()
    const slug =
      preserved && !existing.has(preserved)
        ? preserved
        : uniqueCustomMetricSlug(label, existing)
    existing.add(slug)
    out.push({ slug, label, value_type: d.value_type })
  }
  return out
}

/**
 * Form state when editing an existing user template.
 * @param {PlayLogTemplate} template
 * @param {Record<string, PlayLogMetricDef>} defsMap
 */
export function customTemplateFormStateFromTemplate(template, defsMap) {
  const customDefs = templateCustomMetricDefs(template)
  const customSlugSet = new Set(customDefs.map(d => d.slug))
  const standardMetrics = new Set(
    (template.metric_slugs || []).filter(
      slug =>
        !PLAY_LOG_TEMPLATE_REQUIRED_FIELD_SLUG_SET.has(slug) &&
        !PLAY_LOG_SNAPSHOT_FIELD_SLUGS.has(slug) &&
        !customSlugSet.has(slug) &&
        defsMap[slug],
    ),
  )
  return {
    displayName: template.display_name || '',
    standardMetrics,
    customFieldDrafts: customDefs.map(d => ({
      id: d.slug,
      slug: d.slug,
      label: d.label,
      value_type: d.value_type,
    })),
  }
}

/** Always last on Log Play form (immediately above notes). */
export const LOG_PLAY_TAIL_FIELD_SLUGS = ['spin_count', 'bonus_count']

const LOG_PLAY_TAIL_FIELD_SLUG_SET = new Set(LOG_PLAY_TAIL_FIELD_SLUGS)

/** @param {string[]} metricSlugs @param {Record<string, PlayLogMetricDef>} defsMap */
export function sortMetricSlugs(metricSlugs, defsMap) {
  const inSet = new Set(metricSlugs)
  const body = metricSlugs.filter(slug => !LOG_PLAY_TAIL_FIELD_SLUG_SET.has(slug))
  const sortedBody = [...body].sort((a, b) => {
    const oa = defsMap[a]?.sort_order ?? 999
    const ob = defsMap[b]?.sort_order ?? 999
    if (oa !== ob) return oa - ob
    return a.localeCompare(b)
  })
  const tail = LOG_PLAY_TAIL_FIELD_SLUGS.filter(slug => inSet.has(slug))
  return [...sortedBody, ...tail]
}

/** Calculator snapshot values - useful on a log row, not for custom-template historical analysis. */
export const PLAY_LOG_CALC_SNAPSHOT_FIELD_SLUGS = new Set([
  'current_ev_rtp',
  'average_case_mult',
  'average_case_usd',
  'expected_ev_usd',
])

/** Includes calc snapshots plus acquisition fee (session P&L adjustment, not a scout metric). */
export const PLAY_LOG_SNAPSHOT_FIELD_SLUGS = new Set([
  ...PLAY_LOG_CALC_SNAPSHOT_FIELD_SLUGS,
  'acquisition_fee',
])

/** Always on user-created templates (not shown in the standard-field picker). */
export const PLAY_LOG_TEMPLATE_REQUIRED_FIELD_SLUGS = [
  'bet_size',
  'denom',
  'money_in',
  'money_out',
]

const PLAY_LOG_TEMPLATE_REQUIRED_FIELD_SLUG_SET = new Set(PLAY_LOG_TEMPLATE_REQUIRED_FIELD_SLUGS)

/** Standard catalog slugs offered when building a user game template (excludes snapshot + required defaults). */
export function standardTemplatePickerSlugs(defsMap) {
  return sortMetricSlugs(
    Object.keys(defsMap).filter(
      slug =>
        !PLAY_LOG_SNAPSHOT_FIELD_SLUGS.has(slug) && !PLAY_LOG_TEMPLATE_REQUIRED_FIELD_SLUG_SET.has(slug),
    ),
    defsMap,
  )
}

/** @param {Iterable<string>} optionalSlugs @param {Record<string, PlayLogMetricDef>} defsMap */
export function metricSlugsForUserTemplate(optionalSlugs, defsMap) {
  return sortMetricSlugs(
    [...new Set([...PLAY_LOG_TEMPLATE_REQUIRED_FIELD_SLUGS, ...optionalSlugs])],
    defsMap,
  )
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
  if (v == null || v === '') return '-'
  if (type === 'text') return String(v)
  const n = Number(v)
  if (!Number.isFinite(n)) return '-'
  if (type === 'money') {
    const abs = Math.abs(n)
    const str = abs >= 1000 ? `$${Math.round(abs).toLocaleString()}` : `$${abs.toFixed(abs >= 100 ? 0 : 2)}`
    return n < 0 ? `-${str}` : str
  }
  if (type === 'integer') return String(Math.round(n))
  return n.toFixed(2)
}

export const LOG_PLAY_SAVE_REQUIRED_PREFIX = 'Required fields: '

const LOG_PLAY_SAVE_REQUIRED = [
  { slug: 'bet_size', label: 'Bet size' },
  { slug: 'money_in', label: 'Cash in' },
  { slug: 'money_out', label: 'Cash out' },
]

/** @param {string[]} labels */
function formatLogPlayMissingFieldList(labels) {
  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return `${labels[0]} & ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')} & ${labels[labels.length - 1]}`
}

/**
 * @param {{
 *   selectedTemplateId?: string,
 *   selectedTemplate?: PlayLogTemplate | null,
 *   formFields: Record<string, string>,
 *   metricSlugs?: string[],
 *   defsMap: Record<string, PlayLogMetricDef>,
 * }} args
 * @returns {string | null} User-facing message when save is not allowed
 */
export function getLogPlaySaveValidationError({
  selectedTemplateId,
  selectedTemplate,
  formFields,
  metricSlugs,
  defsMap,
}) {
  const slugs = metricSlugs || selectedTemplate?.metric_slugs || []
  /** @type {string[]} */
  const missing = []
  if (!selectedTemplateId || !selectedTemplate) missing.push('Game')
  for (const { slug, label } of LOG_PLAY_SAVE_REQUIRED) {
    if (!slugs.includes(slug)) {
      missing.push(label)
      continue
    }
    const def = defsMap[slug]
    const type = def?.value_type || PLAY_LOG_METRIC_FALLBACK[slug]?.value_type || 'money'
    if (parseMetricInput(formFields[slug], type) == null) missing.push(label)
  }
  if (!missing.length) return null
  return `${LOG_PLAY_SAVE_REQUIRED_PREFIX}${formatLogPlayMissingFieldList(missing)}`
}

/** @param {Record<string, unknown>} values @param {string[]} slugs @param {Record<string, PlayLogMetricDef>} defsMap */
export function valuesForStorage(values, slugs, defsMap) {
  /** @type {Record<string, number | string>} */
  const out = {}
  for (const slug of slugs) {
    const def = defsMap[slug]
    if (!def) continue
    const parsed = parseMetricInput(values[slug], def.value_type)
    if (parsed == null) continue
    if (slug === 'acquisition_fee' && typeof parsed === 'number') {
      out[slug] = Math.abs(parsed)
    } else {
      out[slug] = parsed
    }
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

/** Log Play denom dropdown (stored as numeric dollars in entry values). */
export const LOG_PLAY_DENOM_DEFAULT = '0.01'

export const LOG_PLAY_DENOM_OPTIONS = [
  { value: '0.01', label: '$0.01' },
  { value: '0.02', label: '$0.02' },
  { value: '0.05', label: '$0.05' },
  { value: '0.10', label: '$0.10' },
  { value: '0.25', label: '$0.25' },
  { value: '0.50', label: '$0.50' },
  { value: '1', label: '$1' },
  { value: '2', label: '$2' },
  { value: '5', label: '$5' },
  { value: '10', label: '$10' },
  { value: '25', label: '$25' },
  { value: '50', label: '$50' },
  { value: '100', label: '$100' },
]

const LOG_PLAY_DENOM_VALUES = new Set(LOG_PLAY_DENOM_OPTIONS.map(o => o.value))

/** @param {unknown} raw */
export function normalizeDenomFormValue(raw) {
  const s = String(raw ?? '').trim().replace(/[^0-9.]/g, '')
  if (LOG_PLAY_DENOM_VALUES.has(s)) return s
  const n = Number(s)
  if (!Number.isFinite(n)) return LOG_PLAY_DENOM_DEFAULT
  for (const opt of LOG_PLAY_DENOM_OPTIONS) {
    if (Number(opt.value) === n) return opt.value
  }
  return LOG_PLAY_DENOM_DEFAULT
}

/** Log Play sheet field order + display labels (slugs unchanged in DB). Tail fields listed for labels only. */
export const LOG_PLAY_FORM_FIELDS = [
  { slug: 'mhb_manufacturer', label: 'Manufacturer' },
  { slug: 'mhb_meter', label: 'MHB meter' },
  { slug: 'must_hit_by', label: 'Must hit by' },
  { slug: 'bet_size', label: 'Bet Size' },
  { slug: 'denom', label: 'Denom' },
  { slug: 'counter', label: 'Counter Start' },
  { slug: 'counter_at_hit', label: 'Counter Pop' },
  { slug: 'green_fg', label: 'Green FG' },
  { slug: 'blue_fg', label: 'Blue FG' },
  { slug: 'gold_fg', label: 'Gold FG' },
  { slug: 'money_in', label: 'Cash in' },
  { slug: 'money_out', label: 'Cash out' },
  { slug: 'current_ev_rtp', label: 'Current EV' },
  { slug: 'average_case_mult', label: 'Avg case (×)' },
  { slug: 'average_case_usd', label: 'Avg case ($)' },
  { slug: 'expected_ev_usd', label: 'EV ($) (optional)' },
  { slug: 'acquisition_fee', label: 'Acquisition fee' },
  { slug: 'spin_count', label: '# Spins (optional)' },
  { slug: 'bonus_count', label: '# Bonuses (optional)' },
]

const LOG_PLAY_FORM_SLUGS = new Set(LOG_PLAY_FORM_FIELDS.map(f => f.slug))

const LOG_PLAY_FORM_LABEL_BY_SLUG = Object.fromEntries(LOG_PLAY_FORM_FIELDS.map(f => [f.slug, f.label]))

/**
 * @param {string[]} templateSlugs
 * @param {Record<string, PlayLogMetricDef>} defsMap
 * @returns {{ slug: string, label: string, value_type: PlayLogValueType }[]}
 */
export function orderedLogPlayFormFields(templateSlugs, defsMap) {
  const inTemplate = new Set(templateSlugs)
  /** @type {{ slug: string, label: string, value_type: PlayLogValueType }[]} */
  const out = []

  for (const spec of LOG_PLAY_FORM_FIELDS) {
    if (LOG_PLAY_TAIL_FIELD_SLUG_SET.has(spec.slug)) continue
    if (!inTemplate.has(spec.slug)) continue
    const def = defsMap[spec.slug]
    if (!def) continue
    out.push({ slug: spec.slug, label: spec.label, value_type: def.value_type })
  }

  for (const slug of sortMetricSlugs(templateSlugs, defsMap)) {
    if (LOG_PLAY_FORM_SLUGS.has(slug)) continue
    const def = defsMap[slug]
    if (!def) continue
    out.push({ slug, label: def.label, value_type: def.value_type })
  }

  for (const slug of LOG_PLAY_TAIL_FIELD_SLUGS) {
    if (!inTemplate.has(slug)) continue
    const def = defsMap[slug]
    if (!def) continue
    out.push({
      slug,
      label: LOG_PLAY_FORM_LABEL_BY_SLUG[slug] || logPlayMetricDisplayLabel(slug, def.label),
      value_type: def.value_type,
    })
  }

  return out
}

/** @param {unknown} raw Acquisition fee (stored/displayed as a positive cost). */
export function parseAcquisitionFee(raw) {
  const n = Number(String(raw ?? '').replace(/[^0-9.\-]/g, ''))
  if (!Number.isFinite(n) || n === 0) return null
  return Math.abs(n)
}

/**
 * Session P&L: money out − money in, minus acquisition fee when present.
 * @param {string} inRaw
 * @param {string} outRaw
 * @param {unknown} [acquisitionFeeRaw]
 */
export function playLogWinLoss(inRaw, outRaw, acquisitionFeeRaw = null) {
  const inn = Number(String(inRaw ?? '').replace(/[^0-9.\-]/g, ''))
  const out = Number(String(outRaw ?? '').replace(/[^0-9.\-]/g, ''))
  if (!Number.isFinite(inn) || !Number.isFinite(out)) return null
  let net = out - inn
  const fee = parseAcquisitionFee(acquisitionFeeRaw)
  if (fee != null) net -= fee
  return net
}

/** @param {unknown} v */
export function formatAcquisitionFeeValue(v) {
  const n = parseAcquisitionFee(v)
  if (n == null) return '-'
  return formatMetricValue(n, 'money')
}

/** @param {{ slug?: string, label?: string }} field */
export function isTargetBonusPaidField(field) {
  const slug = String(field?.slug ?? '').trim()
  if (slug === 'target_bonus_paid' || /target_bonus_paid$/i.test(slug)) return true
  return /target\s+bonus\s+paid/i.test(String(field?.label ?? ''))
}

/** Target bonus paid ÷ bet size → number of bets (null if not computable). */
export function targetBonusPaidInBets(paidRaw, betSizeRaw) {
  const paid = Number(String(paidRaw ?? '').replace(/[^0-9.\-]/g, ''))
  const bet = Number(String(betSizeRaw ?? '').replace(/[^0-9.\-]/g, ''))
  if (!Number.isFinite(paid) || !Number.isFinite(bet) || bet <= 0) return null
  return paid / bet
}

/** @param {number | null} bets */
export function formatTargetBonusPaidBetsLabel(bets) {
  if (bets == null || !Number.isFinite(bets)) return null
  const rounded = Math.round(bets * 100) / 100
  const display = rounded.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${display} bets`
}

/** @param {PlayLogTemplate[]} templates */
export function templatesSortedAlphabetically(templates) {
  return [...templates].sort((a, b) => a.display_name.localeCompare(b.display_name))
}

/** @param {PlayLogTemplate[]} templates */
export function templatesSorted(templates) {
  return [...templates].sort((a, b) => {
    if (a.is_system !== b.is_system) return a.is_system ? -1 : 1
    return a.display_name.localeCompare(b.display_name)
  })
}

/** @param {PlayLogEntry[]} entries */
export function playCountByTemplateId(entries) {
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const e of entries || []) {
    const tid = e?.template_id
    if (!tid) continue
    const key = String(tid)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
}

/**
 * Log Play game picker: most-logged templates first, then A–Z for never-played games.
 * @param {PlayLogTemplate[]} templates
 * @param {PlayLogEntry[]} entries
 */
export function templatesSortedByPlayCount(templates, entries) {
  const counts = playCountByTemplateId(entries)
  return [...templates].sort((a, b) => {
    const ca = counts.get(String(a.id)) || 0
    const cb = counts.get(String(b.id)) || 0
    if (cb !== ca) return cb - ca
    return a.display_name.localeCompare(b.display_name)
  })
}

export const LOG_PLAY_RECENT_GAMES_LIMIT = 5

/** Analyze tab - sentinel id for cross-game aggregate stats (not a DB template). */
export const PLAY_LOG_ANALYZE_ALL_PLAYS_ID = '__all_plays__'

export const PLAY_LOG_ANALYZE_ALL_PLAYS_LABEL = 'All plays'

/** Cross-game metrics only (skip counters, meters, etc. in Analyze > All plays). */
export const PLAY_LOG_ANALYZE_ALL_PLAYS_METRIC_SLUGS = [
  'money_in',
  'money_out',
  'bet_size',
  'denom',
  'spin_count',
  'bonus_count',
  'acquisition_fee',
  'current_ev_rtp',
  'expected_ev_usd',
]

/** @param {string | null | undefined} analyzeTemplateId */
export function isPlayLogAnalyzeAllPlays(analyzeTemplateId) {
  return String(analyzeTemplateId || '') === PLAY_LOG_ANALYZE_ALL_PLAYS_ID
}

/**
 * Most recently logged templates (by latest entry `captured_at`).
 * @param {PlayLogTemplate[]} templates
 * @param {PlayLogEntry[]} entries
 * @param {number} [limit]
 */
export function recentPlayLogTemplates(templates, entries, limit = LOG_PLAY_RECENT_GAMES_LIMIT) {
  /** @type {Map<string, string>} */
  const lastAt = new Map()
  for (const e of entries || []) {
    const tid = String(e?.template_id ?? '')
    if (!tid) continue
    const at = String(e.captured_at || '')
    const prev = lastAt.get(tid)
    if (!prev || at > prev) lastAt.set(tid, at)
  }
  const byId = new Map((templates || []).map(t => [String(t.id), t]))
  return [...lastAt.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([tid]) => byId.get(tid))
    .filter(Boolean)
    .slice(0, limit)
}

/** @param {unknown} raw */
export function normalizeGameSearchQuery(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
}

const PLAY_LOG_CUSTOM_TEMPLATE_LABEL_SUFFIX = ' (Custom)'

/** @param {unknown} name */
export function normalizePlayLogTemplateNameKey(name) {
  return String(name ?? '').trim().toLowerCase()
}

/**
 * Picker / list label for a template. Custom templates append "(Custom)" when the name
 * collides with another template in the catalog (usually a system primary).
 * @param {PlayLogTemplate | null | undefined} template
 * @param {PlayLogTemplate[]} [templates]
 */
export function playLogTemplateDisplayLabel(template, templates) {
  const raw = String(template?.display_name || '').trim()
  if (!raw || template?.is_system) return raw
  const key = normalizePlayLogTemplateNameKey(raw)
  const hasCollision = (templates || []).some(
    t =>
      String(t.id) !== String(template.id) &&
      normalizePlayLogTemplateNameKey(t.display_name) === key,
  )
  if (!hasCollision) return raw
  if (raw.endsWith(PLAY_LOG_CUSTOM_TEMPLATE_LABEL_SUFFIX)) return raw
  return `${raw}${PLAY_LOG_CUSTOM_TEMPLATE_LABEL_SUFFIX}`
}

/**
 * @param {PlayLogTemplate} template
 * @param {string} queryNorm
 */
export function gameTemplateMatchesSearch(template, queryNorm) {
  if (!queryNorm) return true
  const name = String(template.display_name || '').toLowerCase()
  const slug = String(template.slug || template.machine_slug || '').toLowerCase()
  const machineSlug = String(template.machine_slug || '').toLowerCase()
  return (
    name.includes(queryNorm) ||
    slug.includes(queryNorm) ||
    (machineSlug && machineSlug.includes(queryNorm))
  )
}

/**
 * Resolve prefill → system template (guide slug, machine slug, or calculator).
 * @param {PlayLogTemplate[]} templates
 * @param {{ calculatorSlug?: string | null, templateSlug?: string | null }} pre
 */
export function resolvePlayLogPrefillTemplate(templates, pre) {
  if (!pre) return null
  const templateSlug = String(pre.templateSlug || '').trim()
  const calculatorSlug = String(pre.calculatorSlug || '').trim()

  if (templateSlug) {
    const bySlug =
      templates.find(t => t.slug === templateSlug) ||
      templates.find(t => t.machine_slug === templateSlug)
    if (bySlug) return bySlug
  }

  if (calculatorSlug) {
    const withMachineSlug = templates.filter(t => t.calculator_slug === calculatorSlug)
    const canonical = withMachineSlug.find(t => t.slug && t.machine_slug && t.slug === t.machine_slug)
    if (canonical) return canonical
    return withMachineSlug[0] || null
  }

  return null
}

/**
 * @param {PlayLogTemplate[]} templates
 * @param {PlayLogEntry[]} entries
 * @param {string} [searchQuery]
 * @param {{ includeAllPlaysOption?: boolean }} [opts]
 */
export function buildLogPlayGamePickerSections(templates, entries, searchQuery = '', opts = {}) {
  const { includeAllPlaysOption = false } = opts
  const q = normalizeGameSearchQuery(searchQuery)
  const system = (templates || []).filter(t => t.is_system)
  const custom = (templates || []).filter(t => !t.is_system)
  const sortAlpha = list => templatesSortedAlphabetically(list)
  const filterList = list => (q ? list.filter(t => gameTemplateMatchesSearch(t, q)) : list)

  const recent = q ? [] : recentPlayLogTemplates(templates, entries, LOG_PLAY_RECENT_GAMES_LIMIT)
  const systemFiltered = sortAlpha(filterList(system))
  const customFiltered = sortAlpha(filterList(custom))
  const matchCount = systemFiltered.length + customFiltered.length

  /** @type {Array<{ value: string, label: string } | { type: 'label', label: string }>} */
  const options = []

  if (includeAllPlaysOption && !q) {
    options.push({ type: 'label', label: 'Scope' })
    options.push({ value: PLAY_LOG_ANALYZE_ALL_PLAYS_ID, label: PLAY_LOG_ANALYZE_ALL_PLAYS_LABEL })
  }

  if (recent.length > 0) {
    options.push({ type: 'label', label: 'Recent' })
    for (const t of recent) {
      options.push({ value: t.id, label: playLogTemplateDisplayLabel(t, templates) })
    }
  }

  if (customFiltered.length > 0) {
    options.push({ type: 'label', label: 'Custom games' })
    for (const t of customFiltered) {
      options.push({ value: t.id, label: playLogTemplateDisplayLabel(t, templates) })
    }
  }

  if (systemFiltered.length > 0) {
    options.push({ type: 'label', label: q ? 'Matching games' : 'All games (A–Z)' })
    for (const t of systemFiltered) {
      options.push({ value: t.id, label: t.display_name })
    }
  }

  return { options, matchCount, recentCount: recent.length }
}

/**
 * Log Play game dropdown sections (Recent → Custom → A–Z). Use LogPlayGamePicker for search UI.
 * @param {PlayLogTemplate[]} templates
 * @param {PlayLogEntry[]} entries
 * @returns {Array<{ value: string, label: string } | { type: 'label', label: string }>}
 */
export function buildLogPlayGamePickerOptions(templates, entries) {
  return buildLogPlayGamePickerSections(templates, entries, '').options
}

/**
 * Default template when opening Log Play with no prefill (first system game A–Z).
 * @param {PlayLogTemplate[]} templates
 */
export function defaultLogPlayTemplateId(templates) {
  const system = templatesSortedAlphabetically((templates || []).filter(t => t.is_system))
  if (system[0]?.id) return system[0].id
  return templatesSortedAlphabetically(templates || [])[0]?.id || ''
}

/**
 * Real (wager-weighted) RTP % = (Σ money out ÷ Σ money in) × 100.
 * Same as weighting each play's RTP by its wager-not averaging play RTP % in arithmetic mean.
 */
export function playLogRealRtpPct(totalMoneyIn, totalMoneyOut) {
  const inn = Number(totalMoneyIn)
  const out = Number(totalMoneyOut)
  if (!Number.isFinite(inn) || !Number.isFinite(out) || inn <= 0) return null
  return (out / inn) * 100
}

/**
 * Wager-weighted realized RTP % across a set of entries (e.g. Analyze tab for one game).
 * @param {PlayLogEntry[]} entries
 * @returns {number | null}
 */
export function aggregateRealizedRtpPct(entries) {
  let sumIn = 0
  let sumOut = 0
  for (const entry of entries || []) {
    const inn = Number(entry?.values?.money_in)
    const outVal = Number(entry?.values?.money_out)
    if (Number.isFinite(inn)) sumIn += inn
    if (Number.isFinite(outVal)) sumOut += outVal
  }
  return playLogRealRtpPct(sumIn, sumOut)
}

/** @deprecated alias */
export const playLogRunningRtpPct = playLogRealRtpPct

/** @param {number | null} rtpPct */
export function formatPlayLogRealRtp(rtpPct) {
  if (rtpPct == null || !Number.isFinite(rtpPct)) return null
  return `${rtpPct.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

/** @deprecated alias */
export const formatPlayLogRunningRtp = formatPlayLogRealRtp

/**
 * @typedef {{
 *   label: string | null,
 *   totalMoneyIn: number,
 *   totalMoneyOut: number,
 *   wagerAgnosticRtpPct: number | null,
 * }} PlayLogRealRtpSnapshot
 */

/** Arithmetic mean of each play's RTP % (sessions weighted equally). */
export function playLogWagerAgnosticRtpPct(playRtpPercents) {
  const vals = (playRtpPercents || []).filter(n => Number.isFinite(n))
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

/**
 * Per-entry Real RTP for each game (cumulative through that play, oldest → newest).
 * @param {PlayLogEntry[]} entries
 * @returns {Record<string, PlayLogRealRtpSnapshot>}
 */
export function runningRealRtpByEntryId(entries) {
  /** @type {Map<string, PlayLogEntry[]>} */
  const byTemplate = new Map()
  for (const entry of entries || []) {
    const tid = String(entry?.template_id ?? '')
    if (!tid) continue
    if (!byTemplate.has(tid)) byTemplate.set(tid, [])
    byTemplate.get(tid).push(entry)
  }

  /** @type {Record<string, PlayLogRealRtpSnapshot>} */
  const out = {}
  for (const list of byTemplate.values()) {
    list.sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime())
    let sumIn = 0
    let sumOut = 0
    /** @type {number[]} */
    const playRtpPercents = []
    for (const entry of list) {
      const inn = Number(entry.values?.money_in)
      const outVal = Number(entry.values?.money_out)
      if (Number.isFinite(inn)) sumIn += inn
      if (Number.isFinite(outVal)) sumOut += outVal
      const playRtp = playLogRealRtpPct(inn, outVal)
      if (playRtp != null) playRtpPercents.push(playRtp)
      out[entry.id] = {
        label: formatPlayLogRealRtp(playLogRealRtpPct(sumIn, sumOut)),
        totalMoneyIn: sumIn,
        totalMoneyOut: sumOut,
        wagerAgnosticRtpPct: playLogWagerAgnosticRtpPct(playRtpPercents),
      }
    }
  }
  return out
}

/** @deprecated alias - use runningRealRtpByEntryId */
export function runningRtpLabelByEntryId(entries) {
  const snaps = runningRealRtpByEntryId(entries)
  /** @type {Record<string, string | null>} */
  const labels = {}
  for (const [id, snap] of Object.entries(snaps)) labels[id] = snap.label
  return labels
}

/** Tap explainer beside aggregate weighted RTP on recent-entry cards (intro only). */
export const PLAY_LOG_REAL_RTP_INFO_INTRO =
  'Aggregate Weighted RTP: This is your "Real" experienced wager-weighted return on this game for all your plays up to this point. It is NOT a simple average of each session\'s RTP %.'

/** RTP % for a single logged play. */
export function playRtpLabelForEntry(entry) {
  const values = entry?.values || {}
  return formatPlayLogRealRtp(playLogRealRtpPct(values.money_in, values.money_out))
}

/** @param {string | null | undefined} label e.g. "94.32%" */
export function rtpToneFromPercentLabel(label) {
  const pct = parseRtpPercentLabel(label)
  if (pct == null) return 'neutral'
  return pct >= 100 ? 'win' : 'loss'
}

/**
 * Chips for LOG tab recent-entry cards - bet size, denom, profit/loss, play RTP.
 * @param {PlayLogEntry} entry
 * @param {Record<string, PlayLogMetricDef>} defsMap
 * @returns {{ key: string, label: string, value: string, tone?: 'win' | 'loss' | 'neutral' }[]}
 */
export function recentEntryDisplayChips(entry, defsMap) {
  const values = entry?.values || {}
  const betDef = defsMap.bet_size
  const denomDef = defsMap.denom
  const pnl = playLogWinLoss(values.money_in, values.money_out, values.acquisition_fee)
  const playRtpLabel = playRtpLabelForEntry(entry)
  const hasAcquisitionFee = parseAcquisitionFee(values.acquisition_fee) != null

  /** @type {{ key: string, label: string, value: string, tone?: 'win' | 'loss' | 'neutral' }[]} */
  const chips = [
    {
      key: 'bet_size',
      label: betDef?.label || 'Bet size',
      value: formatMetricValue(values.bet_size, betDef?.value_type || 'money'),
      tone: 'neutral',
    },
    {
      key: 'denom',
      label: denomDef?.label || 'Denom',
      value: formatMetricValue(values.denom, denomDef?.value_type || 'money'),
      tone: 'neutral',
    },
    {
      key: 'pnl',
      label: hasAcquisitionFee ? 'Net profit/loss' : 'Profit/loss',
      value: pnl == null ? '-' : formatMetricValue(pnl, 'money'),
      tone: pnl == null ? 'neutral' : pnl >= 0 ? 'win' : 'loss',
    },
    {
      key: 'rtp',
      label: 'RTP',
      value: playRtpLabel || '-',
      tone: rtpToneFromPercentLabel(playRtpLabel),
    },
  ]

  const currentEvRtp = Number(values.current_ev_rtp)
  if (Number.isFinite(currentEvRtp)) {
    const label = defsMap.current_ev_rtp?.label || 'Current EV'
    const evLabel = `${currentEvRtp.toFixed(1)}%`
    chips.push({
      key: 'current_ev_rtp',
      label,
      value: evLabel,
      tone: currentEvRtp >= 100 ? 'win' : 'loss',
    })
  }

  const avgMult = Number(values.average_case_mult)
  if (Number.isFinite(avgMult)) {
    chips.push({
      key: 'average_case_mult',
      label: defsMap.average_case_mult?.label || 'Avg case',
      value: `${avgMult.toFixed(1)}×`,
      tone: avgMult >= 0 ? 'win' : 'loss',
    })
  } else if (Number.isFinite(Number(values.expected_ev_usd))) {
    const evUsd = Number(values.expected_ev_usd)
    chips.push({
      key: 'expected_ev_usd',
      label: defsMap.expected_ev_usd?.label || 'EV ($) (optional)',
      value: formatMetricValue(evUsd, 'money'),
      tone: evUsd >= 0 ? 'win' : 'loss',
    })
  }

  if (parseAcquisitionFee(values.acquisition_fee) != null) {
    chips.push({
      key: 'acquisition_fee',
      label: defsMap.acquisition_fee?.label || 'Acquisition fee',
      value: formatAcquisitionFeeValue(values.acquisition_fee),
      tone: 'neutral',
    })
  }

  return chips
}

/** @param {string} slug @param {unknown} value @param {PlayLogValueType} valueType */
export function formatPlayLogEntryFieldValue(slug, value, valueType) {
  if (slug === 'acquisition_fee') return formatAcquisitionFeeValue(value)
  if (slug === 'mhb_manufacturer') return formatMhbManufacturerValue(value)
  if (PLAY_LOG_CALC_SNAPSHOT_FIELD_SLUGS.has(slug)) {
    return formatPlayLogCalcMetricDisplay(slug, value, valueType)
  }
  return formatMetricValue(value, valueType)
}

/** All populated metrics for an entry (template order). */
export function entryDetailFieldsForEntry(entry, template, defsMap) {
  const values = entry?.values || {}
  return orderedLogPlayFormFields(template?.metric_slugs || [], defsMap)
    .filter(f => {
      const v = values[f.slug]
      return v != null && v !== ''
    })
    .map(f => ({
      slug: f.slug,
      label: f.label,
      value: formatPlayLogEntryFieldValue(f.slug, values[f.slug], f.value_type),
    }))
}

/** @param {string | null | undefined} label e.g. "94.32%" */
function parseRtpPercentLabel(label) {
  if (!label) return null
  const n = Number(String(label).replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}
