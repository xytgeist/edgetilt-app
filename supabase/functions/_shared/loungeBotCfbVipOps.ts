/**
 * CFB VIP ops satellites (mirror NFL shop skeleton):
 * - Wed: Thu/Fri night early leans → VIP only (not the Friday house card)
 * - Thu: night-game public tease (one lean + CTA) + VIP deep
 * - Sat: adds/kills stub → VIP only when a lock flipped or starter shock
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  shortDisplayName,
  filterOddsEventsForNextFootballSlate,
  formatOddsCommenceTimeShort,
  type OddsEvent,
} from './loungeBotOddsCaption.ts'
import { fetchSportOdds } from './loungeBotOddsRun.ts'
import { publishBotSubChatMessage } from './loungeBotSubChatPublish.ts'
import { publishLoungeBotPost } from './loungeBotPublish.ts'
import { resolveSideModifiersForSlate } from './loungeBotSideModifier.ts'
import { loadPastedBettingSplitsForSlate } from './loungeBotBettingSplits.ts'
import {
  loadLaneBTicketsForSport,
  refreshLaneBTicketsForSlate,
} from './loungeBotLaneBScrape.ts'
import { loadPersonaWeights } from './loungeBotPersonaAdaptive.ts'
import { loadDbTeamMetricsMap } from './loungeBotTeamMetrics.ts'
import { loadDbCfbPowerRatingsMap } from './loungeBotCfbPowerRatings.ts'
import {
  buildNflAtsSlateCard,
  type NflSlateCard,
  type SlateGamePick,
} from './loungeBotPredictivePick.ts'

const CFB_SPORT = 'americanfootball_ncaaf'

function ptDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function ptParts(iso: string): { weekday: string; hour: number } {
  const d = new Date(iso)
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
  }).format(d)
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    hour12: false,
  }).format(d)
  return { weekday, hour: Number(hourStr) || 0 }
}

/** Thu any kickoff, or Fri night (5pm PT+). Midweek CFB package. */
export function isCfbMidweekNightGame(ev: OddsEvent): boolean {
  const t = Date.parse(String(ev.commence_time || ''))
  if (!Number.isFinite(t) || t <= Date.now()) return false
  const { weekday, hour } = ptParts(String(ev.commence_time))
  if (weekday === 'Thu') return true
  if (weekday === 'Fri' && hour >= 17) return true
  return false
}

