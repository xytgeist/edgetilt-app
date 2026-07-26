/**
 * Coffee & Covers — Scott Sharpe morning roundup.
 * Root post: covers (+ optional ML spots) and a thread teaser.
 * Best lines board lives in thread parts (one per calendar sport).
 */

import {
  DEFAULT_MAX_EV_PCT,
  DEFAULT_MIN_BOOKS,
  extractSlateGameBestLines,
  findPlusEvOpportunities,
  formatAmericanOdds,
  formatBookDisplayName,
  formatOddsCommenceTimeShort,
  type OddsEvent,
  type OddsPick,
} from './loungeBotOddsCaption.ts'
import { effectiveMinEvPct } from './loungeBotSportAnalysis.ts'
import {
  fetchRundownContextNotesForPicks,
  rundownEventKey,
} from './loungeBotRundownContext.ts'
import { type EventLineRow } from './loungeBotLineMovement.ts'
import { maybeFilterNcaabCoffeeEvents } from './loungeBotNcaabCoffeeFilter.ts'
import { filterBoxingCoffeeMainCardEvents, isBoxingCoffeeSport } from './loungeBotBoxingCoffeeFilter.ts'
import {
  compareByCoverageThenEv,
} from './loungeBotCoverageScope.ts'
import {
  COFFEE_MORE_SOCCER_THREAD_LABEL,
  COFFEE_SOCCER_THREAD_HEADER,
  COFFEE_SECONDARY_SOCCER_THREAD_HEADER,
  COFFEE_TOP_SOCCER_THREAD_HEADER,
  aggregateCoffeeBestLinesSliceStats,
  buildCoffeeBestLinesThreadCandidateMeta,
  coffeeBestLinesRankForSport,
  coffeeSecondarySoccerSortOrder,
  coffeeTopTierSoccerSortOrder,
  isCoffeeSecondarySoccerKey,
  isCoffeeTopTierSoccerKey,
  selectCoffeeBestLinesThreadCandidates,
  shouldIncludeCoffeeBestLinesThreadPart,
  type CoffeeBestLinesThreadCandidateMeta,
} from './loungeBotCoffeeBestLinesPriority.ts'

/** Min +EV % on $1 for ML spots in the morning post. */
export const COFFEE_ML_EV_THRESHOLD_PCT = 3
/** Min +EV % on $1 for spread "cover" picks. */
export const COFFEE_SPREAD_EV_THRESHOLD_PCT = 4
/** Max cover or ML highlights per sport in one post. */
export const COFFEE_MAX_PICKS_PER_SPORT = 3

export const COFFEE_COVERS_HEADER = '☕ Coffee & Covers 💵'
/** Min +EV % for a spread/total to qualify as the featured lean (Option 1). */
export const COFFEE_FEATURED_SPREAD_MIN_EV_PCT = COFFEE_SPREAD_EV_THRESHOLD_PCT
/** Min +EV % for ML to count as a "real" board (not thin) for voice selection. */
export const COFFEE_FEATURED_ML_MIN_EV_PCT = 3.5
/** PT hour (0–23) before which a tip counts as "early morning" for featured spread tie-break. */
export const COFFEE_EARLY_MORNING_PT_HOUR = 11
export const COFFEE_FEATURED_SECTION = '🎯 Best cover on the board today:'
export const COFFEE_FEATURED_ML_SECTION = '🎯 Best lean on the board today:'
export const COFFEE_RADAR_SECTION = '👀 Other spots on my radar:'
export const COFFEE_DOG_SECTION = '🐕 Dog of the Day:'
export const COFFEE_THREAD_TEASER = 'Best lines by sport below 👇'
export const COFFEE_THREAD_TEASER_THIN = COFFEE_THREAD_TEASER
export const COFFEE_THIN_BOARD_LEAD = 'Rest of the board is pretty thin.'
export const COFFEE_NO_LEAN_LINE =
  'Board\'s thin today ... sitting on my hands until we see better value.'
/** @deprecated parent post no longer lists ML section */
export const COFFEE_NO_COVERS_LINE = COFFEE_NO_LEAN_LINE
/** @deprecated parent post uses radar section */
export const COFFEE_ML_SECTION = '- Best ML Spots Right Now -'
/** @deprecated */
export const COFFEE_DOGS_SECTION = COFFEE_DOG_SECTION
/** @deprecated On Tap removed from parent post */
export const COFFEE_ON_TAP_SECTION = '- 🍺 On Tap Tomorrow -'
/** @deprecated */
export const COFFEE_BEST_LINES_TEASER = COFFEE_THREAD_TEASER
/** Max radar spots in the structured (Option 1) parent post. */
export const COFFEE_RADAR_MAX_SPOTS = 3
/** @deprecated */
export const COFFEE_THIN_COVER_LINE = 'Top +EV spreads on the board:'
/** @deprecated */
export const COFFEE_THIN_ML_LINE = 'Top +EV moneylines on the board:'
/** Max ML spots listed in the combined morning post (global, sorted by EV). */
export const COFFEE_ML_SPOTS_MAX_TOTAL = 8
/** Max tomorrow lookahead calls in the morning post. */
export const COFFEE_ON_TAP_MAX_PICKS = 3
/** Include tomorrow picks within this many % of the spread/ML bar. */
export const COFFEE_ON_TAP_NEAR_THRESHOLD_PCT = 1
/** Min +EV % for below-bar Coffee fallback (still +EV only, never negative). */
export const COFFEE_FALLBACK_MIN_EV_PCT = 0

const CAPTION_MAX = 2000

/** @deprecated use COFFEE_TOP_TIER_SOCCER_KEYS from loungeBotCoffeeBestLinesPriority.ts */
export { COFFEE_TOP_TIER_SOCCER_KEYS } from './loungeBotCoffeeBestLinesPriority.ts'

/** Calendar label → thread part header emoji (Coffee & Covers best-lines threads). */
const SPORT_THREAD_EMOJI_BY_LABEL: Record<string, string> = {
  'world cup': '⚽',
  mlb: '⚾',
  wnba: '🏀',
  nba: '🏀',
  'march madness': '🏀',
  nfl: '🏈',
  'nfl preseason': '🏈',
  ncaaf: '🏈',
  wimbledon: '🎾',
  'us open tennis': '🎾',
  nhl: '🏒',
  pga: '⛳',
}

const SPORT_THREAD_EMOJI_BY_ODDS_PREFIX: [string, string][] = [
  ['soccer_', '⚽'],
  ['baseball_', '⚾'],
  ['basketball_', '🏀'],
  ['americanfootball_', '🏈'],
  ['tennis_', '🎾'],
  ['icehockey_', '🏒'],
  ['golf_', '⛳'],
]

/** Emoji prefix for Coffee & Covers thread part headers (e.g. "🎾 Wimbledon"). */
export function sportThreadEmojiForCategory(categoryLabel: string, sportKey?: string): string {
  const label = String(categoryLabel || '').trim().toLowerCase()
  if (label && SPORT_THREAD_EMOJI_BY_LABEL[label]) return SPORT_THREAD_EMOJI_BY_LABEL[label]!
  if (label.includes('world cup') || label.includes('soccer')) return '⚽'
  if (label.includes('wimbledon') || label.includes('tennis')) return '🎾'
  if (label.includes('march madness') || label.includes('ncaab')) return '🏀'
  if (label.includes('wnba') || label.includes('nba')) return '🏀'
  if (label.includes('mlb') || label.includes('baseball')) return '⚾'
  if (label.includes('nhl') || label.includes('hockey')) return '🏒'
  if (label.includes('pga') || label.includes('golf')) return '⛳'
  if (label.includes('nfl') || label.includes('ncaaf') || label.includes('football')) return '🏈'

  const sk = String(sportKey || '').trim().toLowerCase()
  for (const [prefix, emoji] of SPORT_THREAD_EMOJI_BY_ODDS_PREFIX) {
    if (sk.startsWith(prefix)) return emoji
  }
  return ''
}

