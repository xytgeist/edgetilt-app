/**
 * Predictive sports betting calls for the Sharp Desk (Scott, Rocco, Chedda, Tank).
 * Tank is totals-only. Lane B / Quorum fifth desk is parked (scraped HTML was unusable).
 * Supports solo calls and syndicate multi-picker cards.
 * Auto-grades against The Odds API final scores with unit tracking and consolidated card recaps.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  formatAmericanOdds,
  formatOddsCommenceTimeShort,
  shortDisplayName,
  sportTeamDisplayName,
  type OddsPick,
} from './loungeBotOddsCaption.ts'
import { formatColoredPickerName } from './loungeBotPickerColors.ts'
import { publishLoungeBotPost, publishLoungeBotPostWithThread } from './loungeBotPublish.ts'
import { LOUNGE_BOT_CAPTION_MAX } from './loungeBotCaptionLimits.ts'
import { publishBotSubChatMessage } from './loungeBotSubChatPublish.ts'
import { resolveSlatePublisher } from './loungeBotSyndicateIdentity.ts'
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
import {
  applySideModifierToModelSpread,
  valueFlagFromModelMarket,
  type SideModifier,
} from './loungeBotSideModifier.ts'
import {
  computePickClvPts,
  mapConsensusTypeToBucket,
} from './loungeBotSyndicateScoreboard.ts'

const ODDS_BASE = 'https://api.the-odds-api.com/v4'

export const SHARP_PICKERS = ['Scott', 'Rocco', 'Chedda', 'Tank'] as const
export type SharpPicker = (typeof SHARP_PICKERS)[number]
/** ATS side votes only … Tank lives on totals and does not fill fake 4-0 hammers. */
export const ATS_SIDE_DESKS = ['Scott', 'Rocco', 'Chedda'] as const
export type AtsSideDesk = (typeof ATS_SIDE_DESKS)[number]

/** Scott soft gap (1.5): only when the pick line is on 3/7 or the half onto those (not "near"). */
export function isTrueKeySpreadPoint(point: number | null | undefined): boolean {
  if (point == null || !Number.isFinite(point)) return false
  const abs = Math.abs(point)
  return abs === 3 || abs === 7 || abs === 2.5 || abs === 3.5 || abs === 6.5 || abs === 7.5
}

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
  /** Post-consensus QB/injury adjustment (home-centric). */
  sideModifier?: SideModifier | null
  adjustedModelSpreadHome?: number | null
  splits?: BettingSplitSummary
  trenchEpa?: TrenchEpaMatchupSummary | null
  consensusPick: {
    side: 'home' | 'away'
    teamName: string
    lineDisplay: string
    voteCount: number // e.g. 3 or 2 among ATS desks
    type: 'hammer' | 'consensus' | 'majority_split' | 'split' | 'solo' | 'pass_only'
    badgeText: string
  }
  pickerPicks: Record<SharpPicker, {
    side: SlateDeskSide
    teamName: string
    lineDisplay: string
    pickPrice: number
    pick: OddsPick
    /**
     * When false, desk still shows the lean on VIP cards but the vote does not
     * count toward house hammer / consensus / split buckets (Rocco short-fav alone).
     */
    countsForHouse?: boolean
    /** Rocco kept a side worse than {@link ROCCO_UGLY_JUICE_WORSE_THAN} because Scott/Chedda backed it. */
    uglyJuice?: boolean
  }>
}