export function isCfbThursdayNightGame(ev: OddsEvent): boolean {
  const t = Date.parse(String(ev.commence_time || ''))
  if (!Number.isFinite(t) || t <= Date.now()) return false
  return ptParts(String(ev.commence_time)).weekday === 'Thu'
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

async function loadCfbSlateCard(
  admin: SupabaseClient,
  events: OddsEvent[],
  cardTitle?: string,
): Promise<NflSlateCard | null> {
  if (!events.length) return null
  const [weightsMap, teamMetricsMap, cfbRatingsMap, sideModifiersByEventId, pastedSplitsByEventId] =
    await Promise.all([
      loadPersonaWeights(admin),
      loadDbTeamMetricsMap(admin),
      loadDbCfbPowerRatingsMap(admin),
      resolveSideModifiersForSlate(admin, CFB_SPORT, events),
      loadPastedBettingSplitsForSlate(admin, CFB_SPORT, events),
    ])

  await refreshLaneBTicketsForSlate(admin, CFB_SPORT, events).catch(() => null)
  const laneBTickets = await loadLaneBTicketsForSport(admin, CFB_SPORT).catch(() => [])

  return buildNflAtsSlateCard(events, {
    cardTitle,
    sportKey: CFB_SPORT,
    weightsMap,
    teamMetricsMap,
    cfbRatingsMap,
    sideModifiersByEventId,
    pastedSplitsByEventId,
    laneBTickets,
  })
}

function formatPublicOneLeanTease(g: SlateGamePick, label: string): string {
  const away = shortDisplayName(g.awayTeam)
  const home = shortDisplayName(g.homeTeam)
  const when = formatOddsCommenceTimeShort(g.commenceTime)
  return [
    `🏈 **${label}**`,
    `**${away} @ ${home}** · ${when}`,
    '',
    `🎯 **Lean:** **${g.consensusPick.lineDisplay}**`,
    `*${g.consensusPick.badgeText}*`,
    '',
    `💬 *Full desk card + live adjustments in Sharpe VIP Syndicate.*`,
  ].join('\n')
}

function formatVipDeepFromGame(g: SlateGamePick, label: string): string {
  const away = shortDisplayName(g.awayTeam)
  const home = shortDisplayName(g.homeTeam)
  const lines = [
    `🔒 **Sharpe VIP · ${label}**`,
    `${away} @ ${home}`,
    '',
    `Official lean: **${g.consensusPick.lineDisplay}** (${g.consensusPick.type})`,
    '',
    `• Scott: ${g.pickerPicks.Scott.lineDisplay}`,
    `• Rocco: ${g.pickerPicks.Rocco.lineDisplay}`,
    `• Chedda: ${g.pickerPicks.Chedda.lineDisplay}`,
    `• Quorum: ${g.pickerPicks.Quorum?.lineDisplay || 'PASS'}`,
    `• Tank: ${g.pickerPicks.Tank.lineDisplay}`,
  ]
  if (g.sideModifier?.isSignificant) {
    lines.push('', `Injury / side mod: ${g.sideModifier.reason}`)
  }
  lines.push('', `_Friday CFB lock stays the house card._`)
  return lines.join('\n')
}

/**
 * Wednesday VIP: early leans on Thu/Fri night CFB only (no public Lounge post).
 */
export async function runCfbWedMidweekVip(
  admin: SupabaseClient,
  botUserId: string,
  opts?: { dryRun?: boolean },
): Promise<{ ok: boolean; skipped?: string; dryRun?: boolean; gameCount?: number; captionPreview?: string }> {
  const dryRun = opts?.dryRun === true
  const day = ptDateKey()
  const dedupeKey = `cfb_wed_midweek_vip:${day}`

  if (!dryRun && await alreadyPostedDedupe(admin, botUserId, dedupeKey)) {
    return { ok: true, skipped: 'already_posted_today' }
  }

  let oddsData: { events?: OddsEvent[] }
  try {
    oddsData = await fetchSportOdds(CFB_SPORT, ['us'], ['spreads', 'totals'])
  } catch (e) {
    return { ok: false, skipped: `odds_fetch_failed:${e}` }
  }

  const windowed = filterOddsEventsForNextFootballSlate(oddsData?.events || [])
  const nightGames = windowed.filter(isCfbMidweekNightGame).slice(0, 8)
  if (!nightGames.length) return { ok: true, skipped: 'no_thu_fri_night_cfb' }

  const card = await loadCfbSlateCard(admin, nightGames, 'CFB Midweek Night Package')
  if (!card?.games.length) return { ok: true, skipped: 'no_desk_votes' }

  const lines = [
    `🔒 **Sharpe VIP · CFB Wed Midweek Watch**`,
    `Thu / Fri night leans only … Saturday card still locks Friday.`,
    '',
  ]
  for (const g of card.games.slice(0, 6)) {
    const when = formatOddsCommenceTimeShort(g.commenceTime)
    lines.push(
      `• **${shortDisplayName(g.awayTeam)} @ ${shortDisplayName(g.homeTeam)}** (${when})`,
      `  Lean: **${g.consensusPick.lineDisplay}** · ${g.consensusPick.badgeText}`,
    )
  }
  lines.push('', `_Public tease drops Thursday for tonight's featured night game._`)

  const caption = lines.join('\n')
  if (dryRun) {
    return { ok: true, dryRun: true, gameCount: card.games.length, captionPreview: caption }
  }

  const vip = await publishBotSubChatMessage(admin, { botUserId, caption })
  if (vip.error || !vip.messageId) {
    return { ok: false, skipped: vip.error || 'vip_publish_failed', gameCount: card.games.length }
  }

  await markPublished(admin, botUserId, dedupeKey, caption, 'cfb_wed_midweek_vip')
  return { ok: true, gameCount: card.games.length, captionPreview: caption.slice(0, 280) }
}

/**
 * Thursday: public one-lean tease + VIP deep for featured CFB Thursday night game.
 */
export async function runCfbThuNightSpotlight(
  admin: SupabaseClient,
  botUserId: string,
  opts?: { dryRun?: boolean },
): Promise<{ ok: boolean; skipped?: string; dryRun?: boolean; postId?: string; captionPreview?: string }> {
  const dryRun = opts?.dryRun === true
  const day = ptDateKey()
  const dedupeKey = `cfb_thu_night_spotlight:${day}`

  if (!dryRun && await alreadyPostedDedupe(admin, botUserId, dedupeKey)) {
    return { ok: true, skipped: 'already_posted_today' }
  }

  let oddsData: { events?: OddsEvent[] }
  try {
    oddsData = await fetchSportOdds(CFB_SPORT, ['us'], ['spreads', 'totals'])
  } catch (e) {
    return { ok: false, skipped: `odds_fetch_failed:${e}` }
  }

  const windowed = filterOddsEventsForNextFootballSlate(oddsData?.events || [])
  const thu = windowed
    .filter(isCfbThursdayNightGame)
    .sort((a, b) => Date.parse(String(a.commence_time)) - Date.parse(String(b.commence_time)))
  if (!thu.length) return { ok: true, skipped: 'no_thursday_cfb' }

  const card = await loadCfbSlateCard(admin, thu.slice(0, 3), 'CFB Thursday Night')
  const featured = card?.games?.[0]
  if (!featured) return { ok: true, skipped: 'no_desk_votes' }

  const publicCaption = formatPublicOneLeanTease(featured, 'CFB THURSDAY NIGHT TEASE')
  const vipCaption = formatVipDeepFromGame(featured, 'CFB Thursday Night Deep Dive')

  if (dryRun) {
    return { ok: true, dryRun: true, captionPreview: publicCaption }
  }

  const postRes = await publishLoungeBotPost(admin, {
    botUserId,
    caption: publicCaption,
    categoryPills: ['sports', 'cfb'],
  })
  if (postRes.error || !postRes.postId) {
    return { ok: false, skipped: postRes.error || 'public_publish_failed' }
  }

  await publishBotSubChatMessage(admin, { botUserId, caption: vipCaption }).catch(() => null)
  await markPublished(admin, botUserId, dedupeKey, publicCaption, 'cfb_thu_night_spotlight')
  return { ok: true, postId: postRes.postId, captionPreview: publicCaption.slice(0, 280) }
}

/**
 * Saturday VIP stub for CFB: only when Friday lock flipped or starter shock.
 */
export async function runCfbSatVipAddsKills(
  admin: SupabaseClient,
  botUserId: string,
  opts?: { dryRun?: boolean },
): Promise<{ ok: boolean; skipped?: string; dryRun?: boolean; changeCount?: number; captionPreview?: string }> {
  const dryRun = opts?.dryRun === true
  const day = ptDateKey()
  const dedupeKey = `cfb_sat_vip_adds_kills:${day}`

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
    .eq('sport_key', CFB_SPORT)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(60)

  if (lockErr) return { ok: false, skipped: lockErr.message }
  if (!locks?.length) return { ok: true, skipped: 'no_friday_locks' }

  const byEvent = new Map<string, (typeof locks)[0]>()
  for (const row of locks) {
    const eid = String(row.event_id || '')
    if (!eid || byEvent.has(eid)) continue
    byEvent.set(eid, row)
  }

  let oddsData: { events?: OddsEvent[] }
  try {
    oddsData = await fetchSportOdds(CFB_SPORT, ['us'], ['spreads'])
  } catch (e) {
    return { ok: false, skipped: `odds_fetch_failed:${e}` }
  }

  const events = filterOddsEventsForNextFootballSlate(oddsData?.events || [])
  const eventById = new Map(events.map((e) => [String(e.id), e]))
  const sideMods = await resolveSideModifiersForSlate(admin, CFB_SPORT, events)

  type Change = { away: string; home: string; reason: 'lock_flip' | 'starter_shock'; detail: string }
  const changes: Change[] = []

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

    let flipped = false
    let flipDetail = ''
    if (currentHomeSpread != null && lockedLine != null && Number.isFinite(lockedLine)) {
      if (lockedSideHome) {
        if (currentHomeSpread <= lockedLine - 1.5) {
          flipped = true
          flipDetail = `Home number moved ${lockedLine} → ${currentHomeSpread} (against lock)`
        }
      } else {
        const lockedAwaySpread = -lockedLine
        const currentAwaySpread = -currentHomeSpread
        if (currentAwaySpread <= lockedAwaySpread - 1.5) {
          flipped = true
          flipDetail = `Away number moved ${lockedAwaySpread} → ${currentAwaySpread} (against lock)`
        }
      }
    }

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
    `🔒 **Sharpe VIP · CFB Sat Adds / Kills**`,
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
  lines.push('', `_No new Saturday CFB slate. Friday stays the house._`)

  const caption = lines.join('\n')
  if (dryRun) {
    return { ok: true, dryRun: true, changeCount: unique.length, captionPreview: caption }
  }

  const vip = await publishBotSubChatMessage(admin, { botUserId, caption })
  if (vip.error || !vip.messageId) {
    return { ok: false, skipped: vip.error || 'vip_publish_failed', changeCount: unique.length }
  }

  await markPublished(admin, botUserId, dedupeKey, caption, 'cfb_sat_vip_adds_kills')
  return { ok: true, changeCount: unique.length, captionPreview: caption.slice(0, 280) }
}
