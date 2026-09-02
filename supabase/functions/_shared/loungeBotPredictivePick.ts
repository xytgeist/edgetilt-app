/**
 * Predictive sports betting calls for the Sharp Desk (Scott, Rocco, Chedda, Tank).
 * Supports solo calls and syndicate multi-picker cards.
 * Auto-grades against The Odds API final scores with unit tracking and consolidated card recaps.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  formatAmericanOdds,
  formatOddsCommenceTimeShort,
  shortDisplayName,
  type OddsPick,
} from './loungeBotOddsCaption.ts'
import { publishLoungeBotPost } from './loungeBotPublish.ts'
import { publishBotSubChatMessage } from './loungeBotSubChatPublish.ts'
import { fetchGameWeather, type GameWeatherSummary } from './loungeBotWeather.ts'
import { oddsSportKeyToRundownSportId } from './loungeBotRundownContext.ts'
import { loadPersonaWeights } from './loungeBotPersonaAdaptive.ts'
import { fetchGameInjuryPval, type GameInjurySummary } from './loungeBotInjuryPval.ts'
import { resolveGameBettingSplits, type BettingSplitSummary } from './loungeBotBettingSplits.ts'
import {
  calculateTrenchEpaMatchup,
  estimateNflModelTotal,
  loadDbTeamMetricsMap,
  type TrenchEpaMatchupSummary,
  type NflTeamMetrics,
} from './loungeBotTeamMetrics.ts'
import {
  calculateCfbMatchupProjection,
  loadDbCfbPowerRatingsMap,
  type CfbMatchupProjection,
  type CfbTeamPowerRating,
} from './loungeBotCfbPowerRatings.ts'
import { fetchEspnGameSummary, type EspnGameSummary } from './loungeBotEspnSummary.ts'
import { analyzeFootballKeyNumbers } from './loungeBotKeyNumbers.ts'

const ODDS_BASE = 'https://api.the-odds-api.com/v4'

export const SHARP_PICKERS = ['Scott', 'Rocco', 'Chedda', 'Tank'] as const
export type SharpPicker = (typeof SHARP_PICKERS)[number]
/** ATS side votes only … Tank lives on totals and does not fill fake 4-0 hammers. */
export const ATS_SIDE_DESKS = ['Scott', 'Rocco', 'Chedda'] as const
export type AtsSideDesk = (typeof ATS_SIDE_DESKS)[number]

export type SinglePickerPick = {
  pickerName: SharpPicker
  pick: OddsPick
}

export type SlateDeskSide = 'home' | 'away' | 'over' | 'under' | 'pass'

export type SlateGamePick = {
  eventId: string
  sportKey: string
  homeTeam: string
  awayTeam: string
  commenceTime: string
  spreadPoint: number | null // home spread point (e.g. -3.5 or +2.5)
  marketTotal: number | null
  modelTotal: number | null
  splits?: BettingSplitSummary
  trenchEpa?: TrenchEpaMatchupSummary | null
  consensusPick: {
    side: 'home' | 'away'
    teamName: string
    lineDisplay: string
    voteCount: number // e.g. 3 or 2 among ATS desks
    type: 'hammer' | 'consensus' | 'split'
    badgeText: string // '🔥 3-0 Hammer' | '🎯 2-1 Consensus' | '⚔️ 1-1 Split'
  }
  pickerPicks: Record<SharpPicker, {
    side: SlateDeskSide
    teamName: string
    lineDisplay: string
    pickPrice: number
    pick: OddsPick
  }>
}

export type NflSlateCard = {
  cardTitle: string
  sportKey: string
  games: SlateGamePick[]
  hammers: SlateGamePick[]
  consensus: SlateGamePick[]
  splits: SlateGamePick[]
}

export type ScoreEvent = {
  id: string
  sport_key: string
  completed: boolean
  home_team?: string
  away_team?: string
  scores?: Array<{ name: string; score: string }>
}

/**
 * Format a single pick line for display.
 * E.g. "Diamondbacks +1.5 (-110)" or "Orioles ML (+125)" or "Over 8.5 (-105)"
 */
export function formatPickLine(pick: OddsPick): string {
  const odds = formatAmericanOdds(pick.pickPrice)
  if (pick.marketKey === 'h2h') {
    return `${shortDisplayName(pick.pickName)} ML (${odds})`
  }
  if (pick.marketKey === 'spreads' && pick.linePoint != null) {
    const pt = pick.linePoint > 0 ? `+${pick.linePoint}` : String(pick.linePoint)
    return `${shortDisplayName(pick.pickName)} ${pt} (${odds})`
  }
  if (pick.marketKey === 'totals' && pick.linePoint != null) {
    const side = /^over$/i.test(pick.pickName) ? 'Over' : /^under$/i.test(pick.pickName) ? 'Under' : pick.pickName
    return `${side} ${pick.linePoint} (${odds})`
  }
  return `${pick.pickName} (${odds})`
}

/**
 * Format a solo predictive pick post.
 *
 * Example:
 * 🎯 Tank's Pick
 *
 * Under 43.5 (-110)
 * Bills vs Dolphins (1:05 PM PT)
 * 💨 Highmark Stadium · 38°F · Wind 19 mph
 */
export function formatSoloPredictiveCaption(
  pickerName: SharpPicker,
  pick: OddsPick,
  weather?: GameWeatherSummary | null,
  injuries?: GameInjurySummary | null,
  splits?: BettingSplitSummary | null,
  trenchEpa?: TrenchEpaMatchupSummary | null,
  cfbMatchup?: CfbMatchupProjection | null,
): string {
  const line = formatPickLine(pick)
  const away = shortDisplayName(pick.awayTeam)
  const home = shortDisplayName(pick.homeTeam)
  const when = formatOddsCommenceTimeShort(pick.commenceTime)
  const matchup = `${away} vs ${home} (${when})`

  const lines = [`🎯 ${pickerName}'s Pick\n\n${line}\n${matchup}`]
  if (weather && !weather.isDome && (weather.isHighWind || weather.isExtremeCold || weather.isPrecipAlert)) {
    lines.push(`\n📍 ${weather.summaryLine}`)
  }
  if (injuries && injuries.isSignificant && injuries.summaryLine) {
    lines.push(`\n🚑 Injury Impact: ${injuries.summaryLine}`)
  }
  if (splits && splits.isSharpDivergence && splits.summaryLine) {
    lines.push(`\n📊 Sharp Splits: ${splits.summaryLine}`)
  }
  if (trenchEpa && (trenchEpa.isTrenchMismatch || trenchEpa.isEpaMismatch) && trenchEpa.summaryLine) {
    lines.push(`\n⚔️ Matchup Edge: ${trenchEpa.summaryLine}`)
  }
  if (cfbMatchup && cfbMatchup.summaryLine) {
    lines.push(`\n📈 ${cfbMatchup.summaryLine}`)
  }
  if (pick.marketKey === 'spreads' && (pick.sportKey?.includes('nfl') || pick.sportKey?.includes('americanfootball'))) {
    const keyAnalysis = analyzeFootballKeyNumbers(pick.linePoint)
    if (keyAnalysis.isHookGolden && keyAnalysis.sharpRecommendation) {
      lines.push(`\n⚡ Key Number Edge: ${keyAnalysis.sharpRecommendation}`)
    } else if (keyAnalysis.isHookTax && keyAnalysis.hookWarning) {
      lines.push(`\n⚠️ Key Margin Note: ${keyAnalysis.hookWarning}`)
    }
  }

  return lines.join('')
}

/**
 * Format a multi-picker syndicate card post.
 *
 * Example:
 * 🏈 Sunday Syndicate Card
 *
 * 🎯 Scott: Chiefs -3.5 (-110)
 * 🎯 Rocco: Lions -6.5 (-105)
 * 🎯 Chedda: Cardinals ML (+165)
 * 🎯 Tank: Over 47.5 (-110) Bills/Dolphins
 */
export function formatSyndicateCardCaption(title: string, picks: SinglePickerPick[]): string {
  const lines: string[] = [`${title || '🎯 Sharpe Syndicate Card'}\n`]
  for (const item of picks) {
    const pLine = formatPickLine(item.pick)
    const away = shortDisplayName(item.pick.awayTeam)
    const home = shortDisplayName(item.pick.homeTeam)
    lines.push(`🎯 ${item.pickerName}: ${pLine} (${away}/${home})`)
  }
  return lines.join('\n')
}

/** Public Lounge slate teaser caps (VIP still gets full uncut desk cards). */
export const PUBLIC_SLATE_HAMMER_CAP = 1
export const PUBLIC_SLATE_CONSENSUS_CAP = 2
export const PUBLIC_SLATE_HOUSE_DIVIDED_CAP = 3