export function formatSportThreadHeader(categoryLabel: string, sportKey?: string): string {
  const label = String(categoryLabel || '').trim()
  if (!label) return ''
  const emoji = sportThreadEmojiForCategory(label, sportKey)
  return emoji ? `${emoji} ${label}` : label
}

type Outcome = { name?: string; price?: number; point?: number }
type Market = { key?: string; outcomes?: Outcome[] }
type Bookmaker = { key?: string; title?: string; markets?: Market[] }

export type SpreadPick = {
  sportKey: string
  eventId: string
  homeTeam: string
  awayTeam: string
  commenceTime: string
  pickName: string
  pickPoint: number
  pickPrice: number
  bookTitle: string
  consensusPrice: number
  edgePct: number
  bookCount: number
}

export type CoffeeAndCoversOptions = {
  categoryLabel: string
  sportKey: string
  events: OddsEvent[]
  /** Tomorrow (PT) games for On tap lookahead. */
  eventsTomorrow?: OddsEvent[]
  minBooks?: number
  mlEvThresholdPct?: number
  spreadEvThresholdPct?: number
  maxPicksPerSport?: number
  maxEvPct?: number
  onTapMaxPicks?: number
  onTapNearThresholdPct?: number
  /** Prior poll snapshot for NCAAB line-movement tier (optional). */
  previousEventLines?: EventLineRow[]
}

export type CoffeeThreadPart = {
  categoryLabel: string
  body: string
}

export type BiggestDog = {
  categoryLabel: string
  pickName: string
  awayTeam: string
  homeTeam: string
  commenceTime: string
  pickPrice: number
  bookTitle: string
  sportKey?: string
}

/** @deprecated use BiggestDog */
export type DogOfTheDay = BiggestDog

export type OnTapPick =
  | { kind: 'spread'; categoryLabel: string; pick: SpreadPick; edgePct: number }
  | { kind: 'ml'; categoryLabel: string; pick: OddsPick; edgePct: number }

export type CoffeeAndCoversResult = {
  /** Root post caption (covers + teaser only). */
  caption: string
  threadParts: CoffeeThreadPart[]
  coverPicks: SpreadPick[]
  mlPicks: OddsPick[]
  biggestDogs: BiggestDog[]
  /** @deprecated use biggestDogs */
  dogOfTheDay: BiggestDog | null
  onTapPicks: OnTapPick[]
  gameCount: number
  hasCovers: boolean
}

function shortDisplayName(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return parts[0] || ''
  return parts[parts.length - 1]!
}

function americanToImplied(price: number): number {
  if (!Number.isFinite(price) || price === 0) return 0
  if (price > 0) return 100 / (price + 100)
  return Math.abs(price) / (Math.abs(price) + 100)
}

function americanProfitIfWin(price: number, stake = 1): number {
  if (!Number.isFinite(price) || price === 0 || stake <= 0) return 0
  if (price > 0) return (price / 100) * stake
  return (100 / Math.abs(price)) * stake
}

function computeEvDecimal(consensusProb: number, americanPrice: number, stake = 1): number {
  if (!Number.isFinite(consensusProb) || consensusProb <= 0 || consensusProb >= 1) return 0
  const profit = americanProfitIfWin(americanPrice, stake)
  return consensusProb * profit - (1 - consensusProb) * stake
}

function impliedToAmerican(prob: number): number {
  if (!Number.isFinite(prob) || prob <= 0 || prob >= 1) return 0
  if (prob >= 0.5) return Math.round(-100 * prob / (1 - prob))
  return Math.round(100 * (1 - prob) / prob)
}

