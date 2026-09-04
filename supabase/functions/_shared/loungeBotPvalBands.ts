/**
 * PVAL position bands (injury prior v0).
 *
 * Fantasy/DFF later picks *where inside* a band.
 * Depth chart picks *which* band. v0 uses Rundown position + depth when present,
 * else conservative Typical column defaults for unmatched OUTs (kill silent zeros).
 *
 * Units = points off the spread vs replacement, not fantasy points.
 */

export type PvalBandKey =
  | 'starting_qb'
  | 'backup_qb'
  | 'wr1'
  | 'wr2'
  | 'wr3'
  | 'te1'
  | 'rb1'
  | 'rb2'
  | 'ot'
  | 'iol'
  | 'edge1'
  | 'edge2'
  | 'idl'
  | 'lb'
  | 'cb1'
  | 'cb2'
  | 's'
  | 'special'
  | 'unknown'

export type PvalBandDef = {
  key: PvalBandKey
  /** Display pos for captions / keyAbsences */
  posLabel: string
  side: 'offense' | 'defense'
  min: number
  max: number
  /** v0 default when we only know band, not fantasy seat */
  typical: number
}

/** Locked policy table (Ryan + Grok 2026-09-03). */
export const PVAL_BANDS: Record<PvalBandKey, PvalBandDef> = {
  starting_qb: { key: 'starting_qb', posLabel: 'QB', side: 'offense', min: 2.0, max: 6.0, typical: 3.0 },
  backup_qb: { key: 'backup_qb', posLabel: 'QB', side: 'offense', min: 0.0, max: 0.5, typical: 0.25 },
  wr1: { key: 'wr1', posLabel: 'WR', side: 'offense', min: 0.5, max: 1.5, typical: 0.8 },
  wr2: { key: 'wr2', posLabel: 'WR', side: 'offense', min: 0.2, max: 0.7, typical: 0.4 },
  wr3: { key: 'wr3', posLabel: 'WR', side: 'offense', min: 0.1, max: 0.4, typical: 0.2 },
  te1: { key: 'te1', posLabel: 'TE', side: 'offense', min: 0.2, max: 0.8, typical: 0.4 },
  rb1: { key: 'rb1', posLabel: 'RB', side: 'offense', min: 0.3, max: 1.0, typical: 0.5 },
  rb2: { key: 'rb2', posLabel: 'RB', side: 'offense', min: 0.1, max: 0.4, typical: 0.2 },
  ot: { key: 'ot', posLabel: 'OT', side: 'offense', min: 0.3, max: 0.9, typical: 0.5 },
  iol: { key: 'iol', posLabel: 'OL', side: 'offense', min: 0.2, max: 0.6, typical: 0.3 },
  edge1: { key: 'edge1', posLabel: 'EDGE', side: 'defense', min: 0.4, max: 1.5, typical: 0.7 },
  edge2: { key: 'edge2', posLabel: 'EDGE', side: 'defense', min: 0.2, max: 0.5, typical: 0.3 },
  idl: { key: 'idl', posLabel: 'DT', side: 'defense', min: 0.2, max: 0.7, typical: 0.3 },
  lb: { key: 'lb', posLabel: 'LB', side: 'defense', min: 0.2, max: 0.7, typical: 0.4 },
  cb1: { key: 'cb1', posLabel: 'CB', side: 'defense', min: 0.3, max: 1.0, typical: 0.5 },
  cb2: { key: 'cb2', posLabel: 'CB', side: 'defense', min: 0.1, max: 0.4, typical: 0.2 },
  s: { key: 's', posLabel: 'S', side: 'defense', min: 0.2, max: 0.6, typical: 0.3 },
  special: { key: 'special', posLabel: 'ST', side: 'offense', min: 0.0, max: 0.2, typical: 0.0 },
  unknown: { key: 'unknown', posLabel: 'UNK', side: 'offense', min: 0.0, max: 0.25, typical: 0.15 },
}

/** Soft shrink kicks in above this non-QB team sum; hard cap after. */
export const PVAL_NON_QB_SOFT_CAP = 1.2
export const PVAL_NON_QB_HARD_CAP = 2.0
/** When starting QB is also OUT, shrink stacked non-QB impact. */
export const PVAL_NON_QB_WITH_QB_OUT_FACTOR = 0.55
/** Questionable / doubtful (not hard OUT) multiplier. */
export const PVAL_QUESTIONABLE_FACTOR = 0.4
/**
 * QB absence impact is starter − replacement, not full starter PVAL.
 * Anything above backup_qb.max is treated as a starting-QB absence (covers
 * curated bridge seats ~1.5 that sit under the starting_qb band floor).
 */
