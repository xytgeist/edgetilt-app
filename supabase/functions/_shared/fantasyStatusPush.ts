/**
 * Starter status pushes shared by `fantasy-status-watch` (ESPN injury report) and `fantasy-insider-poll` (trusted X
 * insiders). For each player who just moved up to Out / Doubtful / IR before his game: find users who start him on
 * their latest synced lineup, suggest the best healthy bench fit per league, and push once per user + player +
 * status + NFL week (`fantasy_status_alerts` is the dedupe key, so a later ESPN report never repeats an insider push).
 */
import webpush from 'npm:web-push@3.6.7'
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { type ApnsAlertPayload, sendApnsToUser } from './apnsPush.ts'
import { sendFcmToUser } from './fcmPush.ts'
import { espnFetch } from './loungeSportsScoreboard.ts'
import { fantasyPos, fetchJson, ptsOf, statMap } from './fantasyLineupCards.ts'

export const ESPN_NFL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl'
const HEADERS = { 'User-Agent': 'EdgeTiltLounge/1.0', Accept: 'application/json' }
export const RANK: Record<string, number> = { active: 0, questionable: 1, doubtful: 2, out: 3, ir: 3 }
export const ESPN_TO_SLEEPER: Record<string, string> = { WSH: 'WAS', JAC: 'JAX', LA: 'LAR' }

type Obj = Record<string, unknown>
const str = (v: unknown) => String(v ?? '').trim()
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? v as Obj : {})
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') as Obj[] : [])

export type StatusTransition = {
  sleeper_id: string | null
  name: string
  team: string | null
  status: string
  injury: string | null
  from: string
}

export async function espnJson(url: string, timeoutMs = 20_000): Promise<Obj | null> {
  const res = await espnFetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) return null
  return await res.json() as Obj
}

/** Team abbreviation (Sleeper style) → this week's game: state pre / in / post, kickoff, opponent. */
export async function weekGames(): Promise<{ week: number; season: string; games: Map<string, { state: string; kickoff: string; opp: string; home: boolean }> }> {
  let body = await espnJson(`${ESPN_NFL}/scoreboard`, 10_000)
  // ESPN keeps last week up until Tuesday; once every game is final, next week's slate is the one that matters.
  const allFinal = (b: Obj | null) => {
    const evs = arr(b?.events)
    return evs.length > 0 && evs.every((ev) => str(obj(obj(arr(ev.competitions)[0]?.status).type).state) === 'post')
  }
  if (allFinal(body)) {
    const nextWeek = (Number(obj(body?.week).number) || 0) + 1
    const seasonType = Number(obj(body?.season).type) || 2
    const next = await espnJson(`${ESPN_NFL}/scoreboard?seasontype=${seasonType}&week=${nextWeek}`, 10_000)
    if (arr(next?.events).length) body = next
  }
  const games = new Map<string, { state: string; kickoff: string; opp: string; home: boolean }>()
  const week = Number(obj(body?.week).number) || 0
  const season = str(obj(body?.season).year)
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
  return { week, season, games }
}

