/**
 * Monthly syndicate scoreboard … dumb ATS + CLV aggregations only.
 * Buckets: hammer / consensus / divided / pass
 * Desks: Scott / Rocco / Chedda = sides; Tank = totals only
 * CLV: pick line vs lounge_market_files close (when locked)
 *
 * Do NOT feed adaptive weights from this until a bucket has a real sample.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export type ScoreboardBucket = 'hammer' | 'consensus' | 'divided' | 'pass'
export type ScoreboardDesk = 'Scott' | 'Rocco' | 'Chedda' | 'Tank'
export type ScoreboardLane = 'sides' | 'totals'

export type ScoreboardRow = {
  bucket: ScoreboardBucket
  desk: ScoreboardDesk
  lane: ScoreboardLane
  n: number
  wins: number
  losses: number
  pushes: number
  ats_win_pct: number | null
  units_net: number
  clv_n: number
  clv_avg_pts: number | null
  clv_beat_n: number
  clv_beat_pct: number | null
}

export type MonthlySyndicateScoreboard = {
  period: { start: string; end: string; label: string }
  bot_user_id: string
  rows: ScoreboardRow[]
  by_bucket: Array<{
    bucket: ScoreboardBucket
    n: number
    wins: number
    losses: number
    pushes: number
    ats_win_pct: number | null
    units_net: number
    clv_n: number
    clv_avg_pts: number | null
    clv_beat_pct: number | null
  }>
  by_desk: Array<{
    desk: ScoreboardDesk
    lane: ScoreboardLane
    n: number
    wins: number
    losses: number
    pushes: number
    ats_win_pct: number | null
    units_net: number
    clv_n: number
    clv_avg_pts: number | null
    clv_beat_pct: number | null
  }>
  notes: string[]
}

type PickRow = {
  id: string
  picker_name: string
  market_key: string
  pick_name: string
  pick_line: number | null
  home_team: string
  away_team: string
  event_id: string
  status: string
  units_net: number | null
  commence_time: string
  metadata: Record<string, unknown> | null
}

type MarketClose = {
  event_id: string
  close_locked: boolean
  close_spread_home: number | null
  close_total: number | null
}

const DESKS: ScoreboardDesk[] = ['Scott', 'Rocco', 'Chedda', 'Tank']
const BUCKETS: ScoreboardBucket[] = ['hammer', 'consensus', 'divided', 'pass']

function isTeamMatch(targetName: string, candidateName: string): boolean {
  const t = String(targetName || '').trim().toLowerCase()
  const c = String(candidateName || '').trim().toLowerCase()
  if (!t || !c) return false
  if (t === c) return true
  if (t.includes(c) || c.includes(t)) return true
  const tLast = t.split(' ').pop() || ''
  const cLast = c.split(' ').pop() || ''
  return Boolean(tLast && cLast && tLast === cLast)
}

/** Map ledger consensus_type / bucket → scoreboard bucket. */
export function normalizeScoreboardBucket(
  meta: Record<string, unknown> | null | undefined,
  opts?: { side?: string | null },
): ScoreboardBucket {
  if (opts?.side === 'pass' || meta?.side === 'pass' || meta?.bucket === 'pass') return 'pass'
  const raw = String(meta?.bucket || meta?.consensus_type || '').toLowerCase()
  if (raw === 'hammer') return 'hammer'
  if (raw === 'consensus') return 'consensus'
  if (raw === 'divided' || raw === 'split') return 'divided'
  if (raw === 'pass') return 'pass'
  return 'divided'
}

export function mapConsensusTypeToBucket(
  consensusType: 'hammer' | 'consensus' | 'split' | string,
): ScoreboardBucket {
  if (consensusType === 'hammer') return 'hammer'
  if (consensusType === 'consensus') return 'consensus'
  return 'divided'
}

export function deskLane(pickerName: string, marketKey?: string | null): ScoreboardLane {
  if (pickerName === 'Tank' || marketKey === 'totals') return 'totals'
  return 'sides'
}

/**
 * Points of CLV vs market-file close.
 * Spreads: pick_line − close (same side). Positive = beat the close.
 * Totals Over: pick_line − close. Totals Under: close − pick_line.
 */
export function computePickClvPts(
  pick: {
    market_key: string
    pick_name: string
    pick_line: number | null
    home_team: string
    away_team: string
  },
  close: { close_spread_home: number | null; close_total: number | null; close_locked?: boolean } | null,
): number | null {
  if (!close) return null
  if (close.close_locked !== true) return null

  if (pick.market_key === 'spreads') {
    if (pick.pick_line == null || close.close_spread_home == null) return null
    const isHome = isTeamMatch(pick.pick_name, pick.home_team)
    if (isHome) return Number(pick.pick_line) - Number(close.close_spread_home)
    const closeAway = -Number(close.close_spread_home)
    return Number(pick.pick_line) - closeAway
  }

  if (pick.market_key === 'totals') {
    if (pick.pick_line == null || close.close_total == null) return null
    const isOver = /^over/i.test(String(pick.pick_name || ''))
    return isOver
      ? Number(pick.pick_line) - Number(close.close_total)
      : Number(close.close_total) - Number(pick.pick_line)
  }

  return null
}

