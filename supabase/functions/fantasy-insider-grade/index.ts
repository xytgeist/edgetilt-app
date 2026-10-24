/**
 * Grades insider statuses against what happened (pg_cron daily 13:00 UTC; admin / service role may send
 * { force_scorecard: true, dryRun: true }).
 *
 * For each Out / Doubtful / IR an insider post set in the last 21 days: find the player's next game after the post
 * (Sleeper schedule + ESPN kickoffs). Once it is final: Out / IR is confirmed if he did not play (Sleeper weekly
 * stats), contradicted if he did; Doubtful is confirmed if he sat, otherwise left unconfirmed (a doubtful player
 * playing is not a misread). Contradicted statuses email ops right away and join `fantasy_insider_regression`.
 * A source under 90% accuracy over its last 20 graded statuses (10+ graded) loses push trust (`push_trusted`).
 * NBA statuses grade the same way off ESPN's NBA scoreboard and box score (played = logged minutes).
 * Tuesdays (ET): run the regression set through the live prompt and email the weekly scorecard.
 */
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminOpsCorsHeaders, adminOpsJson, authorizeServiceRoleOrAdmin } from '../_shared/adminAuth.ts'
import { fetchJson, loadGames, normTeam, statMap, type GameRow } from '../_shared/fantasyLineupCards.ts'
import { ESPN_NBA, ESPN_NFL, ESPN_TO_SLEEPER, espnJson } from '../_shared/fantasyStatusPush.ts'
import { nbaTeam } from '../_shared/fantasyNbaBoard.ts'
import { lookupNbaEspnId, nbaEspnIds } from '../_shared/nbaEspnIds.ts'
import { sleeperNbaPlayers } from '../_shared/sleeperNbaPlayers.ts'

const LOOKBACK_DAYS = 21
const DEMOTE_WINDOW = 20
const DEMOTE_MIN = 10
const DEMOTE_BELOW = 0.9
const COST_PER_POST = 0.005

type Obj = Record<string, unknown>
const str = (v: unknown) => String(v ?? '').trim()
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? v as Obj : {})
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') as Obj[] : [])

function etWeekday(d = new Date()) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(d)
}

/** ESPN kickoffs for one week: team (Sleeper style) → { kickoff, final }. */
const kickCache = new Map<number, Promise<Map<string, { kickoff: number; final: boolean }>>>()
function weekKickoffs(week: number) {
  if (!kickCache.has(week)) {
    kickCache.set(
      week,
      espnJson(`${ESPN_NFL}/scoreboard?seasontype=2&week=${week}`, 10_000).then((body) => {
        const out = new Map<string, { kickoff: number; final: boolean }>()
        for (const ev of arr(body?.events)) {
          const comp = arr(ev.competitions)[0]
          const final = str(obj(obj(comp?.status).type).state) === 'post'
          for (const c of arr(comp?.competitors)) {
            const abbr = str(obj(c.team).abbreviation).toUpperCase()
            out.set(ESPN_TO_SLEEPER[abbr] || abbr, { kickoff: Date.parse(str(ev.date)), final })
          }
        }
        return out
      }),
    )
  }
  return kickCache.get(week)!
}

const statsCache = new Map<string, Promise<Map<string, Record<string, unknown>>>>()
function weekStats(season: string, week: number) {
  const key = `${season}:${week}`
  if (!statsCache.has(key)) {
    statsCache.set(key, fetchJson(`https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`).then(statMap).catch(() => new Map()))
  }
  return statsCache.get(key)!
}

function played(stats: Record<string, unknown> | undefined): boolean {
  if (!stats) return false
  const n = (k: string) => Number(stats[k]) || 0
  return n('gp') > 0 || n('off_snp') > 0 || n('st_snp') > 0 || n('fga') > 0 || n('xpa') > 0
}

