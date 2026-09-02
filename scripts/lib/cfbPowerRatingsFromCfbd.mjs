/**
 * CFB power board for Sharpe Syndicate desks (Scott / Rocco / Tank).
 *
 * Real CFBD inputs (deterministic, no LLM):
 * 1. power_rating ← CFBD Football Power Index (FPI), same scale as ESPN FPI
 * 2. off_rating / def_rating ← CFBD SP+ offense / defense ratings
 * 3. In-season blend: as a team plays more games, blend FPI toward score Elo
 * 4. HFA ← home-margin residual vs Elo expectation (min 4 home games)
 * 5. tempo_rating ← CFBD advanced offense.plays / games (prior year until current covers FBS)
 *
 * Requires CFBD_API_KEY (https://collegefootballdata.com/key).
 */

const CFBD_BASE = 'https://api.collegefootballdata.com'

/** Elo → points vs mean (blend component only). 25 Elo ≈ 1 point. */
export const ELO_TO_POINTS = 0.04
export const ELO_K = 24
export const ELO_HOME_ADV = 65
export const ELO_START = 1500
export const DEFAULT_TEMPO = 68
export const DEFAULT_HFA = 2.5
/** FBS teams ~6-7 home games/season; 4 keeps early variance usable. */
export const MIN_HFA_HOME_GAMES = 4
/** After this many season games, results can weigh up to MAX_RESULTS_BLEND. */
export const RESULTS_BLEND_GAMES = 8
export const MAX_RESULTS_BLEND = 0.55

/**
 * @param {string} apiKey
 * @param {string} path
 * @param {Record<string, string | number | undefined>} [query]
 */
export async function cfbdFetch(apiKey, path, query = {}) {
  const url = new URL(path.startsWith('http') ? path : `${CFBD_BASE}${path}`)
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue
    url.searchParams.set(k, String(v))
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'User-Agent': 'EdgeTilt-cfb-power-sync/1.0',
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`CFBD ${res.status} ${url.pathname}: ${body.slice(0, 200)}`)
  }
  return res.json()
}

/**
 * @param {any[]} games
 * @returns {{ home: string, away: string, homePoints: number, awayPoints: number, neutral: boolean }[]}
 */
export function normalizeCompletedGames(games) {
  const out = []
  for (const g of games || []) {
    const home = g.homeTeam || g.home_team
    const away = g.awayTeam || g.away_team
    const hp = g.homePoints ?? g.home_points
    const ap = g.awayPoints ?? g.away_points
    if (!home || !away) continue
    if (hp == null || ap == null) continue
    const homePoints = Number(hp)
    const awayPoints = Number(ap)
    if (!Number.isFinite(homePoints) || !Number.isFinite(awayPoints)) continue
    const neutral = Boolean(g.neutralSite ?? g.neutral_site)
    out.push({ home, away, homePoints, awayPoints, neutral })
  }
  return out
}

function movMult(margin, eloWinner, eloLoser) {
  return (
    (Math.log(Math.abs(margin) + 1) * 2.2) /
    ((eloWinner - eloLoser) * 0.001 + 2.2)
  )
}

/**
 * @param {{ home: string, away: string, homePoints: number, awayPoints: number, neutral: boolean }[]} games
 * @returns {Map<string, number>}
 */
export function computeEloRatings(games) {
  /** @type {Map<string, number>} */
  const elo = new Map()
  const get = (t) => {
    if (!elo.has(t)) elo.set(t, ELO_START)
    return /** @type {number} */ (elo.get(t))
  }

  for (const g of games) {
    let homeElo = get(g.home)
    let awayElo = get(g.away)
    const homeAdj = g.neutral ? homeElo : homeElo + ELO_HOME_ADV
    const expHome = 1 / (1 + 10 ** ((awayElo - homeAdj) / 400))
    const scoreHome = g.homePoints > g.awayPoints ? 1 : g.homePoints < g.awayPoints ? 0 : 0.5
    const margin = g.homePoints - g.awayPoints
    const winnerElo = margin >= 0 ? homeAdj : awayElo
    const loserElo = margin >= 0 ? awayElo : homeAdj
    const mult = margin === 0 ? 1 : movMult(margin, winnerElo, loserElo)
    const delta = ELO_K * mult * (scoreHome - expHome)
    elo.set(g.home, homeElo + delta)
    elo.set(g.away, awayElo - delta)
  }
  return elo
}

/**
 * @param {{ home: string, away: string, homePoints: number, awayPoints: number, neutral: boolean }[]} games
 * @param {Map<string, number>} elo
 */