/**
 * Locked public slate markdown dialect (v5):
 * - H1 title + week line; H1 section headers (Hammers / Consensus / House Divided)
 * - Hammers + consensus + house-divided sides: **[gold]{pick}[/gold]**
 * - Game meta: ({away}/{home} · {when}); desk names on consensus + house divided only (not hammers)
 * - House divided: one bullet per side (gold), not "vs" on one row
 * - Caps: 1 / 2 / 3 games; middle dots preserved via markdown dialect sanitize
 */
function formatSlateWeekSubtitle(games: SlateGamePick[]): string | null {
  const times = games
    .map((g) => Date.parse(String(g.commenceTime || '')))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b)
  if (!times.length) return null
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
  })
  const start = fmt.format(new Date(times[0]))
  const end = fmt.format(new Date(times[times.length - 1]))
  return start === end ? start : `${start}-${end}`
}

/** Rough NFL/CFB slate week label from earliest kickoff (display only). */
function estimateSlateWeekNumber(ms: number): number | null {
  const d = new Date(ms)
  const month = d.getUTCMonth()
  if (month < 7 || month > 11) return null
  const seasonAnchor = Date.UTC(d.getUTCFullYear(), 8, 1)
  if (ms < seasonAnchor) return null
  const week = Math.floor((ms - seasonAnchor) / (7 * 24 * 60 * 60 * 1000)) + 1
  return Math.min(Math.max(week, 1), 18)
}

function formatSlateWeekLine(games: SlateGamePick[]): string | null {
  const range = formatSlateWeekSubtitle(games)
  if (!range) return null
  const earliest = games
    .map((g) => Date.parse(String(g.commenceTime || '')))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b)[0]
  const weekNum = earliest != null ? estimateSlateWeekNumber(earliest) : null
  return weekNum ? `Week ${weekNum} · ${range}` : range
}

function formatSlateGameMeta(g: SlateGamePick): string {
  const away = shortDisplayName(g.awayTeam)
  const home = shortDisplayName(g.homeTeam)
  const when = formatOddsCommenceTimeShort(g.commenceTime)
  return `(${away}/${home} · ${when})`
}

function pickersForLineDisplay(g: SlateGamePick, lineDisplay: string): SharpPicker[] {
  return ATS_SIDE_DESKS.filter((p) => g.pickerPicks[p].lineDisplay === lineDisplay)
}

function formatSlatePickBullet(
  g: SlateGamePick,
  lineDisplay: string,
  pickers?: SharpPicker[],
): string {
  const desks = pickers?.length ? ` · ${pickers.join(', ')}` : ''
  return `- **[gold]${lineDisplay}[/gold]** ${formatSlateGameMeta(g)}${desks}`
}

/**
 * Format an NFL / Football Slate Card caption for the Lounge feed.
 * Public tease only: max 1 hammer, 2 consensus, 3 house-divided games (one row each).
 * Side buckets are Scott/Rocco/Chedda only; Tank totals listed separately when he has a lean.
 */
export function formatNflSlateCardCaption(card: NflSlateCard): string {
  const hammers = card.hammers.slice(0, PUBLIC_SLATE_HAMMER_CAP)
  const consensus = card.consensus.slice(0, PUBLIC_SLATE_CONSENSUS_CAP)
  const splits = card.splits.slice(0, PUBLIC_SLATE_HOUSE_DIVIDED_CAP)
  const tankTotals = card.games
    .filter((g) => g.pickerPicks.Tank.side === 'over' || g.pickerPicks.Tank.side === 'under')
    .slice(0, 3)

  const title = card.cardTitle || '🏈 NFL Sharpe Syndicate Slate'
  const lines: string[] = [`# ${title}`]
  const weekLine = formatSlateWeekLine(card.games)
  if (weekLine) lines.push(weekLine)
  lines.push('')

  if (hammers.length > 0) {
    lines.push('# 🔥 Unanimous 3-0 Hammers')
    for (const g of hammers) {
      lines.push(formatSlatePickBullet(g, g.consensusPick.lineDisplay))
    }
    lines.push('')
  }

  if (consensus.length > 0) {
    lines.push('# 🎯 2-1 Consensus')
    for (const g of consensus) {
      const pickers = pickersForLineDisplay(g, g.consensusPick.lineDisplay)
      lines.push(formatSlatePickBullet(g, g.consensusPick.lineDisplay, pickers))
    }
    lines.push('')
  }

  if (splits.length > 0) {
    lines.push('# ⚔️ House Divided (1-1)')
    for (const g of splits) {
      const byLine = new Map<string, SharpPicker[]>()
      for (const p of ATS_SIDE_DESKS) {
        const lineDisplay = g.pickerPicks[p].lineDisplay
        const group = byLine.get(lineDisplay) || []
        group.push(p)
        byLine.set(lineDisplay, group)
      }
      for (const [lineDisplay, pickers] of byLine) {
        lines.push(formatSlatePickBullet(g, lineDisplay, pickers))
      }
    }
    lines.push('')
  }

  if (tankTotals.length > 0) {
    lines.push('# 🛡️ Tank Totals')
    for (const g of tankTotals) {
      lines.push(formatSlatePickBullet(g, g.pickerPicks.Tank.lineDisplay, ['Tank']))
    }
    lines.push('')
  }

  lines.push('---')
  lines.push('')
  lines.push('📊 Full 16-game grid + in-game edges in **Sharpe VIP Syndicate**')
  return lines.join('\n').trim()
}

/**
 * Format a clean, full ATS card list for a single persona (e.g. Tank or Chedda)
 * for distribution to VIP subscriber chat rooms.
 */
export function formatPickerSlateList(card: NflSlateCard, picker: SharpPicker): string {
  const icon = picker === 'Tank' ? '🛡️' : picker === 'Chedda' ? '🧀' : picker === 'Rocco' ? '🥩' : '🎯'
  const specialty =
    picker === 'Tank'
      ? 'Totals (tempo / off-def)'
      : picker === 'Chedda'
        ? 'Underdogs & Line Value'
        : picker === 'Rocco'
          ? 'Power Favorites & Key Numbers'
          : 'Pure Model EV'

  const cardLabel = picker === 'Tank' ? 'TOTALS CARD' : 'ATS CARD'
  const lines: string[] = [`${icon} ${picker.toUpperCase()}'S FULL ${cardLabel} (${specialty}):\n`]
  for (const g of card.games) {
    const pPick = g.pickerPicks[picker]
    if (picker === 'Tank' && pPick.side === 'pass') continue
    const away = shortDisplayName(g.awayTeam)
    const home = shortDisplayName(g.homeTeam)
    const when = formatOddsCommenceTimeShort(g.commenceTime)
    lines.push(`• ${pPick.lineDisplay} (${away}/${home} · ${when})`)
  }
  if (lines.length === 1) lines.push('• No totals leans this slate')
  return lines.join('\n')
}

/**
 * Filter and validate candidate picks to eliminate extreme price outliers
 * (e.g. +1500 longshot flukes or -800 massive favorites) so all picks
 * reflect realistic, sharp betting selections.
 */
export function filterPredictiveCandidates(candidates: OddsPick[]): OddsPick[] {
  if (!Array.isArray(candidates)) return []
  return candidates.filter((pick) => {
    const price = Number(pick.pickPrice)
    if (!Number.isFinite(price) || price === 0) return false

    // Spreads / Runlines: Standard betting juice (-135 to +115)
    if (pick.marketKey === 'spreads') {
      return price >= -135 && price <= 115
    }

    // Totals: Standard Over/Under juice (-125 to +110)
    if (pick.marketKey === 'totals') {
      return price >= -125 && price <= 110
    }

    // Moneylines: Realistic range (-220 to +260) — no wild +1500 longshots
    if (pick.marketKey === 'h2h') {
      return price >= -220 && price <= 260
    }

    return price >= -220 && price <= 260
  })
}

/**
 * Classify a candidate pick to its best-matching Sharp Syndicate persona.
 *
 * Chedda: Moneyline underdog (+110 to +260)
 * Rocco: Spread & Runlines with solid juice (-135 to +115)
 * Tank: Totals (Over/Under) (-125 to +110)
 * Scott: High EV / model baseline play (-200 to +160)
 */
export function classifyPickPersona(pick: OddsPick): SharpPicker {
  const price = Number(pick.pickPrice) || 0
  // Chedda: Realistic plus-money underdogs
  if (pick.marketKey === 'h2h' && price >= 110 && price <= 260) {
    return 'Chedda'
  }
  // Tank: Game totals (Over/Under)
  if (pick.marketKey === 'totals' && price >= -125 && price <= 110) {
    return 'Tank'
  }
  // Rocco: Spreads / runlines
  if (pick.marketKey === 'spreads' && price >= -135 && price <= 115) {
    return 'Rocco'
  }
  // Scott: Pure model / EV baseline
  return 'Scott'
}