export type NflSlateCard = {
  cardTitle: string
  sportKey: string
  games: SlateGamePick[]
  hammers: SlateGamePick[]
  consensus: SlateGamePick[]
  majoritySplits: SlateGamePick[]
  splits: SlateGamePick[]
  solos: SlateGamePick[]
  passOnly: SlateGamePick[]
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
  const team = sportTeamDisplayName(pick.pickName, pick.sportKey)
  if (pick.marketKey === 'h2h') {
    return `${team} ML (${odds})`
  }
  if (pick.marketKey === 'spreads' && pick.linePoint != null) {
    const pt = pick.linePoint > 0 ? `+${pick.linePoint}` : String(pick.linePoint)
    return `${team} ${pt} (${odds})`
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
  const away = sportTeamDisplayName(pick.awayTeam, pick.sportKey)
  const home = sportTeamDisplayName(pick.homeTeam, pick.sportKey)
  const when = formatOddsCommenceTimeShort(pick.commenceTime)
  const matchup = `${away} vs ${home} (${when})`

  const lines = [`🎯 ${formatColoredPickerName(pickerName, `${pickerName}'s`)} Pick\n\n${line}\n${matchup}`]
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
    const away = sportTeamDisplayName(item.pick.awayTeam, item.pick.sportKey)
    const home = sportTeamDisplayName(item.pick.homeTeam, item.pick.sportKey)
    lines.push(`🎯 ${formatColoredPickerName(item.pickerName)}: ${pLine} (${away}/${home})`)
  }
  return lines.join('\n')
}

/** Public Lounge slate teaser caps (VIP still gets full uncut desk cards). */
export const PUBLIC_SLATE_HAMMER_CAP = 1
export const PUBLIC_SLATE_CONSENSUS_CAP = 2
export const PUBLIC_SLATE_MAJORITY_SPLIT_CAP = 3
export const PUBLIC_SLATE_SOLO_CAP = 3
export const PUBLIC_SLATE_HOUSE_DIVIDED_CAP = 3
export const PUBLIC_SLATE_PASS_CAP = 3

/**
 * Rocco American-odds floor for slate sides (exclusive).
 * Worse than this (e.g. -118) → PASS unless Scott or Chedda already on that side.
 */
export const ROCCO_UGLY_JUICE_WORSE_THAN = -115

/**
 * Locked public slate markdown dialect (v9):
 * - No nested indent (mobile wrap room)
 * - Consensus: pick + agreeing desks only (no PASS callouts)
 * - House Divided / Split: one · line per active side
 * - Order: Hammers → Consensus → House Divided → Split → Tank's Totals → Solo → All Pass
 * - VIP desk thread parts use the same Lounge markdown dialect (colored desk + gold picks)
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

function formatMatchupWhen(g: SlateGamePick): string {
  const away = sportTeamDisplayName(g.awayTeam, g.sportKey)
  const home = sportTeamDisplayName(g.homeTeam, g.sportKey)
  const when = formatOddsCommenceTimeShort(g.commenceTime)
  return `${away}/${home} · ${when}`
}

function formatGoldPick(lineDisplay: string): string {
  return `**[gold]${lineDisplay}[/gold]**`
}

function formatDeskJoin(names: readonly SharpPicker[]): string {
  return names.map((n) => formatColoredPickerName(n)).join(' & ')
}

function desksOnSide(g: SlateGamePick, side: 'home' | 'away'): SharpPicker[] {
  return ATS_SIDE_DESKS.filter((p) => {
    const pp = g.pickerPicks[p]
    return pp.side === side && pp.countsForHouse !== false
  })
}

function soloPickerForGame(g: SlateGamePick): SharpPicker | null {
  const active = ATS_SIDE_DESKS.filter((p) => {
    const pp = g.pickerPicks[p]
    return pp.side !== 'pass' && pp.countsForHouse !== false
  })
  return active.length === 1 ? active[0]! : null
}

/** Hammer H3: pick first, matchup in parens. */
function formatHammerItem(g: SlateGamePick): string {
  return `### ${formatGoldPick(g.consensusPick.lineDisplay)} (${formatMatchupWhen(g)})`
}

/** Consensus (2-0): matchup H3 + pick · agreeing desks (PASS desks omitted). */
function formatConsensusItem(g: SlateGamePick): string[] {
  const agree = desksOnSide(g, g.consensusPick.side)
  return [
    `### ${formatMatchupWhen(g)}`,
    `· ${formatGoldPick(g.consensusPick.lineDisplay)} · ${formatDeskJoin(agree)}`,
  ]
}

/** House Divided (2-1): one · line per active side. */
function formatHouseDividedItem(g: SlateGamePick): string[] {
  const majoritySide = g.consensusPick.side
  const dissentSide = majoritySide === 'home' ? 'away' : 'home'
  const majorityDesks = desksOnSide(g, majoritySide)
  const dissentDesks = desksOnSide(g, dissentSide)
  const dissentLine = dissentDesks[0]
    ? g.pickerPicks[dissentDesks[0]].lineDisplay
    : ''
  return [
    `### ${formatMatchupWhen(g)}`,
    `· ${formatGoldPick(g.consensusPick.lineDisplay)} · ${formatDeskJoin(majorityDesks)}`,
    `· ${formatGoldPick(dissentLine)} · ${formatDeskJoin(dissentDesks)}`,
  ]
}

/** Split (1-1): one · line per active side. */
function formatSplitItem(g: SlateGamePick): string[] {
  const homeDesks = desksOnSide(g, 'home')
  const awayDesks = desksOnSide(g, 'away')
  const homeLine = homeDesks[0] ? g.pickerPicks[homeDesks[0]].lineDisplay : ''
  const awayLine = awayDesks[0] ? g.pickerPicks[awayDesks[0]].lineDisplay : ''
  return [
    `### ${formatMatchupWhen(g)}`,
    `· ${formatGoldPick(awayLine)} · ${formatDeskJoin(awayDesks)}`,
    `· ${formatGoldPick(homeLine)} · ${formatDeskJoin(homeDesks)}`,
  ]
}

/** Solo section: group by desk as H3, pick bullets under each. */
function formatSoloSection(solos: SlateGamePick[]): string[] {
  const byDesk = new Map<SharpPicker, SlateGamePick[]>()
  for (const g of solos) {
    const picker = soloPickerForGame(g)
    if (!picker) continue
    const list = byDesk.get(picker) || []
    list.push(g)
    byDesk.set(picker, list)
  }
  const lines: string[] = []
  for (const desk of ATS_SIDE_DESKS) {
    const games = byDesk.get(desk)
    if (!games?.length) continue
    lines.push(`### ${formatColoredPickerName(desk)}`)
    for (const g of games) {
      lines.push(`· ${formatGoldPick(g.pickerPicks[desk].lineDisplay)} (${formatMatchupWhen(g)})`)
    }
  }
  return lines
}

function formatTankItem(g: SlateGamePick): string {
  // Plain line (not ###) so only the gold pick is bold ... matchup stays regular weight.
  return `· ${formatGoldPick(g.pickerPicks.Tank.lineDisplay)} (${formatMatchupWhen(g)})`
}

/** Public tease footer … game count when the slate has 2+ games, else generic fan-sub CTA. */
export function formatSlateVipCtaLine(card: NflSlateCard): string {
  const gameCount = Array.isArray(card.games) ? card.games.length : 0
  if (gameCount >= 2) {
    return `📊 Full ${gameCount}-game desk grid for **Sharpe Syndicate** subscribers`
  }
  return '📊 Uncut 4-desk cards for **Sharpe Syndicate** subscribers'
}

function formatSlateSubscriberFooter(card: NflSlateCard): string {
  const gameCount = Array.isArray(card.games) ? card.games.length : 0
  const n = gameCount >= 2 ? `${gameCount}-game ` : ''
  return `📋 Per-desk Scott / Rocco / Chedda / Tank ${n}cards in this thread 👇`
}

type SlateCaptionOpts = {
  /** When true, no public tease caps … every hammer / consensus / etc. */
  uncut?: boolean
  footer?: 'public_cta' | 'subscriber_desks' | 'none'
}

/**
 * Shared slate body (public tease + subscriber root).
 * Public uses caps; subscriber full card uses `uncut: true`.
 */
export function formatNflSlateCardCaption(
  card: NflSlateCard,
  opts: SlateCaptionOpts = {},
): string {
  const uncut = opts.uncut === true
  const footer = opts.footer || (uncut ? 'subscriber_desks' : 'public_cta')

  const hammers = uncut ? card.hammers : card.hammers.slice(0, PUBLIC_SLATE_HAMMER_CAP)
  const consensus = uncut ? card.consensus : card.consensus.slice(0, PUBLIC_SLATE_CONSENSUS_CAP)
  const majoritySplits = uncut
    ? (card.majoritySplits || [])
    : (card.majoritySplits || []).slice(0, PUBLIC_SLATE_MAJORITY_SPLIT_CAP)
  const solos = uncut ? (card.solos || []) : (card.solos || []).slice(0, PUBLIC_SLATE_SOLO_CAP)
  const splits = uncut ? card.splits : card.splits.slice(0, PUBLIC_SLATE_HOUSE_DIVIDED_CAP)
  const passOnly = uncut
    ? (card.passOnly || [])
    : (card.passOnly || []).slice(0, PUBLIC_SLATE_PASS_CAP)
  const tankTotalsAll = card.games.filter(
    (g) => g.pickerPicks.Tank.side === 'over' || g.pickerPicks.Tank.side === 'under',
  )
  const tankTotals = uncut ? tankTotalsAll : tankTotalsAll.slice(0, 3)

  const title = card.cardTitle || '🏈 NFL Sharpe Syndicate Slate'
  const lines: string[] = [`# ${title}`]
  const weekLine = formatSlateWeekLine(card.games)
  if (weekLine) lines.push(weekLine)
  lines.push('')

  if (hammers.length > 0) {
    lines.push('## 🔥 Hammers (3-0)')
    for (const g of hammers) lines.push(formatHammerItem(g))
    lines.push('')
  }

  if (consensus.length > 0) {
    lines.push('## 🎯 Consensus (2-0)')
    for (const g of consensus) lines.push(...formatConsensusItem(g))
    lines.push('')
  }

  if (majoritySplits.length > 0) {
    lines.push('## ⚔️ House Divided (2-1)')
    for (const g of majoritySplits) lines.push(...formatHouseDividedItem(g))
    lines.push('')
  }

  if (splits.length > 0) {
    lines.push('## ⚖️ Split (1-1)')
    for (const g of splits) lines.push(...formatSplitItem(g))
    lines.push('')
  }

  if (tankTotals.length > 0) {
    lines.push("## 🛡️ Tank's Totals")
    for (const g of tankTotals) lines.push(formatTankItem(g))
    lines.push('')
  }

  if (solos.length > 0) {
    lines.push('## 🎯 Solo Picks')
    lines.push(...formatSoloSection(solos))
    lines.push('')
  }

  if (passOnly.length > 0) {
    lines.push('## ⏭️ All Pass')
    for (const g of passOnly) lines.push(`### ${formatMatchupWhen(g)}`)
    lines.push('')
  }

  const injuryNotes = uncut
    ? card.games.filter((g) => g.sideModifier?.isSignificant)
    : card.games.filter((g) => g.sideModifier?.isSignificant).slice(0, 4)
  if (injuryNotes.length > 0) {
    lines.push('## 🚑 Side modifiers (post-board)')
    for (const g of injuryNotes) {
      const away = sportTeamDisplayName(g.awayTeam, g.sportKey || card.sportKey)
      const home = sportTeamDisplayName(g.homeTeam, g.sportKey || card.sportKey)
      lines.push(`- ${away}/${home}: ${g.sideModifier!.reason}`)
    }
    lines.push('')
  }

  if (footer !== 'none') {
    lines.push('---')
    lines.push('')
    lines.push(footer === 'subscriber_desks' ? formatSlateSubscriberFooter(card) : formatSlateVipCtaLine(card))
  }

  return lines.join('\n').trim()
}

/**
 * Fan-only Lounge root … same structure as the public tease, uncapped.
 * Per-desk lists stay in following thread parts.
 */
export function formatNflSlatePrivateRootCaption(card: NflSlateCard): string {
  return formatNflSlateCardCaption(card, { uncut: true, footer: 'subscriber_desks' })
}

/**
 * Split a long slate caption on ## section boundaries so each chunk fits Lounge max.
 */
export function splitSlateCaptionToFit(caption: string, maxChars: number): string[] {
  const text = String(caption || '').trim()
  if (!text) return []
  if (text.length <= maxChars) return [text]

  const sections = text.split(/\n(?=## )/)
  const chunks: string[] = []
  let current = ''

  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim())
    current = ''
  }

  for (const section of sections) {
    const piece = String(section || '')
    if (!piece) continue
    const next = current ? `${current}\n${piece}` : piece
    if (next.length <= maxChars) {
      current = next
      continue
    }
    pushCurrent()
    if (piece.length <= maxChars) {
      current = piece
      continue
    }
    // Hard-split oversized section (rare).
    for (let i = 0; i < piece.length; i += maxChars - 3) {
      const slice = piece.slice(i, i + maxChars - 3)
      const more = i + maxChars - 3 < piece.length
      chunks.push(more ? `${slice}...` : slice)
    }
    current = ''
  }
  pushCurrent()
  return chunks.length ? chunks : [text.slice(0, maxChars - 3) + '...']
}

/**
 * Format a full ATS/totals card for one persona … VIP / fan thread part.
 * Same Lounge markdown dialect as the slate root (colored desk name, gold picks).
 * Every slate game is listed with that desk's decision (including PASS).
 */
export function formatPickerSlateList(card: NflSlateCard, picker: SharpPicker): string {
  const icon = picker === 'Tank' ? '🛡️' : picker === 'Chedda' ? '🧀' : picker === 'Rocco' ? '🥩' : '🎯'
  const specialty =
    picker === 'Tank'
      ? 'O/U desk … tempo, off-def, and totals that actually move the number. PASS is the default.'
      : picker === 'Chedda'
        ? 'Dog hunter … hooks, plus-money spots, and sharp money on the underdog. Chalk is someone else\'s problem.'
        : picker === 'Rocco'
          ? 'Short-chalk butcher … power favorites, key numbers, and the hook. Ugly juice gets a hard pass.'
          : 'Model-first … fires when the number is wrong vs market. No fav costume, no dog costume.'

  const cardLabel = picker === 'Tank' ? 'Totals Card' : 'ATS Card'
  const lines: string[] = [
    `## ${icon} ${formatColoredPickerName(picker, `${picker}'s`)} Full ${cardLabel}`,
    specialty,
    '',
  ]
  for (const g of card.games) {
    const pPick = g.pickerPicks[picker]
    const sportKey = g.sportKey || card.sportKey
    const away = sportTeamDisplayName(g.awayTeam, sportKey)
    const home = sportTeamDisplayName(g.homeTeam, sportKey)
    const when = formatOddsCommenceTimeShort(g.commenceTime)
    const matchup = `${away}/${home} · ${when}`
    const isPass = pPick.side === 'pass' || !String(pPick.lineDisplay || '').trim()
    lines.push(`### ${matchup}`)
    if (isPass) {
      const uglyPass = pPick.uglyJuice === true || /ugly juice/i.test(String(pPick.lineDisplay || ''))
      lines.push(uglyPass ? '· PASS · [red]ugly juice[/red]' : '· PASS')
    } else {
      const raw = String(pPick.lineDisplay || '').trim()
      const base = raw.replace(/\s·\s\[red\]ugly juice\[\/red\]\s*$/i, '').trim() || raw
      const ugly = pPick.uglyJuice === true || /\[red\]ugly juice\[\/red\]/i.test(raw)
      lines.push(ugly ? `· ${formatGoldPick(base)} · [red]ugly juice[/red]` : `· ${formatGoldPick(base)}`)
    }
  }
  if (card.games.length === 0) {
    lines.push(picker === 'Tank' ? '· No totals leans this slate' : '· No ATS leans this slate')
  }
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

function sortByEdgeDesc(picks: OddsPick[]): OddsPick[] {
  return [...picks].sort((a, b) => (Number(b.edgePct) || 0) - (Number(a.edgePct) || 0))
}

/**
 * Filter +EV candidates to a forced desk's market rules.
 * Tank never receives sides; Chedda only plus-money MLs; Rocco spreads; Scott non-totals EV.
 */
export function filterCandidatesForPersona(
  candidates: OddsPick[],
  persona: SharpPicker,
): OddsPick[] {
  const valid = filterPredictiveCandidates(candidates)
  switch (persona) {
    case 'Chedda':
      return valid.filter(
        (p) => p.marketKey === 'h2h' && p.pickPrice >= 110 && p.pickPrice <= 260,
      )
    case 'Tank':
      return valid.filter(
        (p) => p.marketKey === 'totals' && p.pickPrice >= -125 && p.pickPrice <= 110,
      )
    case 'Rocco':
      return valid.filter(
        (p) => p.marketKey === 'spreads' && p.pickPrice >= -135 && p.pickPrice <= 115,
      )
    case 'Scott':
      // Model / EV baseline on spreads … do not costume Chedda plus-money MLs.
      return valid.filter(
        (p) => p.marketKey === 'spreads' && p.pickPrice >= -135 && p.pickPrice <= 115,
      )
    default:
      return valid
  }
}

/**
 * Solo drop: honor forced persona markets, or auto-classify the top EV pick.
 * Returns null when the forced desk has no legal candidate (do not costume a wrong market).
 */
export function pickSoloForPersona(
  candidates: OddsPick[],
  pickerName?: string | null,
): { pickerName: SharpPicker; pick: OddsPick } | null {
  const valid = sortByEdgeDesc(filterPredictiveCandidates(candidates))
  if (!valid.length) return null

  const forced = String(pickerName || '').trim()
  if (forced && (SHARP_PICKERS as readonly string[]).includes(forced)) {
    const persona = forced as SharpPicker
    const pool = sortByEdgeDesc(filterCandidatesForPersona(valid, persona))
    if (!pool.length) return null
    return { pickerName: persona, pick: pool[0]! }
  }

  const top = valid[0]!
  return { pickerName: classifyPickPersona(top), pick: top }
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
 * Scott PASSes under |model−market| 2.5 (1.5 only on true 3/7 keys). Rocco may PASS.
 * Rocco short-fav alone stays on his VIP desk card but does not count for house buckets.
 * Rocco juice worse than {@link ROCCO_UGLY_JUICE_WORSE_THAN} → PASS unless Scott/Chedda on that side.
 * Synthetic splits never score.
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
    /** Post-consensus QB/injury modifiers keyed by Odds API event id. */
    sideModifiersByEventId?: Map<string, SideModifier>
    /** Human-pasted Action/VSiN splits keyed by Odds API event id. */
    pastedSplitsByEventId?: Map<string, BettingSplitSummary>
  } = {},
): NflSlateCard | null {
  if (!Array.isArray(events) || events.length === 0) return null

  const games: SlateGamePick[] = []
  const hammers: SlateGamePick[] = []
  const consensus: SlateGamePick[] = []
  const splits: SlateGamePick[] = []
  const solos: SlateGamePick[] = []
  const majoritySplits: SlateGamePick[] = []
  const passOnlyGames: SlateGamePick[] = []
  const weights = opts.weightsMap || new Map<string, number>()
  const teamMetrics = opts.teamMetricsMap
  const cfbRatings = opts.cfbRatingsMap
  const sideModifiers = opts.sideModifiersByEventId || new Map<string, SideModifier>()
  const pastedSplits = opts.pastedSplitsByEventId || new Map<string, BettingSplitSummary>()

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

    // Prefer human-pasted Action/VSiN splits. Synthetic may appear in captions only …
    // every score bonus / chalk-trap requires isPasted === true (no synthetic path).
    const pastedSplit = pastedSplits.get(String(ev.id || '').trim()) || null
    const gameSplits = pastedSplit || resolveGameBettingSplits(ev, homePoint, homePrice, awayPrice)
    const hasRealSplits = gameSplits.isPasted === true
    const sharpFavorsHome = hasRealSplits && gameSplits.sharpFavoredSide === 'home'
    const sharpFavorsAway = hasRealSplits && gameSplits.sharpFavoredSide === 'away'

    // Calculate EPA matchups (NFL) or Power Rating Projections (CFB). Trench impact stays 0 until ingest.
    const isCfb = ev.sport_key === 'americanfootball_ncaaf' || (opts.sportKey && opts.sportKey.includes('ncaaf'))
    const trenchEpa = !isCfb ? calculateTrenchEpaMatchup(homeTeam, awayTeam, teamMetrics) : null
    const cfbMatchup = isCfb ? calculateCfbMatchupProjection(homeTeam, awayTeam, homePoint, cfbRatings) : null

    // Post-consensus QB/injury: adjust model BEFORE Scott value flag. Tank totals untouched.
    const sideModifier = sideModifiers.get(String(ev.id || '').trim()) || null
    const baseModelSpreadHome = isCfb
      ? (cfbMatchup?.modelSpreadHome ?? null)
      : (trenchEpa != null ? -trenchEpa.epaSpreadImpactHome : null)
    const adjustedModelSpreadHome = baseModelSpreadHome != null && sideModifier
      ? applySideModifierToModelSpread(baseModelSpreadHome, sideModifier.netSpreadImpactHome)
      : baseModelSpreadHome
    const injuryValue = adjustedModelSpreadHome != null
      ? valueFlagFromModelMarket(adjustedModelSpreadHome, homePoint, 2.5)
      : null
    const softModelValue = adjustedModelSpreadHome != null
      ? valueFlagFromModelMarket(adjustedModelSpreadHome, homePoint, 1.5)
      : null

    // Key Number Hook Intelligence (NFL only)
    const homeKeyAnalysis = !isCfb ? analyzeFootballKeyNumbers(homePoint) : null
    const awayKeyAnalysis = !isCfb ? analyzeFootballKeyNumbers(awayPoint) : null

    // Bayesian factor weights (frozen / experimental … do not retune in this change)
    const roccoWeight = weights.get('Rocco:short_favorites_1_to_4') || 1.0
    const cheddaSweetWeight = weights.get('Chedda:dog_sweet_spot_130_175') || 1.0
    const tankRestWeight = weights.get('Tank:rest_advantage') || 1.0
    void weights.get('Scott:model_clv_high_ev')

    // Desk lanes (Grok audit package):
    // Scott: PASS unless |model−market| ≥ 2.5 after PVAL; 1.5 only on true 3/7 (or half onto those)
    // Rocco: PASS unless short-fav / hurtSide / hook-tax / pasted chalk-trap (no trench claim)
    // Chedda: PASS unless dog+hook / dog+PVAL / pasted money (no dog+raw-EPA; no synthetic)
    // Tank: totals first-pass (3.5 / key); weather/rest later … formula untouched here

    // 1. Scott — model vs current market only (no juice/fav/synthetic lean costume)
    let scottSide: SlateDeskSide = 'pass'
    if (injuryValue?.isValuePlay && injuryValue.valueSide) {
      scottSide = injuryValue.valueSide
    } else if (softModelValue?.isValuePlay && softModelValue.valueSide) {
      const pickPoint = softModelValue.valueSide === 'home' ? homePoint : awayPoint
      if (isTrueKeySpreadPoint(pickPoint)) scottSide = softModelValue.valueSide
    }

    // 2. Chedda — dogs / money.
    // Unlock: dog+hook, dog+PVAL/injury model (not raw EPA), or pasted Action/VSiN sharp divergence.
    const homeIsDog = homePoint > 0
    const awayIsDog = awayPoint > 0
    const cheddaGoldenHookHome = Boolean(homeKeyAnalysis?.isHookGolden && homeIsDog)
    const cheddaGoldenHookAway = Boolean(awayKeyAnalysis?.isHookGolden && awayIsDog)
    const cheddaModelDogHome = homeIsDog && (
      injuryValue?.valueSide === 'home'
      || (isCfb && cfbMatchup?.valueSide === 'home')
    )
    const cheddaModelDogAway = awayIsDog && (
      injuryValue?.valueSide === 'away'
      || (isCfb && cfbMatchup?.valueSide === 'away')
    )
    const cheddaMoneyHome = hasRealSplits && gameSplits.isSharpDivergence && sharpFavorsHome
    const cheddaMoneyAway = hasRealSplits && gameSplits.isSharpDivergence && sharpFavorsAway
    const cheddaHasRealFeature =
      cheddaGoldenHookHome
      || cheddaGoldenHookAway
      || cheddaModelDogHome
      || cheddaModelDogAway
      || cheddaMoneyHome
      || cheddaMoneyAway
    void cheddaSweetWeight // reserved when fully automated splits API arrives
    let cheddaSide: SlateDeskSide = 'pass'
    if (cheddaHasRealFeature) {
      if (cheddaMoneyHome) cheddaSide = 'home'
      else if (cheddaMoneyAway) cheddaSide = 'away'
      else if (cheddaGoldenHookHome || cheddaModelDogHome) cheddaSide = 'home'
      else if (cheddaGoldenHookAway || cheddaModelDogAway) cheddaSide = 'away'
    }

    // 3. Rocco — short fav / hook tax / hurtSide / pasted chalk-trap only
    const isShortFavHome = homePoint < 0 && homePoint >= -7.5
    const isShortFavAway = awayPoint < 0 && awayPoint >= -7.5
    const pastedChalkTrap =
      (isShortFavHome && sharpFavorsAway) || (isShortFavAway && sharpFavorsHome)
    const roccoChalkTrapPenalty = pastedChalkTrap
      ? (isShortFavHome && sharpFavorsAway ? -1.5 : 1.5)
      : 0
    const roccoHookTaxPenalty = (homeKeyAnalysis?.isHookTax && isShortFavHome)
      ? -0.8
      : (awayKeyAnalysis?.isHookTax && isShortFavAway)
        ? 0.8
        : 0
    // CFB still uses power gap on short favs; NFL trench impact remains hard-zero (do not claim PBWR).
    const roccoPowerBonus = isCfb && cfbMatchup
      ? (cfbMatchup.homePower - cfbMatchup.awayPower > 10.0 && homePoint < 0
        ? 1.2
        : cfbMatchup.awayPower - cfbMatchup.homePower > 10.0 && awayPoint < 0
          ? -1.2
          : 0)
      : 0
    const hurtSide = sideModifier?.hurtSide ?? null
    const roccoStarterOutPenalty =
      hurtSide === 'home' && isShortFavHome
        ? -2.0
        : hurtSide === 'away' && isShortFavAway
          ? 2.0
          : hurtSide === 'home' && homePoint < 0
            ? -0.8
            : hurtSide === 'away' && awayPoint < 0
              ? 0.8
              : 0
    const roccoHasVoteFeature =
      isShortFavHome
      || isShortFavAway
      || hurtSide != null
      || Math.abs(roccoHookTaxPenalty) >= 0.8
      || pastedChalkTrap
      || (isCfb && Math.abs(roccoPowerBonus) >= 1.0)
    const roccoScoreHome =
      (isShortFavHome ? (1.2 * roccoWeight) : isShortFavAway ? (-1.2 * roccoWeight) : (homePoint < 0 ? 0.4 : -0.4))
      + roccoChalkTrapPenalty
      + roccoHookTaxPenalty
      + roccoPowerBonus
      + roccoStarterOutPenalty
    let roccoSide: SlateDeskSide = roccoHasVoteFeature
      ? (roccoScoreHome >= 0 ? 'home' : 'away')
      : 'pass'
    /** House / hammer strength only … short-fav alone is NOT enough. */
    const roccoHasStrengthReason =
      hurtSide != null
      || Math.abs(roccoHookTaxPenalty) >= 0.8
      || pastedChalkTrap
      || (isCfb && Math.abs(roccoPowerBonus) >= 1.0)

    // Ugly juice gate: worse than -115 → PASS unless Scott or Chedda already on that side.
    // Do not bake American odds into Rocco's strength score … gate at publish / house layer.
    const roccoPriceIfPlay =
      roccoSide === 'home' ? homePrice : roccoSide === 'away' ? awayPrice : null
    const roccoUglyJuice =
      roccoPriceIfPlay != null
      && Number.isFinite(roccoPriceIfPlay)
      && roccoPriceIfPlay < ROCCO_UGLY_JUICE_WORSE_THAN
    let roccoPassedUglyJuice = false
    if (roccoSide !== 'pass' && roccoUglyJuice) {
      const backedByScottOrChedda =
        (roccoSide === 'home' && (scottSide === 'home' || cheddaSide === 'home'))
        || (roccoSide === 'away' && (scottSide === 'away' || cheddaSide === 'away'))
      if (!backedByScottOrChedda) {
        roccoSide = 'pass'
        roccoPassedUglyJuice = true
      }
    }
    const roccoKeptUglyJuice = roccoSide !== 'pass' && roccoUglyJuice
    const roccoCountsForHouse = roccoSide !== 'pass' && roccoHasStrengthReason

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
      countsForHouse?: boolean
      uglyJuice?: boolean
    }> = {
      Scott: {
        side: scottSide,
        teamName: scottSide === 'home' ? homeTeam : scottSide === 'away' ? awayTeam : 'PASS',
        lineDisplay: scottSide === 'home' ? homeLineDisp : scottSide === 'away' ? awayLineDisp : 'PASS (gap < 2.5 vs current)',
        pickPrice: scottSide === 'home' ? homePrice : scottSide === 'away' ? awayPrice : 0,
        pick: scottSide === 'home' ? homePickObj : scottSide === 'away' ? awayPickObj : homePickObj,
        countsForHouse: scottSide !== 'pass',
      },
      Rocco: {
        side: roccoSide,
        teamName: roccoSide === 'home' ? homeTeam : roccoSide === 'away' ? awayTeam : 'PASS',
        lineDisplay: roccoSide === 'home'
          ? (roccoKeptUglyJuice ? `${homeLineDisp} · [red]ugly juice[/red]` : homeLineDisp)
          : roccoSide === 'away'
            ? (roccoKeptUglyJuice ? `${awayLineDisp} · [red]ugly juice[/red]` : awayLineDisp)
            : roccoPassedUglyJuice
              ? `PASS (ugly juice worse than ${ROCCO_UGLY_JUICE_WORSE_THAN})`
              : 'PASS (no short-fav / hurt / hook / pasted chalk-trap)',
        pickPrice: roccoSide === 'home' ? homePrice : roccoSide === 'away' ? awayPrice : 0,
        pick: roccoSide === 'home' ? homePickObj : roccoSide === 'away' ? awayPickObj : homePickObj,
        countsForHouse: roccoCountsForHouse,
        uglyJuice: roccoKeptUglyJuice || roccoPassedUglyJuice,
      },
      Chedda: {
        side: cheddaSide,
        teamName: cheddaSide === 'home' ? homeTeam : cheddaSide === 'away' ? awayTeam : 'PASS',
        lineDisplay: cheddaSide === 'home'
          ? homeLineDisp
          : cheddaSide === 'away'
            ? awayLineDisp
            : 'PASS (no dog+hook / dog+PVAL / pasted money)',
        pickPrice: cheddaSide === 'home' ? homePrice : cheddaSide === 'away' ? awayPrice : 0,
        pick: cheddaSide === 'home' ? homePickObj : cheddaSide === 'away' ? awayPickObj : homePickObj,
        countsForHouse: cheddaSide !== 'pass',
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
        countsForHouse: false, // totals desk … never fills ATS house buckets
      },
    }

    // House tally: ATS desks only, and Rocco only when he has an independent strength reason.
    let homeVotes = 0
    let awayVotes = 0
    let activeSideVotes = 0
    for (const p of ATS_SIDE_DESKS) {
      const pp = pickerPicks[p]
      if (pp.countsForHouse === false) continue
      const side = pp.side
      if (side === 'home') {
        homeVotes++
        activeSideVotes++
      } else if (side === 'away') {
        awayVotes++
        activeSideVotes++
      }
    }

    let consensusType: 'hammer' | 'consensus' | 'majority_split' | 'split' | 'solo' | 'pass_only' = 'pass_only'
    let badgeText = '— All pass'
    let consensusSide: 'home' | 'away' = 'home'
    let voteCount = 0

    if (activeSideVotes === 0) {
      consensusType = 'pass_only'
      badgeText = '⏭️ All pass'
      consensusSide = 'home'
      voteCount = 0
    } else if (activeSideVotes === 1) {
      consensusType = 'solo'
      consensusSide = homeVotes === 1 ? 'home' : 'away'
      voteCount = 1
      badgeText = '🎯 Solo'
    } else if (homeVotes >= 1 && awayVotes >= 1) {
      consensusSide = homeVotes >= awayVotes ? 'home' : 'away'
      voteCount = Math.max(homeVotes, awayVotes)
      if (voteCount >= 2) {
        consensusType = 'majority_split'
        badgeText = '⚔️ 2-1 House Divided'
      } else {
        consensusType = 'split'
        badgeText = '⚖️ 1-1 Split'
        voteCount = 1
      }
    } else {
      consensusSide = homeVotes > 0 ? 'home' : 'away'
      voteCount = activeSideVotes
      const unanimousActive =
        activeSideVotes >= 2 && (homeVotes === activeSideVotes || awayVotes === activeSideVotes)
      if (unanimousActive) {
        const scottAgrees = scottSide === consensusSide
        const roccoIndependent = roccoSide === consensusSide && roccoHasStrengthReason
        const cheddaIndependent = cheddaSide === consensusSide
        const hammerOk =
          activeSideVotes >= 3
          && scottAgrees
          && (roccoIndependent || cheddaIndependent)
        if (hammerOk) {
          consensusType = 'hammer'
          badgeText = `🔥 ${activeSideVotes}-0 Hammer`
        } else {
          consensusType = 'consensus'
          badgeText = activeSideVotes >= 3 ? '🎯 3-0 Aligned' : '🎯 2-0 Consensus'
          if (activeSideVotes === 2) voteCount = 2
        }
      } else {
        consensusType = 'consensus'
        badgeText = '🎯 2-0 Consensus'
      }
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
      sideModifier,
      adjustedModelSpreadHome,
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
    else if (consensusType === 'majority_split') majoritySplits.push(gamePick)
    else if (consensusType === 'split') splits.push(gamePick)
    else if (consensusType === 'solo') solos.push(gamePick)
    else if (consensusType === 'pass_only') passOnlyGames.push(gamePick)
  }

  if (games.length === 0) return null

  const title = opts.cardTitle || (opts.sportKey === 'americanfootball_ncaaf' ? '🏈 College Football Sharpe Syndicate Slate' : '🏈 NFL Sharpe Syndicate Slate')

  return {
    cardTitle: title,
    sportKey: opts.sportKey || 'americanfootball_nfl',
    games,
    hammers,
    consensus,
    majoritySplits,
    splits,
    solos,
    passOnly: passOnlyGames,
  }
}

