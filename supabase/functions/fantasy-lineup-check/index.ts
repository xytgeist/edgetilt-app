/**
 * NBA daily lineup check (pg_cron every 15 min; acts only in the window before the day's first tip).
 * For each user with daily-lineup NBA leagues (not Yahoo High Score, which sets lineups weekly): today's best lineup
 * from the same Start/Sit planner as the Roster tab. Pushes once per US Eastern day when a swap is worth at least
 * MIN_GAIN or a starter playing today is Out / Doubtful with nobody to cover him. Opt out: push_fantasy_lineup.
 * Body (service role / admin): { force?: true (skip the time gate), dryRun?: true (no send, no dedupe row),
 *   onlyUser?: uuid, background?: true }
 */
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminOpsCorsHeaders, adminOpsJson, authorizeServiceRoleOrAdmin } from '../_shared/adminAuth.ts'
import { type ApnsAlertPayload, sendApnsToUser } from '../_shared/apnsPush.ts'
import { sendFcmToUser } from '../_shared/fcmPush.ts'
import { sendWeb } from '../_shared/fantasyStatusPush.ts'
import { leagueDetail } from '../_shared/fantasyServerDetail.ts'
import { buildSportLineupCards } from '../_shared/fantasyLineupCards.ts'
import { loadNbaBoard } from '../_shared/fantasyNbaBoard.ts'
import { injuryKey, optimizeLineup } from '../../../src/features/fantasy/fantasyStartSit.js'
import { waiverLineupSlots } from '../../../src/features/fantasy/fantasyWaivers.js'
import { nbaLockIn } from '../../../src/features/fantasy/fantasyLockIn.js'
import { fantasyLeagueDisplayName } from '../../../src/features/fantasy/fantasyLeagueName.js'

// deno-lint-ignore no-explicit-any
type Obj = Record<string, any>
type Opts = { force?: boolean; dryRun?: boolean; onlyUser?: string; background?: boolean }

/** A swap under this many projected points is not worth a push (the Roster tab still lists it). */
const MIN_GAIN = 1
/** Send between 75 and 15 minutes before the day's first NBA tip. */
const WINDOW_START_MS = 75 * 60_000
const WINDOW_END_MS = 15 * 60_000

const str = (v: unknown) => String(v ?? '').trim()
const ET_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
const etDate = (t: number) => ET_DATE.format(new Date(t))

function briefName(name: string) {
  const parts = str(name).split(/\s+/).filter(Boolean)
  if (parts.length < 2) return parts[0] || ''
  return `${parts[0].charAt(0).toUpperCase()}. ${parts.slice(1).join(' ')}`
}

/** The day's first NBA tip (ms) from the shared NBA board, or null on an off day. */
async function firstTipToday(now: number): Promise<number | null> {
  const board = await loadNbaBoard().catch(() => null)
  const today = etDate(now)
  const tips = (board?.games || [])
    .map((g: Obj) => Date.parse(str(g.date)))
    .filter((t: number) => Number.isFinite(t) && etDate(t) === today)
  return tips.length ? Math.min(...tips) : null
}

/** One league's line for the push, or null when nothing needs doing today. */
function leagueLine(league: Obj, detail: Obj, cards: Record<string, Obj>): { text: string; leagueId: string } | null {
  const mine = (detail?.teams || []).find((t: Obj) => t.is_mine)
  const roster = mine ? detail?.rostersByTeam?.[mine.id] || [] : []
  if (!roster.length) return null
  const slots = waiverLineupSlots(league, roster, 'nba')
  if (!slots.length) return null
  const plan = optimizeLineup({ roster, cards, scoring: league.scoring, slots, sport: 'nba' }) as Obj
  const moves = ((plan?.moves || []) as Obj[]).filter((m) => m.gain >= MIN_GAIN).sort((a, b) => b.gain - a.gain)
  const covered = new Set(((plan?.moves || []) as Obj[]).map((m) => str(m.bench?.row?.sleeper_id)).filter(Boolean))
  const hurt = (roster as Obj[]).filter((r) => {
    if (r.slot !== 'starter' || !r.sleeper_id || covered.has(str(r.sleeper_id))) return false
    const key = injuryKey(r.injury_status)
    return (key === 'out' || key === 'doubtful') && cards[str(r.sleeper_id)]?.today === 'pre'
  })
  if (!moves.length && !hurt.length) return null
  const name = fantasyLeagueDisplayName(str(league.name))
  const parts: string[] = []
  if (moves.length) {
    const top = moves[0]
    const swap = top.bench
      ? `start ${briefName(top.start.row.player_name)} over ${briefName(top.bench.row.player_name)} (+${top.gain.toFixed(1)})`
      : `start ${briefName(top.start.row.player_name)} (+${top.gain.toFixed(1)})`
    parts.push(moves.length > 1 ? `${swap}, ${moves.length - 1} more` : swap)
  }
  for (const r of hurt.slice(0, 1)) parts.push(`${briefName(r.player_name)} ${injuryKey(r.injury_status)}, no backup`)
  return { text: `${name}: ${parts.join('; ')}`, leagueId: str(league.id) }
}