/**
 * Assemble a multi-picker syndicate card from a pool of candidate picks across today's games.
 * Tries to give 1 distinct pick to each persona (Scott, Rocco, Chedda, Tank) without duplicate events.
 */
export function buildSyndicateCard(
  candidates: OddsPick[],
  opts: { cardTitle?: string } = {},
): { cardTitle: string; picks: SinglePickerPick[] } | null {
  const valid = filterPredictiveCandidates(candidates)
  if (!valid || valid.length === 0) return null

  const usedEventIds = new Set<string>()
  const assignedPicks: SinglePickerPick[] = []

  // 1. Find Chedda (Plus-money dog: +110 to +260)
  const cheddaCand = valid.find(
    (p) => !usedEventIds.has(p.eventId) && p.marketKey === 'h2h' && p.pickPrice >= 110 && p.pickPrice <= 260,
  )
  if (cheddaCand) {
    assignedPicks.push({ pickerName: 'Chedda', pick: cheddaCand })
    usedEventIds.add(cheddaCand.eventId)
  }

  // 2. Find Tank (Totals: -125 to +110)
  const tankCand = valid.find(
    (p) => !usedEventIds.has(p.eventId) && p.marketKey === 'totals' && p.pickPrice >= -125 && p.pickPrice <= 110,
  )
  if (tankCand) {
    assignedPicks.push({ pickerName: 'Tank', pick: tankCand })
    usedEventIds.add(tankCand.eventId)
  }

  // 3. Find Rocco (Spreads: -135 to +115)
  const roccoCand = valid.find(
    (p) => !usedEventIds.has(p.eventId) && p.marketKey === 'spreads' && p.pickPrice >= -135 && p.pickPrice <= 115,
  )
  if (roccoCand) {
    assignedPicks.push({ pickerName: 'Rocco', pick: roccoCand })
    usedEventIds.add(roccoCand.eventId)
  }

  // 4. Find Scott (Top EV remaining: -200 to +160)
  const scottCand = valid.find(
    (p) => !usedEventIds.has(p.eventId) && p.pickPrice >= -200 && p.pickPrice <= 160,
  )
  if (scottCand) {
    assignedPicks.push({ pickerName: 'Scott', pick: scottCand })
    usedEventIds.add(scottCand.eventId)
  }

  if (assignedPicks.length < 2) {
    return null // Not enough variety for a syndicate card
  }

  const title = opts.cardTitle || '🎯 Sharpe Syndicate Card'
  return { cardTitle: title, picks: assignedPicks }
}

type MarketTotalQuote = {
  total: number
  overPrice: number
  underPrice: number
  bookTitle: string
}

function extractEventMarketTotal(ev: {
  bookmakers?: Array<{
    key: string
    title: string
    markets: Array<{
      key: string
      outcomes: Array<{ name: string; price: number; point?: number }>
    }>
  }>
}): MarketTotalQuote | null {
  const totals: number[] = []
  const overs: number[] = []
  const unders: number[] = []
  let bookTitle = 'Consensus'

  for (const b of ev.bookmakers || []) {
    const tm = (b.markets || []).find((m) => m.key === 'totals')
    if (!tm) continue
    const over = tm.outcomes.find((o) => /^over$/i.test(String(o.name || '')))
    const under = tm.outcomes.find((o) => /^under$/i.test(String(o.name || '')))
    if (!over || over.point == null || !under) continue
    totals.push(Number(over.point))
    overs.push(Number(over.price))
    unders.push(Number(under.price))
    const key = String(b.key || '').toLowerCase()
    if (key.includes('pinnacle') || key.includes('circa') || key.includes('lowvig')) {
      return {
        total: Math.round(Number(over.point) * 2) / 2,
        overPrice: Number(over.price),
        underPrice: Number(under.price),
        bookTitle: b.title || b.key,
      }
    }
    bookTitle = b.title || b.key || bookTitle
  }

  if (!totals.length) return null
  const sorted = [...totals].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const total = sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!
  const overSorted = [...overs].sort((a, b) => a - b)
  const underSorted = [...unders].sort((a, b) => a - b)
  const oMid = Math.floor(overSorted.length / 2)
  const uMid = Math.floor(underSorted.length / 2)
  return {
    total: Math.round(total * 2) / 2,
    overPrice: overSorted.length % 2 === 0
      ? Math.round((overSorted[oMid - 1]! + overSorted[oMid]!) / 2)
      : Math.round(overSorted[oMid]!),
    underPrice: underSorted.length % 2 === 0
      ? Math.round((underSorted[uMid - 1]! + underSorted[uMid]!) / 2)
      : Math.round(underSorted[uMid]!),
    bookTitle,
  }
}

/** Soft look only … not a publish lean by itself. */
const TANK_TOTALS_LOOK_PTS = 2.5
/** Publish lean threshold (totals are noisier than sides). */
const TANK_TOTALS_EDGE_PTS = 3.5
/** CFB/NFL totals key numbers … allow a 2.5+ lean if model crosses one of these vs market. */
const TANK_TOTALS_KEY_NUMBERS = [48, 51, 54] as const

function crossesTotalsKeyNumber(modelTotal: number, marketTotal: number): boolean {
  for (const key of TANK_TOTALS_KEY_NUMBERS) {
    const modelSide = modelTotal >= key
    const marketSide = marketTotal >= key
    if (modelSide !== marketSide) return true
  }
  return false
}

/**
 * Tank totals vote. PASS is the default.
 * Play at ≥3.5 pts, or ≥2.5 when model crosses a key total (48/51/54) vs market.
 */
function resolveTankTotalsSide(modelTotal: number | null, marketTotal: number | null): 'over' | 'under' | 'pass' {
  if (modelTotal == null || marketTotal == null) return 'pass'
  const delta = modelTotal - marketTotal
  const abs = Math.abs(delta)
  const keyCross = abs >= TANK_TOTALS_LOOK_PTS && crossesTotalsKeyNumber(modelTotal, marketTotal)
  if (abs < TANK_TOTALS_EDGE_PTS && !keyCross) return 'pass'
  if (delta > 0) return 'over'
  if (delta < 0) return 'under'
  return 'pass'
}

/**
 * Build a full NFL / CFB ATS Slate Card across all games on the board.
 * Side desks (Scott, Rocco, Chedda) vote ATS. Tank votes totals (PASS default; ≥3.5 or key-cross).
 */
