/**
 * Live ESPN Analytics NFL team win rates (PBWR / PRWR / RBWR / RSWR).
 *
 * Source: content.core.api.espn.com (no auth / UA). Story page HTML is WAF'd;
 * the content feed returns the same tables when ?enable=inlines is set.
 *
 * Default story id is the 2026 season board ESPN updates weekly. Override with
 * ESPN_NFL_TRENCH_STORY_ID when they publish a new story next season.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const STATE_PATH = join(ROOT, 'data', 'syndicate', '.espn-trench-live-state.json')

export const ESPN_NFL_TRENCH_STORY_ID_DEFAULT = '49742016'
export const ESPN_NFL_TRENCH_TABLE_HEADLINE = 'NFL team win rate rankings'

/** ESPN slug → nfl_team_metrics.team_abbr */
const ESPN_ABBR_TO_DB = {
  WSH: 'WAS',
  WAS: 'WAS',
  JAC: 'JAX',
  JAX: 'JAX',
  LA: 'LAR',
  LAR: 'LAR',
  LAC: 'LAC',
}

export function resolveEspnTrenchStoryId() {
  const fromEnv = String(process.env.ESPN_NFL_TRENCH_STORY_ID || '').trim()
  return fromEnv || ESPN_NFL_TRENCH_STORY_ID_DEFAULT
}