/** Positions that may fill a host lineup slot label ("WR2", "FLEX", "W/R/T", "SUPER_FLEX" …). */
function slotFits(slotLabel: string | null, starterPos: string): string[] {
  // Sleeper / ESPN labels end in the slot name (`starter:3:FLEX`); Yahoo's is the slot name itself.
  const last = String(slotLabel || '').split(':').pop() || ''
  const s = last.toUpperCase().replace(/\d+$/, '').replace(/\s+/g, '')
  if (['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(s)) return [s]
  if (s === 'PK') return ['K']
  if (s === 'D/ST' || s === 'DST') return ['DEF']
  if (['FLEX', 'W/R/T', 'WRT', 'RB/WR/TE', 'REC_FLEX_RB'].includes(s)) return ['RB', 'WR', 'TE']
  if (['W/R', 'RB/WR', 'WRRB_FLEX'].includes(s)) return ['RB', 'WR']
  if (['W/T', 'WR/TE', 'REC_FLEX'].includes(s)) return ['WR', 'TE']
  if (['SUPER_FLEX', 'SFLEX', 'OP', 'Q/W/R/T', 'QB/RB/WR/TE'].includes(s)) return ['QB', 'RB', 'WR', 'TE']
  return [starterPos]
}

const projCache = new Map<string, { at: number; value: Promise<Map<string, Record<string, unknown>>> }>()

function weekProjections(season: string, week: number) {
  const key = `${season}:${week}`
  const hit = projCache.get(key)
  if (hit && Date.now() - hit.at < 20 * 60 * 1000) return hit.value
  const value = fetchJson(`https://api.sleeper.app/v1/projections/nfl/regular/${season}/${week}`).then(statMap).catch(() => new Map())
  projCache.set(key, { at: Date.now(), value })
  return value
}

const lastName = (full: string) => {
  const parts = String(full || '').trim().split(/\s+/)
  if (parts.length >= 2 && /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(parts[parts.length - 1])) parts.pop()
  return parts[parts.length - 1] || full
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

type Suggestion = { league: string; name: string | null }

function copyFor(status: string, name: string, injury: string | null, picks: Suggestion[], game: { kickoff: string; opp: string; home: boolean } | null) {
  const hurt = injury ? ` (${injury.toLowerCase()})` : ''
  const title = status === 'ir' ? `${name}${hurt} to IR` : status === 'out' ? `${name}${hurt} ruled out` : `${name}${hurt} doubtful`
  const where = picks.length === 1 ? `your ${picks[0].league} lineup` : `${picks.length} of your lineups`
  const day = game ? kickoffDay(game.kickoff) : ''
  const vs = game?.opp ? `${game.home ? 'vs' : '@'} ${game.opp}` : ''
  const when = [day, vs].filter(Boolean).join(' ')
  const lead = `He's in ${where}${when ? ` for ${when}` : ''}`
  const named = picks.filter((p) => p.name)
  if (!named.length) {
    return { title, body: `${lead}, and no one on your bench can fill his spot. Tap to see waiver options.`, waiver: true }
  }
  if (picks.length === 1) return { title, body: `${lead}. Suggest starting ${named[0].name}.`, waiver: false }
  const list = named.map((p) => `${lastName(p.name as string)} in ${p.league}`).join(', ')
  const missing = picks.length - named.length
  return { title, body: `${lead}. Suggest starting ${list}${missing ? `; no bench fill in ${missing === 1 ? 'one league' : `${missing} leagues`}` : ''}.`, waiver: false }
}

/** Push each pregame transition to the users who start that player. */
export async function pushStarterAlerts(
  admin: SupabaseClient,
  transitions: StatusTransition[],
  opts: { dryRun?: boolean; onlyUser?: string } = {},
): Promise<{ alerts: number; pushed: number; plan: unknown[] }> {
  let pushed = 0
  let alerts = 0
  const plan: unknown[] = []
  const withSleeper = transitions.filter((t) => t.sleeper_id)
  if (!withSleeper.length) return { alerts, pushed, plan }
    const { week, season, games } = await weekGames()
    const pregame = withSleeper.filter((t) => {
      const g = t.team ? games.get(t.team) : null
      return g && g.state === 'pre'
    })
    const sids = pregame.map((t) => t.sleeper_id as string)
    const { data: rosterRows } = sids.length
      ? await admin.from('fantasy_rosters').select('team_id, user_id, week, sleeper_id, slot, slot_label, position').in('sleeper_id', sids).eq('slot', 'starter')
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

    // Bench options per team (latest synced week), their health, and this week's projections.
    const mineIds = [...mineTeams.keys()]
    const { data: benchRows } = mineIds.length
      ? await admin.from('fantasy_rosters').select('team_id, week, sleeper_id, player_name, position, nfl_team, slot').in('team_id', mineIds).eq('slot', 'bench')
      : { data: [] }
    const benchByTeam = new Map<string, Obj[]>()
    for (const b of benchRows || []) {
      if (!b.sleeper_id || (Number(b.week) || 0) !== latest.get(str(b.team_id))) continue
      const list = benchByTeam.get(str(b.team_id)) || []
      list.push(b)
      benchByTeam.set(str(b.team_id), list)
    }
    const benchIds = [...new Set((benchRows || []).map((b) => str(b.sleeper_id)).filter(Boolean))]
    const benchHealth = new Map<string, string>()
    for (let i = 0; i < benchIds.length; i += 200) {
      const { data } = await admin.from('nfl_player_status').select('sleeper_id, status').in('sleeper_id', benchIds.slice(i, i + 200))
      for (const r of data || []) benchHealth.set(str(r.sleeper_id), str(r.status))
    }
    const proj = season ? await weekProjections(season, week) : new Map<string, Record<string, unknown>>()
    const bestBench = (teamId: string, slotLabel: string | null, starterPos: string): string | null => {
      const fits = slotFits(slotLabel, starterPos)
      const ranked = (benchByTeam.get(teamId) || [])
        .map((b) => {
          const pos = fantasyPos(str(b.position))
          const team = str(b.nfl_team).toUpperCase()
          const game = games.get(ESPN_TO_SLEEPER[team] || team)
          const health = benchHealth.get(str(b.sleeper_id)) || 'active'
          if (!fits.includes(pos) || !game || game.state !== 'pre' || RANK[health] >= 2) return null
          const pts = ptsOf(proj.get(str(b.sleeper_id))) ?? 0
          return { name: str(b.player_name), value: pts * (health === 'questionable' ? 0.85 : 1) }
        })
        .filter((x): x is { name: string; value: number } => Boolean(x && x.value > 0))
        .sort((a, b) => b.value - a.value)
      return ranked[0]?.name || null
    }

    for (const t of pregame) {
      const byUser = new Map<string, Array<{ leagueId: string; suggest: string | null }>>()
      for (const r of rosterRows || []) {
        if (str(r.sleeper_id) !== t.sleeper_id) continue
        const team = mineTeams.get(str(r.team_id))
        const league = team ? leagueById.get(str(team.league_id)) : null
        if (!team || !league || (Number(r.week) || 0) !== latest.get(str(r.team_id))) continue
        const list = byUser.get(str(r.user_id)) || []
        if (!list.some((x) => x.leagueId === str(league.id))) {
          list.push({ leagueId: str(league.id), suggest: bestBench(str(r.team_id), r.slot_label ? str(r.slot_label) : null, fantasyPos(str(r.position))) })
        }
        byUser.set(str(r.user_id), list)
      }
      const game = t.team ? games.get(t.team) || null : null
      for (const [userId, entries] of byUser) {
        if (opts.onlyUser && userId !== opts.onlyUser) continue
        const { data: prefs } = await admin.from('notification_preferences').select('push_fantasy_status').eq('user_id', userId).maybeSingle()
        if (prefs && prefs.push_fantasy_status === false) continue
        const lgIds = entries.map((e) => e.leagueId)
        const picks = entries.map((e) => ({ league: str(leagueById.get(e.leagueId)?.name) || 'fantasy', name: e.suggest }))
        const { title, body: text, waiver } = copyFor(t.status, t.name, t.injury, picks, game)
        const first = entries.find((e) => e.suggest) || entries[0]
        const url = `/?tab=fantasy&league=${encodeURIComponent(first.leagueId)}&fantasyTool=${waiver ? 'waiver' : 'start'}`
        plan.push({ userId, player: t.name, status: t.status, from: t.from, title, body: text, url })
        if (opts.dryRun) continue
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
  return { alerts, pushed, plan }
}