function average(nums: number[]): number {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function spreadOutcomeKey(name: string, point: number): string {
  return `${name}|${point.toFixed(1)}`
}

function devigFairProbsForSpread(market: Market): Map<string, number> | null {
  const implied = new Map<string, number>()
  for (const out of market.outcomes || []) {
    const name = String(out.name || '').trim()
    const price = Number(out.price)
    const point = Number(out.point)
    if (!name || !Number.isFinite(price) || !Number.isFinite(point)) continue
    const imp = americanToImplied(price)
    if (imp <= 0 || imp >= 1) continue
    implied.set(spreadOutcomeKey(name, point), imp)
  }
  if (implied.size < 2) return null
  const sum = [...implied.values()].reduce((a, b) => a + b, 0)
  if (sum <= 0) return null
  const fair = new Map<string, number>()
  for (const [key, imp] of implied) {
    fair.set(key, imp / sum)
  }
  return fair
}

function formatSpreadPoint(point: number): string {
  if (!Number.isFinite(point)) return ''
  const rounded = Math.round(point * 2) / 2
  return rounded > 0 ? `+${rounded}` : String(rounded)
}

function joinCaptionLines(lines: string[]): string {
  const cap = lines.join('\n').trim()
  return cap.length <= CAPTION_MAX ? cap : `${cap.slice(0, CAPTION_MAX - 3)}...`
}

function formatPickNameLabel(name: string): string {
  const n = String(name || '').trim()
  if (/^draw$|^tie$/i.test(n)) return 'Draw'
  return shortDisplayName(n)
}

function formatEvSuffix(edgePct: number): string {
  const ev = Math.round(edgePct * 10) / 10
  return `(+${ev}% EV)`
}

function strictlyPlusEvSpreads(picks: SpreadPick[]): SpreadPick[] {
  return picks.filter((p) => p.edgePct > 0)
}

function strictlyPlusEvMl(picks: OddsPick[]): OddsPick[] {
  return picks.filter((p) => p.edgePct > 0)
}

function formatMatchupTeams(awayTeam: string, homeTeam: string): string {
  return `${shortDisplayName(awayTeam)} vs ${shortDisplayName(homeTeam)}`
}

function formatCoverBulletLines(
  pick: SpreadPick,
  categoryLabel: string,
  contextNote?: string,
): string[] {
  const when = formatOddsCommenceTimeShort(pick.commenceTime)
  const team = formatPickNameLabel(pick.pickName)
  const spread = formatSpreadPoint(pick.pickPoint)
  const juice = formatAmericanOdds(pick.pickPrice)
  const label = String(categoryLabel || '').trim()
  const head = label
    ? `• ${label} - ${formatMatchupTeams(pick.awayTeam, pick.homeTeam)} (${when})`
    : `• ${formatMatchupTeams(pick.awayTeam, pick.homeTeam)} (${when})`
  const lines = [
    head,
    `${team} ${spread} (${juice}) @ ${pick.bookTitle} ${formatEvSuffix(pick.edgePct)}`,
  ]
  if (contextNote?.trim()) lines.push(contextNote.trim())
  return lines
}

function formatMlSpotBulletLines(
  pick: OddsPick,
  categoryLabel: string,
  contextNote?: string,
): string[] {
  const when = formatOddsCommenceTimeShort(pick.commenceTime)
  const team = formatPickNameLabel(pick.pickName)
  const odds = formatAmericanOdds(pick.pickPrice)
  const label = String(categoryLabel || '').trim()
  const head = label
    ? `• ${label} - ${formatMatchupTeams(pick.awayTeam, pick.homeTeam)} (${when})`
    : `• ${formatMatchupTeams(pick.awayTeam, pick.homeTeam)} (${when})`
  const lines = [
    head,
    `${team} ML ${odds} @ ${pick.bookTitle} ${formatEvSuffix(pick.edgePct)}`,
  ]
  if (contextNote?.trim()) lines.push(contextNote.trim())
  return lines
}

function formatBiggestDogBulletLines(dog: BiggestDog, contextNote?: string): string[] {
  const when = formatOddsCommenceTimeShort(dog.commenceTime)
  const pickLabel = formatPickNameLabel(dog.pickName)
  const odds = formatAmericanOdds(dog.pickPrice)
  const lines = [
    `• ${dog.categoryLabel} - ${formatMatchupTeams(dog.awayTeam, dog.homeTeam)} (${when})`,
    `${pickLabel} ML ${odds} @ ${dog.bookTitle}`,
  ]
  if (contextNote?.trim()) lines.push(contextNote.trim())
  return lines
}

function isPlusMoneyUnderdogOutcome(name: string, price: number): boolean {
  if (!Number.isFinite(price) || price <= 0) return false
  return !/^draw$|^tie$/i.test(String(name || '').trim())
}

/**
 * Longest plus-money ML on today's board for one calendar sport (biggest underdog).
 */
export function findBiggestDog(
  categoryLabel: string,
  events: OddsEvent[],
  sportKey = '',
): BiggestDog | null {
  const label = String(categoryLabel || '').trim()
  if (!label) return null

  let best: BiggestDog | null = null

  for (const ev of events) {
    const home = String(ev.home_team || 'Home').trim()
    const away = String(ev.away_team || 'Away').trim()
    const commenceTime = String(ev.commence_time || '').trim()
    if (!home || !away || !commenceTime) continue

    for (const book of ev.bookmakers || []) {
      const market = (book.markets || []).find((m) => m.key === 'h2h')
      if (!market) continue
      const bookLabel = formatBookDisplayName(String(book.title || ''), book.key)

      for (const out of market.outcomes || []) {
        const name = String(out.name || '').trim()
        const price = Number(out.price)
        if (!isPlusMoneyUnderdogOutcome(name, price)) continue
        if (!best || price > best.pickPrice) {
          best = {
            categoryLabel: label,
            pickName: name,
            awayTeam: away,
            homeTeam: home,
            commenceTime,
            pickPrice: price,
            bookTitle: bookLabel,
            sportKey: sportKey || undefined,
          }
        }
      }
    }
  }

  return best
}

/** @deprecated use findBiggestDog */
export function findDogOfTheDay(
  categoryLabel: string,
  sportKey: string,
  events: OddsEvent[],
): BiggestDog | null {
  return findBiggestDog(categoryLabel, events, sportKey)
}

function pickTopSpreadCovers(
  events: OddsEvent[],
  sportKey: string,
  opts: {
    minBooks?: number
    maxEvPct?: number
    thresholdPct: number
    limit: number
  },
): { picks: SpreadPick[]; metBar: boolean } {
  const base = {
    minBooks: opts.minBooks,
    maxEvPct: opts.maxEvPct,
  }
  const qualified = findPlusEvSpreadOpportunities(events, sportKey, {
    ...base,
    minEvPct: opts.thresholdPct,
  })
  if (qualified.length) {
    return { picks: qualified.slice(0, opts.limit), metBar: true }
  }
  const fallback = strictlyPlusEvSpreads(findPlusEvSpreadOpportunities(events, sportKey, {
    ...base,
    minEvPct: COFFEE_FALLBACK_MIN_EV_PCT,
  }))
  return { picks: fallback.slice(0, opts.limit), metBar: false }
}

function pickTopMlSpots(
  events: OddsEvent[],
  sportKey: string,
  opts: {
    minBooks?: number
    maxEvPct?: number
    thresholdPct: number
    limit: number
  },
): { picks: OddsPick[]; metBar: boolean } {
  const base = {
    minBooks: opts.minBooks,
    maxEvPct: opts.maxEvPct,
  }
  const qualified = findPlusEvOpportunities(events, sportKey, {
    ...base,
    minEvPct: opts.thresholdPct,
  })
  if (qualified.length) {
    return { picks: qualified.slice(0, opts.limit), metBar: true }
  }
  const fallback = strictlyPlusEvMl(findPlusEvOpportunities(events, sportKey, {
    ...base,
    minEvPct: COFFEE_FALLBACK_MIN_EV_PCT,
  }))
  return { picks: fallback.slice(0, opts.limit), metBar: false }
}

function formatOnTapBulletLine(entry: OnTapPick): string {
  const label = entry.categoryLabel
  const matchup = formatMatchupTeams(
    entry.kind === 'spread' ? entry.pick.awayTeam : entry.pick.awayTeam,
    entry.kind === 'spread' ? entry.pick.homeTeam : entry.pick.homeTeam,
  )
  const ev = formatEvSuffix(entry.edgePct)
  if (entry.kind === 'spread') {
    const team = formatPickNameLabel(entry.pick.pickName)
    const spread = formatSpreadPoint(entry.pick.pickPoint)
    const juice = formatAmericanOdds(entry.pick.pickPrice)
    return `• ${label} - ${matchup}: ${team} ${spread} (${juice}) @ ${entry.pick.bookTitle} ${ev}`
  }
  const team = formatPickNameLabel(entry.pick.pickName)
  const odds = formatAmericanOdds(entry.pick.pickPrice)
  return `• ${label} - ${matchup}: ${team} ML ${odds} @ ${entry.pick.bookTitle} ${ev}`
}

/** Tomorrow spread/ML spots at or near the Coffee & Covers bars. */
export function findOnTapPicks(input: CoffeeAndCoversOptions): OnTapPick[] {
  const categoryLabel = String(input.categoryLabel || '').trim()
  const sportKey = String(input.sportKey || '').trim()
  const events = Array.isArray(input.eventsTomorrow) ? input.eventsTomorrow : []
  if (!events.length || !categoryLabel || !sportKey) return []

  const minBooks = input.minBooks ?? DEFAULT_MIN_BOOKS
  const mlThreshold = input.mlEvThresholdPct ?? COFFEE_ML_EV_THRESHOLD_PCT
  const spreadThreshold = input.spreadEvThresholdPct ?? COFFEE_SPREAD_EV_THRESHOLD_PCT
  const near = input.onTapNearThresholdPct ?? COFFEE_ON_TAP_NEAR_THRESHOLD_PCT
  const maxEvPct = input.maxEvPct ?? DEFAULT_MAX_EV_PCT

  const spreadMin = Math.max(0, spreadThreshold - near)
  const mlMin = Math.max(0, mlThreshold - near)

  const spreads = findPlusEvSpreadOpportunities(events, sportKey, {
    minBooks,
    minEvPct: spreadMin,
    maxEvPct,
  })
  const mls = findPlusEvOpportunities(events, sportKey, {
    minBooks,
    minEvPct: mlMin,
    maxEvPct,
  })

  const merged: OnTapPick[] = [
    ...spreads.map((pick) => ({
      kind: 'spread' as const,
      categoryLabel,
      pick,
      edgePct: pick.edgePct,
    })),
    ...mls.map((pick) => ({
      kind: 'ml' as const,
      categoryLabel,
      pick,
      edgePct: pick.edgePct,
    })),
  ]

  merged.sort((a, b) => b.edgePct - a.edgePct)
  return merged
}

function mergeOnTapPicks(slices: OnTapPick[][]): OnTapPick[] {
  const merged = slices.flat()
  merged.sort((a, b) => b.edgePct - a.edgePct)
  return merged.slice(0, COFFEE_ON_TAP_MAX_PICKS)
}

function formatSlateGameBlock(game: ReturnType<typeof extractSlateGameBestLines>[number]): string {
  const away = shortDisplayName(game.awayTeam)
  const home = shortDisplayName(game.homeTeam)
  const when = formatOddsCommenceTimeShort(game.commenceTime)
  const head = when ? `${away} vs ${home} (${when})` : `${away} vs ${home}`
  const oddsLine = game.picks
    .map((p) => `${p.label} ${formatAmericanOdds(p.price)} (${p.book})`)
    .join(', ')
  return `${head}\n${oddsLine}`
}

/** Thread body: sport header + today's best lines for every game (truncates at cap). */
export function buildSportLinesThreadBody(
  categoryLabel: string,
  events: OddsEvent[],
  sportKey?: string,
  totalUnfiltered?: number,
): string {
  const label = String(categoryLabel || '').trim()
  const games = extractSlateGameBestLines(events)
  if (!games.length || !label) return ''

  const isBoxing = isBoxingCoffeeSport(String(sportKey || ''), label)
  const omittedLine = (slateTotal: number, includedCount: number) => {
    const omitted = slateTotal - includedCount
    if (omitted <= 0) return ''
    if (isBoxing) return boxingThreadOmittedLabel(slateTotal, includedCount)
    return `+${omitted} more games today.`
  }

  const lines: string[] = [formatSportThreadHeader(label, sportKey), '']
  let included = 0

  for (let i = 0; i < games.length; i++) {
    const trialLines = [...lines, formatSlateGameBlock(games[i]), '']
    const slateTotal = totalUnfiltered ?? games.length
    const tail = omittedLine(slateTotal, i + 1)
    if (tail) trialLines.push(tail)
    if (joinCaptionLines(trialLines).length <= CAPTION_MAX) {
      included = i + 1
    } else if (included === 0 && i === 0) {
      included = 1
      break
    } else {
      break
    }
  }

  for (let i = 0; i < included; i++) {
    lines.push(formatSlateGameBlock(games[i]))
    lines.push('')
  }

  const tail = omittedLine(totalUnfiltered ?? games.length, included)
  if (tail) lines.push(tail)

  return joinCaptionLines(lines)
}

function boxingThreadOmittedLabel(totalBefore: number, included: number): string {
  const omitted = totalBefore - included
  if (omitted <= 0) return ''
  return `+${omitted} more undercard fight${omitted === 1 ? '' : 's'} today.`
}

/** One thread part for a bucket of soccer leagues (top tier or secondary). */
function buildCombinedSoccerThreadBody(
  slices: SportCoffeeSlice[],
  header: string,
  sortOrder: (sportKey: string) => number,
  omittedLabel = 'soccer',
): string {
  const sorted = [...slices]
    .filter((s) => s.gameCount > 0 && s.categoryLabel)
    .sort((a, b) => sortOrder(a.sportKey) - sortOrder(b.sportKey))

  if (!sorted.length) return ''

  const leagueSections = sorted.map((slice) => ({
    label: slice.categoryLabel,
    games: extractSlateGameBestLines(slice.events),
    slateTotal: slice.totalBefore ?? extractSlateGameBestLines(slice.events).length,
  }))

  const lines: string[] = [header, '']
  let omittedGames = 0

  for (const section of leagueSections) {
    if (!section.games.length) continue

    const sectionHeader = [section.label, '']
    let includedInSection = 0

    for (let i = 0; i < section.games.length; i++) {
      const trial = [...lines, ...sectionHeader]
      for (let j = 0; j <= i; j++) {
        trial.push(formatSlateGameBlock(section.games[j]!))
        trial.push('')
      }
      const remaining = section.slateTotal - (i + 1)
      if (remaining > 0) trial.push(`+${remaining} more ${section.label} games today.`)
      if (joinCaptionLines(trial).length <= CAPTION_MAX) {
        includedInSection = i + 1
      } else if (includedInSection === 0 && i === 0) {
        includedInSection = 1
        break
      } else {
        break
      }
    }

    if (includedInSection <= 0) {
      omittedGames += section.games.length
      continue
    }

    lines.push(section.label, '')
    for (let i = 0; i < includedInSection; i++) {
      lines.push(formatSlateGameBlock(section.games[i]!))
      lines.push('')
    }
    omittedGames += section.games.length - includedInSection
  }

  if (omittedGames > 0) lines.push(`+${omittedGames} more ${omittedLabel} games today.`)
  return joinCaptionLines(lines)
}

function coffeeEventsForInput(input: CoffeeAndCoversOptions): {
  events: OddsEvent[]
  totalBefore: number
} {
  const raw = Array.isArray(input.events) ? input.events : []
  const previous = input.previousEventLines ?? []
  const ncaabFiltered = maybeFilterNcaabCoffeeEvents(
    raw,
    input.sportKey,
    input.categoryLabel,
    previous,
  )
  return filterBoxingCoffeeMainCardEvents(
    ncaabFiltered.events,
    input.sportKey,
    input.categoryLabel,
  )
}

function spreadPickKey(pick: SpreadPick): string {
  return `${pick.eventId}|spread|${pick.pickName}|${pick.pickPoint.toFixed(1)}`
}

function oddsPickKey(pick: OddsPick): string {
  const point = pick.linePoint != null ? pick.linePoint.toFixed(1) : ''
  return `${pick.eventId}|${pick.marketKey}|${pick.pickName}|${point}`
}

function isEarlyMorningPt(iso: string): boolean {
  const t = Date.parse(String(iso || ''))
  if (!Number.isFinite(t)) return false
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      hour12: false,
    }).format(new Date(t)),
  )
  return Number.isFinite(hour) && hour < COFFEE_EARLY_MORNING_PT_HOUR
}

