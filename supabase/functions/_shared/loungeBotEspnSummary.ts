/**
 * ESPN Game Summary & Boxscore Post-Mortem Hook.
 *
 * Also loads completed scoreboard rows for auto-grade when The Odds API
 * `/scores` drops finished events (MMA) or lags `completed` (some CFB).
 *
 * Fetches free real-time boxscore & game summary stats from ESPN's public endpoints:
 * - Total Yards disparity (Offensive yards gained/allowed)
 * - Turnover Margin (+/- turnovers lost)
 * - 3rd Down Efficiency & Redzone TD %
 * - Penalties & Yards
 * - Fluke / Bad Beat vs Model Dominance detection for post-game recaps
 */
import { shortDisplayName } from './loungeBotOddsCaption.ts'

const ESPN_SCOREBOARD_MS = 8_000
const ESPN_SITE = 'https://site.api.espn.com/apis/site/v2/sports'

export type EspnCompletedEvent = {
  kind: 'team' | 'person'
  homeName: string
  awayName: string
  winnerName: string | null
  homeScore: number
  awayScore: number
}

type EspnScoreboardSpec = {
  url: string
  kind: 'team' | 'person'
}

export type EspnGameSummary = {
  eventId: string
  espnGameId?: string
  homeTeam: string
  awayTeam: string
  homeScore: number
  awayScore: number
  homeTotalYards?: number
  awayTotalYards?: number
  homeTurnovers?: number
  awayTurnovers?: number
  homePenaltiesYards?: string
  awayPenaltiesYards?: string
  turnoverMarginHome?: number // home takeaways - home giveaways (+ = home won turnover battle)
  yardageMarginHome?: number  // home yards - away yards
  isFlukeLossForHome?: boolean // e.g. Home outgained Away by 150+ yds but lost due to -3 turnover margin
  isFlukeLossForAway?: boolean
  isModelBlowoutDomination?: boolean // Outgained by 150+ yds & covered easily
  postMortemNote?: string
}

