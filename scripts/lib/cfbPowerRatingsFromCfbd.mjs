/**
 * CFB power board from CollegeFootballData game results.
 *
 * Owned formulas (deterministic, no LLM):
 * 1. Margin-aware Elo over final FBS games (prior season + current).
 * 2. power_rating = (elo - mean_elo) * ELO_TO_POINTS (points vs avg FBS).
 * 3. Iterative SRS for opponent-adjusted off/def point ratings.
 * 4. HFA from multi-year home scoring margin residual (floored sample).
 * 5. Tempo from CFBD season team stats plays/game when present.
 *
 * Requires CFBD_API_KEY (https://collegefootballdata.com/key).
 */

const CFBD_BASE = 'https://api.collegefootballdata.com'

/** Elo → points vs mean. 25 Elo ≈ 1 point. */
export const ELO_TO_POINTS = 0.04
export const ELO_K = 24
export const ELO_HOME_ADV = 65
export const ELO_START = 1500
export const SRS_ITERS = 400
export const DEFAULT_TEMPO = 68
export const DEFAULT_HFA = 2.5
export const MIN_HFA_HOME_GAMES = 8

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

/**
 * FiveThirtyEight-style margin multiplier.
 * @param {number} margin
 * @param {number} eloWinner
 * @param {number} eloLoser
 */
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
 * Iterative SRS (points vs average), then offensive/defensive point ratings.
 * @param {{ home: string, away: string, homePoints: number, awayPoints: number, neutral: boolean }[]} games
 * @param {number} hfaPoints league-average HFA used while iterating
 */
export function computeSrsOffDef(games, hfaPoints = DEFAULT_HFA) {
  /** @type {Set<string>} */
  const teams = new Set()
  for (const g of games) {
    teams.add(g.home)
    teams.add(g.away)
  }

  /** @type {Map<string, number>} */
  const rating = new Map()
  for (const t of teams) rating.set(t, 0)

  for (let iter = 0; iter < SRS_ITERS; iter++) {
    /** @type {Map<string, { sum: number, n: number }>} */
    const acc = new Map()
    for (const t of teams) acc.set(t, { sum: 0, n: 0 })

    for (const g of games) {
      const hfa = g.neutral ? 0 : hfaPoints
      const homeR = rating.get(g.away) ?? 0
      const awayR = rating.get(g.home) ?? 0
      // Home margin vs expectation from opponent rating + HFA
      const homeMargin = g.homePoints - g.awayPoints
      const homeObs = homeMargin - hfa
      const awayObs = -homeObs

      const ha = acc.get(g.home)
      const aa = acc.get(g.away)
      ha.sum += homeObs + (rating.get(g.away) ?? 0)
      ha.n += 1
      aa.sum += awayObs + (rating.get(g.home) ?? 0)
      aa.n += 1
      void homeR
      void awayR
    }

    let mean = 0
    let count = 0
    for (const t of teams) {
      const a = acc.get(t)
      const next = a && a.n > 0 ? a.sum / a.n : 0
      rating.set(t, next)
      mean += next
      count += 1
    }
    mean = count ? mean / count : 0
    for (const t of teams) {
      rating.set(t, (rating.get(t) ?? 0) - mean)
    }
  }

  // Off / def: average points for/against adjusted by opponent rating
  /** @type {Map<string, { pf: number, pa: number, n: number }>} */
  const pts = new Map()
  for (const t of teams) pts.set(t, { pf: 0, pa: 0, n: 0 })
  for (const g of games) {
    const h = pts.get(g.home)
    const a = pts.get(g.away)
    h.pf += g.homePoints
    h.pa += g.awayPoints
    h.n += 1
    a.pf += g.awayPoints
    a.pa += g.homePoints
    a.n += 1
  }

  let leaguePf = 0
  let leagueN = 0
  for (const t of teams) {
    const p = pts.get(t)
    if (p.n > 0) {
      leaguePf += p.pf / p.n
      leagueN += 1
    }
  }
  const avgPf = leagueN ? leaguePf / leagueN : 27

  /** @type {Map<string, { srs: number, off_rating: number, def_rating: number }>} */
  const out = new Map()
  for (const t of teams) {
    const srs = rating.get(t) ?? 0
    const p = pts.get(t)
    const pf = p && p.n > 0 ? p.pf / p.n : avgPf
    const pa = p && p.n > 0 ? p.pa / p.n : avgPf
    // Split SRS into off/def so off - def ≈ power-ish; center around observed scoring
    const off_rating = Math.round((pf + srs * 0.5) * 10) / 10
    const def_rating = Math.round((pa - srs * 0.5) * 10) / 10
    out.set(t, {
      srs: Math.round(srs * 10) / 10,
      off_rating,
      def_rating,
    })
  }
  return out
}

/**
 * Per-team home field advantage from residual home margins.
 * @param {{ home: string, away: string, homePoints: number, awayPoints: number, neutral: boolean }[]} games
 * @param {Map<string, number>} elo
 */
