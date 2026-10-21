/**
 * Weekly fantasy digest (pg_cron Wednesday 00:00 + 01:00 UTC; sends only in the Tuesday 5 PM Pacific hour).
 * For each user with NFL leagues: one push + one email with every league's outlook … playoff / title odds (season
 * simulation), injuries, top waiver add, sniper pick, trade idea. The math is the app's own modules (same numbers as
 * the home synopsis). Deduped per user + season + NFL week in `fantasy_weekly_digests`.
 * Connections not synced since Monday Night Football (Tuesday 08:00 UTC) sync first, so records and rosters include
 * last week; a failed refresh (expired ESPN / CBS login) keeps the last data and the email says so.
 * The cron run fans out one background call per user (each its own Edge time budget).
 * Body (service role / admin): { force?: true (skip the time gate), dryRun?: true (no sends, no dedupe row),
 *   onlyUser?: uuid, noEmail?: true, noRefresh?: true, background?: true (reply 202, work after) }
 */
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminOpsCorsHeaders, adminOpsJson, authorizeServiceRoleOrAdmin } from '../_shared/adminAuth.ts'
import { buildFantasyWaivers } from '../_shared/fantasyWaivers.ts'
import { fetchNflState, syncSleeperConnection } from '../_shared/fantasySleeperSync.ts'
import { syncYahooConnection } from '../_shared/fantasyYahooSync.ts'
import { syncEspnForUser } from '../_shared/fantasyEspnSync.ts'
import { syncCbsForUser } from '../_shared/fantasyCbsSync.ts'
import { type ApnsAlertPayload, sendApnsToUser } from '../_shared/apnsPush.ts'
import { sendFcmToUser } from '../_shared/fcmPush.ts'
import { sendWeb } from '../_shared/fantasyStatusPush.ts'
import { escapeHtml, transactionalEmailParagraph, wrapTransactionalEmailHtml } from '../_shared/transactionalEmail.ts'
// The app's fantasy math (plain ESM, no browser APIs).
import { playoffFormat, simulateLeague } from '../../../src/features/fantasy/fantasyLeagueOutlook.js'
import { findTrades, teamStrength, valueContext } from '../../../src/features/fantasy/fantasyTrades.js'
import { rankWaivers, rowId } from '../../../src/features/fantasy/fantasyWaivers.js'
import { rankBoom } from '../../../src/features/fantasy/fantasySniper.js'
import { injuryKey, leagueLineupSlots } from '../../../src/features/fantasy/fantasyStartSit.js'

type Obj = Record<string, any>
const str = (v: unknown) => String(v ?? '').trim()
const FRESH_STATUS_LABEL: Record<string, string | null> = { active: null, questionable: 'Questionable', doubtful: 'Doubtful', out: 'Out', ir: 'IR' }
const APP_URL = str(Deno.env.get('SUPABASE_URL')).includes('kcosfvmreeiosdjdzycb') ? 'https://lvslotpro.com' : 'https://edgetilt.com'

function pacificNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(now)
  return { weekday: parts.find((p) => p.type === 'weekday')?.value || '', hour: Number(parts.find((p) => p.type === 'hour')?.value) % 24 }
}