function compareSpreadFeaturedTiebreak(a: SpreadPick, b: SpreadPick): number {
  if (b.bookCount !== a.bookCount) return b.bookCount - a.bookCount
  const aEarly = isEarlyMorningPt(a.commenceTime) ? 1 : 0
  const bEarly = isEarlyMorningPt(b.commenceTime) ? 1 : 0
  if (aEarly !== bEarly) return aEarly - bEarly
  return Date.parse(b.commenceTime) - Date.parse(a.commenceTime)
}

function compareSpreadFeaturedWithCoverage(a: SpreadPick, b: SpreadPick): number {
  const cov = compareByCoverageThenEv(
    {
      edgePct: a.edgePct,
      coverageRank: coffeeBestLinesRankForSport(a.sportKey),
      bookCount: a.bookCount,
    },
    {
      edgePct: b.edgePct,
      coverageRank: coffeeBestLinesRankForSport(b.sportKey),
      bookCount: b.bookCount,
    },
  )
  if (cov !== 0) return cov
  return compareSpreadFeaturedTiebreak(a, b)
}

function compareOddsPickFeaturedTiebreak(a: OddsPick, b: OddsPick): number {
  if (b.bookCount !== a.bookCount) return b.bookCount - a.bookCount
  const aEarly = isEarlyMorningPt(a.commenceTime) ? 1 : 0
  const bEarly = isEarlyMorningPt(b.commenceTime) ? 1 : 0
  if (aEarly !== bEarly) return aEarly - bEarly
  return Date.parse(b.commenceTime) - Date.parse(a.commenceTime)
}