export function buildNflAtsSlateCard(
  events: Array<{
    id: string
    sport_key: string
    commence_time: string
    home_team: string
    away_team: string
    bookmakers?: Array<{
      key: string
      title: string
      markets: Array<{
        key: string
        outcomes: Array<{
          name: string
          price: number
          point?: number
        }>
      }>
    }>
  }>,
  opts: {
    cardTitle?: string
    sportKey?: string
    weightsMap?: Map<string, number>
    teamMetricsMap?: Map<string, NflTeamMetrics>
    cfbRatingsMap?: Map<string, CfbTeamPowerRating>
  } = {},
): NflSlateCard | null {
  if (!Array.isArray(events) || events.length === 0) return null

  const games: SlateGamePick[] = []
  const hammers: SlateGamePick[] = []
  const consensus: SlateGamePick[] = []
  const splits: SlateGamePick[] = []
  const weights = opts.weightsMap || new Map<string, number>()
  const teamMetrics = opts.teamMetricsMap
  const cfbRatings = opts.cfbRatingsMap

  for (const ev of events) {
    const homeTeam = ev.home_team
    const awayTeam = ev.away_team
    if (!homeTeam || !awayTeam) continue

    // Find consensus or primary book spread market
    let bestSpreadMarket: { key: string; outcomes: Array<{ name: string; price: number; point?: number }> } | null = null
    let bookTitle = 'Consensus'

    for (const b of ev.bookmakers || []) {
      const sm = b.markets.find((m) => m.key === 'spreads' && m.outcomes?.length === 2)
      if (sm) {
        bestSpreadMarket = sm
        bookTitle = b.title || b.key
        break
      }
    }

    if (!bestSpreadMarket) continue

    const homeOutcome = bestSpreadMarket.outcomes.find((o) => isTeamMatch(o.name, homeTeam))
    const awayOutcome = bestSpreadMarket.outcomes.find((o) => isTeamMatch(o.name, awayTeam))

    if (!homeOutcome || !awayOutcome || homeOutcome.point == null || awayOutcome.point == null) {
      continue
    }

    const homePoint = homeOutcome.point
    const awayPoint = awayOutcome.point
    const homePrice = homeOutcome.price
    const awayPrice = awayOutcome.price

    // Convert into OddsPick structures for ledger
    const homePickObj: OddsPick = {
      eventId: ev.id,
      sportKey: ev.sport_key,
      homeTeam,
      awayTeam,
      commenceTime: ev.commence_time,
      marketKey: 'spreads',
      pickName: homeTeam,
      linePoint: homePoint,
      pickPrice: homePrice,
      bookTitle,
      edgePct: 2.0,
      bookCount: 5,
    }

    const awayPickObj: OddsPick = {
      eventId: ev.id,
      sportKey: ev.sport_key,
      homeTeam,
      awayTeam,
      commenceTime: ev.commence_time,
      marketKey: 'spreads',
      pickName: awayTeam,
      linePoint: awayPoint,
      pickPrice: awayPrice,
      bookTitle,
      edgePct: 2.0,
      bookCount: 5,
    }

    const homeLineDisp = formatPickLine(homePickObj)
    const awayLineDisp = formatPickLine(awayPickObj)

    // Resolve live sharp money divergence & ticket splits
    const gameSplits = resolveGameBettingSplits(ev, homePoint, homePrice, awayPrice)
    const sharpFavorsHome = gameSplits.sharpFavoredSide === 'home'
    const sharpFavorsAway = gameSplits.sharpFavoredSide === 'away'

    // Calculate EPA and Trench matchups (NFL) or Power Rating Projections (CFB)
    const isCfb = ev.sport_key === 'americanfootball_ncaaf' || (opts.sportKey && opts.sportKey.includes('ncaaf'))
    const trenchEpa = !isCfb ? calculateTrenchEpaMatchup(homeTeam, awayTeam, teamMetrics) : null
    const cfbMatchup = isCfb ? calculateCfbMatchupProjection(homeTeam, awayTeam, homePoint, cfbRatings) : null

    // Key Number Hook Intelligence (NFL only)
    const homeKeyAnalysis = !isCfb ? analyzeFootballKeyNumbers(homePoint) : null
    const awayKeyAnalysis = !isCfb ? analyzeFootballKeyNumbers(awayPoint) : null

    // Bayesian factor weights
    const scottWeight = weights.get('Scott:model_clv_high_ev') || 1.0
    const roccoWeight = weights.get('Rocco:short_favorites_1_to_4') || 1.0
    const cheddaSweetWeight = weights.get('Chedda:dog_sweet_spot_130_175') || 1.0
    const tankRestWeight = weights.get('Tank:rest_advantage') || 1.0

    // Desk lanes (real feeds):
    // Scott: market/EV + CFB consensus vs number (or NFL EPA)
    // Rocco: SP+/EPA strength + short favorites / key numbers (trenches offline until PFF)
    // Chedda: dogs, RLM/splits, golden hooks
    // Tank: totals vs model (CFB SP+ off/def+tempo; NFL EPA scoring environment)
    const sharpSplitBonus = sharpFavorsHome ? 0.35 : sharpFavorsAway ? -0.35 : 0
    // 1. Scott — model price vs market
    const epaBonus = trenchEpa
      ? Math.max(-1.5, Math.min(1.5, trenchEpa.epaSpreadImpactHome * 0.3))
      : cfbMatchup && cfbMatchup.isValuePlay
        ? (cfbMatchup.valueSide === 'home' ? 1.4 : -1.4)
        : 0
    const scottScoreHome = ((homePrice > awayPrice ? 1.0 : -0.5) + (homePoint < 0 ? 0.3 : 0.1) + sharpSplitBonus + epaBonus) * scottWeight
    const scottSide: 'home' | 'away' = scottScoreHome >= 0 ? 'home' : 'away'

    // 2. Chedda — dogs / money
    const cheddaSplitBoost = (homePoint > 0 && sharpFavorsHome) ? 1.2 : (awayPoint > 0 && sharpFavorsAway) ? -1.2 : 0
    const cheddaGoldenHookBoost = (homeKeyAnalysis?.isHookGolden && homePoint > 0)
      ? 1.0
      : (awayKeyAnalysis?.isHookGolden && awayPoint > 0)
        ? -1.0
        : 0
    const dogTrenchBoost = (homePoint > 0 && (trenchEpa?.netTrenchSpreadImpactHome ?? 0) > 0.5)
      ? 0.6
      : (awayPoint > 0 && (trenchEpa?.netTrenchSpreadImpactHome ?? 0) < -0.5)
        ? -0.6
        : (homePoint > 0 && cfbMatchup?.valueSide === 'home')
          ? 0.8
          : (awayPoint > 0 && cfbMatchup?.valueSide === 'away')
            ? -0.8
            : 0
    const cheddaScoreHome = (homePoint > 0 ? (1.5 * cheddaSweetWeight) : awayPoint > 0 ? (-1.5 * cheddaSweetWeight) : (homePrice > awayPrice ? 0.5 : -0.5)) + cheddaSplitBoost + cheddaGoldenHookBoost + dogTrenchBoost
    const cheddaSide: 'home' | 'away' = cheddaScoreHome >= 0 ? 'home' : 'away'

    // 3. Rocco — SP+/EPA strength on short favorites (CFB power gap uses FPI scale ~10+ pts)
    const isShortFavHome = homePoint < 0 && homePoint >= -7.5
    const isShortFavAway = awayPoint < 0 && awayPoint >= -7.5
    const roccoChalkTrapPenalty = (isShortFavHome && sharpFavorsAway) ? -1.5 : (isShortFavAway && sharpFavorsHome) ? 1.5 : 0
    const roccoHookTaxPenalty = (homeKeyAnalysis?.isHookTax && isShortFavHome)
      ? -0.8
      : (awayKeyAnalysis?.isHookTax && isShortFavAway)
        ? 0.8
        : 0
    const roccoTrenchBonus = trenchEpa
      ? Math.max(-1.8, Math.min(1.8, trenchEpa.netTrenchSpreadImpactHome * 0.8))
      : cfbMatchup
        ? (cfbMatchup.homePower - cfbMatchup.awayPower > 10.0 && homePoint < 0 ? 1.2 : cfbMatchup.awayPower - cfbMatchup.homePower > 10.0 && awayPoint < 0 ? -1.2 : 0)
        : 0
    const roccoScoreHome = (isShortFavHome ? (1.2 * roccoWeight) : isShortFavAway ? (-1.2 * roccoWeight) : (homePoint < 0 ? 0.4 : -0.4)) + roccoChalkTrapPenalty + roccoHookTaxPenalty + roccoTrenchBonus
    const roccoSide: 'home' | 'away' = roccoScoreHome >= 0 ? 'home' : 'away'

    // 4. Tank — totals desk (PASS default; play at ≥3.5 or ≥2.5 into key 48/51/54)
    const marketTotalQuote = extractEventMarketTotal(ev)
    const modelTotal = isCfb
      ? (cfbMatchup?.modelTotal ?? null)
      : estimateNflModelTotal(homeTeam, awayTeam, teamMetrics)
    const tankTotalsSide = resolveTankTotalsSide(modelTotal, marketTotalQuote?.total ?? null)
    void tankRestWeight // reserved for rest/travel boost once that feed is first-class

    const overPickObj: OddsPick | null = marketTotalQuote
      ? {
          eventId: ev.id,
          sportKey: ev.sport_key,
          homeTeam,
          awayTeam,
          commenceTime: ev.commence_time,
          marketKey: 'totals',
          pickName: 'Over',
          linePoint: marketTotalQuote.total,
          pickPrice: marketTotalQuote.overPrice,
          bookTitle: marketTotalQuote.bookTitle,
          edgePct: 2.0,
          bookCount: 5,
          consensusPrice: marketTotalQuote.overPrice,
          consensusProb: 0.5,
        }
      : null
    const underPickObj: OddsPick | null = marketTotalQuote
      ? {
          eventId: ev.id,
          sportKey: ev.sport_key,
          homeTeam,
          awayTeam,
          commenceTime: ev.commence_time,
          marketKey: 'totals',
          pickName: 'Under',
          linePoint: marketTotalQuote.total,
          pickPrice: marketTotalQuote.underPrice,
          bookTitle: marketTotalQuote.bookTitle,
          edgePct: 2.0,
          bookCount: 5,
          consensusPrice: marketTotalQuote.underPrice,
          consensusProb: 0.5,
        }
      : null

    const tankPickObj = tankTotalsSide === 'over'
      ? overPickObj
      : tankTotalsSide === 'under'
        ? underPickObj
        : homePickObj
    const tankLineDisp = tankTotalsSide === 'pass' || !tankPickObj
      ? 'PASS (totals)'
      : formatPickLine(tankPickObj)

    const pickerPicks: Record<SharpPicker, {
      side: SlateDeskSide
      teamName: string
      lineDisplay: string
      pickPrice: number
      pick: OddsPick
    }> = {
      Scott: {
        side: scottSide,
        teamName: scottSide === 'home' ? homeTeam : awayTeam,
        lineDisplay: scottSide === 'home' ? homeLineDisp : awayLineDisp,
        pickPrice: scottSide === 'home' ? homePrice : awayPrice,
        pick: scottSide === 'home' ? homePickObj : awayPickObj,
      },
      Rocco: {
        side: roccoSide,
        teamName: roccoSide === 'home' ? homeTeam : awayTeam,
        lineDisplay: roccoSide === 'home' ? homeLineDisp : awayLineDisp,
        pickPrice: roccoSide === 'home' ? homePrice : awayPrice,
        pick: roccoSide === 'home' ? homePickObj : awayPickObj,
      },
      Chedda: {
        side: cheddaSide,
        teamName: cheddaSide === 'home' ? homeTeam : awayTeam,
        lineDisplay: cheddaSide === 'home' ? homeLineDisp : awayLineDisp,
        pickPrice: cheddaSide === 'home' ? homePrice : awayPrice,
        pick: cheddaSide === 'home' ? homePickObj : awayPickObj,
      },
      Tank: {
        side: tankTotalsSide,
        teamName: tankTotalsSide === 'over'
          ? 'Over'
          : tankTotalsSide === 'under'
            ? 'Under'
            : 'PASS',
        lineDisplay: tankLineDisp,
        pickPrice: tankPickObj?.pickPrice ?? 0,
        pick: tankPickObj || homePickObj,
      },
    }

    // Tally ATS side votes only (Scott / Rocco / Chedda)
    let homeVotes = 0
    let awayVotes = 0
    for (const p of ATS_SIDE_DESKS) {
      if (pickerPicks[p].side === 'home') homeVotes++
      else awayVotes++
    }

    let consensusSide: 'home' | 'away' = 'home'
    let voteCount = homeVotes
    let consensusType: 'hammer' | 'consensus' | 'split' = 'split'
    let badgeText = '⚔️ 1-1 Split'

    if (homeVotes === 3) {
      consensusSide = 'home'
      voteCount = 3
      consensusType = 'hammer'
      badgeText = '🔥 3-0 Hammer'
    } else if (awayVotes === 3) {
      consensusSide = 'away'
      voteCount = 3
      consensusType = 'hammer'
      badgeText = '🔥 3-0 Hammer'
    } else if (homeVotes === 2) {
      consensusSide = 'home'
      voteCount = 2
      consensusType = 'consensus'
      badgeText = '🎯 2-1 Consensus'
    } else if (awayVotes === 2) {
      consensusSide = 'away'
      voteCount = 2
      consensusType = 'consensus'
      badgeText = '🎯 2-1 Consensus'
    } else {
      consensusSide = 'home'
      voteCount = 1
      consensusType = 'split'
      badgeText = '⚔️ 1-1 Split'
    }

    const gamePick: SlateGamePick = {
      eventId: ev.id,
      sportKey: ev.sport_key,
      homeTeam,
      awayTeam,
      commenceTime: ev.commence_time,
      spreadPoint: homePoint,
      marketTotal: marketTotalQuote?.total ?? null,
      modelTotal,
      splits: gameSplits,
      trenchEpa,
      consensusPick: {
        side: consensusSide,
        teamName: consensusSide === 'home' ? homeTeam : awayTeam,
        lineDisplay: consensusSide === 'home' ? homeLineDisp : awayLineDisp,
        voteCount,
        type: consensusType,
        badgeText,
      },
      pickerPicks,
    }

    games.push(gamePick)
    if (consensusType === 'hammer') hammers.push(gamePick)
    else if (consensusType === 'consensus') consensus.push(gamePick)
    else splits.push(gamePick)
  }

  if (games.length === 0) return null

  const title = opts.cardTitle || (opts.sportKey === 'americanfootball_ncaaf' ? '🏈 College Football Sharpe Syndicate Slate' : '🏈 NFL Sharpe Syndicate Slate')

  return {
    cardTitle: title,
    sportKey: opts.sportKey || 'americanfootball_nfl',
    games,
    hammers,
    consensus,
    splits,
  }
}

