/**
 * Starter status pushes (pg_cron every 5 min; admin / service role may send { force, dryRun }).
 * Reads ESPN's league-wide NFL injury report once per run, keeps each player's fantasy game designation in
 * `nfl_player_status`, and when a player moves up to Out / Doubtful / IR before his game kicks off, pushes every
 * user who starts him (one push per user, player, status, and week … `fantasy_status_alerts`). The first run only
 * seeds the table so current injuries never fire as new.
 *
 * Cadence (ET): Sun 8-17, Mon + Thu 16-21, Wed-Sat 11-20 every tick; 7-24 otherwise every 30 min; overnight hourly.
 */
import webpush from 'npm:web-push@3.6.7'
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminOpsCorsHeaders, adminOpsJson, authorizeServiceRoleOrAdmin } from '../_shared/adminAuth.ts'
import { type ApnsAlertPayload, sendApnsToUser } from '../_shared/apnsPush.ts'
import { sendFcmToUser } from '../_shared/fcmPush.ts'
import { espnFetch } from '../_shared/loungeSportsScoreboard.ts'

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl'
const HEADERS = { 'User-Agent': 'EdgeTiltLounge/1.0', Accept: 'application/json' }
const RANK: Record<string, number> = { active: 0, questionable: 1, doubtful: 2, out: 3, ir: 3 }
const ESPN_TO_SLEEPER: Record<string, string> = { WSH: 'WAS', JAC: 'JAX', LA: 'LAR' }

type Obj = Record<string, unknown>
type StatusRow = {
  espn_id: string
  sleeper_id: string | null
  name: string
  team: string | null
  status: string
  injury: string | null
  comment: string | null
  return_date: string | null
  reported_at: string | null
  changed_at?: string
  updated_at?: string
}

const str = (v: unknown) => String(v ?? '').trim()
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? v as Obj : {})
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') as Obj[] : [])

function etParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', hour12: false })
  const map: Record<string, string> = {}
  for (const p of fmt.formatToParts(d)) map[p.type] = p.value
  return { wd: map.weekday, hour: Number(map.hour) % 24 }
}

function runGapMs(d = new Date()): number {
  const { wd, hour } = etParts(d)
  const hot =
    (wd === 'Sun' && hour >= 8 && hour < 17) ||
    ((wd === 'Mon' || wd === 'Thu') && hour >= 16 && hour < 21) ||
    (['Wed', 'Thu', 'Fri', 'Sat'].includes(wd) && hour >= 11 && hour < 20)
  if (hot) return 4 * 60 * 1000
  if (hour >= 7) return 29 * 60 * 1000
  return 59 * 60 * 1000
}

/** ESPN game designation: the fantasy status for the next game, else the report status. */
export function designation(inj: Obj): string {
  const report = str(inj.status)
  if (/injured reserve|reserve|pup/i.test(report)) return 'ir'
  const fantasy = str(obj(obj(inj.details).fantasyStatus).abbreviation)
  const s = (fantasy || report).toUpperCase()
  if (/^(OUT|O|SUSP)/.test(s)) return 'out'
  if (/^(DOUBTFUL|D)$/.test(s) || s.startsWith('DOUBT')) return 'doubtful'
  if (/^(QUESTIONABLE|Q)$/.test(s) || s.startsWith('QUEST')) return 'questionable'
  if (/^IR/.test(s)) return 'ir'
  return 'active'
}

async function getJson(url: string, timeoutMs = 20_000): Promise<Obj | null> {
  const res = await espnFetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) return null
  return await res.json() as Obj
}

function parseInjuries(body: Obj): StatusRow[] {
  const out: StatusRow[] = []
  for (const team of arr(body.injuries)) {
    for (const inj of arr(team.injuries)) {
      const athlete = obj(inj.athlete)
      const href = arr(athlete.links).map((l) => str(l.href)).find((h) => /\/id\/\d+/.test(h)) || ''
      const espnId = href.match(/\/id\/(\d+)/)?.[1] || ''
      if (!espnId) continue
      const details = obj(inj.details)
      const ret = str(details.returnDate)
      out.push({
        espn_id: espnId,
        sleeper_id: null,
        name: str(athlete.displayName),
        team: null,
        status: designation(inj),
        injury: str(details.type) || null,
        comment: str(inj.shortComment) || null,
        return_date: /^\d{4}-\d{2}-\d{2}$/.test(ret) ? ret : null,
        reported_at: str(inj.date) ? new Date(str(inj.date)).toISOString() : null,
      })
    }
  }
  return out
}