function compareOddsPickFeaturedWithCoverage(a: OddsPick, b: OddsPick): number {
  const spreadPref = (p: OddsPick) => (p.marketKey === 'spreads' || p.marketKey === 'totals' ? 0 : 1)
  const prefA = spreadPref(a)
  const prefB = spreadPref(b)
  if (prefA !== prefB) return prefA - prefB
  const cov = compareByCoverageThenEv(
    {
      edgePct: a.edgePct,
      coverageRank: coffeeBestLinesRankForSport(a.sportKey),
      bookCount: a.bookCount,
    },
    {
      edgePct: b.edgePct,
      coverageRank: coffeeBestLinesRankForSport(b.sportKey),
      bookCount: b.bookCount,
    },
  )
  if (cov !== 0) return cov
  return compareOddsPickFeaturedTiebreak(a, b)
}

function isCoffeeBoardThin(coverPicks: SpreadPick[], mlPicks: OddsPick[]): boolean {
  const hasFeaturedSpread = coverPicks.some((p) => p.edgePct >= COFFEE_FEATURED_SPREAD_MIN_EV_PCT)
  const hasFeaturedMl = mlPicks.some((p) => p.edgePct >= COFFEE_FEATURED_ML_MIN_EV_PCT)
  return !hasFeaturedSpread && !hasFeaturedMl
}

type FeaturedLean =
  | { kind: 'spread'; pick: SpreadPick }
  | { kind: 'ml'; pick: OddsPick }

function selectFeaturedLean(coverPicks: SpreadPick[], mlPicks: OddsPick[]): FeaturedLean | null {
  const qualifiedSpreads = coverPicks
    .filter((p) => p.edgePct >= COFFEE_FEATURED_SPREAD_MIN_EV_PCT)
    .sort(compareSpreadFeaturedWithCoverage)
  if (qualifiedSpreads.length) {
    return { kind: 'spread', pick: qualifiedSpreads[0]! }
  }

  const qualifiedMl = mlPicks
    .filter((p) => p.edgePct >= COFFEE_ML_EV_THRESHOLD_PCT)
    .sort(compareOddsPickFeaturedWithCoverage)
  if (qualifiedMl.length) {
    return { kind: 'ml', pick: qualifiedMl[0]! }
  }

  const fallbackSpread = [...coverPicks]
    .filter((p) => p.edgePct > 0)
    .sort(compareSpreadFeaturedWithCoverage)[0]
  if (fallbackSpread) return { kind: 'spread', pick: fallbackSpread }

  const fallbackMl = [...mlPicks]
    .filter((p) => p.edgePct > 0)
    .sort(compareOddsPickFeaturedWithCoverage)[0]
  if (fallbackMl) return { kind: 'ml', pick: fallbackMl }

  return null
}

function formatFeaturedLeanLine(lean: FeaturedLean): string {
  if (lean.kind === 'spread') {
    const team = formatPickNameLabel(lean.pick.pickName)
    const spread = formatSpreadPoint(lean.pick.pickPoint)
    const juice = formatAmericanOdds(lean.pick.pickPrice)
    return `${team} ${spread} (${juice}) @ ${lean.pick.bookTitle}`
  }
  const team = formatPickNameLabel(lean.pick.pickName)
  if (lean.pick.marketKey === 'totals' && lean.pick.linePoint != null) {
    const side = /^over$/i.test(lean.pick.pickName)
      ? 'Over'
      : /^under$/i.test(lean.pick.pickName)
        ? 'Under'
        : lean.pick.pickName
    const odds = formatAmericanOdds(lean.pick.pickPrice)
    return `${side} ${lean.pick.linePoint} (${odds}) @ ${lean.pick.bookTitle}`
  }
  if (lean.pick.marketKey === 'spreads' && lean.pick.linePoint != null) {
    const pt = formatSpreadPoint(lean.pick.linePoint)
    const odds = formatAmericanOdds(lean.pick.pickPrice)
    return `${team} ${pt} (${odds}) @ ${lean.pick.bookTitle}`
  }
  const odds = formatAmericanOdds(lean.pick.pickPrice)
  return `${team} ML ${odds} @ ${lean.pick.bookTitle}`
}

function formatCompactPickLabel(candidate: RadarCandidate | FeaturedLean): string {
  if (candidate.kind === 'spread') {
    const pick = candidate.pick
    const team = formatPickNameLabel(pick.pickName)
    const spread = formatSpreadPoint(pick.pickPoint)
    const juice = formatAmericanOdds(pick.pickPrice)
    return `${team} ${spread} (${juice})`
  }
  const pick = candidate.pick
  const team = formatPickNameLabel(pick.pickName)
  if (pick.marketKey === 'totals' && pick.linePoint != null) {
    const side = /^over$/i.test(pick.pickName) ? 'Over' : /^under$/i.test(pick.pickName) ? 'Under' : pick.pickName
    return `${side} ${pick.linePoint} (${formatAmericanOdds(pick.pickPrice)})`
  }
  if (pick.marketKey === 'spreads' && pick.linePoint != null) {
    return `${team} ${formatSpreadPoint(pick.linePoint)} (${formatAmericanOdds(pick.pickPrice)})`
  }
  return `${team} ML ${formatAmericanOdds(pick.pickPrice)}`
}

function defaultFeaturedReasoning(edgePct: number, isSpread: boolean): string {
  if (edgePct >= 7) return 'This is the sharpest edge I\'ve got this morning.'
  if (isSpread) {
    return "It's not a huge edge, but it's the cleanest number I'm seeing relative to everything else out there this morning."
  }
  return "It's the best price I'm seeing this morning."
}

type RadarCandidate =
  | { kind: 'spread'; pick: SpreadPick; edgePct: number }
  | { kind: 'ml'; pick: OddsPick; edgePct: number }

function selectRadarSpots(
  coverPicks: SpreadPick[],
  mlPicks: OddsPick[],
  featured: FeaturedLean | null,
  max = COFFEE_RADAR_MAX_SPOTS,
): RadarCandidate[] {
  const featuredKey =
    featured?.kind === 'spread'
      ? spreadPickKey(featured.pick)
      : featured?.kind === 'ml'
        ? oddsPickKey(featured.pick)
        : null

  const candidates: RadarCandidate[] = [
    ...coverPicks.map((pick) => ({ kind: 'spread' as const, pick, edgePct: pick.edgePct })),
    ...mlPicks.map((pick) => ({ kind: 'ml' as const, pick, edgePct: pick.edgePct })),
  ]
    .filter((c) => c.edgePct > 0)
    .filter((c) => {
      const key = c.kind === 'spread' ? spreadPickKey(c.pick) : oddsPickKey(c.pick)
      return key !== featuredKey
    })
    .sort((a, b) => {
      const cov = compareByCoverageThenEv(
        {
          edgePct: a.edgePct,
          coverageRank: coffeeBestLinesRankForSport(a.pick.sportKey),
        },
        {
          edgePct: b.edgePct,
          coverageRank: coffeeBestLinesRankForSport(b.pick.sportKey),
        },
      )
      if (cov !== 0) return cov
      const spreadPref = (c: RadarCandidate) => (c.kind === 'spread' ? 0 : c.pick.marketKey === 'totals' ? 1 : 2)
      return spreadPref(a) - spreadPref(b)
    })

  return candidates.slice(0, max)
}