/**
 * Publish a full NFL / CFB Slate Card to the Lounge feed and record all 4xN picks in lounge_bot_picks.
 */
export async function publishAndRecordNflSlateCard(
  admin: SupabaseClient,
  input: {
    botUserId: string
    card: NflSlateCard
    categoryPills?: string[]
  },
): Promise<{ success: boolean; postId?: string; totalPicksRecorded: number; error?: string }> {
  if (!input.card || !input.card.games.length) {
    return { success: false, totalPicksRecorded: 0, error: 'Empty slate card.' }
  }

  const caption = formatNflSlateCardCaption(input.card)
  const categoryPills = input.categoryPills || ['sports']

  const postRes = await publishLoungeBotPost(admin, {
    botUserId: input.botUserId,
    caption,
    categoryPills,
  })

  if (postRes.error || !postRes.postId) {
    return { success: false, totalPicksRecorded: 0, error: postRes.error || 'Failed to publish post' }
  }

  const rowsToInsert: any[] = []
  for (const g of input.card.games) {
    for (const pName of SHARP_PICKERS) {
      const pPick = g.pickerPicks[pName]
      if (pName === 'Tank' && pPick.side === 'pass') continue

      // Situational factor tagging for Bayesian learning
      const factors: string[] = []
      const isShortFav = Number(pPick.pick.linePoint) <= -1 && Number(pPick.pick.linePoint) >= -4
      const isSweetDog = Number(pPick.pickPrice) >= 130 && Number(pPick.pickPrice) <= 175
      const isKey3 = Math.abs(Number(pPick.pick.linePoint)) === 3

      if (isShortFav) factors.push('short_favorites_1_to_4')
      if (isSweetDog) factors.push('dog_sweet_spot_130_175')
      if (isKey3) factors.push('key_number_3_value')
      if (pName === 'Scott') factors.push('model_clv_high_ev')
      if (pName === 'Tank') factors.push('totals_model_edge')
      if (g.splits?.isRlm) factors.push('reverse_line_movement')
      if (g.splits?.isSharpDivergence) factors.push('sharp_money_divergence')
      if (g.trenchEpa?.isTrenchMismatch) factors.push('trench_mismatch_advantage')
      if (g.trenchEpa?.isEpaMismatch) factors.push('epa_model_value')

      const isTankTotals = pName === 'Tank' && (pPick.side === 'over' || pPick.side === 'under')
      rowsToInsert.push({
        bot_user_id: input.botUserId,
        picker_name: pName,
        post_id: postRes.postId,
        event_id: g.eventId,
        sport_key: g.sportKey,
        home_team: g.homeTeam,
        away_team: g.awayTeam,
        commence_time: g.commenceTime,
        market_key: isTankTotals ? 'totals' : 'spreads',
        pick_name: pPick.teamName,
        pick_line: pPick.pick.linePoint ?? null,
        pick_price: pPick.pickPrice,
        book_title: pPick.pick.bookTitle || null,
        status: 'pending',
        metadata: {
          factors,
          side: pPick.side,
          consensus_type: g.consensusPick.type,
          vote_count: g.consensusPick.voteCount,
          splits: g.splits ? {
            home_ticket: g.splits.homeTicketPct,
            home_handle: g.splits.homeHandlePct,
            is_rlm: g.splits.isRlm,
            is_sharp_divergence: g.splits.isSharpDivergence,
          } : undefined,
          trench_epa: g.trenchEpa ? {
            net_epa_delta: g.trenchEpa.netEpaDeltaHome,
            epa_spread_impact: g.trenchEpa.epaSpreadImpactHome,
            trench_spread_impact: g.trenchEpa.netTrenchSpreadImpactHome,
            is_trench_mismatch: g.trenchEpa.isTrenchMismatch,
            is_epa_mismatch: g.trenchEpa.isEpaMismatch,
          } : undefined,
        },
      })
    }
  }

  const { data: insertedRows, error: pickErr } = await admin
    .from('lounge_bot_picks')
    .insert(rowsToInsert)
    .select('id')

  if (pickErr) {
    return {
      success: true,
      postId: postRes.postId,
      totalPicksRecorded: 0,
      error: `Published post, but ledger insert failed: ${pickErr.message}`,
    }
  }

  await syncBotProfileHighlight(admin, input.botUserId)

  // Also deliver full uncut individual breakdowns into Scott's VIP subscriber chat room
  try {
    const threadParts = SHARP_PICKERS.map((p) => formatPickerSlateList(input.card, p))
    const vipTitle = `🏈 ${input.card.cardTitle || 'Sharpe Syndicate Slate'} ... Full Uncut Breakdown\n\nPublic feed gets the consensus & hammer teasers. Here are the uncut individual ATS cards across all 4 desks for the full slate 👇`
    await publishBotSubChatMessage(admin, {
      botUserId: input.botUserId,
      caption: vipTitle,
      threadParts,
    })
  } catch (vipErr) {
    console.error('Error posting slate to VIP sub chat:', vipErr)
  }

  return {
    success: true,
    postId: postRes.postId,
    totalPicksRecorded: insertedRows?.length || 0,
  }
}