export function computeTeamHfa(games, elo) {
  /** @type {Map<string, { sum: number, n: number }>} */
  const acc = new Map()
  const getElo = (t) => elo.get(t) ?? ELO_START

  for (const g of games) {
    if (g.neutral) continue
    const expectedMargin = (getElo(g.home) - getElo(g.away)) * ELO_TO_POINTS
    const residual = g.homePoints - g.awayPoints - expectedMargin
    if (!acc.has(g.home)) acc.set(g.home, { sum: 0, n: 0 })
    const a = acc.get(g.home)
    a.sum += residual
    a.n += 1
  }

  /** @type {Map<string, number>} */
  const hfa = new Map()
  for (const [team, a] of acc) {
    if (a.n < MIN_HFA_HOME_GAMES) {
      hfa.set(team, DEFAULT_HFA)
      continue
    }
    const raw = (a.sum / a.n) * 0.55
    const clamped = Math.max(1.5, Math.min(3.5, raw))
    hfa.set(team, Math.round(clamped * 10) / 10)
  }
  return hfa
}

/**
 * Plays per game from CFBD advanced season stats.
 * @param {any[]} advancedRows
 * @param {Map<string, number>} gamesPlayedByTeam
 */
export function tempoFromAdvancedStats(advancedRows, gamesPlayedByTeam) {
  /** @type {Map<string, number>} */
  const tempo = new Map()
  for (const row of advancedRows || []) {
    const team = row.team
    if (!team) continue
    const plays = Number(row.offense?.plays)
    if (!Number.isFinite(plays) || plays <= 0) continue
    // CFBD usually returns season play totals (~700-1000). Early-year snippets can look per-game.
    if (plays >= 200) {
      const gp = gamesPlayedByTeam.get(team) || 0
      if (gp < 1) continue
      tempo.set(team, Math.round((plays / gp) * 10) / 10)
    } else if (plays > 40 && plays < 120) {
      tempo.set(team, Math.round(plays * 10) / 10)
    }
  }
  return tempo
}

/**
 * Prefer full FBS advanced season for tempo. Sparse early-year rows (e.g. 16 teams)
 * would divide tiny play totals by prior+current game counts and junk the board.
 * @param {string} apiKey
 * @param {number} season
 * @param {number} priorSeason
 */
async function fetchAdvancedForTempo(apiKey, season, priorSeason) {
  const cur = await cfbdFetch(apiKey, '/stats/season/advanced', { year: season }).catch(() => [])
  if (Array.isArray(cur) && cur.length >= 100) {
    return { rows: cur, year: season }
  }
  const prior = await cfbdFetch(apiKey, '/stats/season/advanced', { year: priorSeason }).catch(
    () => [],
  )
  return { rows: Array.isArray(prior) ? prior : [], year: priorSeason }
}

function countGamesPlayed(games) {
  /** @type {Map<string, number>} */
  const m = new Map()
  for (const g of games) {
    m.set(g.home, (m.get(g.home) || 0) + 1)
    m.set(g.away, (m.get(g.away) || 0) + 1)
  }
  return m
}

/**
 * Prefer current season ratings; fall back to prior if empty.
 * @param {string} apiKey
 * @param {string} path
 * @param {number} season
 * @param {number} priorSeason
 */
async function fetchRatingsWithFallback(apiKey, path, season, priorSeason) {
  const current = await cfbdFetch(apiKey, path, { year: season }).catch(() => [])
  if (Array.isArray(current) && current.length > 0) {
    return { rows: current, year: season }
  }
  const prior = await cfbdFetch(apiKey, path, { year: priorSeason })
  return { rows: prior || [], year: priorSeason }
}

/**
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {number} opts.season
 * @param {number} [opts.priorSeason]
 */