/**
 * Publish NFL / CFB slate:
 * - Public Lounge teaser (capped) as Syndicate when that bot exists
 * - Fan-only Lounge full card (thread of desk lists) when monetization is live
 * - Plain-text full desks into the publisher's fan chat (Syndicate room, never Signal VIP)
 * Ledger rows attach to the private post when available, else the public teaser.
 */
export async function publishAndRecordNflSlateCard(
  admin: SupabaseClient,
  input: {
    botUserId: string
    card: NflSlateCard
    categoryPills?: string[]
  },
): Promise<{
  success: boolean
  postId?: string
  publicPostId?: string
  privatePostId?: string | null
  publisherMode?: string
  totalPicksRecorded: number
  error?: string
}> {
  if (!input.card || !input.card.games.length) {
    return { success: false, totalPicksRecorded: 0, error: 'Empty slate card.' }
  }

  const publisher = await resolveSlatePublisher(admin, input.botUserId)
  const botUserId = publisher.botUserId
  const categoryPills = input.categoryPills || ['sports']
  const publicCaption = formatNflSlateCardCaption(input.card)

  const publicRes = await publishLoungeBotPost(admin, {
    botUserId,
    caption: publicCaption,
    categoryPills,
  })

  if (publicRes.error || !publicRes.postId) {
    return {
      success: false,
      totalPicksRecorded: 0,
      publisherMode: publisher.mode,
      error: publicRes.error || 'Failed to publish public teaser',
    }
  }

  let privatePostId: string | null = null
  let privatePublishNote: string | null = null
  if (publisher.mode === 'syndicate') {
    const fullPrivateCaption = formatNflSlatePrivateRootCaption(input.card)
    const captionChunks = splitSlateCaptionToFit(fullPrivateCaption, LOUNGE_BOT_CAPTION_MAX)
    const rootCaption = captionChunks[0] || fullPrivateCaption
    const overflowThread = captionChunks.slice(1).map((body) => ({ body }))
    const deskThread = SHARP_PICKERS.map((p) => ({
      body: formatPickerSlateList(input.card, p),
    }))
    const privateRes = await publishLoungeBotPostWithThread(admin, {
      botUserId,
      caption: rootCaption,
      categoryPills,
      creatorFanOnly: true,
      threadParts: [...overflowThread, ...deskThread],
    })
    if (privateRes.error || !privateRes.postId) {
      privatePublishNote = privateRes.error || 'Fan-only full card failed'
      console.error('Syndicate fan-only slate failed:', privatePublishNote)
    } else {
      privatePostId = privateRes.postId
    }
  }

  const ledgerPostId = privatePostId || publicRes.postId

  const rowsToInsert: any[] = []
  for (const g of input.card.games) {
    const gameBucket = mapConsensusTypeToBucket(g.consensusPick.type)
    for (const pName of SHARP_PICKERS) {
      const pPick = g.pickerPicks[pName]

      // Side/totals PASS → cancelled ledger row (Pass bucket sample size).
      if ((pName === 'Scott' || pName === 'Rocco' || pName === 'Chedda' || pName === 'Tank') && pPick.side === 'pass') {
        rowsToInsert.push({
          bot_user_id: botUserId,
          picker_name: pName,
          post_id: ledgerPostId,
          event_id: g.eventId,
          sport_key: g.sportKey,
          home_team: g.homeTeam,
          away_team: g.awayTeam,
          commence_time: g.commenceTime,
          market_key: pName === 'Tank' ? 'totals' : 'spreads',
          pick_name: 'PASS',
          pick_line: null,
          pick_price: -110,
          book_title: null,
          status: 'cancelled',
          units_net: 0,
          resolved_at: new Date().toISOString(),
          metadata: {
            bucket: 'pass',
            lane: pName === 'Tank' ? 'totals' : 'sides',
            side: 'pass',
            consensus_type: g.consensusPick.type,
            vote_count: g.consensusPick.voteCount,
          },
        })
        continue
      }

      // Situational factor tagging for Bayesian learning
      const factors: string[] = []
      const isShortFav = Number(pPick.pick.linePoint) <= -1 && Number(pPick.pick.linePoint) >= -4
      const isSweetDog = Number(pPick.pickPrice) >= 130 && Number(pPick.pickPrice) <= 175
      const isKey3 = Math.abs(Number(pPick.pick.linePoint)) === 3

      if (isShortFav) factors.push('short_favorites_1_to_4')
      if (isSweetDog) factors.push('dog_sweet_spot_130_175')
      if (isKey3) factors.push('key_number_3_value')
      if (pName === 'Scott') factors.push('model_clv_high_ev')
      if (pName === 'Scott' && g.sideModifier?.isSignificant) factors.push('qb_injury_side_mod')
      if (pName === 'Tank') factors.push('totals_model_edge')
      if (g.splits?.isRlm) factors.push('reverse_line_movement')
      if (g.splits?.isSharpDivergence) factors.push('sharp_money_divergence')
      if (g.trenchEpa?.isTrenchMismatch) factors.push('trench_mismatch_advantage')
      if (g.trenchEpa?.isEpaMismatch) factors.push('epa_model_value')

      const isTankTotals = pName === 'Tank' && (pPick.side === 'over' || pPick.side === 'under')
      rowsToInsert.push({
        bot_user_id: botUserId,
        picker_name: pName,
        post_id: ledgerPostId,
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
          bucket: gameBucket,
          lane: isTankTotals ? 'totals' : 'sides',
          consensus_type: g.consensusPick.type,
          vote_count: g.consensusPick.voteCount,
          splits: g.splits ? {
            home_ticket: g.splits.homeTicketPct,
            home_handle: g.splits.homeHandlePct,
            is_rlm: g.splits.isRlm,
            is_sharp_divergence: g.splits.isSharpDivergence,
            is_pasted: g.splits.isPasted === true,
            source: g.splits.source || null,
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
      postId: ledgerPostId,
      publicPostId: publicRes.postId,
      privatePostId,
      publisherMode: publisher.mode,
      totalPicksRecorded: 0,
      error: `Published post, but ledger insert failed: ${pickErr.message}`,
    }
  }

  await syncBotProfileHighlight(admin, botUserId)

  // Plain-text full desks → publisher fan room (Syndicate when remounted; never Signal once Syndicate exists)
  try {
    const threadParts = SHARP_PICKERS.map((p) => formatPickerSlateList(input.card, p))
    const chatTitle =
      publisher.mode === 'syndicate'
        ? `🏈 ${input.card.cardTitle || 'Sharpe Syndicate Slate'} ... Full Uncut Desk Cards\n\nPlain-text cards for every desk on this slate 👇`
        : `🏈 ${input.card.cardTitle || 'Sharpe Syndicate Slate'} ... Full Uncut Breakdown\n\nPublic feed gets the consensus & hammer teasers. Here are the uncut individual ATS cards across all 4 desks for the full slate 👇`
    await publishBotSubChatMessage(admin, {
      botUserId,
      caption: chatTitle,
      threadParts,
    })
  } catch (vipErr) {
    console.error('Error posting slate to fan sub chat:', vipErr)
  }

  return {
    success: true,
    postId: ledgerPostId,
    publicPostId: publicRes.postId,
    privatePostId,
    publisherMode: publisher.mode,
    totalPicksRecorded: insertedRows?.length || 0,
    ...(privatePublishNote ? { fanOnlyWarning: privatePublishNote } : {}),
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

  // Prefetch market-file closes for CLV on this grade batch
  const pendingEventIds = [...new Set(pendingPicks.map((p: { event_id: string }) => p.event_id).filter(Boolean))]
  const closeByEvent = new Map<string, { close_locked: boolean; close_spread_home: number | null; close_total: number | null }>()
  if (pendingEventIds.length > 0) {
    const chunkSize = 80
    for (let i = 0; i < pendingEventIds.length; i += chunkSize) {
      const chunk = pendingEventIds.slice(i, i + chunkSize)
      const { data: mfiles } = await admin
        .from('lounge_market_files')
        .select('event_id, close_locked, close_spread_home, close_total')
        .in('event_id', chunk)
      for (const row of mfiles || []) {
        closeByEvent.set(row.event_id, row)
      }
    }
  }

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

        // CLV vs market-file close (when locked) … persist for monthly scoreboard
        const mfile = closeByEvent.get(pick.event_id) || null
        const clvPts = computePickClvPts(pick, mfile)
        const clvMeta = clvPts != null
          ? {
              clv_pts: Math.round(clvPts * 100) / 100,
              clv_beat: clvPts > 0,
              close_spread_home: mfile?.close_spread_home ?? null,
              close_total: mfile?.close_total ?? null,
              close_locked: mfile?.close_locked ?? false,
            }
          : {}

        await admin
          .from('lounge_bot_picks')
          .update({
            status: grade.status,
            home_score: homeScore,
            away_score: awayScore,
            units_net: grade.unitsNet,
            resolved_at: new Date().toISOString(),
            metadata: {
              ...(pick.metadata || {}),
              ...clvMeta,
            },
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
