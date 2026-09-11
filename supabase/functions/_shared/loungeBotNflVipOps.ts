/**
 * NFL VIP ops satellites (not the Friday house lean):
 * - Wed: TNF lean + injury watch → VIP only
 * - Sat evening: steam confirm / kill on Friday leans
 * - Legacy Sat 10am adds/kills stub kept for Ops
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { shortDisplayName, filterOddsEventsForNextFootballSlate, type OddsEvent } from './loungeBotOddsCaption.ts'
import { fetchSportOdds } from './loungeBotOddsRun.ts'
import {
  fanOutMissedAll,
  fanOutSyndicatePublish,
  fanOutVipOnlyCaption,
  resolvePublishDestinations,
} from './loungeBotPublishDestinations.ts'
import { findPrimetimeGameCandidate } from './loungeBotPrimetimeSpotlight.ts'
import { fetchGameInjuryPval } from './loungeBotInjuryPval.ts'
import { resolveSideModifiersForSlate } from './loungeBotSideModifier.ts'
import { lineWalkedAgainst } from './loungeBotPrimetimeLock.ts'
import { resolveSlatePublisher } from './loungeBotSyndicateIdentity.ts'

function ptDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function normalizeTeam(s: string): string {
  return String(s || '').trim().toLowerCase()
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

async function alreadyPostedDedupe(
  admin: SupabaseClient,
  botUserId: string,
  dedupeKey: string,
): Promise<boolean> {
  const { data } = await admin
    .from('lounge_bot_publish_log')
    .select('id')
    .eq('bot_user_id', botUserId)
    .eq('dedupe_key', dedupeKey)
    .eq('status', 'published')
    .maybeSingle()
  return Boolean(data?.id)
}

async function markPublished(
  admin: SupabaseClient,
  botUserId: string,
  dedupeKey: string,
  caption: string,
  postKind: string,
): Promise<void> {
  await admin.from('lounge_bot_publish_log').insert({
    bot_user_id: botUserId,
    caption: caption.slice(0, 500),
    status: 'published',
    post_kind: postKind,
    dedupe_key: dedupeKey,
  })
}

/**
 * Wednesday VIP: TNF lean + injury watch (no public Lounge post).
 */
export async function runNflWedTnfVipNote(
  admin: SupabaseClient,
  botUserId: string,
  opts?: { dryRun?: boolean; destinations?: unknown },
): Promise<{ ok: boolean; skipped?: string; dryRun?: boolean; captionPreview?: string; xWarning?: string; tweetId?: string | null; postId?: string }> {
  const dryRun = opts?.dryRun === true
  const day = ptDateKey()
  const dedupeKey = `nfl_wed_tnf_vip:${day}`

  if (!dryRun && await alreadyPostedDedupe(admin, botUserId, dedupeKey)) {
    return { ok: true, skipped: 'already_posted_today' }
  }

  let oddsData: { events?: OddsEvent[] }
  try {
    oddsData = await fetchSportOdds('americanfootball_nfl', ['us'], ['spreads', 'totals'])
  } catch (e) {
    return { ok: false, skipped: `odds_fetch_failed:${e}` }
  }

  const events = filterOddsEventsForNextFootballSlate(oddsData?.events || [])
  const spotlight = await findPrimetimeGameCandidate(admin, events, 'TNF')
  if (!spotlight || spotlight.primetimeType !== 'TNF') {
    return { ok: true, skipped: 'no_tnf_on_board' }
  }

  const injuries = await fetchGameInjuryPval(
    spotlight.sportKey,
    spotlight.homeTeam,
    spotlight.awayTeam,
    spotlight.commenceTime,
    admin,
  )

  const scott = spotlight.personaLeans?.Scott?.lineDisplay || spotlight.consensusPick?.lineDisplay || 'lean TBD'
  const away = shortDisplayName(spotlight.awayTeam)
  const home = shortDisplayName(spotlight.homeTeam)
  const injuryLine = injuries?.summaryLine?.trim()
    || 'No material PVAL shock on the board yet … watch inactives Thursday.'

  const caption = [
    `🔒 **Sharpe VIP · Wed TNF Watch**`,
    `${away} @ ${home}`,
    '',
    `Early lean: **${scott}**`,
    `Injury watch: ${injuryLine}`,
    '',
    `_TNF package locks Thursday · full desks drop with the primetime spotlight._`,
  ].join('\n')

  if (dryRun) {
    return { ok: true, dryRun: true, captionPreview: caption }
  }

  const fan = await fanOutVipOnlyCaption({
    admin,
    botUserId,
    destinations: opts?.destinations,
    caption,
  })
  if (fan.dest.loungePublic && fan.error) {
    return { ok: false, skipped: fan.error, xWarning: fan.xWarning }
  }
  if (fanOutMissedAll(fan)) {
    return { ok: false, skipped: fan.error || fan.vipChatWarning || fan.xWarning || 'vip_publish_failed', xWarning: fan.xWarning }
  }

  await markPublished(admin, botUserId, dedupeKey, caption, 'nfl_wed_tnf_vip')
  return {
    ok: true,
    captionPreview: caption.slice(0, 280),
    postId: fan.publicPostId || undefined,
    tweetId: fan.tweetId,
    ...(fan.xWarning ? { xWarning: fan.xWarning } : {}),
  }
}