export const PVAL_STARTING_QB_THRESHOLD = PVAL_BANDS.backup_qb.max
/** Fallback when no healthy backup is on the team roster map. */
export const PVAL_QB_REPLACEMENT_DEFAULT = PVAL_BANDS.backup_qb.typical

function normPos(raw: string): string {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

/**
 * Map Rundown / roster position string + depth order → band.
 * Depth picks the band. Missing depth → conservative mid band (not WR1 by default).
 */
export function resolvePvalBandKey(
  positionRaw: string | null | undefined,
  depthOrder: number | null | undefined,
  depthSlot?: string | null,
): PvalBandKey {
  const p = normPos(positionRaw || '')
  const slot = normPos(depthSlot || '')
  const depth = Number.isFinite(Number(depthOrder)) ? Number(depthOrder) : null

  if (!p && !slot) return 'unknown'

  if (/^(K|PK|P|LS|KOS)$/.test(p) || p.includes('KICK') || p.includes('PUNT')) return 'special'
  if (p === 'QB' || p.includes('QUARTER')) {
    if (depth != null && depth >= 2) return 'backup_qb'
    return 'starting_qb'
  }
  if (p === 'WR' || p.includes('WIDE')) {
    if (depth === 1) return 'wr1'
    if (depth === 2) return 'wr2'
    if (depth != null && depth >= 3) return 'wr3'
    return 'wr2'
  }
  if (p === 'TE' || p.includes('TIGHT')) return 'te1'
  if (p === 'RB' || p === 'HB' || p === 'FB' || p.includes('RUNNING')) {
    if (depth === 1) return 'rb1'
    if (depth != null && depth >= 2) return 'rb2'
    return 'rb2'
  }
  if (p === 'OT' || p === 'T' || p === 'LT' || p === 'RT' || (p.includes('TACKLE') && !p.includes('DEF'))) {
    return 'ot'
  }
  if (p === 'G' || p === 'C' || p === 'OG' || p === 'OC' || p === 'IOL' || p === 'OL') return 'iol'
  if (p === 'EDGE' || p === 'DE' || p === 'OLB' || p.includes('EDGE') || p === 'LBDE') {
    if (depth === 1) return 'edge1'
    if (depth != null && depth >= 2) return 'edge2'
    return 'edge2'
  }
  if (p === 'DT' || p === 'NT' || p === 'IDL' || p === 'DL') return 'idl'
  if (p === 'LB' || p === 'ILB' || p === 'MLB' || p === 'WILL' || p === 'MIKE') return 'lb'
  if (p === 'CB' || p.includes('CORNER') || slot === 'LCB' || slot === 'RCB' || slot === 'NCB') {
    if (depth === 1) return 'cb1'
    if (depth != null && depth >= 2) return 'cb2'
    return 'cb2'
  }
  if (
    p === 'S'
    || p === 'SS'
    || p === 'FS'
    || p.includes('SAFETY')
    || slot === 'SS'
    || slot === 'FS'
    || slot === 'S'
  ) {
    return 's'
  }
  if (p === 'DB') {
    if (slot === 'SS' || slot === 'FS' || slot === 'S') return 's'
    if (depth === 1) return 'cb1'
    return 'cb2'
  }

  return 'unknown'
}

export function typicalPvalForBand(bandKey: PvalBandKey): number {
  return PVAL_BANDS[bandKey]?.typical ?? 0
}

/**
 * Map 0..1 percentile (0=worst in band, 1=best) into the band's min..max.
 * Blends toward typical (55/45) so weekly fantasy leaders don't all pin the ceiling.
 * Clamped; rounded to 0.05.
 */
export function pvalFromPercentileInBand(bandKey: PvalBandKey, percentile01: number): number {
  const band = PVAL_BANDS[bandKey]
  if (!band) return 0
  const p = Math.max(0, Math.min(1, Number(percentile01) || 0))
  const linear = band.min + p * (band.max - band.min)
  const raw = 0.55 * linear + 0.45 * band.typical
  const clamped = Math.max(band.min, Math.min(band.max, raw))
  return Math.round(clamped * 20) / 20
}

export function isHardOutStatus(status: string): boolean {
  const s = String(status || '').trim()
  return /^(out|inactive|suspended|ir|pup)$/i.test(s) || /injured reserve/i.test(s)
}

export function isQuestionableStatus(status: string): boolean {
  const s = String(status || '').trim()
  return /^(questionable|doubtful|gtd)$/i.test(s) || /question|doubt/i.test(s)
}

/** Scale raw band typical by injury status (Q/D = 0.4×; hard OUT = full). */
export function scalePvalForStatus(pval: number, status: string): number {
  if (!Number.isFinite(pval) || pval <= 0) return 0
  if (isHardOutStatus(status)) return pval
  if (isQuestionableStatus(status)) {
    return Math.round(pval * PVAL_QUESTIONABLE_FACTOR * 100) / 100
  }
  // Other injury tags (e.g. generic INJURED) … treat like questionable prior
  if (/injur|out|inactive|suspend/i.test(status)) {
    return Math.round(pval * PVAL_QUESTIONABLE_FACTOR * 100) / 100
  }
  return 0
}

export type PvalAbsencePiece = {
  name: string
  pos: string
  pval: number
  status: string
  side: 'offense' | 'defense'
  isQb: boolean
  /** Optional caption hint after QB replacement delta. */
  note?: string
}

export type QbRosterCandidate = {
  name: string
  team: string
  pval: number
}

function normalizeTeamLoose(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export function teamsMatchLoose(a: string, b: string): boolean {
  const na = normalizeTeamLoose(a)
  const nb = normalizeTeamLoose(b)
  if (!na || !nb) return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

/**
 * Starter OUT ≠ lose full PVAL. Convert starting-QB absences to
 * max(0, starter − healthyBackup). Backup-only outs drop to 0.
 * Extra inactive QBs (the backups themselves) are zeroed so we don't double-count.
 */
export function applyQbReplacementDeltas(
  pieces: PvalAbsencePiece[],
  opts: {
    teamName: string
    rosterQbs?: QbRosterCandidate[] | null
  },
): PvalAbsencePiece[] {
  const qbPieces = pieces.filter((p) => p.isQb)
  const nonQb = pieces.filter((p) => !p.isQb)
  if (qbPieces.length === 0) return pieces

  const inactiveKeys = new Set(
    qbPieces.map((p) =>
      String(p.name || '')
        .toLowerCase()
        .replace(/\b(jr|sr|ii|iii|iv|v)\b/gi, '')
        .replace(/[^a-z0-9]/g, ''),
    ),
  )

  const starters = qbPieces
    .filter((p) => p.pval > PVAL_STARTING_QB_THRESHOLD)
    .sort((a, b) => b.pval - a.pval)

  // Backup / bridge QB out while the starter is healthy → no spread hit.
  if (starters.length === 0) {
    return [
      ...nonQb,
      ...qbPieces.map((p) => ({
        ...p,
        pval: 0,
        note: 'backup QB out (starter healthy) → 0',
      })),
    ]
  }

  const primary = starters[0]!
  const primaryKey = String(primary.name || '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')

  const teamQbs = (opts.rosterQbs || []).filter((q) => teamsMatchLoose(q.team, opts.teamName))
  const healthyBackups = teamQbs
    .filter((q) => {
      const key = String(q.name || '')
        .toLowerCase()
        .replace(/\b(jr|sr|ii|iii|iv|v)\b/gi, '')
        .replace(/[^a-z0-9]/g, '')
      if (!key || key === primaryKey || inactiveKeys.has(key)) return false
      // Prefer true backups / lesser QBs; never credit someone ≥ the starter.
      return Number(q.pval) < primary.pval
    })
    .sort((a, b) => Number(b.pval) - Number(a.pval))

  const repl = healthyBackups[0]
  const otherTeamQbs = teamQbs.filter((q) => {
    const key = String(q.name || '')
      .toLowerCase()
      .replace(/\b(jr|sr|ii|iii|iv|v)\b/gi, '')
      .replace(/[^a-z0-9]/g, '')
    return key && key !== primaryKey
  })
  const allOtherInactives =
    otherTeamQbs.length > 0 &&
    otherTeamQbs.every((q) => {
      const key = String(q.name || '')
        .toLowerCase()
        .replace(/\b(jr|sr|ii|iii|iv|v)\b/gi, '')
        .replace(/[^a-z0-9]/g, '')
      return inactiveKeys.has(key)
    })

  let replPval: number
  let replLabel: string
  if (repl) {
    replPval = Math.max(0, Number(repl.pval) || 0)
    replLabel = `${repl.name} ${replPval}`
  } else if (allOtherInactives) {
    // Starter + every mapped backup also OUT → emergency / PS level.
    replPval = 0
    replLabel = 'no healthy backup'
  } else {
    replPval = PVAL_QB_REPLACEMENT_DEFAULT
    replLabel = `typical backup ${replPval}`
  }

  const delta = Math.max(0, Math.round((primary.pval - replPval) * 100) / 100)

  const adjustedPrimary: PvalAbsencePiece = {
    ...primary,
    pval: delta,
    note: `QB Δ vs ${replLabel} (raw ${primary.pval})`,
  }

  const otherQbs = qbPieces
    .filter((p) => p !== primary)
    .map((p) => ({
      ...p,
      pval: 0,
      note: 'folded into starter replacement chain',
    }))

  return [...nonQb, adjustedPrimary, ...otherQbs]
}

/**
 * Apply non-QB soft/hard caps and QB-out shrink.
 * QB PVALs pass through after replacement delta. Non-QB stack: soft after 1.2, hard 2.0.
 */
export function applyTeamPvalStackRules(pieces: PvalAbsencePiece[]): {
  pieces: PvalAbsencePiece[]
  totalPvalLost: number
  offensePvalLost: number
  defensePvalLost: number
} {
  const qbPieces = pieces.filter((p) => p.isQb)
  const nonQb = pieces.filter((p) => !p.isQb)

  const qbSum = qbPieces.reduce((s, p) => s + p.pval, 0)
  const nonQbRaw = nonQb.reduce((s, p) => s + p.pval, 0)

  let nonQbEffective = nonQbRaw
  if (nonQbRaw > PVAL_NON_QB_SOFT_CAP) {
    nonQbEffective =
      PVAL_NON_QB_SOFT_CAP + (nonQbRaw - PVAL_NON_QB_SOFT_CAP) * 0.5
  }
  nonQbEffective = Math.min(PVAL_NON_QB_HARD_CAP, nonQbEffective)

  if (qbSum >= 2.0 && nonQbEffective > 0) {
    nonQbEffective = Math.round(nonQbEffective * PVAL_NON_QB_WITH_QB_OUT_FACTOR * 100) / 100
  }

  const scale = nonQbRaw > 0 ? nonQbEffective / nonQbRaw : 1
  const scaledNonQb = nonQb.map((p) => ({
    ...p,
    pval: Math.round(p.pval * scale * 100) / 100,
  }))

  const outPieces = [...qbPieces, ...scaledNonQb].sort((a, b) => b.pval - a.pval)
  let offense = 0
  let defense = 0
  let total = 0
  for (const p of outPieces) {
    total += p.pval
    if (p.side === 'offense') offense += p.pval
    else defense += p.pval
  }

  return {
    pieces: outPieces,
    totalPvalLost: Math.round(total * 100) / 100,
    offensePvalLost: Math.round(offense * 100) / 100,
    defensePvalLost: Math.round(defense * 100) / 100,
  }
}

/**
 * v0 prior for a Rundown inactive with no curated/DB PVAL row.
 * Returns null only for special teams (0) with nothing to contribute.
 */
export function priorPvalFromRundownPlayer(input: {
  name: string
  status: string
  position?: string | null
  depthOrder?: number | null
}): PvalAbsencePiece | null {
  const bandKey = resolvePvalBandKey(input.position, input.depthOrder)
  if (bandKey === 'special') return null

  const band = PVAL_BANDS[bandKey]
  const raw = typicalPvalForBand(bandKey)
  const pval = scalePvalForStatus(raw, input.status)
  if (pval <= 0) return null

  return {
    name: String(input.name || '').trim(),
    pos: band.posLabel,
    pval,
    status: input.status,
    side: band.side,
    isQb: bandKey === 'starting_qb' || bandKey === 'backup_qb',
  }
}
