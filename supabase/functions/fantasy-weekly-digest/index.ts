/**
 * Weekly fantasy digest (pg_cron Wednesday 00:00 + 01:00 UTC; sends only in the Tuesday 5 PM Pacific hour).
 * For each user with NFL leagues: one push + one email with every league's outlook … playoff / title odds (season
 * simulation), injuries, top waiver add, sniper pick, trade idea. The math is the app's own modules (same numbers as
 * the home synopsis). Deduped per user + season + NFL week in `fantasy_weekly_digests`.
 * Body (service role / admin): { force?: true (skip the time gate), dryRun?: true (no sends, no dedupe row),
 *   onlyUser?: uuid, noEmail?: true }
 */
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminOpsCorsHeaders, adminOpsJson, authorizeServiceRoleOrAdmin } from '../_shared/adminAuth.ts'
import { buildFantasyWaivers } from '../_shared/fantasyWaivers.ts'
import { fetchNflState } from '../_shared/fantasySleeperSync.ts'
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
async function leagueSection(admin: SupabaseClient, userId: string, league: Obj, week: number) {
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
    return (
      `<h2 style="margin:20px 0 6px;font-size:17px;line-height:1.3;color:#18181b;">${escapeHtml(s.name)}</h2>` +
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
      const out = [`${s.name}: ${ordinal(s.place)} of ${s.teams} (${s.record})${s.odds ? `, playoffs ${pct(s.odds.playoff)}, title ${pct(s.odds.title)}` : ''}`]
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: adminOpsCorsHeaders })
  let admin: SupabaseClient
  try {
    admin = await authorizeServiceRoleOrAdmin(req)
  } catch (res) {
    if (res instanceof Response) return res
    return adminOpsJson(401, { error: 'Unauthorized' })
  }
  const body = (await req.json().catch(() => ({}))) as { force?: boolean; dryRun?: boolean; onlyUser?: string; noEmail?: boolean }
  const pt = pacificNow()
  if (!body.force && !(pt.weekday === 'Tue' && pt.hour === 17)) return adminOpsJson(200, { ok: true, ran: false, pacific: pt })

  try {
    const state = await fetchNflState()
    const season = Number(state.season)
    const week = Math.max(1, Number(state.week) || 1)
    let q = admin.from('fantasy_leagues').select('id, user_id, name, provider, sport, season, scoring, settings').eq('sport', 'nfl').eq('season', season)
    if (body.onlyUser) q = q.eq('user_id', body.onlyUser)
    const { data: leagues, error } = await q
    if (error) throw new Error(error.message)
    const byUser = new Map<string, Obj[]>()
    for (const lg of leagues || []) byUser.set(lg.user_id, [...(byUser.get(lg.user_id) || []), lg])

    const plan: Obj[] = []
    let pushed = 0
    let emailed = 0
    for (const [userId, list] of byUser) {
      const { data: prefs } = await admin
        .from('notification_preferences')
        .select('push_fantasy_digest, email_fantasy_digest')
        .eq('user_id', userId)
        .maybeSingle()
      const wantPush = !prefs || prefs.push_fantasy_digest !== false
      const wantEmail = !body.noEmail && (!prefs || prefs.email_fantasy_digest !== false)
      if (!wantPush && !wantEmail) continue

      const sections: Section[] = []
      for (const lg of list) {
        const s = await leagueSection(admin, userId, lg, week).catch((e) => {
          console.error('digest league', lg.id, e)
          return null
        })
        if (s) sections.push(s)
      }
      if (!sections.length) continue
      const { title, body: text } = pushCopy(sections, week)
      plan.push({ userId, title, body: text, leagues: sections.length, sections: body.dryRun ? sections : undefined })
      if (body.dryRun) continue

      const { data: inserted } = await admin
        .from('fantasy_weekly_digests')
        .upsert({ user_id: userId, season, week, league_ids: sections.map((s) => s.leagueId), title, body: text }, {
          onConflict: 'user_id,season,week',
          ignoreDuplicates: true,
        })
        .select('id')
      if (!inserted?.length) continue

      const sent: Obj = {}
      if (wantPush) {
        const payload: ApnsAlertPayload = { title, body: text, url: '/?tab=fantasy', eventType: 'fantasy_digest' } as ApnsAlertPayload
        const [apns, fcm, web] = await Promise.all([
          sendApnsToUser(admin, userId, payload).catch((e) => ({ error: String(e) })),
          sendFcmToUser(admin, userId, payload).catch((e) => ({ error: String(e) })),
          sendWeb(admin, userId, payload).catch((e) => ({ error: String(e) })),
        ])
        Object.assign(sent, { apns, fcm, web })
        if ([apns, fcm, web].some((r) => Number((r as Obj)?.sent) > 0)) pushed++
      }
      if (wantEmail) {
        const { data: user } = await admin.auth.admin.getUserById(userId)
        const to = str(user?.user?.email)
        if (to && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
          const { html, text: plain } = emailHtml(sections, week)
          sent.email = await sendEmail(to, `Your week ${week} fantasy outlook`, html, plain).catch((e) => ({ error: String(e) }))
          if ((sent.email as Obj)?.id) emailed++
        }
      }
      await admin.from('fantasy_weekly_digests').update({ sent }).eq('id', inserted[0].id)
    }
    return adminOpsJson(200, { ok: true, ran: true, season, week, users: byUser.size, digests: plan.length, pushed, emailed, plan })
  } catch (err) {
    return adminOpsJson(500, { error: err instanceof Error ? err.message : 'Digest failed.' })
  }
})
