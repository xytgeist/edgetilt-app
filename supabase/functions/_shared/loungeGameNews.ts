/**
 * Game hub News tab: ESPN injuries + preview/recap, Rotowire player notes (via ESPN fantasy), and team
 * stories filtered to only this matchup. CFB adds Rotowire's CFB RSS matched to the two rosters.
 */
import { decodeHtmlEntities } from './decodeHtmlEntities.ts'
import { parseFeedXml } from './loungeBotRssFetch.ts'
import { type EspnFootballEventRef, type LoungeSportsGame, resolveEspnFootballEvent } from './loungeSportsScoreboard.ts'

type Side = 'away' | 'home'

export type GameNewsInjury = {
  id: string
  name: string
  position: string
  status: string
  status_abbrev: string
  detail: string
  return_date: string | null
  date: string | null
}

export type GameNewsPlayerNote = {
  id: string
  side: Side
  player: string
  position: string
  headline: string
  story: string
  published: string | null
  source: string
  url: string | null
}

export type GameNewsStory = {
  id: string
  kind: string
  headline: string
  description: string
  url: string | null
  image: string | null
  published: string | null
}

export type GameNewsPayload = {
  league: 'nfl' | 'college-football'
  espn_event_id: string
  article: GameNewsStory | null
  injuries: { away: GameNewsInjury[]; home: GameNewsInjury[] } | null
  player_notes: GameNewsPlayerNote[]
  stories: GameNewsStory[]
  fetched_at: string
}

const HEADERS = { 'User-Agent': 'EdgeTiltLounge/1.0', Accept: 'application/json' }
const DAY_MS = 24 * 60 * 60 * 1000
const NOTE_WINDOW_MS = 10 * DAY_MS
const STORY_WINDOW_MS = 7 * DAY_MS
const NOTES_PER_PLAYER = 3
const MAX_NOTES = 40
const MAX_STORIES = 12
const SKILL_POS = new Set(['QB', 'RB', 'WR', 'TE', 'PK', 'K', 'FB'])

type CacheEntry<T> = { at: number; value: T }
function memo<T>(map: Map<string, CacheEntry<Promise<T>>>, key: string, ttlMs: number, build: () => Promise<T>) {
  const hit = map.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.value
  if (map.size > 400) {
    for (const [k, v] of map) if (Date.now() - v.at >= ttlMs) map.delete(k)
  }
  const value = build()
  const entry = { at: Date.now(), value }
  map.set(key, entry)
  value.catch(() => {
    if (map.get(key) === entry) map.delete(key)
  })
  return value
}

async function getJson<T>(url: string, timeoutMs = 8_000): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    return await res.json() as T
  } catch {
    return null
  }
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? v as Obj : {})
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') as Obj[] : [])
const str = (v: unknown) => String(v ?? '').trim()

