/**
 * Aggregate season-to-date Off/Def EPA per play + success rate from nflverse play-by-play.
 * Source: https://github.com/nflverse/nflverse-data (play_by_play_{year}.csv[.gz])
 *
 * Does NOT invent trench win rates (PBWR/PRWR/etc.). Those stay untouched until a paid charting feed.
 */

import { createGunzip } from 'zlib'
import { Readable } from 'stream'
import readline from 'readline'

const PBP_BASE =
  'https://github.com/nflverse/nflverse-data/releases/download/pbp'

/** nflverse sometimes uses legacy / short abbrs. */
const TEAM_ABBR_ALIASES = {
  LA: 'LAR',
  JAC: 'JAX',
  WSH: 'WAS',
}

function canonAbbr(raw) {
  const t = String(raw || '').trim().toUpperCase()
  if (!t) return ''
  return TEAM_ABBR_ALIASES[t] || t
}

/** Static roster metadata for upserts (matches nfl_team_metrics seed). */
export const NFL_TEAM_META = {
  BUF: { team_name: 'Buffalo Bills', conference: 'AFC', division: 'East' },
  MIA: { team_name: 'Miami Dolphins', conference: 'AFC', division: 'East' },
  NYJ: { team_name: 'New York Jets', conference: 'AFC', division: 'East' },
  NE: { team_name: 'New England Patriots', conference: 'AFC', division: 'East' },
  BAL: { team_name: 'Baltimore Ravens', conference: 'AFC', division: 'North' },
  CIN: { team_name: 'Cincinnati Bengals', conference: 'AFC', division: 'North' },
  CLE: { team_name: 'Cleveland Browns', conference: 'AFC', division: 'North' },
  PIT: { team_name: 'Pittsburgh Steelers', conference: 'AFC', division: 'North' },
  HOU: { team_name: 'Houston Texans', conference: 'AFC', division: 'South' },
  IND: { team_name: 'Indianapolis Colts', conference: 'AFC', division: 'South' },
  JAX: { team_name: 'Jacksonville Jaguars', conference: 'AFC', division: 'South' },
  TEN: { team_name: 'Tennessee Titans', conference: 'AFC', division: 'South' },
  KC: { team_name: 'Kansas City Chiefs', conference: 'AFC', division: 'West' },
  LAC: { team_name: 'Los Angeles Chargers', conference: 'AFC', division: 'West' },
  DEN: { team_name: 'Denver Broncos', conference: 'AFC', division: 'West' },
  LV: { team_name: 'Las Vegas Raiders', conference: 'AFC', division: 'West' },
  PHI: { team_name: 'Philadelphia Eagles', conference: 'NFC', division: 'East' },
  DAL: { team_name: 'Dallas Cowboys', conference: 'NFC', division: 'East' },
  WAS: { team_name: 'Washington Commanders', conference: 'NFC', division: 'East' },
  NYG: { team_name: 'New York Giants', conference: 'NFC', division: 'East' },
  DET: { team_name: 'Detroit Lions', conference: 'NFC', division: 'North' },
  GB: { team_name: 'Green Bay Packers', conference: 'NFC', division: 'North' },
  MIN: { team_name: 'Minnesota Vikings', conference: 'NFC', division: 'North' },
  CHI: { team_name: 'Chicago Bears', conference: 'NFC', division: 'North' },
  TB: { team_name: 'Tampa Bay Buccaneers', conference: 'NFC', division: 'South' },
  ATL: { team_name: 'Atlanta Falcons', conference: 'NFC', division: 'South' },
  NO: { team_name: 'New Orleans Saints', conference: 'NFC', division: 'South' },
  CAR: { team_name: 'Carolina Panthers', conference: 'NFC', division: 'South' },
  SF: { team_name: 'San Francisco 49ers', conference: 'NFC', division: 'West' },
  LAR: { team_name: 'Los Angeles Rams', conference: 'NFC', division: 'West' },
  SEA: { team_name: 'Seattle Seahawks', conference: 'NFC', division: 'West' },
  ARI: { team_name: 'Arizona Cardinals', conference: 'NFC', division: 'West' },
}

/**
 * @param {number} year
 * @returns {Promise<{ res: Response, compressed: boolean }>}
 */