/** Team abbreviation (Sleeper style) → this week's game: state pre / in / post, kickoff, opponent. */
async function weekGames(): Promise<{ week: number; games: Map<string, { state: string; kickoff: string; opp: string; home: boolean }> }> {
  let body = await getJson(`${ESPN}/scoreboard`, 10_000)
  // ESPN keeps last week up until Tuesday; once every game is final, next week's slate is the one that matters.
  const allFinal = (b: Obj | null) => {
    const evs = arr(b?.events)
    return evs.length > 0 && evs.every((ev) => str(obj(obj(arr(ev.competitions)[0]?.status).type).state) === 'post')
  }
  if (allFinal(body)) {
    const nextWeek = (Number(obj(body?.week).number) || 0) + 1
    const seasonType = Number(obj(body?.season).type) || 2
    const next = await getJson(`${ESPN}/scoreboard?seasontype=${seasonType}&week=${nextWeek}`, 10_000)
    if (arr(next?.events).length) body = next
  }
  const games = new Map<string, { state: string; kickoff: string; opp: string; home: boolean }>()
  const week = Number(obj(body?.week).number) || 0
  for (const ev of arr(body?.events)) {
    const comp = arr(ev.competitions)[0]
    if (!comp) continue
    const state = str(obj(obj(comp.status).type).state) || str(obj(obj(ev.status).type).state)
    const sides = arr(comp.competitors).map((c) => {
      const abbr = str(obj(c.team).abbreviation).toUpperCase()
      return { abbr: ESPN_TO_SLEEPER[abbr] || abbr, home: str(c.homeAway) === 'home' }
    })
    for (const s of sides) {
      const other = sides.find((x) => x !== s)
      games.set(s.abbr, { state, kickoff: str(ev.date), opp: other?.abbr || '', home: s.home })
    }
  }
  return { week, games }
}

function kickoffDay(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long' }).format(new Date(t))
}

async function sendWeb(admin: SupabaseClient, userId: string, payload: ApnsAlertPayload) {
  const pub = Deno.env.get('WEB_PUSH_PUBLIC_KEY')
  const priv = Deno.env.get('WEB_PUSH_PRIVATE_KEY')
  if (!pub || !priv) return { sent: 0, skipped: true }
  const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId)
  if (!subs?.length) return { sent: 0, skipped: true }
  webpush.setVapidDetails(Deno.env.get('WEB_PUSH_SUBJECT') || 'mailto:support@edgetilt.com', pub, priv)
  const b64u = (v: string | null) => (v ? v.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '') : '')
  let sent = 0
  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: b64u(sub.p256dh), auth: b64u(sub.auth) } }, JSON.stringify(payload))
      sent++
    } catch (err) {
      const code = (err as { statusCode?: number })?.statusCode
      if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', sub.id).eq('user_id', userId)
    }
  }
  return { sent, skipped: false }
}