export async function buildCfbPowerBoard({ apiKey, season, priorSeason = season - 1 }) {
  const [
    fpiPack,
    spPack,
    priorGamesRaw,
    seasonGamesRaw,
    teamsRaw,
    advancedPack,
  ] = await Promise.all([
    fetchRatingsWithFallback(apiKey, '/ratings/fpi', season, priorSeason),
    fetchRatingsWithFallback(apiKey, '/ratings/sp', season, priorSeason),
    cfbdFetch(apiKey, '/games', {
      year: priorSeason,
      seasonType: 'regular',
      classification: 'fbs',
    }),
    cfbdFetch(apiKey, '/games', {
      year: season,
      seasonType: 'regular',
      classification: 'fbs',
    }),
    cfbdFetch(apiKey, '/teams', { year: season, classification: 'fbs' }),
    fetchAdvancedForTempo(apiKey, season, priorSeason),
  ])

  const priorGames = normalizeCompletedGames(priorGamesRaw)
  const seasonGames = normalizeCompletedGames(seasonGamesRaw)
  const allGames = [...priorGames, ...seasonGames]
  const seasonGp = countGamesPlayed(seasonGames)
  const elo = computeEloRatings(allGames.length ? allGames : priorGames)
  const hfaMap = computeTeamHfa(allGames.length ? allGames : priorGames, elo)
  const tempoGames =
    advancedPack.year === season ? seasonGames : priorGames.length ? priorGames : seasonGames
  const tempoMap = tempoFromAdvancedStats(advancedPack.rows || [], countGamesPlayed(tempoGames))

  let eloSum = 0
  let eloN = 0
  for (const v of elo.values()) {
    eloSum += v
    eloN += 1
  }
  const meanElo = eloN ? eloSum / eloN : ELO_START

  /** @type {Map<string, number>} */
  const fpiByTeam = new Map()
  for (const row of fpiPack.rows || []) {
    if (!row.team || row.fpi == null) continue
    fpiByTeam.set(row.team, Number(row.fpi))
  }

  /** @type {Map<string, { off: number, def: number, sp: number }>} */
  const spByTeam = new Map()
  for (const row of spPack.rows || []) {
    if (!row.team) continue
    const off = Number(row.offense?.rating)
    const def = Number(row.defense?.rating)
    const sp = Number(row.rating)
    if (!Number.isFinite(off) || !Number.isFinite(def)) continue
    spByTeam.set(row.team, {
      off: Math.round(off * 10) / 10,
      def: Math.round(def * 10) / 10,
      sp: Number.isFinite(sp) ? Math.round(sp * 10) / 10 : Math.round((off - def) * 10) / 10,
    })
  }

  /** @type {Map<string, { conference: string, team_abbr: string, full_name: string }>} */
  const meta = new Map()
  for (const t of teamsRaw || []) {
    const school = t.school || t.team || t.displayName
    if (!school) continue
    const mascot = t.mascot || ''
    const abbr = (t.abbreviation || t.alt_name1 || school.slice(0, 4)).toString().toUpperCase()
    const conference = t.conference || t.conferenceName || 'FBS'
    meta.set(school, {
      conference,
      team_abbr: abbr.slice(0, 8),
      full_name: mascot ? `${school} ${mascot}` : school,
    })
  }

  const schools = new Set([...fpiByTeam.keys(), ...spByTeam.keys()])
  if (schools.size < 50) {
    throw new Error(
      `CFBD FPI/SP returned too few teams (${schools.size}). Check API key / year.`,
    )
  }

  const board = []
  for (const school of schools) {
    const fpi = fpiByTeam.get(school)
    const sp = spByTeam.get(school)
    const eloVal = elo.get(school)
    const eloPower =
      eloVal != null ? Math.round((eloVal - meanElo) * ELO_TO_POINTS * 10) / 10 : null

    const gp = seasonGp.get(school) || 0
    const resultsW = Math.min(MAX_RESULTS_BLEND, gp / RESULTS_BLEND_GAMES)

    let power_rating
    if (fpi != null && Number.isFinite(fpi)) {
      power_rating =
        eloPower != null
          ? Math.round(((1 - resultsW) * fpi + resultsW * eloPower) * 10) / 10
          : Math.round(fpi * 10) / 10
    } else if (sp != null) {
      power_rating = sp.sp
    } else if (eloPower != null) {
      power_rating = eloPower
    } else {
      continue
    }

    const off_rating =
      sp?.off ??
      (fpi != null ? Math.round((27 + power_rating * 0.55) * 10) / 10 : 27)
    const def_rating =
      sp?.def ??
      (fpi != null ? Math.round((27 - power_rating * 0.35) * 10) / 10 : 27)

    const m = meta.get(school) || {
      conference: 'FBS',
      team_abbr: school.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'TEAM',
      full_name: school,
    }

    board.push({
      team_name: m.full_name || school,
      team_abbr: m.team_abbr,
      conference: m.conference,
      power_rating,
      off_rating,
      def_rating,
      tempo_rating: tempoMap.get(school) ?? DEFAULT_TEMPO,
      home_field_advantage: hfaMap.get(school) ?? DEFAULT_HFA,
      fpi: fpi != null ? Math.round(fpi * 10) / 10 : null,
      sp: sp?.sp ?? null,
      elo_power: eloPower,
      season_games: gp,
      school,
    })
  }

  board.sort((a, b) => b.power_rating - a.power_rating)
  return {
    season,
    priorSeason,
    fpiYear: fpiPack.year,
    spYear: spPack.year,
    gameCount: allGames.length,
    seasonGameCount: seasonGames.length,
    board,
  }
}
