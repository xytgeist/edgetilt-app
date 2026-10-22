/**
 * Starter status pushes (pg_cron every 5 min; admin / service role may send { force, dryRun }).
 * Reads ESPN's league-wide NFL (or, with { sport: "nba" }, NBA) injury report once per run, keeps each player's fantasy game designation in
 * `nfl_player_status`, and when a player moves up to Out / Doubtful / IR before his game kicks off, pushes every
 * user who starts him (one push per user, player, status, and week … `fantasy_status_alerts`). The first run only
 * seeds the table so current injuries never fire as new.
 *
 * Cadence (ET): Sun 8-17, Mon + Thu 16-21, Wed-Sat 11-20 every tick; 7-24 otherwise every 30 min; overnight hourly.
 */
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminOpsCorsHeaders, adminOpsJson, authorizeServiceRoleOrAdmin } from '../_shared/adminAuth.ts'
import { ESPN_NBA, ESPN_NFL, RANK, espnJson, pushStarterAlerts, type StatusTransition } from '../_shared/fantasyStatusPush.ts'
import { sleeperNbaPlayers } from '../_shared/sleeperNbaPlayers.ts'
import { lookupNbaEspnId, nbaEspnIds } from '../_shared/nbaEspnIds.ts'


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

/** NBA plays nightly: injury reports move through the afternoon into tip-off. */
function nbaRunGapMs(d = new Date()): number {
  const { hour } = etParts(d)
  if (hour >= 11) return 4 * 60 * 1000
  if (hour >= 7) return 29 * 60 * 1000
  return 59 * 60 * 1000
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
  // NBA: game-time decision / day-to-day reads as questionable (never pushed).
  if (/^(GTD|DTD)$/.test(s) || s.startsWith('DAY')) return 'questionable'
  if (/^IR/.test(s)) return 'ir'
  return 'active'
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
    /** `nba` reads ESPN's NBA report into `nba_player_status` (own cron, own state row). */
    sport?: string
  }
  const now = new Date()
  const nba = body.sport === 'nba'
  const stateId = nba ? 'watch_nba' : 'watch'
  const statusTable = nba ? 'nba_player_status' : 'nfl_player_status'

  const cutoff = new Date(now.getTime() - (body.force ? 0 : nba ? nbaRunGapMs(now) : runGapMs(now))).toISOString()
  const { data: claimed, error: claimErr } = await admin
    .from('fantasy_status_watch_state')
    .update({ last_run_at: now.toISOString(), updated_at: now.toISOString() })
    .eq('id', stateId)
    .or(`last_run_at.is.null,last_run_at.lt.${cutoff}`)
    .select('seeded')
  if (claimErr) return adminOpsJson(500, { error: claimErr.message })
  if (!claimed?.length) return adminOpsJson(200, { ok: true, ran: false })
  const seeded = Boolean(claimed[0]?.seeded)

  try {
    const report = await espnJson(`${nba ? ESPN_NBA : ESPN_NFL}/injuries`)
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
    // NBA has no players table with ESPN ids: map Sleeper's NBA players through the ESPN roster ids.
    const nbaPlayers: Obj[] = []
    if (nba) {
      const [all, espnIds] = await Promise.all([sleeperNbaPlayers(admin), nbaEspnIds(admin)])
      for (const p of all) {
        const espnId = lookupNbaEspnId(espnIds, p.name, p.team)
        if (espnId) nbaPlayers.push({ sleeper_id: p.sleeper_id, espn_id: espnId, full_name: p.name, team: p.team })
      }
    }
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200)
      const [k, p] = await Promise.all([
        admin.from(statusTable).select('espn_id, status, changed_at').in('espn_id', chunk),
        nba
          ? Promise.resolve({ data: nbaPlayers.filter((x) => chunk.includes(String(x.espn_id))), error: null })
          : admin.from('nfl_players').select('sleeper_id, espn_id, full_name, team').in('espn_id', chunk),
      ])
      if (k.error) throw new Error(k.error.message)
      known.push(...(k.data || []))
      players.push(...(p.data || []))
    }
    const prior = new Map(known.map((k) => [str(k.espn_id), k]))
    const bySleeper = new Map(players.map((p) => [str(p.espn_id), p]))

    const nowIso = now.toISOString()
    const transitions: StatusTransition[] = []
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
    const { data: stale } = await admin.from(statusTable).select('espn_id').neq('status', 'active')
    const cleared = (stale || []).map((s) => str(s.espn_id)).filter((id) => !reported.has(id))

    if (!body.dryRun && !sim) {
      for (let i = 0; i < upserts.length; i += 500) {
        const { error } = await admin.from(statusTable).upsert(upserts.slice(i, i + 500), { onConflict: 'espn_id' })
        if (error) throw new Error(error.message)
      }
      if (cleared.length) {
        await admin.from(statusTable).update({ status: 'active', changed_at: nowIso, updated_at: nowIso }).in('espn_id', cleared)
      }
    }

    const { alerts, pushed, plan } = await pushStarterAlerts(admin, transitions, { dryRun: body.dryRun, onlyUser: body.onlyUser, sport: nba ? 'nba' : 'nfl' })

    if (!body.dryRun) {
      await admin.from('fantasy_status_watch_state').update({ seeded: true, last_error: null, updated_at: new Date().toISOString() }).eq('id', stateId)
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
    await admin.from('fantasy_status_watch_state').update({ last_error: message.slice(0, 500), updated_at: new Date().toISOString() }).eq('id', stateId)
    return adminOpsJson(502, { error: message })
  }
})
