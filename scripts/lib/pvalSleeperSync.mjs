/**
 * Sleeper → PVAL v1 mapper (Node).
 *
 * Depth chart picks the band (must stay in sync with loungeBotPvalBands.ts).
 * Weekly fantasy pts (pts_ppr) pick the seat inside the band.
 * Curated is_custom_override rows are never overwritten on apply.
 */
import { NFL_TEAM_META } from './nflTeamMetricsFromPbp.mjs'

const SLEEPER_PLAYERS = 'https://api.sleeper.app/v1/players/nfl'
const SLEEPER_STATE = 'https://api.sleeper.app/v1/state/nfl'

/** Keep in sync with supabase/functions/_shared/loungeBotPvalBands.ts */
export const PVAL_BANDS = {
  starting_qb: { posLabel: 'QB', side: 'offense', min: 2.0, max: 6.0, typical: 3.0 },
  backup_qb: { posLabel: 'QB', side: 'offense', min: 0.0, max: 0.5, typical: 0.25 },
  wr1: { posLabel: 'WR', side: 'offense', min: 0.5, max: 1.5, typical: 0.8 },
  wr2: { posLabel: 'WR', side: 'offense', min: 0.2, max: 0.7, typical: 0.4 },
  wr3: { posLabel: 'WR', side: 'offense', min: 0.1, max: 0.4, typical: 0.2 },
  te1: { posLabel: 'TE', side: 'offense', min: 0.2, max: 0.8, typical: 0.4 },
  rb1: { posLabel: 'RB', side: 'offense', min: 0.3, max: 1.0, typical: 0.5 },
  rb2: { posLabel: 'RB', side: 'offense', min: 0.1, max: 0.4, typical: 0.2 },
  ot: { posLabel: 'OT', side: 'offense', min: 0.3, max: 0.9, typical: 0.5 },
  iol: { posLabel: 'OL', side: 'offense', min: 0.2, max: 0.6, typical: 0.3 },
  edge1: { posLabel: 'EDGE', side: 'defense', min: 0.4, max: 1.5, typical: 0.7 },
  edge2: { posLabel: 'EDGE', side: 'defense', min: 0.2, max: 0.5, typical: 0.3 },
  idl: { posLabel: 'DT', side: 'defense', min: 0.2, max: 0.7, typical: 0.3 },
  lb: { posLabel: 'LB', side: 'defense', min: 0.2, max: 0.7, typical: 0.4 },
  cb1: { posLabel: 'CB', side: 'defense', min: 0.3, max: 1.0, typical: 0.5 },
  cb2: { posLabel: 'CB', side: 'defense', min: 0.1, max: 0.4, typical: 0.2 },
  s: { posLabel: 'S', side: 'defense', min: 0.2, max: 0.6, typical: 0.3 },
  special: { posLabel: 'ST', side: 'offense', min: 0.0, max: 0.2, typical: 0.0 },
  unknown: { posLabel: 'UNK', side: 'offense', min: 0.0, max: 0.25, typical: 0.15 },
}

export function normalizePlayerNameKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