async function processUser(admin: SupabaseClient, userId: string, today: string, opts: Opts) {
  const { data: prefs } = await admin.from('notification_preferences').select('push_fantasy_lineup').eq('user_id', userId).maybeSingle()
  if (prefs && prefs.push_fantasy_lineup === false) return { userId, skipped: 'opted out' }
  if (!opts.dryRun) {
    const { data: done } = await admin.from('fantasy_lineup_checks').select('id').eq('user_id', userId).eq('et_date', today).maybeSingle()
    if (done) return { userId, skipped: 'already sent' }
  }
  const { data: leagues } = await admin
    .from('fantasy_leagues')
    .select('id, user_id, connection_id, name, provider, sport, season, scoring, settings')
    .eq('user_id', userId)
    .eq('sport', 'nba')
  // Yahoo High Score sets lineups once a week; every other NBA league sets them each night.
  const daily = (leagues || []).filter((lg) => nbaLockIn(lg.provider, 'nba', lg.settings) !== 'best')
  if (!daily.length) return { userId, skipped: 'no daily NBA leagues' }
  const details = (await Promise.all(daily.map((lg) => leagueDetail(admin, lg, 'nba').catch(() => null)))) as Array<Obj | null>
  const players = new Map<string, Obj>()
  for (const d of details) {
    const mine = (d?.teams || []).find((t: Obj) => t.is_mine)
    for (const r of (mine ? d?.rostersByTeam?.[mine.id] || [] : []) as Obj[]) {
      if (r.sleeper_id) players.set(str(r.sleeper_id), { sleeper_id: str(r.sleeper_id), name: r.player_name, position: r.position, team: r.nfl_team })
    }
  }
  if (!players.size) return { userId, skipped: 'no rosters' }
  const { cards } = await buildSportLineupCards([...players.values()], 'nba', admin)
  const lines = daily
    .map((lg, i) => (details[i] ? leagueLine(lg, details[i] as Obj, cards as Record<string, Obj>) : null))
    .filter(Boolean) as Array<{ text: string; leagueId: string }>
  if (!lines.length) return { userId, skipped: 'lineups already set' }
  const title = 'Lineup check before tip'
  const shown = lines.slice(0, 3).map((l) => l.text)
  const body = `${shown.join(' · ')}${lines.length > 3 ? ` · ${lines.length - 3} more leagues` : ''}`
  const url = lines.length === 1 ? `/?tab=fantasy&league=${lines[0].leagueId}&fantasyTool=start` : '/?tab=fantasy'
  if (opts.dryRun) return { userId, title, body, url, leagues: lines.length }

  const { data: inserted } = await admin
    .from('fantasy_lineup_checks')
    .upsert({ user_id: userId, et_date: today, league_ids: lines.map((l) => l.leagueId), title, body }, { onConflict: 'user_id,et_date', ignoreDuplicates: true })
    .select('id')
  if (!inserted?.length) return { userId, skipped: 'already sent' }
  const payload = { title, body, url, eventType: 'fantasy_lineup' } as ApnsAlertPayload
  const [apns, fcm, web] = await Promise.all([
    sendApnsToUser(admin, userId, payload).catch((e) => ({ error: String(e) })),
    sendFcmToUser(admin, userId, payload).catch((e) => ({ error: String(e) })),
    sendWeb(admin, userId, payload).catch((e) => ({ error: String(e) })),
  ])
  await admin.from('fantasy_lineup_checks').update({ sent: { apns, fcm, web } }).eq('id', inserted[0].id)
  return { userId, title, body, sent: true }
}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: adminOpsCorsHeaders })
  let admin: SupabaseClient
  try {
    admin = await authorizeServiceRoleOrAdmin(req)
  } catch (res) {
    if (res instanceof Response) return res
    return adminOpsJson(401, { error: 'Unauthorized' })
  }
  const body = (await req.json().catch(() => ({}))) as Opts
  const now = Date.now()
  const today = etDate(now)

  try {
    const tip = await firstTipToday(now)
    const inWindow = tip != null && now >= tip - WINDOW_START_MS && now <= tip - WINDOW_END_MS
    if (!body.force && !inWindow) return adminOpsJson(200, { ok: true, ran: false, today, first_tip: tip ? new Date(tip).toISOString() : null })

    if (body.onlyUser) {
      const work = processUser(admin, body.onlyUser, today, body)
      if (body.background && typeof EdgeRuntime !== 'undefined') {
        EdgeRuntime.waitUntil(work.catch((e) => console.error('lineup check user', body.onlyUser, e)))
        return adminOpsJson(202, { ok: true, queued: body.onlyUser })
      }
      return adminOpsJson(200, { ok: true, ran: true, today, result: await work })
    }

    const { data: rows, error } = await admin.from('fantasy_leagues').select('user_id').eq('sport', 'nba')
    if (error) throw new Error(error.message)
    const users = [...new Set((rows || []).map((r) => str(r.user_id)).filter(Boolean))]
    if (body.dryRun) {
      const plan = []
      for (const u of users) plan.push(await processUser(admin, u, today, body).catch((e) => ({ userId: u, error: String(e) })))
      return adminOpsJson(200, { ok: true, ran: true, today, users: users.length, plan })
    }
    // One background call per user (its own Edge budget), like the weekly digest.
    const self = `${str(Deno.env.get('SUPABASE_URL')).replace(/\/$/, '')}/functions/v1/fantasy-lineup-check`
    const auth = req.headers.get('Authorization') || ''
    let queued = 0
    for (let i = 0; i < users.length; i += 5) {
      await Promise.all(
        users.slice(i, i + 5).map(async (u) => {
          const res = await fetch(self, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: auth, apikey: auth.replace(/^Bearer\s+/i, '') },
            body: JSON.stringify({ onlyUser: u, force: true, background: true }),
          }).catch(() => null)
          if (res?.ok) queued++
        }),
      )
    }
    return adminOpsJson(200, { ok: true, ran: true, today, users: users.length, queued })
  } catch (err) {
    return adminOpsJson(500, { error: err instanceof Error ? err.message : 'Lineup check failed.' })
  }
})