const pct = (p: number | null | undefined) => (p == null ? '-' : p >= 0.995 ? '99%+' : p > 0 && p < 0.01 ? '<1%' : `${Math.round(p * 100)}%`)
function ordinal(n: number) {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`
}
function shortName(name: string, position?: string | null) {
  if (/^(def|dst|d\/st)$/i.test(str(position))) {
    const words = str(name).replace(/\b(d\/st|dst|def|defense)\b\.?/gi, '').trim().split(/\s+/).filter(Boolean)
    return words.length ? `${words[words.length - 1]} D/ST` : 'D/ST'
  }
  const parts = str(name).split(/\s+/).filter(Boolean)
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : parts[0] || ''
}

const PROVIDER_LABEL: Record<string, string> = { sleeper: 'Sleeper', yahoo: 'Yahoo', espn: 'ESPN', cbs: 'CBS' }

/** Most recent Tuesday 08:00 UTC (after Monday Night Football) at or before now. */
function afterMondayNight(now = new Date()) {
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8))
  const back = (t.getUTCDay() - 2 + 7) % 7
  t.setUTCDate(t.getUTCDate() - back)
  if (t.getTime() > now.getTime()) t.setUTCDate(t.getUTCDate() - 7)
  return t
}

/** Sync this user's connections that predate the last game night; returns per-connection freshness. */
async function refreshConnections(admin: SupabaseClient, userId: string, skip: boolean) {
  const { data: conns } = await admin
    .from('fantasy_connections')
    .select('id, provider, external_user_id, status, last_sync_at')
    .eq('user_id', userId)
  const cutoff = afterMondayNight().getTime()
  const out = new Map<string, { provider: string; syncedAt: string | null; error: string | null }>()
  for (const c of conns || []) {
    let syncedAt = c.last_sync_at ? String(c.last_sync_at) : null
    let error: string | null = null
    const stale = !syncedAt || Date.parse(syncedAt) < cutoff
    if (stale && !skip && c.status !== 'revoked') {
      const res = await (async () => {
        if (c.provider === 'sleeper') return syncSleeperConnection(admin, userId, c.id, str(c.external_user_id))
        if (c.provider === 'yahoo') return syncYahooConnection(admin, userId, c.id)
        if (c.provider === 'espn') return syncEspnForUser(admin, userId)
        if (c.provider === 'cbs') return syncCbsForUser(admin, userId)
        return { ok: false, error: 'Unknown host' }
      })().catch((e) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }))
      if ((res as Obj)?.ok) syncedAt = new Date().toISOString()
      else error = str((res as Obj)?.error) || 'Sync failed'
    }
    out.set(c.id, { provider: str(c.provider), syncedAt, error })
  }
  return out
}

function agoText(iso: string | null) {
  const t = Date.parse(iso || '')
  if (!Number.isFinite(t)) return 'never synced'
  const h = (Date.now() - t) / 3_600_000
  if (h < 1) return 'synced just now'
  if (h < 36) return `synced ${Math.round(h)}h ago`
  return `as of ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(t))}`
}

/** League detail like the app's `loadLeagueDetail` (teams, latest roster week per team, injuries, this week's games). */
async function leagueDetail(admin: SupabaseClient, league: Obj) {
  const { data: teams } = await admin
    .from('fantasy_teams')
    .select('id, owner_name, team_name, is_mine, wins, losses, ties, points_for, points_against')
    .eq('league_id', league.id)
  const teamIds = (teams || []).map((t) => t.id)
  if (!teamIds.length) return null
  const { data: rows } = await admin
    .from('fantasy_rosters')
    .select('team_id, week, sleeper_id, player_name, position, nfl_team, slot, slot_label')
    .in('team_id', teamIds)
  const latest = new Map<string, number>()
  for (const r of rows || []) latest.set(r.team_id, Math.max(latest.get(r.team_id) || 0, Number(r.week) || 0))
  const current = (rows || []).filter((r) => (Number(r.week) || 0) === latest.get(r.team_id))
  const ids = [...new Set(current.map((r) => r.sleeper_id).filter(Boolean))]
  const injury: Record<string, string | null> = {}
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const [{ data: players }, { data: fresh }] = await Promise.all([
      admin.from('nfl_players').select('sleeper_id, injury_status').in('sleeper_id', chunk),
      admin.from('nfl_player_status').select('sleeper_id, status').in('sleeper_id', chunk),
    ])
    for (const p of players || []) injury[p.sleeper_id] = p.injury_status || null
    for (const s of fresh || []) if (s.sleeper_id) injury[s.sleeper_id] = FRESH_STATUS_LABEL[s.status] ?? null
  }
  const rostersByTeam: Record<string, Obj[]> = {}
  for (const r of current) {
    ;(rostersByTeam[r.team_id] ||= []).push({ ...r, injury_status: r.sleeper_id ? injury[r.sleeper_id] ?? null : null })
  }
  return { league, teams: teams || [], rostersByTeam }
}

/** One league's digest section, in the same terms as the home synopsis. */
async function leagueSection(
  admin: SupabaseClient,
  userId: string,
  league: Obj,
  week: number,
  fresh?: { provider: string; syncedAt: string | null; error: string | null },
) {
  const detail = await leagueDetail(admin, league)
  if (!detail) return null
  const mine = detail.teams.find((t) => t.is_mine)
  if (!mine) return null
  const myRows = detail.rostersByTeam[mine.id] || []
  const slots = leagueLineupSlots(league, myRows).slots
  if (!slots.length) return null
  const data = (await buildFantasyWaivers(admin, userId, league.id, { mode: 'sniper' }).catch(() => null)) as Obj | null
  const scoring = league.scoring

  let odds: { playoff: number; title: number } | null = null
  let strength = 0
  let strengthRank = 0
  if (data?.league_players) {
    const ctx = valueContext(data, scoring, 'nfl', { market: false, waivers: false })
    const byTeam: Record<string, number> = {}
    for (const t of detail.teams) byTeam[t.id] = teamStrength(detail.rostersByTeam[t.id] || [], ctx, slots)
    const sim = simulateLeague({
      teams: detail.teams.map((t) => ({ id: t.id, wins: t.wins, losses: t.losses, ties: t.ties, pointsFor: t.points_for })),
      strength: byTeam,
      week,
      pairs: [],
      format: playoffFormat(league, detail.teams.length),
    })
    odds = sim?.[mine.id] || null
    strength = byTeam[mine.id] || 0
    strengthRank = [...detail.teams].sort((a, b) => (byTeam[b.id] || 0) - (byTeam[a.id] || 0)).findIndex((t) => t.id === mine.id) + 1
  }
  const order = [...detail.teams].sort((a, b) => (b.wins || 0) - (a.wins || 0) || (Number(b.points_for) || 0) - (Number(a.points_for) || 0))
  const place = order.findIndex((t) => t.id === mine.id) + 1

  const hurt = myRows
    .filter((r) => (r.slot === 'starter' || r.slot === 'bench') && injuryKey(r.injury_status))
    .map((r) => ({ name: shortName(r.player_name, r.position), status: str(r.injury_status), starter: r.slot === 'starter' }))
    .sort((a, b) => Number(b.starter) - Number(a.starter))

  const add = data?.players?.length
    ? rankWaivers({ pool: data, rosterRows: myRows, scoring, slots, sport: 'nfl' }).find((p: Obj) => p.starter) || null
    : null
  const boom = data?.sniper ? rankBoom({ sniper: data.sniper, scoring, sport: 'nfl' })[0] || null : null
  const trades = data?.league_players ? findTrades({ values: data, detail, scoring, slots, sport: 'nfl', stance: 0.5 }) : null
  const trade = trades?.best || null

  return {
    leagueId: league.id,
    name: str(league.name) || 'League',
    provider: PROVIDER_LABEL[str(league.provider)] || str(league.provider),
    syncedAt: fresh?.syncedAt || null,
    syncError: fresh?.error || null,
    record: `${mine.wins || 0}-${mine.losses || 0}${mine.ties ? `-${mine.ties}` : ''}`,
    place,
    teams: detail.teams.length,
    odds,
    strength,
    strengthRank,
    hurt,
    add: add
      ? { name: shortName(add.cand.name, add.cand.entry?.position), pos: add.cand.pos, gain: add.gain, drop: add.drop ? shortName(add.drop.name, add.drop.row?.position) : null }
      : null,
    boom: boom ? { name: shortName(boom.entry.name, boom.entry.position), why: str(boom.reasons?.[0]) } : null,
    trade: trade
      ? {
        get: trade.get.map((p: Obj) => shortName(p.name, p.pos)).join(' + '),
        give: trade.give.map((p: Obj) => shortName(p.name, p.pos)).join(' + '),
        team: str(trade.team?.team_name),
        gain: trade.myGain,
        fairness: str(trade.fairness),
      }
      : null,
  }
}

type Section = NonNullable<Awaited<ReturnType<typeof leagueSection>>>

function pushCopy(sections: Section[], week: number) {
  const title = `Week ${week} fantasy outlook`
  const bits = sections.map((s) => {
    const lead = `${s.name}: ${ordinal(s.place)}${s.odds ? `, playoffs ${pct(s.odds.playoff)}` : ''}`
    const hurt = s.hurt.filter((h) => h.starter).length
    const extra = s.add ? `add ${s.add.name}` : hurt ? `${hurt} hurt starter${hurt > 1 ? 's' : ''}` : ''
    return extra ? `${lead} · ${extra}` : lead
  })
  return { title, body: bits.join('. ').slice(0, 220) }
}

function emailHtml(sections: Section[], week: number) {
  const blocks = sections.map((s) => {
    const lines: string[] = []
    lines.push(
      `<strong>${escapeHtml(ordinal(s.place))} of ${s.teams}</strong> (${escapeHtml(s.record)})` +
        (s.odds ? ` · Playoffs <strong>${pct(s.odds.playoff)}</strong> · Title <strong>${pct(s.odds.title)}</strong>` : ''),
    )
    if (s.strength) lines.push(`Rest-of-season lineup ${s.strength.toFixed(1)}/wk (${escapeHtml(ordinal(s.strengthRank))} best in the league)`)
    if (s.hurt.length) {
      lines.push(`Injuries: ${s.hurt.slice(0, 5).map((h) => `${escapeHtml(h.name)} (${escapeHtml(h.status)}${h.starter ? ', starting' : ''})`).join(', ')}`)
    }
    if (s.add) lines.push(`Waiver add: <strong>${escapeHtml(s.add.name)}</strong> ${escapeHtml(s.add.pos)} +${s.add.gain.toFixed(1)}/wk rest of season${s.add.drop ? ` (drop ${escapeHtml(s.add.drop)})` : ''}`)
    if (s.boom) lines.push(`Sniper: ${escapeHtml(s.boom.name)}${s.boom.why ? ` · ${escapeHtml(s.boom.why)}` : ''}`)
    if (s.trade) {
      lines.push(`Trade idea: get <strong>${escapeHtml(s.trade.get)}</strong> for ${escapeHtml(s.trade.give)} from ${escapeHtml(s.trade.team)} (+${s.trade.gain.toFixed(1)}/wk, ${escapeHtml(s.trade.fairness)})`)
    }
    const freshness = s.syncError
      ? `<span style="color:#b45309;">Could not refresh ${escapeHtml(s.provider)} (${escapeHtml(agoText(s.syncedAt))}). Open Fantasy and reconnect ${escapeHtml(s.provider)} to keep this current.</span>`
      : `<span style="color:#71717a;">${escapeHtml(s.provider)}, ${escapeHtml(agoText(s.syncedAt))}</span>`
    return (
      `<h2 style="margin:20px 0 6px;font-size:17px;line-height:1.3;color:#18181b;">${escapeHtml(s.name)}</h2>` +
      transactionalEmailParagraph(freshness, { marginBottom: '6px' }) +
      lines.map((l) => transactionalEmailParagraph(l, { marginBottom: '6px' })).join('')
    )
  })
  const html = wrapTransactionalEmailHtml({
    title: `Week ${week} fantasy outlook`,
    headline: `Your week ${week} fantasy outlook`,
    appUrl: APP_URL,
    bodyHtml: blocks.join(''),
    cta: { href: `${APP_URL}/?tab=fantasy`, label: 'Open Fantasy' },
    footerNoteHtml: 'Turn this email or push off in EdgeTilt Settings, Notifications (Fantasy: weekly outlook).',
  })
  const text = sections
    .map((s) => {
      const out = [
        `${s.name}: ${ordinal(s.place)} of ${s.teams} (${s.record})${s.odds ? `, playoffs ${pct(s.odds.playoff)}, title ${pct(s.odds.title)}` : ''}`,
        s.syncError ? `Could not refresh ${s.provider} (${agoText(s.syncedAt)}); reconnect it in Fantasy.` : `${s.provider}, ${agoText(s.syncedAt)}`,
      ]
      if (s.hurt.length) out.push(`Injuries: ${s.hurt.slice(0, 5).map((h) => `${h.name} (${h.status})`).join(', ')}`)
      if (s.add) out.push(`Waiver add: ${s.add.name} +${s.add.gain.toFixed(1)}/wk${s.add.drop ? ` (drop ${s.add.drop})` : ''}`)
      if (s.boom) out.push(`Sniper: ${s.boom.name}${s.boom.why ? ` (${s.boom.why})` : ''}`)
      if (s.trade) out.push(`Trade idea: get ${s.trade.get} for ${s.trade.give} (${s.trade.team})`)
      return out.join('\n')
    })
    .join('\n\n')
  return { html, text: `${text}\n\nOpen Fantasy: ${APP_URL}/?tab=fantasy` }
}

async function sendEmail(to: string, subject: string, html: string, text: string) {
  const key = Deno.env.get('RESEND_API_KEY')?.trim()
  if (!key) return { skipped: true, reason: 'RESEND_API_KEY not set' }
  const from = Deno.env.get('FANTASY_DIGEST_EMAIL_FROM')?.trim() || Deno.env.get('RESEND_FROM')?.trim() || 'EdgeTilt <noreply@auth.edgetilt.com>'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  })
  if (!res.ok) return { error: `Resend ${res.status}` }
  const body = (await res.json().catch(() => ({}))) as Obj
  return { id: body?.id ? String(body.id) : null }
}

type Opts = { force?: boolean; dryRun?: boolean; onlyUser?: string; noEmail?: boolean; noRefresh?: boolean; background?: boolean }

/** One user's digest: refresh stale hosts, build every NFL league's section, push + email once per week. */
async function processUser(admin: SupabaseClient, userId: string, season: number, week: number, opts: Opts) {
  const { data: prefs } = await admin
    .from('notification_preferences')
    .select('push_fantasy_digest, email_fantasy_digest')
    .eq('user_id', userId)
    .maybeSingle()
  const wantPush = !prefs || prefs.push_fantasy_digest !== false
  const wantEmail = !opts.noEmail && (!prefs || prefs.email_fantasy_digest !== false)
  if (!wantPush && !wantEmail) return { userId, skipped: 'opted out' }
  if (!opts.dryRun) {
    const { data: done } = await admin
      .from('fantasy_weekly_digests')
      .select('id')
      .eq('user_id', userId)
      .eq('season', season)
      .eq('week', week)
      .maybeSingle()
    if (done) return { userId, skipped: 'already sent' }
  }

  const fresh = await refreshConnections(admin, userId, Boolean(opts.noRefresh))
  const { data: leagues } = await admin
    .from('fantasy_leagues')
    .select('id, user_id, connection_id, name, provider, sport, season, scoring, settings')
    .eq('user_id', userId)
    .eq('sport', 'nfl')
    .eq('season', season)
  const sections: Section[] = []
  for (const lg of leagues || []) {
    const s = await leagueSection(admin, userId, lg, week, fresh.get(lg.connection_id)).catch((e) => {
      console.error('digest league', lg.id, e)
      return null
    })
    if (s) sections.push(s)
  }
  if (!sections.length) return { userId, skipped: 'no leagues' }
  const { title, body: text } = pushCopy(sections, week)
  const refreshed = [...fresh.values()].map((f) => ({ provider: f.provider, syncedAt: f.syncedAt, error: f.error }))
  if (opts.dryRun) return { userId, title, body: text, refreshed, sections }

  const { data: inserted } = await admin
    .from('fantasy_weekly_digests')
    .upsert({ user_id: userId, season, week, league_ids: sections.map((s) => s.leagueId), title, body: text }, {
      onConflict: 'user_id,season,week',
      ignoreDuplicates: true,
    })
    .select('id')
  if (!inserted?.length) return { userId, skipped: 'already sent' }

  const sent: Obj = { refreshed }
  let pushed = false
  let emailed = false
  if (wantPush) {
    const payload = { title, body: text, url: '/?tab=fantasy', eventType: 'fantasy_digest' } as ApnsAlertPayload
    const [apns, fcm, web] = await Promise.all([
      sendApnsToUser(admin, userId, payload).catch((e) => ({ error: String(e) })),
      sendFcmToUser(admin, userId, payload).catch((e) => ({ error: String(e) })),
      sendWeb(admin, userId, payload).catch((e) => ({ error: String(e) })),
    ])
    Object.assign(sent, { apns, fcm, web })
    pushed = [apns, fcm, web].some((r) => Number((r as Obj)?.sent) > 0)
  }
  if (wantEmail) {
    const { data: user } = await admin.auth.admin.getUserById(userId)
    const to = str(user?.user?.email)
    if (to && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      const { html, text: plain } = emailHtml(sections, week)
      sent.email = await sendEmail(to, `Your week ${week} fantasy outlook`, html, plain).catch((e) => ({ error: String(e) }))
      emailed = Boolean((sent.email as Obj)?.id)
    }
  }
  await admin.from('fantasy_weekly_digests').update({ sent }).eq('id', inserted[0].id)
  return { userId, title, pushed, emailed, refreshed }
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
  const pt = pacificNow()
  if (!body.force && !(pt.weekday === 'Tue' && pt.hour === 17)) return adminOpsJson(200, { ok: true, ran: false, pacific: pt })

  try {
    const state = await fetchNflState()
    const season = Number(state.season)
    const week = Math.max(1, Number(state.week) || 1)

    if (body.onlyUser) {
      const work = processUser(admin, body.onlyUser, season, week, body)
      if (body.background && typeof EdgeRuntime !== 'undefined') {
        EdgeRuntime.waitUntil(work.catch((e) => console.error('digest user', body.onlyUser, e)))
        return adminOpsJson(202, { ok: true, queued: body.onlyUser })
      }
      return adminOpsJson(200, { ok: true, ran: true, season, week, result: await work })
    }

    const { data: rows, error } = await admin.from('fantasy_leagues').select('user_id').eq('sport', 'nfl').eq('season', season)
    if (error) throw new Error(error.message)
    const users = [...new Set((rows || []).map((r) => str(r.user_id)).filter(Boolean))]
    if (body.dryRun) {
      const plan = []
      for (const u of users) plan.push(await processUser(admin, u, season, week, body))
      return adminOpsJson(200, { ok: true, ran: true, season, week, users: users.length, plan })
    }

    // One background call per user so a slow host sync or a big league cannot eat another user's time.
    const self = `${str(Deno.env.get('SUPABASE_URL')).replace(/\/$/, '')}/functions/v1/fantasy-weekly-digest`
    const auth = req.headers.get('Authorization') || ''
    const queued: string[] = []
    for (let i = 0; i < users.length; i += 5) {
      await Promise.all(
        users.slice(i, i + 5).map(async (u) => {
          const res = await fetch(self, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: auth, apikey: auth.replace(/^Bearer\s+/i, '') },
            body: JSON.stringify({ onlyUser: u, force: true, background: true, noEmail: body.noEmail }),
          }).catch(() => null)
          if (res?.ok) queued.push(u)
        }),
      )
    }
    return adminOpsJson(200, { ok: true, ran: true, season, week, users: users.length, queued: queued.length })
  } catch (err) {
    return adminOpsJson(500, { error: err instanceof Error ? err.message : 'Digest failed.' })
  }
})