/**
 * Calculate net profit in units for a 1-unit bet based on American odds.
 */
export function calculateNetUnits(price: number, status: 'won' | 'lost' | 'push' | 'cancelled'): number {
  if (status === 'lost') return -1.0
  if (status === 'push' || status === 'cancelled') return 0.0
  if (status === 'won') {
    if (price > 0) return Math.round((price / 100) * 100) / 100
    if (price < 0) return Math.round((100 / Math.abs(price)) * 100) / 100
  }
  return 0.0
}

/**
 * Publish a solo pick or multi-picker syndicate card and record all entries in public.lounge_bot_picks.
 */
export async function publishAndRecordPicks(
  admin: SupabaseClient,
  input: {
    botUserId: string
    picks: SinglePickerPick[]
    cardTitle?: string
    categoryPills?: string[]
  },
): Promise<{ success: boolean; postId?: string; pickIds: string[]; error?: string }> {
  if (!input.picks.length) {
    return { success: false, pickIds: [], error: 'At least one pick required.' }
  }

  let weather: GameWeatherSummary | null = null
  let injuries: GameInjurySummary | null = null
  let splits: BettingSplitSummary | null = null
  let trenchEpa: TrenchEpaMatchupSummary | null = null
  let cfbMatchup: CfbMatchupProjection | null = null
  const isSolo = input.picks.length === 1

  if (isSolo) {
    const single = input.picks[0].pick
    const sportId = oddsSportKeyToRundownSportId(single.sportKey) || 2
    weather = await fetchGameWeather(sportId, single.homeTeam, single.commenceTime)
    injuries = await fetchGameInjuryPval(single.sportKey, single.homeTeam, single.awayTeam, single.commenceTime, admin)
    const mockEv: any = {
      id: single.eventId,
      sport_key: single.sportKey,
      home_team: single.homeTeam,
      away_team: single.awayTeam,
      commence_time: single.commenceTime,
      bookmakers: [],
    }
    splits = resolveGameBettingSplits(mockEv, single.linePoint ?? 0, single.pickPrice, single.pickPrice)
    if (single.sportKey === 'americanfootball_nfl' || single.sportKey === 'americanfootball_nfl_preseason') {
      const teamMetricsMap = await loadDbTeamMetricsMap(admin)
      trenchEpa = calculateTrenchEpaMatchup(single.homeTeam, single.awayTeam, teamMetricsMap)
    } else if (single.sportKey === 'americanfootball_ncaaf') {
      const cfbRatingsMap = await loadDbCfbPowerRatingsMap(admin)
      cfbMatchup = calculateCfbMatchupProjection(single.homeTeam, single.awayTeam, single.linePoint ?? null, cfbRatingsMap)
    }
  }

  const caption = isSolo
    ? formatSoloPredictiveCaption(input.picks[0].pickerName, input.picks[0].pick, weather, injuries, splits, trenchEpa, cfbMatchup)
    : formatSyndicateCardCaption(input.cardTitle || '🎯 Sharp Syndicate Card', input.picks)

  const categoryPills = input.categoryPills || ['sports']

  const postRes = await publishLoungeBotPost(admin, {
    botUserId: input.botUserId,
    caption,
    categoryPills,
  })

  if (postRes.error || !postRes.postId) {
    return { success: false, pickIds: [], error: postRes.error || 'Failed to publish post' }
  }

  const rowsToInsert = input.picks.map((item) => {
    const factors: string[] = []
    if (weather && !weather.isDome) {
      if (weather.isHighWind) factors.push('wind_unders')
      if (weather.isExtremeCold) factors.push('extreme_cold_unders')
    }
    if (Number(item.pick.pickPrice) >= 130 && Number(item.pick.pickPrice) <= 175) {
      factors.push('dog_sweet_spot_130_175')
    }
    if (Number(item.pick.pickPrice) > 175) {
      factors.push('dog_longshot_180_plus')
    }
    if (Number(item.pick.linePoint) <= -1 && Number(item.pick.linePoint) >= -4) {
      factors.push('short_favorites_1_to_4')
    }
    if (item.pickerName === 'Scott') factors.push('model_clv_high_ev')
    if (splits?.isRlm) factors.push('reverse_line_movement')
    if (splits?.isSharpDivergence) factors.push('sharp_money_divergence')
    if (trenchEpa?.isTrenchMismatch) factors.push('trench_mismatch_advantage')
    if (trenchEpa?.isEpaMismatch) factors.push('epa_model_value')
    if (cfbMatchup?.isValuePlay) factors.push('cfb_power_index_value')

    return {
      bot_user_id: input.botUserId,
      picker_name: item.pickerName,
      post_id: postRes.postId,
      event_id: item.pick.eventId,
      sport_key: item.pick.sportKey,
      home_team: item.pick.homeTeam,
      away_team: item.pick.awayTeam,
      commence_time: item.pick.commenceTime,
      market_key: item.pick.marketKey,
      pick_name: item.pick.pickName,
      pick_line: item.pick.linePoint ?? null,
      pick_price: item.pick.pickPrice,
      book_title: item.pick.bookTitle || null,
      status: 'pending',
      metadata: {
        factors,
        is_high_wind: weather?.isHighWind || false,
        is_extreme_cold: weather?.isExtremeCold || false,
        splits: splits ? {
          home_ticket: splits.homeTicketPct,
          home_handle: splits.homeHandlePct,
          is_rlm: splits.isRlm,
          is_sharp_divergence: splits.isSharpDivergence,
        } : undefined,
        trench_epa: trenchEpa ? {
          net_epa_delta: trenchEpa.netEpaDeltaHome,
          epa_spread_impact: trenchEpa.epaSpreadImpactHome,
          trench_spread_impact: trenchEpa.netTrenchSpreadImpactHome,
          is_trench_mismatch: trenchEpa.isTrenchMismatch,
          is_epa_mismatch: trenchEpa.isEpaMismatch,
        } : undefined,
      },
    }
  })

  const { data: insertedRows, error: pickErr } = await admin
    .from('lounge_bot_picks')
    .insert(rowsToInsert)
    .select('id')

  const pickIds = (insertedRows || []).map((r) => r.id)

  if (pickErr) {
    return {
      success: true,
      postId: postRes.postId,
      pickIds: [],
      error: `Published post, but ledger insert failed: ${pickErr.message}`,
    }
  }

  // Update profile bio highlight
  await syncBotProfileHighlight(admin, opts.botUserId)

  return { success: true, postId: postRes.postId, pickIds }
}

/**
 * Match a team string against home or away names.
 */
function isTeamMatch(targetName: string, candidateName: string): boolean {
  const t = targetName.trim().toLowerCase()
  const c = candidateName.trim().toLowerCase()
  if (t === c) return true
  if (t.includes(c) || c.includes(t)) return true
  const tLast = t.split(' ').pop() || ''
  const cLast = c.split(' ').pop() || ''
  return Boolean(tLast && cLast && tLast === cLast)
}

/**
 * Grade a single pick against final game scores.
 */