async function fetchPbpResponse(year) {
  const urls = [
    { url: `${PBP_BASE}/play_by_play_${year}.csv.gz`, compressed: true },
    { url: `${PBP_BASE}/play_by_play_${year}.csv`, compressed: false },
  ]
  let lastErr = null
  for (const { url, compressed } of urls) {
    try {
      const res = await fetch(url, {
        headers: { Accept: '*/*', 'User-Agent': 'EdgeTilt-nfl-metrics-sync/1.0' },
        redirect: 'follow',
      })
      if (res.ok) return { res, compressed }
      lastErr = new Error(`HTTP ${res.status} for ${url}`)
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr || new Error(`Could not fetch nflverse PBP for ${year}`)
}

/**
 * Parse one CSV line (handles quoted fields).
 * @param {string} line
 */
function splitCsvLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out
}

/**
 * @param {number} year
 * @returns {Promise<{ year: number, teams: Record<string, { off_epa_play: number, def_epa_play: number, success_rate: number, off_plays: number, def_plays: number }>, playCount: number }>}
 */
export async function computeNflEpaFromNflverse(year) {
  const { res, compressed } = await fetchPbpResponse(year)

  let bodyStream = Readable.fromWeb(res.body)
  if (compressed) {
    bodyStream = bodyStream.pipe(createGunzip())
  }

  const rl = readline.createInterface({ input: bodyStream, crlfDelay: Infinity })

  /** @type {Map<string, number>} */
  const col = new Map()
  /** @type {Record<string, { offEpa: number, offN: number, offSucc: number, offSuccN: number, defEpa: number, defN: number }>} */
  const acc = {}

  function ensure(team) {
    if (!acc[team]) {
      acc[team] = { offEpa: 0, offN: 0, offSucc: 0, offSuccN: 0, defEpa: 0, defN: 0 }
    }
    return acc[team]
  }

  let playCount = 0
  let headerDone = false

  for await (const line of rl) {
    if (!line) continue
    if (!headerDone) {
      const headers = splitCsvLine(line)
      headers.forEach((h, i) => col.set(h.trim(), i))
      const needed = ['posteam', 'defteam', 'epa', 'season_type']
      for (const n of needed) {
        if (!col.has(n)) throw new Error(`nflverse PBP missing column: ${n}`)
      }
      headerDone = true
      continue
    }

    const cells = splitCsvLine(line)
    const seasonType = cells[col.get('season_type')] || ''
    if (seasonType !== 'REG') continue

    const posteam = canonAbbr(cells[col.get('posteam')])
    const defteam = canonAbbr(cells[col.get('defteam')])
    if (!posteam || !defteam) continue
    if (!NFL_TEAM_META[posteam] || !NFL_TEAM_META[defteam]) continue

    const rushIdx = col.get('rush')
    const passIdx = col.get('pass')
    const playTypeIdx = col.get('play_type')
    let isPlay = false
    if (rushIdx != null || passIdx != null) {
      const rush = Number(cells[rushIdx] || 0)
      const pass = Number(cells[passIdx] || 0)
      isPlay = rush === 1 || pass === 1
    } else if (playTypeIdx != null) {
      const pt = cells[playTypeIdx] || ''
      isPlay = pt === 'pass' || pt === 'run'
    }
    if (!isPlay) continue

    const epaRaw = cells[col.get('epa')]
    if (epaRaw === '' || epaRaw == null) continue
    const epa = Number(epaRaw)
    if (!Number.isFinite(epa)) continue

    const off = ensure(posteam)
    off.offEpa += epa
    off.offN += 1
    const succIdx = col.get('success')
    if (succIdx != null) {
      const s = cells[succIdx]
      if (s !== '' && s != null) {
        const sv = Number(s)
        if (Number.isFinite(sv)) {
          off.offSucc += sv
          off.offSuccN += 1
        }
      }
    }

    const def = ensure(defteam)
    def.defEpa += epa
    def.defN += 1
    playCount += 1
  }

  if (playCount === 0) {
    throw new Error(`No REG rush/pass EPA rows for season ${year} (season may not have started yet)`)
  }

  /** @type {Record<string, { off_epa_play: number, def_epa_play: number, success_rate: number, off_plays: number, def_plays: number }>} */
  const teams = {}
  for (const abbr of Object.keys(NFL_TEAM_META)) {
    const a = acc[abbr]
    if (!a || a.offN < 1 || a.defN < 1) continue
    teams[abbr] = {
      off_epa_play: Math.round((a.offEpa / a.offN) * 1000) / 1000,
      def_epa_play: Math.round((a.defEpa / a.defN) * 1000) / 1000,
      success_rate:
        a.offSuccN > 0 ? Math.round((a.offSucc / a.offSuccN) * 1000) / 10 : 45.0,
      off_plays: a.offN,
      def_plays: a.defN,
    }
  }

  return { year, teams, playCount }
}

/**
 * Prefer current calendar season; if empty/missing, fall back one year.
 * @param {number} [preferredYear]
 */
export async function computeNflEpaWithFallback(preferredYear = new Date().getFullYear()) {
  try {
    return await computeNflEpaFromNflverse(preferredYear)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (preferredYear <= 1999) throw err
    console.warn(`[nfl-metrics] ${preferredYear} failed (${msg}); trying ${preferredYear - 1}`)
    return await computeNflEpaFromNflverse(preferredYear - 1)
  }
}