function stripDiacritics(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeTeamName(name: string): string {
  return stripDiacritics(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

function lastNameToken(name: string): string {
  const parts = stripDiacritics(name).trim().split(/\s+/).filter(Boolean)
  return (parts[parts.length - 1] || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function isEspnTeamMatch(espnName: string, targetName: string): boolean {
  const norm1 = normalizeTeamName(espnName)
  const norm2 = normalizeTeamName(targetName)
  if (!norm1 || !norm2) return false
  if (norm1 === norm2) return true
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true
  const short1 = normalizeTeamName(shortDisplayName(espnName))
  const short2 = normalizeTeamName(shortDisplayName(targetName))
  return Boolean(short1 && short2) && (
    short1 === short2 || norm1.includes(short2) || norm2.includes(short1)
  )
}

function isEspnPersonMatch(espnName: string, targetName: string): boolean {
  if (isEspnTeamMatch(espnName, targetName)) return true
  const last1 = lastNameToken(espnName)
  const last2 = lastNameToken(targetName)
  return last1.length >= 4 && last1 === last2
}

function espnScoreboardSpec(sportKey: string): EspnScoreboardSpec | null {
  const sk = String(sportKey || '').toLowerCase()
  if (sk.includes('mma') || sk.includes('ufc')) {
    return { url: `${ESPN_SITE}/mma/ufc/scoreboard`, kind: 'person' }
  }
  if (sk.includes('football_nfl')) {
    return { url: `${ESPN_SITE}/football/nfl/scoreboard`, kind: 'team' }
  }
  if (sk.includes('ncaaf') || sk.includes('college-football')) {
    return { url: `${ESPN_SITE}/football/college-football/scoreboard`, kind: 'team' }
  }
  if (sk.includes('ncaab')) {
    return { url: `${ESPN_SITE}/basketball/mens-college-basketball/scoreboard`, kind: 'team' }
  }
  if (sk.includes('basketball_nba') || sk.endsWith('_nba')) {
    return { url: `${ESPN_SITE}/basketball/nba/scoreboard`, kind: 'team' }
  }
  if (sk.includes('baseball_mlb') || sk.endsWith('_mlb')) {
    return { url: `${ESPN_SITE}/baseball/mlb/scoreboard`, kind: 'team' }
  }
  if (sk.includes('icehockey_nhl') || sk.endsWith('_nhl')) {
    return { url: `${ESPN_SITE}/hockey/nhl/scoreboard`, kind: 'team' }
  }
  return null
}

function isEspnCompletedStatus(status: { completed?: boolean; state?: string } | null | undefined): boolean {
  if (!status) return false
  if (status.completed === true) return true
  return String(status.state || '').toLowerCase() === 'post'
}

function competitorLabel(comp: Record<string, unknown> | null | undefined): string {
  const athlete = comp?.athlete as { displayName?: string } | undefined
  const team = comp?.team as { displayName?: string; name?: string } | undefined
  return String(athlete?.displayName || team?.displayName || team?.name || '').trim()
}

/**
 * One ESPN scoreboard fetch per sport. Only `completed` / `post` events.
 * MMA scores are 1-0 from the winner flag (ESPN does not give round totals here).
 */
export async function fetchEspnCompletedScoreboard(sportKey: string): Promise<EspnCompletedEvent[]> {
  const spec = espnScoreboardSpec(sportKey)
  if (!spec) return []

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), ESPN_SCOREBOARD_MS)
  try {
    const res = await fetch(spec.url, { headers: { Accept: 'application/json' }, signal: ac.signal })
    if (!res.ok) return []
    const data = await res.json() as { events?: unknown[] }
    const events = Array.isArray(data?.events) ? data.events : []
    const out: EspnCompletedEvent[] = []

    for (const evRaw of events) {
      const ev = evRaw as Record<string, unknown>
      const competitions = Array.isArray(ev.competitions) ? ev.competitions : []
      for (const compRaw of competitions) {
        const comp = compRaw as Record<string, unknown>
        const status = (comp.status as { type?: { completed?: boolean; state?: string } } | undefined)?.type
          || (ev.status as { type?: { completed?: boolean; state?: string } } | undefined)?.type
        if (!isEspnCompletedStatus(status)) continue

        const competitors = Array.isArray(comp.competitors) ? comp.competitors as Array<Record<string, unknown>> : []
        if (competitors.length < 2) continue

        if (spec.kind === 'person') {
          const a = competitors[0]
          const b = competitors[1]
          const aName = competitorLabel(a)
          const bName = competitorLabel(b)
          const winner = competitors.find((c) => c.winner === true)
          const winnerName = competitorLabel(winner) || null
          if (!aName || !bName || !winnerName) continue
          const aWon = isEspnPersonMatch(winnerName, aName)
          const bWon = isEspnPersonMatch(winnerName, bName)
          if (aWon === bWon) continue
          out.push({
            kind: 'person',
            homeName: aName,
            awayName: bName,
            winnerName,
            homeScore: aWon ? 1 : 0,
            awayScore: bWon ? 1 : 0,
          })
          continue
        }

        const homeComp = competitors.find((c) => c.homeAway === 'home') || competitors[0]
        const awayComp = competitors.find((c) => c.homeAway === 'away') || competitors[1]
        const homeName = competitorLabel(homeComp)
        const awayName = competitorLabel(awayComp)
        const homeScore = parseInt(String(homeComp?.score ?? ''), 10)
        const awayScore = parseInt(String(awayComp?.score ?? ''), 10)
        if (!homeName || !awayName || Number.isNaN(homeScore) || Number.isNaN(awayScore)) continue
        out.push({
          kind: 'team',
          homeName,
          awayName,
          winnerName: homeScore === awayScore ? null : (homeScore > awayScore ? homeName : awayName),
          homeScore,
          awayScore,
        })
      }
    }
    return out
  } catch (err) {
    console.warn(`ESPN completed scoreboard failed for ${sportKey}:`, err)
    return []
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Map an Odds API home/away pair onto an ESPN completed row.
 * Person sports remap the 1-0 onto our home/away, not ESPN's competitor order.
 * Ambiguous (2+ hits) returns null.
 */
export function matchEspnFinalScore(
  board: EspnCompletedEvent[],
  homeTeam: string,
  awayTeam: string,
): { homeScore: number; awayScore: number } | null {
  const hits: Array<{ homeScore: number; awayScore: number }> = []
  for (const row of board) {
    const person = row.kind === 'person'
    const match = person ? isEspnPersonMatch : isEspnTeamMatch
    const aligned = match(row.homeName, homeTeam) && match(row.awayName, awayTeam)
    const swapped = match(row.awayName, homeTeam) && match(row.homeName, awayTeam)
    if (!aligned && !swapped) continue

    if (person) {
      if (!row.winnerName) continue
      const homeWon = isEspnPersonMatch(row.winnerName, homeTeam)
      const awayWon = isEspnPersonMatch(row.winnerName, awayTeam)
      if (homeWon === awayWon) continue
      hits.push({ homeScore: homeWon ? 1 : 0, awayScore: awayWon ? 1 : 0 })
      continue
    }

    hits.push(
      aligned
        ? { homeScore: row.homeScore, awayScore: row.awayScore }
        : { homeScore: row.awayScore, awayScore: row.homeScore },
    )
  }
  if (hits.length !== 1) return null
  return hits[0]
}

/** MMA 1-0 cannot grade totals/spreads. Team sports can. */
export function espnFallbackCoversMarket(sportKey: string, marketKey: string): boolean {
  const sk = String(sportKey || '').toLowerCase()
  const mk = String(marketKey || '').toLowerCase()
  if (mk === 'teasers') return espnScoreboardSpec(sportKey)?.kind === 'team'
  if (sk.includes('mma') || sk.includes('ufc') || sk.startsWith('boxing')) {
    return mk === 'h2h'
  }
  return mk === 'h2h' || mk === 'spreads' || mk === 'totals'
}

/**
 * Fetch and analyze ESPN boxscore summary for an NFL, CFB, or UFC/MMA completed event.
 */
export async function fetchEspnGameSummary(
  sportKey: string,
  homeTeam: string,
  awayTeam: string,
): Promise<EspnGameSummary | null> {
  const isNfl = sportKey.includes('nfl')
  const isCfb = sportKey.includes('ncaaf') || sportKey.includes('college')
  const isMma = sportKey.includes('mma') || sportKey.includes('ufc')

  if (!isNfl && !isCfb && !isMma) return null

  // MMA / UFC scoreboard parsing
  const espnAbort = new AbortController()
  const espnTimer = setTimeout(() => espnAbort.abort(), 8000)

  if (isMma) {
    try {
      const ufcUrl = 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard'
      const res = await fetch(ufcUrl, { headers: { Accept: 'application/json' }, signal: espnAbort.signal })
      if (!res.ok) return null
      const data = await res.json()
      const events: any[] = data?.events || []

      for (const ev of events) {
        const comps: any[] = ev?.competitions || []
        for (const comp of comps) {
          const statusType = comp?.status?.type
          if (!isEspnCompletedStatus(statusType)) continue
          const competitors: any[] = comp?.competitors || []
          if (competitors.length < 2) continue
          const f1 = competitors[0]?.athlete?.displayName || ''
          const f2 = competitors[1]?.athlete?.displayName || ''

          if (
            (isEspnPersonMatch(f1, homeTeam) && isEspnPersonMatch(f2, awayTeam)) ||
            (isEspnPersonMatch(f1, awayTeam) && isEspnPersonMatch(f2, homeTeam))
          ) {
            const winnerComp = competitors.find((c: any) => c.winner === true)
            const winnerName = winnerComp?.athlete?.displayName || ''
            if (!winnerName) continue
            const statusDetail = statusType?.detail || statusType?.shortDetail || 'Final'
            const homeWon = isEspnPersonMatch(winnerName, homeTeam)
            const awayWon = isEspnPersonMatch(winnerName, awayTeam)
            if (homeWon === awayWon) continue

            return {
              eventId: comp.id || ev.id,
              espnGameId: comp.id,
              homeTeam,
              awayTeam,
              homeScore: homeWon ? 1 : 0,
              awayScore: awayWon ? 1 : 0,
              postMortemNote: `UFC Result: ${winnerName} def. by ${statusDetail}.`,
            }
          }
        }
      }
      return null
    } catch (err) {
      console.warn(`ESPN MMA summary fetch failed for ${homeTeam} vs ${awayTeam}:`, err)
      return null
    } finally {
      clearTimeout(espnTimer)
    }
  }

  const league = isNfl ? 'football/nfl' : 'football/college-football'
  const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/${league}/scoreboard`

  try {
    const res = await fetch(scoreboardUrl, {
      headers: { Accept: 'application/json' },
      signal: espnAbort.signal,
    })
    if (!res.ok) return null

    const data = await res.json()
    const events: any[] = data?.events || []

    let matchedEvent: any = null
    for (const ev of events) {
      const comps = ev?.competitions?.[0]?.competitors || []
      if (comps.length < 2) continue
      const homeComp = comps.find((c: any) => c.homeAway === 'home')
      const awayComp = comps.find((c: any) => c.homeAway === 'away')

      if (homeComp && awayComp) {
        const hName = homeComp.team?.displayName || homeComp.team?.name || ''
        const aName = awayComp.team?.displayName || awayComp.team?.name || ''
        if (isEspnTeamMatch(hName, homeTeam) || isEspnTeamMatch(aName, awayTeam)) {
          matchedEvent = ev
          break
        }
      }
    }

    if (!matchedEvent) return null

    const espnGameId = matchedEvent.id
    const comp = matchedEvent.competitions?.[0]
    const homeComp = comp?.competitors?.find((c: any) => c.homeAway === 'home')
    const awayComp = comp?.competitors?.find((c: any) => c.homeAway === 'away')

    const homeScore = parseInt(homeComp?.score || '0', 10)
    const awayScore = parseInt(awayComp?.score || '0', 10)

    // Now fetch detailed game summary / boxscore
    const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/${league}/summary?event=${espnGameId}`
    const sumRes = await fetch(summaryUrl, {
      headers: { Accept: 'application/json' },
      signal: espnAbort.signal,
    })

    let homeTotalYards = 0
    let awayTotalYards = 0
    let homeTurnovers = 0
    let awayTurnovers = 0

    if (sumRes.ok) {
      const sumData = await sumRes.json()
      const boxscoreTeams = sumData?.boxscore?.teams || []
      for (const t of boxscoreTeams) {
        const isHome = t.homeAway === 'home' || isEspnTeamMatch(t.team?.displayName || '', homeTeam)
        const stats: any[] = t.statistics || []

        for (const s of stats) {
          const statName = (s.name || s.label || '').toLowerCase()
          const val = parseFloat(s.displayValue || '0')

          if (statName.includes('totalyards') || statName === 'total yards' || statName === 'totalnetearns') {
            if (isHome) homeTotalYards = val
            else awayTotalYards = val
          }
          if (statName.includes('turnovers') || statName === 'turnovers') {
            if (isHome) homeTurnovers = val
            else awayTurnovers = val
          }
        }
      }
    }

    // Yardage and turnover disparities
    const yardageMarginHome = homeTotalYards - awayTotalYards
    const turnoverMarginHome = awayTurnovers - homeTurnovers // positive means home forced more turnovers

    let isFlukeLossForHome = false
    let isFlukeLossForAway = false
    let isModelBlowoutDomination = false
    let postMortemNote = ''

    // Post-Mortem Diagnostics:
    // 1. Turnover Fluke / Bad Beat: Outgained the opponent by 100+ yards, but lost game due to turnover disparity
    if (homeScore < awayScore && yardageMarginHome >= 100 && turnoverMarginHome <= -2) {
      isFlukeLossForHome = true
      postMortemNote = `Boxscore Fluke: ${shortDisplayName(homeTeam)} outgained ${shortDisplayName(awayTeam)} ${homeTotalYards}-${awayTotalYards} yards, but lost on a ${Math.abs(turnoverMarginHome)} turnover deficit.`
    } else if (awayScore < homeScore && yardageMarginHome <= -100 && turnoverMarginHome >= 2) {
      isFlukeLossForAway = true
      postMortemNote = `Boxscore Fluke: ${shortDisplayName(awayTeam)} outgained ${shortDisplayName(homeTeam)} ${awayTotalYards}-${homeTotalYards} yards, but lost on a ${turnoverMarginHome} turnover deficit.`
    } else if (Math.abs(yardageMarginHome) >= 150 && Math.abs(homeScore - awayScore) >= 14) {
      // 2. Pure Model Domination
      isModelBlowoutDomination = true
      const dominantTeam = yardageMarginHome > 0 ? homeTeam : awayTeam
      const dominYards = yardageMarginHome > 0 ? homeTotalYards : awayTotalYards
      const oppYards = yardageMarginHome > 0 ? awayTotalYards : homeTotalYards
      postMortemNote = `Model Dominance: ${shortDisplayName(dominantTeam)} controlled the trenches with a ${dominYards} to ${oppYards} total yard advantage.`
    }

    return {
      eventId: matchedEvent.id,
      espnGameId,
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      homeTotalYards,
      awayTotalYards,
      homeTurnovers,
      awayTurnovers,
      turnoverMarginHome,
      yardageMarginHome,
      isFlukeLossForHome,
      isFlukeLossForAway,
      isModelBlowoutDomination,
      postMortemNote,
    }
  } catch (err) {
    console.warn(`ESPN game summary fetch failed for ${homeTeam} vs ${awayTeam}:`, err)
    return null
  } finally {
    clearTimeout(espnTimer)
  }
}