function formatRadarBullet(candidate: RadarCandidate, label?: string): string {
  const ev = formatEvSuffix(candidate.edgePct)
  if (candidate.kind === 'spread') {
    const team = formatPickNameLabel(candidate.pick.pickName)
    const spread = formatSpreadPoint(candidate.pick.pickPoint)
    const juice = formatAmericanOdds(candidate.pick.pickPrice)
    const prefix = label ? `${label} · ` : ''
    return `• ${prefix}${team} ${spread} (${juice}) @ ${candidate.pick.bookTitle} ${ev}`
  }
  const pick = candidate.pick
  const team = formatPickNameLabel(pick.pickName)
  const prefix = label ? `${label} · ` : ''
  if (pick.marketKey === 'totals' && pick.linePoint != null) {
    const side = /^over$/i.test(pick.pickName) ? 'Over' : /^under$/i.test(pick.pickName) ? 'Under' : pick.pickName
    return `• ${prefix}${side} ${pick.linePoint} (${formatAmericanOdds(pick.pickPrice)}) @ ${pick.bookTitle} ${ev}`
  }
  if (pick.marketKey === 'spreads' && pick.linePoint != null) {
    return `• ${prefix}${team} ${formatSpreadPoint(pick.linePoint)} (${formatAmericanOdds(pick.pickPrice)}) @ ${pick.bookTitle} ${ev}`
  }
  return `• ${prefix}${team} ML ${formatAmericanOdds(pick.pickPrice)} @ ${pick.bookTitle} ${ev}`
}

function selectDogOfTheDay(dogs: BiggestDog[]): BiggestDog | null {
  if (!dogs.length) return null
  return [...dogs].sort((a, b) => b.pickPrice - a.pickPrice)[0]!
}

function formatDogOfTheDayLines(dog: BiggestDog, contextNote?: string): string[] {
  const pickLabel = formatPickNameLabel(dog.pickName)
  const odds = formatAmericanOdds(dog.pickPrice)
  const when = formatOddsCommenceTimeShort(dog.commenceTime)
  const lines = [
    `${pickLabel} ML ${odds} @ ${dog.bookTitle}`,
    `${formatMatchupTeams(dog.awayTeam, dog.homeTeam)}${when ? ` (${when})` : ''}`,
  ]
  if (contextNote?.trim()) lines.push(contextNote.trim())
  return lines
}

function buildMainCaption(
  coverPicks: SpreadPick[],
  mlPicks: OddsPick[],
  biggestDogs: BiggestDog[],
  sportLabelByPick?: (pick: SpreadPick | OddsPick) => string | undefined,
  contextByEventKey?: Map<string, string>,
): string {
  const lines: string[] = [COFFEE_COVERS_HEADER, '']
  const thin = isCoffeeBoardThin(coverPicks, mlPicks)
  const featured = selectFeaturedLean(coverPicks, mlPicks)
  const radar = selectRadarSpots(coverPicks, mlPicks, featured)
  const dog = selectDogOfTheDay(biggestDogs)

  if (!featured) {
    lines.push(COFFEE_NO_LEAN_LINE)
  } else if (thin) {
    lines.push(`If I'm playing one side today, it's ${formatFeaturedLeanLine(featured)}.`)
    lines.push('')
    const featuredKey = rundownEventKey(
      featured.kind === 'spread'
        ? featured.pick
        : featured.pick,
    )
    const featuredNote = contextByEventKey?.get(featuredKey)
    if (featuredNote?.trim()) lines.push(featuredNote.trim())

    const longshotLabels = radar
      .filter((c) => c.kind === 'ml' && c.pick.marketKey === 'h2h' && c.pick.pickPrice > 0)
      .slice(0, 4)
      .map((c) => formatCompactPickLabel(c))
    if (longshotLabels.length) {
      lines.push('')
      lines.push(
        `${COFFEE_THIN_BOARD_LEAD} A few longshot MLs have some juice (${longshotLabels.join(', ')}), but nothing else is really jumping out.`,
      )
    } else if (radar.length) {
      lines.push('')
      lines.push(`${COFFEE_THIN_BOARD_LEAD} Nothing else is really jumping out beyond that one spot.`)
    } else {
      lines.push('')
      lines.push(`${COFFEE_THIN_BOARD_LEAD} Nothing else is really jumping out.`)
    }
  } else {
    const isSpreadFeatured = featured.kind === 'spread'
    lines.push(isSpreadFeatured ? COFFEE_FEATURED_SECTION : COFFEE_FEATURED_ML_SECTION)
    lines.push(formatFeaturedLeanLine(featured))
    lines.push('')
    const featuredKey = rundownEventKey(
      featured.kind === 'spread'
        ? featured.pick
        : featured.pick,
    )
    const featuredNote = contextByEventKey?.get(featuredKey)
    const reasoning =
      featuredNote?.trim()
      || defaultFeaturedReasoning(
        featured.kind === 'spread' ? featured.pick.edgePct : featured.pick.edgePct,
        isSpreadFeatured,
      )
    lines.push(reasoning)

    if (radar.length) {
      lines.push('')
      lines.push(COFFEE_RADAR_SECTION)
      for (const candidate of radar) {
        const label =
          candidate.kind === 'spread'
            ? sportLabelByPick?.(candidate.pick)
            : sportLabelByPick?.(candidate.pick)
        lines.push(formatRadarBullet(candidate, label))
        const noteKey = rundownEventKey(
          candidate.kind === 'spread'
            ? candidate.pick
            : candidate.pick,
        )
        const note = contextByEventKey?.get(noteKey)
        if (note?.trim()) lines.push(note.trim())
      }
    }
  }

  lines.push('')
  lines.push(COFFEE_DOG_SECTION)
  if (dog) {
    const dogKey = rundownEventKey({
      homeTeam: dog.homeTeam,
      awayTeam: dog.awayTeam,
      commenceTime: dog.commenceTime,
    })
    const dogNote = contextByEventKey?.get(dogKey)
    lines.push(...formatDogOfTheDayLines(dog, dogNote))
  } else {
    lines.push('No big dogs on today\'s slate.')
  }

  lines.push('')
  lines.push(COFFEE_THREAD_TEASER)
  return joinCaptionLines(lines)
}

/**
 * Find spread cover opportunities: devig per book, consensus fair prob, EV on best juice.
 */
