/**
 * Sunday NFL house locks by kickoff window.
 * Friday slate is a lean. Saturday steam confirms or kills.
 * These drops lock (or pass) on 90-min inactives … same rule as TNF.
 * Early = before 1pm PT (1pm ET cluster). Late = 1pm–4pm PT (4:05/4:25 ET).
 * SNF stays on nfl_primetime_lock.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { formatOddsCommenceTimeShort, shortDisplayName, type OddsEvent } from './loungeBotOddsCaption.ts'
import { fetchGameInjuryPval } from './loungeBotInjuryPval.ts'
import { resolveSlatePublisher } from './loungeBotSyndicateIdentity.ts'
import {
  fanOutSyndicatePublish,
  resolvePublishDestinations,
} from './loungeBotPublishDestinations.ts'
import {
  inPrimetimeLockWindow,
  lineWalkedAgainst,
  listedStarterShocks,
  LOCK_MAX_BEFORE_KICK,
  LOCK_MIN_BEFORE_KICK,
  minutesUntilKick,
} from './loungeBotPrimetimeLock.ts'

export type SundayLockWindow = 'early' | 'late'
export type SundayLockVerdict = 'lock' | 'kill'

export type SundayLockGame = {
  eventId: string
  homeTeam: string
  awayTeam: string
  commenceTime: string
  leanPickIds: string[]
  leanLineDisplay: string
  leanSide: 'home' | 'away'
  leanLine: number | null
  currentLine: number | null
  minutesToKick: number
  inWindow: boolean
  verdict: SundayLockVerdict
  reasons: string[]
  numberNote: string
  injuryNote: string
}

type LeanRow = {
  id: string
  pick_name: string | null
  pick_line: number | null
  pickerName: string
  metadata: Record<string, unknown>
}

function ptHourAndDow(iso: string): { hour: number; dow: number } | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(d)
  const weekday = parts.find((p) => p.type === 'weekday')?.value || ''
  const hour = Number(parts.find((p) => p.type === 'hour')?.value)
  if (!Number.isFinite(hour)) return null
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { hour, dow: dowMap[weekday] ?? -1 }
}

export function classifySundayKickWindow(commenceTimeIso: string): SundayLockWindow | 'primetime' | null {
  const pt = ptHourAndDow(commenceTimeIso)
  if (!pt || pt.dow !== 0) return null
  if (pt.hour >= 16) return 'primetime'
  if (pt.hour >= 13) return 'late'
  return 'early'
}

function homeSpreadFromEvent(ev: OddsEvent): number | null {
  const home = ev.home_team
  for (const b of ev.bookmakers || []) {
    const sm = b.markets?.find((m) => m.key === 'spreads')
    const h = sm?.outcomes?.find((o) => o.name === home)
    if (h?.point != null && Number.isFinite(Number(h.point))) return Number(h.point)
  }
  return null
}

function postKind(window: SundayLockWindow): string {
  return window === 'early' ? 'nfl_sunday_early_lock' : 'nfl_sunday_late_lock'
}

async function alreadyPostedLock(
  admin: SupabaseClient,
  botUserId: string,
  window: SundayLockWindow,
  eventId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('lounge_bot_publish_log')
    .select('id')
    .eq('bot_user_id', botUserId)
    .eq('dedupe_key', `${postKind(window)}:${eventId}`)
    .eq('status', 'published')
    .maybeSingle()
  return Boolean(data?.id)
}

async function loadSlateLeans(
  admin: SupabaseClient,
  botUserId: string,
  eventId: string,
): Promise<LeanRow[]> {
  const { data } = await admin
    .from('lounge_bot_picks')
    .select('id, pick_name, pick_line, market_key, metadata, picker_name, status')
    .eq('bot_user_id', botUserId)
    .eq('event_id', eventId)
    .eq('status', 'pending')
    .eq('market_key', 'spreads')
    .in('sport_key', ['americanfootball_nfl', 'americanfootball_nfl_preseason'])
    .order('created_at', { ascending: false })
    .limit(12)
  const out: LeanRow[] = []
  for (const row of data || []) {
    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {}
    if (meta.is_primetime_spotlight === true) continue
    if (meta.slate_lock === 'lock' || meta.slate_lock === 'kill') continue
    if (meta.slate_steam === 'kill') continue
    out.push({
      id: String(row.id),
      pick_name: row.pick_name,
      pick_line: row.pick_line != null ? Number(row.pick_line) : null,
      pickerName: String(row.picker_name || ''),
      metadata: meta,
    })
  }
  return out
}

function houseLean(rows: LeanRow[], homeTeam: string, awayTeam: string): {
  side: 'home' | 'away'
  line: number | null
  display: string
  ids: string[]
} | null {
  if (!rows.length) return null
  const scott = rows.find((r) => r.pickerName === 'Scott') || rows[0]
  const pickName = String(scott.pick_name || '')
  const home = homeTeam.toLowerCase()
  const away = awayTeam.toLowerCase()
  const token = pickName.toLowerCase()
  const side: 'home' | 'away' = token === home || token.includes(home) || home.includes(token) ? 'home' : 'away'
  const team = side === 'home' ? homeTeam : awayTeam
  const line = scott.pick_line
  const disp = line == null
    ? shortDisplayName(team)
    : `${shortDisplayName(team)} ${line > 0 ? `+${line}` : line}`
  return { side, line, display: disp, ids: rows.map((r) => r.id) }
}

export function formatSundayWindowLockCaption(
  window: SundayLockWindow,
  games: SundayLockGame[],
): string {
  const label = window === 'early' ? 'Sunday Early Lock · 1pm ET window' : 'Sunday Late Lock · 4pm ET window'
  const lines = [`🔒 **${label}**`, '']
  for (const g of games) {
    const away = shortDisplayName(g.awayTeam)
    const home = shortDisplayName(g.homeTeam)
    const when = formatOddsCommenceTimeShort(g.commenceTime)
    if (g.verdict === 'kill') {
      lines.push(`🚫 **KILL** ${away} @ ${home} · ${when}`)
      lines.push(`Lean was: **${g.leanLineDisplay}**`)
      lines.push(`Why: ${g.reasons.join(' · ')}`)
    } else {
      lines.push(`🔒 **LOCK** ${away} @ ${home} · ${when}`)
      lines.push(`Lean stands: **${g.leanLineDisplay}**`)
      lines.push(`Number: ${g.numberNote}`)
    }
    if (g.injuryNote) lines.push(`🩹 ${g.injuryNote}`)
    lines.push('')
  }
  lines.push(
    `*Official lock for this window. Desks stay as written. No recut unless a listed starter is out or the number walks a half-point that kills CLV.*`,
  )
  return lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n').trim()
}

export type SundayLockPublishResult = {
  ok: boolean
  dryRun?: boolean
  skipped?: string
  window: SundayLockWindow
  games?: SundayLockGame[]
  captionPreview?: string
  previewCaption?: string
  vipPreviewCaption?: string
  publicPostId?: string | null
  tweetId?: string | null
  xWarning?: string
  vipChatWarning?: string
  error?: string
}

export async function publishSundayWindowLock(
  admin: SupabaseClient,
  botUserId: string,
  events: OddsEvent[],
  opts: {
    window: SundayLockWindow
    dryRun?: boolean
    destinations?: unknown
    requireWindow?: boolean
    categoryPills?: string[]
  },
): Promise<SundayLockPublishResult> {
  const window = opts.window
  const publisher = await resolveSlatePublisher(admin, botUserId)
  const games: SundayLockGame[] = []

  for (const ev of events) {
    const eventId = String(ev.id || '').trim()
    const homeTeam = String(ev.home_team || '').trim()
    const awayTeam = String(ev.away_team || '').trim()
    const commenceTime = String(ev.commence_time || '').trim()
    if (!eventId || !homeTeam || !awayTeam || !commenceTime) continue
    if (classifySundayKickWindow(commenceTime) !== window) continue

    const mins = minutesUntilKick(commenceTime)
    const inWindow = inPrimetimeLockWindow(commenceTime)
    if (opts.requireWindow && !inWindow) continue
    if (!opts.dryRun && await alreadyPostedLock(admin, publisher.botUserId, window, eventId)) continue

    const leans = await loadSlateLeans(admin, publisher.botUserId, eventId)
    const house = houseLean(leans, homeTeam, awayTeam)
    if (!house) continue

    const injuries = await fetchGameInjuryPval(
      'americanfootball_nfl',
      homeTeam,
      awayTeam,
      commenceTime,
      admin,
    ).catch(() => null)

    const ourTeam = house.side === 'home' ? homeTeam : awayTeam
    const starterHits = listedStarterShocks(injuries, ourTeam)
    const currentHomeSpread = homeSpreadFromEvent(ev)
    const walk = lineWalkedAgainst('spreads', house.side, house.line, currentHomeSpread, null)
    const reasons: string[] = []
    if (starterHits.length) reasons.push(`Listed starter out: ${starterHits.join(', ')}`)
    if (walk.against) reasons.push(`Number walked off the edge (${walk.note})`)

    games.push({
      eventId,
      homeTeam,
      awayTeam,
      commenceTime,
      leanPickIds: house.ids,
      leanLineDisplay: house.display,
      leanSide: house.side,
      leanLine: house.line,
      currentLine: house.side === 'home' ? currentHomeSpread : (currentHomeSpread != null ? -currentHomeSpread : null),
      minutesToKick: mins,
      inWindow,
      verdict: reasons.length ? 'kill' : 'lock',
      reasons,
      numberNote: walk.confirm && !walk.against
        ? `${walk.note} … steam confirmed our side`
        : walk.note,
      injuryNote: injuries?.summaryLine || 'No listed-starter shock on the inactive list.',
    })
  }

  if (!games.length) {
    const tooEarly = opts.requireWindow
      ? `No ${window} window games in the ${LOCK_MAX_BEFORE_KICK}-${LOCK_MIN_BEFORE_KICK} min lock window.`
      : `No pending Friday leans for the Sunday ${window} window.`
    return { ok: true, skipped: tooEarly, window, dryRun: opts.dryRun === true }
  }

  const caption = formatSundayWindowLockCaption(window, games)

  if (opts.dryRun) {
    return {
      ok: true,
      dryRun: true,
      window,
      games,
      captionPreview: caption,
      previewCaption: caption,
      vipPreviewCaption: caption,
    }
  }

  const dest = resolvePublishDestinations(opts.destinations, {
    loungePublic: true,
    loungeFanOnly: false,
    vipChat: true,
    x: false,
  })
  dest.loungeFanOnly = false

  const fan = await fanOutSyndicatePublish({
    admin,
    botUserId: publisher.botUserId,
    dest,
    publicCaption: caption,
    vipCaption: caption,
    categoryPills: opts.categoryPills?.length ? opts.categoryPills : ['sports'],
  })

  if (dest.loungePublic && fan.error) {
    return { ok: false, error: fan.error, window, games, xWarning: fan.xWarning }
  }

  for (const g of games) {
    for (const pickId of g.leanPickIds) {
      const { data } = await admin.from('lounge_bot_picks').select('metadata').eq('id', pickId).maybeSingle()
      const meta = data?.metadata && typeof data.metadata === 'object'
        ? data.metadata as Record<string, unknown>
        : {}
      await admin
        .from('lounge_bot_picks')
        .update({
          ...(g.verdict === 'kill' ? { status: 'cancelled' } : {}),
          metadata: {
            ...meta,
            slate_lock: g.verdict,
            lock_reasons: g.reasons,
            lock_number_note: g.numberNote,
          },
        })
        .eq('id', pickId)
    }
    await admin.from('lounge_bot_publish_log').insert({
      bot_user_id: publisher.botUserId,
      caption: caption.slice(0, 500),
      status: 'published',
      post_kind: postKind(window),
      dedupe_key: `${postKind(window)}:${g.eventId}`,
    })
  }

  return {
    ok: true,
    window,
    games,
    captionPreview: caption,
    previewCaption: caption,
    publicPostId: fan.publicPostId,
    tweetId: fan.tweetId,
    ...(fan.xWarning ? { xWarning: fan.xWarning } : {}),
    ...(fan.vipChatWarning ? { vipChatWarning: fan.vipChatWarning } : {}),
  }
}
