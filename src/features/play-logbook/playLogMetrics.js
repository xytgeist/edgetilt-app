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
  counter_at_hit: { label: 'Counter hit at', value_type: 'integer' },
  mega: { label: 'Mega', value_type: 'integer' },
  grand: { label: 'Grand', value_type: 'integer' },
  major: { label: 'Major', value_type: 'integer' },
  minor: { label: 'Minor', value_type: 'integer' },
  mini: { label: 'Mini', value_type: 'integer' },
  target_bonus_paid: { label: 'Target bonus paid', value_type: 'money' },
  current_ev_rtp: { label: 'Current EV (RTP %)', value_type: 'decimal' },
  average_case_mult: { label: 'Average case (×)', value_type: 'decimal' },
  average_case_usd: { label: 'Average case ($)', value_type: 'money' },
  expected_ev_usd: { label: 'Expected EV ($)', value_type: 'money' },
  acquisition_fee: { label: 'Acquisition fee', value_type: 'money' },
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

export const LOG_PLAY_SAVE_REQUIRED_PREFIX = 'Required fields: '

const LOG_PLAY_SAVE_REQUIRED = [
  { slug: 'bet_size', label: 'Bet size' },
  { slug: 'money_in', label: 'Money in' },
  { slug: 'money_out', label: 'Money Out' },
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

/** Log Play sheet field order + display labels (slugs unchanged in DB). */
export const LOG_PLAY_FORM_FIELDS = [
  { slug: 'bet_size', label: 'Bet Size' },
  { slug: 'denom', label: 'Denom' },
  { slug: 'counter', label: 'Counter Start' },
  { slug: 'counter_at_hit', label: 'Counter End' },
  { slug: 'money_in', label: 'Money In' },
  { slug: 'money_out', label: 'Money Out' },
  { slug: 'spin_count', label: '# Spins' },
  { slug: 'bonus_count', label: '# Bonuses' },
  { slug: 'current_ev_rtp', label: 'Current EV' },
  { slug: 'average_case_mult', label: 'Avg case (×)' },
  { slug: 'average_case_usd', label: 'Avg case ($)' },
  { slug: 'expected_ev_usd', label: 'Expected EV ($)' },
  { slug: 'acquisition_fee', label: 'Acquisition fee' },
]

const LOG_PLAY_FORM_SLUGS = new Set(LOG_PLAY_FORM_FIELDS.map(f => f.slug))

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
  if (n == null) return '—'
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
export function templatesSorted(templates) {
  return [...templates].sort((a, b) => {
    if (a.is_system !== b.is_system) return a.is_system ? -1 : 1
    return a.display_name.localeCompare(b.display_name)
  })
}

/**
 * Real (wager-weighted) RTP % = (Σ money out ÷ Σ money in) × 100.
 * Same as weighting each play's RTP by its wager—not averaging play RTP % in arithmetic mean.
 */
export function playLogRealRtpPct(totalMoneyIn, totalMoneyOut) {
  const inn = Number(totalMoneyIn)
  const out = Number(totalMoneyOut)
  if (!Number.isFinite(inn) || !Number.isFinite(out) || inn <= 0) return null
  return (out / inn) * 100
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

/** @deprecated alias — use runningRealRtpByEntryId */
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
 * Chips for LOG tab recent-entry cards — bet size, denom, profit/loss, play RTP.
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
      value: pnl == null ? '—' : formatMetricValue(pnl, 'money'),
      tone: pnl == null ? 'neutral' : pnl >= 0 ? 'win' : 'loss',
    },
    {
      key: 'rtp',
      label: 'RTP',
      value: playRtpLabel || '—',
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
      label: defsMap.expected_ev_usd?.label || 'Expected EV',
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

/** @param {string | null | undefined} label e.g. "94.32%" */
function parseRtpPercentLabel(label) {
  if (!label) return null
  const n = Number(String(label).replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}
