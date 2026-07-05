/**
 * Sharp Report Card — narrative summary of meaningful sharp/steam/RLM line moves.
 * Runs on poll_edges; posts only when quality movement is detected (one pick per poll).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { resolveAlertSubscriberOnly } from './loungeBotAlertAudience.ts'
import { sportPopularityRank } from './loungeBotBestBetHour.ts'
import {
  detectLineMovements,
  loadStoredEventLines,
  type LineMovementAlert,
  type LineMovementConfig,
} from './loungeBotLineMovement.ts'
import { formatAmericanOdds, formatOddsCommenceTimeShort, ptTodayDate, type OddsEvent } from './loungeBotOddsCaption.ts'
import { hasDedupePublishedToday, type OddsBotRow, type OddsCfgRow } from './loungeBotOddsRun.ts'
import {
  countScheduledKindToday,
  DEFAULT_MIN_POST_GAP_MINUTES,
  hasPendingScheduleDedupe,
  submitLoungeBotAlertPost,
} from './loungeBotPublishSchedule.ts'

const CAPTION_MAX = 2000
/** Wider than per-tick line alerts (8–22 min) — report uses 10–60 min snapshot age. */
export const SHARP_REPORT_SNAPSHOT_MIN_MS = 10 * 60 * 1000
export const SHARP_REPORT_SNAPSHOT_MAX_MS = 60 * 60 * 1000

export type SharpReportCandidate = {
  alert: LineMovementAlert
  sportKey: string
  categoryLabel: string
  snapshotAgeMs: number
  popularityRank: number
  movementScore: number
}

function shortName(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return parts[0] || ''
  return parts[parts.length - 1]!
}

function joinCaptionLines(lines: string[]): string {
  const cap = lines.join('\n').trim()
  return cap.length <= CAPTION_MAX ? cap : `${cap.slice(0, CAPTION_MAX - 3)}...`
}

function formatSpreadPoint(point: number): string {
  return point > 0 ? `+${point}` : String(point)
}

function booksPhrase(leadingBooks: string[]): string {
  const books = leadingBooks.filter(Boolean)
  if (books.length >= 2) return 'at multiple sharp books'
  if (books.length === 1) return `at ${books[0]}`
  return 'across books'
}

function lookbackPhrase(snapshotAgeMs: number): string {
  const mins = Math.max(1, Math.round(snapshotAgeMs / 60_000))
  if (mins <= 20) return 'the last ~15 minutes'
  if (mins <= 45) return 'the last ~30 minutes'
  return 'the last hour'
}

export function movementScore(alert: LineMovementAlert): number {
  const magnitude = Math.abs(alert.pointDelta) * 12 + Math.abs(alert.priceDelta)
  const kindBonus = alert.kind === 'rlm'
    ? 35
    : alert.kind === 'sharp_move'
      ? 28
      : alert.kind === 'steam'
        ? 18
        : 0
  return magnitude + kindBonus
}

/** Meaningful move suitable for a report card (not routine line_movement noise). */
export function qualifiesForSharpReport(alert: LineMovementAlert): boolean {
  if (alert.kind === 'rlm' || alert.kind === 'sharp_move' || alert.kind === 'steam') return true
  if (alert.marketKey === 'spreads' && Math.abs(alert.pointDelta) >= 0.5) return true
  if (alert.marketKey === 'totals' && Math.abs(alert.pointDelta) >= 0.5) return true
  if (alert.marketKey === 'h2h' && Math.abs(alert.priceDelta) >= 20) return true
  return false
}

export function compareSharpReportCandidates(a: SharpReportCandidate, b: SharpReportCandidate): number {
  if (b.movementScore !== a.movementScore) return b.movementScore - a.movementScore
  if (b.popularityRank !== a.popularityRank) return b.popularityRank - a.popularityRank
  return b.alert.commenceTime.localeCompare(a.alert.commenceTime)
}

export function pickBestSharpReportCandidate(
  candidates: SharpReportCandidate[],
): SharpReportCandidate | null {
  if (!candidates.length) return null
  const sorted = [...candidates].sort(compareSharpReportCandidates)
  return sorted[0] ?? null
}