export function findPlusEvSpreadOpportunities(
  events: OddsEvent[],
  sportKey: string,
  opts: {
    minBooks?: number
    minEvPct?: number
    maxEvPct?: number
  } = {},
): SpreadPick[] {
  const minBooks = opts.minBooks ?? DEFAULT_MIN_BOOKS
  const rawMinEv = opts.minEvPct ?? COFFEE_SPREAD_EV_THRESHOLD_PCT
  const minEvPct = effectiveMinEvPct(sportKey, rawMinEv)
  const maxEvPct = opts.maxEvPct ?? DEFAULT_MAX_EV_PCT
  const opportunities: SpreadPick[] = []

  for (const ev of events) {
    const home = String(ev.home_team || 'Home').trim()
    const away = String(ev.away_team || 'Away').trim()
    const commenceTime = String(ev.commence_time || '').trim()
    if (!home || !away || !commenceTime) continue

    const fairSamplesByKey = new Map<string, number[]>()
    const bestPriceByKey = new Map<string, { price: number; book: string; point: number; name: string }>()

    for (const book of ev.bookmakers || []) {
      const market = (book.markets || []).find((m) => m.key === 'spreads')
      if (!market) continue
      const fair = devigFairProbsForSpread(market)
      if (!fair?.size) continue
      const bookLabel = formatBookDisplayName(String(book.title || ''), book.key)

      for (const out of market.outcomes || []) {
        const name = String(out.name || '').trim()
        const price = Number(out.price)
        const point = Number(out.point)
        if (!name || !Number.isFinite(price) || !Number.isFinite(point)) continue
        const key = spreadOutcomeKey(name, point)
        const fairProb = fair.get(key)
        if (fairProb == null) continue

        const samples = fairSamplesByKey.get(key) || []
        samples.push(fairProb)
        fairSamplesByKey.set(key, samples)

        const cur = bestPriceByKey.get(key)
        if (!cur || price > cur.price) {
          bestPriceByKey.set(key, { price, book: bookLabel, point, name })
        }
      }
    }

    for (const [key, samples] of fairSamplesByKey) {
      if (samples.length < minBooks) continue
      const best = bestPriceByKey.get(key)
      if (!best) continue

      const consensusProb = average(samples)
      const evDecimal = computeEvDecimal(consensusProb, best.price, 1)
      const evPct = Math.round(evDecimal * 1000) / 10
      if (evPct < minEvPct || evPct > maxEvPct) continue

      opportunities.push({
        sportKey,
        eventId: String(ev.id || `${home}-${away}`),
        homeTeam: home,
        awayTeam: away,
        commenceTime,
        pickName: best.name,
        pickPoint: best.point,
        pickPrice: best.price,
        bookTitle: best.book,
        consensusPrice: impliedToAmerican(consensusProb),
        edgePct: evPct,
        bookCount: samples.length,
      })
    }
  }

  opportunities.sort((a, b) => b.edgePct - a.edgePct)
  return opportunities
}

/**
 * Build Coffee & Covers for one calendar sport (single-sport manual fetch).
 */
export function generateCoffeeAndCovers(input: CoffeeAndCoversOptions): CoffeeAndCoversResult {
  const categoryLabel = String(input.categoryLabel || '').trim()
  const sportKey = String(input.sportKey || '').trim()
  const { events, totalBefore } = coffeeEventsForInput(input)
  const minBooks = input.minBooks ?? DEFAULT_MIN_BOOKS
  const mlThreshold = input.mlEvThresholdPct ?? COFFEE_ML_EV_THRESHOLD_PCT
  const spreadThreshold = input.spreadEvThresholdPct ?? COFFEE_SPREAD_EV_THRESHOLD_PCT
  const maxPicks = input.maxPicksPerSport ?? COFFEE_MAX_PICKS_PER_SPORT
  const maxEvPct = input.maxEvPct ?? DEFAULT_MAX_EV_PCT

  const coverResult = pickTopSpreadCovers(events, sportKey, {
    minBooks,
    maxEvPct,
    thresholdPct: spreadThreshold,
    limit: maxPicks,
  })
  const mlResult = pickTopMlSpots(events, sportKey, {
    minBooks,
    maxEvPct,
    thresholdPct: mlThreshold,
    limit: maxPicks,
  })

  const games = extractSlateGameBestLines(events)
  const biggestDog = findBiggestDog(categoryLabel, events, sportKey)
  const biggestDogs = biggestDog ? [biggestDog] : []
  const onTapPicks: OnTapPick[] = []
  const threadBody = buildSportLinesThreadBody(categoryLabel, events, sportKey, totalBefore)
  const threadParts: CoffeeThreadPart[] = threadBody
    ? [{ categoryLabel, body: threadBody }]
    : []

  return {
    caption: buildMainCaption(
      coverResult.picks,
      mlResult.picks,
      biggestDogs,
      () => categoryLabel,
    ),
    threadParts,
    coverPicks: coverResult.picks,
    mlPicks: mlResult.picks,
    biggestDogs,
    dogOfTheDay: biggestDog,
    onTapPicks,
    gameCount: games.length,
    hasCovers: coverResult.metBar && coverResult.picks.length > 0,
  }
}

type SportCoffeeSlice = {
  categoryLabel: string
  sportKey: string
  events: OddsEvent[]
  coverPicks: SpreadPick[]
  mlPicks: OddsPick[]
  gameCount: number
  totalBefore: number
  coversMetBar: boolean
  mlMetBar: boolean
}

function buildSportSlice(input: CoffeeAndCoversOptions): SportCoffeeSlice {
  const categoryLabel = String(input.categoryLabel || '').trim()
  const sportKey = String(input.sportKey || '').trim()
  const { events, totalBefore } = coffeeEventsForInput(input)
  const minBooks = input.minBooks ?? DEFAULT_MIN_BOOKS
  const mlThreshold = input.mlEvThresholdPct ?? COFFEE_ML_EV_THRESHOLD_PCT
  const spreadThreshold = input.spreadEvThresholdPct ?? COFFEE_SPREAD_EV_THRESHOLD_PCT
  const maxPicks = input.maxPicksPerSport ?? COFFEE_MAX_PICKS_PER_SPORT
  const maxEvPct = input.maxEvPct ?? DEFAULT_MAX_EV_PCT

  const coverResult = pickTopSpreadCovers(events, sportKey, {
    minBooks,
    maxEvPct,
    thresholdPct: spreadThreshold,
    limit: maxPicks,
  })
  const mlResult = pickTopMlSpots(events, sportKey, {
    minBooks,
    maxEvPct,
    thresholdPct: mlThreshold,
    limit: maxPicks,
  })

  return {
    categoryLabel,
    sportKey,
    events,
    coverPicks: coverResult.picks,
    mlPicks: mlResult.picks,
    gameCount: extractSlateGameBestLines(events).length,
    totalBefore,
    coversMetBar: coverResult.metBar,
    mlMetBar: mlResult.metBar,
  }
}

/**
 * One morning post across all calendar sports: merged covers/ML in root, lines per sport in thread.
 */
