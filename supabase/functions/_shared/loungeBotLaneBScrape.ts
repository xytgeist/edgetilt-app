/**
 * Lane B discover + scrape (VSiN / Covers / Boyds / BetFirms).
 * Soft-fail: never throw into slate lock. Upserts syndicate_lane_b_tickets.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { OddsEvent } from './loungeBotOddsCaption.ts'

export type LaneBMarket = 'side' | 'total' | 'ml'

export type LaneBParsedTicket = {
  source_id: string
  sport_key: string
  event_id: string | null
  matchup_text: string
  market: LaneBMarket
  selection: string
  line: number | null
  posted_at: string
  source_url: string
  weight_factor: number
  raw_excerpt: string
}

export type LaneBRefreshResult = {
  ok: boolean
  scrape_run_id: string
  discovered_urls: number
  fetched_ok: number
  tickets_parsed: number
  tickets_upserted: number
  matched_events: number
  errors: string[]
  soft_fail?: boolean
}

type SourceDef = {
  source_id: string
  weight_factor: number
  authorHints: string[]
}

const VSIN_AUTHORS: SourceDef[] = [
  { source_id: 'vsin_makinen', weight_factor: 1, authorHints: ['makinen'] },
  { source_id: 'vsin_tuley', weight_factor: 1, authorHints: ['tuley', 'tuleys-takes'] },
  { source_id: 'vsin_burke', weight_factor: 1, authorHints: ['burke'] },
  { source_id: 'vsin_youmans', weight_factor: 1, authorHints: ['youmans'] },
  { source_id: 'vsin_alexander', weight_factor: 1, authorHints: ['beatingthebook', 'alexander', 'a-numbers-game'] },
]

const FETCH_TIMEOUT_MS = 12_000
const MAX_ARTICLE_FETCHES = 18

function sportIsCfb(sportKey: string): boolean {
  return sportKey.includes('ncaaf')
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function isTeamMatch(a: string, b: string): boolean {
  const t = String(a || '').trim().toLowerCase()
  const c = String(b || '').trim().toLowerCase()
  if (!t || !c) return false
  if (t === c) return true
  if (t.includes(c) || c.includes(t)) return true
  const tLast = t.split(/\s+/).pop() || ''
  const cLast = c.split(/\s+/).pop() || ''
  return Boolean(tLast && cLast && tLast.length >= 4 && tLast === cLast)
}

async function fetchText(url: string): Promise<string | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'EdgeTilt-SyndicateLaneB/1.0 (+https://sharpesyndicate.com/ops)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function absolutize(href: string, base: string): string | null {
  try {
    return new URL(href, base).href
  } catch {
    return null
  }
}

function extractLinks(html: string, base: string): string[] {
  const out: string[] = []
  const re = /href=["']([^"']+)["']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const abs = absolutize(m[1], base)
    if (abs) out.push(abs.split('#')[0])
  }
  return [...new Set(out)]
}

function pickVsinArticles(links: string[], sportKey: string): Array<{ url: string; source_id: string; weight_factor: number }> {
  const wantCfb = sportIsCfb(sportKey)
  const picked: Array<{ url: string; source_id: string; weight_factor: number }> = []
  for (const url of links) {
    const u = url.toLowerCase()
    if (!u.includes('vsin.com')) continue
    if (wantCfb && !(u.includes('college') || u.includes('ncaaf') || u.includes('cfb'))) {
      if (!u.includes('best-bet') && !u.includes('tuley') && !u.includes('makinen')) continue
    }
    if (!wantCfb && !(u.includes('/nfl') || u.includes('nfl-'))) {
      if (!u.includes('best-bet') && !u.includes('tuley') && !u.includes('makinen')) continue
    }
    for (const src of VSIN_AUTHORS) {
      if (src.authorHints.some((h) => u.includes(h))) {
        picked.push({ url, source_id: src.source_id, weight_factor: src.weight_factor })
        break
      }
    }
  }
  return picked.slice(0, 12)
}

function pickCoversPowers(links: string[]): Array<{ url: string; source_id: string; weight_factor: number }> {
  return links
    .filter((u) => {
      const x = u.toLowerCase()
      return x.includes('covers.com') && x.includes('brad-powers')
    })
    .slice(0, 6)
    .map((url) => ({ url, source_id: 'covers_powers', weight_factor: 1 }))
}

function pickBoydsJack(links: string[]): Array<{ url: string; source_id: string; weight_factor: number }> {
  const out: Array<{ url: string; source_id: string; weight_factor: number }> = []
  for (const url of links) {
    const u = url.toLowerCase()
    if (u.includes('boydsbets.com') && (u.includes('pick') || u.includes('free') || u.includes('/nfl') || u.includes('cfb') || u.includes('ncaaf'))) {
      out.push({ url, source_id: 'boydsbets_site', weight_factor: 0.5 })
    }
    if ((u.includes('betfirms') || u.includes('sportscapping')) && u.includes('pick')) {
      out.push({ url, source_id: 'betfirms_jack', weight_factor: 0.5 })
    }
  }
  return out.slice(0, 6)
}

type RawPlay = {
  selection: string
  line: number | null
  market: LaneBMarket
  excerpt: string
}

function parsePlaysFromText(text: string): RawPlay[] {
  const plays: RawPlay[] = []
  const seen = new Set<string>()

  const push = (selection: string, line: number | null, market: LaneBMarket, excerpt: string) => {
    const sel = selection.replace(/\s+/g, ' ').trim()
    if (!sel || sel.length < 3 || sel.length > 80) return
    const key = `${market}|${sel.toLowerCase()}|${line ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    plays.push({ selection: sel, line, market, excerpt: excerpt.slice(0, 240) })
  }

  // Best Bet: Liberty +6.5 / College Football Best Bet: Give me Toledo +10
  const bestBetRe =
    /(?:college\s+football\s+)?best\s+bets?\s*[:\-–]?\s*(?:give\s+me\s+)?([A-Za-z0-9 .&'()-]+?)\s*([+-]\d+(?:\.\d+)?)\b/gi
  let m: RegExpExecArray | null
  while ((m = bestBetRe.exec(text))) {
    const sel = m[1].trim()
    if (/^under\b|^over\b/i.test(sel)) {
      const ou = sel.match(/^(over|under)\s+(\d+(?:\.\d+)?)/i)
      if (ou) push(ou[1], Number(ou[2]), 'total', m[0])
      continue
    }
    if (/give\s+me|with\s+|in\s+/i.test(sel)) continue
    push(sel, Number(m[2]), 'side', m[0])
  }

  // Give me UNDER 56.5 / Give me Toledo +10 (Makinen voice)
  const giveMeOu = /give\s+me\s+(over|under)\s+(\d+(?:\.\d+)?)/gi
  while ((m = giveMeOu.exec(text))) {
    push(m[1], Number(m[2]), 'total', m[0])
  }
  const giveMeSide = /give\s+me\s+([A-Za-z0-9 .&'()-]{3,40}?)\s*([+-]\d+(?:\.\d+)?)\b/gi
  while ((m = giveMeSide.exec(text))) {
    const sel = m[1].trim()
    if (/^(over|under|the|a|an)$/i.test(sel)) continue
    push(sel, Number(m[2]), 'side', m[0])
  }

  // The play: Baylor +7.5
  const playRe = /the\s+play\s*[:\-–]\s*([A-Za-z0-9 .&'()-]+?)\s*([+-]\d+(?:\.\d+)?)\b/gi
  while ((m = playRe.exec(text))) {
    push(m[1], Number(m[2]), 'side', m[0])
  }

  // Over / Under totals (standalone)
  const ouRe = /\b(Over|Under)\s+(\d+(?:\.\d+)?)\b/gi
  while ((m = ouRe.exec(text))) {
    push(m[1], Number(m[2]), 'total', m[0])
  }

  // Standalone Team +7.5 near "bet" language (conservative)
  const sideRe =
    /(?:play|bet|take|lean)\s+(?:on\s+)?([A-Za-z0-9 .&'()-]{3,40}?)\s*([+-]\d+(?:\.\d+)?)\b/gi
  while ((m = sideRe.exec(text))) {
    const sel = m[1].trim()
    if (/^(over|under|the|a|an|to|at|give|me)$/i.test(sel)) continue
    if (/give\s+me/i.test(sel)) continue
    push(sel, Number(m[2]), 'side', m[0])
  }

  return plays.slice(0, 40)
}

function matchEventForSide(
  events: OddsEvent[],
  selection: string,
  line: number | null,
): { event: OddsEvent; matchup_text: string; selectionOut: string } | null {
  for (const ev of events) {
    const home = String(ev.home_team || '')
    const away = String(ev.away_team || '')
    const matchup = `${away} @ ${home}`
    if (isTeamMatch(selection, home)) {
      return { event: ev, matchup_text: matchup, selectionOut: home }
    }
    if (isTeamMatch(selection, away)) {
      return { event: ev, matchup_text: matchup, selectionOut: away }
    }
  }
  // Fuzzy: selection may be "Liberty" while event has "Liberty Flames"
  const selLast = selection.trim().toLowerCase().split(/\s+/).pop() || ''
  if (selLast.length >= 4) {
    for (const ev of events) {
      const home = String(ev.home_team || '')
      const away = String(ev.away_team || '')
      if (home.toLowerCase().includes(selLast) || away.toLowerCase().includes(selLast)) {
        const hit = home.toLowerCase().includes(selLast) ? home : away
        return { event: ev, matchup_text: `${away} @ ${home}`, selectionOut: hit }
      }
    }
  }
  void line
  return null
}

function matchEventForTotal(events: OddsEvent[], excerpt: string): OddsEvent | null {
  // Prefer events whose team names appear in excerpt
  for (const ev of events) {
    const home = String(ev.home_team || '')
    const away = String(ev.away_team || '')
    if (isTeamMatch(excerpt, home) || isTeamMatch(excerpt, away)) return ev
    const homeLast = home.split(/\s+/).pop()?.toLowerCase() || ''
    const awayLast = away.split(/\s+/).pop()?.toLowerCase() || ''
    const ex = excerpt.toLowerCase()
    if ((homeLast.length >= 4 && ex.includes(homeLast)) || (awayLast.length >= 4 && ex.includes(awayLast))) {
      return ev
    }
  }
  return null
}

async function discoverArticleTargets(sportKey: string): Promise<Array<{ url: string; source_id: string; weight_factor: number }>> {
  const hubs = sportIsCfb(sportKey)
    ? [
      'https://vsin.com/college-football/',
      'https://vsin.com/nfl/vsin-football-article-calendar/',
      'https://www.covers.com/picks/ncaaf',
      'https://www.covers.com/ncaaf',
      'https://boydsbets.com/',
    ]
    : [
      'https://vsin.com/nfl/',
      'https://vsin.com/nfl/vsin-football-article-calendar/',
      'https://boydsbets.com/',
    ]

  const allLinks: string[] = []
  for (const hub of hubs) {
    const html = await fetchText(hub)
    if (!html) continue
    allLinks.push(...extractLinks(html, hub))
  }

  // Seed known weekly patterns (still validated by fetch)
  if (sportIsCfb(sportKey)) {
    allLinks.push(
      'https://vsin.com/college-football/tuleys-takes-week-1-college-football-best-bets-predictions-and-picks/',
      'https://vsin.com/college-football/steve-makinen-college-football-week-1-best-bets-predictions-and-picks/',
      'https://www.covers.com/ncaaf/brad-powers-college-football-power-rankings-week-1-2026',
      'https://www.covers.com/ncaaf/brad-powers-top-picks-week-0-2026',
    )
  }

  const merged = [
    ...pickVsinArticles(allLinks, sportKey),
    ...pickCoversPowers(allLinks),
    ...pickBoydsJack(allLinks),
  ]

  const dedup = new Map<string, { url: string; source_id: string; weight_factor: number }>()
  for (const row of merged) {
    if (!dedup.has(row.url)) dedup.set(row.url, row)
  }
  return [...dedup.values()].slice(0, MAX_ARTICLE_FETCHES)
}

/**
 * Discover + scrape + upsert Lane B tickets for the current slate events.
 * Soft-fail: returns ok:false with soft_fail on unexpected errors; never throws.
 */
