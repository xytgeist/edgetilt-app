/**
 * Weekly fantasy digest (pg_cron Wednesday 00:00 + 01:00 UTC; sends only in the Tuesday 5 PM Pacific hour).
 * For each user with NFL leagues: one push + one email with every league's outlook … playoff / title odds (season
 * simulation), injuries, top waiver add, sniper pick, trade idea. The math is the app's own modules (same numbers as
 * the home synopsis). Deduped per user + season + NFL week in `fantasy_weekly_digests`.
 * Connections not synced since Monday Night Football (Tuesday 08:00 UTC) sync first, so records and rosters include
 * last week; a failed refresh (expired ESPN / CBS login) keeps the last data and the email says so.
 * The cron run fans out one background call per user (each its own Edge time budget).
 * Body (service role / admin): { force?: true (skip the time gate), dryRun?: true (no sends, no dedupe row),
 *   onlyUser?: uuid, noEmail?: true, noRefresh?: true, background?: true (reply 202, work after),
 *   preview?: true (with dryRun: return the email HTML) }
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
import { findFlips, findTrades, teamStrength, valueContext } from '../../../src/features/fantasy/fantasyTrades.js'
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
/** Full name for prose; defenses read as "Raiders D/ST". */
function displayName(name: string, position?: string | null) {
  return /^(def|dst|d\/st)$/i.test(str(position)) ? shortName(name, position) : str(name)
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
    .map((r) => ({ name: displayName(r.player_name, r.position), status: str(r.injury_status), starter: r.slot === 'starter' }))
    .sort((a, b) => Number(b.starter) - Number(a.starter))

  const add = data?.players?.length
    ? rankWaivers({ pool: data, rosterRows: myRows, scoring, slots, sport: 'nfl' }).find((p: Obj) => p.starter) || null
    : null
  // Boom pick is a different player from the waiver add, so the email never pitches the same name twice.
  const addId = add ? str(add.cand.id) : ''
  const boom = data?.sniper
    ? rankBoom({ sniper: data.sniper, scoring, sport: 'nfl' }).find((b: Obj) => str(b.entry?.sleeper_id) !== addId) || null
    : null
  const trades = data?.league_players ? findTrades({ values: data, detail, scoring, slots, sport: 'nfl', stance: 0.5 }) : null
  const trade = trades?.best || null
  const flips = data?.league_players && data?.players?.length
    ? findFlips({ values: data, pool: data, detail, scoring, slots, sport: 'nfl' })
    : []
  const flip = flips[0] || null
  const weekly = (p: Obj | null) => (p ? Number(p.rosWeekly ?? p.value) || 0 : 0)
  const names = (list: Obj[]) => list.map((p) => displayName(p.name, p.pos)).join(' + ')

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
      ? {
        name: displayName(add.cand.name, add.cand.entry?.position),
        pos: str(add.cand.pos),
        team: str(add.cand.entry?.team),
        weekly: Number(add.candWeekly) || weekly(add.cand),
        gain: add.gain,
        over: add.replaced ? displayName(add.replaced.name, add.replaced.row?.position) : null,
        overWeekly: weekly(add.replaced),
        drop: add.drop ? displayName(add.drop.name, add.drop.row?.position) : null,
        dropWeekly: weekly(add.drop),
      }
      : null,
    flip: flip
      ? {
        pickup: displayName(flip.pickup.name, flip.pickup.pos),
        pickupPos: str(flip.pickup.pos),
        team: str(flip.team?.team_name),
        lost: displayName(flip.lost.name, flip.lost.pos),
        lostStatus: flip.lost.h?.injury === 'long' ? 'on IR' : flip.lost.h?.injury === 'doubtful' ? 'doubtful' : 'out',
        fillGain: Number(flip.fillGain) || 0,
        alsoGive: flip.give.slice(1).map((p: Obj) => displayName(p.name, p.pos)),
        get: names(flip.get),
        myGain: Number(flip.myGain) || 0,
        rivals: Math.max(0, (flip.rivalsWanting?.length || 0) - 1),
      }
      : null,
    boom: boom
      ? {
        name: displayName(boom.entry.name, boom.entry.position),
        pos: str(boom.entry.position),
        team: str(boom.entry.team),
        opponent: str(boom.entry.opponent),
        home: Boolean(boom.entry.home),
        proj: Number(boom.proj) || 0,
        hold: Boolean(boom.hold),
        signals: boom.signals || {},
      }
      : null,
    trade: trade
      ? {
        get: names(trade.get),
        give: names(trade.give),
        team: str(trade.team?.team_name),
        gain: Number(trade.myGain) || 0,
        slot: (str(trade.forYou).match(/starts at (\S+)/) || [])[1] || '',
        // The app writes this to the other manager ("would start at RB for you"); the email talks about them.
        forThem: str(trade.forThemCasual)
          .replace(/\bfor you\b/g, 'for them')
          .replace(/\bgives you\b/g, 'gives them')
          .replace(/\byou'd\b/g, "they'd"),
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

/** Plain-English read on the odds, so the email sounds like a person, not a stat sheet. */
function oddsTake(s: Section) {
  const p = s.odds?.playoff
  if (p == null) return ''
  const t = s.odds?.title ?? 0
  const title = t >= 0.01 ? ` and about a ${pct(t)} shot at winning it all` : ''
  if (p >= 0.85) return `You're in great shape. We give you a ${pct(p)} chance to make the playoffs${title}.`
  if (p >= 0.6) return `You're looking good: a ${pct(p)} chance at the playoffs${title}.`
  if (p >= 0.35) return `It's basically a coin flip right now, ${pct(p)} to make the playoffs${title}. A good week or two swings it.`
  if (p >= 0.1) return `You've got some work to do. We have you at ${pct(p)} to sneak into the playoffs, so every win counts from here.`
  return `It's an uphill climb (${pct(p)} to make the playoffs), so this is the time to swing for upside.`
}

function strengthTake(s: Section) {
  if (!s.strengthRank) return ''
  if (s.strengthRank <= 3) return `The good news: your lineup projects as the ${ordinal(s.strengthRank)} best in the league the rest of the way, so you've got the horses.`
  if (s.strengthRank > s.teams - 3) return `On paper your lineup projects ${ordinal(s.strengthRank)} of ${s.teams} the rest of the way, so a move or two would really help.`
  return `Your lineup projects ${ordinal(s.strengthRank)} of ${s.teams} the rest of the way.`
}

const statusWord = (st: string) => (/^ir$/i.test(st) ? 'IR' : st.toLowerCase())

const STAT_WORD: Record<string, string> = { pass_yds: 'passing yards', rush_yds: 'rushing yards', rec_yds: 'receiving yards' }
const joinNames = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] || '')

type Callout = { kind: 'injury' | 'injuryOut' | 'waiver' | 'flip' | 'boom' | 'trade' | 'warn'; label: string; headline: string; body: string }

function callouts(s: Section): Callout[] {
  const out: Callout[] = []
  if (s.syncError) {
    out.push({
      kind: 'warn',
      label: 'Heads up',
      headline: `We couldn't refresh your ${s.provider} league`,
      body: `This is ${agoText(s.syncedAt)}, so it might be a step behind. Reconnecting ${s.provider} in Fantasy fixes it, and next week's check-in will be current.`,
    })
  }
  const starters = s.hurt.filter((h) => h.starter)
  const bench = s.hurt.filter((h) => !h.starter)
  if (s.hurt.length) {
    const anyOut = starters.some((h) => /^(out|ir|o)$/i.test(h.status))
    const parts: string[] = []
    if (starters.length) {
      parts.push(
        `${joinNames(starters.slice(0, 3).map((h) => `${h.name} (${statusWord(h.status)})`))} ${starters.length > 1 ? 'are' : 'is'} in your starting lineup.` +
          (anyOut
            ? ' Anyone ruled out scores zero, so get a healthy player in that spot before kickoff. Start/Sit in the app already has the swap lined up.'
            : ' Watch the reports before kickoff. If anyone gets ruled out, Start/Sit in the app will tell you who to slide in.'),
      )
    }
    if (bench.length) {
      parts.push(`On the bench, ${joinNames(bench.slice(0, 3).map((h) => `${h.name} (${statusWord(h.status)})`))} ${bench.length > 1 ? 'are' : 'is'} banged up${bench.some((h) => /ir/i.test(h.status)) ? ', and an IR stash is a roster spot you could use on a pickup' : ''}.`)
    }
    out.push({
      kind: anyOut ? 'injuryOut' : 'injury',
      label: 'Injuries',
      headline: starters.length ? `${starters.length} starter${starters.length > 1 ? 's' : ''} banged up` : 'Bench injuries only',
      body: parts.join(' '),
    })
  }
  if (s.add) {
    const a = s.add
    const team = a.team ? `, ${a.team}` : ''
    const vs = a.over
      ? `He projects for about ${a.weekly.toFixed(1)} points a week the rest of the season, more than ${a.over} (${a.overWeekly.toFixed(1)}) gives you in that lineup spot. Swapping him in is worth roughly +${a.gain.toFixed(1)} a week.`
      : `He projects for about ${a.weekly.toFixed(1)} points a week the rest of the season and would crack your starting lineup (+${a.gain.toFixed(1)} a week).`
    const room = a.drop
      ? ` To make room, ${a.drop} is the easiest cut: he's your lowest-projected player the rest of the way (${a.dropWeekly.toFixed(1)} a week).`
      : ' You may need to free up a roster spot to add him.'
    out.push({ kind: 'waiver', label: 'Waiver pickup', headline: `Grab ${a.name} (${a.pos}${team})`, body: `${a.name} is sitting on your waiver wire. ${vs}${room}` })
  }
  if (s.flip) {
    const f = s.flip
    const extra = f.alsoGive.length ? ` (plus ${joinNames(f.alsoGive)})` : ''
    const rivals = f.rivals > 0 ? ` ${f.rivals === 1 ? 'Another team' : `${f.rivals} other teams`} could use him too, so don't sleep on it.` : ''
    out.push({
      kind: 'flip',
      label: 'Snipe and flip',
      headline: `Snipe ${f.pickup} and trade him to ${f.team}`,
      body:
        `${f.team} just lost ${f.lost} (${f.lostStatus}), and ${f.pickup} would slide right into their lineup, about +${f.fillGain.toFixed(1)} a week for them. ` +
        `Grab him off the wire before they do, then offer him${extra} to ${f.team} for ${f.get}. ` +
        `${f.get} would start for you, worth about +${f.myGain.toFixed(1)} a week the rest of the way.${rivals}`,
    })
  }
  if (s.boom) {
    const b = s.boom
    const sig = b.signals || {}
    const game = b.opponent ? ` ${b.home ? 'vs' : '@'} ${b.opponent}` : ''
    const bits: string[] = []
    if (sig.nextUp?.length) bits.push(`He's next man up with ${joinNames(sig.nextUp)} hurt, so the volume should be there.`)
    if (sig.ladder) bits.push(`The betting market gives him about a ${Math.round(sig.ladder.price * 100)}% chance at ${sig.ladder.strike}+ ${STAT_WORD[sig.ladder.stat] || sig.ladder.word}.`)
    if (sig.td) bits.push(`It also has him around ${Math.round(sig.td.price * 100)}% to find the end zone.`)
    if (sig.matchup) bits.push(`And the matchup is a soft one: that defense ranks #${sig.matchup.rank} easiest for ${b.pos}s.`)
    bits.push(b.hold ? "He's good enough to hold past this week, too." : "Think of him as a one-week swing for upside, not a long-term add.")
    out.push({
      kind: 'boom',
      label: 'Boom pick',
      headline: `${b.name} (${b.pos}, ${b.team}${game})`,
      body: `If you need a ceiling this week, he's the free agent to look at, projecting about ${b.proj.toFixed(1)} points. ${bits.join(' ')}`,
    })
  }
  if (s.trade) {
    const t = s.trade
    const fair = /win-win/i.test(t.fairness)
      ? "It's a win-win, which is the easiest kind of trade to get done."
      : /you win/i.test(t.fairness)
        ? 'You come out ahead on value, so expect a little pushback.'
        : /they win/i.test(t.fairness)
          ? 'They come out ahead on value, which should make it an easy yes for them.'
          : 'The value is about even.'
    out.push({
      kind: 'trade',
      label: 'Trade idea',
      headline: `${t.give} for ${t.get}`,
      body:
        `Offer ${t.give} to ${t.team} for ${t.get}. ${t.get} would start${t.slot ? ` at ${t.slot}` : ''} for you, worth about +${t.gain.toFixed(1)} a week the rest of the way.` +
        `${t.forThem ? ` For them, ${t.forThem}.` : ''} ${fair}`,
    })
  }
  return out
}

const CALLOUT_STYLE: Record<Callout['kind'], { bar: string; tint: string; label: string }> = {
  warn: { bar: '#d97706', tint: '#fffbeb', label: '#b45309' },
  injury: { bar: '#f59e0b', tint: '#fffbeb', label: '#b45309' },
  injuryOut: { bar: '#e11d48', tint: '#fff1f2', label: '#be123c' },
  waiver: { bar: '#16a34a', tint: '#f0fdf4', label: '#15803d' },
  flip: { bar: '#7c3aed', tint: '#f5f3ff', label: '#6d28d9' },
  boom: { bar: '#ea580c', tint: '#fff7ed', label: '#c2410c' },
  trade: { bar: '#2563eb', tint: '#eff6ff', label: '#1d4ed8' },
}

function calloutHtml(c: Callout) {
  const st = CALLOUT_STYLE[c.kind]
  return (
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 12px;border-collapse:separate;">` +
    `<tr><td width="4" style="width:4px;background:${st.bar};border-radius:4px 0 0 4px;font-size:0;line-height:0;">&nbsp;</td>` +
    `<td style="padding:12px 14px;background:${st.tint};border-radius:0 12px 12px 0;">` +
    `<div style="font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${st.label};">${escapeHtml(c.label)}</div>` +
    `<div style="margin:3px 0 5px;font-size:16px;font-weight:700;line-height:1.35;color:#18181b;">${escapeHtml(c.headline)}</div>` +
    `<div style="font-size:14px;line-height:1.6;color:#3f3f46;">${escapeHtml(c.body)}</div>` +
    `</td></tr></table>`
  )
}

function statCell(value: string, label: string) {
  return (
    `<td align="center" style="padding:6px 4px;">` +
    `<div style="font-size:22px;font-weight:800;line-height:1.1;color:#fafafa;">${escapeHtml(value)}</div>` +
    `<div style="margin-top:3px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#a1a1aa;">${escapeHtml(label)}</div>` +
    `</td>`
  )
}

function leagueCardHtml(s: Section) {
  const p = s.odds?.playoff ?? null
  const fill = p == null ? 0 : Math.max(2, Math.min(100, Math.round(p * 100)))
  const barColor = p == null ? '#52525b' : p >= 0.6 ? '#22c55e' : p >= 0.3 ? '#f59e0b' : '#f43f5e'
  const meta = `${s.provider} · ${agoText(s.syncedAt)}`
  const bar =
    p == null
      ? ''
      : `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px;border-collapse:separate;">` +
        `<tr><td style="padding:0;background:#3f3f46;border-radius:999px;height:8px;font-size:0;line-height:0;">` +
        `<table role="presentation" width="${fill}%" cellspacing="0" cellpadding="0"><tr><td style="background:${barColor};border-radius:999px;height:8px;font-size:0;line-height:0;">&nbsp;</td></tr></table>` +
        `</td></tr></table>` +
        `<div style="margin-top:6px;font-size:11px;color:#a1a1aa;">Playoff odds from 3,000 simulated rest-of-seasons</div>`
  const summary = [oddsTake(s), strengthTake(s)].filter(Boolean).join(' ')
  return (
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0 0;border:1px solid #e4e4e7;border-radius:18px;border-collapse:separate;overflow:hidden;">` +
    `<tr><td style="padding:18px 18px 16px;background:#18181b;border-radius:18px 18px 0 0;">` +
    `<div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;">${escapeHtml(meta)}</div>` +
    `<div style="margin-top:3px;font-size:20px;font-weight:800;line-height:1.25;color:#fafafa;">${escapeHtml(s.name)}</div>` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px;"><tr>` +
    statCell(ordinal(s.place), `of ${s.teams}`) +
    statCell(s.record, 'Record') +
    statCell(pct(s.odds?.playoff), 'Playoffs') +
    statCell(pct(s.odds?.title), 'Title') +
    `</tr></table>` +
    bar +
    `</td></tr>` +
    `<tr><td style="padding:16px 16px 6px;background:#ffffff;border-radius:0 0 18px 18px;">` +
    (summary ? `<div style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#27272a;">${escapeHtml(summary)}</div>` : '') +
    callouts(s).map(calloutHtml).join('') +
    `</td></tr></table>`
  )
}

function emailHtml(sections: Section[], week: number, firstName: string) {
  const hello = firstName ? `Hey ${firstName},` : 'Hey there,'
  const intro =
    `Here's your week ${week} check-in. ${sections.length > 1 ? `We looked at all ${sections.length} of your leagues` : 'We looked at your league'}: ` +
    `where you stand, who's banged up, and a few moves worth making before the waiver run.`
  const outro = `Good luck this week. Everything here is live in the app with the full breakdown, so tap in before you make a move.`
  const html = wrapTransactionalEmailHtml({
    title: `Your week ${week} fantasy check-in`,
    headline: hello,
    appUrl: APP_URL,
    bodyHtml:
      transactionalEmailParagraph(escapeHtml(intro)) +
      sections.map(leagueCardHtml).join('') +
      `<div style="margin:24px 0 16px;font-size:15px;line-height:1.6;color:#52525b;">${escapeHtml(outro)}</div>`,
    cta: { href: `${APP_URL}/?tab=fantasy`, label: 'Open Fantasy' },
    footerNoteHtml: "Don't want these? Turn them off in EdgeTilt Settings, Notifications (Fantasy: weekly outlook).",
  })
  const text = [
    hello,
    '',
    intro,
    '',
    ...sections.flatMap((s) => [
      `${s.name.toUpperCase()} (${s.provider}, ${agoText(s.syncedAt)})`,
      `${ordinal(s.place)} of ${s.teams} · ${s.record} · Playoffs ${pct(s.odds?.playoff)} · Title ${pct(s.odds?.title)}`,
      [oddsTake(s), strengthTake(s)].filter(Boolean).join(' '),
      ...callouts(s).map((c) => `${c.label}: ${c.headline}. ${c.body}`),
      '',
    ]),
    outro,
    `Open Fantasy: ${APP_URL}/?tab=fantasy`,
  ].join('\n')
  return { html, text }
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

type Opts = {
  force?: boolean
  dryRun?: boolean
  onlyUser?: string
  noEmail?: boolean
  noRefresh?: boolean
  background?: boolean
  /** With dryRun: also return the rendered email HTML. */
  preview?: boolean
}

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
  if (opts.dryRun) {
    if (!opts.preview) return { userId, title, body: text, refreshed, sections }
    const { data: profile } = await admin.from('profiles').select('display_name').eq('id', userId).maybeSingle()
    const { html } = emailHtml(sections, week, str(profile?.display_name).split(/\s+/)[0] || '')
    return { userId, title, body: text, refreshed, sections, html }
  }

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
      const { data: profile } = await admin.from('profiles').select('display_name').eq('id', userId).maybeSingle()
      const firstName = str(profile?.display_name).split(/\s+/)[0] || ''
      const { html, text: plain } = emailHtml(sections, week, firstName)
      sent.email = await sendEmail(to, `Your week ${week} fantasy check-in`, html, plain).catch((e) => ({ error: String(e) }))
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