export function gradePickOutcome(
  pick: {
    picker_name?: string
    market_key: string
    pick_name: string
    pick_line: number | null
    pick_price: number
    home_team: string
    away_team: string
  },
  homeScore: number,
  awayScore: number,
): { status: 'won' | 'lost' | 'push'; unitsNet: number; summary: string; lineDisplay: string } {
  const { picker_name, market_key, pick_name, pick_line, pick_price, home_team, away_team } = pick
  const home = shortDisplayName(home_team)
  const away = shortDisplayName(away_team)
  const scoreSummary = `${away} ${awayScore}, ${home} ${homeScore}`
  const pName = picker_name ? `${picker_name}: ` : ''

  if (market_key === 'h2h') {
    const isHome = isTeamMatch(pick_name, home_team)
    const won = isHome ? homeScore > awayScore : awayScore > homeScore
    const push = homeScore === awayScore
    const status: 'won' | 'lost' | 'push' = push ? 'push' : won ? 'won' : 'lost'
    const unitsNet = calculateNetUnits(pick_price, status)
    const lineDisplay = `${shortDisplayName(pick_name)} ML`
    const summary = status === 'won'
      ? `✅ WIN: ${pName}${lineDisplay} cashes (${scoreSummary})`
      : status === 'lost'
        ? `❌ LOSS: ${pName}${scoreSummary}`
        : `🔄 PUSH: ${pName}${scoreSummary}`
    return { status, unitsNet, summary, lineDisplay }
  }

  if (market_key === 'spreads') {
    const isHome = isTeamMatch(pick_name, home_team)
    const line = Number(pick_line) || 0
    const diff = isHome ? (homeScore + line) - awayScore : (awayScore + line) - homeScore
    const status: 'won' | 'lost' | 'push' = diff > 0 ? 'won' : diff < 0 ? 'lost' : 'push'
    const unitsNet = calculateNetUnits(pick_price, status)
    const lineStr = line > 0 ? `+${line}` : String(line)
    const lineDisplay = `${shortDisplayName(pick_name)} ${lineStr}`
    const summary = status === 'won'
      ? `✅ WIN: ${pName}${lineDisplay} cashes (${scoreSummary})`
      : status === 'lost'
        ? `❌ LOSS: ${pName}${scoreSummary}`
        : `🔄 PUSH: ${pName}${lineDisplay} (${scoreSummary})`
    return { status, unitsNet, summary, lineDisplay }
  }

  if (market_key === 'totals') {
    const line = Number(pick_line) || 0
    const total = homeScore + awayScore
    const isOver = /^over/i.test(pick_name)
    const status: 'won' | 'lost' | 'push' = total === line
      ? 'push'
      : (isOver ? total > line : total < line)
        ? 'won'
        : 'lost'
    const unitsNet = calculateNetUnits(pick_price, status)
    const side = isOver ? 'Over' : 'Under'
    const lineDisplay = `${side} ${line}`
    const summary = status === 'won'
      ? `✅ WIN: ${pName}${lineDisplay} cashes (${total} pts · ${scoreSummary})`
      : status === 'lost'
        ? `❌ LOSS: ${pName}${total} pts (${scoreSummary})`
        : `🔄 PUSH: ${pName}Exactly ${line} pts (${scoreSummary})`
    return { status, unitsNet, summary, lineDisplay }
  }

  return { status: 'push', unitsNet: 0, summary: scoreSummary, lineDisplay: pick_name }
}

/**
 * Poll The Odds API scores endpoint for all sports with pending picks,
 * resolve game outcomes, grade each pick, record units, and post auto-reply comments.
 */