export async function refreshLaneBTicketsForSlate(
  admin: SupabaseClient,
  sportKey: string,
  events: OddsEvent[],
): Promise<LaneBRefreshResult> {
  const scrape_run_id = crypto.randomUUID()
  const errors: string[] = []
  const empty = (extra?: Partial<LaneBRefreshResult>): LaneBRefreshResult => ({
    ok: false,
    scrape_run_id,
    discovered_urls: 0,
    fetched_ok: 0,
    tickets_parsed: 0,
    tickets_upserted: 0,
    matched_events: 0,
    errors,
    soft_fail: true,
    ...extra,
  })

  try {
    const targets = await discoverArticleTargets(sportKey)
    if (!targets.length) {
      return { ...empty(), ok: true, soft_fail: false, errors: ['no article URLs discovered'] }
    }

    const tickets: LaneBParsedTicket[] = []
    let fetched_ok = 0
    const postedAt = new Date().toISOString()

    for (const t of targets) {
      const html = await fetchText(t.url)
      if (!html) {
        errors.push(`fetch_fail:${t.url}`)
        continue
      }
      fetched_ok++
      const text = stripHtml(html)
      const plays = parsePlaysFromText(text)
      for (const play of plays) {
        if (play.market === 'total') {
          const ev = matchEventForTotal(events, `${play.excerpt} ${text.slice(0, 500)}`)
          const matchup = ev
            ? `${ev.away_team} @ ${ev.home_team}`
            : 'unmatched total'
          tickets.push({
            source_id: t.source_id,
            sport_key: sportKey,
            event_id: ev?.id ?? null,
            matchup_text: matchup,
            market: 'total',
            selection: play.selection,
            line: play.line,
            posted_at: postedAt,
            source_url: t.url,
            weight_factor: t.weight_factor,
            raw_excerpt: play.excerpt,
          })
          continue
        }

        const matched = matchEventForSide(events, play.selection, play.line)
        tickets.push({
          source_id: t.source_id,
          sport_key: sportKey,
          event_id: matched?.event.id ?? null,
          matchup_text: matched?.matchup_text ?? play.selection,
          market: 'side',
          selection: matched?.selectionOut ?? play.selection,
          line: play.line,
          posted_at: postedAt,
          source_url: t.url,
          weight_factor: t.weight_factor,
          raw_excerpt: play.excerpt,
        })
      }
    }

    let upserted = 0
    let matched_events = 0
    for (const row of tickets) {
      if (row.event_id) matched_events++
      const { error: insErr } = await admin.from('syndicate_lane_b_tickets').insert({
        source_id: row.source_id,
        sport_key: row.sport_key,
        event_id: row.event_id,
        matchup_text: row.matchup_text,
        market: row.market,
        selection: row.selection,
        line: row.line,
        posted_at: row.posted_at,
        source_url: row.source_url,
        weight_factor: row.weight_factor,
        raw_excerpt: row.raw_excerpt,
        scrape_run_id,
        active: true,
      })
      if (insErr) {
        if (!/duplicate|unique/i.test(String(insErr.message || ''))) {
          errors.push(insErr.message)
        } else {
          upserted++
        }
      } else {
        upserted++
      }
    }

    return {
      ok: true,
      scrape_run_id,
      discovered_urls: targets.length,
      fetched_ok,
      tickets_parsed: tickets.length,
      tickets_upserted: upserted,
      matched_events,
      errors: errors.slice(0, 20),
    }
  } catch (e) {
    errors.push(String(e))
    return empty()
  }
}

