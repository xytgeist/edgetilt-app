/**
 * CFB power board for Sharpe Syndicate desks (Scott / Rocco / Tank).
 *
 * Phase 1 consensus (points vs avg FBS, then weighted):
 *   40% SP+ overall · 25% FPI · 25% Sagarin Predictor · 10% score Elo
 *
 * Also stores SP+ off/def (Rocco), tempo (Tank), HFA (home residual).
 * Requires CFBD_API_KEY. Sagarin is fetched from the public HTML board.
 */

import { fetchSagarinPredictorBySchool } from './cfbSagarinPredictor.mjs'

const CFBD_BASE = 'https://api.collegefootballdata.com'

/** Elo → points vs mean. 25 Elo ≈ 1 point. */
export const ELO_TO_POINTS = 0.04
export const ELO_K = 24
export const ELO_HOME_ADV = 65
export const ELO_START = 1500
export const DEFAULT_TEMPO = 68
export const DEFAULT_HFA = 2.5
export const MIN_HFA_HOME_GAMES = 4

/** Phase 1 consensus weights (renormalize if a voter is missing for a team). */
export const CONSENSUS_WEIGHTS = {
  sp: 0.4,
  fpi: 0.25,
  sagarin: 0.25,
  elo: 0.1,
}

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

async function fetchRatingsWithFallback(apiKey, path, season, priorSeason) {
  const current = await cfbdFetch(apiKey, path, { year: season }).catch(() => [])
  if (Array.isArray(current) && current.length > 0) {
    return { rows: current, year: season }
  }
  const prior = await cfbdFetch(apiKey, path, { year: priorSeason })
  return { rows: prior || [], year: priorSeason }
}

/**
 * Center a rating map on the mean of values present for `schools`.
 * @param {Map<string, number>} raw
 * @param {Iterable<string>} schools
 * @returns {Map<string, number>}
 */
export function centerOnMean(raw, schools) {
  const vals = []
  for (const s of schools) {
    const v = raw.get(s)
    if (v != null && Number.isFinite(v)) vals.push(v)
  }
  const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  /** @type {Map<string, number>} */
  const out = new Map()
  for (const s of schools) {
    const v = raw.get(s)
    if (v == null || !Number.isFinite(v)) continue
    out.set(s, v - mean)
  }
  return out
}

/**
 * Weighted blend; renormalizes over voters present for that team.
 * @param {{ w: number, v: number | null | undefined }[]} parts
 * @returns {number | null}
 */
export function weightedConsensus(parts) {
  let tw = 0
  let sum = 0
  for (const p of parts) {
    if (p.v == null || !Number.isFinite(p.v)) continue
    tw += p.w
    sum += p.w * p.v
  }
  if (tw <= 0) return null
  return Math.round((sum / tw) * 10) / 10
}

/**
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {number} opts.season
 * @param {number} [opts.priorSeason]
 */
export async function buildCfbPowerBoard({ apiKey, season, priorSeason = season - 1 }) {
  const [fpiPack, spPack, priorGamesRaw, seasonGamesRaw, teamsRaw, advancedPack] =
    await Promise.all([
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
  const fpiRaw = new Map()
  for (const row of fpiPack.rows || []) {
    if (!row.team || row.fpi == null) continue
    fpiRaw.set(row.team, Number(row.fpi))
  }

  /** @type {Map<string, { off: number, def: number, sp: number }>} */
  const spByTeam = new Map()
  /** @type {Map<string, number>} */
  const spRaw = new Map()
  for (const row of spPack.rows || []) {
    if (!row.team) continue
    const off = Number(row.offense?.rating)
    const def = Number(row.defense?.rating)
    const sp = Number(row.rating)
    if (!Number.isFinite(off) || !Number.isFinite(def)) continue
    const spVal = Number.isFinite(sp) ? sp : off - def
    spByTeam.set(row.team, {
      off: Math.round(off * 10) / 10,
      def: Math.round(def * 10) / 10,
      sp: Math.round(spVal * 10) / 10,
    })
    spRaw.set(row.team, spVal)
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

  const schools = new Set([...fpiRaw.keys(), ...spRaw.keys()])
  if (schools.size < 50) {
    throw new Error(
      `CFBD FPI/SP returned too few teams (${schools.size}). Check API key / year.`,
    )
  }

  let sagarinRaw = new Map()
  let sagarinOk = false
  try {
    const sag = await fetchSagarinPredictorBySchool(schools)
    sagarinRaw = sag.bySchool
    sagarinOk = sagarinRaw.size >= 40
  } catch (err) {
    console.warn(`[cfb-power] Sagarin unavailable (${err.message || err}); blending without it`)
  }

  /** @type {Map<string, number>} */
  const eloRaw = new Map()
  for (const school of schools) {
    const eloVal = elo.get(school)
    if (eloVal == null) continue
    eloRaw.set(school, (eloVal - meanElo) * ELO_TO_POINTS)
  }

  const fpiPts = centerOnMean(fpiRaw, schools)
  const spPts = centerOnMean(spRaw, schools)
  const sagPts = sagarinOk ? centerOnMean(sagarinRaw, schools) : new Map()
  const eloPts = centerOnMean(eloRaw, schools)

  const board = []
  for (const school of schools) {
    const sp = spByTeam.get(school)
    const fpi = fpiRaw.get(school)
    const sag = sagarinRaw.get(school)
    const eloPower = eloPts.has(school) ? Math.round(eloPts.get(school) * 10) / 10 : null

    const power_rating = weightedConsensus([
      { w: CONSENSUS_WEIGHTS.sp, v: spPts.get(school) },
      { w: CONSENSUS_WEIGHTS.fpi, v: fpiPts.get(school) },
      { w: CONSENSUS_WEIGHTS.sagarin, v: sagPts.get(school) },
      { w: CONSENSUS_WEIGHTS.elo, v: eloPts.get(school) },
    ])
    if (power_rating == null) continue

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
      fpi_rating: fpi != null ? Math.round(fpi * 10) / 10 : null,
      sp_rating: sp?.sp ?? null,
      sagarin_rating: sag != null ? Math.round(sag * 10) / 10 : null,
      elo_power: eloPower,
      season_games: seasonGp.get(school) || 0,
      school,
    })
  }

  board.sort((a, b) => b.power_rating - a.power_rating)
  return {
    season,
    priorSeason,
    fpiYear: fpiPack.year,
    spYear: spPack.year,
    sagarinOk,
    sagarinMatched: sagarinRaw.size,
    gameCount: allGames.length,
    seasonGameCount: seasonGames.length,
    weights: CONSENSUS_WEIGHTS,
    board,
  }
}