/** First game for this team that kicks off after `postedAt`. */
async function nextGame(games: GameRow[], team: string, postedAt: number) {
  const t = normTeam(team)
  const weeks = [...new Set(games.filter((g) => g.home === t || g.away === t).map((g) => g.week))].sort((a, b) => a - b)
  for (const week of weeks) {
    const g = games.find((x) => x.week === week && (x.home === t || x.away === t))!
    const day = Date.parse(`${g.date}T23:59:59-05:00`)
    if (Number.isFinite(day) && day < postedAt - 36 * 3600 * 1000) continue
    const kicks = await weekKickoffs(week)
    const k = kicks.get(t)
    if (k && k.kickoff > postedAt) return { week, kickoff: k.kickoff, final: k.final || g.status === 'complete' }
  }
  return null
}

const ET_YMD = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })

/** ESPN NBA scoreboard for one ET date (YYYYMMDD): team → { id, tip, final }. */
const nbaDayCache = new Map<string, Promise<Map<string, { id: string; tip: number; final: boolean }>>>()
function nbaDay(ymd: string) {
  if (!nbaDayCache.has(ymd)) {
    nbaDayCache.set(
      ymd,
      espnJson(`${ESPN_NBA}/scoreboard?dates=${ymd}`, 10_000).then((body) => {
        const out = new Map<string, { id: string; tip: number; final: boolean }>()
        for (const ev of arr(body?.events)) {
          const comp = arr(ev.competitions)[0]
          const final = str(obj(obj(comp?.status).type).state) === 'post'
          for (const c of arr(comp?.competitors)) {
            out.set(nbaTeam(str(obj(c.team).abbreviation)), { id: str(ev.id), tip: Date.parse(str(ev.date)), final })
          }
        }
        return out
      }).catch(() => new Map()),
    )
  }
  return nbaDayCache.get(ymd)!
}

/** First NBA game for this team that tips after `postedAt` (looks up to six days ahead). */
async function nbaNextGame(team: string, postedAt: number) {
  const t = nbaTeam(team)
  for (let d = 0; d < 7; d++) {
    const ymd = ET_YMD.format(new Date(postedAt + d * 86400_000)).replace(/-/g, '')
    const g = (await nbaDay(ymd)).get(t)
    if (g && g.tip > postedAt) return g
  }
  return null
}

/** ESPN athlete ids who logged minutes in one final game (inactive players are not in the box at all). */
const nbaBoxCache = new Map<string, Promise<Map<string, number>>>()
function nbaMinutes(eventId: string) {
  if (!nbaBoxCache.has(eventId)) {
    nbaBoxCache.set(
      eventId,
      espnJson(`${ESPN_NBA}/summary?event=${eventId}`, 10_000).then((body) => {
        const out = new Map<string, number>()
        for (const team of arr(obj(body?.boxscore).players)) {
          for (const st of arr(team.statistics)) {
            const names = (Array.isArray(st.names) ? st.names : st.labels) as unknown[] | undefined
            const minAt = Math.max(0, (names || []).findIndex((n) => str(n).toUpperCase() === 'MIN'))
            for (const a of arr(st.athletes)) {
              const id = str(obj(a.athlete).id)
              const mins = a.didNotPlay ? 0 : Number((a.stats as unknown[] | undefined)?.[minAt]) || 0
              if (id) out.set(id, mins)
            }
          }
        }
        return out
      }).catch(() => new Map()),
    )
  }
  return nbaBoxCache.get(eventId)!
}

function alertRecipients(): string[] {
  const raw = Deno.env.get('FANTASY_ALERT_EMAILS')?.trim() || Deno.env.get('BILLING_ADMIN_ALERT_EMAILS')?.trim() || ''
  return [...new Set(raw.split(/[,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))]
}

async function sendEmail(subject: string, text: string) {
  const key = Deno.env.get('RESEND_API_KEY')?.trim()
  const to = alertRecipients()
  if (!key || !to.length) return { sent: false, reason: !key ? 'no RESEND_API_KEY' : 'no recipients' }
  const from = Deno.env.get('FANTASY_ALERT_FROM')?.trim() || Deno.env.get('RESEND_FROM')?.trim() || 'EdgeTilt <noreply@auth.edgetilt.com>'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject: `${(Deno.env.get('SUPABASE_URL') || '').includes('kcosfvmreeiosdjdzycb') ? '[test] ' : ''}${subject}`, text }),
  })
  return { sent: res.ok, status: res.status }
}