/** Load active Lane B tickets for sport (ops + Quorum later). */
export async function loadLaneBTicketsForSport(
  admin: SupabaseClient,
  sportKey: string,
  opts?: { sinceHours?: number; limit?: number },
): Promise<LaneBParsedTicket[]> {
  const sinceHours = opts?.sinceHours ?? 168
  const limit = opts?.limit ?? 200
  const since = new Date(Date.now() - sinceHours * 3600_000).toISOString()
  const { data, error } = await admin
    .from('syndicate_lane_b_tickets')
    .select(
      'source_id,sport_key,event_id,matchup_text,market,selection,line,posted_at,source_url,weight_factor,raw_excerpt',
    )
    .eq('sport_key', sportKey)
    .eq('active', true)
    .gte('posted_at', since)
    .order('posted_at', { ascending: false })
    .limit(limit)
  if (error || !data) return []
  return data.map((r) => ({
    source_id: r.source_id,
    sport_key: r.sport_key,
    event_id: r.event_id,
    matchup_text: r.matchup_text,
    market: r.market as LaneBMarket,
    selection: r.selection,
    line: r.line == null ? null : Number(r.line),
    posted_at: r.posted_at,
    source_url: r.source_url,
    weight_factor: Number(r.weight_factor) || 1,
    raw_excerpt: r.raw_excerpt || '',
  }))
}

/**
 * Weighted Lane B side consensus for one event (for Quorum fold-in).
 * Returns home/away lean weight or null if thin.
 */
export function laneBSideConsensusForEvent(
  tickets: LaneBParsedTicket[],
  eventId: string,
  homeTeam: string,
  awayTeam: string,
): { side: 'home' | 'away'; weight: number; n: number } | null {
  let homeW = 0
  let awayW = 0
  let n = 0
  for (const t of tickets) {
    if (t.market !== 'side') continue
    if (t.event_id && t.event_id !== eventId) continue
    if (!t.event_id) {
      if (!isTeamMatch(t.selection, homeTeam) && !isTeamMatch(t.selection, awayTeam)) continue
    }
    const w = t.weight_factor > 0 ? t.weight_factor : 1
    if (isTeamMatch(t.selection, homeTeam)) {
      homeW += w
      n++
    } else if (isTeamMatch(t.selection, awayTeam)) {
      awayW += w
      n++
    }
  }
  if (n < 1) return null
  if (homeW === awayW) return null
  return homeW > awayW
    ? { side: 'home', weight: homeW - awayW, n }
    : { side: 'away', weight: awayW - homeW, n }
}
