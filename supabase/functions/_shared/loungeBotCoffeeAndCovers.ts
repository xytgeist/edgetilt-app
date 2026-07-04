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

/** Min +EV % on $1 for ML spots in the morning post. */
export const COFFEE_ML_EV_THRESHOLD_PCT = 3
/** Min +EV % on $1 for spread "cover" picks. */
export const COFFEE_SPREAD_EV_THRESHOLD_PCT = 4
/** Max cover or ML highlights per sport in one post. */
export const COFFEE_MAX_PICKS_PER_SPORT = 3

export const COFFEE_COVERS_HEADER = '☕ Coffee & Covers 💵'
export const COFFEE_NO_COVERS_LINE =
  'No strong covers today - sitting on hands until we see better value.'
export const COFFEE_ML_SECTION = 'BEST ML SPOTS RIGHT NOW:'
export const COFFEE_DOGS_SECTION = 'BIGGEST DOGS:'
export const COFFEE_ON_TAP_SECTION = '🍺 ON TAP TOMORROW:'
export const COFFEE_BEST_LINES_TEASER = 'Best lines 👇'
/** Max ML spots listed in the combined morning post (global, sorted by EV). */
export const COFFEE_ML_SPOTS_MAX_TOTAL = 8
/** Max tomorrow lookahead calls in the morning post. */
export const COFFEE_ON_TAP_MAX_PICKS = 3
/** Include tomorrow picks within this many % of the spread/ML bar. */
export const COFFEE_ON_TAP_NEAR_THRESHOLD_PCT = 1

const CAPTION_MAX = 2000

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
}

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

function formatMatchupTeams(awayTeam: string, homeTeam: string): string {
  return `${shortDisplayName(awayTeam)} vs ${shortDisplayName(homeTeam)}`
}

function formatCoverBulletLines(pick: SpreadPick, categoryLabel: string): string[] {
  const when = formatOddsCommenceTimeShort(pick.commenceTime)
  const team = formatPickNameLabel(pick.pickName)
  const spread = formatSpreadPoint(pick.pickPoint)
  const juice = formatAmericanOdds(pick.pickPrice)
  const label = String(categoryLabel || '').trim()
  const head = label
    ? `• ${label} - ${formatMatchupTeams(pick.awayTeam, pick.homeTeam)} (${when})`
    : `• ${formatMatchupTeams(pick.awayTeam, pick.homeTeam)} (${when})`
  return [
    head,
    `${team} ${spread} (${juice}) @ ${pick.bookTitle} ${formatEvSuffix(pick.edgePct)}`,
  ]
}

function formatMlSpotBulletLines(pick: OddsPick, categoryLabel: string): string[] {
  const when = formatOddsCommenceTimeShort(pick.commenceTime)
  const team = formatPickNameLabel(pick.pickName)
  const odds = formatAmericanOdds(pick.pickPrice)
  const label = String(categoryLabel || '').trim()
  const head = label
    ? `• ${label} - ${formatMatchupTeams(pick.awayTeam, pick.homeTeam)} (${when})`
    : `• ${formatMatchupTeams(pick.awayTeam, pick.homeTeam)} (${when})`
  return [
    head,
    `${team} ML ${odds} @ ${pick.bookTitle} ${formatEvSuffix(pick.edgePct)}`,
  ]
}

function formatBiggestDogBulletLines(dog: BiggestDog): string[] {
  const when = formatOddsCommenceTimeShort(dog.commenceTime)
  const pickLabel = formatPickNameLabel(dog.pickName)
  const odds = formatAmericanOdds(dog.pickPrice)
  return [
    `• ${dog.categoryLabel} - ${formatMatchupTeams(dog.awayTeam, dog.homeTeam)} (${when})`,
    `${pickLabel} ML ${odds} @ ${dog.bookTitle}`,
  ]
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
    return `• ${label} - ${matchup}: ${team} ${spread} (${juice}) ${ev}`
  }
  const team = formatPickNameLabel(entry.pick.pickName)
  const odds = formatAmericanOdds(entry.pick.pickPrice)
  return `• ${label} - ${matchup}: ${team} ${odds} ${ev}`
}