export function buildSharpReportMovementLine(alert: LineMovementAlert): string {
  const team = shortName(alert.outcomeName)
  const books = booksPhrase(alert.leadingBooks)

  if (alert.marketKey === 'spreads' && alert.oldPoint != null && alert.newPoint != null) {
    const oldPt = formatSpreadPoint(alert.oldPoint)
    const newPt = formatSpreadPoint(alert.newPoint)
    return `${team} ${newPt} moved from ${oldPt} to ${newPt} ${books}.`
  }

  if (alert.marketKey === 'totals' && alert.oldPoint != null && alert.newPoint != null) {
    const side = /^over$/i.test(alert.outcomeName) ? 'Over' : /^under$/i.test(alert.outcomeName) ? 'Under' : alert.outcomeName
    return `${side} ${alert.newPoint} moved from ${alert.oldPoint} to ${alert.newPoint} ${books}.`
  }

  const oldOdds = formatAmericanOdds(alert.oldPrice)
  const newOdds = formatAmericanOdds(alert.newPrice)
  return `${team} ML moved from ${oldOdds} to ${newOdds} ${books}.`
}

export function buildSharpReportAnalysis(
  alert: LineMovementAlert,
  snapshotAgeMs: number,
): string {
  const team = shortName(alert.outcomeName)
  const lookback = lookbackPhrase(snapshotAgeMs)

  if (alert.kind === 'rlm') {
    return `Reverse line movement detected ... sharp money appears to be leaning against the public side on ${team}. Worth watching over ${lookback}.`
  }

  if (alert.marketKey === 'spreads') {
    if (alert.pointDelta < 0 || alert.priceDelta < 0) {
      return `Sharp money appears to be coming in on ${team} as the number shortens across books. Line has steamed over ${lookback}.`
    }
    return `Books appear to be shading ${team} as the spread drifts ... sharp money may be leaning the other way over ${lookback}.`
  }

  if (alert.marketKey === 'totals') {
    const side = /^over$/i.test(alert.outcomeName) ? 'the over' : /^under$/i.test(alert.outcomeName) ? 'the under' : 'this total'
    const books = booksPhrase(alert.leadingBooks)
    return `Sharp action appears to be moving ${side} over ${lookback}. Steam showing ${books}.`
  }

  if (alert.priceDelta < 0) {
    return `Money appears to be shortening ${team} ML ... sharp action leaning that way over ${lookback}.`
  }
  return `${team} odds lengthening over ${lookback} ... market may be offering value on the dog side.`
}

export function buildSharpReportCaption(candidate: SharpReportCandidate): string {
  const { alert, snapshotAgeMs, categoryLabel } = candidate
  const away = shortName(alert.awayTeam)
  const home = shortName(alert.homeTeam)
  const when = formatOddsCommenceTimeShort(alert.commenceTime)
  const eventLabel = categoryLabel?.trim()
    ? `${categoryLabel}: ${away} vs ${home}`
    : `${away} vs ${home}`

  return joinCaptionLines([
    '📊 Sharp Report Card',
    '',
    buildSharpReportMovementLine(alert),
    '',
    buildSharpReportAnalysis(alert, snapshotAgeMs),
    when ? `${eventLabel} (${when}). This is one to watch closely.` : 'This is one to watch closely.',
  ])
}

export function sharpReportDedupeKey(alert: LineMovementAlert, ptDay = ptTodayDate()): string {
  return `sharp_report:${ptDay}:${alert.eventId}:${alert.marketKey}:${alert.outcomeName}`
}

