/**
 * NFL VIP ops satellites (not the Friday house slate):
 * - Wed: TNF lean + injury watch → VIP only
 * - Sat: adds/kills stub → VIP only when a lock flipped or starter shock
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { shortDisplayName, filterOddsEventsForNextFootballSlate, type OddsEvent } from './loungeBotOddsCaption.ts'
import { fetchSportOdds } from './loungeBotOddsRun.ts'
import { publishBotSubChatMessage } from './loungeBotSubChatPublish.ts'
import { findPrimetimeGameCandidate } from './loungeBotPrimetimeSpotlight.ts'
import { fetchGameInjuryPval } from './loungeBotInjuryPval.ts'
import { resolveSideModifiersForSlate } from './loungeBotSideModifier.ts'

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
  opts?: { dryRun?: boolean },
): Promise<{ ok: boolean; skipped?: string; dryRun?: boolean; captionPreview?: string }> {
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
    `_Not the Friday house card. TNF package locks Thursday · full desks drop with the primetime spotlight._`,
  ].join('\n')

  if (dryRun) {
    return { ok: true, dryRun: true, captionPreview: caption }
  }

  const vip = await publishBotSubChatMessage(admin, {
    botUserId,
    caption,
  })
  if (vip.error || !vip.messageId) {
    return { ok: false, skipped: vip.error || 'vip_publish_failed' }
  }

  await markPublished(admin, botUserId, dedupeKey, caption, 'nfl_wed_tnf_vip')
  return { ok: true, captionPreview: caption.slice(0, 280) }
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
  opts?: { dryRun?: boolean },
): Promise<{ ok: boolean; skipped?: string; dryRun?: boolean; changeCount?: number; captionPreview?: string }> {
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

  const vip = await publishBotSubChatMessage(admin, {
    botUserId,
    caption,
  })
  if (vip.error || !vip.messageId) {
    return { ok: false, skipped: vip.error || 'vip_publish_failed', changeCount: unique.length }
  }

  await markPublished(admin, botUserId, dedupeKey, caption, 'nfl_sat_vip_adds_kills')
  return { ok: true, changeCount: unique.length, captionPreview: caption.slice(0, 280) }
}