function monthWindow(asOf: Date, monthsBack = 1): { start: Date; end: Date; label: string } {
  const end = new Date(asOf)
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (monthsBack - 1), 1, 0, 0, 0))
  // Full calendar months: from start-of-month (monthsBack ago) through end of current UTC month
  const endExclusive = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1, 0, 0, 0))
  const label = monthsBack === 1
    ? `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}`
    : `${start.toISOString().slice(0, 7)}…${end.toISOString().slice(0, 7)}`
  return { start, end: endExclusive, label }
}

function emptyCell(bucket: ScoreboardBucket, desk: ScoreboardDesk): ScoreboardRow {
  return {
    bucket,
    desk,
    lane: deskLane(desk),
    n: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    ats_win_pct: null,
    units_net: 0,
    clv_n: 0,
    clv_avg_pts: null,
    clv_beat_n: 0,
    clv_beat_pct: null,
  }
}

function finalizeAts(row: { wins: number; losses: number; ats_win_pct: number | null }) {
  const decided = row.wins + row.losses
  row.ats_win_pct = decided > 0 ? Math.round((row.wins / decided) * 1000) / 10 : null
}

function finalizeClv(row: {
  clv_n: number
  clv_avg_pts: number | null
  clv_beat_n: number
  clv_beat_pct: number | null
  _clvSum?: number
}) {
  if (row.clv_n > 0 && typeof row._clvSum === 'number') {
    row.clv_avg_pts = Math.round((row._clvSum / row.clv_n) * 100) / 100
    row.clv_beat_pct = Math.round((row.clv_beat_n / row.clv_n) * 1000) / 10
  }
  delete row._clvSum
}

async function loadClosesForEvents(
  admin: SupabaseClient,
  eventIds: string[],
): Promise<Map<string, MarketClose>> {
  const map = new Map<string, MarketClose>()
  const unique = [...new Set(eventIds.filter(Boolean))]
  const chunkSize = 80
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    const { data } = await admin
      .from('lounge_market_files')
      .select('event_id, close_locked, close_spread_home, close_total')
      .in('event_id', chunk)
    for (const row of data || []) {
      map.set(row.event_id, row as MarketClose)
    }
  }
  return map
}

function resolveClvPts(pick: PickRow, closes: Map<string, MarketClose>): number | null {
  const meta = pick.metadata || {}
  if (typeof meta.clv_pts === 'number' && Number.isFinite(meta.clv_pts)) {
    return Number(meta.clv_pts)
  }
  return computePickClvPts(pick, closes.get(pick.event_id) || null)
}

/**
 * Compile monthly (or multi-month) desk × bucket scoreboard from lounge_bot_picks.
 * Pass rows (status cancelled + bucket pass) count toward n only … no ATS.
 */