export async function gradePendingPicks(
  admin: SupabaseClient,
  apiKey: string,
  botUserId?: string,
): Promise<{ resolved: number; errors: string[] }> {
  const errors: string[] = []
  let resolvedCount = 0

  let query = admin
    .from('lounge_bot_picks')
    .select('*')
    .eq('status', 'pending')
    .lte('commence_time', new Date(Date.now() - 90 * 60 * 1000).toISOString()) // started >90m ago

  if (botUserId) {
    query = query.eq('bot_user_id', botUserId)
  }

  const { data: pendingPicks, error: fetchErr } = await query
  if (fetchErr || !pendingPicks || pendingPicks.length === 0) {
    return { resolved: 0, errors: fetchErr ? [fetchErr.message] : [] }
  }

  // Group pending picks by sport_key
  const bySport = new Map<string, typeof pendingPicks>()
  for (const p of pendingPicks) {
    const list = bySport.get(p.sport_key) || []
    list.push(p)
    bySport.set(p.sport_key, list)
  }

  const updatedPickIds = new Set<string>()

  for (const [sportKey, picks] of bySport.entries()) {
    try {
      const url = `${ODDS_BASE}/sports/${encodeURIComponent(sportKey)}/scores/?apiKey=${encodeURIComponent(apiKey)}&daysFrom=3`
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) {
        errors.push(`Scores API ${sportKey}: HTTP ${res.status}`)
        continue
      }
      const scoreEvents: ScoreEvent[] = await res.json()
      const eventById = new Map<string, ScoreEvent>()
      for (const ev of scoreEvents) {
        if (ev.id) eventById.set(ev.id, ev)
      }

      for (const pick of picks) {
        // Handle 2-game Teaser picks
        if (pick.market_key === 'teasers') {
          const legs = Array.isArray(pick.metadata?.legs) ? pick.metadata.legs : []
          if (legs.length >= 2) {
            const leg1 = legs[0]
            const leg2 = legs[1]
            const ev1 = eventById.get(leg1.event_id)
            const ev2 = eventById.get(leg2.event_id)

            if (ev1?.completed && ev2?.completed && Array.isArray(ev1.scores) && Array.isArray(ev2.scores)) {
              // Parse Leg 1
              const s1_1 = parseInt(ev1.scores[0]?.score, 10)
              const s1_2 = parseInt(ev1.scores[1]?.score, 10)
              let hScore1 = 0, aScore1 = 0
              if (isTeamMatch(ev1.scores[0]?.name, leg1.home_team)) {
                hScore1 = s1_1; aScore1 = s1_2
              } else {
                hScore1 = s1_2; aScore1 = s1_1
              }
              const isHome1 = isTeamMatch(leg1.picked_team, leg1.home_team)
              const line1 = Number(leg1.teased_spread) || 0
              const diff1 = isHome1 ? (hScore1 + line1) - aScore1 : (aScore1 + line1) - hScore1
              const leg1Won = diff1 > 0
              const leg1Push = diff1 === 0
              const leg1Lost = diff1 < 0

              // Parse Leg 2
              const s2_1 = parseInt(ev2.scores[0]?.score, 10)
              const s2_2 = parseInt(ev2.scores[1]?.score, 10)
              let hScore2 = 0, aScore2 = 0
              if (isTeamMatch(ev2.scores[0]?.name, leg2.home_team)) {
                hScore2 = s2_1; aScore2 = s2_2
              } else {
                hScore2 = s2_2; aScore2 = s2_1
              }
              const isHome2 = isTeamMatch(leg2.picked_team, leg2.home_team)
              const line2 = Number(leg2.teased_spread) || 0
              const diff2 = isHome2 ? (hScore2 + line2) - aScore2 : (aScore2 + line2) - hScore2
              const leg2Won = diff2 > 0
              const leg2Push = diff2 === 0
              const leg2Lost = diff2 < 0

              let status: 'won' | 'lost' | 'push' = 'lost'
              let unitsNet = -1.0
              if (leg1Won && leg2Won) {
                status = 'won'
                unitsNet = calculateNetUnits(pick.pick_price, 'won')
              } else if (leg1Lost || leg2Lost) {
                status = 'lost'
                unitsNet = -1.0
              } else {
                status = 'push'
                unitsNet = 0.0
              }

              const leg1Summary = `${shortDisplayName(leg1.picked_team)} ${leg1.teased_disp} (${leg1Won ? '✅ Win' : leg1Push ? '🔄 Push' : '❌ Loss'})`
              const leg2Summary = `${shortDisplayName(leg2.picked_team)} ${leg2.teased_disp} (${leg2Won ? '✅ Win' : leg2Push ? '🔄 Push' : '❌ Loss'})`

              await admin
                .from('lounge_bot_picks')
                .update({
                  status,
                  home_score: hScore1,
                  away_score: aScore1,
                  units_net: unitsNet,
                  resolved_at: new Date().toISOString(),
                  metadata: {
                    ...(pick.metadata || {}),
                    leg1_result: leg1Summary,
                    leg2_result: leg2Summary,
                  },
                })
                .eq('id', pick.id)

              updatedPickIds.add(pick.id)
              resolvedCount++
            }
          }
          continue
        }

        const ev = eventById.get(pick.event_id)
        if (!ev || !ev.completed || !Array.isArray(ev.scores) || ev.scores.length < 2) {
          continue
        }

        // Parse scores
        const s1 = ev.scores[0]
        const s2 = ev.scores[1]
        const score1 = parseInt(s1.score, 10)
        const score2 = parseInt(s2.score, 10)
        if (isNaN(score1) || isNaN(score2)) continue

        let homeScore = 0
        let awayScore = 0
        if (isTeamMatch(s1.name, pick.home_team)) {
          homeScore = score1
          awayScore = score2
        } else {
          homeScore = score2
          awayScore = score1
        }

        const grade = gradePickOutcome(pick, homeScore, awayScore)

        // Update pick row
        await admin
          .from('lounge_bot_picks')
          .update({
            status: grade.status,
            home_score: homeScore,
            away_score: awayScore,
            units_net: grade.unitsNet,
            resolved_at: new Date().toISOString(),
          })
          .eq('id', pick.id)

        updatedPickIds.add(pick.id)
        resolvedCount++
      }
    } catch (err: unknown) {
      errors.push(`Error grading ${sportKey}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Now handle comment replies for posts where all picks are now resolved
  if (updatedPickIds.size > 0) {
    // Find unique posts affected
    const affectedPostIds = new Set<string>()
    for (const p of pendingPicks) {
      if (updatedPickIds.has(p.id) && p.post_id) {
        affectedPostIds.add(p.post_id)
      }
    }

    for (const postId of affectedPostIds) {
      // Check if ALL picks for this post are now resolved
      const { data: postPicks } = await admin
        .from('lounge_bot_picks')
        .select('*')
        .eq('post_id', postId)

      if (!postPicks || postPicks.length === 0) continue
      const hasPending = postPicks.some((p) => p.status === 'pending')
      if (hasPending) continue // wait until all picks in the card are finished

      // Check if we already posted a comment
      const alreadyCommented = postPicks.some((p) => p.comment_id != null)
      if (alreadyCommented) continue

      let commentText = ''
      const botUserId = postPicks[0].bot_user_id

      if (postPicks.length === 1) {
        const p = postPicks[0]
        if (p.market_key === 'teasers') {
          const isWon = p.status === 'won'
          const isPush = p.status === 'push'
          const uStr = Number(p.units_net) > 0 ? `+${Number(p.units_net).toFixed(2)}u` : `${Number(p.units_net).toFixed(2)}u`
          const leg1 = p.metadata?.leg1_result || 'Leg 1'
          const leg2 = p.metadata?.leg2_result || 'Leg 2'
          commentText = isWon
            ? `✅ WIN: Sharpe 2-Leg Wong Teaser Cashes (${uStr})\n• ${leg1}\n• ${leg2}\n\nKey numbers 3 & 7 deliver again for Basic Strategy.`
            : isPush
              ? `🔄 PUSH: Sharpe 2-Leg Wong Teaser Refunded (0.0u)\n• ${leg1}\n• ${leg2}`
              : `❌ LOSS: Sharpe 2-Leg Wong Teaser Misses (${uStr})\n• ${leg1}\n• ${leg2}`
        } else {
          // Solo pick comment with ESPN post-mortem boxscore hook
          const grade = gradePickOutcome(p, p.home_score ?? 0, p.away_score ?? 0)
          let note = ''

          if (p.sport_key?.startsWith('americanfootball_')) {
            try {
              const espnSum = await fetchEspnGameSummary(p.sport_key, p.home_team, p.away_team)
              if (espnSum?.postMortemNote) {
                note = `\n\n📌 Post-Mortem: ${espnSum.postMortemNote}`
              }
            } catch (e) {
              console.warn('ESPN summary hook error:', e)
            }
          }

          commentText = `${grade.summary}${note}`
        }
      } else if (postPicks.length > 8) {
        // Full Slate Card recap (e.g. 16 games = 64 picks)
        // Break down records by picker and consensus hammer/consensus/split
        const pickerTotals: Record<string, { wins: number; losses: number; pushes: number; units: number }> = {}
        for (const p of SHARP_PICKERS) {
          pickerTotals[p] = { wins: 0, losses: 0, pushes: 0, units: 0 }
        }

        // Group picks by event_id to compute consensus outcomes
        const eventPicksMap = new Map<string, typeof postPicks>()
        for (const p of postPicks) {
          const list = eventPicksMap.get(p.event_id) || []
          list.push(p)
          eventPicksMap.set(p.event_id, list)

          const rec = pickerTotals[p.picker_name]
          if (rec) {
            if (p.status === 'won') rec.wins++
            else if (p.status === 'lost') rec.losses++
            else if (p.status === 'push') rec.pushes++
            rec.units += Number(p.units_net) || 0
          }
        }

        let hammerWins = 0
        let hammerLosses = 0
        let consensusWins = 0
        let consensusLosses = 0

        for (const [, eList] of eventPicksMap) {
          const homePicks = eList.filter((p) => isTeamMatch(p.pick_name, p.home_team))
          const awayPicks = eList.filter((p) => isTeamMatch(p.pick_name, p.away_team))
          const homeWins = homePicks.filter((p) => p.status === 'won').length
          const awayWins = awayPicks.filter((p) => p.status === 'won').length

          if (homePicks.length === 3) {
            if (homeWins > 0) hammerWins++
            else if (homePicks[0].status === 'lost') hammerLosses++
          } else if (awayPicks.length === 3) {
            if (awayWins > 0) hammerWins++
            else if (awayPicks[0].status === 'lost') hammerLosses++
          } else if (homePicks.length === 2) {
            if (homeWins > 0) consensusWins++
            else if (homePicks[0].status === 'lost') consensusLosses++
          } else if (awayPicks.length === 2) {
            if (awayWins > 0) consensusWins++
            else if (awayPicks[0].status === 'lost') consensusLosses++
          } else if (homePicks.length === 4) {
            // Legacy 4-desk side cards
            if (homeWins > 0) hammerWins++
            else if (homePicks[0].status === 'lost') hammerLosses++
          } else if (awayPicks.length === 4) {
            if (awayWins > 0) hammerWins++
            else if (awayPicks[0].status === 'lost') hammerLosses++
          }
        }

        const lines: string[] = ['📊 Final Slate Card Standings:\n']
        for (const pName of SHARP_PICKERS) {
          const rec = pickerTotals[pName]
          const pNote = rec.pushes > 0 ? `-${rec.pushes}` : ''
          const uStr = rec.units > 0 ? `+${rec.units.toFixed(2)}u` : `${rec.units.toFixed(2)}u`
          lines.push(`• ${pName}: ${rec.wins}-${rec.losses}${pNote} (${uStr})`)
        }

        if (hammerWins > 0 || hammerLosses > 0) {
          lines.push(`\n🔥 Unanimous 3-0 Hammers: ${hammerWins}-${hammerLosses}`)
        }
        if (consensusWins > 0 || consensusLosses > 0) {
          lines.push(`🎯 2-1 Consensus: ${consensusWins}-${consensusLosses}`)
        }

        // Spot-check any major fluke in the slate
        for (const [, eList] of eventPicksMap) {
          const sample = eList[0]
          if (sample?.sport_key?.startsWith('americanfootball_')) {
            try {
              const espnSum = await fetchEspnGameSummary(sample.sport_key, sample.home_team, sample.away_team)
              if (espnSum?.isFlukeLossForHome || espnSum?.isFlukeLossForAway) {
                lines.push(`\n📌 Slate Post-Mortem: ${espnSum.postMortemNote}`)
                break // show top standout fluke note
              }
            } catch (e) {
              console.warn('ESPN slate hook error:', e)
            }
          }
        }

        lines.push('\n🌐 Audited ledger, whitepapers & live models: sharpesyndicate.com')
        lines.push('Next slate & in-game alerts drop in the Sharpe VIP Syndicate.')

        commentText = lines.join('\n')
      } else {
        // Syndicate multi-picker card comment recap (2-4 picks)
        let cardWins = 0
        let cardLosses = 0
        let cardPushes = 0
        let cardUnits = 0

        const lines: string[] = ['📊 Final Card Results:\n']
        for (const p of postPicks) {
          const icon = p.status === 'won' ? '✅' : p.status === 'lost' ? '❌' : '🔄'
          const unitsStr = Number(p.units_net) > 0 ? `+${p.units_net}u` : `${p.units_net}u`
          const grade = gradePickOutcome(p, p.home_score ?? 0, p.away_score ?? 0)
          lines.push(`${icon} ${p.picker_name}: ${grade.lineDisplay} (${unitsStr})`)

          if (p.status === 'won') cardWins++
          else if (p.status === 'lost') cardLosses++
          else if (p.status === 'push') cardPushes++
          cardUnits += Number(p.units_net) || 0
        }

        const pushNote = cardPushes > 0 ? `-${cardPushes}` : ''
        const unitsFormatted = cardUnits > 0 ? `+${cardUnits.toFixed(2)}` : cardUnits.toFixed(2)
        lines.push(`\nCard Total: ${cardWins}-${cardLosses}${pushNote} (${unitsFormatted}u)`)
        commentText = lines.join('\n')
      }

      // Post the comment
      const { data: commentRow } = await admin
        .from('feed_comments')
        .insert({
          post_id: postId,
          user_id: botUserId,
          comment_text: commentText,
        })
        .select('id')
        .single()

      if (commentRow?.id) {
        await admin
          .from('lounge_bot_picks')
          .update({ comment_id: commentRow.id })
          .eq('post_id', postId)
      }
    }
  }

  // Update profile highlight text if any bot user ID is provided or involved
  if (botUserId) {
    await syncBotProfileHighlight(admin, botUserId)
  }

  return { resolved: resolvedCount, errors }
}

/**
 * Update the Scott Bot profile's about_me with the latest verified record highlight.
 */
export async function syncBotProfileHighlight(
  admin: SupabaseClient,
  botUserId: string,
): Promise<{ ok: boolean; highlight?: string; error?: string }> {
  try {
    const { data: rec, error } = await admin.rpc('lounge_bot_get_picks_record', {
      p_bot_user_id: botUserId,
      p_timeframe: 'all_time',
      p_sport_key: 'all',
    })
    if (error || !rec?.highlight_text) return { ok: false, error: error?.message }

    const highlight = String(rec.highlight_text).trim().slice(0, 140)
    await admin
      .from('profiles')
      .update({ about_me: highlight })
      .eq('user_id', botUserId)

    return { ok: true, highlight }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
