/**
 * ESPN Game Summary & Boxscore Post-Mortem Hook.
 *
 * Fetches free real-time boxscore & game summary stats from ESPN's public endpoints:
 * - Total Yards disparity (Offensive yards gained/allowed)
 * - Turnover Margin (+/- turnovers lost)
 * - 3rd Down Efficiency & Redzone TD %
 * - Penalties & Yards
 * - Fluke / Bad Beat vs Model Dominance detection for post-game recaps
 */
import { shortDisplayName } from './loungeBotOddsCaption.ts'

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

function normalizeTeamName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

function isEspnTeamMatch(espnName: string, targetName: string): boolean {
  const norm1 = normalizeTeamName(espnName)
  const norm2 = normalizeTeamName(targetName)
  if (norm1 === norm2) return true
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true
  const short1 = normalizeTeamName(shortDisplayName(espnName))
  const short2 = normalizeTeamName(shortDisplayName(targetName))
  return short1 === short2 || norm1.includes(short2) || norm2.includes(short1)
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
          const competitors: any[] = comp?.competitors || []
          if (competitors.length < 2) continue
          const f1 = competitors[0]?.athlete?.displayName || ''
          const f2 = competitors[1]?.athlete?.displayName || ''

          if (
            (isEspnTeamMatch(f1, homeTeam) && isEspnTeamMatch(f2, awayTeam)) ||
            (isEspnTeamMatch(f1, awayTeam) && isEspnTeamMatch(f2, homeTeam))
          ) {
            const winnerComp = competitors.find((c: any) => c.winner === true)
            const winnerName = winnerComp?.athlete?.displayName || 'Winner'
            const statusDetail = comp?.status?.type?.detail || comp?.status?.type?.shortDetail || 'Final'

            return {
              eventId: comp.id || ev.id,
              espnGameId: comp.id,
              homeTeam,
              awayTeam,
              homeScore: winnerComp?.athlete?.displayName === f1 ? 1 : 0,
              awayScore: winnerComp?.athlete?.displayName === f2 ? 1 : 0,
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