export async function compileMonthlySyndicateScoreboard(
  admin: SupabaseClient,
  botUserId: string,
  opts?: { monthsBack?: number; asOf?: string | Date },
): Promise<MonthlySyndicateScoreboard> {
  const asOf = opts?.asOf ? new Date(opts.asOf) : new Date()
  const monthsBack = Math.max(1, Math.min(12, Number(opts?.monthsBack) || 1))
  const { start, end, label } = monthWindow(asOf, monthsBack)

  const { data: picks, error } = await admin
    .from('lounge_bot_picks')
    .select(
      'id, picker_name, market_key, pick_name, pick_line, home_team, away_team, event_id, status, units_net, commence_time, metadata',
    )
    .eq('bot_user_id', botUserId)
    .gte('commence_time', start.toISOString())
    .lt('commence_time', end.toISOString())
    .in('status', ['won', 'lost', 'push', 'cancelled'])
    .in('picker_name', DESKS)

  if (error) {
    throw new Error(`Scoreboard query failed: ${error.message}`)
  }

  const list = (picks || []) as PickRow[]
  const closes = await loadClosesForEvents(admin, list.map((p) => p.event_id))

  type Acc = ScoreboardRow & { _clvSum?: number }
  const cells = new Map<string, Acc>()
  for (const bucket of BUCKETS) {
    for (const desk of DESKS) {
      cells.set(`${bucket}|${desk}`, emptyCell(bucket, desk))
    }
  }

  const notes: string[] = [
    'Dumb aggregates only … no adaptive weights until a bucket has a real sample.',
    'Tank rows are totals-only; Scott / Rocco / Chedda are sides.',
    'CLV vs lounge_market_files close when locked (or metadata.clv_pts from grade).',
    'Pass = desk PASS (cancelled ledger) … n only, no ATS.',
  ]

  for (const pick of list) {
    const desk = pick.picker_name as ScoreboardDesk
    if (!DESKS.includes(desk)) continue

    // Tank must not land on side scoreboard; sides desks skip totals (teasers etc. ignored)
    const lane = deskLane(desk, pick.market_key)
    if (desk === 'Tank' && pick.market_key !== 'totals' && pick.status !== 'cancelled') continue
    if (desk !== 'Tank' && pick.market_key === 'totals') continue
    if (pick.market_key === 'h2h' || pick.market_key === 'teasers') continue

    const meta = pick.metadata || {}
    const bucket = normalizeScoreboardBucket(meta, { side: typeof meta.side === 'string' ? meta.side : null })
    const key = `${bucket}|${desk}`
    const row = cells.get(key)
    if (!row) continue

    row.lane = lane
    row.n += 1

    if (bucket === 'pass' || pick.status === 'cancelled') {
      continue
    }

    if (pick.status === 'won') row.wins += 1
    else if (pick.status === 'lost') row.losses += 1
    else if (pick.status === 'push') row.pushes += 1

    row.units_net += Number(pick.units_net) || 0

    const clv = resolveClvPts(pick, closes)
    if (clv != null && Number.isFinite(clv)) {
      row.clv_n += 1
      row._clvSum = (row._clvSum || 0) + clv
      if (clv > 0) row.clv_beat_n += 1
    }
  }

  const rows: ScoreboardRow[] = []
  for (const bucket of BUCKETS) {
    for (const desk of DESKS) {
      const row = cells.get(`${bucket}|${desk}`)!
      finalizeAts(row)
      finalizeClv(row)
      row.units_net = Math.round(row.units_net * 100) / 100
      rows.push(row)
    }
  }

  const by_bucket = BUCKETS.map((bucket) => {
    const subset = rows.filter((r) => r.bucket === bucket)
    const agg = {
      bucket,
      n: subset.reduce((s, r) => s + r.n, 0),
      wins: subset.reduce((s, r) => s + r.wins, 0),
      losses: subset.reduce((s, r) => s + r.losses, 0),
      pushes: subset.reduce((s, r) => s + r.pushes, 0),
      ats_win_pct: null as number | null,
      units_net: Math.round(subset.reduce((s, r) => s + r.units_net, 0) * 100) / 100,
      clv_n: subset.reduce((s, r) => s + r.clv_n, 0),
      clv_avg_pts: null as number | null,
      clv_beat_pct: null as number | null,
    }
    finalizeAts(agg)
    const clvSum = subset.reduce((s, r) => s + (r.clv_avg_pts != null && r.clv_n ? r.clv_avg_pts * r.clv_n : 0), 0)
    const beatN = subset.reduce((s, r) => s + r.clv_beat_n, 0)
    if (agg.clv_n > 0) {
      agg.clv_avg_pts = Math.round((clvSum / agg.clv_n) * 100) / 100
      agg.clv_beat_pct = Math.round((beatN / agg.clv_n) * 1000) / 10
    }
    return agg
  })

  const by_desk = DESKS.map((desk) => {
    const subset = rows.filter((r) => r.desk === desk && r.bucket !== 'pass')
    const passN = rows.find((r) => r.desk === desk && r.bucket === 'pass')?.n || 0
    const agg = {
      desk,
      lane: deskLane(desk),
      n: subset.reduce((s, r) => s + r.n, 0) + passN,
      wins: subset.reduce((s, r) => s + r.wins, 0),
      losses: subset.reduce((s, r) => s + r.losses, 0),
      pushes: subset.reduce((s, r) => s + r.pushes, 0),
      ats_win_pct: null as number | null,
      units_net: Math.round(subset.reduce((s, r) => s + r.units_net, 0) * 100) / 100,
      clv_n: subset.reduce((s, r) => s + r.clv_n, 0),
      clv_avg_pts: null as number | null,
      clv_beat_pct: null as number | null,
    }
    finalizeAts(agg)
    const clvSum = subset.reduce((s, r) => s + (r.clv_avg_pts != null && r.clv_n ? r.clv_avg_pts * r.clv_n : 0), 0)
    const beatN = subset.reduce((s, r) => s + r.clv_beat_n, 0)
    if (agg.clv_n > 0) {
      agg.clv_avg_pts = Math.round((clvSum / agg.clv_n) * 100) / 100
      agg.clv_beat_pct = Math.round((beatN / agg.clv_n) * 1000) / 10
    }
    return agg
  })

  return {
    period: {
      start: start.toISOString(),
      end: end.toISOString(),
      label,
    },
    bot_user_id: botUserId,
    rows: rows.filter((r) => r.n > 0),
    by_bucket: by_bucket.filter((r) => r.n > 0),
    by_desk: by_desk.filter((r) => r.n > 0),
    notes,
  }
}

/** One-line ops summary for toast / CLI. */
export function formatScoreboardToast(board: MonthlySyndicateScoreboard): string {
  const desks = board.by_desk
    .map((d) => {
      const ats = d.ats_win_pct != null ? `${d.wins}-${d.losses}` : `${d.n} pass/n`
      const clv = d.clv_avg_pts != null ? ` CLV ${d.clv_avg_pts > 0 ? '+' : ''}${d.clv_avg_pts}` : ''
      return `${d.desk} ${ats} n=${d.n}${clv}`
    })
    .join(' · ')
  const buckets = board.by_bucket
    .map((b) => `${b.bucket} n=${b.n}`)
    .join(', ')
  return `Scoreboard ${board.period.label}: ${desks || 'no graded rows'}${buckets ? ` | ${buckets}` : ''}`
}