export function generateCombinedCoffeeAndCovers(inputs: CoffeeAndCoversOptions[]): CoffeeAndCoversResult {
  const slices = inputs.map(buildSportSlice)
  const coverPicks = slices.flatMap((s) => s.coverPicks)
  const mlPicks = slices.flatMap((s) => s.mlPicks)
  const gameCount = slices.reduce((sum, s) => sum + s.gameCount, 0)

  const sportLabelForSpread = (pick: SpreadPick) =>
    slices.find((s) => s.sportKey === pick.sportKey)?.categoryLabel

  const sportLabelForMl = (pick: OddsPick) =>
    slices.find((s) => s.sportKey === pick.sportKey)?.categoryLabel

  const threadPartCandidates: Array<{
    part: CoffeeThreadPart
    meta: CoffeeBestLinesThreadCandidateMeta
  }> = []
  const topTierSoccerSlices: SportCoffeeSlice[] = []
  const secondarySoccerSlices: SportCoffeeSlice[] = []
  const biggestDogs: BiggestDog[] = []

  for (const slice of slices) {
    if (slice.gameCount <= 0 || !slice.categoryLabel) continue

    if (isCoffeeTopTierSoccerKey(slice.sportKey)) {
      topTierSoccerSlices.push(slice)
    } else if (isCoffeeSecondarySoccerKey(slice.sportKey)) {
      secondarySoccerSlices.push(slice)
    } else if (shouldIncludeCoffeeBestLinesThreadPart(slice.sportKey, slice)) {
      const body = buildSportLinesThreadBody(
        slice.categoryLabel,
        slice.events,
        slice.sportKey,
        slice.totalBefore,
      )
      if (body) {
        threadPartCandidates.push({
          part: { categoryLabel: slice.categoryLabel, body },
          meta: buildCoffeeBestLinesThreadCandidateMeta(slice.sportKey, slice),
        })
      }
    }

    const dog = findBiggestDog(slice.categoryLabel, slice.events, slice.sportKey)
    if (dog) biggestDogs.push(dog)
  }

  if (topTierSoccerSlices.length) {
    const body = buildCombinedSoccerThreadBody(
      topTierSoccerSlices,
      COFFEE_TOP_SOCCER_THREAD_HEADER,
      coffeeTopTierSoccerSortOrder,
    )
    if (body) {
      threadPartCandidates.push({
        part: { categoryLabel: 'Top Soccer Leagues', body },
        meta: buildCoffeeBestLinesThreadCandidateMeta(
          'soccer_top_leagues',
          aggregateCoffeeBestLinesSliceStats(topTierSoccerSlices),
        ),
      })
    }
  }

  if (secondarySoccerSlices.length) {
    const soccerHeader = topTierSoccerSlices.length
      ? COFFEE_SECONDARY_SOCCER_THREAD_HEADER
      : COFFEE_SOCCER_THREAD_HEADER
    const soccerLabel = topTierSoccerSlices.length
      ? COFFEE_MORE_SOCCER_THREAD_LABEL
      : 'Soccer'
    const body = buildCombinedSoccerThreadBody(
      secondarySoccerSlices,
      soccerHeader,
      coffeeSecondarySoccerSortOrder,
    )
    if (body) {
      threadPartCandidates.push({
        part: { categoryLabel: soccerLabel, body },
        meta: buildCoffeeBestLinesThreadCandidateMeta(
          'soccer_secondary_leagues',
          aggregateCoffeeBestLinesSliceStats(secondarySoccerSlices),
        ),
      })
    }
  }

  const selectedMeta = selectCoffeeBestLinesThreadCandidates(
    threadPartCandidates.map((row) => row.meta),
  )
  const partBySortKey = new Map(
    threadPartCandidates.map((row) => [row.meta.sortKey, row.part]),
  )
  const threadParts = selectedMeta
    .map((meta) => partBySortKey.get(meta.sortKey))
    .filter((part): part is CoffeeThreadPart => Boolean(part))
  const onTapPicks: OnTapPick[] = []
  const coversMetBar = slices.some((s) => s.coversMetBar && s.coverPicks.length > 0)

  return {
    caption: buildMainCaption(coverPicks, mlPicks, biggestDogs, (pick) => {
      if ('pickPoint' in pick) return sportLabelForSpread(pick as SpreadPick)
      return sportLabelForMl(pick as OddsPick)
    }),
    threadParts,
    coverPicks,
    mlPicks,
    biggestDogs,
    dogOfTheDay: biggestDogs[0] ?? null,
    onTapPicks,
    gameCount,
    hasCovers: slices.some((s) => s.coversMetBar && s.coverPicks.length > 0),
  }
}

type CoffeeCaptionLabelFn = (pick: SpreadPick | OddsPick) => string | undefined

function coffeePicksForContext(
  generated: CoffeeAndCoversResult,
  sportKeyFallback: string,
): Array<{
  sportKey: string
  homeTeam: string
  awayTeam: string
  commenceTime: string
  pickName: string
  eventId?: string
  postKind: 'coffee_covers' | 'dog_of_the_day'
}> {
  const out: Array<{
    sportKey: string
    homeTeam: string
    awayTeam: string
    commenceTime: string
    pickName: string
    eventId?: string
    postKind: 'coffee_covers' | 'dog_of_the_day'
  }> = []

  const topCover = [...generated.coverPicks].sort((a, b) => b.edgePct - a.edgePct)[0]
  if (topCover) {
    out.push({
      sportKey: topCover.sportKey,
      homeTeam: topCover.homeTeam,
      awayTeam: topCover.awayTeam,
      commenceTime: topCover.commenceTime,
      pickName: topCover.pickName,
      eventId: topCover.eventId,
      postKind: 'coffee_covers',
    })
  }

  const topMl = [...generated.mlPicks].sort((a, b) => b.edgePct - a.edgePct)[0]
  if (topMl) {
    out.push({
      sportKey: topMl.sportKey,
      homeTeam: topMl.homeTeam,
      awayTeam: topMl.awayTeam,
      commenceTime: topMl.commenceTime,
      pickName: topMl.pickName,
      eventId: topMl.eventId,
      postKind: 'coffee_covers',
    })
  }

  for (const dog of generated.biggestDogs) {
    const dogSportKey = dog.sportKey
      ?? generated.coverPicks.find((p) =>
        p.homeTeam === dog.homeTeam && p.awayTeam === dog.awayTeam
      )?.sportKey
      ?? generated.mlPicks.find((p) => p.homeTeam === dog.homeTeam && p.awayTeam === dog.awayTeam)?.sportKey
      ?? sportKeyFallback
    out.push({
      sportKey: dogSportKey,
      homeTeam: dog.homeTeam,
      awayTeam: dog.awayTeam,
      commenceTime: dog.commenceTime,
      pickName: dog.pickName,
      postKind: 'dog_of_the_day',
    })
  }

  return out
}

/** Rebuild Coffee caption with verified Rundown context notes when available. */
export async function enrichCoffeeAndCoversCaption(
  generated: CoffeeAndCoversResult,
  sportLabelByPick: CoffeeCaptionLabelFn | undefined,
  sportKeyFallback: string,
): Promise<string> {
  const contextByEventKey = new Map<string, string>()
  const picks = coffeePicksForContext(generated, sportKeyFallback)

  for (const pick of picks) {
    const key = rundownEventKey(pick)
    if (contextByEventKey.has(key)) continue
    const notes = await fetchRundownContextNotesForPicks(pick.postKind, [pick], 1)
    const note = notes.get(key)
    if (note) contextByEventKey.set(key, note)
  }

  if (!contextByEventKey.size) return generated.caption

  return buildMainCaption(
    generated.coverPicks,
    generated.mlPicks,
    generated.biggestDogs,
    sportLabelByPick,
    contextByEventKey,
  )
}

/** One Coffee & Covers post per bot per PT day (all sports in thread). */
export function coffeeDailyDedupeKey(ptDay: string): string {
  return `coffee:daily:${ptDay}`
}

/** @deprecated per-sport dedupe; use coffeeDailyDedupeKey for morning batch */
export function coffeeCoversDedupeKey(calendarSlug: string, ptDay: string): string {
  return `coffee:${calendarSlug}:${ptDay}`
}
