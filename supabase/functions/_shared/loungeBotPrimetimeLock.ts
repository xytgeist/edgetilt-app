/**
 * Primetime inactives lock (90 min pre). Follows the lean card.
 * Confirm the written desks, or kill (pass) if a listed starter is out
 * or the number walked off the edge. Never invent a new pick.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { formatOddsCommenceTimeShort, shortDisplayName, type OddsEvent } from './loungeBotOddsCaption.ts'
import { fetchGameInjuryPval, type GameInjurySummary } from './loungeBotInjuryPval.ts'
import {
  findPrimetimeGameCandidate,
  type PrimetimeSpotlightGame,
} from './loungeBotPrimetimeSpotlight.ts'
import { resolveSlatePublisher } from './loungeBotSyndicateIdentity.ts'
import {
  fanOutSyndicatePublish,
  resolvePublishDestinations,
} from './loungeBotPublishDestinations.ts'
import { X_LONG_FORM_CHARS } from './loungeBotXPublish.ts'

export const LOCK_MIN_BEFORE_KICK = 70
export const LOCK_MAX_BEFORE_KICK = 110
export const LINE_WALK_PTS = 1.5
const POST_KIND = 'nfl_primetime_lock'

export type PrimetimeLockVerdict = 'lock' | 'kill'

export type PrimetimeLockEval = {
  spotlight: PrimetimeSpotlightGame
  leanPickId: string
  leanLineDisplay: string
  leanSide: string
  marketKey: 'spreads' | 'totals'
  currentLine: number | null
  leanLine: number | null
  minutesToKick: number
  inWindow: boolean
  verdict: PrimetimeLockVerdict
  reasons: string[]
  numberNote: string
  injuryNote: string
}

type LeanPickRow = {
  id: string
  pick_name: string | null
  pick_line: number | null
  market_key: string | null
  metadata: Record<string, unknown> | null
}

export function isListedStarterPos(pos: string): boolean {
  const p = String(pos || '').trim().toUpperCase()
  if (p === 'QB') return true
  if (p === 'LT' || p === 'RT' || p === 'OT' || p === 'T') return true
  if (p.includes('TACKLE') && !p.includes('DEF')) return true
  if (p === 'EDGE' || p === 'DE' || p === 'OLB' || p.includes('EDGE')) return true
  if (p === 'RB' || p === 'HB') return true
  return false
}

export function minutesUntilKick(commenceTimeIso: string, now = new Date()): number {
  const kick = new Date(commenceTimeIso).getTime()
  if (!Number.isFinite(kick)) return NaN
  return (kick - now.getTime()) / 60000
}

export function inPrimetimeLockWindow(commenceTimeIso: string, now = new Date()): boolean {
  const mins = minutesUntilKick(commenceTimeIso, now)
  return Number.isFinite(mins) && mins >= LOCK_MIN_BEFORE_KICK && mins <= LOCK_MAX_BEFORE_KICK
}

export function listedStarterShocks(injuries: GameInjurySummary | null, teamName: string): string[] {
  if (!injuries) return []
  const report = injuries.homeTeam === teamName ? injuries.homeReport : injuries.awayReport
  const hits: string[] = []
  for (const a of report?.keyAbsences || []) {
    if (!isListedStarterPos(a.pos)) continue
    hits.push(`${a.name} (${a.pos} ${a.status})`)
  }
  return hits
}

export function lineWalkedAgainst(
  marketKey: 'spreads' | 'totals',
  leanSide: string,
  leanLine: number | null,
  currentHomeSpread: number | null,
  currentTotal: number | null,
): { against: boolean; confirm: boolean; note: string } {
  if (leanLine == null || !Number.isFinite(leanLine)) {
    return { against: false, confirm: false, note: 'No lean line on file.' }
  }
  if (marketKey === 'totals') {
    if (currentTotal == null) return { against: false, confirm: false, note: 'No live total.' }
    const delta = currentTotal - leanLine
    const against = leanSide === 'over'
      ? currentTotal >= leanLine + LINE_WALK_PTS
      : currentTotal <= leanLine - LINE_WALK_PTS
    const confirm = leanSide === 'over' ? delta <= -0.5 : delta >= 0.5
    return {
      against,
      confirm,
      note: `Total ${leanLine} → ${currentTotal}`,
    }
  }
  if (currentHomeSpread == null) return { against: false, confirm: false, note: 'No live spread.' }
  const currentLeanLine = leanSide === 'home' ? currentHomeSpread : -currentHomeSpread
  const against = currentLeanLine <= leanLine - LINE_WALK_PTS
  const confirm = currentLeanLine >= leanLine + 0.5
  return {
    against,
    confirm,
    note: `Number ${leanLine} → ${currentLeanLine}`,
  }
}

async function alreadyPostedLock(
  admin: SupabaseClient,
  botUserId: string,
  eventId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('lounge_bot_publish_log')
    .select('id')
    .eq('bot_user_id', botUserId)
    .eq('dedupe_key', `${POST_KIND}:${eventId}`)
    .eq('status', 'published')
    .maybeSingle()
  return Boolean(data?.id)
}

async function loadLeanPick(
  admin: SupabaseClient,
  botUserId: string,
  eventId: string,
): Promise<LeanPickRow | null> {
  const { data } = await admin
    .from('lounge_bot_picks')
    .select('id, pick_name, pick_line, market_key, metadata')
    .eq('bot_user_id', botUserId)
    .eq('event_id', eventId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(12)
  for (const row of data || []) {
    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {}
    if (meta.is_primetime_spotlight === true) {
      return {
        id: String(row.id),
        pick_name: row.pick_name,
        pick_line: row.pick_line != null ? Number(row.pick_line) : null,
        market_key: row.market_key,
        metadata: meta,
      }
    }
  }
  return null
}

export async function evaluatePrimetimeLock(
  admin: SupabaseClient,
  events: OddsEvent[],
  botUserId: string,
  targetType?: PrimetimeSpotlightGame['primetimeType'],
): Promise<{ eval?: PrimetimeLockEval; error?: string; skipped?: string }> {
  const spotlight = await findPrimetimeGameCandidate(admin, events, targetType)
  if (!spotlight) return { skipped: 'No eligible NFL primetime game (TNF/SNF/MNF) found on the active board.' }

  const publisher = await resolveSlatePublisher(admin, botUserId)
  const lean = await loadLeanPick(admin, publisher.botUserId, spotlight.eventId)
  if (!lean) {
    return { skipped: `No primetime lean on the ledger yet for ${shortDisplayName(spotlight.awayTeam)} @ ${shortDisplayName(spotlight.homeTeam)}.` }
  }

  const marketKey = lean.market_key === 'totals' ? 'totals' : 'spreads'
  const leanSide = String(lean.metadata?.consensus_side || '').toLowerCase()
    || (marketKey === 'totals' ? '' : '')
  const side = leanSide === 'home' || leanSide === 'away' || leanSide === 'over' || leanSide === 'under'
    ? leanSide
    : marketKey === 'totals'
      ? 'over'
      : (String(lean.pick_name || '') === spotlight.homeTeam ? 'home' : 'away')

  const ourTeam = marketKey === 'spreads'
    ? (side === 'home' ? spotlight.homeTeam : spotlight.awayTeam)
    : ''

  const injuries = await fetchGameInjuryPval(
    spotlight.sportKey,
    spotlight.homeTeam,
    spotlight.awayTeam,
    spotlight.commenceTime,
    admin,
  )

  const ourShocks = ourTeam ? listedStarterShocks(injuries, ourTeam) : []
  const anyShocks = [
    ...listedStarterShocks(injuries, spotlight.homeTeam),
    ...listedStarterShocks(injuries, spotlight.awayTeam),
  ]
  const starterHits = marketKey === 'totals' ? anyShocks : ourShocks

  const walk = lineWalkedAgainst(
    marketKey,
    side,
    lean.pick_line,
    spotlight.spreadPoint,
    spotlight.totalPoint,
  )

  const reasons: string[] = []
  if (starterHits.length) reasons.push(`Listed starter out: ${starterHits.join(', ')}`)
  if (walk.against) reasons.push(`Number walked off the edge (${walk.note})`)

  const verdict: PrimetimeLockVerdict = reasons.length ? 'kill' : 'lock'
  const mins = minutesUntilKick(spotlight.commenceTime)

  return {
    eval: {
      spotlight,
      leanPickId: lean.id,
      leanLineDisplay: String(lean.metadata?.consensus_side
        ? spotlight.consensusPick.lineDisplay
        : lean.pick_name || spotlight.consensusPick.lineDisplay),
      leanSide: side,
      marketKey,
      currentLine: marketKey === 'totals' ? spotlight.totalPoint : (
        side === 'home' ? spotlight.spreadPoint : (spotlight.spreadPoint != null ? -spotlight.spreadPoint : null)
      ),
      leanLine: lean.pick_line,
      minutesToKick: mins,
      inWindow: inPrimetimeLockWindow(spotlight.commenceTime),
      verdict,
      reasons,
      numberNote: walk.confirm && !walk.against
        ? `${walk.note} … steam confirmed our side`
        : walk.note,
      injuryNote: injuries?.summaryLine || 'No listed-starter shock on the inactive list.',
    },
  }
}

export function formatPrimetimeLockCaption(lock: PrimetimeLockEval): string {
  const homeShort = shortDisplayName(lock.spotlight.homeTeam)
  const awayShort = shortDisplayName(lock.spotlight.awayTeam)
  const kickoff = formatOddsCommenceTimeShort(lock.spotlight.commenceTime)
  const label = lock.spotlight.primetimeLabel
  const leanDisp = lock.spotlight.consensusPick.lineDisplay || lock.leanLineDisplay

  if (lock.verdict === 'kill') {
    return [
      `🚫 **${label} KILL · ${awayShort} @ ${homeShort}**`,
      `${kickoff}`,
      '',
      `Lean was: **${leanDisp}**`,
      `Why: ${lock.reasons.join(' · ')}`,
      lock.injuryNote ? `🩹 ${lock.injuryNote}` : '',
      '',
      `*Pass. Not a new pick. Desks stay as written … we do not restack after inactives.*`,
    ].filter(Boolean).join('\n')
  }

  return [
    `🔒 **${label} LOCK · ${awayShort} @ ${homeShort}**`,
    `${kickoff}`,
    '',
    `Lean stands: **${leanDisp}**`,
    `Number: ${lock.numberNote}`,
    `🩹 ${lock.injuryNote}`,
    '',
    `*Official lock. Desks stay as written. No edits after this.*`,
  ].join('\n')
}

export type PrimetimeLockPublishResult = {
  ok: boolean
  dryRun?: boolean
  skipped?: string
  verdict?: PrimetimeLockVerdict
  captionPreview?: string
  previewCaption?: string
  vipPreviewCaption?: string
  publicPostId?: string | null
  tweetId?: string | null
  xWarning?: string
  vipChatWarning?: string
  error?: string
  lock?: PrimetimeLockEval
}

export async function publishPrimetimeLock(
  admin: SupabaseClient,
  botUserId: string,
  events: OddsEvent[],
  opts?: {
    dryRun?: boolean
    destinations?: unknown
    requireWindow?: boolean
    primetimeType?: PrimetimeSpotlightGame['primetimeType']
    categoryPills?: string[]
  },
): Promise<PrimetimeLockPublishResult> {
  const publisher = await resolveSlatePublisher(admin, botUserId)
  const found = await evaluatePrimetimeLock(admin, events, publisher.botUserId, opts?.primetimeType)
  if (found.skipped || !found.eval) {
    return { ok: true, skipped: found.skipped || 'No lock candidate.', dryRun: opts?.dryRun === true }
  }
  const lock = found.eval
  const caption = formatPrimetimeLockCaption(lock)

  if (opts?.requireWindow && !lock.inWindow) {
    const mins = Math.round(lock.minutesToKick)
    return {
      ok: true,
      skipped: mins > LOCK_MAX_BEFORE_KICK
        ? `Too early for the lock (${mins} min to kick … window is ${LOCK_MAX_BEFORE_KICK}-${LOCK_MIN_BEFORE_KICK} min pre).`
        : `Past the lock window (${mins} min to kick).`,
      lock,
      captionPreview: caption,
      previewCaption: caption,
    }
  }

  if (opts?.dryRun) {
    return {
      ok: true,
      dryRun: true,
      verdict: lock.verdict,
      lock,
      captionPreview: caption,
      previewCaption: caption,
      vipPreviewCaption: caption,
    }
  }

  if (await alreadyPostedLock(admin, publisher.botUserId, lock.spotlight.eventId)) {
    return { ok: true, skipped: 'already_posted_lock', lock }
  }

  const dest = resolvePublishDestinations(opts?.destinations, {
    loungePublic: true,
    loungeFanOnly: false,
    vipChat: true,
    x: true,
  })
  dest.loungeFanOnly = false

  const fan = await fanOutSyndicatePublish({
    admin,
    botUserId: publisher.botUserId,
    dest,
    publicCaption: caption,
    vipCaption: caption,
    xCaption: caption,
    xMaxChars: X_LONG_FORM_CHARS,
    categoryPills: opts?.categoryPills?.length ? opts.categoryPills : ['sports'],
  })

  if (dest.loungePublic && fan.error) {
    return { ok: false, error: fan.error, lock, xWarning: fan.xWarning }
  }

  if (lock.verdict === 'kill') {
    await admin
      .from('lounge_bot_picks')
      .update({
        status: 'cancelled',
        metadata: {
          ...(await pickMeta(admin, lock.leanPickId)),
          primetime_lock: 'kill',
          lock_reasons: lock.reasons,
        },
      })
      .eq('id', lock.leanPickId)
  } else {
    const meta = await pickMeta(admin, lock.leanPickId)
    await admin
      .from('lounge_bot_picks')
      .update({
        metadata: {
          ...meta,
          primetime_lock: 'lock',
          lock_number_note: lock.numberNote,
        },
      })
      .eq('id', lock.leanPickId)
  }

  await admin.from('lounge_bot_publish_log').insert({
    bot_user_id: publisher.botUserId,
    caption: caption.slice(0, 500),
    status: 'published',
    post_kind: POST_KIND,
    dedupe_key: `${POST_KIND}:${lock.spotlight.eventId}`,
  })

  return {
    ok: true,
    verdict: lock.verdict,
    lock,
    captionPreview: caption,
    publicPostId: fan.publicPostId,
    tweetId: fan.tweetId,
    ...(fan.xWarning ? { xWarning: fan.xWarning } : {}),
    ...(fan.vipChatWarning ? { vipChatWarning: fan.vipChatWarning } : {}),
  }
}

async function pickMeta(
  admin: SupabaseClient,
  pickId: string,
): Promise<Record<string, unknown>> {
  const { data } = await admin
    .from('lounge_bot_picks')
    .select('metadata')
    .eq('id', pickId)
    .maybeSingle()
  return data?.metadata && typeof data.metadata === 'object'
    ? data.metadata as Record<string, unknown>
    : {}
}