export async function findSharpReportCandidateForSport(
  admin: SupabaseClient,
  botUserId: string,
  events: OddsEvent[],
  sportKey: string,
  categoryLabel: string,
  cfg: LineMovementConfig,
): Promise<SharpReportCandidate | null> {
  if (!events.length) return null

  const eventIds = events
    .map((ev) => String(ev.id || '').trim())
    .filter(Boolean)
  const { lines: previous, snapshotAgeMs } = await loadStoredEventLines(admin, botUserId, eventIds)

  if (!previous.length || snapshotAgeMs == null) return null
  if (snapshotAgeMs < SHARP_REPORT_SNAPSHOT_MIN_MS) return null
  if (snapshotAgeMs > SHARP_REPORT_SNAPSHOT_MAX_MS) return null

  const movements = detectLineMovements(events, sportKey, previous, cfg)
  const qualifying = movements.filter(qualifiesForSharpReport)
  if (!qualifying.length) return null

  const bestAlert = qualifying.sort((a, b) => movementScore(b) - movementScore(a))[0]!
  return {
    alert: bestAlert,
    sportKey,
    categoryLabel,
    snapshotAgeMs,
    popularityRank: sportPopularityRank(sportKey),
    movementScore: movementScore(bestAlert),
  }
}

export async function tryPublishSharpReport(
  admin: SupabaseClient,
  bot: OddsBotRow,
  candidates: SharpReportCandidate[],
  oddsCfg: OddsCfgRow,
  dayStart: string,
  dryRun: boolean,
): Promise<{
  published: boolean
  scheduled?: boolean
  skipped?: string
  candidate?: { sportKey: string; eventId: string; kind: string; movementScore: number } | null
  captionPreview?: string
}> {
  if (oddsCfg.sharp_report_enabled === false) {
    return { published: false, skipped: 'sharp_report_disabled' }
  }

  const best = pickBestSharpReportCandidate(candidates)
  if (!best) {
    return { published: false, skipped: 'no_qualifying_movement', candidate: null }
  }

  const maxPerDay = Number(oddsCfg.max_sharp_reports_per_day) || 4
  const { count } = await admin
    .from('lounge_bot_publish_log')
    .select('id', { count: 'exact', head: true })
    .eq('bot_user_id', bot.user_id)
    .eq('status', 'published')
    .eq('post_kind', 'sharp_report')
    .gte('created_at', dayStart)
  const acceptedToday = (count ?? 0) + await countScheduledKindToday(admin, bot.user_id, 'sharp_report', dayStart)
  if (acceptedToday >= maxPerDay) {
    return { published: false, skipped: 'daily_cap', candidate: null }
  }

  const dedupeKey = sharpReportDedupeKey(best.alert)
  if (!dryRun && await hasDedupePublishedToday(admin, bot.user_id, dedupeKey, dayStart)) {
    return { published: false, skipped: 'already_reported_today', candidate: null }
  }
  if (!dryRun && await hasPendingScheduleDedupe(admin, bot.user_id, dedupeKey)) {
    return { published: false, skipped: 'already_scheduled', candidate: null }
  }

  const caption = buildSharpReportCaption(best)
  const meta = {
    sportKey: best.sportKey,
    eventId: best.alert.eventId,
    kind: best.alert.kind,
    movementScore: best.movementScore,
  }

  if (dryRun) {
    return {
      published: false,
      candidate: meta,
      captionPreview: caption.slice(0, 400),
    }
  }

  const pills = bot.category_pills_default?.length ? bot.category_pills_default : ['sports']
  const subscriberOnly = resolveAlertSubscriberOnly('sharp_report', oddsCfg.alert_audience)
  const minGap = Number(oddsCfg.min_post_gap_minutes) || DEFAULT_MIN_POST_GAP_MINUTES
  const result = await submitLoungeBotAlertPost(admin, {
    botUserId: bot.user_id,
    caption,
    categoryPills: pills,
    subscriberOnly,
    postKind: 'sharp_report',
    dedupeKey,
    score: best.movementScore,
    minGapMinutes: minGap,
  })

  if (result.accepted) {
    return { published: false, scheduled: true, candidate: meta }
  }

  if (result.skipped) {
    return { published: false, skipped: result.skipped, candidate: meta }
  }

  await admin.from('lounge_bot_publish_log').insert({
    bot_user_id: bot.user_id,
    caption,
    score: best.movementScore,
    status: 'failed',
    post_kind: 'sharp_report',
    dedupe_key: dedupeKey,
    error_message: result.error?.slice(0, 400),
  })

  return { published: false, skipped: 'schedule_failed', candidate: meta }
}