export function espnContentFeedUrl(storyId = resolveEspnTrenchStoryId()) {
  return `https://content.core.api.espn.com/v1/sports/news/${storyId}?enable=inlines`
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function abbrFromTeamCell(cell) {
  const href = String(cell || '').match(/\/name\/([a-z0-9]+)\//i)
  if (href) {
    const raw = href[1].toUpperCase()
    return ESPN_ABBR_TO_DB[raw] || raw
  }
  const name = stripHtml(cell).toLowerCase()
  // Last-resort name map for broken cells.
  const byName = {
    'arizona cardinals': 'ARI',
    'atlanta falcons': 'ATL',
    'baltimore ravens': 'BAL',
    'buffalo bills': 'BUF',
    'carolina panthers': 'CAR',
    'chicago bears': 'CHI',
    'cincinnati bengals': 'CIN',
    'cleveland browns': 'CLE',
    'dallas cowboys': 'DAL',
    'denver broncos': 'DEN',
    'detroit lions': 'DET',
    'green bay packers': 'GB',
    'houston texans': 'HOU',
    'indianapolis colts': 'IND',
    'jacksonville jaguars': 'JAX',
    'kansas city chiefs': 'KC',
    'las vegas raiders': 'LV',
    'los angeles chargers': 'LAC',
    'los angeles rams': 'LAR',
    'miami dolphins': 'MIA',
    'minnesota vikings': 'MIN',
    'new england patriots': 'NE',
    'new orleans saints': 'NO',
    'new york giants': 'NYG',
    'new york jets': 'NYJ',
    'philadelphia eagles': 'PHI',
    'pittsburgh steelers': 'PIT',
    'san francisco 49ers': 'SF',
    'seattle seahawks': 'SEA',
    'tampa bay buccaneers': 'TB',
    'tennessee titans': 'TEN',
    'washington commanders': 'WAS',
  }
  return byName[name] || ''
}

/** "68% (2)" → { rate: 68, rank: 2 } */
export function parseWinRateCell(raw) {
  const s = stripHtml(raw)
  const m = s.match(/(-?\d+(?:\.\d+)?)\s*%(?:\s*\(\s*(\d+)\s*\))?/)
  if (!m) return null
  const rate = Math.round(Number(m[1]))
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return null
  const rank = m[2] != null ? Number(m[2]) : null
  return { rate, rank: Number.isFinite(rank) ? rank : null }
}

function headerIndex(header, ...names) {
  const lower = (header || []).map((h) => String(h || '').trim().toLowerCase())
  for (const name of names) {
    const i = lower.indexOf(name.toLowerCase())
    if (i >= 0) return i
  }
  return -1
}

/**
 * @param {any} payload ESPN content feed JSON
 */
export function parseEspnTeamWinRateBoard(payload) {
  const headline = payload?.headlines?.[0]
  if (!headline) throw new Error('ESPN feed missing headlines[0]')
  const inlines = Array.isArray(headline.inlines) ? headline.inlines : []
  const table = inlines.find(
    (m) =>
      String(m?.moduleType || '').toLowerCase() === 'table' &&
      String(m?.headline || '')
        .trim()
        .toLowerCase() === ESPN_NFL_TRENCH_TABLE_HEADLINE.toLowerCase(),
  )
  if (!table) {
    const titles = inlines
      .filter((m) => String(m?.moduleType || '').toLowerCase() === 'table')
      .map((m) => m.headline)
    throw new Error(
      `ESPN feed missing table "${ESPN_NFL_TRENCH_TABLE_HEADLINE}". Found: ${titles.join(' | ') || '(none)'}`,
    )
  }

  const json = table.json || {}
  const header = json.header || []
  const body = Array.isArray(json.body) ? json.body : []
  const iTeam = headerIndex(header, 'team')
  const iPrwr = headerIndex(header, 'prwr')
  const iRswr = headerIndex(header, 'rswr')
  const iPbwr = headerIndex(header, 'pbwr')
  const iRbwr = headerIndex(header, 'rbwr')
  if (iTeam < 0 || iPrwr < 0 || iRswr < 0 || iPbwr < 0 || iRbwr < 0) {
    throw new Error(`Unexpected ESPN team table headers: ${JSON.stringify(header)}`)
  }

  /** @type {Record<string, { prwr: number, rswr: number, pbwr: number, rbwr: number, prwr_rank: number | null, rswr_rank: number | null, pbwr_rank: number | null, rbwr_rank: number | null, team_name: string }>} */
  const teams = {}
  for (const row of body) {
    if (!Array.isArray(row) || row.length < 5) continue
    const abbr = abbrFromTeamCell(row[iTeam])
    if (!abbr) continue
    const prwr = parseWinRateCell(row[iPrwr])
    const rswr = parseWinRateCell(row[iRswr])
    const pbwr = parseWinRateCell(row[iPbwr])
    const rbwr = parseWinRateCell(row[iRbwr])
    if (!prwr || !rswr || !pbwr || !rbwr) continue
    teams[abbr] = {
      prwr: prwr.rate,
      rswr: rswr.rate,
      pbwr: pbwr.rate,
      rbwr: rbwr.rate,
      prwr_rank: prwr.rank,
      rswr_rank: rswr.rank,
      pbwr_rank: pbwr.rank,
      rbwr_rank: rbwr.rank,
      team_name: stripHtml(row[iTeam]),
    }
  }

  const lastModified = String(headline.lastModified || payload.timestamp || '').trim() || null
  const storyText = String(headline.story || headline.description || '')
  const throughMatch = storyText.match(/through\s+Week\s+(\d+)/i)
  const through = throughMatch ? `Week ${throughMatch[1]}` : null

  return {
    storyId: String(headline.id || resolveEspnTrenchStoryId()),
    lastModified,
    through,
    headline: String(headline.headline || headline.title || ''),
    teamCount: Object.keys(teams).length,
    teams,
  }
}

export async function fetchEspnTeamWinRateBoard(opts = {}) {
  const storyId = opts.storyId || resolveEspnTrenchStoryId()
  const url = espnContentFeedUrl(storyId)
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`ESPN content feed HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  const payload = JSON.parse(text)
  const board = parseEspnTeamWinRateBoard(payload)
  board.url = url
  board.articleUrl = `https://www.espn.com/nfl/story/_/id/${storyId}`
  return board
}

export function readEspnTrenchLiveState() {
  try {
    if (!existsSync(STATE_PATH)) return null
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'))
  } catch {
    return null
  }
}

export function writeEspnTrenchLiveState(state) {
  mkdirSync(dirname(STATE_PATH), { recursive: true })
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

/**
 * @returns {{ skip: boolean, reason?: string, board: Awaited<ReturnType<typeof fetchEspnTeamWinRateBoard>> }}
 */
export async function fetchEspnTeamWinRateBoardIfChanged(opts = {}) {
  const board = await fetchEspnTeamWinRateBoard(opts)
  const prev = readEspnTrenchLiveState()
  if (
    !opts.force &&
    prev?.lastModified &&
    board.lastModified &&
    prev.lastModified === board.lastModified &&
    prev.storyId === board.storyId
  ) {
    return { skip: true, reason: `unchanged lastModified=${board.lastModified}`, board }
  }
  return { skip: false, board }
}