export function computeTeamHfa(games, elo) {
  /** @type {Map<string, { sum: number, n: number }>} */
  const acc = new Map()
  const getElo = (t) => elo.get(t) ?? ELO_START

  for (const g of games) {
    if (g.neutral) continue
    const expectedMargin =
      (getElo(g.home) - getElo(g.away)) * ELO_TO_POINTS
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
    const raw = a.sum / a.n
    const clamped = Math.max(1.5, Math.min(4.5, raw))
    hfa.set(team, Math.round(clamped * 10) / 10)
  }
  return hfa
}

/**
 * @param {any[]} seasonStats
 * @returns {Map<string, number>}
 */
export function tempoFromSeasonStats(seasonStats) {
  /** @type {Map<string, number>} */
  const tempo = new Map()
  for (const row of seasonStats || []) {
    const team = row.team
    if (!team) continue
    // CFBD shapes vary: plays, possessionTime, etc.
    const plays =
      row.plays ??
      row.totalPlays ??
      row.offensivePlays ??
      (Array.isArray(row.stats)
        ? Number(
            (row.stats.find((s) => /plays/i.test(s.stat || s.category || '')) || {})
              .statValue ??
              (row.stats.find((s) => /plays/i.test(s.stat || s.category || '')) || {}).value,
          )
        : null)
    const games = row.games ?? row.gamesPlayed ?? null
    if (plays != null && games != null && Number(games) > 0) {
      tempo.set(team, Math.round((Number(plays) / Number(games)) * 10) / 10)
      continue
    }
    if (plays != null && Number.isFinite(Number(plays))) {
      // already per-game in some payloads
      const v = Number(plays)
      if (v > 40 && v < 100) tempo.set(team, Math.round(v * 10) / 10)
    }
  }
  return tempo
}

/**
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {number} opts.season current season year
 * @param {number} [opts.priorSeason]
 */
export async function buildCfbPowerBoard({ apiKey, season, priorSeason = season - 1 }) {
  const [priorGamesRaw, seasonGamesRaw, teamsRaw, statsRaw, priorStatsRaw] =
    await Promise.all([
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
      cfbdFetch(apiKey, '/stats/season', { year: season }).catch(() => []),
      cfbdFetch(apiKey, '/stats/season', { year: priorSeason }).catch(() => []),
    ])

  const priorGames = normalizeCompletedGames(priorGamesRaw)
  const seasonGames = normalizeCompletedGames(seasonGamesRaw)
  const allGames = [...priorGames, ...seasonGames]
  if (allGames.length < 50) {
    throw new Error(
      `CFBD returned too few completed games (${allGames.length}). Check API key / season.`,
    )
  }

  const elo = computeEloRatings(allGames)
  const srsMap = computeSrsOffDef(seasonGames.length >= 20 ? seasonGames : allGames)
  const hfaMap = computeTeamHfa(allGames, elo)
  const tempoMap = tempoFromSeasonStats(
    Array.isArray(statsRaw) && statsRaw.length ? statsRaw : priorStatsRaw,
  )

  let eloSum = 0
  let eloN = 0
  for (const v of elo.values()) {
    eloSum += v
    eloN += 1
  }
  const meanElo = eloN ? eloSum / eloN : ELO_START

  /** @type {Map<string, { conference: string, team_abbr: string, full_name: string }>} */
  const meta = new Map()
  for (const t of teamsRaw || []) {
    const school = t.school || t.team || t.displayName
    if (!school) continue
    const mascot = t.mascot || ''
    const abbr = (t.abbreviation || t.alt_name1 || school.slice(0, 4)).toString().toUpperCase()
    const conference = t.conference || t.conferenceName || 'FBS'
    const full_name = mascot ? `${school} ${mascot}` : school
    meta.set(school, { conference, team_abbr: abbr.slice(0, 8), full_name })
  }

  /** Prefer teams that appear in Elo from FBS games */
  const board = []
  for (const [team_name, eloVal] of elo) {
    const power_rating = Math.round((eloVal - meanElo) * ELO_TO_POINTS * 10) / 10
    const srs = srsMap.get(team_name)
    const m = meta.get(team_name) || {
      conference: 'FBS',
      team_abbr: team_name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'TEAM',
      full_name: team_name,
    }
    board.push({
      team_name: m.full_name || team_name,
      team_abbr: m.team_abbr,
      conference: m.conference,
      power_rating,
      off_rating: srs?.off_rating ?? Math.round((27 + power_rating * 0.5) * 10) / 10,
      def_rating: srs?.def_rating ?? Math.round((27 - power_rating * 0.5) * 10) / 10,
      tempo_rating: tempoMap.get(team_name) ?? DEFAULT_TEMPO,
      home_field_advantage: hfaMap.get(team_name) ?? DEFAULT_HFA,
      elo: Math.round(eloVal * 10) / 10,
      school: team_name,
    })
  }

  board.sort((a, b) => b.power_rating - a.power_rating)
  return {
    season,
    priorSeason,
    gameCount: allGames.length,
    seasonGameCount: seasonGames.length,
    board,
  }
}