type LockFlip = {
  away: string
  home: string
  reason: 'lock_flip' | 'starter_shock'
  detail: string
}

/**
 * Saturday VIP stub: only fires when a Friday lock flipped or a starter shock hit.
 */
export async function runNflSatVipAddsKills(
  admin: SupabaseClient,
  botUserId: string,
  opts?: { dryRun?: boolean; destinations?: unknown },
): Promise<{ ok: boolean; skipped?: string; dryRun?: boolean; changeCount?: number; captionPreview?: string; xWarning?: string; tweetId?: string | null; postId?: string }> {
  const dryRun = opts?.dryRun === true
  const day = ptDateKey()
  const dedupeKey = `nfl_sat_vip_adds_kills:${day}`

  if (!dryRun && await alreadyPostedDedupe(admin, botUserId, dedupeKey)) {
    return { ok: true, skipped: 'already_posted_today' }
  }

  const since = new Date(Date.now() - 5 * 86_400_000).toISOString()
  const { data: locks, error: lockErr } = await admin
    .from('lounge_bot_picks')
    .select('id, event_id, home_team, away_team, pick_name, pick_line, commence_time, metadata, created_at')
    .eq('bot_user_id', botUserId)
    .eq('status', 'pending')
    .eq('picker_name', 'Scott')
    .eq('market_key', 'spreads')
    .in('sport_key', ['americanfootball_nfl', 'americanfootball_nfl_preseason'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(40)

  if (lockErr) return { ok: false, skipped: lockErr.message }
  if (!locks?.length) return { ok: true, skipped: 'no_friday_locks' }

  // Dedupe by event_id (latest Scott lock wins)
  const byEvent = new Map<string, (typeof locks)[0]>()
  for (const row of locks) {
    const eid = String(row.event_id || '')
    if (!eid || byEvent.has(eid)) continue
    byEvent.set(eid, row)
  }

  let oddsData: { events?: OddsEvent[] }
  try {
    oddsData = await fetchSportOdds('americanfootball_nfl', ['us'], ['spreads'])
  } catch (e) {
    return { ok: false, skipped: `odds_fetch_failed:${e}` }
  }

  const events = filterOddsEventsForNextFootballSlate(oddsData?.events || [])
  const eventById = new Map(events.map((e) => [String(e.id), e]))
  const sideMods = await resolveSideModifiersForSlate(admin, 'americanfootball_nfl', events)

  const changes: LockFlip[] = []

  for (const [eventId, lock] of byEvent) {
    const ev = eventById.get(eventId)
    if (!ev) continue

    const lockedTeam = normalizeTeam(String(lock.pick_name || ''))
    const home = normalizeTeam(ev.home_team)
    const away = normalizeTeam(ev.away_team)
    const lockedHome = lockedTeam === home || lockedTeam.includes(home) || home.includes(lockedTeam)
    const lockedAway = lockedTeam === away || lockedTeam.includes(away) || away.includes(lockedTeam)
    if (!lockedHome && !lockedAway) continue

    const lockedSideHome = lockedHome
    const currentHomeSpread = homeSpreadFromEvent(ev)
    const lockedLine = lock.pick_line != null ? Number(lock.pick_line) : null

    // Flip: market now prices the other side as the better number vs our lock
    // Simple shop rule: if we locked home and home spread worsened by ≥1.5 vs lock line, or vice versa.
    let flipped = false
    let flipDetail = ''
    if (currentHomeSpread != null && lockedLine != null && Number.isFinite(lockedLine)) {
      if (lockedSideHome) {
        // Locked home at lockedLine (home spread). Worse = more negative / harder to cover.
        if (currentHomeSpread <= lockedLine - 1.5) {
          flipped = true
          flipDetail = `Home number moved ${lockedLine} → ${currentHomeSpread} (against lock)`
        }
      } else {
        // Locked away: away spread ≈ -homeSpread. Worse for away = home spread rose (favorite shortened the other way).
        const lockedAwaySpread = -lockedLine
        const currentAwaySpread = -currentHomeSpread
        if (currentAwaySpread <= lockedAwaySpread - 1.5) {
          flipped = true
          flipDetail = `Away number moved ${lockedAwaySpread} → ${currentAwaySpread} (against lock)`
        }
      }
    }

    // Also treat "consensus books now price opposite favorite" as a soft kill when line crossed 0 vs our side.
    if (!flipped && currentHomeSpread != null) {
      if (lockedSideHome && currentHomeSpread > 0) {
        flipped = true
        flipDetail = `Market flipped … home now dog (+${currentHomeSpread}) vs our home lock`
      } else if (!lockedSideHome && currentHomeSpread < 0) {
        flipped = true
        flipDetail = `Market flipped … away now dog vs our away lock (home ${currentHomeSpread})`
      }
    }

    if (flipped) {
      changes.push({
        away: String(lock.away_team),
        home: String(lock.home_team),
        reason: 'lock_flip',
        detail: flipDetail,
      })
    }

    const mod = sideMods.get(eventId)
    if (mod?.isSignificant) {
      changes.push({
        away: String(lock.away_team),
        home: String(lock.home_team),
        reason: 'starter_shock',
        detail: mod.reason || 'Significant side modifier / injury shock vs Friday lock',
      })
    }
  }

  // Unique by matchup+reason
  const seen = new Set<string>()
  const unique = changes.filter((c) => {
    const k = `${c.reason}:${normalizeTeam(c.away)}@${normalizeTeam(c.home)}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  if (!unique.length) {
    return { ok: true, skipped: 'no_adds_or_kills', changeCount: 0 }
  }

  const lines = [
    `🔒 **Sharpe VIP · Sat Adds / Kills**`,
    `Only posting because something real moved since the Friday lock.`,
    '',
  ]
  for (const c of unique) {
    const tag = c.reason === 'lock_flip' ? 'KILL / REVISIT' : 'STARTER SHOCK'
    lines.push(
      `• **${tag}** ${shortDisplayName(c.away)} @ ${shortDisplayName(c.home)}`,
      `  ${c.detail}`,
    )
  }
  lines.push('', `_No new Saturday slate. Friday stays the house._`)

  const caption = lines.join('\n')
  if (dryRun) {
    return { ok: true, dryRun: true, changeCount: unique.length, captionPreview: caption }
  }

  const fan = await fanOutVipOnlyCaption({
    admin,
    botUserId,
    destinations: opts?.destinations,
    caption,
  })
  if (fan.dest.loungePublic && fan.error) {
    return { ok: false, skipped: fan.error, changeCount: unique.length, xWarning: fan.xWarning }
  }
  if (fanOutMissedAll(fan)) {
    return {
      ok: false,
      skipped: fan.error || fan.vipChatWarning || fan.xWarning || 'vip_publish_failed',
      changeCount: unique.length,
      xWarning: fan.xWarning,
    }
  }

  await markPublished(admin, botUserId, dedupeKey, caption, 'nfl_sat_vip_adds_kills')
  return {
    ok: true,
    changeCount: unique.length,
    captionPreview: caption.slice(0, 280),
    postId: fan.publicPostId || undefined,
    tweetId: fan.tweetId,
    ...(fan.xWarning ? { xWarning: fan.xWarning } : {}),
  }
}

/**
 * Saturday steam window (6-9pm PT). Always posts.
 * Confirms Friday leans or kills if the number walked / starter shock.
 * Still a lean … Sunday inactives are the lock.
 */
export async function runNflSatSteam(
  admin: SupabaseClient,
  botUserId: string,
  opts?: { dryRun?: boolean; destinations?: unknown },
): Promise<{
  ok: boolean
  skipped?: string
  dryRun?: boolean
  killCount?: number
  standCount?: number
  captionPreview?: string
  previewCaption?: string
  vipPreviewCaption?: string
  xWarning?: string
  tweetId?: string | null
  publicPostId?: string
}> {
  const dryRun = opts?.dryRun === true
  const day = ptDateKey()
  const dedupeKey = `nfl_sat_steam:${day}`

  if (!dryRun && await alreadyPostedDedupe(admin, botUserId, dedupeKey)) {
    return { ok: true, skipped: 'already_posted_today' }
  }

  const publisher = await resolveSlatePublisher(admin, botUserId)
  const since = new Date(Date.now() - 5 * 86_400_000).toISOString()
  const { data: locks, error: lockErr } = await admin
    .from('lounge_bot_picks')
    .select('id, event_id, home_team, away_team, pick_name, pick_line, picker_name, commence_time, metadata, created_at')
    .eq('bot_user_id', publisher.botUserId)
    .eq('status', 'pending')
    .eq('picker_name', 'Scott')
    .eq('market_key', 'spreads')
    .in('sport_key', ['americanfootball_nfl', 'americanfootball_nfl_preseason'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(40)

  if (lockErr) return { ok: false, skipped: lockErr.message }
  if (!locks?.length) return { ok: true, skipped: 'no_friday_leans' }

  const byEvent = new Map<string, (typeof locks)[0]>()
  for (const row of locks) {
    const eid = String(row.event_id || '')
    if (!eid || byEvent.has(eid)) continue
    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {}
    if (meta.is_primetime_spotlight === true) continue
    byEvent.set(eid, row)
  }

  let oddsData: { events?: OddsEvent[] }
  try {
    oddsData = await fetchSportOdds('americanfootball_nfl', ['us'], ['spreads'])
  } catch (e) {
    return { ok: false, skipped: `odds_fetch_failed:${e}` }
  }

  const events = filterOddsEventsForNextFootballSlate(oddsData?.events || [])
  const eventById = new Map(events.map((e) => [String(e.id), e]))
  const sideMods = await resolveSideModifiersForSlate(admin, 'americanfootball_nfl', events)

  const stands: string[] = []
  const kills: Array<{ eventId: string; pickId: string; line: string; why: string }> = []

  for (const [eventId, lock] of byEvent) {
    const ev = eventById.get(eventId)
    if (!ev) continue
    const lockedTeam = normalizeTeam(String(lock.pick_name || ''))
    const home = normalizeTeam(ev.home_team)
    const away = normalizeTeam(ev.away_team)
    const lockedHome = lockedTeam === home || lockedTeam.includes(home) || home.includes(lockedTeam)
    const side = lockedHome ? 'home' : 'away'
    const currentHomeSpread = homeSpreadFromEvent(ev)
    const lockedLine = lock.pick_line != null ? Number(lock.pick_line) : null
    const walk = lineWalkedAgainst('spreads', side, lockedLine, currentHomeSpread, null)
    const mod = sideMods.get(eventId)
    const reasons: string[] = []
    if (walk.against) reasons.push(walk.note)
    if (mod?.isSignificant) reasons.push(mod.reason || 'Starter shock vs Friday lean')

    const awayShort = shortDisplayName(String(lock.away_team))
    const homeShort = shortDisplayName(String(lock.home_team))
    const lineDisp = lockedLine == null
      ? `${lockedHome ? homeShort : awayShort}`
      : `${lockedHome ? homeShort : awayShort} ${lockedLine > 0 ? `+${lockedLine}` : lockedLine}`

    if (reasons.length) {
      kills.push({
        eventId,
        pickId: String(lock.id),
        line: `${awayShort} @ ${homeShort} · ${lineDisp}`,
        why: reasons.join(' · '),
      })
    } else {
      stands.push(`${awayShort} @ ${homeShort} · **${lineDisp}**`)
    }
  }

  if (!stands.length && !kills.length) {
    return { ok: true, skipped: 'no_live_leans_to_check' }
  }

  const lines = [
    `🌫️ **Saturday Steam · Sunday leans**`,
    `Friday stays a lean. This is the steam check. Official lock is Sunday inactives.`,
    '',
  ]
  if (stands.length) {
    lines.push('**STANDS**')
    for (const row of stands) lines.push(`• ${row}`)
    lines.push('')
  }
  if (kills.length) {
    lines.push('**KILL**')
    for (const row of kills) lines.push(`• ${row.line}`, `  ${row.why}`)
    lines.push('')
  }
  lines.push(`*Still a lean. Early window locks ~8:30am PT. Late window ~11:30am PT.*`)
  const caption = lines.join('\n')

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      killCount: kills.length,
      standCount: stands.length,
      captionPreview: caption,
      previewCaption: caption,
      vipPreviewCaption: caption,
    }
  }

  const dest = resolvePublishDestinations(opts?.destinations, {
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
    categoryPills: ['sports'],
  })
  if (dest.loungePublic && fan.error) {
    return { ok: false, skipped: fan.error, xWarning: fan.xWarning }
  }
  if (fanOutMissedAll(fan)) {
    return {
      ok: false,
      skipped: fan.error || fan.vipChatWarning || fan.xWarning || 'steam_publish_failed',
      xWarning: fan.xWarning,
    }
  }

  for (const kill of kills) {
    const { data } = await admin.from('lounge_bot_picks').select('id, metadata, event_id').eq('event_id', kill.eventId).eq('bot_user_id', publisher.botUserId).eq('status', 'pending')
    for (const row of data || []) {
      const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {}
      if (meta.is_primetime_spotlight === true) continue
      await admin.from('lounge_bot_picks').update({
        status: 'cancelled',
        metadata: { ...meta, slate_steam: 'kill', steam_why: kill.why },
      }).eq('id', row.id)
    }
  }

  await markPublished(admin, publisher.botUserId, dedupeKey, caption, 'nfl_sat_steam')
  return {
    ok: true,
    killCount: kills.length,
    standCount: stands.length,
    captionPreview: caption,
    previewCaption: caption,
    publicPostId: fan.publicPostId || undefined,
    tweetId: fan.tweetId,
    ...(fan.xWarning ? { xWarning: fan.xWarning } : {}),
  }
}