function normPos(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

export function resolvePvalBandKey(positionRaw, depthOrder, depthSlot = null, fantasyPositions = null) {
  const p = normPos(positionRaw || '')
  const slot = normPos(depthSlot || '')
  const depth = Number.isFinite(Number(depthOrder)) ? Number(depthOrder) : null
  const fantasy = Array.isArray(fantasyPositions)
    ? fantasyPositions.map((x) => normPos(x)).filter(Boolean)
    : []
  if (!p && !slot && !fantasy.length) return 'unknown'

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

  // Offensive line … Sleeper often tags everyone OL with null depth_order.
  if (slot === 'LT' || slot === 'RT' || slot === 'LOT' || slot === 'ROT') return 'ot'
  if (slot === 'LG' || slot === 'RG' || slot === 'C' || slot === 'OC') return 'iol'
  if (p === 'OT' || p === 'LT' || p === 'RT' || (p.includes('TACKLE') && !p.includes('DEF'))) return 'ot'
  if (p === 'T') return 'ot'
  if (p === 'G' || p === 'C' || p === 'OG' || p === 'OC' || p === 'IOL') return 'iol'
  if (p === 'OL') {
    if (fantasy.includes('OT') && !fantasy.includes('OG') && !fantasy.includes('OC')) return 'ot'
    if (fantasy.includes('OG') || fantasy.includes('OC') || fantasy.includes('C')) return 'iol'
    if (fantasy.includes('OT')) return 'ot'
    return 'iol'
  }

  if (p === 'EDGE' || p === 'DE' || p === 'OLB' || p.includes('EDGE') || p === 'LBDE') {
    if (depth === 1) return 'edge1'
    if (depth != null && depth >= 2) return 'edge2'
    return 'edge2'
  }
  if (p === 'DT' || p === 'NT' || p === 'IDL' || p === 'DL') return 'idl'
  if (p === 'LB' || p === 'ILB' || p === 'MLB' || p === 'WILL' || p === 'MIKE') return 'lb'
  if (p === 'CB' || p.includes('CORNER') || slot === 'LCB' || slot === 'RCB' || slot === 'NCB' || slot === 'SCB') {
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

/** True OL roster positions (not defense / TE). */
export function isOffensiveLinePosition(positionRaw) {
  return /^(OL|OT|OG|OC|G|C|T|LT|RT|IOL)$/i.test(String(positionRaw || '').trim())
}

/** Keep starting OL + one swing per team (Sleeper lacks OL depth charts). */
export const OL_KEEP_PER_TEAM = { ot: 3, iol: 4 }

export function pvalFromPercentileInBand(bandKey, percentile01) {
  const band = PVAL_BANDS[bandKey]
  if (!band) return 0
  const p = Math.max(0, Math.min(1, Number(percentile01) || 0))
  // Compress toward typical so weekly fantasy leaders don't all become "Mahomes-tier".
  // Blend linear band seat with typical: 55% percentile path + 45% typical anchor.
  const linear = band.min + p * (band.max - band.min)
  const raw = 0.55 * linear + 0.45 * band.typical
  const clamped = Math.max(band.min, Math.min(band.max, raw))
  return Math.round(clamped * 20) / 20
}

function teamFullName(abbr) {
  const a = String(abbr || '').trim().toUpperCase()
  return NFL_TEAM_META[a]?.team_name || a
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.json()
}

/**
 * Build proposed PVAL rows from Sleeper players + weekly projections.
 */
export async function buildSleeperPvalRows(opts = {}) {
  const state = await fetchJson(SLEEPER_STATE)
  const season = String(opts.season || state.season || '2026')
  const week = Number(opts.week || state.week || 1)
  const [players, projections] = await Promise.all([
    fetchJson(SLEEPER_PLAYERS),
    fetchJson(`https://api.sleeper.app/v1/projections/nfl/regular/${season}/${week}`),
  ])

  const candidates = []
  for (const [id, p] of Object.entries(players || {})) {
    if (!p || p.active !== true || !p.team || !p.full_name) continue
    const status = String(p.status || '')
    if (/retire|inactive|cut|practice/i.test(status) && status !== 'Active') continue
    if (status && status !== 'Active' && /Injured Reserve|PUP|Non Football/i.test(status)) {
      // still include IR names so OUT matching works; they stay on roster lists often as Inactive
    }

    const position = p.position || (Array.isArray(p.fantasy_positions) ? p.fantasy_positions[0] : null)
    const depth = p.depth_chart_order != null ? Number(p.depth_chart_order) : null
    const depthSlot = p.depth_chart_position || null
    const fantasyPositions = Array.isArray(p.fantasy_positions) ? p.fantasy_positions : null
    const bandKey = resolvePvalBandKey(position, depth, depthSlot, fantasyPositions)
    if (bandKey === 'special') continue

    const proj = projections?.[id] || {}
    const pts = Number(proj.pts_ppr)
    const searchRank = Number(p.search_rank)
    const yearsExp = Number.isFinite(Number(p.years_exp)) ? Number(p.years_exp) : null
    const isOl = isOffensiveLinePosition(position)

    // Keep injury-relevant names: depth, week proj, fantasy rank, or active OL (Sleeper OL depth is empty).
    const hasDepth = depth != null && depth > 0
    const hasProj = Number.isFinite(pts) && pts > 0
    const hasRank = Number.isFinite(searchRank) && searchRank < 500
    if (!hasDepth && !hasProj && !hasRank && !isOl) continue
    // Skip inactive/retired OL without depth signal
    if (isOl && status && status !== 'Active' && !hasDepth) continue

    candidates.push({
      sleeperId: id,
      player_name: p.full_name,
      normalized_name: normalizePlayerNameKey(p.full_name),
      team_name: teamFullName(p.team),
      team_abbr: String(p.team).toUpperCase(),
      position: PVAL_BANDS[bandKey].posLabel,
      bandKey,
      side: PVAL_BANDS[bandKey].side,
      depth_order: depth,
      depth_slot: depthSlot,
      pts_ppr: Number.isFinite(pts) ? pts : null,
      search_rank: Number.isFinite(searchRank) && searchRank < 999999 ? searchRank : null,
      years_exp: yearsExp,
      isOl,
    })
  }

  // Sleeper rarely sets OL depth_order … keep starters + swing per team only.
  const pruned = []
  const olBuckets = new Map()
  for (const row of candidates) {
    if (row.bandKey !== 'ot' && row.bandKey !== 'iol') {
      pruned.push(row)
      continue
    }
    const key = `${row.team_abbr}|${row.bandKey}`
    const list = olBuckets.get(key) || []
    list.push(row)
    olBuckets.set(key, list)
  }
  for (const [, list] of olBuckets) {
    const keepN = OL_KEEP_PER_TEAM[list[0]?.bandKey] || 3
    list.sort((a, b) => {
      const da = a.depth_order != null ? a.depth_order : 99
      const db = b.depth_order != null ? b.depth_order : 99
      if (da !== db) return da - db
      return (b.years_exp || 0) - (a.years_exp || 0)
    })
    pruned.push(...list.slice(0, keepN))
  }

  // Percentile within each band
  const byBand = new Map()
  for (const row of pruned) {
    const list = byBand.get(row.bandKey) || []
    list.push(row)
    byBand.set(row.bandKey, list)
  }

  const rows = []
  for (const [bandKey, list] of byBand) {
    const scored = list.map((r) => {
      let score = null
      if (r.pts_ppr != null) score = r.pts_ppr
      else if (r.search_rank != null) score = -r.search_rank // lower rank = better
      else if (r.years_exp != null) score = r.years_exp // OL proxy when no fantasy signal
      return { ...r, score }
    })
    const withScore = scored.filter((r) => r.score != null).sort((a, b) => a.score - b.score)
    const noScore = scored.filter((r) => r.score == null)

    for (let i = 0; i < withScore.length; i++) {
      const r = withScore[i]
      const pct = withScore.length <= 1 ? 0.5 : i / (withScore.length - 1)
      const pval = pvalFromPercentileInBand(bandKey, pct)
      const seatNote =
        r.isOl && r.pts_ppr == null
          ? `years_exp=${r.years_exp ?? 'n/a'}`
          : `week ${week} pts_ppr=${r.pts_ppr ?? 'n/a'}`
      rows.push({
        ...r,
        percentile: Math.round(pct * 1000) / 1000,
        pval,
        tier: pct >= 0.85 ? 1 : pct >= 0.55 ? 2 : 3,
        notes: `sleeper v1 · ${bandKey} · pct=${pct.toFixed(2)} · ${seatNote}`,
      })
    }
    for (const r of noScore) {
      const pval = PVAL_BANDS[bandKey].typical
      rows.push({
        ...r,
        percentile: 0.5,
        pval,
        tier: 2,
        notes: `sleeper v1 · ${bandKey} · typical (no proj/rank/years) · week ${week}`,
      })
    }
  }

  rows.sort((a, b) => b.pval - a.pval || a.player_name.localeCompare(b.player_name))

  return {
    season,
    week,
    playerCount: Object.keys(players || {}).length,
    rowCount: rows.length,
    bandCounts: Object.fromEntries(
      [...byBand.entries()].map(([k, v]) => [k, v.length]).sort((a, b) => b[1] - a[1]),
    ),
    rows,
  }
}