const pct = (n: number) => `${Math.round(n * 100)}%`

async function runRegression() {
  const base = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!base || !key) return null
  const res = await fetch(`${base}/functions/v1/fantasy-insider-poll`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ regression: true }),
    signal: AbortSignal.timeout(280_000),
  })
  if (!res.ok) return { error: `regression ${res.status}` }
  return await res.json() as Obj
}

async function scorecard(admin: SupabaseClient) {
  const since = new Date(Date.now() - 7 * 86400_000).toISOString()
  const since30 = new Date(Date.now() - 30 * 86400_000).toISOString()
  const [{ data: logs }, { data: rows }, { data: graded }, { data: sources }, { data: alerts }] = await Promise.all([
    admin.from('fantasy_insider_poll_log').select('fetched, by_handle').gte('polled_at', since).limit(10000),
    admin.from('fantasy_insider_news').select('handle, status').gte('posted_at', since).limit(10000),
    admin.from('fantasy_insider_news').select('handle, grade, espn_lead_min, author_name, text, url, next_status, status_trusted, grade_note, posted_at')
      .in('grade', ['confirmed', 'contradicted']).gte('posted_at', since30).limit(5000),
    admin.from('fantasy_insider_sources').select('handle, display_name, kind, team, active, push_trusted, demote_reason'),
    admin.from('fantasy_status_alerts').select('id, sent').gte('created_at', since).limit(10000),
  ])
  const read = new Map<string, number>()
  let readTotal = 0
  for (const l of logs || []) {
    readTotal += Number(l.fetched) || 0
    for (const [h, n] of Object.entries(obj(l.by_handle))) read.set(h, (read.get(h) || 0) + (Number(n) || 0))
  }
  const kept = new Map<string, number>()
  for (const r of rows || []) if (r.status === 'show') kept.set(str(r.handle), (kept.get(str(r.handle)) || 0) + 1)
  const grades = new Map<string, { ok: number; bad: number; leads: number[] }>()
  for (const g of graded || []) {
    const e = grades.get(str(g.handle)) || { ok: 0, bad: 0, leads: [] }
    if (g.grade === 'confirmed') e.ok++
    else e.bad++
    if (Number.isFinite(Number(g.espn_lead_min)) && g.espn_lead_min != null) e.leads.push(Number(g.espn_lead_min))
    grades.set(str(g.handle), e)
  }
  const pushes = (alerts || []).length
  const lines: string[] = []
  lines.push(`X posts read (7d): ${readTotal} (~$${(readTotal * COST_PER_POST).toFixed(2)})`)
  lines.push(`Starter pushes logged (7d): ${pushes}`)
  lines.push('')
  lines.push('Per source (7d posts read / kept items; 30d status accuracy / median minutes ahead of ESPN):')
  const srcList = (sources || []).filter((s) => s.active).sort((a, b) => (read.get(str(b.handle)) || 0) - (read.get(str(a.handle)) || 0))
  for (const s of srcList) {
    const h = str(s.handle)
    const g = grades.get(h)
    const total = g ? g.ok + g.bad : 0
    const lead = g?.leads.length ? [...g.leads].sort((a, b) => a - b)[Math.floor(g.leads.length / 2)] : null
    const trust = s.push_trusted === false ? ` [PUSH OFF: ${str(s.demote_reason)}]` : ''
    lines.push(
      `  @${h}${s.team ? ` (${s.team})` : ''}: read ${read.get(h) || 0} ($${((read.get(h) || 0) * COST_PER_POST).toFixed(2)}), kept ${kept.get(h) || 0}` +
        `${total ? `, accuracy ${pct(g!.ok / total)} of ${total}` : ''}${lead != null ? `, ${lead} min ahead` : ''}${trust}`,
    )
  }
  const bad = (graded || []).filter((g) => g.grade === 'contradicted' && Date.parse(str(g.posted_at)) >= Date.parse(since))
  if (bad.length) {
    lines.push('')
    lines.push('Contradicted this week:')
    for (const b of bad) lines.push(`  @${b.handle} said ${b.next_status}${b.status_trusted ? ' (trusted)' : ''}: ${str(b.grade_note)} | ${str(b.text).slice(0, 160)} | ${b.url}`)
  }
  return lines
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
  const body = (await req.json().catch(() => ({}))) as { force_scorecard?: boolean; dryRun?: boolean }

  try {
    const state = (await fetchJson('https://api.sleeper.app/v1/state/nfl')) as { season?: string }
    const season = str(state?.season)
    const games = season ? await loadGames(season) : []

    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString()
    const { data: rows, error } = await admin
      .from('fantasy_insider_news')
      .select('tweet_id, handle, author_name, posted_at, text, url, next_status, status_sleeper_id, status_trusted, next_statuses, grade')
      // NFL pass: NFL schedule + Sleeper NFL stats (NBA ids collide; NBA has its own pass below).
      .eq('sport', 'nfl')
      .in('next_status', ['out', 'ir', 'doubtful'])
      .not('status_sleeper_id', 'is', null)
      .gte('posted_at', since)
      .or('grade.is.null,grade.eq.unconfirmed')
      .limit(1000)
    if (error) throw new Error(error.message)

    const BLOCKING = new Set(['out', 'ir', 'doubtful'])
    const entriesOf = (r: Obj): Array<{ sleeper_id: string; status: string }> => {
      const list = arr(r.next_statuses)
        .map((e) => ({ sleeper_id: str(e.sleeper_id), status: str(e.status) }))
        .filter((e) => e.sleeper_id && BLOCKING.has(e.status))
      return list.length ? list : [{ sleeper_id: str(r.status_sleeper_id), status: str(r.next_status) }]
    }
    const sids = [...new Set((rows || []).flatMap((r) => entriesOf(r).map((e) => e.sleeper_id)))]
    const { data: players } = sids.length ? await admin.from('nfl_players').select('sleeper_id, full_name, team').in('sleeper_id', sids) : { data: [] }
    const { data: espn } = sids.length ? await admin.from('nfl_player_status').select('sleeper_id, status, changed_at').in('sleeper_id', sids) : { data: [] }
    const playerBy = new Map((players || []).map((p) => [str(p.sleeper_id), p]))
    const espnBy = new Map((espn || []).map((p) => [str(p.sleeper_id), p]))

    let confirmed = 0
    let contradicted = 0
    let pending = 0
    const newContradictions: Obj[] = []
    /** Saves one graded post; a contradiction joins the regression set and the ops email. */
    const record = async (r: Obj, grade: string, note: string, lead: number | null, playerName: string) => {
      if (grade === 'confirmed') confirmed++
      else contradicted++
      if (body.dryRun) return
      await admin.from('fantasy_insider_news').update({ grade, grade_note: note, graded_at: new Date().toISOString(), espn_lead_min: lead }).eq('tweet_id', r.tweet_id)
      if (grade === 'contradicted') {
        newContradictions.push({ ...r, player: playerName, note })
        await admin.from('fantasy_insider_regression').upsert(
          { handle: str(r.handle), text: str(r.text), posted_at: str(r.posted_at) || null, expected_next: 'none', expected_player: playerName, origin: 'contradicted', note: `auto ${note}; review label` },
          { onConflict: 'handle,text', ignoreDuplicates: true },
        )
      }
    }
    for (const r of rows || []) {
      const posted = Date.parse(str(r.posted_at))
      if (!Number.isFinite(posted)) continue
      const notes: string[] = []
      const leads: number[] = []
      let anyBad = false
      let allDone = true
      let badPlayer = ''
      for (const entry of entriesOf(r)) {
        const p = playerBy.get(entry.sleeper_id)
        if (!p?.team) {
          allDone = false
          continue
        }
        const e = espnBy.get(entry.sleeper_id)
        const changed = e?.changed_at ? Date.parse(str(e.changed_at)) : NaN
        if (e && BLOCKING.has(str(e.status)) && Number.isFinite(changed) && changed > posted) leads.push(Math.round((changed - posted) / 60000))
        const game = await nextGame(games, str(p.team), posted)
        if (!game?.final || !season) {
          allDone = false
          continue
        }
        const stats = (await weekStats(season, game.week)).get(entry.sleeper_id)
        const didPlay = played(stats)
        if (entry.status === 'doubtful') {
          if (didPlay) allDone = false
          else notes.push(`${p.full_name} sat week ${game.week}`)
        } else if (didPlay) {
          anyBad = true
          badPlayer = badPlayer || str(p.full_name)
          notes.push(`${p.full_name} played week ${game.week}${stats?.off_snp ? ` (${stats.off_snp} snaps)` : ''}`)
        } else {
          notes.push(`${p.full_name} did not play week ${game.week}`)
        }
      }
      const grade: string | null = anyBad ? 'contradicted' : allDone && notes.length ? 'confirmed' : null
      const note = notes.join('; ')
      const lead = leads.length ? Math.min(...leads) : null
      const p = { full_name: badPlayer || str(playerBy.get(str(r.status_sleeper_id))?.full_name) }
      if (!grade) {
        pending++
        continue
      }
      await record(r, grade, note, lead, p.full_name)
    }

    // NBA: ESPN NBA schedule + box scores (Sleeper NBA ids collide with NFL ones, so nothing above is reused).
    const { data: nbaRows, error: nbaErr } = await admin
      .from('fantasy_insider_news')
      .select('tweet_id, handle, author_name, posted_at, text, url, next_status, status_sleeper_id, status_trusted, next_statuses, grade')
      .eq('sport', 'nba')
      .in('next_status', ['out', 'ir', 'doubtful'])
      .not('status_sleeper_id', 'is', null)
      .gte('posted_at', since)
      .or('grade.is.null,grade.eq.unconfirmed')
      .limit(1000)
    if (nbaErr) throw new Error(nbaErr.message)
    if ((nbaRows || []).length) {
      const [nbaPlayers, espnIds] = await Promise.all([sleeperNbaPlayers(admin).catch(() => []), nbaEspnIds(admin).catch(() => new Map<string, string>())])
      const nbaBy = new Map(nbaPlayers.map((p) => [p.sleeper_id, p]))
      const nbaSids = [...new Set((nbaRows || []).flatMap((r) => entriesOf(r).map((e) => e.sleeper_id)))]
      const { data: nbaEspn } = nbaSids.length ? await admin.from('nba_player_status').select('sleeper_id, status, changed_at').in('sleeper_id', nbaSids) : { data: [] }
      const nbaEspnBy = new Map((nbaEspn || []).map((p) => [str(p.sleeper_id), p]))
      for (const r of nbaRows || []) {
        const posted = Date.parse(str(r.posted_at))
        if (!Number.isFinite(posted)) continue
        const notes: string[] = []
        const leads: number[] = []
        let anyBad = false
        let allDone = true
        let badPlayer = ''
        for (const entry of entriesOf(r)) {
          const p = nbaBy.get(entry.sleeper_id)
          const athlete = p ? lookupNbaEspnId(espnIds, p.name, p.team) : ''
          if (!p?.team || !athlete) {
            allDone = false
            continue
          }
          const e = nbaEspnBy.get(entry.sleeper_id)
          const changed = e?.changed_at ? Date.parse(str(e.changed_at)) : NaN
          if (e && BLOCKING.has(str(e.status)) && Number.isFinite(changed) && changed > posted) leads.push(Math.round((changed - posted) / 60000))
          const game = await nbaNextGame(p.team, posted)
          if (!game?.final) {
            allDone = false
            continue
          }
          const mins = (await nbaMinutes(game.id)).get(athlete) || 0
          const day = ET_YMD.format(new Date(game.tip))
          if (entry.status === 'doubtful') {
            if (mins > 0) allDone = false
            else notes.push(`${p.name} sat ${day}`)
          } else if (mins > 0) {
            anyBad = true
            badPlayer = badPlayer || p.name
            notes.push(`${p.name} played ${day} (${mins} min)`)
          } else {
            notes.push(`${p.name} did not play ${day}`)
          }
        }
        const grade: string | null = anyBad ? 'contradicted' : allDone && notes.length ? 'confirmed' : null
        if (!grade) {
          pending++
          continue
        }
        await record(r, grade, notes.join('; '), leads.length ? Math.min(...leads) : null, badPlayer || str(nbaBy.get(str(r.status_sleeper_id))?.name))
      }
    }

    // Demote sources whose recent statuses keep missing. Never re-promotes on its own.
    const demoted: string[] = []
    if (!body.dryRun) {
      const { data: srcs } = await admin.from('fantasy_insider_sources').select('handle, push_trusted').eq('active', true).eq('push_trusted', true)
      for (const s of srcs || []) {
        const { data: recent } = await admin
          .from('fantasy_insider_news')
          .select('grade')
          .eq('handle', s.handle)
          .in('grade', ['confirmed', 'contradicted'])
          .order('posted_at', { ascending: false })
          .limit(DEMOTE_WINDOW)
        const n = (recent || []).length
        const ok = (recent || []).filter((x) => x.grade === 'confirmed').length
        if (n >= DEMOTE_MIN && ok / n < DEMOTE_BELOW) {
          const reason = `accuracy ${pct(ok / n)} over last ${n} graded statuses`
          await admin.from('fantasy_insider_sources').update({ push_trusted: false, demoted_at: new Date().toISOString(), demote_reason: reason }).eq('handle', s.handle)
          demoted.push(`@${s.handle}: ${reason}`)
        }
      }
    }

    if (!body.dryRun && (newContradictions.length || demoted.length)) {
      const lines = [
        ...newContradictions.map((c) => `@${c.handle} said ${c.next_status} for ${c.player}${c.status_trusted ? ' (trusted, may have pushed)' : ''}: ${c.note}\n  ${str(c.text).slice(0, 240)}\n  ${c.url}`),
        ...(demoted.length ? ['', 'Push trust removed:', ...demoted] : []),
        '',
        'Contradicted posts were added to the regression set with expected "none" … relabel if the post itself was right.',
      ]
      await sendEmail(`Fantasy insider check: ${newContradictions.length} contradicted${demoted.length ? `, ${demoted.length} demoted` : ''}`, lines.join('\n'))
    }

    let card: unknown = null
    if (body.force_scorecard || etWeekday() === 'Tue') {
      const lines = await scorecard(admin)
      const reg = await runRegression()
      const regLines: string[] = []
      if (reg && !('error' in reg)) {
        regLines.push(`Regression: ${reg.passed}/${reg.cases} passed (${reg.false_alarms} false alarms, ${reg.misses} misses)`)
        for (const f of arr(reg.failures).slice(0, 25)) {
          regLines.push(`  [${f.kind}] @${f.handle} expected ${f.expected}${f.expected_player ? ` ${f.expected_player}` : ''}, got ${f.got || 'none'}${f.got_player ? ` ${f.got_player}` : ''} (${f.origin}): ${str(f.text).slice(0, 140)}`)
        }
      } else {
        regLines.push(`Regression: not run (${reg ? str((reg as Obj).error) : 'missing env'})`)
      }
      card = { lines, regLines }
      if (!body.dryRun) await sendEmail('Fantasy insider weekly scorecard', [...regLines, '', ...lines].join('\n'))
    }

    return adminOpsJson(200, { ok: true, graded: confirmed + contradicted, confirmed, contradicted, pending, demoted, scorecard: card })
  } catch (err) {
    return adminOpsJson(502, { error: err instanceof Error ? err.message : String(err) })
  }
})