function copyFor(status: string, name: string, injury: string | null, leagues: string[], game: { kickoff: string; opp: string; home: boolean } | null) {
  const hurt = injury ? ` (${injury.toLowerCase()})` : ''
  const title = status === 'ir' ? `${name}${hurt} to IR` : status === 'out' ? `${name}${hurt} ruled out` : `${name}${hurt} doubtful`
  const where = leagues.length === 1 ? `your ${leagues[0]} lineup` : `${leagues.length} of your lineups`
  const day = game ? kickoffDay(game.kickoff) : ''
  const vs = game?.opp ? `${game.home ? 'vs' : '@'} ${game.opp}` : ''
  const when = [day, vs].filter(Boolean).join(' ')
  const body = `He's in ${where}${when ? ` for ${when}` : ''}. Tap for a swap.`
  return { title, body }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: adminOpsCorsHeaders })
  let admin: SupabaseClient
  try {
    admin = await authorizeServiceRoleOrAdmin(req)
  } catch (res) {
    if (res instanceof Response) return res
    return adminOpsJson(401, { error: 'Unauthorized' })
  }
  const body = (await req.json().catch(() => ({}))) as {
    force?: boolean
    dryRun?: boolean
    /** Test hook: treat this ESPN player as reporting `status` this run. */
    simulate?: { espn_id?: string; status?: string }
    /** Test hook: only this user may be pushed. */
    onlyUser?: string
  }
  const now = new Date()

  const cutoff = new Date(now.getTime() - (body.force ? 0 : runGapMs(now))).toISOString()
  const { data: claimed, error: claimErr } = await admin
    .from('fantasy_status_watch_state')
    .update({ last_run_at: now.toISOString(), updated_at: now.toISOString() })
    .eq('id', 'watch')
    .or(`last_run_at.is.null,last_run_at.lt.${cutoff}`)
    .select('seeded')
  if (claimErr) return adminOpsJson(500, { error: claimErr.message })
  if (!claimed?.length) return adminOpsJson(200, { ok: true, ran: false })
  const seeded = Boolean(claimed[0]?.seeded)

  try {
    const report = await getJson(`${ESPN}/injuries`)
    if (!report) throw new Error('ESPN injuries unavailable')
    const seen = new Set<string>()
    const rows = parseInjuries(report).filter((r) => (seen.has(r.espn_id) ? false : (seen.add(r.espn_id), true)))
    const sim = body.simulate?.espn_id && RANK[String(body.simulate.status)] != null ? body.simulate : null
    if (sim) {
      const hit = rows.find((r) => r.espn_id === String(sim.espn_id))
      if (hit) hit.status = String(sim.status)
      else rows.push({ espn_id: String(sim.espn_id), sleeper_id: null, name: '', team: null, status: String(sim.status), injury: 'Test', comment: null, return_date: null, reported_at: now.toISOString() })
    }
    const ids = rows.map((r) => r.espn_id)

    const known: Obj[] = []
    const players: Obj[] = []
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200)
      const [k, p] = await Promise.all([
        admin.from('nfl_player_status').select('espn_id, status, changed_at').in('espn_id', chunk),
        admin.from('nfl_players').select('sleeper_id, espn_id, full_name, team').in('espn_id', chunk),
      ])
      if (k.error) throw new Error(k.error.message)
      known.push(...(k.data || []))
      players.push(...(p.data || []))
    }
    const prior = new Map(known.map((k) => [str(k.espn_id), k]))
    const bySleeper = new Map(players.map((p) => [str(p.espn_id), p]))

    const nowIso = now.toISOString()
    const transitions: Array<StatusRow & { from: string }> = []
    const upserts = rows.map((r) => {
      const p = bySleeper.get(r.espn_id)
      const row: StatusRow = {
        ...r,
        name: r.name || str(p?.full_name),
        sleeper_id: p ? str(p.sleeper_id) : null,
        team: p?.team ? str(p.team).toUpperCase() : null,
        updated_at: nowIso,
      }
      const before = prior.get(r.espn_id)
      const from = before ? str(before.status) : 'active'
      row.changed_at = before && from === r.status ? str(before.changed_at) : nowIso
      if (seeded && RANK[r.status] >= 2 && RANK[r.status] > (RANK[from] ?? 0)) transitions.push({ ...row, from })
      return row
    })
    // Players no longer on the report are healthy again.
    const reported = new Set(ids)
    const { data: stale } = await admin.from('nfl_player_status').select('espn_id').neq('status', 'active')
    const cleared = (stale || []).map((s) => str(s.espn_id)).filter((id) => !reported.has(id))

    if (!body.dryRun && !sim) {
      for (let i = 0; i < upserts.length; i += 500) {
        const { error } = await admin.from('nfl_player_status').upsert(upserts.slice(i, i + 500), { onConflict: 'espn_id' })
        if (error) throw new Error(error.message)
      }
      if (cleared.length) {
        await admin.from('nfl_player_status').update({ status: 'active', changed_at: nowIso, updated_at: nowIso }).in('espn_id', cleared)
      }
    }

    let pushed = 0
    let alerts = 0
    const plan: unknown[] = []
    const withSleeper = transitions.filter((t) => t.sleeper_id)
    if (withSleeper.length) {
      const { week, games } = await weekGames()
      const pregame = withSleeper.filter((t) => {
        const g = t.team ? games.get(t.team) : null
        return g && g.state === 'pre'
      })
      const sids = pregame.map((t) => t.sleeper_id as string)
      const { data: rosterRows } = sids.length
        ? await admin.from('fantasy_rosters').select('team_id, user_id, week, sleeper_id, slot').in('sleeper_id', sids).eq('slot', 'starter')
        : { data: [] }
      const teamIds = [...new Set((rosterRows || []).map((r) => str(r.team_id)))]
      const { data: teams } = teamIds.length
        ? await admin.from('fantasy_teams').select('id, league_id, is_mine').in('id', teamIds).eq('is_mine', true)
        : { data: [] }
      const mineTeams = new Map((teams || []).map((t) => [str(t.id), t]))
      const leagueIds = [...new Set((teams || []).map((t) => str(t.league_id)))]
      const { data: leagues } = leagueIds.length
        ? await admin.from('fantasy_leagues').select('id, name, sport').in('id', leagueIds)
        : { data: [] }
      const leagueById = new Map((leagues || []).filter((l) => str(l.sport || 'nfl') === 'nfl').map((l) => [str(l.id), l]))
      // Only each team's latest synced week counts as the current lineup.
      const { data: weeks } = teamIds.length
        ? await admin.from('fantasy_rosters').select('team_id, week').in('team_id', teamIds).order('week', { ascending: false }).limit(5000)
        : { data: [] }
      const latest = new Map<string, number>()
      for (const w of weeks || []) if (!latest.has(str(w.team_id))) latest.set(str(w.team_id), Number(w.week) || 0)

      for (const t of pregame) {
        const byUser = new Map<string, string[]>()
        for (const r of rosterRows || []) {
          if (str(r.sleeper_id) !== t.sleeper_id) continue
          const team = mineTeams.get(str(r.team_id))
          const league = team ? leagueById.get(str(team.league_id)) : null
          if (!team || !league || (Number(r.week) || 0) !== latest.get(str(r.team_id))) continue
          const list = byUser.get(str(r.user_id)) || []
          if (!list.includes(str(league.id))) list.push(str(league.id))
          byUser.set(str(r.user_id), list)
        }
        const game = t.team ? games.get(t.team) || null : null
        for (const [userId, lgIds] of byUser) {
          if (body.onlyUser && userId !== body.onlyUser) continue
          const { data: prefs } = await admin.from('notification_preferences').select('push_fantasy_status').eq('user_id', userId).maybeSingle()
          if (prefs && prefs.push_fantasy_status === false) continue
          const names = lgIds.map((id) => str(leagueById.get(id)?.name) || 'fantasy')
          const { title, body: text } = copyFor(t.status, t.name, t.injury, names, game)
          const url = `/?tab=fantasy&league=${encodeURIComponent(lgIds[0])}&fantasyTool=start`
          plan.push({ userId, player: t.name, status: t.status, from: t.from, title, body: text, url })
          if (body.dryRun) continue
          const { data: inserted } = await admin
            .from('fantasy_status_alerts')
            .upsert({ user_id: userId, sleeper_id: t.sleeper_id, status: t.status, week, league_ids: lgIds, title, body: text }, {
              onConflict: 'user_id,sleeper_id,status,week',
              ignoreDuplicates: true,
            })
            .select('id')
          if (!inserted?.length) continue
          alerts++
          const payload: ApnsAlertPayload = { title, body: text, url, eventType: 'fantasy_status' }
          const [apns, fcm, web] = await Promise.all([
            sendApnsToUser(admin, userId, payload).catch((e) => ({ error: String(e) })),
            sendFcmToUser(admin, userId, payload).catch((e) => ({ error: String(e) })),
            sendWeb(admin, userId, payload).catch((e) => ({ error: String(e) })),
          ])
          const sent = [apns, fcm, web].reduce((acc, r) => acc + (Number((r as { sent?: number }).sent) || 0), 0)
          if (sent) pushed++
          await admin.from('fantasy_status_alerts').update({ sent: { apns, fcm, web } }).eq('id', inserted[0].id)
        }
      }
    }

    if (!body.dryRun) {
      await admin.from('fantasy_status_watch_state').update({ seeded: true, last_error: null, updated_at: new Date().toISOString() }).eq('id', 'watch')
    }
    return adminOpsJson(200, {
      ok: true,
      ran: true,
      seeded,
      reported: rows.length,
      transitions: transitions.length,
      cleared: cleared.length,
      alerts,
      pushed,
      ...(body.dryRun ? { plan } : {}),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await admin.from('fantasy_status_watch_state').update({ last_error: message.slice(0, 500), updated_at: new Date().toISOString() }).eq('id', 'watch')
    return adminOpsJson(502, { error: message })
  }
})