/** Longest h2h price on today's board for one calendar sport. */
export function findBiggestDog(categoryLabel: string, events: OddsEvent[]): BiggestDog | null {
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
        if (!name || !Number.isFinite(price)) continue
        if (!best || price > best.pickPrice) {
          best = {
            categoryLabel: label,
            pickName: name,
            awayTeam: away,
            homeTeam: home,
            commenceTime,
            pickPrice: price,
            bookTitle: bookLabel,
          }
        }
      }
    }
  }

  return best
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
export function buildSportLinesThreadBody(categoryLabel: string, events: OddsEvent[]): string {
  const label = String(categoryLabel || '').trim()
  const games = extractSlateGameBestLines(events)
  if (!games.length || !label) return ''

  const lines: string[] = [label, '']
  let included = 0

  for (let i = 0; i < games.length; i++) {
    const trialLines = [...lines, formatSlateGameBlock(games[i]), '']
    const omitted = games.length - i - 1
    if (omitted > 0) trialLines.push(`+${omitted} more games today.`)
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

  const omitted = games.length - included
  if (omitted > 0) lines.push(`+${omitted} more games today.`)

  return joinCaptionLines(lines)
}

function buildMainCaption(
  coverPicks: SpreadPick[],
  mlPicks: OddsPick[],
  biggestDogs: BiggestDog[],
  onTapPicks: OnTapPick[],
  sportLabelByPick?: (pick: SpreadPick | OddsPick) => string | undefined,
): string {
  const lines: string[] = [COFFEE_COVERS_HEADER, '']

  const coverSorted = [...coverPicks].sort((a, b) => b.edgePct - a.edgePct).slice(0, 3)
  if (coverSorted.length) {
    for (const pick of coverSorted) {
      const label = sportLabelByPick?.(pick) ?? ''
      lines.push(...formatCoverBulletLines(pick, label))
    }
  } else {
    lines.push(COFFEE_NO_COVERS_LINE)
  }

  lines.push('', COFFEE_ML_SECTION)
  const mlSorted = [...mlPicks].sort((a, b) => b.edgePct - a.edgePct)
    .slice(0, COFFEE_ML_SPOTS_MAX_TOTAL)
  if (mlSorted.length) {
    for (const pick of mlSorted) {
      const label = sportLabelByPick?.(pick) ?? ''
      lines.push(...formatMlSpotBulletLines(pick, label))
    }
  } else {
    lines.push('Nothing clearing the ML bar right now.')
  }

  lines.push('', COFFEE_DOGS_SECTION)
  const dogsSorted = [...biggestDogs].sort((a, b) => b.pickPrice - a.pickPrice)
  if (dogsSorted.length) {
    for (const dog of dogsSorted) {
      lines.push(...formatBiggestDogBulletLines(dog))
    }
  } else {
    lines.push('No big dogs on today\'s slate.')
  }

  lines.push('', COFFEE_ON_TAP_SECTION)
  if (onTapPicks.length) {
    for (const entry of onTapPicks) {
      lines.push(formatOnTapBulletLine(entry))
    }
  } else {
    lines.push('Nothing on tap for tomorrow yet.')
  }

  lines.push('', COFFEE_BEST_LINES_TEASER)
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
  const minEvPct = opts.minEvPct ?? COFFEE_SPREAD_EV_THRESHOLD_PCT
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
  const events = Array.isArray(input.events) ? input.events : []
  const minBooks = input.minBooks ?? DEFAULT_MIN_BOOKS
  const mlThreshold = input.mlEvThresholdPct ?? COFFEE_ML_EV_THRESHOLD_PCT
  const spreadThreshold = input.spreadEvThresholdPct ?? COFFEE_SPREAD_EV_THRESHOLD_PCT
  const maxPicks = input.maxPicksPerSport ?? COFFEE_MAX_PICKS_PER_SPORT
  const maxEvPct = input.maxEvPct ?? DEFAULT_MAX_EV_PCT

  const coverPicks = findPlusEvSpreadOpportunities(events, sportKey, {
    minBooks,
    minEvPct: spreadThreshold,
    maxEvPct,
  }).slice(0, maxPicks)

  const mlPicks = findPlusEvOpportunities(events, sportKey, {
    minBooks,
    minEvPct: mlThreshold,
    maxEvPct,
  }).slice(0, maxPicks)

  const games = extractSlateGameBestLines(events)
  const biggestDog = findBiggestDog(categoryLabel, events)
  const biggestDogs = biggestDog ? [biggestDog] : []
  const onTapPicks = findOnTapPicks(input).slice(0, input.onTapMaxPicks ?? COFFEE_ON_TAP_MAX_PICKS)
  const threadBody = buildSportLinesThreadBody(categoryLabel, events)
  const threadParts: CoffeeThreadPart[] = threadBody
    ? [{ categoryLabel, body: threadBody }]
    : []

  return {
    caption: buildMainCaption(coverPicks, mlPicks, biggestDogs, onTapPicks, () => categoryLabel),
    threadParts,
    coverPicks,
    mlPicks,
    biggestDogs,
    onTapPicks,
    gameCount: games.length,
    hasCovers: coverPicks.length > 0,
  }
}

type SportCoffeeSlice = {
  categoryLabel: string
  sportKey: string
  events: OddsEvent[]
  coverPicks: SpreadPick[]
  mlPicks: OddsPick[]
  gameCount: number
}

function buildSportSlice(input: CoffeeAndCoversOptions): SportCoffeeSlice {
  const categoryLabel = String(input.categoryLabel || '').trim()
  const sportKey = String(input.sportKey || '').trim()
  const events = Array.isArray(input.events) ? input.events : []
  const minBooks = input.minBooks ?? DEFAULT_MIN_BOOKS
  const mlThreshold = input.mlEvThresholdPct ?? COFFEE_ML_EV_THRESHOLD_PCT
  const spreadThreshold = input.spreadEvThresholdPct ?? COFFEE_SPREAD_EV_THRESHOLD_PCT
  const maxPicks = input.maxPicksPerSport ?? COFFEE_MAX_PICKS_PER_SPORT
  const maxEvPct = input.maxEvPct ?? DEFAULT_MAX_EV_PCT

  const coverPicks = findPlusEvSpreadOpportunities(events, sportKey, {
    minBooks,
    minEvPct: spreadThreshold,
    maxEvPct,
  }).slice(0, maxPicks)

  const mlPicks = findPlusEvOpportunities(events, sportKey, {
    minBooks,
    minEvPct: mlThreshold,
    maxEvPct,
  }).slice(0, maxPicks)

  return {
    categoryLabel,
    sportKey,
    events,
    coverPicks,
    mlPicks,
    gameCount: extractSlateGameBestLines(events).length,
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

  const threadParts: CoffeeThreadPart[] = []
  const biggestDogs: BiggestDog[] = []
  const onTapSlices: OnTapPick[][] = []
  for (const slice of slices) {
    if (slice.gameCount <= 0 || !slice.categoryLabel) continue
    const body = buildSportLinesThreadBody(slice.categoryLabel, slice.events)
    if (body) threadParts.push({ categoryLabel: slice.categoryLabel, body })
    const dog = findBiggestDog(slice.categoryLabel, slice.events)
    if (dog) biggestDogs.push(dog)
  }
  for (const input of inputs) {
    onTapSlices.push(findOnTapPicks(input))
  }
  const onTapPicks = mergeOnTapPicks(onTapSlices)

  return {
    caption: buildMainCaption(coverPicks, mlPicks, biggestDogs, onTapPicks, (pick) => {
      if ('pickPoint' in pick) return sportLabelForSpread(pick as SpreadPick)
      return sportLabelForMl(pick as OddsPick)
    }),
    threadParts,
    coverPicks,
    mlPicks,
    biggestDogs,
    onTapPicks,
    gameCount,
    hasCovers: coverPicks.length > 0,
  }
}

/** One Coffee & Covers post per bot per PT day (all sports in thread). */
export function coffeeDailyDedupeKey(ptDay: string): string {
  return `coffee:daily:${ptDay}`
}

/** @deprecated per-sport dedupe; use coffeeDailyDedupeKey for morning batch */
export function coffeeCoversDedupeKey(calendarSlug: string, ptDay: string): string {
  return `coffee:${calendarSlug}:${ptDay}`
}