function stripHtml(raw: unknown): string {
  return decodeHtmlEntities(
    str(raw)
      .replace(/<(video|photo|inline)\d*>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim()
}

function isoOrNull(v: unknown): string | null {
  const s = str(v)
  if (!s) return null
  const t = Date.parse(s)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

function withinMs(iso: string | null, windowMs: number): boolean {
  if (!iso) return false
  return Date.now() - Date.parse(iso) <= windowMs
}

function webHref(item: Obj): string | null {
  const href = str(obj(obj(item.links).web).href)
  return href ? href.replace(/^http:\/\//, 'https://') : null
}

function storyFromEspn(item: Obj): GameNewsStory | null {
  const headline = stripHtml(item.headline || item.title)
  if (!headline) return null
  const image = arr(item.images)[0]
  return {
    id: str(item.id || item.dataSourceIdentifier || headline),
    kind: str(item.type) || 'Story',
    headline,
    description: stripHtml(item.description),
    url: webHref(item),
    image: image ? str(image.url) || null : null,
    published: isoOrNull(item.published || item.lastModified),
  }
}

// ---------- summary (injuries + preview/recap + league headlines) ----------

const summaryCache = new Map<string, CacheEntry<Promise<Obj | null>>>()

function loadSummary(ref: EspnFootballEventRef) {
  return memo(summaryCache, `${ref.league}:${ref.event_id}`, 5 * 60 * 1000, () =>
    getJson<Obj>(
      `https://site.api.espn.com/apis/site/v2/sports/football/${ref.league}/summary?event=${encodeURIComponent(ref.event_id)}`,
    ))
}

function injuriesFromSummary(summary: Obj, ref: EspnFootballEventRef) {
  const out: { away: GameNewsInjury[]; home: GameNewsInjury[] } = { away: [], home: [] }
  for (const block of arr(summary.injuries)) {
    const teamId = str(obj(block.team).id)
    const side: Side | null = teamId === ref.away_team_id ? 'away' : teamId === ref.home_team_id ? 'home' : null
    if (!side) continue
    for (const row of arr(block.injuries)) {
      const athlete = obj(row.athlete)
      const name = str(athlete.displayName)
      if (!name) continue
      const details = obj(row.details)
      const type = obj(row.type)
      const bodyPart = str(details.type)
      const bodySide = str(details.side)
      const detailBits = [
        bodySide && bodySide !== 'Not Specified' ? bodySide : '',
        bodyPart && bodyPart !== 'Not Specified' ? bodyPart : '',
      ].filter(Boolean)
      const extra = str(details.detail)
      out[side].push({
        id: str(athlete.id) || name,
        name,
        position: str(obj(athlete.position).abbreviation),
        status: str(row.status) || str(type.description),
        status_abbrev: str(type.abbreviation),
        detail: [detailBits.join(' '), extra && extra !== 'Not Specified' && extra !== bodyPart ? extra : '']
          .filter(Boolean).join(' · '),
        return_date: str(details.returnDate) || null,
        date: isoOrNull(row.date),
      })
    }
  }
  const statusRank = (s: string) => {
    const u = s.toUpperCase()
    if (u.startsWith('O')) return 0
    if (u.startsWith('IR') || u.includes('RESERVE')) return 1
    if (u.startsWith('D')) return 2
    if (u.startsWith('Q')) return 3
    return 4
  }
  for (const side of ['away', 'home'] as const) {
    out[side].sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.name.localeCompare(b.name))
  }
  return out
}

// ---------- team stories (filtered to this matchup only) ----------

const teamNewsCache = new Map<string, CacheEntry<Promise<Obj[]>>>()

function loadTeamNews(league: string, teamId: string) {
  return memo(teamNewsCache, `${league}:${teamId}`, 15 * 60 * 1000, async () => {
    const body = await getJson<Obj>(
      `https://site.api.espn.com/apis/site/v2/sports/football/${league}/news?team=${encodeURIComponent(teamId)}&limit=30`,
    )
    return arr(body?.articles)
  })
}

/** Only stories tagged with this game's teams and nothing else … drops league roundups and power rankings. */
function matchupStories(items: Obj[], ref: EspnFootballEventRef): GameNewsStory[] {
  const allowed = new Set([ref.away_team_id, ref.home_team_id])
  const seen = new Set<string>()
  const out: GameNewsStory[] = []
  for (const item of items) {
    const teamIds = arr(item.categories)
      .filter((c) => str(c.type) === 'team')
      .map((c) => str(c.teamId ?? obj(c.team).id))
      .filter(Boolean)
    if (!teamIds.length || teamIds.some((id) => !allowed.has(id))) continue
    const story = storyFromEspn(item)
    if (!story || !withinMs(story.published, STORY_WINDOW_MS)) continue
    const key = story.url || story.headline
    if (seen.has(key)) continue
    seen.add(key)
    out.push(story)
  }
  out.sort((a, b) => Date.parse(b.published || '') - Date.parse(a.published || ''))
  return out.slice(0, MAX_STORIES)
}

// ---------- NFL: depth chart → Rotowire notes via ESPN fantasy ----------

type NotePlayer = { id: string; name: string; position: string; side: Side }

const depthCache = new Map<string, CacheEntry<Promise<NotePlayer[]>>>()

function loadNflDepthPlayers(teamId: string, side: Side) {
  return memo(depthCache, `nfl:${teamId}:${side}`, 6 * 60 * 60 * 1000, async () => {
    const body = await getJson<Obj>(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${encodeURIComponent(teamId)}/depthcharts`,
    )
    const picks: Array<[string, number]> = [['qb', 1], ['rb', 2], ['wr1', 1], ['wr2', 1], ['wr3', 1], ['te', 1], ['pk', 1]]
    const out: NotePlayer[] = []
    const seen = new Set<string>()
    for (const group of arr(body?.depthchart)) {
      const positions = obj(group.positions)
      for (const [pos, take] of picks) {
        for (const a of arr(obj(positions[pos]).athletes).slice(0, take)) {
          const id = str(a.id)
          if (!id || seen.has(id)) continue
          seen.add(id)
          out.push({ id, name: str(a.displayName), position: pos.replace(/\d+$/, '').toUpperCase(), side })
        }
      }
    }
    return out
  })
}

const playerNewsCache = new Map<string, CacheEntry<Promise<Obj[]>>>()

function loadPlayerNews(espnId: string) {
  return memo(playerNewsCache, espnId, 15 * 60 * 1000, async () => {
    const body = await getJson<Obj>(
      `https://site.api.espn.com/apis/fantasy/v2/games/ffl/news/players?playerId=${encodeURIComponent(espnId)}&limit=8`,
      6_000,
    )
    return arr(body?.feed)
  })
}

async function nflPlayerNotes(ref: EspnFootballEventRef, injuries: GameNewsPayload['injuries']): Promise<GameNewsPlayerNote[]> {
  const [awayDepth, homeDepth] = await Promise.all([
    loadNflDepthPlayers(ref.away_team_id, 'away'),
    loadNflDepthPlayers(ref.home_team_id, 'home'),
  ])
  const players = new Map<string, NotePlayer>()
  for (const p of [...awayDepth, ...homeDepth]) players.set(p.id, p)
  for (const side of ['away', 'home'] as const) {
    for (const inj of injuries?.[side] || []) {
      if (!SKILL_POS.has(inj.position.toUpperCase()) || players.has(inj.id)) continue
      players.set(inj.id, { id: inj.id, name: inj.name, position: inj.position, side })
    }
  }
  const list = [...players.values()].slice(0, 32)
  const feeds = await Promise.all(list.map((p) => loadPlayerNews(p.id).catch(() => [] as Obj[])))
  const notes: GameNewsPlayerNote[] = []
  list.forEach((p, i) => {
    let taken = 0
    for (const item of feeds[i]) {
      if (taken >= NOTES_PER_PLAYER) break
      if (str(item.type) !== 'Rotowire') continue
      const published = isoOrNull(item.published || item.lastModified)
      if (!withinMs(published, NOTE_WINDOW_MS)) continue
      const headline = stripHtml(item.headline)
      if (!headline) continue
      taken += 1
      notes.push({
        id: str(item.id || item.dataSourceIdentifier) || `${p.id}:${published}`,
        side: p.side,
        player: p.name,
        position: p.position,
        headline,
        story: stripHtml(item.story),
        published,
        source: 'Rotowire via ESPN',
        url: `https://www.espn.com/nfl/player/_/id/${p.id}`,
      })
    }
  })
  notes.sort((a, b) => Date.parse(b.published || '') - Date.parse(a.published || ''))
  return notes.slice(0, MAX_NOTES)
}

// ---------- CFB: Rotowire RSS matched to rosters / schools ----------

const cfbRosterCache = new Map<string, CacheEntry<Promise<Map<string, string>>>>()

function loadCfbRosterNames(teamId: string) {
  return memo(cfbRosterCache, teamId, 6 * 60 * 60 * 1000, async () => {
    const body = await getJson<Obj>(
      `https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/${encodeURIComponent(teamId)}/roster`,
    )
    const names = new Map<string, string>()
    for (const group of arr(body?.athletes)) {
      for (const a of arr(group.items)) {
        const name = str(a.displayName)
        if (name) names.set(name.toLowerCase(), str(obj(a.position).abbreviation))
      }
    }
    return names
  })
}

const rotoCfbCache = new Map<string, CacheEntry<Promise<ReturnType<typeof parseFeedXml>>>>()

/** Rotowire pubDate reads "Tue, 29 Sep 2026 10:16:00 AM PDT" … Date.parse rejects the AM/PM form. */
function rotowireDate(raw: string): string | null {
  const m = raw.match(/(\d{1,2}) (\w{3}) (\d{4}) (\d{1,2}):(\d{2})(?::(\d{2}))? ?(AM|PM)? ?([A-Z]{2,4})?/i)
  if (!m) return isoOrNull(raw)
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  const mon = months.indexOf(m[2].toLowerCase())
  if (mon < 0) return null
  let hour = Number(m[4])
  if (m[7]) hour = (hour % 12) + (m[7].toUpperCase() === 'PM' ? 12 : 0)
  const offsets: Record<string, number> = { PDT: -7, PST: -8, MDT: -6, MST: -7, CDT: -5, CST: -6, EDT: -4, EST: -5, UTC: 0, GMT: 0 }
  const off = offsets[(m[8] || 'UTC').toUpperCase()] ?? 0
  const t = Date.UTC(Number(m[3]), mon, Number(m[1]), hour - off, Number(m[5]), Number(m[6] || 0))
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

function loadRotowireCfb() {
  return memo(rotoCfbCache, 'cfb', 10 * 60 * 1000, async () => {
    try {
      const res = await fetch('https://www.rotowire.com/rss/news.php?sport=CFB', {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EdgeTilt/1.0; +https://edgetilt.com)', Accept: 'application/rss+xml, text/xml' },
        signal: AbortSignal.timeout(6_000),
      })
      if (!res.ok) return []
      const xml = await res.text()
      const items = parseFeedXml(xml, 'Rotowire')
      const pubDates = [...xml.matchAll(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/gi)].map((m) => m[1].trim())
      return items.map((item, i) => ({ ...item, publishedAt: item.publishedAt || rotowireDate(pubDates[i] || '') }))
    } catch {
      return []
    }
  })
}

function schoolMentioned(text: string, location: string): boolean {
  if (!location || location.length < 3) return false
  const esc = location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${esc}\\b(?!\\s+(State|A&M|A&T|Tech|Christian))`, 'i').test(text)
}

async function cfbPlayerNotes(ref: EspnFootballEventRef): Promise<GameNewsPlayerNote[]> {
  const [feed, awayNames, homeNames] = await Promise.all([
    loadRotowireCfb(),
    loadCfbRosterNames(ref.away_team_id).catch(() => new Map<string, string>()),
    loadCfbRosterNames(ref.home_team_id).catch(() => new Map<string, string>()),
  ])
  const notes: GameNewsPlayerNote[] = []
  for (const item of feed) {
    const [rawName, ...rest] = item.title.split(':')
    const player = str(rawName)
    const key = player.toLowerCase()
    const text = `${item.title} ${item.summary || ''}`
    let side: Side | null = null
    if (awayNames.has(key) && schoolMentioned(text, ref.away_location)) side = 'away'
    else if (homeNames.has(key) && schoolMentioned(text, ref.home_location)) side = 'home'
    else if (awayNames.has(key) && !homeNames.has(key)) side = 'away'
    else if (homeNames.has(key) && !awayNames.has(key)) side = 'home'
    if (!side) continue
    const names = side === 'away' ? awayNames : homeNames
    notes.push({
      id: item.externalId,
      side,
      player,
      position: names.get(key) || '',
      headline: str(rest.join(':')) || item.title,
      story: str(item.summary).replace(/\s*Visit RotoWire\.com for more analysis on this update\.?\s*$/i, ''),
      published: item.publishedAt,
      source: 'Rotowire',
      url: item.url ? item.url.replace('.com//', '.com/') : null,
    })
  }
  return notes
}

// ---------- entry ----------

const payloadCache = new Map<string, CacheEntry<Promise<GameNewsPayload | null>>>()

export function buildGameNews(game: LoungeSportsGame): Promise<GameNewsPayload | null> {
  const key = `${game.sport_key}:${game.id}:${game.status}`
  return memo(payloadCache, key, 5 * 60 * 1000, async () => {
    const ref = await resolveEspnFootballEvent(game)
    if (!ref || !ref.event_id) return null
    const nfl = ref.league === 'nfl'
    const [summary, awayNews, homeNews] = await Promise.all([
      loadSummary(ref),
      loadTeamNews(ref.league, ref.away_team_id).catch(() => [] as Obj[]),
      loadTeamNews(ref.league, ref.home_team_id).catch(() => [] as Obj[]),
    ])
    const summaryObj = obj(summary)
    const injuries = nfl ? injuriesFromSummary(summaryObj, ref) : null
    const articleRaw = obj(summaryObj.article)
    const article = str(articleRaw.headline) ? storyFromEspn(articleRaw) : null
    if (article && !article.url) {
      article.url = `https://www.espn.com/${nfl ? 'nfl' : 'college-football'}/game/_/gameId/${ref.event_id}`
    }
    const leagueNews = arr(obj(summaryObj.news).articles)
    let stories = matchupStories([...awayNews, ...homeNews, ...leagueNews], ref)
    if (article) stories = stories.filter((s) => s.headline !== article.headline)
    const playerNotes = nfl
      ? await nflPlayerNotes(ref, injuries).catch(() => [])
      : await cfbPlayerNotes(ref).catch(() => [])
    return {
      league: ref.league,
      espn_event_id: ref.event_id,
      article,
      injuries,
      player_notes: playerNotes,
      stories,
      fetched_at: new Date().toISOString(),
    }
  })
}
